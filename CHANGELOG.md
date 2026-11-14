# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Rust tests failing on Windows (`cli::tests::errors_and_dirs` path separator, `config::tests::profile_example_is_valid` profile filtered by `os`)
- CI release creation denied: grant `contents: write` to the build workflow

## [0.1.1] - 2026-11-14

### Added

- `CHANGELOG.md`

### Changed

- Agent guidance moved from `CLAUDE.md` to `AGENTS.md`; `CLAUDE.md` now imports it

## [0.1.0] - 2026-11-14

Initial release: Tauri v2 + Svelte 5 terminal multiplexer with Windows
Terminal feature parity (action names, settings and default keys follow
Windows Terminal, in snake_case).

### Added

#### Tabs

- New tab (default profile, profile 1..9, `new_tab` with `profile`, `index`, `commandline`, `starting_directory`, `tab_title`, `tab_color`, `color_scheme`, `suppress_application_title`), duplicate tab
- Close tab, close other tabs, close tabs to the right, restore last closed tab (`restore_last_closed`)
- Rename (`open_tab_renamer`, `rename_tab`, `reset_tab_title`), color (`open_tab_color_picker`, `set_tab_color`, `reset_tab_color`)
- Switch: next / previous, tab 1..8, last tab, `switch_to_tab`; MRU switcher (`tab_switcher_mode`), tab search (`tab_search`)
- Reorder by drag or `move_tab_forward` / `move_tab_backward` / `move_tab`
- Tear out to a new window, drop on another window, `move_tab_to_new_window`
- Progress ring on tab and taskbar (OSC 9;4)
- Tab width modes; vertical tabs on the left or right (`tab_position`), resizable and collapsible (`toggle_vertical_tabs`, `toggle_vertical_tabs_collapsed`)

#### Panes

- Split in any direction with optional size (`split_pane`, `split_pane_left/right/up/down`), duplicate pane (right / down / auto)
- Close pane, close other panes, equalize panes
- Focus by direction, previous (MRU), creation order, first, parent, child (`move_focus_*`)
- Resize (`resize_pane_*`), swap (`swap_pane_*`, by direction, MRU or order)
- Zoom pane or subtree (`toggle_pane_zoom`), toggle split orientation
- Move pane to tab 1..9, to a new tab or a new window (`move_pane`)
- Read-only mode, broadcast input to all panes of a tab
- Restart connection after the process exited (`restart_connection`)
- Snippets pane (`open_snippets_pane`, `save_snippet`)

#### Windows

- Multiple windows, `new_window`, rename / identify window(s), close window, quit
- Fullscreen, focus mode (tab bar hidden), always on top
- `launch_mode`, `initial_cols` / `initial_rows`, `initial_position`
- `windowing_behavior` and `-w` targeting (id, name, `new`, `last`, `0`, `-1`)
- Session restore, on by default (`first_window_preference`); periodic session save
- Quake mode and `global_summon` via global shortcuts (Win+` by default)
- Tray icon, minimize to tray, autostart, headless mode
- Acrylic / opacity background (`adjust_opacity`, `increase_opacity`, `decrease_opacity`)

#### Profiles and appearance

- `[defaults]` and `[[profile]]` settings: command line, starting directory, environment, tab title / color, close on exit, path translation
- Generated profiles: WSL distributions, SSH hosts, PowerShell, cmd
- Config fragments in `fragments/*.toml`; portable mode (`.portable` next to the binary)
- Customizable `new_tab_menu` (`open_new_tab_dropdown`)
- 17 built-in color schemes (Terminux, Campbell, Campbell Powershell, Vintage, One Half Dark / Light, Solarized Dark / Light, Tango Dark / Light, Dark+, VSCode Dark / Light Modern, CGA, IBM 5153, Ottosson, Dimidium), custom `[[scheme]]`, per-color overrides in `[theme]`, `set_color_scheme`
- Font face, weight, cell size, ligatures, font features; font size actions and Ctrl+wheel
- Cursor shape / color, padding, background image, retro effect (`toggle_shader_effects`)
- `unfocused_appearance` overrides for inactive panes
- Bell style and custom bell sound
- UI theme options for the window chrome
- Renderer choice: WebGL, canvas or DOM
- Bundled fonts: JetBrains Mono, Symbols Nerd Font Mono, Twemoji Mozilla, Noto Sans Symbols / Symbols 2 / Math

#### Text, selection and clipboard

- Copy (plain, HTML, ANSI, single line), paste, select all
- Mark mode (keyboard selection), block selection, switch selection endpoint, expand selection to word
- Paste warnings (multi-line, large) and filtering; Shift+Enter newline; Ctrl+V with an image passes through to the application
- OSC 52 clipboard writes (opt-in `osc52_clipboard`); clipboard reads never answered
- Highlight selection (`color_selection`, `clear_color_selection`), search the web, context menu
- File drag & drop pastes paths
- Clickable URLs and OSC 8 hyperlinks; Sixel and iTerm inline images

#### Search, scrolling and marks

- Find with regex, case sensitivity, whole word and match count (`find`, `find_next`, `find_prev`, `find_match`)
- Scroll by line / page / top / bottom
- Clear buffer, screen or scrollback; export buffer to a file
- Scroll marks: add, clear, clear all, jump to previous / next / first / last (`scroll_to_mark`)

#### Shell integration

- OSC 133 (FinalTerm) and OSC 633 (VS Code) command marks with exit status colors
- Select command / output (previous / next)
- Working directory tracking (OSC 7, OSC 9;9, OSC 633;P) for new splits and `open_cwd`
- Recent command suggestions (`show_suggestions`, `show_recent_commands`)
- Click on the prompt line to move the cursor
- Setup instructions for bash, zsh, fish, PowerShell, cmd

#### Notifications

- Desktop notifications from OSC 9, OSC 777 and the bell (`notifications`)
- `TERM=xterm-256color`, `COLORTERM=truecolor`, `TERM_PROGRAM=terminux`, `TERM_PROGRAM_VERSION`

#### Command palette and actions

- Command palette with nested menus and key hints (`command_palette`)
- Command-line mode: delete the leading `>` to run `wt`-style commands
- `[[action]]` custom actions: `send_input`, `multiple_actions`, `wt`, any named command with arguments, optional keys and icons
- `[keys]` overrides (single combo, list, or `""` to unbind); pre-parity names accepted via `LEGACY_NAMES`
- Windows Terminal default key bindings
- Customizable title-bar toolbar (`toolbar`), editable by right-click or drag (`customize_toolbar`)
- About dialog (`open_about`)

#### Command line

- `wt.exe`-compatible syntax: `terminux [options] [command ; command ...]`
- Global options: `-h`, `-M`, `-F`, `-f`, `--pos`, `--size`, `-w`
- Subcommands: `new-tab`, `split-pane`, `focus-tab`, `move-focus`, `move-pane`, `swap-pane`
- Second invocations routed to an existing window per `windowing_behavior`

#### Configuration

- `config.toml` in `~/.config/terminux/` (Windows: `%APPDATA%\terminux\`), hot-reloaded on change
- Built-in CodeMirror editor with completion and validation (Ctrl+,), settings file (Ctrl+Shift+,), read-only defaults (Ctrl+Alt+,), settings directory
- Commented `default_config.toml`

#### Build and distribution

- Docker builds: Linux deb, rpm, AppImage (runs on glibc ≥ 2.28); Windows NSIS installer and portable exe (cross-compiled with cargo-xwin)
- GitHub Actions workflow on `v*` tags: vitest, cargo test, tauri-action on Ubuntu 22.04 and Windows

#### Documentation

- User guide (17 chapters), reference (configuration, profile settings, actions, key bindings, command line, color schemes, file locations, escape sequences, annotated example config), developer docs (architecture, frontend, backend, adding features, testing, building and release, contributing)

### Not implemented

- No equivalent in Tauri / xterm.js: OS default terminal, elevation, jump list, HLSL shaders, ClearType settings, snap to grid on resize, AltGr aliasing, localization

[Unreleased]: https://github.com/MickaelBlet/terminux/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/MickaelBlet/terminux/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/MickaelBlet/terminux/releases/tag/v0.1.0
