# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Terminux: Tauri v2 + Svelte 5 (SvelteKit, SPA via adapter-static) terminal multiplexer with Windows Terminal feature parity. See README.md for the feature list, CLI syntax and default keys.

## Commands

```sh
npm install
npm run tauri dev                                   # run app (Vite on fixed port 1420)
npm run check                                       # svelte-check / TypeScript
npx vitest run                                      # frontend tests
npx vitest run src/lib/layout/tree.test.ts          # single test file (-t "<name>" for one test)
cargo test --manifest-path src-tauri/Cargo.toml     # Rust tests (add a test name filter for one)
scripts/build-linux.sh | build-windows.sh | docker-build.sh   # packaged builds in Docker → dist/
```

CI (`.github/workflows/build.yml`, on `v*` tags) runs vitest + cargo test, then tauri-action on Ubuntu 22.04 and Windows.

## Architecture

**Backend (`src-tauri/src/`)** — thin; owns processes, config file, windows. All IPC commands are registered in `lib.rs` (`generate_handler!`).
- `pty.rs`: `PtyManager` (portable-pty). Output streams over a Tauri `Channel` per session. Sessions can be **detached** (output buffered in a backlog, up to 8 MB) and **re-attached** by another window — this is how tabs/panes move between windows. Sessions exiting while detached become orphans holding backlog + exit code.
- `config.rs`: parses `config.toml`. Only spawn-related fields are typed; everything else passes through in `#[serde(flatten)] extra` and is interpreted by the frontend. Merges `fragments/*.toml` and generated profiles (`dynamic_profiles.rs`: WSL, SSH, PowerShell, cmd). Portable mode via `.portable` next to the exe. File is watched (notify) and hot-reloaded. Defaults: `default_config.toml`.
- `windows.rs`: window creation (launch mode/size/position, acrylic), per-window init payload, routing (`windowing_behavior`, `-w` target resolution), quake mode, global shortcuts, tray, session persistence (`session_store.rs`).
- `cli.rs`: parses `wt.exe`-style command lines into action lists (also used by the palette's command-line mode via `cli_parse`).

**Frontend (`src/lib/`)**
- `state.svelte.ts`: `App` class — the central runes-based store (tabs, panes, focus, keymap, closed-tab history, overlays). Most features route through it.
- Action pipeline: `commands.ts` (pure data: named commands, WT snake_case names, default keys, legacy aliases) → `keys.ts` (`Keymap`) → `actions.ts` (`ACTIONS[command]` handlers; return `false` to let the key reach the terminal). User `[[action]]` entries and CLI/palette commands produce the same `ActionSpec` objects. Adding an action = entry in `COMMANDS` + handler in `ACTIONS` (+ schema in `config-schema.ts` if it takes config).
- `layout/tree.ts`: pure split-tree operations for panes (tested).
- `term/session.ts`: `TermSession` wraps xterm.js + addons and a backend PTY; talks to `App` via `SessionHooks`. `term/appearance.ts` resolves profile/defaults/scheme/`unfocused_appearance` into xterm options; `osc.ts`, `term/shell-integration.ts`, `term/marks.ts`, `term/markmode.ts` handle OSC parsing, command marks, keyboard selection.
- `windows.ts` + `snapshot.ts`: multi-window behavior, tab tear-out/move (serialize tab → payload → other window re-attaches PTYs), periodic session save.
- `config.ts` / `config-schema.ts`: frontend config types/defaults and the schema powering the built-in CodeMirror editor (`ui/ConfigEditor.svelte`) completion and lint. Keep the schema in sync when adding config keys.
- `ui/`: Svelte components (TabBar, SplitView, TerminalPane, Palette, Overlays…); `routes/+page.svelte` mounts the app.

## Conventions

- Action names, config keys and default keys follow Windows Terminal, in snake_case; old names stay accepted via `LEGACY_NAMES`.
- Config path: `~/.config/terminux/config.toml` (Windows: `%APPDATA%\terminux\config.toml`).
