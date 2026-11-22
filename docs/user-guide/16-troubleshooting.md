# Troubleshooting

Symptom-first fixes: rendering, WSL and WebKitGTK problems, fonts, keys that do not reach the terminal (or the reverse), clipboard, configuration errors, where files live, and a FAQ.

## Contents

- [Quick diagnosis](#quick-diagnosis)
- [Rendering](#rendering)
- [WSL / WSLg](#wsl--wslg)
- [Linux packages and WebKitGTK](#linux-packages-and-webkitgtk)
- [Fonts and glyphs](#fonts-and-glyphs)
- [Keys](#keys)
- [Mouse](#mouse)
- [Clipboard and OSC 52](#clipboard-and-osc-52)
- [Configuration errors and hot reload](#configuration-errors-and-hot-reload)
- [Where files live](#where-files-live)
- [Logs](#logs)
- [Shell integration and directories](#shell-integration-and-directories)
- [Processes and profiles](#processes-and-profiles)
- [FAQ](#faq)

## Quick diagnosis

1. Run Terminux from another terminal so you can see its log (`terminux 2>&1 | tee terminux.log`). See [Logs](#logs).
2. Look at the top of the window: a red `Config error, using defaults - ...` bar means your `config.toml` does not parse.
3. Open the settings with `Ctrl+,` and switch to the **TOML** view (or run "Open settings file (TOML editor)" from the palette): it underlines unknown keys (warnings) and syntax errors. If the file does not parse, the settings UI shows the error and a button to open the TOML view.
4. Try a clean profile: rename `config.toml` (a default one is regenerated) and relaunch.

## Rendering

Terminux draws terminals with xterm.js using one of three renderers, chosen by [`renderer`](../reference/configuration.md#renderer):

| Value | Notes |
| --- | --- |
| `canvas` | **Default on Linux.** Reliable on WebKitGTK. |
| `webgl` | **Default on Windows / macOS.** Fastest. If the WebGL context is lost or unavailable Terminux falls back to `canvas` automatically. |
| `dom` | Opt-in only. Needed for OpenType `features` / variable-font `axes` (the canvas and WebGL renderers ignore CSS font features), but it does **not** draw custom box-drawing / powerline glyphs. |

```toml
renderer = "canvas"     # "webgl" | "canvas" | "dom"
```

Symptoms:

- **Blank or black window, nothing drawn** (Linux, WSLg, some GPU drivers): see [WSL / WSLg](#wsl--wslg); use `renderer = "canvas"` (already the Linux default) or `"dom"`.
- **Glitches / slow redraw on Windows**: try `renderer = "canvas"`.
- **Ligatures or `font.features` have no effect**: ligatures use their own joiner (`font.ligatures = true`); stylistic sets and `axes` need `renderer = "dom"`.
- **Transparency does not work**: `opacity` below 100 needs a restart the first time (window transparency is enabled at window creation), and a compositing desktop on Linux. A toast tells you to restart.
- **Acrylic / mica**: `use_acrylic` is for Windows / macOS and `use_mica` (in a `[[ui_theme]]` `window` table) for Windows 11; neither does anything on Linux.
- **Retro effect looks wrong**: it is a CSS CRT effect (`retro_terminal_effect`), not an HLSL shader; custom shaders are not supported.

The renderer actually used per pane is logged (`pane <id> opened renderer=...`).

## WSL / WSLg

Running **Terminux inside WSL** (Linux build under WSLg):

- WebKitGTK's DMABUF renderer shows a blank window on WSLg and some GPU drivers. Terminux sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` itself on Linux unless the variable is already defined. If you export it to another value in your environment, that value is used.
- Keep `renderer` at its Linux default (`canvas`).
- Install the runtime dependencies (`webkit2gtk-4.1`, see [Installation](01-installation.md)) and a working WSLg (`wsl --update`).
- A notification daemon is usually missing in WSL, so desktop notifications may not show.
- Global shortcuts (quake mode) are registered with the Linux window system and normally do not work under WSLg.

Using **WSL from Terminux on Windows**: generated profiles `wsl-<distro>` start `wsl.exe -d <distro> --cd ~`. If a distro is missing, run `wsl.exe -l -q` in a shell; `docker-desktop*` entries are always skipped. Disable WSL profiles with `disabled_profile_sources = ["wsl"]`. See [Recipes: WSL](15-recipes.md#wsl).

## Linux packages and WebKitGTK

- deb/rpm need the host `webkit2gtk-4.1` and glibc 2.35 or newer (built on Ubuntu 22.04). Older distributions (for example RHEL / Rocky 8, glibc 2.28) should use the **AppImage**, which bundles WebKitGTK, GTK, Mesa and glibc.
- In the AppImage Terminux removes `GTK_MODULES` from the environment, because host GTK modules cannot load in the bundled GTK. Avoid forcing it back.
- Missing icons or fonts in the UI, or a crash at startup after a distribution upgrade, usually point to a WebKitGTK / GTK mismatch: reinstall the package or use the AppImage.
- See [Installation](01-installation.md).

## Fonts and glyphs

- Bundled: JetBrains Mono, Symbols Nerd Font Mono, Twemoji Mozilla, Noto Sans Symbols / Symbols 2 / Math. The default stack is JetBrains Mono, Symbols Nerd Font Mono, the system color emoji font (`emoji_font`), Twemoji Mozilla, the Noto symbol fonts, then `monospace`, so Nerd Font icons, powerline glyphs and emoji work without installing anything.
- To use your own font set `font.face` (profile or `[defaults]`) to its **family name** as the system lists it, and keep a fallback list in `font_family` if you need symbols:

  ```toml
  [defaults]
  font = { face = "Cascadia Code", size = 13, weight = "normal" }
  ```

- Fonts are awaited for at most about two seconds at startup; a font that is not installed silently falls back to the next entry of the stack.
- **Misaligned / cut-off glyphs**: adjust `font.cell_height` (line height multiplier) and `font.cell_width` (extra letter spacing in px). Try `renderer = "canvas"`.
- **Missing icons from a prompt (starship, powerlevel10k)**: keep `Symbols Nerd Font Mono` in the stack (it is by default). If you override `font_family`, append it.
- **Blurry text on HiDPI**: Terminux follows the OS scale factor; fractional scaling on some Linux setups blurs web content. Try a different scale or `renderer = "dom"`.
- **Ligatures**: `font.ligatures = true`; JetBrains Mono has them.
- Font size shortcuts: `Ctrl+Plus` / `Ctrl+Minus` / `Ctrl+0` and `Ctrl+wheel` (`scroll_to_zoom`).

## Keys

Terminux handles a key as an *action* when it is bound; when the action cannot apply it returns "not handled" and the key reaches the program. That is why `Ctrl+C` copies only when there is a selection and otherwise interrupts the program, and why `Ctrl+Shift+F` does nothing special in a settings tab.

**A key does not reach my program (vim, tmux, emacs, htop).** It is bound to an action. Find out which: open the command palette (every command shows its key) or **Settings** > **Keyboard**, which lists every binding, flags conflicting combos and lets you remove or re-record a combo. Or edit `[keys]`:

```toml
[keys]
new_window = ""                 # unbind a default: the key reaches the terminal again
find = "F3"                     # or move it
next_tab = ["Ctrl+PageDown"]    # lists are accepted
```

Common collisions: `Alt+Arrows` (move focus), `Alt+Shift+Arrows` (resize), `Ctrl+Tab` (next tab), `Alt+Enter` (fullscreen), `Ctrl+Alt+digits` (tabs), `Enter` and `Ctrl+C` (copy, only with a selection), `Ctrl+V` (paste), `Ctrl+Shift+*`. The full default keymap is in [keybindings](../reference/keybindings.md).

**A key I bound does nothing.** Check, in this order: the combo spelling (`Ctrl+Shift+Plus`, not `Ctrl+Shift++`; `Ctrl+Shift+Period`; names in [keybindings](../reference/keybindings.md)); that no later binding (an `[[action]]` `keys`) re-claims the same combo (actions override `[keys]` which override defaults); that the OS or desktop environment does not intercept the combo first (global shortcuts of the DE, `Alt+Tab`, `Super+...`); that the pane is a terminal (`find`, `copy`, scroll commands need a terminal pane).

**Shift+Enter submits instead of adding a newline.** Terminux sends `ESC CR` for `Shift+Enter`; check the program supports it and that you did not rebind it.

**Ctrl+V does not paste an image.** See [Text and clipboard](08-text-and-clipboard.md#image-paste-passthrough): only a plain `Ctrl+V` with **no text** in the clipboard is forwarded to the program.

**AltGr / international layouts.** Layout-independent key names are tried first (physical key), then the produced character (so `Alt+Shift+-` works on AZERTY). Windows Terminal's AltGr aliasing option is not implemented.

**Dead keys / IME.** Handled by the webview; if a composition fails, test in another application first.

## Mouse

- Programs that capture the mouse (vim, tmux, htop, ...) receive clicks and drags; hold `Shift` to select text yourself or `Shift+click` to paste.
- **Right click pastes** (or copies the selection) by default; set `right_click_context_menu = true` for a menu, `Ctrl+right-click` always opens the menu.
- Middle click pastes the **clipboard** (the X11 primary selection is not used).
- Horizontal scrolling reaches programs that capture the mouse; `Shift+wheel` scrolls like the plain wheel (and is reported with Shift to those programs).
- Focus-follows-mouse is `focus_follow_mouse`; `Ctrl+wheel` zooms (`scroll_to_zoom`); `Ctrl+Shift+wheel` changes opacity (`scroll_to_change_opacity`).

## Clipboard and OSC 52

- **Copy**: `Ctrl+Shift+C`, `Ctrl+Insert`, `Enter` or `Ctrl+C` with a selection; or `copy_on_select = true`. HTML copy (colors) with `copy_formatting`.
- **Paste**: `Ctrl+V`, `Ctrl+Shift+V`, `Shift+Insert`, middle/right click. Control characters (except tab, CR, LF) are stripped from pasted text; trailing whitespace is trimmed unless `trim_paste = false`.
- **Paste confirmation dialogs**: shown for pastes over 5 KiB (`large_paste_warning`) and for several lines (`multi_line_paste_warning`), by default only when the application did not enable bracketed paste. Set to `"always"` / `"never"` / `false` as needed.
- **A remote program (vim over ssh, tmux) cannot set my clipboard**: OSC 52 is **off** by default. Enable with `osc52_clipboard = true` (also `set -g set-clipboard on` in tmux and OSC 52 support in the program). Only **writes** are honored; read requests (`?`) are ignored, and payloads above about 768 KB of text are dropped. It is off by default because any output (a `cat`ed file) could silently replace your clipboard.
- **Clipboard empty on Wayland / headless Linux**: the clipboard backend needs a running display session; check that a clipboard manager works in other apps.
- **Dropped files**: dropping a file pastes its path; for WSL / Cygwin targets set `path_translation_style`.

## Configuration errors and hot reload

- Terminux watches `config.toml` **and** `fragments/*.toml`. A save applies immediately in every window; no restart is needed (exceptions: first-time transparency, `start_on_user_login` and tray settings take effect through the OS; global shortcuts are re-registered).
- **Config error bar**: if the file is not valid TOML (or a value has the wrong type), Terminux uses the built-in defaults for that load and shows `Config error, using defaults - <path>: <message>` at the top. Your file is untouched. Fix it and save; it reloads by itself.
- **TOML editor** (`open_settings_toml`, or the **TOML** button of the settings UI opened with `Ctrl+,`): `Ctrl+Space` completes keys and values, `Ctrl+S` saves, `Ctrl+F` finds, `Ctrl+H` replaces. Red = parse error (saving is refused with the message), yellow = unknown key or section (the app ignores it silently, usually a typo). Hover a key for its documentation. Click the swatch before a hex color (`"#rgb"`, `"#rrggbb"`, with optional alpha) to pick it with the system color picker. A "changed on disk" notice appears if the file was edited elsewhere. The read-only defaults are at `Ctrl+Alt+,`; edit in an external editor with `Ctrl+Shift+,`.
- Typical mistakes:
  - A root key placed **after** a `[table]` becomes a key of that table: put `toolbar`, `startup_actions`, `default_profile`, ... at the top.
  - `[[action]]` placed after `[keys]` or `[theme]` is parsed in the wrong context; put actions earlier.
  - Backslashes in Windows paths inside `"..."` are escapes (`"C:\Users"` is invalid). Use `'C:\Users'` or `"C:\\Users"`.
  - Duplicate keys or two `[defaults]` tables are TOML errors.
  - A table `font = { ... }` and a separate `[defaults.font]` section for the same thing conflict; use one form.
  - Wrong value spelling: enums are snake_case strings (`"after_last_tab"`, `"title_length"`); see [configuration](../reference/configuration.md).
  - `startup_actions` ignored: a saved session wins, see the [FAQ](#faq).
- Invalid fragment files are skipped and reported on stderr, the rest of the config still loads.
- To start over, move `config.toml` away: a fresh one (with the profiles generated on your machine listed) is written on the next launch.

## Where files live

| What | Linux | Windows | Portable |
| --- | --- | --- | --- |
| Config | `~/.config/terminux/config.toml` (respects `XDG_CONFIG_HOME`) | `%APPDATA%\terminux\config.toml` | `<exe dir>/settings/config.toml` |
| Fragments | `~/.config/terminux/fragments/*.toml` | `%APPDATA%\terminux\fragments\*.toml` | `<exe dir>/settings/fragments/` |
| Session (restore) | `~/.local/state/terminux/session.json` (`XDG_STATE_HOME`) | `%LOCALAPPDATA%\terminux\session.json` | `<exe dir>/settings/session.json` |

Portable mode is enabled by an empty file named `.portable` next to the executable. Relative paths in the config (`background_image`, `bell_sound`) resolve against the config directory. The `~` prefix means your home directory. Details in [file locations](../reference/file-locations.md).

Open the settings directory from the palette: "Open settings directory".

## Logs

There is no log file: Terminux writes diagnostics to **stderr**, including the messages of the web UI (`console.info/warn/error` are forwarded). Start it from a terminal to read them:

```sh
terminux 2>&1 | tee terminux.log
```

On Windows release builds there is no console window; run a debug build or start from a console build to see output.

What you may see: `pane <id> opened renderer=...`, `config watcher disabled: ...` (the file watcher could not start: edits are then not hot-reloaded), `ignored invalid fragment <path>`, `startup_actions: <error>`, `terminux: <error>` for bad command lines, `global shortcuts` warnings.

When reporting a bug, include: OS and version, install method (deb / rpm / AppImage / NSIS / portable), the version shown in the About dialog (palette: "About Terminux"), the log, and a minimal `config.toml`.

## Shell integration and directories

See [Shell integration: Troubleshooting](10-shell-integration.md#troubleshooting) for marks, exit-code colors and prompt frameworks, and [Current directory](10-shell-integration.md#current-directory-osc-7-vs-osc-99) for why splits may not start in the current directory.

## Processes and profiles

- **"command not found" in a profile (Linux)**: non-shell commands run via `$SHELL -lic "exec <cmd> ..."`, so PATH must be set in the *login/interactive* rc files. Use an absolute `cmd`, or `login_shell = false` and set `env`.
- **Pane stays blank / restarts at startup**: `startup_timeout` (default 15 seconds, `0` disables) restarts a new process that printed nothing; `startup_retries` (default 2) limits automatic restarts after spawn failures or silent startups.
- **Pane says the process exited**: press `Enter` to restart it, `Ctrl+D` to close it. `close_on_exit` chooses whether panes close (`automatic` closes on exit code 0 only).
- **Profile missing from the menu**: it has `hidden = true`, an `os` that does not match this OS, or a duplicate `id`; generated ones are filtered by `disabled_profile_sources`.
- **Wrong default shell**: on Unix the `shell` profile runs `$SHELL`; on Windows the default is `powershell.exe` unless the environment variable `TERMINUX_SHELL` is set.
- **Programs complain about `TERM`**: Terminux sets `TERM=xterm-256color` and `COLORTERM=truecolor`. Override with the profile's `env` if needed.

## FAQ

**Why did my `startup_actions` not run?** By default Terminux restores the previous session when one exists (`first_window_preference = "persisted_window_layout"`). `startup_actions` runs only when no session was restored and no command-line actions were given. Set `first_window_preference = "default_profile"` to always use it.

**Why does a new tab not open in my current directory?** Splits and duplicated tabs inherit the directory; new tabs start in the profile's `cwd` (or home). Use `-d` or `starting_directory`.

**Why do my splits ignore the current directory?** The profile has a `cwd`, which overrides inheritance. Remove it. See [Shell integration](10-shell-integration.md#current-directory-osc-7-vs-osc-99).

**Ctrl+C does not copy / always copies?** It copies only with a selection. Without one it is the interrupt. Use `Ctrl+Shift+C` to always be explicit.

**How do I reset everything?** Move `config.toml` and `session.json` away (see [Where files live](#where-files-live)).

**How do I make Terminux behave like Terminator / tmux?** See [Recipes](15-recipes.md#terminator-style-keys) and [Panes](04-panes.md).

**Does it support X?** Coming from Windows Terminal, see the unsupported list in [Migrating](17-migrating-from-windows-terminal.md#not-supported).

**How do I run a command in a new tab from a script?** `terminux nt -p <profile> -d <dir> <command>`; see [command line](../reference/command-line.md).

**Can I disable desktop notifications?** `notifications = false`. See [Notifications and bell](14-notifications-and-bell.md).

**Where do I report problems?** Open an issue in the project repository with the information listed under [Logs](#logs).

## See also

- [Installation](01-installation.md)
- [Shell integration](10-shell-integration.md)
- [Configuration reference](../reference/configuration.md) and [file locations](../reference/file-locations.md)
- [Keybindings](../reference/keybindings.md)
- [Notifications and bell](14-notifications-and-bell.md)
