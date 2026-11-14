//! Windows: creation (launch settings), per-window init payloads, routing between windows,
//! session persistence, summoning (quake mode, global shortcuts), tray.

use std::collections::{BTreeMap, HashMap};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::config::Config;
use crate::{AppState, session_store};

pub const QUAKE: &str = "_quake";
const TRAY_ID: &str = "terminux";

#[derive(Debug, Clone, Serialize)]
pub struct InitInfo {
    pub id: u32,
    pub name: Option<String>,
    pub transparent: bool,
    pub payload: Option<Value>,
    pub grid: Option<Grid>,
    pub launch_mode: String,
    pub center: bool,
}

#[derive(Debug, Clone, Copy, Serialize)]
pub struct Grid {
    pub cols: u32,
    pub rows: u32,
}

/// How to create a window.
#[derive(Default)]
pub struct Create {
    pub payload: Option<Value>,
    pub name: Option<String>,
    /// First window of a launch: launch_mode, initial size and position apply.
    pub launch: Option<Launch>,
    /// Restored bounds (x, y, w, h, maximized).
    pub bounds: Option<(f64, f64, f64, f64, bool)>,
    pub position: Option<(f64, f64)>,
}

#[derive(Default, Clone)]
pub struct Launch {
    pub mode: Option<String>,
    pub size: Option<(u32, u32)>,
    pub pos: Option<(Option<i32>, Option<i32>)>,
}

struct Win {
    id: u32,
    name: Option<String>,
}

#[derive(Default)]
pub struct Windows {
    next_id: u32,
    windows: HashMap<String, Win>,
    pending: HashMap<String, InitInfo>,
    /// Labels, most recently focused first.
    mru: Vec<String>,
    /// Session snapshots by window id.
    sessions: BTreeMap<u32, Value>,
    saved_at: HashMap<String, Instant>,
    pub quitting: bool,
    shortcuts: Vec<(String, Value)>,
}

fn state(app: &AppHandle) -> std::sync::MutexGuard<'_, Windows> {
    app.state::<AppState>().inner().windows.lock().unwrap()
}

fn config(app: &AppHandle) -> Config {
    app.state::<AppState>().config.lock().unwrap().clone()
}

fn norm(s: &str) -> String {
    s.to_ascii_lowercase().replace(['_', '-'], "")
}

/// Create a window; it starts hidden and the frontend shows it once sized.
pub fn create(app: &AppHandle, opts: Create) -> tauri::Result<WebviewWindow> {
    let cfg = config(app);
    let (id, label) = {
        let mut s = state(app);
        s.next_id += 1;
        (s.next_id, format!("w{}", s.next_id))
    };
    let transparent = cfg.wants_transparency();
    let quake = opts.name.as_deref() == Some(QUAKE);
    let mut b = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title("Terminux")
        .inner_size(1200.0, 760.0)
        .min_inner_size(400.0, 240.0)
        .decorations(false)
        .visible(false)
        .always_on_top(cfg.get_bool("always_on_top") || quake)
        .skip_taskbar(quake);
    #[cfg(not(target_os = "macos"))]
    {
        b = b.transparent(transparent);
    }

    let mut launch_mode = String::from("default");
    let mut grid = None;
    let mut center = false;
    if let Some((x, y, w, h, max)) = opts.bounds {
        b = b.position(x, y).inner_size(w.max(400.0), h.max(240.0));
        if max {
            launch_mode = "maximized".into();
        }
    } else if let Some(l) = &opts.launch {
        launch_mode = l.mode.clone().or_else(|| cfg.get_str("launch_mode").map(str::to_string)).unwrap_or(launch_mode);
        let cols = l.size.map(|s| s.0).or_else(|| cfg.get_int("initial_cols").map(|v| v as u32)).unwrap_or(120);
        let rows = l.size.map(|s| s.1).or_else(|| cfg.get_int("initial_rows").map(|v| v as u32)).unwrap_or(30);
        grid = Some(Grid { cols: cols.clamp(20, 1000), rows: rows.clamp(5, 500) });
        let pos = l.pos.or_else(|| cfg.get_str("initial_position").map(parse_position));
        if let Some((Some(x), Some(y))) = pos {
            b = b.position(x as f64, y as f64);
        }
        center = cfg.get_bool("center_on_launch") && !matches!(pos, Some((Some(_), Some(_))));
    }
    if let Some((x, y)) = opts.position {
        b = b.position(x, y);
    }
    if quake {
        launch_mode = "focus".into();
    }

    let win = b.build()?;
    apply_effects(&win, &cfg);
    if quake {
        dock_top(app, &win);
    }
    {
        let mut s = state(app);
        s.windows.insert(label.clone(), Win { id, name: opts.name.clone() });
        s.mru.insert(0, label.clone());
        s.pending.insert(
            label.clone(),
            InitInfo { id, name: opts.name, transparent, payload: opts.payload, grid, launch_mode, center },
        );
    }
    // Never leave a window invisible if the frontend fails to start.
    let w = win.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        if !w.is_visible().unwrap_or(true) && !w.is_minimized().unwrap_or(false) {
            let _ = w.show();
        }
    });
    Ok(win)
}

fn parse_position(s: &str) -> (Option<i32>, Option<i32>) {
    let (a, b) = s.split_once(',').unwrap_or((s, ""));
    (a.trim().parse().ok(), b.trim().parse().ok())
}

/// Acrylic / Mica backdrops where the platform has them.
fn apply_effects(win: &WebviewWindow, cfg: &Config) {
    #[cfg(any(windows, target_os = "macos"))]
    {
        use tauri::window::{Effect, EffectsBuilder};
        let acrylic = cfg.defaults.get("use_acrylic").and_then(toml::Value::as_bool).unwrap_or(false)
            || cfg.profiles.iter().any(|p| p.extra.get("use_acrylic").and_then(toml::Value::as_bool).unwrap_or(false));
        let theme = cfg.get_str("app_theme").unwrap_or("dark").to_string();
        let mica = cfg.ui_themes.iter().any(|t| {
            t.get("name").and_then(toml::Value::as_str).is_some_and(|n| norm(n) == norm(&theme))
                && t.get("window").and_then(|w| w.get("use_mica")).and_then(toml::Value::as_bool).unwrap_or(false)
        });
        #[cfg(windows)]
        let effect = if mica { Some(Effect::Mica) } else if acrylic { Some(Effect::Acrylic) } else { None };
        #[cfg(target_os = "macos")]
        let effect = if acrylic || mica { Some(Effect::HudWindow) } else { None };
        if let Some(e) = effect {
            let _ = win.set_effects(EffectsBuilder::new().effect(e).build());
        }
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    let _ = (win, cfg);
}

/// Quake window: full width, half height, top of the monitor under the cursor.
fn dock_top(app: &AppHandle, win: &WebviewWindow) {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| win.current_monitor().ok().flatten());
    if let Some(m) = monitor {
        let scale = m.scale_factor();
        let size = m.size().to_logical::<f64>(scale);
        let pos = m.position().to_logical::<f64>(scale);
        let _ = win.set_size(LogicalSize::new(size.width, (size.height / 2.0).round()));
        let _ = win.set_position(LogicalPosition::new(pos.x, pos.y));
    }
}

pub fn init_info(app: &AppHandle, label: &str) -> InitInfo {
    let mut s = state(app);
    if let Some(info) = s.pending.remove(label) {
        return info;
    }
    // Reloaded webview: no payload.
    let win = s.windows.get(label);
    InitInfo {
        id: win.map_or(0, |w| w.id),
        name: win.and_then(|w| w.name.clone()),
        transparent: config(app).wants_transparency(),
        payload: None,
        grid: None,
        launch_mode: "default".into(),
        center: false,
    }
}

/// Label of a window designated by id / name / "last" (excluding `except`).
pub fn resolve(app: &AppHandle, target: &str, except: Option<&str>) -> Option<String> {
    let s = state(app);
    let t = target.trim();
    if t == "last" || t == "0" {
        return s.mru.iter().find(|l| Some(l.as_str()) != except && l.as_str() != quake_label(&s).unwrap_or("")).cloned();
    }
    s.windows
        .iter()
        .find(|(_, w)| w.id.to_string() == t || w.name.as_deref() == Some(t))
        .map(|(l, _)| l.clone())
}

fn quake_label(s: &Windows) -> Option<&str> {
    s.windows.iter().find(|(_, w)| w.name.as_deref() == Some(QUAKE)).map(|(l, _)| l.as_str())
}

/// Deliver a payload to a window, creating it when `target` names none.
pub fn send(app: &AppHandle, target: &str, payload: Value, except: Option<&str>) -> tauri::Result<()> {
    if target == "new" || target == "-1" {
        create(app, Create { payload: Some(payload), ..Default::default() })?;
        return Ok(());
    }
    match resolve(app, target, except) {
        Some(label) => {
            app.emit_to(label.as_str(), "window-payload", payload)?;
            if let Some(w) = app.get_webview_window(&label) {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }
        None => {
            let name = target.parse::<u32>().is_err().then(|| target.to_string()).filter(|n| n != "last" && n != "0");
            create(app, Create { payload: Some(payload), name, ..Default::default() })?;
        }
    }
    Ok(())
}

pub fn rename(app: &AppHandle, label: &str, name: Option<String>) {
    if let Some(w) = state(app).windows.get_mut(label) {
        w.name = name;
    }
}

pub fn identify_all(app: &AppHandle) {
    let list: Vec<(String, String)> = state(app)
        .windows
        .iter()
        .map(|(l, w)| (l.clone(), match &w.name {
            Some(n) => format!("{}: {n}", w.id),
            None => w.id.to_string(),
        }))
        .collect();
    for (label, text) in list {
        let _ = app.emit_to(label.as_str(), "identify", text);
    }
}

/// Another window whose outer rectangle contains a logical screen point.
pub fn window_at(app: &AppHandle, except: &str, x: f64, y: f64) -> Option<String> {
    let labels: Vec<(String, u32)> = state(app).windows.iter().map(|(l, w)| (l.clone(), w.id)).collect();
    for (label, id) in labels {
        if label == except {
            continue;
        }
        let Some(w) = app.get_webview_window(&label) else { continue };
        if !w.is_visible().unwrap_or(false) || w.is_minimized().unwrap_or(false) {
            continue;
        }
        let (Ok(pos), Ok(size), Ok(scale)) = (w.outer_position(), w.outer_size(), w.scale_factor()) else { continue };
        let p = pos.to_logical::<f64>(scale);
        let s = size.to_logical::<f64>(scale);
        if x >= p.x && x < p.x + s.width && y >= p.y && y < p.y + s.height {
            return Some(id.to_string());
        }
    }
    None
}

// ---------- focus / lifecycle ----------

pub fn focused(app: &AppHandle, label: &str) {
    let mut s = state(app);
    s.mru.retain(|l| l != label);
    s.mru.insert(0, label.to_string());
}

/// A window was destroyed: forget it; keep its session only if it was the last one.
pub fn destroyed(app: &AppHandle, label: &str) {
    let mut s = state(app);
    let Some(w) = s.windows.remove(label) else { return };
    s.mru.retain(|l| l != label);
    s.pending.remove(label);
    s.saved_at.remove(label);
    if s.quitting {
        return;
    }
    let last = s.windows.values().all(|w| w.name.as_deref() == Some(QUAKE));
    let keep = last && s.sessions.get(&w.id).is_some_and(session_store::has_tabs);
    if !keep {
        s.sessions.remove(&w.id);
    }
    if persisting(&config(app)) {
        session_store::write(&s.sessions);
    }
}

pub fn persisting(cfg: &Config) -> bool {
    cfg.get_str("first_window_preference").is_none_or(|v| norm(v) == "persistedwindowlayout")
}

pub fn save_session(app: &AppHandle, label: &str, snapshot: Value) {
    let cfg = config(app);
    let mut s = state(app);
    let Some(id) = s.windows.get(label).map(|w| w.id) else { return };
    if s.windows.get(label).and_then(|w| w.name.as_deref()) == Some(QUAKE) {
        return;
    }
    s.sessions.insert(id, snapshot);
    s.saved_at.insert(label.to_string(), Instant::now());
    if persisting(&cfg) {
        session_store::write(&s.sessions);
    }
}

/// Ask every window for a last snapshot, then exit.
pub fn quit(app: &AppHandle) {
    let start = Instant::now();
    let labels: Vec<String> = {
        let mut s = state(app);
        s.quitting = true;
        s.windows.keys().cloned().collect()
    };
    for l in &labels {
        let _ = app.emit_to(l.as_str(), "persist", ());
    }
    let app = app.clone();
    std::thread::spawn(move || {
        let deadline = start + Duration::from_millis(1500);
        while Instant::now() < deadline {
            let done = {
                let s = state(&app);
                labels.iter().all(|l| s.saved_at.get(l).is_some_and(|t| *t >= start))
            };
            if done || !persisting(&config(&app)) {
                break;
            }
            std::thread::sleep(Duration::from_millis(30));
        }
        if persisting(&config(&app)) {
            session_store::write(&state(&app).sessions);
        }
        app.state::<AppState>().pty.kill_all();
        app.exit(0);
    });
}

// ---------- summon / global shortcuts ----------

#[derive(Debug, Default, Deserialize)]
pub struct Summon {
    pub name: Option<String>,
    pub monitor: Option<String>,
    pub dropdown_duration: Option<u64>,
    pub toggle_visibility: Option<bool>,
}

/// Show (or hide, when already in front) a window; creates it when missing.
pub fn summon(app: &AppHandle, args: Summon) {
    let name = args.name.clone().filter(|n| !n.is_empty());
    let quake = name.as_deref() == Some(QUAKE);
    let label = match &name {
        Some(n) => resolve(app, n, None),
        None => state(app).mru.iter().find(|l| app.get_webview_window(l).is_some()).cloned(),
    };
    let Some(win) = label.and_then(|l| app.get_webview_window(&l)) else {
        let _ = create(app, Create { name, ..Default::default() });
        return;
    };
    let visible = win.is_visible().unwrap_or(false) && !win.is_minimized().unwrap_or(false);
    if visible && win.is_focused().unwrap_or(false) && args.toggle_visibility.unwrap_or(true) {
        if quake || args.dropdown_duration.unwrap_or(0) > 0 {
            let _ = win.hide();
        } else {
            let _ = win.minimize();
        }
        return;
    }
    if quake {
        dock_top(app, &win);
    } else if args.monitor.as_deref().is_some_and(|m| norm(m) == "tomouse") {
        move_to_cursor_monitor(app, &win);
    }
    let _ = win.unminimize();
    let duration = args.dropdown_duration.unwrap_or(0);
    if duration > 0 && !visible {
        slide_down(win, duration);
    } else {
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn move_to_cursor_monitor(app: &AppHandle, win: &WebviewWindow) {
    let Ok(cursor) = app.cursor_position() else { return };
    let Some(target) = app.monitor_from_point(cursor.x, cursor.y).ok().flatten() else { return };
    let Some(current) = win.current_monitor().ok().flatten() else { return };
    if target.position() == current.position() {
        return;
    }
    let Ok(pos) = win.outer_position() else { return };
    let dx = pos.x - current.position().x;
    let dy = pos.y - current.position().y;
    let _ = win.set_position(tauri::PhysicalPosition::new(target.position().x + dx, target.position().y + dy));
}

/// Slide a window in from above its position.
fn slide_down(win: WebviewWindow, duration_ms: u64) {
    std::thread::spawn(move || {
        let (Ok(pos), Ok(size)) = (win.outer_position(), win.outer_size()) else { return };
        let steps = (duration_ms / 15).clamp(2, 40) as i32;
        let h = size.height as i32;
        let _ = win.set_position(tauri::PhysicalPosition::new(pos.x, pos.y - h));
        let _ = win.show();
        let _ = win.set_focus();
        for i in 1..=steps {
            std::thread::sleep(Duration::from_millis(duration_ms / steps as u64));
            let _ = win.set_position(tauri::PhysicalPosition::new(pos.x, pos.y - h + h * i / steps));
        }
    });
}

/// `Ctrl+Shift+Q` / `Win+\`` → global-shortcut syntax.
pub fn accelerator(combo: &str) -> Option<String> {
    let mut parts: Vec<String> = combo.split('+').map(|p| p.trim().to_string()).collect();
    if combo.trim().ends_with("++") {
        parts.truncate(parts.len().saturating_sub(2));
        parts.push("=".into());
    }
    let key = parts.pop()?;
    let mut out = Vec::new();
    for m in parts {
        out.push(match m.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => "Control",
            "shift" => "Shift",
            "alt" => "Alt",
            "win" | "meta" | "super" | "cmd" => "Super",
            _ => return None,
        }.to_string());
    }
    let k = key.to_ascii_lowercase();
    let code = match k.as_str() {
        "`" | "backquote" | "grave" => "Backquote".into(),
        "-" | "minus" => "Minus".into(),
        "=" | "plus" | "equal" => "Equal".into(),
        "," | "comma" => "Comma".into(),
        "." | "period" => "Period".into(),
        "/" => "Slash".into(),
        ";" => "Semicolon".into(),
        "space" | " " => "Space".into(),
        "enter" | "return" => "Enter".into(),
        "tab" => "Tab".into(),
        "esc" | "escape" => "Escape".into(),
        "up" => "ArrowUp".into(),
        "down" => "ArrowDown".into(),
        "left" => "ArrowLeft".into(),
        "right" => "ArrowRight".into(),
        "pgup" | "pageup" => "PageUp".into(),
        "pgdn" | "pagedown" => "PageDown".into(),
        "home" => "Home".into(),
        "end" => "End".into(),
        "insert" => "Insert".into(),
        "delete" | "del" => "Delete".into(),
        _ if k.len() == 1 && k.chars().all(|c| c.is_ascii_alphabetic()) => format!("Key{}", k.to_ascii_uppercase()),
        _ if k.len() == 1 && k.chars().all(|c| c.is_ascii_digit()) => format!("Digit{k}"),
        _ if k.starts_with('f') && k[1..].parse::<u8>().is_ok_and(|n| (1..=24).contains(&n)) => k.to_ascii_uppercase(),
        _ => return None,
    };
    out.push(code);
    Some(out.join("+"))
}

/// Register OS-level shortcuts (quake mode, global_summon actions).
pub fn set_shortcuts(app: &AppHandle, list: Vec<(String, Value)>) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    let mut s = state(app);
    if s.shortcuts == list {
        return Ok(());
    }
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    let mut errors = Vec::new();
    for (combo, action) in &list {
        let Some(acc) = accelerator(combo) else {
            errors.push(format!("unsupported global shortcut {combo}"));
            continue;
        };
        let action = action.clone();
        let handle = app.clone();
        let r = gs.on_shortcut(acc.as_str(), move |_app, _sc, ev| {
            if ev.state() != tauri_plugin_global_shortcut::ShortcutState::Pressed {
                return;
            }
            let args = if action.get("command").and_then(Value::as_str) == Some("quake_mode") {
                Summon { name: Some(QUAKE.into()), ..Default::default() }
            } else {
                serde_json::from_value(action.clone()).unwrap_or_default()
            };
            summon(&handle, args);
        });
        match r {
            Ok(()) => {}
            Err(e) => errors.push(format!("{combo}: {e}")),
        }
    }
    s.shortcuts = list;
    if errors.is_empty() { Ok(()) } else { Err(errors.join("; ")) }
}

// ---------- tray ----------

pub fn ensure_tray(app: &AppHandle) {
    if app.tray_by_id(TRAY_ID).is_some() {
        return;
    }
    let build = || -> tauri::Result<()> {
        let show = MenuItem::with_id(app, "show", "Show windows", true, None::<&str>)?;
        let new = MenuItem::with_id(app, "new", "New window", true, None::<&str>)?;
        let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&show, &new, &quit_item])?;
        let mut b = TrayIconBuilder::with_id(TRAY_ID).tooltip("Terminux").menu(&menu).show_menu_on_left_click(false);
        if let Some(icon) = app.default_window_icon() {
            b = b.icon(icon.clone());
        }
        b.on_menu_event(|app, ev| match ev.id().as_ref() {
            "show" => show_all(app),
            "new" => {
                let _ = create(app, Create::default());
            }
            "quit" => quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                show_all(tray.app_handle());
            }
        })
        .build(app)?;
        Ok(())
    };
    if let Err(e) = build() {
        eprintln!("tray icon unavailable: {e}");
    }
}

fn show_all(app: &AppHandle) {
    let labels: Vec<String> = state(app)
        .windows
        .iter()
        .filter(|(_, w)| w.name.as_deref() != Some(QUAKE))
        .map(|(l, _)| l.clone())
        .collect();
    if labels.is_empty() {
        let _ = create(app, Create::default());
        return;
    }
    for l in labels {
        if let Some(w) = app.get_webview_window(&l) {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

/// Tray and autostart follow the config.
pub fn apply_system_settings(app: &AppHandle, cfg: &Config) {
    if cfg.get_bool("always_show_tray_icon") || cfg.get_bool("minimize_to_tray") || cfg.get_bool("allow_headless") {
        ensure_tray(app);
    } else {
        let _ = app.remove_tray_by_id(TRAY_ID);
    }
    use tauri_plugin_autostart::ManagerExt;
    let auto = app.autolaunch();
    let want = cfg.get_bool("start_on_user_login");
    if auto.is_enabled().unwrap_or(false) != want {
        let r = if want { auto.enable() } else { auto.disable() };
        if let Err(e) = r {
            eprintln!("autostart: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accelerators() {
        assert_eq!(accelerator("Win+`").as_deref(), Some("Super+Backquote"));
        assert_eq!(accelerator("Ctrl+Shift+q").as_deref(), Some("Control+Shift+KeyQ"));
        assert_eq!(accelerator("Alt+F12").as_deref(), Some("Alt+F12"));
        assert_eq!(accelerator("Ctrl+1").as_deref(), Some("Control+Digit1"));
        assert_eq!(accelerator("Ctrl++").as_deref(), Some("Control+Equal"));
        assert_eq!(accelerator("Hyper+x"), None);
        assert_eq!(parse_position("10,"), (Some(10), None));
    }
}
