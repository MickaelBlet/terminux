# File locations

Where Terminux reads its configuration, fragments and saved session on each platform, how portable mode relocates them, and how relative paths in the config are resolved.

- [Summary](#summary)
- [Configuration file](#configuration-file)
- [Fragments](#fragments)
- [Session file](#session-file)
- [Portable mode](#portable-mode)
- [Paths inside the config](#paths-inside-the-config)
- [Per-machine UI state](#per-machine-ui-state)
- [Logs](#logs)
- [Environment variables](#environment-variables)

## Summary

| What | Linux | Windows | Portable mode |
| --- | --- | --- | --- |
| Config file | `$XDG_CONFIG_HOME/terminux/config.toml` (default `~/.config/terminux/config.toml`) | `%APPDATA%\terminux\config.toml` | `<exe dir>/settings/config.toml` |
| Fragments | `<config dir>/fragments/*.toml` | `<config dir>\fragments\*.toml` | `<exe dir>/settings/fragments/*.toml` |
| Session (window layout) | `$XDG_STATE_HOME/terminux/session.json` (default `~/.local/state/terminux/session.json`) | `%LOCALAPPDATA%\terminux\session.json` | `<exe dir>/settings/session.json` |

The directories come from the platform's standard locations (the `dirs` crate): on macOS the config and the session fall under `~/Library/Application Support/terminux`. Only Linux and Windows are packaged targets (see the CI workflow), so only those are documented in detail. <!-- TODO verify macOS paths -->

## Configuration file

- `config.toml` is created on first run. Its content is the default configuration (the same text as `src-tauri/src/default_config.toml` in the repository; open it read-only with `Ctrl+Alt+,`) with, when any were found, the generated profiles of this machine (WSL distributions, SSH hosts, PowerShell, Windows shells) written out as `[[profile]]` blocks just before the `# Color schemes.` comment.
- The file is **hot-reloaded**: Terminux watches the config directory (recursively) and reloads when `config.toml` or a file in `fragments/` is created, modified or removed. Open windows re-apply appearance, keys, actions, toolbar and the new tab menu without restart. A few settings are read once at window creation (transparency, acrylic/Mica, `always_on_top`, launch mode) or at startup.
- A TOML syntax or type error does not crash anything: the built-in defaults are used and the error is shown (with the file path). The built-in settings tab (`Ctrl+,`) validates before saving and refuses to write an invalid file.
- Generated profiles are computed **once per run**: changes to `~/.ssh/config` or new WSL distributions are picked up at the next start, not on hot reload.
- Open the file: `Ctrl+,` (built-in settings tab), `Ctrl+Shift+,` (external editor), or the [`open_settings_directory`](actions.md#open_settings_directory) action.

## Fragments

Every `*.toml` file in the `fragments/` directory next to `config.toml` is merged into the configuration (the directory is created at startup). Files are read in file-name order.

| Section in a fragment | Effect |
| --- | --- |
| `[[profile]]` | Added when no profile with that `id` exists yet (the main config and earlier fragments win). The profile's source is reported as `fragment:<file name without .toml>`. |
| `[[scheme]]` | Appended to the schemes. |
| `[[action]]` | Appended to the actions. |

Anything else in a fragment (global keys, `[defaults]`, `[keys]`, `[theme]`, `[[ui_theme]]`, `[[new_tab_menu]]`) is ignored. A fragment that fails to parse is skipped, with a message on stderr.

```toml
# ~/.config/terminux/fragments/project-x.toml
[[profile]]
id = "project-x"
name = "Project X"
cmd = "bash"
cwd = "~/src/project-x"
env = { NODE_ENV = "development" }
tab_color = "#0078d4"

[[action]]
name = "Project X tests"
command = "send_input"
input = "npm test\r"
```

## Session file

`session.json` holds the window layout that is restored at the next start when [`first_window_preference`](configuration.md#first_window_preference) is `persisted_window_layout` (the default). It is written atomically (a `.json.tmp` file is renamed over it) as `{ "version": 1, "windows": [ ... ] }`, at most every 30 seconds per window, when a window closes and at quit. Windows with neither a terminal tab nor a settings editor tab are not stored.

Per window it stores the window name and bounds (position, size, maximized), the tabs (layout tree, active pane, name, color), each pane's profile / command line / directory / title / read-only flag, which settings editor tabs were open, and **up to 5000 lines of scrollback per pane** as terminal output. Treat the file as sensitive if your terminals show secrets. Set `first_window_preference = "default_profile"` to stop writing it. The quake window is never saved.

To start fresh once, delete `session.json` while Terminux is not running (or start with a command, which skips restoring).

## Portable mode

Create an empty file named `.portable` in the same directory as the executable. Terminux then keeps all its data in `<exe dir>/settings/`:

```text
terminux.exe
.portable
settings/
  config.toml
  session.json
  fragments/
    *.toml
```

Portable mode switches both the config directory and the state directory (the session file) to `settings/`. The Windows build produces a portable executable besides the NSIS installer (see [Building and release](../developer/building-and-release.md)).

## Paths inside the config

Settings that take a file path ([`background_image`](profile-settings.md#background_image), [`bell_sound`](profile-settings.md#bell_sound), [`icon`](profile-settings.md#icon), a profile's `cwd`, an `export_buffer` `path`) are resolved as follows:

- `~` (alone or followed by `/` or `\`) expands to the home directory.
- A relative path is resolved against the **config directory**.
- Absolute paths are used as is.

For safety the backend only reads image, sound and icon files whose path appears as a string somewhere in the loaded configuration (size limit 64 MB), and only opens directories with the file manager. Starting directories that do not exist fall back to your home directory.

## Per-machine UI state

Some view settings changed from the UI are remembered in the web view's local storage rather than in `config.toml`. The first three take precedence over the config keys of the same name:

| Local storage key | Overrides | Set by |
| --- | --- | --- |
| `terminux.tabPosition` | [`tab_position`](configuration.md#tab_position) | the tab bar menu, `toggle_vertical_tabs` |
| `terminux.verticalTabWidth` | [`vertical_tab_width`](configuration.md#vertical_tab_width) | dragging the panel edge (double-click resets to the configured width) |
| `terminux.verticalTabsCollapsed` | [`vertical_tabs_collapsed`](configuration.md#vertical_tabs_collapsed) | `toggle_vertical_tabs_collapsed` |
| `terminux.settingsView` | none | the **TOML** / **Settings UI** switch of the settings tab (the view `open_settings` opens without a target) |
| `terminux.settingsAutoSave` | none | the auto-save toggle of the settings UI (default on) |
| `terminux.settingsNavWidth` | none | dragging the edge of the settings page list |

The location of web view storage is decided by the platform web view (WebKitGTK, WebView2) and the application identifier `com.terminux.app`. Toolbar edits are different: they are written to the [`toolbar`](configuration.md#toolbar) key of `config.toml`.

## Logs

Terminux writes no log files. Diagnostics go to standard error (`[frontend:<level>] ...` for web view messages, plus messages such as `ignored invalid fragment ...`, `config watcher disabled`, `tray icon unavailable`). Start Terminux from a terminal to see them (`npm run tauri dev` in development).

## Environment variables

Variables Terminux sets for the processes it starts, and the ones it reads:

| Variable | Direction | Value |
| --- | --- | --- |
| `TERM` | set | `xterm-256color` |
| `COLORTERM` | set | `truecolor` |
| `TERM_PROGRAM` | set | `terminux` |
| `TERM_PROGRAM_VERSION` | set | Terminux version |
| `TERMINUX_PROFILE_ID` | set | `id` of the profile |
| `TERMINUX_SESSION` | set | numeric id of the pty session |
| `SHELL` | read (Unix) | the user's default shell, used for `cmd = "$SHELL"` |
| `TERMINUX_SHELL` | read (Windows) | default shell for `cmd = "$SHELL"`; default `powershell.exe` |
| `XDG_CONFIG_HOME`, `XDG_STATE_HOME` | read (Linux) | relocate the config and session directories |

Profile `env` entries are added on top (they win over the values above).

## See also

- [configuration.md](configuration.md): global keys
- [profile-settings.md](profile-settings.md): profiles, `[defaults]`
- [Windows and sessions](../user-guide/05-windows.md): session restore, quake mode
- [Profiles](../user-guide/06-profiles.md): generated profiles, fragments
