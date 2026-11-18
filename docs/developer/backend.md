# Backend

The Rust backend lives in `src-tauri/` (crate `terminux`, library `terminux_lib`, edition 2024). It is deliberately thin: it owns processes (PTYs), the config file, native windows and a few OS integrations, and leaves interpretation of settings to the frontend. This page documents each module, every IPC command registered in `generate_handler!`, the events and channels, and the plugins in use.

## Contents

- [Crate layout](#crate-layout)
- [Modules](#modules)
  - [main.rs](#mainrs)
  - [lib.rs](#librs)
  - [pty.rs](#ptyrs)
  - [config.rs](#configrs)
  - [dynamic_profiles.rs](#dynamic_profilesrs)
  - [windows.rs](#windowsrs)
  - [session_store.rs](#session_storers)
  - [toml_patch.rs](#toml_patchrs)
  - [editor.rs](#editorrs)
  - [ssh.rs and remote_files.rs](#sshrs-and-remote_filesrs)
  - [cli.rs](#clirs)
- [IPC commands](#ipc-commands)
- [Events and channels](#events-and-channels)
- [Plugins](#plugins)
- [Capabilities and CSP](#capabilities-and-csp)
- [See also](#see-also)

## Crate layout

```text
src-tauri/
  Cargo.toml              dependencies, release profile (lto, opt-level 3, panic = abort, strip)
  build.rs                tauri_build::build()
  tauri.conf.json         productName, identifier com.terminux.app, CSP, bundle targets/icons
  capabilities/default.json
  icons/
  src/
    main.rs               binary entry point
    lib.rs                AppState, IPC commands, startup, config watcher
    cli.rs                wt-style command line parser
    config.rs             config.toml model, merge, paths, validation
    default_config.toml    embedded default config (include_str!)
    dynamic_profiles.rs   generated profiles
    editor.rs             Ctrl+click on file paths: external editor, built-in editor file access
    pty.rs                PtyManager
    remote_files.rs       files of an ssh host copied with scp for the built-in editor
    session_store.rs      session.json
    ssh.rs                ssh argv detection, reopen-in-directory, scp arguments
    toml_patch.rs         comment-preserving edits of config.toml (settings UI)
    windows.rs            window creation, routing, summon, tray
```

Key dependencies (`Cargo.toml`): `tauri` 2 (features `tray-icon`, `image-png`), `portable-pty` 0.9, `toml` 0.9, `toml_edit`, `serde`/`serde_json`, `dirs` 6, `notify` 8, `anyhow`, and the Tauri plugins listed in [Plugins](#plugins).

## Modules

### main.rs

Binary entry. On release builds it sets `windows_subsystem = "windows"` (no console window). On Linux, before any thread starts:

- sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` unless already set (the DMABUF renderer shows a blank window on WSLg and some GPU drivers);
- when `APPIMAGE` is set, removes `GTK_MODULES` (an AppImage bundles its own GTK, host modules cannot load).

Then it calls `terminux_lib::run()`.

### lib.rs

- `AppState { config: Mutex<Config>, pty: PtyManager, windows: Mutex<windows::Windows>, open_files: editor::OpenFiles, remote_files: remote_files::RemoteFiles }`, registered with `.manage(...)`.
- All `#[tauri::command]` functions and the `generate_handler!` list (see [IPC commands](#ipc-commands)).
- `run()`: handles `--help` (prints `cli::HELP`, returns), builds the Tauri app, registers plugins, starts the config watcher, opens the initial windows, wires window events and run events.
- `open_initial_windows` / `second_instance`: launch and routing logic described in [architecture.md](architecture.md#window-routing).
- `watch_config`: `notify::recommended_watcher` on the config directory (recursive); reloads on modify/create/remove of `config.toml` or any file whose parent directory is named `fragments`, then updates `AppState.config`, calls `windows::apply_system_settings` and emits `config-changed`.
- `referenced_by_config`: the allow-list check used by `read_binary` and `save_text` (walks the serialized config and compares resolved paths of every string value).
- Window events: `Focused(true)` -> `windows::focused`; `Destroyed` -> `pty.kill_owned(label)` + `windows::destroyed`.
- Run events: `ExitRequested` with `code: None` is prevented when `allow_headless` is set and the app is not quitting; `Exit` calls `pty.kill_all()`.

### pty.rs

`PtyManager` (default-constructed) holds `sessions: Arc<Mutex<HashMap<u32, Session>>>`, `orphans: Arc<Mutex<HashMap<u32, Orphan>>>` and an atomic `next_id` (ids start at 1).

| Item | Role |
| --- | --- |
| `SpawnRequest` | profile, `cwd`, `inherit_cwd`, `commandline`, `env`, `cols`, `rows`, `owner` (window label) |
| `Sink` | `channel: Option<Channel<InvokeResponseBody>>`, `backlog: Vec<u8>`, `sent: u64`; `push` sends or buffers (cap 8 MiB, oldest dropped), `attach` replays the backlog |
| `Session` | master PTY, input `Sender`, child killer, pid, `owner`, shared `Sink`, `detach_gen`, `reaped` |
| `Orphan` | `backlog` + exit `code` of a session that exited while detached |
| `AttachResult` | `{ exited: bool, code: Option<u32> }` returned to the frontend |
| `PtyManager::spawn` | open PTY, build the command, start reader / writer / waiter threads |
| `PtyManager::write` / `resize` | queue input / resize (`rows`/`cols` clamped to at least 1) |
| `PtyManager::kill` / `kill_all` / `kill_owned` | kill one session (and drop its orphan), all, or all owned by a window label |
| `PtyManager::detach` / `attach` | hand-off protocol, see the state diagram in [architecture.md](architecture.md#pty-lifecycle) |
| `PtyManager::cwd` | Linux only: `/proc/<pid>/cwd` of the PTY's foreground process group leader (falls back to the child pid); `None` elsewhere |
| `build_command(&Profile)` | command line construction (below) |
| `user_shell()` | `$SHELL` (fallback `/bin/sh`); on Windows `TERMINUX_SHELL` (fallback `powershell.exe`) |

Command construction (`build_command`):

- `cmd` equal to `$SHELL` or empty means the user shell.
- **Unix**: if the command is the user shell, or the profile sets `login_shell = false`, it runs directly with `args`. Otherwise it runs through the user's login shell as `$SHELL -lic "exec <quoted cmd + args>"` so PATH set in rc files applies.
- **Windows**: direct when the command is the shell, `login_shell = false`, or ends with `.exe`; otherwise `cmd.exe /d /c <cmd> <args>` (resolves `.cmd`/`.ps1` shims).
- Environment variables always set: `TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=terminux`, `TERM_PROGRAM_VERSION=<crate version>`, `TERMINUX_PROFILE_ID=<profile id>`. `spawn` also sets `TERMINUX_SESSION=<session id>`. Profile `env` is applied after the defaults above, then the request `env`.
- Working directory: the first existing directory among `req.cwd`, `profile.cwd`, `req.inherit_cwd` (each with a leading `~` expanded), else the home directory.
- A `commandline` in the request replaces the profile's `cmd`/`args` (split with `split_commandline`).

### config.rs

Parses `config.toml` into `Config`. Only spawn-related fields are typed; everything else is carried in `#[serde(flatten)] extra: Table` and interpreted by the frontend.

Typed in `Config`: `default_profile` (default `"shell"`), `font_size` (14), `font_family`, `scrollback` (100000), `notifications` (true), `copy_on_select`, `middle_click_paste` (true), `right_click_paste` (true), `word_separators` (alias `word_delimiters`), `renderer`, `defaults` (table), `profiles` (`[[profile]]`), `schemes` (`[[scheme]]`), `ui_themes` (`[[ui_theme]]`), `actions` (`[[action]]`), `keys` (`[keys]`, string or list), `theme` (`[theme]`), `disabled_profile_sources`, and `error` (set when the user file failed to parse).

Typed in `Profile`: `id`, `name`, `cmd`, `commandline` (parse-only), `args`, `cwd` (alias `starting_directory`), `env`, `os`, `login_shell`, `hidden`, `source` (set by generators, never read from TOML), plus `extra` for appearance keys.

Behavior:

- `Config::parse(src)` is pure (no generated profiles, no fragments). `normalize()` drops profiles whose `os` does not match `std::env::consts::OS` (case-insensitive), inserts a `shell` profile (`cmd = "$SHELL"`) when none exists, and copies `[defaults]` `cwd`/`starting_directory`, `env` (profile entries win) and `login_shell` into profiles that lack them. A `commandline` is split into `cmd`/`args`; an empty `name` becomes the `id`.
- `Config::defaults()` parses the embedded `default_config.toml` (`DEFAULT_CONFIG`).
- Getters for `extra`: `get_str`, `get_bool` (missing = false), `get_int`. `wants_transparency()` is true when any profile or `[defaults]` has `opacity < 100`, directly or inside `unfocused_appearance`.
- `extend(dir)` adds fragments, then generated profiles (see the flowchart in [architecture.md](architecture.md#config-load-merge-watch-hot-reload)). `Profile::inherit` lets a user profile with the same id as a generated one fill its gaps (cmd/args, name, cwd, login_shell, extra keys, source).
- `split_commandline`: whitespace splitting with `'`/`"` grouping; a backslash only escapes a `"` (so Windows paths survive).
- Paths: `config_dir()` (`<exe dir>/settings` in portable mode, else `dirs::config_dir()/terminux`), `config_path()`, `state_dir()` (portable: same `settings` dir; else `dirs::state_dir()` or the local data dir, plus `terminux`), `resolve_path` (`~` expansion, relative paths against the config dir).
- `ensure_file()` writes the default config on first run, with the profiles generated on this machine written out as `[[profile]]   # generated: <source>` blocks just before the `# Color schemes.` marker (`initial_config`).
- `validate(src)` returns a `ConfigError { message, from, to }` with offsets converted to UTF-16 code units (CodeMirror offsets). `write(src)` validates then writes.
- `load()` = `ensure_file` + parse (falling back to defaults with `error` set) + `extend`.

### dynamic_profiles.rs

Generated profiles, computed once per run and cached in a `OnceLock`. `generate()` returns:

| Source (`Profile.source`) | Platform | Profiles |
| --- | --- | --- |
| `windows` | Windows | `powershell` (`powershell.exe`, "Windows PowerShell"), `cmd` (`cmd.exe`, "Command Prompt") |
| `wsl` | Windows | one `wsl-<slug>` per distribution from `wsl.exe -l -q` (UTF-16LE parsed by `parse_wsl_list`, `docker-desktop*` skipped), running `wsl.exe -d <distro> --cd ~`, with `path_translation_style = "wsl"` |
| `powershell` | all | `pwsh` ("PowerShell") when `pwsh` / `pwsh.exe` is on `PATH` |
| `ssh` | all | one `ssh-<slug>` ("SSH - host") per concrete `Host` alias in `~/.ssh/config` when `ssh` is on `PATH` (patterns containing `*`, `?`, `!` skipped) |

All generated profiles set `login_shell = Some(false)` so they are never wrapped in the user's login shell. `slug()` lowercases and replaces non-alphanumerics with `-`.

### windows.rs

Window lifecycle, routing and OS integration. State lives in `Windows { next_id, windows, pending, mru, sessions, saved_at, quitting, shortcuts }` behind a mutex in `AppState`.

| Function | Purpose |
| --- | --- |
| `create(app, Create)` | Build a hidden window (`w<id>`, 1200x760 default, min 400x240, no decorations, `always_on_top` from config or quake, `skip_taskbar` for quake, transparency from `wants_transparency()` except on macOS). Applies restored `bounds`, or launch settings (`launch_mode`, `initial_cols`/`initial_rows` clamped to 20..1000 x 5..500, `initial_position`, `center_on_launch`) for the first window of a launch. Stores an `InitInfo` in `pending`. |
| `init_info(app, label)` | Returns (and removes) the pending `InitInfo`; a reloaded webview gets an empty one. |
| `resolve(app, target, except)` | Window label for an id, name, or `last`/`0` (most recent in the MRU, excluding `except` and the quake window). |
| `send(app, target, payload, except)` | `new`/`-1` creates a window; otherwise emits `window-payload` to the resolved window and unminimizes/shows/focuses it; an unknown target creates a window named after it. |
| `rename`, `identify_all`, `window_at` | Name a window; emit `identify` to all; find another visible window containing a logical screen point. |
| `focused`, `destroyed` | MRU upkeep; forget a window and keep its session snapshot only if it was the last non-quake window. |
| `save_session`, `quit`, `persisting` | Store a window's snapshot (quake window excluded) and write `session.json`; `quit` asks every window for a last snapshot (`persist` event, up to 1.5 s), writes, kills all PTYs and exits. `persisting` is true when `first_window_preference` is unset or `persisted_window_layout` (normalized). |
| `summon` | Show/hide (or create) a window. Arguments: `name`, `monitor` (`toMouse` moves the window to the cursor's monitor), `dropdown_duration` (ms, slide-down animation), `toggle_visibility` (default true). The quake window (`_quake`) is docked to the top half of the monitor under the cursor. |
| `accelerator(combo)` | Converts `Ctrl+Shift+Q`-style combos to global-shortcut syntax (`Control+Shift+KeyQ`); `None` for unsupported modifiers/keys. |
| `set_shortcuts` | Replaces all OS-level shortcuts; each triggers `summon` (a `quake_mode` action summons `_quake`). Skips work when the list is unchanged; returns joined error messages. |
| `ensure_tray`, `apply_system_settings` | Tray icon (Show windows / New window / Quit; left click shows all) when `always_show_tray_icon`, `minimize_to_tray` or `allow_headless` is set, else removed; autostart enabled/disabled to match `start_on_user_login`. |
| `apply_effects` | Windows: Mica if the active `[[ui_theme]]` has `window.use_mica`, else Acrylic if any profile/defaults has `use_acrylic`. macOS: `HudWindow` effect. No-op on Linux. |

The reserved window name is the constant `QUAKE = "_quake"`.

### session_store.rs

Persists `{ "version": 1, "windows": [...] }` to `<state_dir>/session.json`, written atomically (`session.json.tmp` then rename). `load()` returns the saved window snapshots that still have tabs (`tabs` or `editors` non-empty); `bounds(snapshot)` extracts `(x, y, width, height, maximized)`. Snapshots are opaque `serde_json::Value`s produced by the frontend (`WindowSnapshot` in `src/lib/snapshot.ts`).

### toml_patch.rs

Comment-preserving edits of `config.toml` for the settings UI, built on `toml_edit`. `parse(src)` returns the raw document as JSON (no fragments, no generated profiles). `patch(src, ops)` applies `PatchOp`s in order and returns the new text, leaving comments and layout of untouched parts alone. A path is a list of segments (table key or array index), for example `["profile", 2, "font", "size"]`.

| Op | Effect |
| --- | --- |
| `set { path, value }` | Set a value, creating missing tables; `null` removes it. |
| `remove { path }` | Remove a key or array element; tables left empty are removed too. |
| `insert { path, index?, value }` | Insert into an array (of tables), created if missing; no index appends. |
| `move { path, from, to }` | Reorder an element of an array (of tables). |

### editor.rs

Backs Ctrl+click on file paths printed in a terminal. `open(template, path, line, col, terminal)` expands `~`, checks the file exists, substitutes `{file}`, `{line}`, `{col}` per argument of [`file_link_editor`](../reference/configuration.md#file_link_editor) (the program comes from the config only; no shell is involved) and starts it detached. Without a template it returns a fallback command line (`$VISUAL` / `$EDITOR` / `vi` at the line; Notepad on Windows) for a terminal tab; with `terminal = true` it returns the command line for a pane. `OpenFiles` is the allow-list of the built-in editor: `read` (UTF-8 text, at most 8 MiB, canonicalized) records the path, `write` refuses any path that was not read first. `quote_arg` quotes one argument for `split_commandline`.

### ssh.rs and remote_files.rs

`ssh.rs` recognises an interactive `ssh` command (`parse_ssh_argv` returns an `SshTarget { program, dest, opts }`, or `None` for non-interactive uses such as a remote command or `-W`), builds the argv that reopens it in another remote directory (`follow_argv`) and the `scp` arguments that copy a file to or from the host (`scp_args`). Options only ever come from a command the user launched. `PtyManager::ssh_target(id)` finds the session (the foreground process on Linux, else the spawned command); `spawned_ssh(id)` only the spawned one.

`remote_files.rs` (`RemoteFiles`) copies a file of the host to a private cache directory (`<cache dir>/terminux/remote`) with `scp` (`fetch`) and uploads it back when the built-in editor saves it (`upload`). Only fetched files can be uploaded.

### cli.rs

Parses `wt`-compatible command lines into a `Cli { window, maximized, fullscreen, focus, pos, size, actions, help }`, where each action is a JSON object with the same shape as an `[[action]]` entry. Details:

- Global options: `-h`, `--help`, `-?`, `/?`, `-M/--maximized`, `-F/--fullscreen`, `-f/--focus`, `-w/--window`, `--pos x,y` (either part optional), `--size cols,rows` (both must be positive). Parsing of options stops at the first non-option token.
- Commands are separated by a standalone `;` or a trailing `;` glued to an argument (`\;` is a literal semicolon).
- Subcommands and the actions they produce: `new-tab`/`nt` -> `new_tab`; `split-pane`/`sp` -> `split_pane` (defaults `split = "auto"`); `focus-tab`/`ft` -> `switch_to_tab` (`-t`), `next_tab` (`-n`), `prev_tab` (`-p`; the last two with `tab_switcher_mode = "disabled"`); `move-focus`/`mf` -> `move_focus`; `move-pane`/`mp` -> `move_pane` (`-t`); `swap-pane` -> `swap_pane`. Directions are converted from camelCase/kebab to snake_case (`nextInOrder` -> `next_in_order`).
- A segment without a known subcommand is an implicit `new-tab` (`terminux htop`, `terminux -p python`).
- `new-tab`/`split-pane` options: `-p/--profile`, `-d/--startingDirectory`, `--title`, `--tabColor`, `--colorScheme`, `--suppressApplicationTitle`, `--useApplicationTitle`, `--` (rest is the command), and for `split-pane` `-H/--horizontal` (`split = "down"`), `-V/--vertical` (`split = "right"`), `-D/--duplicate` (`split_mode = "duplicate"`), `-s/--size` (fraction). `--appendCommandLine`, `--inheritEnvironment`, `--reloadEnvironment` are accepted and ignored.
- `parse_line(line)` tokenizes with `config::split_commandline` (used by `cli_parse` and `startup_actions`); `resolve_dirs` makes relative `-d` paths absolute against the invoking directory (a leading `~` is left for the backend to expand).
- `HELP` is the text printed by `--help`.

The full flag reference is in [../reference/command-line.md](../reference/command-line.md).

## IPC commands

All 39 commands registered in `generate_handler!` (`src-tauri/src/lib.rs`). Tauri injects `AppHandle`, `WebviewWindow` and `State` automatically; they are not part of the JS arguments. Rust argument names are converted to camelCase on the JS side (`default_name` becomes `defaultName`, `on_data` becomes `onData`). Fallible commands return `Result<T, String>` (the JS promise rejects with the string).

### Config and files

| Command | Rust signature (JS-visible args) | Purpose |
| --- | --- | --- |
| `frontend_log` | `(level: String, msg: String)` | Prints `[frontend:<level>] <msg>` to stderr; the layout mirrors `console.info/warn/error` and unhandled errors into it. |
| `get_config` | `() -> Config` | Current merged config (clone of `AppState.config`). |
| `open_config` | `() -> Result<()>` | Opens `config.toml` with the system handler (opener plugin). |
| `config_path` | `() -> String` | Absolute path of `config.toml`. |
| `read_config` | `() -> Result<String>` | Contents of `config.toml` (creates it first if missing). |
| `config_parse` | `(src: String) -> Result<Value>` | The raw TOML text as JSON (settings UI read side; no fragments or generated profiles). |
| `config_patch` | `(src: String, ops: Vec<PatchOp>) -> Result<String>` | Applies settings UI edits to the text, keeping comments (see [toml_patch.rs](#toml_patchrs)). |
| `validate_config` | `(src: String) -> Option<ConfigError>` | TOML/serde validation; `{ message, from, to }` in UTF-16 offsets, or `null`. |
| `write_config` | `(src: String) -> Result<()>` | Validates, then writes `config.toml`. The watcher then reloads. |
| `default_config` | `() -> &'static str` | The embedded `default_config.toml` (read-only "Default settings" tab). |
| `read_binary` | `(path: String) -> Result<Response>` | Raw bytes of a user file (background image, bell sound, icon). Path resolved with `resolve_path`; must be referenced by the config; max 64 MiB. |
| `open_path` | `(path: String) -> Result<()>` | Opens a directory in the system file manager; errors if it is not a directory. |
| `open_in_editor` | `async (path: String, line?: u32, col?: u32, terminal: bool) -> Result<Option<String>>` | Opens a Ctrl+clicked file with `file_link_editor`; may return a command line for a terminal tab or pane to run instead. |
| `file_read` | `async (path: String) -> Result<{ path, text }>` | Reads a UTF-8 text file (max 8 MiB) for the built-in editor and allow-lists it for `file_write`. |
| `file_write` | `async (path: String, text: String) -> Result<()>` | Saves a file opened with `file_read` (no other path is writable); uploads it when it came from an ssh host. |
| `remote_file_fetch` | `async (id: u32, path: String) -> Result<{ local, label }>` | Copies a file from the ssh host the pane `id` runs into the cache; open the copy with `file_read`. |
| `save_text` | `(path: Option<String>, defaultName: String, text: String) -> Result<Option<String>>` | Writes exported text. With `path`: must be referenced by the config. Without: shows a save dialog. Returns the written path, or `null` when cancelled. |

### PTY

| Command | Rust signature (JS-visible args) | Purpose |
| --- | --- | --- |
| `pty_spawn` | `(opts: SpawnOptions, onData: Channel) -> Result<u32>` | Spawns a session owned by the calling window. `SpawnOptions` (camelCase): `profileId?`, `cwd?`, `inheritCwd?`, `commandline?`, `env?` (map), `cols`, `rows`. Profile lookup: `profileId` (id, then case-insensitive name), else `default_profile`, else the `shell` profile. Returns the session id. |
| `pty_detach` | `(id: u32) -> Result<u64>` | Stops output delivery before a hand-off; returns bytes delivered so far. Starts the 60 s reaper. |
| `pty_attach` | `(id: u32, onData: Channel) -> Result<AttachResult>` | Re-attaches to a live session or an orphan; replays the backlog. |
| `pty_write` | `(id: u32, data: String) -> Result<()>` | Queues input; never blocks. |
| `pty_resize` | `(id: u32, cols: u16, rows: u16) -> Result<()>` | Resizes the PTY (no-op after the child exited). |
| `pty_kill` | `(id: u32)` | Kills the child and drops any orphan. |
| `pty_cwd` | `(id: u32) -> Option<String>` | Foreground process cwd (Linux only, else `null`). |
| `pty_is_ssh` | `(id: u32) -> bool` | Whether the pane runs an interactive `ssh` session. |
| `pty_ssh_follow` | `(id: u32, dir?: String) -> Option<String>` | Command line reopening the pane's ssh session in `dir` (split / duplicate of an ssh pane). |
| `pty_ssh_resume` | `(id: u32, dir?: String) -> Option<String>` | Same for a session the pane was spawned with (reconnect, session restore). |

### Windows and application

| Command | Rust signature (JS-visible args) | Purpose |
| --- | --- | --- |
| `window_init` | `() -> InitInfo` | Detaches PTYs still owned by the calling window (a reloaded page lost its channels). Returns the init payload for the calling window: `{ id, name, transparent, payload, grid, launch_mode, center }`. |
| `window_new` | `async (payload: Value) -> Result<()>` | Creates a window with a payload (`actions` / `snapshot` / `position`). Async on purpose: creating a window from a sync command deadlocks on Windows (WebView2). |
| `window_send` | `async (target: String, payload: Value) -> Result<()>` | Delivers a payload to another window (`new`, `last`, id or name; excludes the caller). |
| `window_rename` | `(name: Option<String>)` | Sets/clears the calling window's name. |
| `window_at` | `(x: f64, y: f64) -> Option<String>` | Id (as string) of another visible window containing the logical screen point. |
| `identify_windows` | `()` | Emits `identify` to every window. |
| `session_save` | `(snapshot: Value)` | Stores the calling window's snapshot and rewrites `session.json` (when persisting). Ignored for the quake window. |
| `quit_app` | `()` | Asks every window for a final snapshot, then kills all PTYs and exits. |
| `summon` | `async (args: Summon)` | Show/hide/create a window. `Summon { name?, monitor?, dropdown_duration?, toggle_visibility? }`. |
| `minimize_to_tray` | `()` | Ensures the tray icon exists and hides the calling window. |
| `set_global_shortcuts` | `(shortcuts: Vec<{ keys: String, action: Value }>) -> Result<()>` | Registers OS-level shortcuts (quake mode, `global_summon` actions). |
| `cli_parse` | `(line: String) -> Result<{ window, actions }>` | Parses a command line (palette command-line mode, `wt` action). Relative `-d` resolved against the process cwd; no actions becomes `[new_tab]`. |

## Events and channels

Emitted by the backend:

| Event | Scope | Payload | Source |
| --- | --- | --- | --- |
| `config-changed` | all windows | `Config` | config watcher, `lib.rs` |
| `pty-exit` | all windows | `{ id: u32, code: Option<u32> }` | `pty.rs` waiter thread, only when a channel is attached |
| `window-payload` | one window | `{ actions?, snapshot?, position? }` | `windows::send` |
| `identify` | one window each | `String` | `windows::identify_all` |
| `persist` | one window each | none | `windows::quit` |

Channels (`tauri::ipc::Channel<InvokeResponseBody>`): one per PTY session, passed as `onData` to `pty_spawn` and `pty_attach`. Payloads are raw bytes (`InvokeResponseBody::Raw`). On attach the whole backlog is sent first as one message.

Environment variables read by the backend: `SHELL` (Unix) / `TERMINUX_SHELL` (Windows) for the default shell, `PATH` for generator detection, `APPIMAGE` and `WEBKIT_DISABLE_DMABUF_RENDERER` in `main.rs`.

## Plugins

Registered in `run()` (`src-tauri/src/lib.rs`), with the matching JS packages in `package.json`:

| Rust crate | Use |
| --- | --- |
| `tauri-plugin-single-instance` | Forwards a second invocation's argv/cwd to `second_instance`. |
| `tauri-plugin-opener` | `open_config`, `open_path`; the frontend opens links with `@tauri-apps/plugin-opener` (`openUrl`). |
| `tauri-plugin-notification` | Desktop notifications (OSC 9/777, bell while unfocused) via `@tauri-apps/plugin-notification`. |
| `tauri-plugin-clipboard-manager` | Copy/paste (`readText`, `writeText`, `writeHtml`) via `@tauri-apps/plugin-clipboard-manager`. |
| `tauri-plugin-dialog` | Save dialog in `save_text` (Rust only). |
| `tauri-plugin-global-shortcut` | `windows::set_shortcuts` (quake mode, `global_summon`). |
| `tauri-plugin-autostart` | `start_on_user_login` (`MacosLauncher::LaunchAgent`). |

Tauri features: `tray-icon` (tray) and `image-png` (tray icon image).

## Capabilities and CSP

See [architecture.md](architecture.md#security-model). When a new frontend call needs a Tauri core/plugin API (for example another `core:window:*` method), add its permission to `src-tauri/capabilities/default.json`; custom `#[tauri::command]` functions registered in `generate_handler!` need no entry there.

## See also

- [architecture.md](architecture.md): diagrams of IPC, PTY lifecycle, config reload, routing
- [frontend.md](frontend.md): how the frontend calls these commands
- [adding-features.md](adding-features.md#add-an-ipc-command): adding a command
- [testing.md](testing.md): Rust test modules
- [../reference/command-line.md](../reference/command-line.md)
- [../reference/file-locations.md](../reference/file-locations.md)
