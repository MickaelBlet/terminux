# Testing

Terminux has two test suites: Vitest for the frontend (pure TypeScript modules) and `cargo test` for the backend. There are no component or end-to-end tests; logic is kept in pure modules precisely so it can be unit-tested. This page lists what each test file covers, the commands to run them, and how to write new tests.

## Contents

- [Commands](#commands)
- [Frontend tests (Vitest)](#frontend-tests-vitest)
- [Backend tests (cargo)](#backend-tests-cargo)
- [What is not covered](#what-is-not-covered)
- [Writing frontend tests](#writing-frontend-tests)
- [Writing backend tests](#writing-backend-tests)
- [Type checking](#type-checking)
- [Continuous integration](#continuous-integration)
- [See also](#see-also)

## Commands

```sh
# Frontend: all tests
npx vitest run

# One file
npx vitest run src/lib/layout/tree.test.ts

# One test (or describe block) by name
npx vitest run src/lib/layout/tree.test.ts -t "removes and collapses"
npx vitest run -t "setRootKey"

# Watch mode while developing
npx vitest

# Type check (svelte-check over .ts and .svelte files)
npm run check

# Backend: all tests
cargo test --manifest-path src-tauri/Cargo.toml

# Backend: filter by test name (substring match)
cargo test --manifest-path src-tauri/Cargo.toml accelerators
cargo test --manifest-path src-tauri/Cargo.toml config::tests::validate
cargo test --manifest-path src-tauri/Cargo.toml -- --nocapture
```

Vitest runs with its defaults (there is no `vitest.config`; `vite.config.js` only configures the dev server), discovering `*.test.ts` files in Node. Test files therefore cannot import code that touches `window`, `document`, `localStorage` or Tauri APIs at module load time. Compiling the Rust tests builds the full Tauri crate, so on Linux the WebKitGTK development packages must be installed (the same ones as for a normal build: `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, ...).

## Frontend tests (Vitest)

Seven files, all under `src/lib/`:

| File | Covers |
| --- | --- |
| `commands.test.ts` | `LEGACY_NAMES`/`commandName`; `parseAction` (plain, WT-style nested `command = { action = ... }`, `commands = [...]`); `describe` labels and `specKey` order independence; `parseCombo` (aliases, `Ctrl++`, modifier-only); `Keymap` defaults, overrides, unbinding with `""`, legacy names, `[[action]]` keys, binding by action id in `[keys]`; every command has a label |
| `layout/tree.test.ts` | Split, same-direction flattening, nested splits, rects, remove/collapse, size renormalization, `neighbor`, `resize` with clamping, split before/with size, `swap`, `toggleOrientation`, subtree insert/remove |
| `config-schema.test.ts` | `contextAt` (root key, section/value, header, comments), `completions` (root keys skip already-set ones, profile keys per block, key actions and theme colors, enum/bool/default values, `default_profile`, headers, new sections), `profileIds`, `unknownKeys` (unknown keys and sections, legacy names, free sections, xterm color names, multi-line arrays), `keyInfoAt` (hover docs, default bindings) |
| `config-edit.test.ts` | `setRootKey` / `tomlStringArray` from `config-edit.ts`: replace single and multi-line values keeping comments, ignore keys in sections, insert after a commented example / last root key / before the first section, remove a key |
| `toolbar.test.ts` | Every command has a built-in icon; `commandIcon` by name, legacy name and spec; default toolbar resolution; legacy names, action ids and unknown entries; collapsing separators; `toolbarEntries`/`canonicalEntry`; `moveEntry` |
| `ui/tab-shift.test.ts` | Pure drag geometry: `slotAt`, `shiftFor` |
| `helpers.test.ts` | Grab bag of pure helpers: `paths` (quoting, WSL/Cygwin/MSYS2/MinGW translation, dropped paths); `osc` (progress, cwd 7 / 9;9, 133/633 shell integration, OSC 52, `OSC52_MAX`); `paste` (sanitize, warnings); `snippets` (`insertBlock`, `snippetToml`, and the `snippets.ts` `setRootKey`); `snapshot` (`sanitizeTab`); schemes and appearance (`findScheme`, `schemeName`, `toTheme`, `parseHex`, `withAlpha`, `parsePadding`, `fontWeightOf`, `resolve` for defaults/profile/overrides); `markmode` `move`/`wordAt`, `marks` `targetLine`, shell-integration `recent`; `hasVisibleText` |

## Backend tests (cargo)

Tests live in `#[cfg(test)] mod tests` blocks at the bottom of each module.

| Module | Tests | Covers |
| --- | --- | --- |
| `config.rs` | `default_config_parses`, `shell_profile_always_present`, `invalid_config_errors`, `validate_ok`, `validate_span_is_utf16`, `legacy_config_still_parses`, `passthrough_and_sections`, `commandline_splitting`, `generated_profile_is_overridable`, `initial_config_lists_generated_profiles`, `profile_example_is_valid` | Embedded default config is valid; `shell` profile always exists; type errors; UTF-16 error spans for CodeMirror; old config files; typed fields vs pass-through, `[defaults]` merging (cwd, env, login shell), `commandline` splitting, `[[scheme]]`/`[[ui_theme]]`/`[[action]]`/`[keys]`, JSON shape sent to the frontend; `Profile::inherit`; first-run file listing generated profiles; the commented profile example in `default_config.toml` |
| `cli.rs` | `options_and_commands`, `implicit_new_tab`, `separators`, `errors_and_dirs` | Global options plus chained subcommands, implicit `new-tab`, `;` handling (standalone, glued, escaped), error cases, `resolve_dirs`, `snake()` |
| `dynamic_profiles.rs` | `wsl_list_utf16`, `ssh_hosts`, `slugs` | `wsl.exe -l -q` UTF-16 output, `~/.ssh/config` host extraction, slugging |
| `pty.rs` (not on Windows) | `quoting`, `agent_runs_through_login_shell`, `backlog_is_bounded` | `sh_quote`; a non-shell profile runs as `$SHELL -lic "exec ..."`; the 8 MiB backlog cap keeps the newest bytes |
| `windows.rs` | `accelerators` | `accelerator()` conversion (`Win+\``, `Ctrl+Shift+q`, `Alt+F12`, `Ctrl++`, unsupported modifier) and `parse_position` |
| `session_store.rs` | `bounds_and_tabs` | `has_tabs`, `bounds` |
| `lib.rs` (not on Windows) | `file_ipc_is_limited_to_config_paths` | `referenced_by_config` allow-list for `read_binary`/`save_text` |

## What is not covered

- Svelte components, `App` (`state.svelte.ts`), `TermSession`, `windows.ts`, `actions.ts` (they import Tauri/xterm/DOM APIs at module load).
- Real PTY spawning, windows, tray, global shortcuts, notifications.
- Packaging. Manual verification (`npm run tauri dev`) is expected for UI and multi-window work: tab tear-out, session restore, quake mode, rendering on both platforms.

## Writing frontend tests

Put a `*.test.ts` file next to the module (`foo.ts` -> `foo.test.ts`). Import from `vitest` explicitly:

```ts
import { describe, expect, it } from "vitest";
import { split, pane, paneIds } from "./tree";

describe("layout tree", () => {
  it("splits a single pane", () => {
    const t = split(pane("a"), "a", "row", "b");
    expect(paneIds(t)).toEqual(["a", "b"]);
  });
});
```

Guidelines:

- **Keep logic pure.** If you need to test behavior that is tangled with Tauri or the DOM, extract the pure part into a module with no such imports first (`tab-shift.ts` was split from the drag controller for this reason; its header says "kept free of Tauri imports for tests").
- **Keyboard events**: build a minimal fake, as `commands.test.ts` does:

  ```ts
  const key = (k: string, code: string, mods: Partial<KeyboardEvent> = {}) =>
    ({ key: k, code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods }) as KeyboardEvent;
  expect(new Keymap().match(key("v", "KeyV", { ctrlKey: true }))?.command).toBe("paste");
  ```

- **Config-dependent code**: start from `FALLBACK_CONFIG` (exported from `config.ts`) and spread overrides, as the `resolve` test in `helpers.test.ts` does.
- **Editor schema**: use the cursor-marker helper from `config-schema.test.ts` (`at("font_s|")` splits a string into text and cursor position).
- **Changing `COMMANDS`**: the existing tests assert that every command has a label and a valid icon, so a new command with a missing icon fails `toolbar.test.ts`.
- **Prefer asserting exact values** (`toEqual`) over snapshots; the repo uses none.

## Writing backend tests

Add to the module's `mod tests` (`use super::*;`):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn my_parser() {
        assert_eq!(parse_thing("a b"), ["a", "b"]);
    }
}
```

Guidelines:

- Test pure functions (`parse_*`, `split_commandline`, `accelerator`, `Config::parse`). `Config::parse` is deliberately pure (no generated profiles, no fragments, no filesystem) so config behavior can be tested from a TOML string.
- Gate platform-specific tests: `#[cfg(all(test, not(windows)))]` on the module (as `pty.rs` and `lib.rs` do) or `#[cfg(not(windows))]` on a single assertion.
- Do not rely on the user's real config, home directory or installed tools. Paths that depend on them (`config_path`, `dynamic_profiles::all`) are not unit-tested.
- To test CLI parsing use the `args()` helper (`config::split_commandline`) and `serde_json::json!` for expected actions.
- Keep `default_config.toml` valid: `validate_ok` and `default_config_parses` fail otherwise, and the `profile_example_is_valid` test parses the commented example block that starts at the line `# Example using every profile option`, so edit that block carefully.

## Type checking

`npm run check` runs `svelte-kit sync` and `svelte-check` with the project `tsconfig.json` (extends `.svelte-kit/tsconfig.json`, `strict`, `allowJs`/`checkJs`). The Docker Linux build runs it too (unless `SKIP_TESTS=1`).

## Continuous integration

`.github/workflows/build.yml` runs on `v*` tags (and manually) on Ubuntu 22.04 and Windows: `npm ci`, `npx vitest run`, `cargo test --manifest-path src-tauri/Cargo.toml`, then `tauri-action`. It does not run `npm run check`. The Docker build script runs `npm run check`, `npx vitest run` and `cargo test --locked` for Linux. Details in [building-and-release.md](building-and-release.md). Run all three locally before tagging a release.

## See also

- [adding-features.md](adding-features.md): which tests to add for each kind of change
- [building-and-release.md](building-and-release.md)
- [contributing.md](contributing.md): PR checklist
