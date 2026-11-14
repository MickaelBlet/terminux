# Migrating from Windows Terminal

Terminux follows Windows Terminal: same concepts, same action names, same default keys, same command-line syntax. What changes is the file format (TOML instead of JSON) and the spelling (snake_case instead of camelCase). This page maps `settings.json` to `config.toml` and lists what is not supported.

## Contents

- [What carries over](#what-carries-over)
- [Rules of thumb](#rules-of-thumb)
- [Worked example](#worked-example)
- [Global settings](#global-settings)
- [Profiles](#profiles)
- [Color schemes and themes](#color-schemes-and-themes)
- [Actions and key bindings](#actions-and-key-bindings)
- [Command line](#command-line)
- [Behavior differences](#behavior-differences)
- [Not supported](#not-supported)

## What carries over

- Default **key bindings** (`Ctrl+Shift+T`, `Alt+Shift+Plus`, `Ctrl+Shift+P`, `Win+`` for quake mode, ...), see [keybindings](../reference/keybindings.md).
- **Action names**, with snake_case spelling (`splitPane` is `split_pane`), and their arguments (`split`, `splitMode`, `size`, `profile`, ...), see [actions](../reference/actions.md).
- The **`wt.exe` command line** (`nt`, `sp`, `ft`, `mf`, `mp`, `swap-pane`, `;` separators, `-w`, `-d`, `-p`, ...), see [command line](../reference/command-line.md).
- Panes, tabs, tab tear-out, command palette, command-line mode (delete the `>`), mark mode, scroll marks, shell integration (OSC 133, OSC 9;9, OSC 9;4), quake mode, `new_tab_menu`, fragments, `unfocused_appearance`, light/dark scheme pairs, the 17 built-in schemes of the same names.

## Rules of thumb

1. **camelCase becomes snake_case**: `copyOnSelect` is `copy_on_select`, `colorScheme` is `color_scheme`.
2. **Enum values too**: `"afterLastTab"` is `"after_last_tab"`, `"uniformToFill"` is `"uniform_to_fill"`, `"filledBox"` is `"filled_box"`. (Several accept both spellings internally, but only snake_case is documented and offered by the editor's completion.)
3. **JSON structure maps to TOML tables**:
   - the root object is the root of `config.toml` (root keys first, above all tables);
   - `profiles.defaults` is `[defaults]`;
   - `profiles.list` entries are `[[profile]]`;
   - `schemes` entries are `[[scheme]]`, `themes` entries `[[ui_theme]]`, `actions` entries `[[action]]`, `newTabMenu` entries `[[new_tab_menu]]`;
   - `keybindings` entries become `keys` inside an `[[action]]`, or entries of `[keys]` for default commands.
4. **Profiles are identified by a string `id`**, not a GUID. `defaultProfile` takes that id. On the command line `-p` accepts the id or the name (case-insensitive).
5. **Settings location**: `~/.config/terminux/config.toml` (Windows: `%APPDATA%\terminux\config.toml`). Unknown keys are ignored (and underlined in the editor) rather than rejected.
6. **There is no `$schema` and no JSON comments**: TOML has `#` comments.

## Worked example

Windows Terminal `settings.json`:

```json
{
  "defaultProfile": "{574e775e-4f2a-5b96-ac1e-a2962a402336}",
  "copyOnSelect": true,
  "tabWidthMode": "titleLength",
  "newTabPosition": "afterCurrentTab",
  "startupActions": "new-tab -p pwsh ; split-pane -V",
  "profiles": {
    "defaults": {
      "font": { "face": "Cascadia Code", "size": 12 },
      "colorScheme": "One Half Dark",
      "opacity": 85,
      "useAcrylic": true
    },
    "list": [
      {
        "guid": "{574e775e-4f2a-5b96-ac1e-a2962a402336}",
        "name": "PowerShell",
        "commandline": "pwsh.exe -NoLogo",
        "startingDirectory": "%USERPROFILE%\\src",
        "tabColor": "#2d6cdf",
        "bellStyle": "window"
      }
    ]
  },
  "actions": [
    { "command": { "action": "splitPane", "split": "right", "splitMode": "duplicate" }, "keys": "alt+shift+plus" },
    { "command": { "action": "sendInput", "input": "git status\r" }, "keys": "ctrl+shift+g", "name": "Git status" }
  ]
}
```

Terminux `config.toml`:

```toml
default_profile = "pwsh"
copy_on_select = true
tab_width_mode = "title_length"
new_tab_position = "after_current_tab"
startup_actions = "new-tab -p pwsh ; split-pane -V"

[defaults]
font = { face = "Cascadia Code", size = 12 }
color_scheme = "One Half Dark"
opacity = 85
use_acrylic = true

[[profile]]
id = "pwsh"
name = "PowerShell"
commandline = "pwsh.exe -NoLogo"
cwd = "~/src"                       # use ~ or an absolute path
tab_color = "#2d6cdf"
bell_style = "window"

[[action]]
command = { action = "split_pane", split = "right", split_mode = "duplicate" }
keys = "Alt+Shift+Plus"

[[action]]
name = "Git status"
keys = "Ctrl+Shift+G"
command = "send_input"
input = "git status\r"
```

Notes on the example:

- `startupActions` stays a **string** with the `wt` command-line syntax; with a saved session it only runs when `first_window_preference = "default_profile"` ([Troubleshooting](16-troubleshooting.md#faq)).
- Use `~` or absolute paths instead of `%USERPROFILE%`-style variables. <!-- TODO verify: environment variable expansion in cwd -->
- A key binding that merely re-declares a default (like `alt+shift+plus` above) is redundant: `duplicate_pane_right` already has it. To rebind a default command, use `[keys]` (`duplicate_pane_right = "Alt+Shift+Plus"`).
- Generated profiles (PowerShell, cmd, WSL, SSH) exist without declaring them; in Windows Terminal their GUIDs were fixed, here their ids are `powershell`, `cmd`, `pwsh`, `wsl-<distro>`, `ssh-<host>`.

## Global settings

| Windows Terminal | Terminux (`config.toml`, root) |
| --- | --- |
| `defaultProfile` | [`default_profile`](../reference/configuration.md#default_profile) (profile id) |
| `copyOnSelect` | [`copy_on_select`](../reference/configuration.md#copy_on_select) |
| `copyFormatting` | [`copy_formatting`](../reference/configuration.md#copy_formatting) (`true`, `false`, `"html"`, `"all"`, `"none"`) |
| `trimBlockSelection` | [`trim_block_selection`](../reference/configuration.md#trim_block_selection) |
| `wordDelimiters` | [`word_separators`](../reference/configuration.md#word_separators) (alias `word_delimiters`) |
| `focusFollowMouse` | [`focus_follow_mouse`](../reference/configuration.md#focus_follow_mouse) |
| `largePasteWarning`, `multiLinePasteWarning` | [`large_paste_warning`](../reference/configuration.md#large_paste_warning), [`multi_line_paste_warning`](../reference/configuration.md#multi_line_paste_warning) |
| `searchWebDefaultQueryUrl` | [`search_web_url`](../reference/configuration.md#search_web_url) (`%s` = the selection) |
| `tabWidthMode` | [`tab_width_mode`](../reference/configuration.md#tab_width_mode) (`equal`, `title_length`, `compact`) |
| `newTabPosition` | [`new_tab_position`](../reference/configuration.md#new_tab_position) |
| `tabSwitcherMode` | [`tab_switcher_mode`](../reference/configuration.md#tab_switcher_mode) (`mru`, `in_order`, `disabled`) |
| `showTerminalTitleInTitlebar` | [`show_terminal_title_in_titlebar`](../reference/configuration.md#show_terminal_title_in_titlebar) |
| `disableAnimations` | [`disable_animations`](../reference/configuration.md#disable_animations) |
| `confirmCloseAllTabs` | [`confirm_close_all_tabs`](../reference/configuration.md#confirm_close_all_tabs) |
| `alwaysOnTop` | [`always_on_top`](../reference/configuration.md#always_on_top) |
| `launchMode` | [`launch_mode`](../reference/configuration.md#launch_mode) (`default`, `maximized`, `fullscreen`, `focus`, `maximized_focus`) |
| `initialCols`, `initialRows`, `initialPosition`, `centerOnLaunch` | [`initial_cols`](../reference/configuration.md#initial_cols), [`initial_rows`](../reference/configuration.md#initial_rows), [`initial_position`](../reference/configuration.md#initial_position), [`center_on_launch`](../reference/configuration.md#center_on_launch) |
| `firstWindowPreference` | [`first_window_preference`](../reference/configuration.md#first_window_preference) (`persisted_window_layout` is the default here; `default_profile`) |
| `windowingBehavior` | [`windowing_behavior`](../reference/configuration.md#windowing_behavior) (`use_new`, `use_existing`, `use_any_existing`) |
| `startupActions` | [`startup_actions`](../reference/configuration.md#startup_actions) (a command-line string) |
| `startOnUserLogin` | [`start_on_user_login`](../reference/configuration.md#start_on_user_login) |
| `minimizeToNotificationArea` | [`minimize_to_tray`](../reference/configuration.md#minimize_to_tray) |
| `alwaysShowNotificationIcon` | [`always_show_tray_icon`](../reference/configuration.md#always_show_tray_icon) |
| `autoHideWindow` | [`auto_hide_window`](../reference/configuration.md#auto_hide_window) |
| `disabledProfileSources` | [`disabled_profile_sources`](../reference/configuration.md#disabled_profile_sources): `"wsl"`, `"ssh"`, `"powershell"`, `"windows"` (WT's `Windows.Terminal.Wsl` is `"wsl"`) |
| `theme` | [`app_theme`](../reference/configuration.md#app_theme) (`dark`, `light`, `system`, or a `[[ui_theme]]` name) |
| `themes` | [`[[ui_theme]]`](../reference/configuration.md#ui_theme) |
| `schemes` | [`[[scheme]]`](../reference/configuration.md#scheme) |
| `actions`, `keybindings` | [`[[action]]`](../reference/configuration.md#action), [`[keys]`](../reference/configuration.md#keys) |
| `newTabMenu` | [`[[new_tab_menu]]`](../reference/configuration.md#new_tab_menu) |
| `useBackgroundImageForWindow` | [`use_background_image_for_window`](../reference/configuration.md#use_background_image_for_window) |

Terminux-only global keys worth knowing: [`trim_paste`](../reference/configuration.md#trim_paste), [`renderer`](../reference/configuration.md#renderer), [`notifications`](../reference/configuration.md#notifications), [`osc52_clipboard`](../reference/configuration.md#osc52_clipboard), [`tab_position`](../reference/configuration.md#tab_position) (vertical tabs), [`toolbar`](../reference/configuration.md#toolbar), [`allow_headless`](../reference/configuration.md#allow_headless), [`scrollback`](../reference/configuration.md#scrollback), [`font_size`](../reference/configuration.md#font_size), [`font_family`](../reference/configuration.md#font_family).

## Profiles

`profiles.defaults` becomes `[defaults]`; each entry of `profiles.list` becomes `[[profile]]`. Profile-level settings override `[defaults]`. All appearance and behavior keys listed below are accepted in both places; see [profile settings](../reference/profile-settings.md).

| Windows Terminal | Terminux | Notes |
| --- | --- | --- |
| `guid` | [`id`](../reference/profile-settings.md#id) | any unique string |
| `name` | `name` | defaults to the `id` |
| `commandline` | [`commandline`](../reference/profile-settings.md#commandline) or `cmd` + `args` | `"$SHELL"` means the user's shell; non-shell commands run via the login shell on Unix |
| `startingDirectory` | [`cwd`](../reference/profile-settings.md#cwd) (alias `starting_directory`) | `~` expanded |
| `hidden` | `hidden` | |
| `icon` | `icon` | emoji, image path or built-in name |
| `tabTitle` | [`tab_title`](../reference/profile-settings.md#tab_title) | |
| `suppressApplicationTitle` | [`suppress_application_title`](../reference/profile-settings.md#suppress_application_title) | |
| `tabColor` | [`tab_color`](../reference/profile-settings.md#tab_color) | |
| `source` | (generated) | see [Profiles](06-profiles.md); not user-settable |
| `elevate` | not supported | see [below](#not-supported) |
| (none) | `env`, `os`, `login_shell` | environment variables, OS filter (`"linux"`, `"windows"`, `"macos"`), run through the login shell |
| `colorScheme` | [`color_scheme`](../reference/profile-settings.md#color_scheme) | string or `{ light = "...", dark = "..." }` |
| `foreground`, `background`, `selectionBackground`, `cursorColor` | `foreground`, `background`, `selection_background`, `cursor_color` | |
| `cursorShape`, `cursorHeight` | `cursor_shape`, `cursor_height` | `bar`, `vintage`, `underscore`, `filled_box`, `empty_box`, `double_underscore` |
| `font.face`, `font.size`, `font.weight`, `font.features`, `font.axes`, `font.cellHeight` | `font = { face, size, weight, features, axes, cell_height, cell_width, ligatures }` | flat `fontFace` / `fontSize` / `fontWeight` become the `font` table. `features` / `axes` need `renderer = "dom"` |
| `opacity`, `useAcrylic` | `opacity` (0-100), `use_acrylic` | opacity below 100 needs a first restart |
| `backgroundImage`, `backgroundImageStretchMode`, `backgroundImageAlignment`, `backgroundImageOpacity` | `background_image`, `background_image_stretch_mode`, `background_image_alignment`, `background_image_opacity` | stretch: `none`, `fill`, `uniform`, `uniform_to_fill`; alignment: `center`, `top_left`, ... |
| `experimental.retroTerminalEffect` | `retro_terminal_effect` | CSS effect, not a shader |
| `padding` | `padding` | `"all"`, `"horizontal, vertical"` or `"left, top, right, bottom"` |
| `scrollbarState` | `scrollbar_state` | `visible`, `hidden`, `always` |
| `intenseTextStyle` | `intense_text_style` | `none`, `bold`, `bright`, `all` |
| `adjustIndistinguishableColors` | `adjust_indistinguishable_colors` | `never`, `indexed`, `always` |
| `unfocusedAppearance` | `unfocused_appearance` | table with the same appearance keys, e.g. `{ opacity = 90 }` |
| `historySize` | `history_size` | scrollback lines |
| `snapOnInput` | `snap_on_input` | |
| `closeOnExit` | `close_on_exit` | `automatic`, `graceful`, `always`, `never` (`true` = graceful, `false` = never) |
| `bellStyle`, `bellSound` | `bell_style`, `bell_sound` | `audible`, `window`, `taskbar`, `all`, `none` or a list |
| `autoMarkPrompts`, `showMarksOnScrollbar` | `auto_mark_prompts`, `show_marks_on_scrollbar` | |
| `experimental.repositionCursorWithMouse` | `reposition_cursor_with_mouse` | |
| `experimental.rightClickContextMenu` | `right_click_context_menu` | |
| `pathTranslationStyle` | `path_translation_style` | `none`, `wsl`, `cygwin`, `msys2`, `mingw` |

Terminux-only profile keys: `startup_timeout`, `startup_retries` (restart a silent / failing process), `env`, `login_shell`, `os`.

## Color schemes and themes

`[[scheme]]` uses the Windows Terminal color names in snake_case:

```toml
[[scheme]]
name = "Mine"
background = "#101010"
foreground = "#e0e0e0"
cursor_color = "#ffffff"
selection_background = "#404040"
black = "#000000"
red = "#c50f1f"
# green, yellow, blue, purple, cyan, white, bright_black, bright_red, ... bright_white
```

`purple` and `bright_purple` keep Windows Terminal's names. The 17 built-in schemes: Terminux, Campbell, Campbell Powershell, Vintage, One Half Dark, One Half Light, Solarized Dark, Solarized Light, Tango Dark, Tango Light, Dark+, VSCode Dark Modern, VSCode Light Modern, CGA, IBM 5153, Ottosson, Dimidium (see [color schemes](../reference/color-schemes.md)). `[theme]` overrides colors on top of the active scheme.

`themes` (UI themes) become `[[ui_theme]]` with `[ui_theme.tab]`, `[ui_theme.tab_row]` and `[ui_theme.window]` sub-tables (`application_theme`, `frame`, `unfocused_frame`, `use_mica`, `rainbow_frame`); tab keys: `background` (`terminalBackground`, `accent` or a color), `unfocused_background`, `show_close_button` (`always`, `hover`, `never`, `active_only`), `icon_style` (`default`, `hidden`, `monochrome`). See [Appearance](07-appearance.md).

## Actions and key bindings

A Windows Terminal action:

```json
{ "command": { "action": "splitPane", "split": "right", "size": 0.3, "profile": "pwsh", "startingDirectory": "C:\\src" }, "keys": "ctrl+alt+s", "name": "Split dev" }
```

becomes:

```toml
[[action]]
name = "Split dev"
keys = "Ctrl+Alt+S"
command = "split_pane"
split = "right"
size = 0.3
profile = "pwsh"
starting_directory = 'C:\src'
```

Rules:

- `command` / `action` names: camelCase to snake_case (`newTab` -> `new_tab`, `togglePaneZoom` -> `toggle_pane_zoom`, `sendInput` -> `send_input`, `multipleActions` -> `multiple_actions` with `commands = [...]`). Terminux also accepts the nested form `command = { action = "...", ... }`. Check the name in [actions](../reference/actions.md): not every Windows Terminal action exists. <!-- TODO verify: whether camelCase action names are tolerated at runtime; the schema lint only offers snake_case -->
- Arguments are snake_case too: `splitMode` -> `split_mode`, `startingDirectory` -> `starting_directory`, `tabTitle` -> `tab_title`, `colorScheme` -> `color_scheme`, `singleLine` -> `single_line`, `copyFormatting` -> `copy_formatting`.
- `keys` accepts the same combos (`ctrl+shift+t`); case is ignored. A list of combos works.
- Rebind or unbind built-in commands in `[keys]`: `find = "F3"`, `new_window = ""`.
- Nested palette entries built with `iterateOn` / nested `commands` are not implemented; use [`[[new_tab_menu]]`](../reference/configuration.md#new_tab_menu) for the new-tab dropdown and plain `[[action]]`s for the palette.
- Action `id` is used to refer to an action from `[keys]`, `toolbar` and `new_tab_menu` (`type = "action"`).
- Extra Terminux commands: `show_suggestions`, `save_snippet`, `toggle_vertical_tabs`, `customize_toolbar`, `open_snippets_pane`, `open_cwd`, ... see [actions](../reference/actions.md).
- Old Terminux names (`split_right`, `zoom`, `tab_1`, ...) predating the Windows Terminal parity are still accepted in `[keys]`.

See [Custom actions](12-custom-actions.md).

## Command line

`wt.exe` becomes `terminux`:

```sh
wt -w 0 nt -p pwsh -d C:\src ; sp -V -s .3
terminux -w 0 nt -p pwsh -d ~/src ; sp -V -s .3     # on Linux, quote or escape ';' as '\;' in the shell
```

Supported: `new-tab`/`nt`, `split-pane`/`sp`, `focus-tab`/`ft`, `move-focus`/`mf`, `move-pane`/`mp`, `swap-pane`; options `-p`, `-d`, `--title`, `--tabColor`, `--colorScheme`, `--suppressApplicationTitle`, `--useApplicationTitle`, `-H`, `-V`, `-s`, `-D`, `-w`, `-M`, `-F`, `-f`, `--pos`, `--size`; `--appendCommandLine`, `--inheritEnvironment` and `--reloadEnvironment` are accepted and ignored. A bare command line without a subcommand is an implicit `new-tab`. Unknown options are errors. See [command line](../reference/command-line.md).

## Behavior differences

- **Session restore is on by default** (`first_window_preference = "persisted_window_layout"`), and then `startup_actions` is ignored if a session exists.
- **Settings UI**: `open_settings` opens a built-in **text editor** (TOML with completion, hover documentation and lint), not a form. `open_settings_file` opens the file in your external editor.
- **Hot reload** applies to `config.toml` and `fragments/*.toml`; an invalid file shows an error bar and keeps defaults until fixed.
- **Fragments** work like Windows Terminal fragment extensions but are plain TOML files in `fragments/` (profiles, schemes and actions only).
- **Generated profiles**: WSL (Windows), PowerShell, Windows PowerShell and cmd (Windows), and **SSH** hosts from `~/.ssh/config` (all platforms). Other WT generators (Azure Cloud Shell, Visual Studio prompts) are not generated; declare them by hand.
- **Tab drag**: tabs can be dragged out into a new window or onto another window, as in Windows Terminal.
- **Quake mode**: `quake_mode` (`Win+``) docks a window at the top of the monitor, full width and half height. Terminux also offers `global_summon`.
- **Directory inheritance**: splits and duplicated tabs inherit the directory from the shell's OSC 7 / 9;9 on Windows and from the process on Linux; see [Shell integration](10-shell-integration.md).
- **Clipboard**: `Ctrl+C` copies only with a selection (as in Windows Terminal). OSC 52 writes are opt-in (`osc52_clipboard`).
- **Extra features** Windows Terminal does not have: vertical tabs, customizable toolbar, snippets pane, suggestions from shell integration, per-profile startup retries, `renderer` choice, SSH profiles. See [Getting started](02-getting-started.md).

## Not supported

No equivalent in Tauri / xterm.js (from the project README):

- **Default terminal application** of the OS (setting Terminux as the system console host).
- **Elevation** (`elevate`, "run as administrator", the shield icon, elevated windows).
- **Jump list** entries on the taskbar.
- **HLSL pixel shaders** (`experimental.pixelShaderPath`, `pixelShaderImagePath`): only the built-in `retro_terminal_effect` is available.
- **ClearType / text antialiasing settings** (`antialiasingMode`, `rendering.*`): text rendering is done by the web engine; choose a [`renderer`](../reference/configuration.md#renderer) instead.
- **Snap to grid on resize** (`snapToGridOnResize`).
- **AltGr aliasing** (`altGrAliasing`).
- **Localization**: the interface is English only.

Also absent from the configuration schema (so ignored if present): the Windows Terminal settings UI (it is replaced by the text editor), `$schema`, per-profile `elevate`, and any key not listed in the tables above. If a setting is important to you and not listed, check [configuration](../reference/configuration.md) and [profile settings](../reference/profile-settings.md); anything not documented there is not implemented.

## See also

- [Getting started](02-getting-started.md)
- [Profiles](06-profiles.md)
- [Custom actions](12-custom-actions.md)
- [Configuration](../reference/configuration.md), [Profile settings](../reference/profile-settings.md), [Actions](../reference/actions.md), [Keybindings](../reference/keybindings.md), [Command line](../reference/command-line.md)
- [Troubleshooting](16-troubleshooting.md)
