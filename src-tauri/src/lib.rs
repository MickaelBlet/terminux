mod cli;
mod config;
mod dynamic_profiles;
mod editor;
mod pty;
mod remote_files;
mod session_store;
mod ssh;
mod toml_patch;
mod windows;

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use config::Config;
use notify::{RecursiveMode, Watcher};
use pty::{PtyManager, SpawnRequest};
use serde_json::{Value, json};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

pub struct AppState {
    config: Mutex<Config>,
    pty: PtyManager,
    windows: Mutex<windows::Windows>,
    open_files: editor::OpenFiles,
    remote_files: remote_files::RemoteFiles,
}

type CmdResult<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[tauri::command]
fn frontend_log(level: String, msg: String) {
    eprintln!("[frontend:{level}] {msg}");
}

#[tauri::command]
fn get_config(state: State<AppState>) -> Config {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
fn open_config(app: AppHandle) -> CmdResult<()> {
    let path = config::config_path();
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(err)
}

#[tauri::command]
fn config_path() -> String {
    config::config_path().to_string_lossy().into_owned()
}

#[tauri::command]
fn read_config() -> CmdResult<String> {
    std::fs::read_to_string(config::ensure_file()).map_err(err)
}

#[tauri::command]
fn validate_config(src: String) -> Option<config::ConfigError> {
    config::validate(&src)
}

#[tauri::command]
fn write_config(src: String) -> CmdResult<()> {
    config::write(&src)
}

/// Raw config.toml text as JSON (settings UI read side; no fragments or generated profiles).
#[tauri::command]
fn config_parse(src: String) -> CmdResult<serde_json::Value> {
    toml_patch::parse(&src)
}

/// Apply settings UI edits to config.toml text, keeping comments and layout.
#[tauri::command]
fn config_patch(src: String, ops: Vec<toml_patch::PatchOp>) -> CmdResult<String> {
    toml_patch::patch(&src, &ops)
}

#[tauri::command]
fn default_config() -> &'static str {
    config::DEFAULT_CONFIG
}

/// Whether `path` is a string value somewhere in the loaded config (images, sounds, icons,
/// action paths). File IPC is limited to those so a compromised webview can't roam the disk.
fn referenced_by_config(cfg: &Config, path: &Path) -> bool {
    fn walk(v: &Value, path: &Path) -> bool {
        match v {
            Value::String(s) => !s.is_empty() && config::resolve_path(s) == path,
            Value::Array(a) => a.iter().any(|v| walk(v, path)),
            Value::Object(o) => o.values().any(|v| walk(v, path)),
            _ => false,
        }
    }
    serde_json::to_value(cfg).is_ok_and(|v| walk(&v, path))
}

/// Raw bytes of a user file (background image, bell sound, icon) named in the config. `~` and
/// paths relative to the config directory are resolved.
#[tauri::command]
fn read_binary(state: State<AppState>, path: String) -> CmdResult<tauri::ipc::Response> {
    const MAX: u64 = 64 * 1024 * 1024;
    let path = config::resolve_path(&path);
    if !referenced_by_config(&state.config.lock().unwrap(), &path) {
        return Err(format!("{}: not referenced by the config", path.display()));
    }
    let meta = std::fs::metadata(&path).map_err(|e| format!("{}: {e}", path.display()))?;
    if meta.len() > MAX {
        return Err(format!("{}: file too large", path.display()));
    }
    std::fs::read(&path).map(tauri::ipc::Response::new).map_err(err)
}

/// Open a directory with the system file manager (never a file: no program launch).
#[tauri::command]
fn open_path(app: AppHandle, path: String) -> CmdResult<()> {
    let path = config::resolve_path(&path);
    if !path.is_dir() {
        return Err(format!("{}: not a directory", path.display()));
    }
    app.opener().open_path(path.to_string_lossy(), None::<&str>).map_err(err)
}

/// Open a file printed in the terminal (Ctrl+click) with `file_link_editor`. The program comes
/// from the config only. `terminal`: return the commandline for a terminal pane instead; otherwise
/// a commandline is returned only for a fallback editor tab when no editor is set.
#[tauri::command]
async fn open_in_editor(
    state: State<'_, AppState>,
    path: String,
    line: Option<u32>,
    col: Option<u32>,
    terminal: bool,
) -> CmdResult<Option<String>> {
    let template = state.config.lock().unwrap().get_str("file_link_editor").map(str::to_string);
    editor::open(template.as_deref(), &path, line, col, terminal)
}

/// Read a text file for the built-in editor (Ctrl+click); it may then be saved with `file_write`.
#[tauri::command]
async fn file_read(state: State<'_, AppState>, path: String) -> CmdResult<editor::TextFile> {
    state.open_files.read(&path)
}

/// Save a file opened with `file_read` (no other path is writable).
#[tauri::command]
async fn file_write(state: State<'_, AppState>, path: String, text: String) -> CmdResult<()> {
    state.open_files.write(&path, &text)?;
    state.remote_files.upload(&path)
}

/// Copy a file from the ssh host the pane `id` is connected to (Ctrl+click in an ssh pane).
/// The connection options come from the pane's own `ssh` command, never from the webview.
#[tauri::command]
async fn remote_file_fetch(state: State<'_, AppState>, id: u32, path: String) -> CmdResult<remote_files::Fetched> {
    let target = state.pty.ssh_target(id).ok_or("the pane is not running ssh")?;
    state.remote_files.fetch(target, &path)
}

/// Write exported text to `path` (only when named in the config, e.g. an `export_buffer` action)
/// or to a file the user picks in a save dialog. Returns the written path, `None` if cancelled.
#[tauri::command]
async fn save_text(
    app: AppHandle,
    state: State<'_, AppState>,
    path: Option<String>,
    default_name: String,
    text: String,
) -> CmdResult<Option<String>> {
    use tauri_plugin_dialog::DialogExt;
    let path = match path {
        Some(p) => {
            let p = config::resolve_path(&p);
            if !referenced_by_config(&state.config.lock().unwrap(), &p) {
                return Err(format!("{}: not referenced by the config", p.display()));
            }
            p
        }
        None => {
            let picked = app.dialog().file().set_title("Export text").set_file_name(default_name).blocking_save_file();
            match picked {
                Some(f) => f.into_path().map_err(err)?,
                None => return Ok(None),
            }
        }
    };
    std::fs::write(&path, text).map_err(|e| format!("{}: {e}", path.display()))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpawnOptions {
    profile_id: Option<String>,
    /// Explicit starting directory.
    cwd: Option<String>,
    /// Directory of the pane being split.
    inherit_cwd: Option<String>,
    commandline: Option<String>,
    #[serde(default)]
    env: HashMap<String, String>,
    cols: u16,
    rows: u16,
}

#[tauri::command]
fn pty_spawn(
    app: AppHandle,
    window: WebviewWindow,
    state: State<AppState>,
    opts: SpawnOptions,
    on_data: Channel<InvokeResponseBody>,
) -> CmdResult<u32> {
    let profile = {
        let cfg = state.config.lock().unwrap();
        let id = opts.profile_id.unwrap_or_else(|| cfg.default_profile.clone());
        cfg.profile_by_id_or_name(&id)
            .or_else(|| cfg.profile("shell"))
            .cloned()
            .ok_or_else(|| format!("unknown profile {id}"))?
    };
    let req = SpawnRequest {
        profile,
        cwd: opts.cwd,
        inherit_cwd: opts.inherit_cwd,
        commandline: opts.commandline,
        env: opts.env,
        cols: opts.cols,
        rows: opts.rows,
        owner: window.label().to_string(),
    };
    state.pty.spawn(app, req, on_data).map_err(|e| format!("{e:#}"))
}

/// Stop output delivery before handing the session to another window.
#[tauri::command]
fn pty_detach(state: State<AppState>, id: u32) -> CmdResult<u64> {
    state.pty.detach(id).map_err(err)
}

#[tauri::command]
fn pty_attach(
    window: WebviewWindow,
    state: State<AppState>,
    id: u32,
    on_data: Channel<InvokeResponseBody>,
) -> CmdResult<pty::AttachResult> {
    state.pty.attach(id, window.label().to_string(), on_data).map_err(err)
}

#[tauri::command]
fn pty_write(state: State<AppState>, id: u32, data: String) -> CmdResult<()> {
    state.pty.write(id, data.as_bytes()).map_err(err)
}

// Async: keeps ConPTY resizes (which can block while the console reflows) off the main thread.
#[tauri::command]
async fn pty_resize(state: State<'_, AppState>, id: u32, cols: u16, rows: u16) -> CmdResult<()> {
    state.pty.resize(id, cols, rows).map_err(err)
}

#[tauri::command]
fn pty_kill(state: State<AppState>, id: u32) {
    state.pty.kill(id);
}

/// Whether the pane runs an interactive `ssh` session.
#[tauri::command]
fn pty_is_ssh(state: State<AppState>, id: u32) -> bool {
    state.pty.ssh_target(id).is_some()
}

/// Commandline reopening the pane's ssh session in `dir` (remote directory), if it runs one.
#[tauri::command]
fn pty_ssh_follow(state: State<AppState>, id: u32, dir: Option<String>) -> Option<String> {
    let target = state.pty.ssh_target(id)?;
    Some(ssh_commandline(&target, dir.as_deref()))
}

/// Commandline restarting the pane's spawned ssh session in `dir` (reconnect, session restore).
#[tauri::command]
fn pty_ssh_resume(state: State<AppState>, id: u32, dir: Option<String>) -> Option<String> {
    let target = state.pty.spawned_ssh(id)?;
    Some(ssh_commandline(&target, dir.as_deref()))
}

fn ssh_commandline(target: &ssh::SshTarget, dir: Option<&str>) -> String {
    ssh::follow_argv(target, dir).iter().map(|a| editor::quote_arg(a)).collect::<Vec<_>>().join(" ")
}

#[tauri::command]
fn pty_cwd(state: State<AppState>, id: u32) -> Option<String> {
    state.pty.cwd(id)
}

// ---------- windows ----------

#[tauri::command]
fn window_init(app: AppHandle, state: State<AppState>, window: WebviewWindow) -> windows::InitInfo {
    // A reloaded page lost its output channels: buffer until it re-attaches.
    state.pty.detach_owned(window.label());
    windows::init_info(&app, window.label())
}

/// Async: building a window from a sync command (main thread) deadlocks on Windows (WebView2).
#[tauri::command]
async fn window_new(app: AppHandle, payload: Value) -> CmdResult<()> {
    let position = payload
        .get("position")
        .and_then(|p| Some((p.get("x")?.as_f64()?, p.get("y")?.as_f64()?)));
    windows::create(&app, windows::Create { payload: Some(payload), position, ..Default::default() })
        .map(|_| ())
        .map_err(err)
}

#[tauri::command]
async fn window_send(app: AppHandle, window: WebviewWindow, target: String, payload: Value) -> CmdResult<()> {
    windows::send(&app, &target, payload, Some(window.label())).map_err(err)
}

#[tauri::command]
fn window_rename(app: AppHandle, window: WebviewWindow, name: Option<String>) {
    windows::rename(&app, window.label(), name);
}

#[tauri::command]
fn window_at(app: AppHandle, window: WebviewWindow, x: f64, y: f64) -> Option<String> {
    windows::window_at(&app, window.label(), x, y)
}

#[tauri::command]
fn identify_windows(app: AppHandle) {
    windows::identify_all(&app);
}

#[tauri::command]
fn session_save(app: AppHandle, window: WebviewWindow, snapshot: Value) {
    windows::save_session(&app, window.label(), snapshot);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    windows::quit(&app);
}

#[tauri::command]
async fn summon(app: AppHandle, args: windows::Summon) {
    windows::summon(&app, args);
}

#[tauri::command]
fn minimize_to_tray(app: AppHandle, window: WebviewWindow) {
    windows::ensure_tray(&app);
    let _ = window.hide();
}

#[derive(serde::Deserialize)]
struct Shortcut {
    keys: String,
    action: Value,
}

#[tauri::command]
fn set_global_shortcuts(app: AppHandle, shortcuts: Vec<Shortcut>) -> CmdResult<()> {
    windows::set_shortcuts(&app, shortcuts.into_iter().map(|s| (s.keys, s.action)).collect())
}

#[derive(serde::Serialize)]
struct ParsedLine {
    window: Option<String>,
    actions: Vec<Value>,
}

#[tauri::command]
fn cli_parse(line: String) -> CmdResult<ParsedLine> {
    let mut cli = cli::parse_line(&line)?;
    if let Ok(cwd) = std::env::current_dir() {
        cli::resolve_dirs(&mut cli.actions, &cwd);
    }
    if cli.actions.is_empty() {
        cli.actions.push(json!({ "command": "new_tab" }));
    }
    Ok(ParsedLine { window: cli.window, actions: cli.actions })
}

// ---------- startup ----------

fn launch_of(cli: &cli::Cli) -> windows::Launch {
    let mode = match (cli.maximized, cli.fullscreen, cli.focus) {
        (_, true, _) => Some("fullscreen"),
        (true, _, true) => Some("maximized_focus"),
        (true, _, false) => Some("maximized"),
        (false, _, true) => Some("focus"),
        _ => None,
    };
    windows::Launch { mode: mode.map(str::to_string), size: cli.size, pos: cli.pos }
}

fn print_help() {
    #[cfg(windows)]
    {
        // GUI subsystem: attach to the parent console to print.
        unsafe extern "system" {
            fn AttachConsole(pid: u32) -> i32;
        }
        unsafe {
            AttachConsole(u32::MAX);
        }
    }
    println!("{}", cli::HELP);
}

/// First launch: CLI actions, else the persisted session, else `startup_actions`.
fn open_initial_windows(app: &AppHandle, args: &[String]) -> tauri::Result<()> {
    let cfg = app.state::<AppState>().config.lock().unwrap().clone();
    let mut cli = cli::parse(args).unwrap_or_else(|e| {
        eprintln!("terminux: {e}");
        cli::Cli::default()
    });
    if let Ok(cwd) = std::env::current_dir() {
        cli::resolve_dirs(&mut cli.actions, &cwd);
    }
    let launch = launch_of(&cli);
    if cli.actions.is_empty() {
        if windows::persisting(&cfg) {
            let saved = session_store::load();
            if !saved.is_empty() {
                for snap in saved {
                    let bounds = session_store::bounds(&snap);
                    let name = snap.get("name").and_then(Value::as_str).map(str::to_string);
                    windows::create(app, windows::Create { payload: Some(json!({ "snapshot": snap })), name, bounds, ..Default::default() })?;
                }
                return Ok(());
            }
        }
        if let Some(line) = cfg.get_str("startup_actions").filter(|l| !l.trim().is_empty()) {
            match cli::parse_line(line) {
                Ok(startup) => cli.actions = startup.actions,
                Err(e) => eprintln!("startup_actions: {e}"),
            }
        }
    }
    let payload = (!cli.actions.is_empty()).then(|| json!({ "actions": cli.actions }));
    windows::create(app, windows::Create { payload, name: cli.window.filter(|w| w != "new" && w != "-1" && w != "0" && w != "last" && w.parse::<u32>().is_err()), launch: Some(launch), ..Default::default() })?;
    Ok(())
}

/// Another `terminux` invocation while running.
fn second_instance(app: &AppHandle, argv: Vec<String>, cwd: String) {
    let mut cli = match cli::parse(argv.get(1..).unwrap_or_default()) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("terminux: {e}");
            return;
        }
    };
    cli::resolve_dirs(&mut cli.actions, std::path::Path::new(&cwd));
    if cli.actions.is_empty() {
        cli.actions.push(json!({ "command": "new_tab" }));
    }
    let payload = json!({ "actions": cli.actions });
    let cfg = app.state::<AppState>().config.lock().unwrap().clone();
    let target = cli.window.clone().unwrap_or_else(|| {
        match cfg.get_str("windowing_behavior").map(|s| s.to_ascii_lowercase().replace(['_', '-'], "")) {
            Some(b) if b == "useexisting" || b == "useanyexisting" => "last".into(),
            _ => "new".into(),
        }
    });
    if target == "new" || target == "-1" || windows::resolve(app, &target, None).is_none() && target == "last" {
        let _ = windows::create(app, windows::Create { payload: Some(payload), launch: Some(launch_of(&cli)), ..Default::default() });
    } else {
        let _ = windows::send(app, &target, payload, None);
    }
}

fn watch_config(app: &AppHandle) -> notify::Result<notify::RecommendedWatcher> {
    let path = config::config_path();
    let dir = path.parent().expect("config dir").to_path_buf();
    let _ = std::fs::create_dir_all(dir.join("fragments"));
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(ev) = res else { return };
        let relevant = ev.paths.iter().any(|p| {
            p.file_name() == path.file_name() || p.parent().is_some_and(|d| d.ends_with("fragments"))
        });
        if !relevant || !(ev.kind.is_modify() || ev.kind.is_create() || ev.kind.is_remove()) {
            return;
        }
        let cfg = config::load();
        *handle.state::<AppState>().config.lock().unwrap() = cfg.clone();
        windows::apply_system_settings(&handle, &cfg);
        let _ = handle.emit("config-changed", cfg);
    })?;
    watcher.watch(&dir, RecursiveMode::Recursive)?;
    Ok(watcher)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if cli::parse(&args).is_ok_and(|c| c.help) {
        print_help();
        return;
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(second_instance))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .manage(AppState {
            config: Mutex::new(config::load()),
            pty: PtyManager::default(),
            windows: Mutex::new(windows::Windows::default()),
            open_files: editor::OpenFiles::default(),
            remote_files: Default::default(),
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            match watch_config(&handle) {
                Ok(w) => {
                    app.manage(Mutex::new(w));
                }
                Err(e) => eprintln!("config watcher disabled: {e}"),
            }
            let cfg = handle.state::<AppState>().config.lock().unwrap().clone();
            windows::apply_system_settings(&handle, &cfg);
            open_initial_windows(&handle, &args)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            let app = window.app_handle();
            match event {
                tauri::WindowEvent::Focused(true) => windows::focused(app, window.label()),
                tauri::WindowEvent::Destroyed => {
                    app.state::<AppState>().pty.kill_owned(window.label());
                    windows::destroyed(app, window.label());
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            frontend_log,
            get_config,
            open_config,
            config_path,
            read_config,
            config_parse,
            config_patch,
            validate_config,
            write_config,
            default_config,
            read_binary,
            open_path,
            open_in_editor,
            file_read,
            file_write,
            save_text,
            pty_spawn,
            pty_detach,
            pty_attach,
            pty_write,
            pty_resize,
            pty_kill,
            pty_cwd,
            pty_is_ssh,
            pty_ssh_follow,
            pty_ssh_resume,
            remote_file_fetch,
            window_init,
            window_new,
            window_send,
            window_rename,
            window_at,
            identify_windows,
            session_save,
            quit_app,
            summon,
            minimize_to_tray,
            set_global_shortcuts,
            cli_parse
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { api, code: None, .. } => {
                let cfg = app.state::<AppState>().config.lock().unwrap().clone();
                let quitting = app.state::<AppState>().windows.lock().unwrap().quitting;
                if cfg.get_bool("allow_headless") && !quitting {
                    api.prevent_exit();
                }
            }
            tauri::RunEvent::Exit => app.state::<AppState>().pty.kill_all(),
            _ => {}
        });
}

#[cfg(all(test, not(windows)))]
mod tests {
    use super::*;

    #[test]
    fn file_ipc_is_limited_to_config_paths() {
        let cfg = Config::parse(
            "bell_sound = [\"/snd/a.wav\"]\n[defaults]\nbackground_image = \"~/img.png\"\n[[profile]]\nid = \"x\"\nicon = \"icons/x.png\"",
        )
        .unwrap();
        assert!(referenced_by_config(&cfg, Path::new("/snd/a.wav")));
        assert!(referenced_by_config(&cfg, &config::resolve_path("~/img.png")));
        assert!(referenced_by_config(&cfg, &config::resolve_path("icons/x.png")));
        assert!(!referenced_by_config(&cfg, Path::new("/etc/passwd")));
        assert!(!referenced_by_config(&cfg, &config::resolve_path("")));
    }
}
