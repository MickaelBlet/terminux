# Architecture

Terminux is a Tauri v2 application: a thin Rust backend owns processes, the config file and native windows, and a Svelte 5 (SvelteKit, SPA through `adapter-static`) frontend renders everything else with xterm.js. This page shows how the pieces fit together, with diagrams of the IPC surface, the PTY lifecycle, tab tear-out, config hot reload and window routing.

## Contents

- [Component overview](#component-overview)
- [Process and window model](#process-and-window-model)
- [IPC: commands, channels, events](#ipc-commands-channels-events)
- [PTY lifecycle](#pty-lifecycle)
- [Tab tear-out between windows](#tab-tear-out-between-windows)
- [Config load, merge, watch, hot reload](#config-load-merge-watch-hot-reload)
- [Window routing](#window-routing)
- [Startup sequence](#startup-sequence)
- [Security model](#security-model)
- [See also](#see-also)

## Component overview

```mermaid
flowchart LR
  subgraph Backend["Backend (src-tauri/src, Rust)"]
    lib["lib.rs<br/>AppState, IPC commands,<br/>startup, config watcher"]
    cli["cli.rs<br/>wt-style command line"]
    config["config.rs<br/>config.toml, fragments,<br/>portable mode"]
    dyn["dynamic_profiles.rs<br/>WSL, SSH, PowerShell, cmd"]
    pty["pty.rs<br/>PtyManager (portable-pty)"]
    win["windows.rs<br/>create, route, quake,<br/>tray, shortcuts"]
    store["session_store.rs<br/>session.json"]
    patch["toml_patch.rs<br/>settings UI edits"]
    files["editor.rs, ssh.rs,<br/>remote_files.rs<br/>file links, ssh panes"]
    lib --> cli
    lib --> config
    config --> dyn
    lib --> pty
    lib --> win
    lib --> patch
    lib --> files
    files --> pty
    win --> store
  end

  subgraph Frontend["Frontend (src/, Svelte 5, one webview per window)"]
    page["routes/+page.svelte"]
    app["state.svelte.ts<br/>App store"]
    pipeline["commands.ts - keys.ts - actions.ts"]
    tree["layout/tree.ts"]
    term["term/session.ts<br/>TermSession (xterm.js)"]
    wins["windows.ts + snapshot.ts"]
    settings["settings/*.ts<br/>ui/settings/*.svelte"]
    ui["ui/*.svelte"]
    page --> app
    page --> ui
    ui --> settings
    app --> pipeline
    app --> tree
    app --> term
    app --> wins
  end

  Frontend <-->|"invoke / Channel / events"| Backend
  term <-->|"raw bytes (Channel)"| pty
  OS[("OS: PTYs, windows,<br/>tray, global shortcuts")] <--> Backend
  Disk[("config.toml<br/>fragments/*.toml<br/>session.json")] <--> Backend
```

Division of labour:

| Concern | Owner |
| --- | --- |
| Spawning and killing processes, byte streaming | Backend (`pty.rs`) |
| Parsing `config.toml`, merging fragments and generated profiles, hot reload | Backend (`config.rs`, `dynamic_profiles.rs`, watcher in `lib.rs`) |
| Interpreting appearance, keys, actions, menus, toolbar | Frontend (the backend passes unknown keys through untouched) |
| Creating, routing and persisting windows | Backend (`windows.rs`, `session_store.rs`) |
| Comment-preserving edits of `config.toml` for the settings UI | Backend (`toml_patch.rs`), driven by `src/lib/settings/` |
| Opening Ctrl+clicked file paths, ssh pane detection, remote file copies | Backend (`editor.rs`, `ssh.rs`, `remote_files.rs`) |
| Tabs, panes, focus, closed-tab history | Frontend (`App` in `state.svelte.ts`) |
| Terminal emulation, selection, search, OSC handling | Frontend (xterm.js in `TermSession`) |
| `wt`-style command line parsing | Backend (`cli.rs`), also exposed to the palette via `cli_parse` |

Every window is its own webview running its own copy of the frontend, so each window has its own `App` instance. The only shared state is in the Rust `AppState` (config, `PtyManager`, `Windows`).

## Process and window model

`tauri.conf.json` declares `"windows": []`: no window is created from configuration. `windows::create` builds every window (`WebviewWindowBuilder`, label `w<N>`, `decorations(false)` because the frontend draws its own title bar, `visible(false)` until the frontend sized it). A 5 second failsafe thread shows the window anyway if the frontend never does.

```mermaid
flowchart TB
  subgraph Process["terminux process (single instance)"]
    state["AppState<br/>config: Mutex&lt;Config&gt;<br/>pty: PtyManager<br/>windows: Mutex&lt;Windows&gt;"]
    w1["window w1 (webview)<br/>App instance"]
    w2["window w2 (webview)<br/>App instance"]
    q["window _quake (optional)<br/>named _quake"]
  end
  child1["child process"]
  child2["child process"]
  w1 <--> state
  w2 <--> state
  q <--> state
  state --- child1
  state --- child2
  second["second `terminux` invocation"] -->|"single-instance plugin<br/>second_instance()"| Process
```

The `tauri-plugin-single-instance` plugin forwards a second invocation's argv and cwd to the running process (see [Window routing](#window-routing)).

## IPC: commands, channels, events

Three mechanisms are used. The complete command list is in [backend.md](backend.md#ipc-commands).

1. **Commands** (`invoke("name", args)`), registered in `generate_handler!` in `src-tauri/src/lib.rs`.
2. **Channels**: `pty_spawn` / `pty_attach` take a `Channel<InvokeResponseBody>` (`onData` on the JS side). The reader thread pushes raw bytes (`InvokeResponseBody::Raw`) into it.
3. **Events** emitted by the backend: `config-changed`, `pty-exit`, `window-payload`, `identify`, `persist`.

```mermaid
sequenceDiagram
  participant UI as Svelte (TermSession)
  participant IPC as Tauri IPC
  participant PM as PtyManager
  participant R as pty-read thread
  participant W as pty-write thread
  participant P as child process

  UI->>IPC: invoke pty_spawn { opts, onData: Channel }
  IPC->>PM: spawn(profile, cwd, env, cols, rows)
  PM->>P: openpty + spawn_command
  PM-->>UI: session id (u32)
  loop output
    P-->>R: bytes (64 KiB reads)
    R-->>UI: Channel.send(Raw bytes)
    UI->>UI: term.write(bytes)
  end
  UI->>IPC: invoke pty_write { id, data }
  IPC->>PM: write (queued, never blocks)
  PM->>W: mpsc send
  W->>P: write_all + flush
  UI->>IPC: invoke pty_resize { id, cols, rows }
  P-->>UI: event pty-exit { id, code } (when the process ends while attached)
```

Notes on the data path:

- Input goes through an unbounded mpsc queue drained by a dedicated writer thread, so a child that stops reading its tty cannot freeze the UI thread (`PtyManager::write` never blocks).
- Output is read in 64 KiB chunks and sent as a raw binary payload; the frontend wraps it in `Uint8Array` and calls `term.write`.
- `pty_write` takes a `String`, so input is UTF-8 text (xterm's `onData` and `onBinary` both go through `TermSession.input`).

The backend-to-frontend events:

| Event | Emitted by | Target | Payload | Handled in |
| --- | --- | --- | --- | --- |
| `config-changed` | config watcher (`lib.rs`) | all windows (`app.emit`) | full `Config` | `App.init` -> `setConfig` |
| `pty-exit` | pty waiter thread | all windows (`app.emit`) | `{ id, code }` | `App.init` -> `onPaneExit` |
| `window-payload` | `windows::send` | one window (`emit_to`) | `Payload` (`actions`, `snapshot`, `position`) | `windows.ts` `applyPayload` |
| `identify` | `windows::identify_all` | each window | text (`"<id>"` or `"<id>: <name>"`) | `windows.ts` `showIdentify` |
| `persist` | `windows::quit` | each window | none | `windows.ts` `saveSession` |

## PTY lifecycle

A session lives in `PtyManager.sessions` (`HashMap<u32, Session>`); a session that exited while detached moves to `PtyManager.orphans`. The `Sink` holds the output `Channel`, a backlog buffer and a `sent` byte counter.

```mermaid
stateDiagram-v2
  [*] --> Attached: pty_spawn<br/>(channel set, owner = window label)
  Attached --> Attached: output -> Channel.send<br/>(sent += len)
  Attached --> Detached: pty_detach<br/>(channel = None, owner = "",<br/>detach_gen += 1, reaper started)
  Detached --> Detached: output -> backlog<br/>(capped at 8 MiB, oldest bytes dropped)
  Detached --> Attached: pty_attach<br/>(backlog replayed to new channel,<br/>sent = backlog length)
  Detached --> Reaped: 60 s without attach<br/>(same detach_gen): killer.kill(),<br/>reaped = true
  Detached --> Orphan: process exits while detached<br/>(not reaped): backlog + exit code kept
  Orphan --> Attached: pty_attach -> { exited: true, code }<br/>backlog replayed, orphan removed
  Orphan --> [*]: reaper after 60 s,<br/>or pty_kill
  Reaped --> [*]: no orphan kept
  Attached --> Exited: process exits while attached<br/>(emit pty-exit { id, code })
  Exited --> [*]
  Attached --> [*]: pty_kill / window destroyed<br/>(kill_owned) / app exit (kill_all)
```

Details, all in `src-tauri/src/pty.rs`:

- **Constants**: `BACKLOG_MAX = 8 MiB`, `DETACH_TIMEOUT = 60 s`, `DRAIN_TIMEOUT = 500 ms`.
- **Threads per session**: `pty-write-<id>` (input queue), `pty-read-<id>` (64 KiB read loop into the `Sink`), `pty-wait-<id>` (waits for the child, then retires the session), and a short-lived `pty-reap-<id>` per detach.
- **Detach** (`pty_detach`) clears the owner and the channel and returns `sent`, the number of bytes already delivered to the old channel. The frontend waits (up to 500 ms) until it has received that many bytes before serializing the terminal, so no output is lost across a hand-off.
- **Attach** (`pty_attach`) works for a live session (`{ exited: false }`) and for an orphan (`{ exited: true, code }`). It holds the `sessions` lock while looking up orphans, because the exit path moves a session to `orphans` under the same lock.
- **Exit path**: on exit the waiter drops the master and the writer queue (this unblocks the reader on Windows/ConPTY), waits up to `DRAIN_TIMEOUT` for trailing output, then removes the session. If a channel is still attached it emits `pty-exit`; otherwise (and unless the reaper killed it) it stores an `Orphan`.
- **Reaper**: after `DETACH_TIMEOUT` it only acts if the session still has no owner and `detach_gen` is unchanged (a later detach/attach cycle cancels it logically). If the session is gone it drops the matching orphan.
- **Window destruction**: `on_window_event(Destroyed)` calls `kill_owned(label)`. Because `detach` clears the owner, sessions in flight between windows survive the source window closing.
- **Broken channel**: if `Channel.send` fails (webview gone), the sink drops the channel and starts buffering.

## Tab tear-out between windows

Dragging a tab out of the tab strip (or running `move_tab` / `move_pane` with a `window` argument) serializes the tab, detaches its PTYs, and recreates it in another window, which re-attaches to the same processes.

```mermaid
sequenceDiagram
  participant Src as Source window
  participant BE as Backend (Rust)
  participant Dst as Target window

  Src->>Src: TabDrag.up(): pointer outside the tab strip
  Src->>BE: invoke window_at { x, y } (screen point)
  BE-->>Src: id of the window under the cursor, or null
  Src->>Src: moveTabToWindow(): captureTab(live = true)
  loop each pane of the tab
    Src->>BE: invoke pty_detach { id }
    BE-->>Src: sent (bytes already delivered)
    Src->>Src: wait until received >= sent (max 500 ms),<br/>flush xterm, serialize buffer
  end
  Src->>Src: detachTab(): dispose panes without killing
  alt target is an existing window
    Src->>BE: invoke window_send { target, payload }
    BE->>Dst: emit_to "window-payload" + unminimize/show/focus
  else target is "new" (no window under the cursor)
    Src->>BE: invoke window_new { payload } (position = drop point)
    BE->>Dst: windows::create(payload)
    Dst->>BE: invoke window_init
    BE-->>Dst: InitInfo { payload, ... } (taken from `pending`)
  end
  Dst->>Dst: applyPayload(): adoptTab(snapshot)
  Dst->>BE: invoke pty_attach { id, onData } for each pane
  BE-->>Dst: backlog replay (+ AttachResult)
  Dst->>BE: invoke pty_resize
  Note over Src,Dst: If the send fails, handOff() re-adopts the tab in the source window (the PTYs re-attach there) and shows a toast.
```

The snapshot types (`PaneSnapshot`, `TabSnapshot`, `WindowSnapshot`) live in `src/lib/snapshot.ts`. The same capture/adopt machinery powers undo-close (`restore_last_closed`), duplicate tab, and session persistence; only `live = true` hands over PTYs, the others store the serialized buffer and start a fresh process.

## Config load, merge, watch, hot reload

```mermaid
flowchart TD
  start["config::load()"] --> ensure["ensure_file():<br/>if config.toml is missing, write<br/>default_config.toml + generated profiles"]
  ensure --> read["read config.toml"]
  read --> ok{"parses?"}
  ok -- yes --> parsed["Config::parse(src)<br/>typed spawn fields + flatten extra<br/>normalize(): os filter, 'shell' profile,<br/>[defaults] cwd/env/login_shell into profiles"]
  ok -- no --> defaults["Config::defaults()<br/>error = 'path: message'"]
  parsed --> ext["Config::extend(dir)"]
  defaults --> ext
  ext --> frag["load_fragments(dir/fragments)<br/>*.toml sorted by path:<br/>new profile ids (source = fragment:name),<br/>all [[scheme]] and [[action]]"]
  frag --> dyn["dynamic_profiles::all()<br/>skip disabled_profile_sources;<br/>same id as a user profile: inherit() fills gaps;<br/>else append"]
  dyn --> state["AppState.config"]
  state --> get["get_config (frontend init)"]

  watch["notify watcher on config dir (recursive)"] --> rel{"config.toml or a file<br/>under fragments/ ?<br/>modify / create / remove"}
  rel -- yes --> reload["config::load()"]
  reload --> store["replace AppState.config"]
  store --> sys["windows::apply_system_settings:<br/>tray icon, autostart"]
  sys --> emit["emit config-changed(Config)"]
  emit --> fe["every window: App.setConfig()<br/>keymap, user actions, theme,<br/>TermSession.applyConfig for each pane"]
```

Points worth knowing:

- Portable mode: `config_dir()` returns `<exe dir>/settings` if a `.portable` file sits next to the executable. `state_dir()` (the `session.json` location) follows the same directory in that case.
- A fragment contributes profiles (only ids not already defined), `[[scheme]]` and `[[action]]` entries. Other fragment keys (root settings, `[defaults]`, `[keys]`) are parsed but ignored. An invalid fragment is skipped with a message on stderr.
- The watcher is created in `setup` and kept alive via `app.manage(Mutex<RecommendedWatcher>)`. It creates `fragments/` if needed.
- The settings tab has two views of one draft (`src/lib/settings/doc.svelte.ts`). The TOML editor uses `read_config` -> edit -> `validate_config` -> `write_config`. The settings UI reads the raw document with `config_parse`, turns each edit into `PatchOp`s and applies them to the draft text with `config_patch`, so comments survive; auto-save then calls `write_config`. Saving triggers the watcher like any external edit, and a change on disk while the draft is dirty is reported (`changedOnDisk`).
- Some settings only take effect at window creation (transparency, `always_on_top`); the frontend warns with `transparencyHint`.

## Window routing

Routing decides which window receives actions from a command line. It runs in two places: first launch (`open_initial_windows`) and every later invocation (`second_instance`).

```mermaid
flowchart TD
  inv["terminux [options] [commands]<br/>(second invocation)"] --> sp["single-instance plugin<br/>second_instance(argv, cwd)"]
  sp --> parse["cli::parse(argv[1..]); resolve_dirs(cwd);<br/>no actions -> [new_tab]"]
  parse --> tgt{"-w given?"}
  tgt -- yes --> t["target = -w value"]
  tgt -- no --> wb{"windowing_behavior<br/>(lowercased, _ and - removed)"}
  wb -- "useexisting / useanyexisting" --> last["target = 'last'"]
  wb -- "anything else / unset" --> new["target = 'new'"]
  t --> dec
  last --> dec
  new --> dec
  dec{"target"}
  dec -- "'new' or '-1'" --> create["windows::create(payload, launch flags)"]
  dec -- "'last' and no other window" --> create
  dec -- "otherwise" --> send["windows::send(target, payload)"]
  send --> res{"resolve(target)"}
  res -- "'last' or '0'" --> mru["most recently focused window<br/>(not the quake window)"]
  res -- "numeric id or name" --> byid["window with that id or name"]
  res -- "no match" --> createnamed["create a window; the target becomes its name<br/>(unless numeric, 'last' or '0')"]
  mru --> emit["emit_to 'window-payload' + unminimize, show, set_focus"]
  byid --> emit
```

First launch (`open_initial_windows`):

1. Parse argv. A parse error is printed and an empty `Cli` used. `-h`/`--help`/`-?`/`/?` is detected earlier in `run()`, prints `cli::HELP` and exits (on Windows it first calls `AttachConsole`).
2. If the command line carries actions, open one window with them (launch flags `--maximized`, `--fullscreen`, `--focus`, `--size`, `--pos` apply; `-w <name>` names the window unless it is `new`, `-1`, `0`, `last` or numeric).
3. Otherwise, if `first_window_preference` is `persisted_window_layout` (the default) and `session.json` has windows, recreate each one with its snapshot and saved bounds.
4. Otherwise run `startup_actions` (a command-line string parsed with `cli::parse_line`) in a single window.

Window identity inside `Windows`: numeric `id` (1, 2, ...), label `w<id>`, optional `name` (`rename`, `-w <name>`, or the reserved `_quake`), and an MRU list of labels updated on focus.

## Startup sequence

```mermaid
sequenceDiagram
  participant M as main.rs
  participant L as lib.rs run()
  participant C as config::load
  participant W as windows::create
  participant F as Frontend (+page.svelte)

  M->>M: Linux: WEBKIT_DISABLE_DMABUF_RENDERER=1 (unless set);<br/>AppImage: unset GTK_MODULES
  M->>L: terminux_lib::run()
  L->>L: --help? print and return
  L->>C: manage(AppState { config: load(), ... })
  L->>L: plugins: single-instance, opener, notification,<br/>clipboard-manager, dialog, global-shortcut, autostart
  L->>L: setup: watch_config, apply_system_settings
  L->>W: open_initial_windows(args)
  W-->>F: hidden window loads index.html
  F->>L: window_init -> InitInfo (payload, grid, launch_mode, center)
  F->>L: get_config, listen config-changed / pty-exit
  F->>F: applyPayload (snapshot / actions), else newTab()
  F->>W: show window, size to grid, apply launch mode
```

## Security model

- **CSP** (`tauri.conf.json`): `default-src 'self'`; scripts from self only (dev CSP additionally allows inline scripts and `ws://localhost:1420`); `connect-src` limited to self and the Tauri IPC origins; no frames, objects or forms.
- **Capabilities** (`src-tauri/capabilities/default.json`, applied to all windows): `core:default`, a hand-picked list of `core:window:*` permissions (dragging, resize dragging, minimize, maximize, close, destroy, show/hide, focus, fullscreen, always-on-top, size, position, center, title, progress bar, user attention), `opener:default`, `notification:default`, and clipboard `allow-read-text`, `allow-write-text`, `allow-write-html`. Dialog, global-shortcut and autostart are only driven from Rust and need no frontend permissions.
- **File IPC is allow-listed**: `read_binary` and `save_text` (with an explicit path) only accept paths that appear as string values somewhere in the loaded config (`referenced_by_config`), so a compromised webview cannot read arbitrary files. `read_binary` also caps files at 64 MiB. `open_path` only opens directories. The built-in editor can only write files it read first (`file_read` records them in `OpenFiles`, `file_write` refuses others), `open_in_editor` takes its program from `file_link_editor` in the config, and ssh and `scp` arguments are derived from a command the user launched in that pane, never from the webview.
- **OSC 52** clipboard writes are off by default (`osc52_clipboard`) and reads are never answered.

## See also

- [backend.md](backend.md): modules, every IPC command, plugins
- [frontend.md](frontend.md): App store, action pipeline, TermSession
- [adding-features.md](adding-features.md): step-by-step extension recipes
- [contributing.md](contributing.md): conventions and project layout
- [../reference/file-locations.md](../reference/file-locations.md): where config, fragments and the session file live
- [../user-guide/05-windows.md](../user-guide/05-windows.md): user-facing view of windows, `-w` and sessions
