# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.9] - 2026-11-23

### Added

- Belled panes blink their border until focused (split tabs), and the bottom border of their title bar
- `scrollbar_state = "auto"`: the scrollbar thumb shows only while scrolling back or hovering it
- `scrollbar_width` and `scrollbar_color` profile settings
- Horizontal wheel scrolling is reported to programs that capture the mouse (buttons 66/67)
- Bare dotfile names (`.bashrc`, `.gitignore:3`) in terminal output are Ctrl+clickable file links
- `notify_command_finished` (default 10 s): a shell-integrated command that ends unseen sends a notification, marks its tab and, when the window is unfocused, flashes the taskbar with a green/red full progress until focused
- `taskbar_attention`: `informational` (brief) or `critical` (until focused) taskbar flash; OSC 9 / OSC 777 notifications also flash the taskbar when unfocused
- OSC 9;4 progress shows as a thin line along the top of split panes and a ring on the pane title bar icon
- Vertical tabs: the title bar shows the active tab's icon with its bell and progress animations

### Changed

- Terminal scrollbar is thin with a transparent track and a thumb derived from the color scheme
- `Shift+wheel` scrolls like the plain wheel, and is reported with the Shift modifier to programs that capture the mouse
- `bell_style` defaults to `taskbar` instead of `none`
- Taskbar progress aggregates every tab of the window (error > paused > normal > indeterminate) instead of following the active tab
- Vertical tabs: the collapse button moved from the panel footer to its header; on the left, the panel spans the full window height with its header beside the title bar
- Vertical tabs: double-clicking the panel edge fits its width to the longest tab title instead of resetting to `vertical_tab_width`

### Fixed

- A bell while the window is unfocused now marks the active tab and pane too, and the indicator stays after refocusing until you type or switch panes

## [0.1.8] - 2026-11-19

### Added

- **Open file…** prompt completes paths while typing (local, or on the ssh host in an ssh pane): ↑/↓ select, Tab accepts the suggestion or the common prefix, Enter on a directory descends into it
- Right-click a pane title bar to move it (left/right/up/down), swap it, send it to another tab, a new tab or a new window, or zoom/rename/equalize/close
- Per-pane font zoom: `Ctrl+Alt+wheel`, or `increase_pane_font_size` / `decrease_pane_font_size` / `reset_pane_font_size` (`adjust_font_size` / `reset_font_size` with `pane = true`); follows the pane across tabs/windows and is saved with the session

### Changed

- Bell indicator is filled and swings like a ringing bell, and tabs with a bell softly pulse their background
- Startup notices (no output, spawn retries) show as a notification with a **Restart** button instead of being written into the terminal, and disappear once the shell prints
- Restored sessions mark the restore point with a full-width gray "[Restored <date>]" bar

### Fixed

- Terminal query replies (DSR, DA) sent before the shell's pty is ready are no longer dropped, so shells waiting on them don't hang at startup
- The command palette and dialogs keep keyboard focus when the window is refocused or a terminal grabs it
- Snippets pane now refreshes when `send_input` actions are added or changed in the config (no reopen needed)
- SSH panes launched with a remote shell command (e.g. `ssh -t host /path/zsh`) are detected as ssh: Ctrl+click copies files with scp, and split/reconnect keep that shell

## [0.1.7] - 2026-11-18

### Added

- Terminal and built-in file editor tabs can be moved into a pane of another tab: drag the tab onto a pane or right-click the tab > Show in a pane (unsaved editor edits follow)
- Command palette: "Recently used" section on top of the list, and an A–Z toggle (`Alt+S`) to sort commands alphabetically
- `open_file` action (palette: **Open file…**): open a typed `path[:line[:col]]` like a Ctrl+clicked file link, relative to the active pane's directory; `path` / `mode` arguments for `[[action]]`
- `file_link_open = "builtin_pane"`: Ctrl+clicked file paths (SSH ones too) open in the built-in editor as a split next to the clicked pane
- Built-in file editor: Markdown highlighting (with highlighted fenced code blocks), PHP, and ~30 more languages (Scala, Dart, R, Julia, Erlang, Clojure, OCaml, F#, LaTeX, Protobuf, Gherkin, Jinja…)
- Middle-click on a pane title bar closes the pane
- Built-in file editor: Ctrl+Q closes it (asks first if there are unsaved changes)

### Changed

- Settings shown as a pane use the settings UI too (not only the TOML editor), with the same Settings UI / TOML switch as the settings tab
- Documentation: screenshots are vector SVG (text stays sharp at any zoom, fonts embedded), regenerated with the 0.1.6 UI; new images for the settings UI, pane title bar, pane drag and the editor find panel
- Documentation: user guide, reference and developer docs checked against the code and brought up to date with 0.1.6

### Fixed

- Pane drop zone hint no longer clipped under the pane border on its right / bottom edge
- Pane keys (zoom, move focus, split, resize, swap…) now also work while the built-in file editor or settings pane has the focus
- Windows: saving a file from a WSL share (`\\wsl.localhost\...`) in the built-in editor failed with "path not found" (`UNC\...` path)

## [0.1.6] - 2026-11-18

### Added

- SSH panes: split / duplicate reconnects to the same host in the remote directory (`ssh_follow_directory`); reconnect and session restore resume there too
- SSH panes: Ctrl+clicked file paths open from the remote host in the built-in editor (copied with `scp`, uploaded back on save)
- Pane title bar (`show_pane_title_bar`): icon, title, zoom and close buttons; double-click or `open_pane_renamer` to rename a pane, `reset_pane_title` / `rename_pane` action
- Drag panes by their title bar: dock on a side of another pane, swap, move to another tab, a new tab or another window
- `move_pane_left` / `_right` / `_up` / `_down` (`Ctrl+Alt+Shift+Arrow`): move the active pane next to its neighbour or along the tab edge
- Settings UI: forms for global settings, profiles (generated ones too), color schemes, color overrides, UI themes (live preview, Try), key bindings, custom actions, new tab menu and toolbar; search, auto-save or draft with Save/Discard; edits keep `config.toml` comments and layout
- `open_settings_toml`, `open_settings_pane`: settings tab on the TOML editor, or the settings editor as a pane (also by dragging its tab onto a pane, or tab menu > Show in a pane)
- `[ui_theme]`: `colors` (interface palette), `pane` (divider, active border), `tab.foreground` / `unfocused_foreground` / `indicator` / `radius` / `height`, `window.font` / `font_size`
- `tab_title_ellipsis = "start"`: cut long tab titles on the left
- `[[new_tab_menu]]` `type = "action"` accepts built-in command names
- Color schemes: `cursor_accent`, `selection_foreground` in completion
- Jumping to a scroll mark briefly outlines its row in the mark's color
- CI: release builds attach a self-contained Linux AppImage (glibc ≥ 2.28), repacked from the deb

### Changed

- `customize_toolbar` opens Settings → Toolbar instead of the palette editor
- Default `config.toml` lists every setting: UI themes, new tab menu, all key bindings with their defaults, full scheme / color overrides
- Config and file editors: find / replace panel styled like the terminal search bar (match count, case / word / regex toggles, Ctrl+H for replace)
- Defaults now match the commented values in the default `config.toml`: `scrollback` / `history_size` 100000 (was 10000), `show_pane_title_bar = "multiple"` (was `"never"`), Terminux scheme `selection_foreground = "#ffffff"`
- `cursor_height` removed from the default config and settings UI (accepted but ignored: the terminal engine draws a fixed-size underline)
- `open_snippets_pane` renamed `toggle_snippets_pane` (old name still accepted): a tab has at most one snippets pane, running the action again closes it; it opens at 20% width (`size` overrides) and has a close button in its header

### Fixed

- Reloading the page (e.g. F5 / devtools) keeps the window's tabs and their running shells instead of losing them
- The webview's native context menu no longer appears on right-click (still available in text fields)
- Maximized / fullscreen windows: no frame, and a pointer at the screen's top edge hits the tabs
- Vertical tabs: a pointer at the screen's side edge hits the tabs (maximized / fullscreen)
- Default `config.toml`: wrong default key bindings in comments, wrong default `font_family` stack in comments
- Windows: holding Ctrl+Plus / Ctrl+Minus (font zoom) no longer crashes the app (zoom steps coalesced per frame, pty resizes debounced and run off the main thread)

## [0.1.5] - 2026-11-16

### Fixed

- Config editor: emoji in the completion list rendered as empty boxes on systems without a color emoji font (the list now uses the editor font stack with the bundled Twemoji)

## [0.1.4] - 2026-11-16

### Added

- `Ctrl+Up` / `Ctrl+Down` default keys for `scroll_to_previous_mark` / `scroll_to_next_mark` (jump between commands, like VS Code)

### Fixed

- Arrow keys, Home/End, PgUp/PgDn and other named keys matched by keysym instead of scancode, so bindings work on X servers with legacy XFree86 keycodes (Citrix, Xvnc), where Down was reported as `NumpadEnter`
- `scroll_to_previous_mark` from the bottom jumps to the start of the last command instead of skipping prompts visible on screen, and no longer gets stuck when marks fit on the last screen

## [0.1.3] - 2026-11-16

### Added

- Ctrl+click on file paths in terminal output opens them at the given line in a built-in editor tab (`detect_file_paths`)
- `file_link_open`: open them in an external editor (`file_link_editor`), a terminal tab or split pane instead
- "Copied to clipboard" toast on copy (`copy_feedback`)
- Config editor: `icon` completion offers built-in icon names and emoji searchable by name
- Config editor: color swatch before hex values opens the system color picker
- `emoji_font`: color emoji font tried before the bundled Twemoji (default: system emoji font)
- Settings editor tabs can be moved to another window (drag out, `move_tab_to_new_window`, tab menu)
- Hover tooltip on URLs and file links
- Windows portable exe uploaded to the GitHub release

### Changed

- URLs and OSC 8 hyperlinks open on Ctrl+click (Cmd+click on macOS) instead of a plain click
- Duplicated panes/tabs start in the source pane's directory even when the profile sets `starting_directory`
- WSL profiles: an inherited Linux directory is passed through `wsl.exe --cd`
- System color emoji font preferred over Twemoji in the terminal and profile icons
- Vertical tabs: new-tab buttons moved below the tab list
- Tabs: taller horizontal tabs, colored tab outline matches its color, readable text on concrete tab backgrounds
- Default config: split examples use `duplicate_pane_right` / `duplicate_pane_down`

## [0.1.2] - 2026-11-14

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

[Unreleased]: https://github.com/MickaelBlet/terminux/compare/v0.1.9...HEAD
[0.1.9]: https://github.com/MickaelBlet/terminux/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/MickaelBlet/terminux/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/MickaelBlet/terminux/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/MickaelBlet/terminux/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/MickaelBlet/terminux/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/MickaelBlet/terminux/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/MickaelBlet/terminux/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/MickaelBlet/terminux/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/MickaelBlet/terminux/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/MickaelBlet/terminux/releases/tag/v0.1.0
