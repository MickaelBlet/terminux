# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `CHANGELOG.md`

### Changed

- Agent guidance moved from `CLAUDE.md` to `AGENTS.md`; `CLAUDE.md` now imports it

## [0.1.0] - 2026-11-14

### Added

- Initial release: Tauri v2 + Svelte 5 terminal multiplexer with Windows Terminal feature parity
- Tabs: rename, color, reorder, tear out / move between windows, MRU switcher, tab search, restore closed, progress ring, vertical tabs
- Panes: split, duplicate, swap, move to tab / window, zoom, directional / MRU focus, read-only, broadcast input
- Profiles: `[defaults]`, 17 built-in color schemes, fonts, cursor, opacity / acrylic, background image, `unfocused_appearance`; generated profiles (WSL, SSH, PowerShell, cmd), fragments, portable mode
- Text: mark mode, rich copy, paste filtering, OSC 52 writes (opt-in), regex search, scroll marks, shell integration (OSC 133 / 633 / 7 / 9;9), snippets pane, Sixel images, OSC 8 links
- Windows: multiple windows, session restore, focus mode, always on top, quake mode, global summon, tray icon, autostart
- Command palette with command-line mode, `[[action]]` custom actions, customizable new tab menu and title-bar toolbar
- `wt.exe`-compatible command line
- Hot-reloaded `config.toml` with built-in editor (completion and validation)
- Bundled fonts, desktop notifications, file drag & drop
- Packaged builds via Docker and CI on `v*` tags (Linux, Windows)

[Unreleased]: https://github.com/MickaelBlet/terminux/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/MickaelBlet/terminux/releases/tag/v0.1.0
