# Contributing

Conventions for working on Terminux: naming (Windows Terminal parity, snake_case, legacy aliases), language, keeping the config schema in sync, the project layout and a pull request checklist.

## Contents

- [Getting set up](#getting-set-up)
- [Project layout](#project-layout)
- [Conventions](#conventions)
- [Code style](#code-style)
- [Where to put things](#where-to-put-things)
- [Pull request checklist](#pull-request-checklist)
- [Commit messages](#commit-messages)
- [See also](#see-also)

## Getting set up

```sh
npm install
npm run tauri dev                                  # run the app (Vite on fixed port 1420)
npm run check                                      # svelte-check / TypeScript
npx vitest run                                     # frontend tests
cargo test --manifest-path src-tauri/Cargo.toml    # Rust tests
```

See [building-and-release.md](building-and-release.md) for prerequisites and packaged builds, and [testing.md](testing.md) for running single tests.

## Project layout

```text
terminux/
  README.md, CHANGELOG.md       project intro; release notes
  AGENTS.md, CLAUDE.md          guidance for coding agents (CLAUDE.md includes AGENTS.md)
  package.json, package-lock.json, vite.config.js, svelte.config.js, tsconfig.json
  docs/                         this documentation
    user-guide/  reference/  developer/
  docker/                       Dockerfile (linux, appimage, windows targets), build.sh, appimage.sh
  scripts/                      build-linux.sh, build-windows.sh, docker-build.sh -> dist/
  .github/workflows/build.yml   CI on v* tags
  static/                       favicon, bundled fonts (JetBrains Mono, Symbols Nerd Font Mono,
                                Twemoji Mozilla, Noto Sans Symbols/Symbols 2/Math) and their licenses
  src/                          frontend (SvelteKit SPA, Svelte 5)
    app.html, app.css
    routes/                     +layout.ts, +layout.svelte, +page.svelte
    lib/
      state.svelte.ts           App store
      commands.ts keys.ts actions.ts       action pipeline
      layout/tree.ts            pane layout tree (+ tree.test.ts)
      term/                     session.ts appearance.ts marks.ts markmode.ts shell-integration.ts
                                file-link-provider.ts link-tooltip.ts
      osc.ts paste.ts paths.ts audio.ts snippets.ts toolbar.ts schemes.ts ui-theme.ts
      file-links.ts file-langs.ts color-swatch.ts emoji-icons.ts
      windows.ts snapshot.ts    multi-window, session persistence
      config.ts config-schema.ts config-edit.ts
      settings/                 settings UI model (doc.svelte.ts, pages.ts, value.ts)
      ui/                       Svelte components, menus.ts, palettes.ts, tab and pane drag helpers,
                                editor-search.ts editor-theme.ts pane-title.ts
      ui/settings/              settings UI components
      *.test.ts                 Vitest tests (next to the module)
  src-tauri/                    backend (Rust, Tauri v2)
    Cargo.toml, build.rs, tauri.conf.json
    capabilities/default.json   frontend permissions
    icons/
    src/
      main.rs lib.rs            entry, AppState, IPC commands, startup
      cli.rs                    wt-style command line
      config.rs default_config.toml dynamic_profiles.rs toml_patch.rs
      pty.rs                    PtyManager
      windows.rs session_store.rs
      editor.rs ssh.rs remote_files.rs     file links, ssh panes, remote files
      complete.rs               open_file path completion
  dist/                         build artifacts (git-ignored)
```

Details: [architecture.md](architecture.md), [frontend.md](frontend.md), [backend.md](backend.md).

## Conventions

### Windows Terminal parity, snake_case

Terminux aims at Windows Terminal feature parity. Action names, config keys and default key bindings follow Windows Terminal, written in snake_case (`toggleFocusMode` becomes `toggle_focus_mode`, `newTabPosition` becomes `new_tab_position`, `wt.exe` flag names such as `--tabColor` are kept as-is on the command line). Before inventing a name, look up the Windows Terminal equivalent and reuse it, including argument names and default shortcuts. Document the equivalent camelCase name in the user docs when helpful.

- Free-form enum values are normalized with a local `norm()` (lowercase, strip `_` and `-`) so `after_current_tab`, `afterCurrentTab` and `after-current-tab` are all accepted. Follow that pattern for new enums (backend: `to_ascii_lowercase().replace(['_', '-'], "")`).
- A name that does not exist in Windows Terminal is allowed (Terminux-specific features, e.g. `toggle_vertical_tabs`, `customize_toolbar`, `save_snippet`) but keep the same style.

### Renaming and `LEGACY_NAMES`

Names that shipped before the parity work are kept working through `LEGACY_NAMES` in `src/lib/commands.ts` (`zoom`, `search`, `palette`, `font_bigger`, `focus_left`, `tab_1`, ...). `commandName()` resolves them everywhere (`[keys]`, the toolbar, `[[action]]` ids, the schema). When you rename a command or config key, keep the old name accepted: add it to `LEGACY_NAMES` for commands, or an `alias` in the Rust struct / a fallback read for config keys (see `word_delimiters` as alias of `word_separators`, `starting_directory` as alias of `cwd`). Never silently break a user's `config.toml`.

### English everywhere in code

Code, identifiers, comments, commit messages, UI strings and documentation are in English.

### Schema sync

The built-in TOML editor (`ui/ConfigEditor.svelte`) completes and lints against `src/lib/config-schema.ts`, and the settings UI builds its forms from the same schema (`settings/pages.ts` places the fields). Anything the user can write in `config.toml` must exist there, or it is underlined as unknown. When you add or rename:

- a global key: `Config` in `config.ts`, `ROOT_FIELDS` in `config-schema.ts`, a commented example in `src-tauri/src/default_config.toml`;
- a profile/`[defaults]` key: `ProfileSettings` in `config.ts`, `resolve()` in `term/appearance.ts`, `SETTINGS_FIELDS` in `config-schema.ts`;
- an action: `COMMANDS` + `ACTIONS` (+ `ACTION_ARGS` for new arguments, and a commented line in the `[keys]` block of `default_config.toml`);
- a table (`[[x]]`): the `HEADERS` list and `fieldsOf()`.

Then update the reference docs (`docs/reference/configuration.md`, `profile-settings.md`, `actions.md`) and add or extend a test. Recipes: [adding-features.md](adding-features.md).

### Backend stays thin

The backend types only what it must act on (spawn and window routing). New user settings are normally passed through `extra` and interpreted in the frontend. Put process, file-system, window and OS integration in Rust; put UI state and behavior in the frontend.

### Safe by default

- File access from the webview is allow-listed: paths referenced by the config (`referenced_by_config`), and files the built-in editor opened (`OpenFiles`); do not add commands that read or write arbitrary paths.
- Clipboard reads by terminal programs (OSC 52 query) are never answered; writes are opt-in (`osc52_clipboard`).
- Pastes are sanitized (`sanitizePaste`) and can require confirmation.

## Code style

No formatter or linter configuration is committed; match the surrounding code.

- **TypeScript/Svelte**: 2-space indentation, double quotes, semicolons, trailing commas in multi-line literals, `const` arrow functions for small helpers, doc comments (`/** ... */`) on exported functions and non-obvious fields. Keep pure logic in modules without Tauri/DOM imports so it is testable. Runes (`$state`, `$derived`, `$effect`) for reactivity; `$state.raw` for values that are replaced rather than mutated. Strict TypeScript must pass `npm run check`.
- **Rust**: edition 2024, 4-space indentation, `anyhow` for fallible internals, `Result<T, String>` at the IPC boundary, short doc comments explaining intent and platform quirks, `#[cfg(windows)]`/`#[cfg(not(windows))]` blocks for platform differences. Run `cargo test` and keep the build free of new warnings.
- Comments explain why (platform quirks, protocol details), not what.
- Do not hold backend mutexes across calls that can re-enter the app, and keep window-creating commands `async`.

## Where to put things

| Change | Location |
| --- | --- |
| New action / key | `commands.ts`, `actions.ts`, `docs/reference/actions.md` |
| New config key | `config.ts`, `config-schema.ts`, `default_config.toml`, `docs/reference/configuration.md` |
| New profile setting | plus `term/appearance.ts`, `docs/reference/profile-settings.md` |
| New CLI option | `src-tauri/src/cli.rs`, `docs/reference/command-line.md` |
| Pane/tab logic | `layout/tree.ts` (pure) and `state.svelte.ts` |
| Terminal behavior (OSC, mouse, renderer) | `term/session.ts`, `osc.ts` |
| Multi-window behavior | `windows.ts` (frontend), `windows.rs` (backend) |
| Process/PTY behavior | `pty.rs` |
| UI chrome | `src/lib/ui/` |
| Settings UI | `src/lib/settings/` (pure model), `src/lib/ui/settings/` (components), `src-tauri/src/toml_patch.rs` (edits) |
| File links, ssh panes | `file-links.ts`, `path-complete.ts`, `term/file-link-provider.ts`, `src-tauri/src/editor.rs`, `ssh.rs`, `remote_files.rs` |
| Packaging | `docker/`, `scripts/`, `tauri.conf.json`, `.github/workflows/build.yml` |

## Pull request checklist

- [ ] The change is focused; unrelated cleanups are in separate commits or PRs.
- [ ] Names follow Windows Terminal in snake_case; renamed items keep their old name accepted (`LEGACY_NAMES` / alias).
- [ ] Code, comments, UI strings and commit messages are in English.
- [ ] `npm run check` is clean.
- [ ] `npx vitest run` passes; new pure logic has tests.
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` passes when Rust changed.
- [ ] New or changed config keys are in `config.ts`, `config-schema.ts` and `default_config.toml` (schema sync), and `config.toml` files written by older versions still load.
- [ ] New actions have a `COMMANDS` entry (label, default key if Windows Terminal has one), an `ACTIONS` handler, and a valid icon.
- [ ] New IPC commands are in `generate_handler!`, return `Result<_, String>`, and do not widen file access.
- [ ] Manually tried the change in `npm run tauri dev` (for multi-window, rendering or PTY changes, on Linux and Windows when possible).
- [ ] Docs updated: `docs/reference/*` for keys/actions/CLI, `docs/user-guide/*` for behavior, `docs/developer/*` for architecture, and `README.md` when the feature list changes.
- [ ] Version numbers untouched unless this is a release (see [building-and-release.md](building-and-release.md#version-bump-locations)).

## Commit messages

English, imperative mood, one line summary (what changed and why when not obvious), body for context if needed. Reference issues where applicable.

## See also

- [adding-features.md](adding-features.md)
- [testing.md](testing.md)
- [architecture.md](architecture.md)
- [../README.md](../README.md): documentation index
- [../reference/actions.md](../reference/actions.md), [../reference/configuration.md](../reference/configuration.md)
