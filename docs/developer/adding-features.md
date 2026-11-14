# Adding features

Step-by-step recipes for the most common extensions: an action, a config key, a generated profile source, a CLI subcommand or flag, an IPC command and a color scheme. Each recipe lists every file that must change, with snippets that follow the patterns already in the code. The names used in examples (`toggle_example`, `my_key`, ...) are placeholders.

## Contents

- [Add an action](#add-an-action)
- [Add a config key](#add-a-config-key)
- [Add a generated profile source](#add-a-generated-profile-source)
- [Add a CLI subcommand or flag](#add-a-cli-subcommand-or-flag)
- [Add an IPC command](#add-an-ipc-command)
- [Add a color scheme](#add-a-color-scheme)
- [Other recipes](#other-recipes)
- [Checklist for any change](#checklist-for-any-change)
- [See also](#see-also)

## Add an action

An action is a named command in `COMMANDS` plus a handler in `ACTIONS`. Names follow Windows Terminal in snake_case (check the [Windows Terminal actions list](https://learn.microsoft.com/windows/terminal/customize-settings/actions) first and reuse its name and argument names when an equivalent exists).

1. **Declare the command** in `src/lib/commands.ts`, in the right section of `COMMANDS`:

   ```ts
   // label, spec.command, extra spec args, default keys, hidden
   toggle_example: n("Toggle example", "toggle_example", {}, ["Ctrl+Alt+E"]),
   // A variant of an existing handler: same `command`, different args.
   example_on: n("Enable example", "toggle_example", { enable: true }),
   ```

   - The first argument is the palette label; the second is the `command` string looked up in `ACTIONS` (several named commands may share one).
   - Leave `keys` empty (`[]`, the default) when WT has no default binding. Mark `hidden` (fifth argument) for commands that should not appear in the palette.
   - Several entries with the same `spec` would be ambiguous for key hints and labels (`specKey`), so give each variant a distinct arg.
   - Families can be generated with a loop like the `DIRS` one below the table.

2. **Implement the handler** in `src/lib/actions.ts`. Return `false` to let the key reach the terminal (nothing to do), anything else when handled:

   ```ts
   toggle_example: (app, spec) => {
     if (app.tab?.kind !== "term") return false;
     app.toggleExample(spec.enable === undefined ? undefined : spec.enable === true);
   },

   // Needs the active terminal session: withTerm returns false when there is none.
   example_flash: withTerm((s, app, spec) => s.flash(num(spec.ms) ?? 100)),
   ```

   Put real logic in `App` (`src/lib/state.svelte.ts`) or `TermSession`, not in the handler, so it is reusable by menus, the palette and the CLI. Helpers available in `actions.ts`: `str`, `num`, `norm` (lowercase, strips `_` and `-`), `withTerm`, `term`.

3. **If it must work while the settings editor, palette or an input has focus**, add the command to `GLOBAL_COMMANDS` in `actions.ts`.

4. **If it takes an argument** that is new, add the argument name to `ACTION_ARGS` in `src/lib/config-schema.ts` so `[[action]]` completion offers it. `ACTION_COMMANDS` is derived from `COMMANDS` automatically; add the command name to the explicit extra list there only when it has no `COMMANDS` entry (like `send_input`, `wt`, `global_summon`).

5. **Icon**: `actionIcon` falls back to `ICON_BY_ACTION[spec.command]`, then `"terminal"`. Add an entry in `ICON_BY_ACTION` (and a case in `actionIcon` for argument-dependent icons). A new icon is a 16x16 stroke path in `src/lib/ui/icons.ts`. The test `toolbar.test.ts` asserts every command resolves to an existing icon.

6. **Legacy names** (only when renaming an existing command): keep the old name working by adding it to `LEGACY_NAMES` in `commands.ts`.

7. **Optional surfaces**: add the command to a menu in `src/lib/ui/menus.ts` (`paneMenu`, `tabMenu`, ...) or to `DEFAULT_TOOLBAR` in `toolbar.ts` (changing the default toolbar is a user-visible change; `toolbar.test.ts` pins it).

8. **Tests**: extend `src/lib/commands.test.ts` (key matching, labels) for new bindings. For logic in pure modules add tests next to them (see [testing.md](testing.md)).

9. **Docs**: add an entry to [../reference/actions.md](../reference/actions.md) (heading `### toggle_example`) and, if it has a default key, to [../reference/keybindings.md](../reference/keybindings.md).

An action usable only from `[[action]]` / the CLI (no `COMMANDS` entry, no key) needs just the `ACTIONS` handler plus the extra list in `ACTION_COMMANDS`.

## Add a config key

Most settings are interpreted by the frontend: the backend carries unknown keys through `#[serde(flatten)] extra` untouched, so no Rust change is needed.

### Frontend-interpreted global key

Example: `my_key` (boolean, default on).

1. **Type** in `src/lib/config.ts`, in the right group of the `Config` interface:

   ```ts
   // Interaction
   my_key?: boolean;
   ```

2. **Use it** where needed, treating "unset" as the default:

   ```ts
   if (app.config.my_key === false) return; // default: on
   ```

3. **Schema**: add the key to `ROOT_FIELDS` in `src/lib/config-schema.ts` (grouped like the existing comments `// Appearance`, `// Startup`, `// Interaction`). Without this entry the editor underlines the key as unknown and offers no completion:

   ```ts
   my_key: bool("Doc shown in the completion list and on hover."),
   enum_key: str("Explain the values.", ["a", "b"]),   // enumerations
   count_key: num("..."),
   ```

   Field helpers: `bool`, `str(doc, values?)`, `num`, or `f("array" | "table", doc)`.

4. **Default file**: document it in `src-tauri/src/default_config.toml`, commented out, in the matching section (the file is embedded with `include_str!` and parsed by tests, so keep it valid TOML):

   ```toml
   # my_key = true   # one-line explanation
   ```

5. **Tests**: add a case in `src/lib/config-schema.test.ts` (for example that `completions` offers the key or `unknownKeys` does not flag it).

6. **Docs**: add `### my_key` to [../reference/configuration.md](../reference/configuration.md) with type, default, values and an example.

### Backend-read key

If Rust needs the value, read it from `extra` with the typed getters (`get_str`, `get_bool`, `get_int`) as `windows.rs` does (`cfg.get_bool("always_on_top")`, `cfg.get_str("windowing_behavior")`). Remember hot reload: the watcher swaps `AppState.config` and emits `config-changed`, but code that read the value at window creation will not see later changes.

Only fields that the backend must act on are typed in `Config`/`Profile` (spawn and routing: `default_profile`, `cmd`, `args`, `cwd`, `env`, `os`, `login_shell`, `hidden`, ...). To add a typed field, add it to the struct with a `#[serde(default)]`, and add a test in `src-tauri/src/config.rs` (see `passthrough_and_sections`); also mirror it in `config.ts` if the frontend reads it.

### Profile / `[defaults]` setting

1. Add the field to `ProfileSettings` in `config.ts` (and to `Appearance` if it may also appear in `unfocused_appearance`).
2. Interpret it in `resolve()` in `src/lib/term/appearance.ts` and add the resulting value to the `Resolved` interface. Use the merged settings object `s` (profile over `[defaults]`) or the unfocused overlay `a`; if it should be overridable when unfocused add it to `APPEARANCE_KEYS` and to `APPEARANCE_FIELDS` in the schema.
3. If it maps to an xterm option, add it to `xtermOptions()`; otherwise consume `look.<field>` where it is used (`TermSession.applyLook`, a component, ...).
4. Add the key to `SETTINGS_FIELDS` in `config-schema.ts` (it is then accepted in `[defaults]` and in every `[[profile]]`; `PROFILE_FIELDS` spreads it).
5. Test in `helpers.test.ts` ("resolves defaults, profile and overrides" shows the pattern with `FALLBACK_CONFIG`) and document in [../reference/profile-settings.md](../reference/profile-settings.md) (`### my_setting`).

### Sections with their own schema

New `[[section]]` tables need: a type in `config.ts`, a field table plus a `case` in `fieldsOf()` and an entry in `HEADERS` in `config-schema.ts`, and (if Rust must carry it) a `#[serde(default, rename(deserialize = "..."))]` field in `Config`, as done for `schemes`, `ui_themes` and `actions`; add the name to `RESERVED` when the serialized field name differs from the TOML name.

## Add a generated profile source

Generated profiles (WSL, SSH, PowerShell, Windows shells) live in `src-tauri/src/dynamic_profiles.rs`. Example: one profile per Multipass instance (hypothetical).

1. **Write the generator**, returning `Vec<Profile>` built with the shared `profile()` helper (which sets `source` and `login_shell = Some(false)` so the profile is not wrapped in the user's login shell):

   ```rust
   fn multipass() -> Vec<Profile> {
       if !in_path("multipass") {
           return Vec::new();
       }
       let Ok(out) = std::process::Command::new("multipass").args(["list", "--format", "csv"]).output() else {
           return Vec::new();
       };
       parse_multipass_list(&String::from_utf8_lossy(&out.stdout))
           .into_iter()
           .map(|name| {
               profile(
                   "multipass",                              // source id
                   format!("multipass-{}", slug(&name)),     // stable profile id
                   format!("Multipass - {name}"),            // display name
                   "multipass",
                   vec!["shell".into(), name],
               )
           })
           .collect()
   }
   ```

   Keep the parsing in a separate pure function (`parse_multipass_list`) so it can be tested without the tool installed (like `parse_wsl_list` and `parse_ssh_config`). Never run slow or interactive commands on a platform where they cannot apply; guard with `#[cfg(windows)]` as `wsl()` does. On Windows use `CREATE_NO_WINDOW` for child processes.

2. **Register it** in `generate()`:

   ```rust
   out.extend(multipass());
   ```

   The result is cached for the whole run (`OnceLock`), so detection cost is paid once. `Config::extend` skips sources listed in `disabled_profile_sources` (case-insensitive) and lets a user profile with the same id override a generated one (`Profile::inherit`).

3. **Extra defaults** (for example a path translation style) go in `p.extra`, as `wsl()` does with `path_translation_style`.

4. **Test**: add a `#[test]` in the module's `tests` for the pure parser (see `wsl_list_utf16`, `ssh_hosts`, `slugs`):

   ```rust
   #[test]
   fn multipass_list() {
       assert_eq!(parse_multipass_list("Name,State\nprimary,Running\n"), ["primary"]);
   }
   ```

5. **Schema and docs**: update the doc strings listing sources (`disabled_profile_sources` in `ROOT_FIELDS`, the `source` field of `MENU_FIELDS`, both in `config-schema.ts`) and [../user-guide/06-profiles.md](../user-guide/06-profiles.md). The first-run config file lists generated profiles automatically (`initial_config`).

## Add a CLI subcommand or flag

The parser is `src-tauri/src/cli.rs`; its output is a list of action objects (`serde_json::Value`) identical in shape to `[[action]]` entries, so the work is: parse into an action, make sure the action exists in the frontend, document.

### New subcommand

Example: `zoom-pane` / `zp` toggling pane zoom.

1. **Add the match arm** in `command()`:

   ```rust
   "zoom-pane" | "zp" => json!({ "command": "toggle_pane_zoom" }),
   ```

   For subcommands with arguments, follow the existing arms: read the flag with `value(&mut it, flag)?`, convert numbers with `parse::<i64>().map_err(...)`, use `direction(rest, name)?` for direction words (it normalizes `nextInOrder` to `next_in_order`).

2. **Help text**: add the line to `HELP` (printed by `terminux --help`).

3. **Frontend**: the action named in the JSON must exist in `ACTIONS` (see [Add an action](#add-an-action)). The palette's command-line mode and the `wt` action reuse this parser through the `cli_parse` IPC command, so nothing else is needed there.

4. **Tests**: add cases to the `tests` module in `cli.rs` (`options_and_commands` shows the full-line style):

   ```rust
   assert_eq!(parse(&args("zp")).unwrap().actions, [json!({ "command": "toggle_pane_zoom" })]);
   ```

5. **Docs**: [../reference/command-line.md](../reference/command-line.md) (`### zoom-pane`).

### New flag on `new-tab` / `split-pane`

Add an arm in `pane_command()` and put the value under the key the frontend expects; for it to take effect, that key must be read by `specFrom` (`NewPaneArgs` in `state.svelte.ts`) or by the handler:

```rust
"--myFlag" => _ = m.insert("my_flag".into(), json!(value(&mut it, a)?)),
// split-pane only: guard with `if split`
"-X" | "--example" if split => _ = m.insert("example".into(), json!(true)),
```

Unknown options return `unknown option <flag>`, so a flag must be listed to be accepted. Windows Terminal flags that make no sense here are listed in the ignore arm (`--appendCommandLine`, `--inheritEnvironment`, `--reloadEnvironment`).

### New global option

Global options are parsed at the top of `parse()` into the `Cli` struct. Add a field to `Cli`, an arm in the `match`, and consume it in `launch_of` (`lib.rs`) / `windows::Launch` if it affects window creation (see `maximized`, `fullscreen`, `focus`, `pos`, `size`). Remember `second_instance` and `open_initial_windows` both call `launch_of`.

## Add an IPC command

1. **Write the command** in `src-tauri/src/lib.rs` (or in the module that owns the logic, called from a thin wrapper in `lib.rs`):

   ```rust
   /// Doc comment: what it does and what it returns.
   #[tauri::command]
   fn my_command(state: State<AppState>, name: String, count: u32) -> CmdResult<String> {
       let cfg = state.config.lock().unwrap();
       // ...
       Ok(format!("{name}:{count}:{}", cfg.default_profile))
   }
   ```

   Conventions in this codebase:
   - Fallible commands return `CmdResult<T>` (`Result<T, String>`); convert errors with the local `err()` helper or `format!("{e:#}")` for `anyhow` chains.
   - `AppHandle`, `WebviewWindow` (the calling window, `window.label()`), `State<AppState>` are injected and invisible to JS.
   - Commands that create or manipulate windows should be `async` (a sync command runs on the main thread, and building a window there deadlocks on Windows/WebView2): see `window_new`, `window_send`, `summon`.
   - Do not hold the `config` or `windows` mutex across calls that re-enter the app.
   - File access from the webview must be allow-listed. Reuse `referenced_by_config` as `read_binary` and `save_text` do, never accept arbitrary paths.
   - Streaming data uses a `Channel<InvokeResponseBody>` argument (see `pty_spawn`).

2. **Register it** in the `tauri::generate_handler![ ... ]` list in `run()`. A command missing from this list is not callable.

3. **Call it from the frontend**. Rust `snake_case` argument names become `camelCase` in JS; structs deserialize with their serde attributes (`SpawnOptions` uses `rename_all = "camelCase"`):

   ```ts
   import { invoke } from "@tauri-apps/api/core";
   const out = await invoke<string>("my_command", { name: "x", count: 3 });
   ```

   Always `.catch(...)` or `try/await` (errors arrive as rejected promises with the string).

4. **Permissions**: custom commands registered in `generate_handler!` need no capability entry. If the command's implementation is paired with a new frontend call to a Tauri core or plugin API (window methods, clipboard, ...), add that permission to `src-tauri/capabilities/default.json`.

5. **Events** (backend to frontend): `app.emit("name", payload)` for all windows or `app.emit_to(label, "name", payload)` for one; the frontend uses `listen` (`@tauri-apps/api/event`) or `getCurrentWebviewWindow().listen` (as `windows.ts` does for per-window events).

6. **Tests**: unit-test the logic in the Rust module (the repo tests helpers such as `referenced_by_config`, not the Tauri glue). Document the command in [backend.md](backend.md#ipc-commands).

## Add a color scheme

### Built-in scheme

1. Add an entry to `BUILTIN_SCHEMES` in `src/lib/schemes.ts`, using xterm theme key names (not the TOML snake_case ones):

   ```ts
   "My Scheme": { background: "#101418", foreground: "#d0d7de", cursor: "#ffcc66", selectionBackground: "#2a3441",
     black: "#101418", red: "#f7768e", green: "#9ece6a", yellow: "#e0af68", blue: "#7aa2f7", magenta: "#bb9af7", cyan: "#7dcfff", white: "#d0d7de",
     brightBlack: "#414868", brightRed: "#f7768e", brightGreen: "#9ece6a", brightYellow: "#e0af68", brightBlue: "#7aa2f7", brightMagenta: "#bb9af7", brightCyan: "#7dcfff", brightWhite: "#ffffff" },
   ```

   Keys: `background`, `foreground`, `cursor`, optional `cursorAccent`, `selectionBackground`, and the 16 ANSI colors (`black` .. `white`, `brightBlack` .. `brightWhite`). Names are matched case-insensitively (`findScheme`); user `[[scheme]]` entries with the same name win over built-ins. The default scheme constant is `DEFAULT_SCHEME = "Terminux"`.

2. The scheme appears automatically in the palette picker (`schemeNames`) and in `color_scheme` completion (`schemeNamesIn`).

3. Update [../reference/color-schemes.md](../reference/color-schemes.md) (there are currently 17 built-in schemes).

### User scheme (documentation, no code)

```toml
[[scheme]]
name = "My Scheme"
background = "#101418"
foreground = "#d0d7de"
cursor_color = "#ffcc66"
selection_background = "#2a3441"
black = "#101418"
red = "#f7768e"
purple = "#bb9af7"
bright_purple = "#bb9af7"
# ... remaining ANSI colors; unspecified colors fall back to the Terminux defaults

[defaults]
color_scheme = "My Scheme"   # or { light = "One Half Light", dark = "My Scheme" }
```

`toTheme()` converts the Windows Terminal style keys (`cursor_color` -> `cursor`, `purple` -> `magenta`, `bright_purple` -> `brightMagenta`, `selection_background` -> `selectionBackground`, other snake_case names are camel-cased).

## Other recipes

- **New OSC sequence**: add a pure parser to `src/lib/osc.ts` with a test in `helpers.test.ts`, then register it in `TermSession.createTerminal` with `t.parser.registerOscHandler(<n>, handler)` (return `true` to mark it handled). If the app must react, add a `SessionHooks` method, implement it in `App.hooks` and update the document [../reference/escape-sequences.md](../reference/escape-sequences.md).
- **New palette entry / menu item**: add it in `src/lib/ui/palettes.ts` (`commandPalette`) or `src/lib/ui/menus.ts`; use `app.keymap.hint(name)` for the key hint and `commandIcon` for the icon.
- **New UI theme option**: add the field to `UiTheme` in `config.ts`, to the matching `UI_*_FIELDS` table in `config-schema.ts`, and consume it in `applyUiTheme` (`ui-theme.ts`).
- **Persisted per-window state**: add it to `WindowSnapshot`/`TabSnapshot`/`PaneSnapshot` (`snapshot.ts`), fill it in `snapshotWindow`/`capturePane`, restore it in `applyPayload`/`adoptPane`, and extend `sanitizeTab` if it needs validation. `session_store.rs` stores snapshots as opaque JSON, so no Rust change is needed.

## Checklist for any change

- `npm run check` and `npx vitest run` pass; `cargo test --manifest-path src-tauri/Cargo.toml` passes when Rust changed.
- New config keys: type in `config.ts`, entry in `config-schema.ts`, commented example in `default_config.toml`, docs in `docs/reference/`.
- New actions: `COMMANDS` entry, `ACTIONS` handler, icon, docs.
- New user-visible behavior is described in `docs/user-guide/` and, if relevant, `README.md`.

## See also

- [frontend.md](frontend.md): the action pipeline and App store in detail
- [backend.md](backend.md): modules and the IPC command list
- [testing.md](testing.md): how to test each kind of change
- [contributing.md](contributing.md): conventions and PR checklist
