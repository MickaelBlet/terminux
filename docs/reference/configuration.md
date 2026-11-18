# Configuration

Reference of every global key in `config.toml`, grouped like the default configuration file, plus the table sections (`[defaults]`, `[[profile]]`, `[[scheme]]`, `[[ui_theme]]`, `[[action]]`, `[keys]`, `[theme]`, `[[new_tab_menu]]`) and the `toolbar` list. Settings that apply per profile are documented in [profile-settings.md](profile-settings.md).

- [How the file works](#how-the-file-works)
- [Core](#core)
- [Appearance](#appearance)
- [Startup](#startup)
- [Interaction](#interaction)
- [Tables](#tables): [`defaults`](#defaults), [`profile`](#profile), [`scheme`](#scheme), [`ui_theme`](#ui_theme), [`action`](#action), [`keys`](#keys), [`theme`](#theme), [`new_tab_menu`](#new_tab_menu), [`toolbar`](#toolbar)

## How the file works

- Location: see [file-locations.md](file-locations.md). The file is created on first run and **hot-reloaded** when saved.
- Format: TOML. Global keys must appear **before** the first `[table]` header, otherwise TOML makes them belong to that table.
- Typed (spawn-related) fields are validated when loading; a wrong type such as `font_size = "big"` makes the whole file invalid: Terminux then uses the built-in defaults and shows the error. Unknown keys are ignored by the backend; the settings tab (`Ctrl+,`) edits the file through forms, and its TOML view underlines them and offers completion (`Ctrl+Space`) and hover documentation.
- Enumerated string values ignore case, `_` and `-` (`use_new`, `useNew` and `USE-NEW` are equal). Examples here use the canonical snake_case spelling.
- A complete example using every section is in [config-example.toml](config-example.toml). The shipped default file is available read-only with `Ctrl+Alt+,`.
- Windows Terminal names are given in the *Windows Terminal* field (camelCase in `settings.json`).

## Core


### default_profile

**Type:** string | **Default:** `"shell"` | **Windows Terminal:** `defaultProfile`

Profile used for new tabs when no profile is given (id, or display name). The profile `shell` (command `$SHELL`) always exists.

```toml
default_profile = "python"
```

### font_size

**Type:** number (px) | **Default:** `14` | **Windows Terminal:** `font.size`

Terminal font size. Overridden by `font.size` of the profile / `[defaults]`. The effective size is clamped to 6-72 px including the window zoom (`Ctrl+Plus` / `Ctrl+Minus`).

```toml
font_size = 13
```

### font_family

**Type:** string (CSS font-family list) | **Default:** JetBrains Mono, then the bundled symbol fonts, then `monospace` | **Windows Terminal:** `font.face`

Font stack for terminals. A profile `font.face` replaces the first entries (the bundled fallbacks are appended after it so Nerd Font, emoji and symbol glyphs still render). Bundled: JetBrains Mono, Symbols Nerd Font Mono, Twemoji Mozilla, Noto Sans Symbols, Noto Sans Symbols 2, Noto Sans Math.

```toml
font_family = "'Fira Code', monospace"
```

### emoji_font

**Type:** string (font name or CSS font-family list) | **Default:** `'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji'`

Color emoji font, placed in the fallback stack right after Symbols Nerd Font Mono and before the bundled Twemoji Mozilla (which still covers emoji the chosen font lacks). By default the platform emoji font wins when installed: Segoe UI Emoji on Windows, Apple Color Emoji on macOS, Noto Color Emoji on most Linux distributions. Ignored when `font_family` is set (that list is used verbatim). To force Twemoji everywhere: `emoji_font = "Twemoji Mozilla"`.

```toml
emoji_font = "Segoe UI Emoji"
```

### scrollback

**Type:** integer (lines) | **Default:** `100000` | **Windows Terminal:** `historySize`

Scrollback lines per terminal. `history_size` of the profile / `[defaults]` takes precedence.

```toml
scrollback = 50000
```

### notifications

**Type:** boolean | **Default:** `true`

Desktop notifications for OSC 9 / OSC 777 and for the bell when the window is not focused (the first one asks the OS for permission). See [escape-sequences.md](escape-sequences.md#progress-and-notifications-osc-9-osc-777-bel).

```toml
notifications = false
```

### renderer

**Type:** string | **Default:** unset: `"canvas"` on Linux, `"webgl"` elsewhere

**Values:** `webgl`, `canvas`, `dom`

xterm.js renderer. WebGL is unreliable in WebKitGTK on some drivers (blank canvas on WSLg), hence the Linux default. `dom` is slowest and does not draw box/powerline glyphs, but is the only renderer that applies font `features` and `axes`. If WebGL fails or loses its context Terminux falls back to canvas.

```toml
renderer = "webgl"
```

### disabled_profile_sources

**Type:** array of strings | **Default:** `[]` | **Windows Terminal:** `disabledProfileSources`

Skip generated profiles of these sources: `wsl` (WSL distributions), `ssh` (hosts from `~/.ssh/config`), `powershell` (PowerShell 7 `pwsh`), `windows` (Windows PowerShell and Command Prompt). See [profile-settings.md](profile-settings.md#generated-profiles).

```toml
disabled_profile_sources = ["ssh", "wsl"]
```

### screen_reader

**Type:** boolean | **Default:** `false`

Enable xterm.js screen reader mode (an accessible text buffer for assistive technology).

```toml
screen_reader = true
```


## Appearance

### app_theme

**Type:** string | **Default:** `"dark"` | **Windows Terminal:** `theme`

**Values:** `dark`, `light`, `system`, `legacyDark`, `legacyLight`, `legacySystem`, or a `[[ui_theme]]` name

Theme of the application chrome (title bar, tabs, menus, palette). `dark`, `light` or `system` use the terminal background for the active tab; `legacyDark`, `legacyLight` and `legacySystem` use the plain chrome color. Any `[[ui_theme]]` `name` is also valid. `system` follows the operating system. See [`ui_theme`](#ui_theme).

```toml
app_theme = "system"
```

### tab_width_mode

**Type:** string | **Default:** `"equal"` | **Windows Terminal:** `tabWidthMode`

**Values:** `equal`, `title_length`, `compact`

How tab widths are computed: `equal` gives every tab the same width, `title_length` sizes tabs to their title, `compact` shrinks inactive tabs to their icon.

```toml
tab_width_mode = "compact"
```

### tab_title_ellipsis

**Type:** string | **Default:** `"end"`

**Values:** `end`, `start`

Where a tab title that does not fit is cut. `end` shows the beginning of the title (`~/projects/termi…`), `start` shows its right part (`…/terminux/src`), useful when the title is a path or ends with the running command.

```toml
tab_title_ellipsis = "start"
```

### tab_position

**Type:** string | **Default:** `"top"`

**Values:** `top`, `left`, `right`

Where tabs are shown: the top bar or a vertical panel on the left or right. Changing it from the UI (tab bar menu, `toggle_vertical_tabs`) stores the choice per machine, and that stored choice then wins over this key (see [file-locations.md](file-locations.md#per-machine-ui-state)).

```toml
tab_position = "left"
```

### vertical_tab_width

**Type:** integer (px) | **Default:** `200`

Initial width of the vertical tab panel. Clamped to 120-480. Dragging the panel edge stores a per-machine override; double-clicking the edge restores this value.

```toml
vertical_tab_width = 240
```

### vertical_tabs_collapsed

**Type:** boolean | **Default:** `false`

Start the vertical tab panel collapsed to icons (`toggle_vertical_tabs_collapsed` toggles it).

```toml
vertical_tabs_collapsed = true
```

### new_tab_position

**Type:** string | **Default:** `"after_last_tab"` | **Windows Terminal:** `newTabPosition`

**Values:** `after_last_tab`, `after_current_tab`

Where new tabs open.

```toml
new_tab_position = "after_current_tab"
```

### tab_switcher_mode

**Type:** string or boolean | **Default:** unset (behaves as `"in_order"`) | **Windows Terminal:** `tabSwitcherMode`

**Values:** `mru`, `in_order`, `disabled`

Behavior of `next_tab` / `prev_tab` (`Ctrl+Tab`): `mru` opens an overlay listing tabs by most recent use, which stays open while the modifier is held; `in_order` switches to the adjacent tab in tab-bar order; `disabled` also switches directly. `true` equals `mru`.

```toml
tab_switcher_mode = "mru"
```

### show_tabs_fullscreen

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `showTabsFullscreen`

Keep the tab bar visible in fullscreen.

```toml
show_tabs_fullscreen = true
```

### show_zoom_badge

**Type:** boolean | **Default:** `true` when the key is absent (the generated `config.toml` sets `false`)

Show the `ZOOM` badge in the top-right corner of a zoomed pane.

```toml
show_zoom_badge = true
```

### show_pane_title_bar

**Type:** string | **Default:** `"multiple"`

Title bar above each pane: profile icon, title, read-only flag, zoom and close buttons. Double-click the title to rename the pane ([`open_pane_renamer`](actions.md#open_pane_renamer)); the name is kept across session restore and pane moves.

- `"never"`: no bar.
- `"multiple"`: only while the tab shows several panes (split and not zoomed).
- `"always"`: on every pane. `true` / `false` are accepted as `"always"` / `"never"`.

```toml
show_pane_title_bar = "multiple"
```

### show_terminal_title_in_titlebar

**Type:** boolean | **Default:** `true` | **Windows Terminal:** `showTerminalTitleInTitlebar`

Use the active tab's title in the window title (`<title> - Terminux`). When `false` the window title is just `Terminux`.

```toml
show_terminal_title_in_titlebar = false
```

### always_on_top

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `alwaysOnTop`

Create windows above all others (read when a window is created; `toggle_always_on_top` changes it at runtime).

```toml
always_on_top = true
```

### disable_animations

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `disableAnimations`

Disable UI animations.

```toml
disable_animations = true
```

### confirm_close_all_tabs

**Type:** boolean | **Default:** `true` | **Windows Terminal:** `confirmCloseAllTabs`

Ask for confirmation before closing a window that has several terminal tabs. The dialog's *do not ask again* checkbox sets this key to `false` in your config.

```toml
confirm_close_all_tabs = false
```

### use_background_image_for_window

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `useBackgroundImageForWindow`

Stretch the **active** pane's background image under all panes of the window instead of one image per pane.

```toml
use_background_image_for_window = true
```

The title-bar [`toolbar`](#toolbar) list and the [`new_tab_menu`](#new_tab_menu) entries are documented in [Tables](#tables).


## Startup

### launch_mode

**Type:** string | **Default:** `"default"` | **Windows Terminal:** `launchMode`

**Values:** `default`, `maximized`, `fullscreen`, `focus`, `maximized_focus`

Window state of the first window. `focus` hides the tab bar. `-M`, `-F`, `-f` on the command line override it.

```toml
launch_mode = "maximized"
```

### initial_cols

**Type:** integer | **Default:** `120` | **Windows Terminal:** `initialCols`

Columns of the first window (window sized to this many cells, clamped to 20-1000). `--size` overrides it.

```toml
initial_cols = 140
```

### initial_rows

**Type:** integer | **Default:** `30` | **Windows Terminal:** `initialRows`

Rows of the first window (clamped to 5-500).

```toml
initial_rows = 40
```

### initial_position

**Type:** string | **Default:** unset | **Windows Terminal:** `initialPosition`

Top-left corner of the first window in pixels: `"x,y"`, `"x,"` or `",y"`. `--pos` overrides it.

```toml
initial_position = "100,100"
```

### center_on_launch

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `centerOnLaunch`

Center the first window on its monitor (ignored when both x and y of `initial_position` are set).

```toml
center_on_launch = true
```

### first_window_preference

**Type:** string | **Default:** `"persisted_window_layout"` | **Windows Terminal:** `firstWindowPreference`

**Values:** `persisted_window_layout`, `default_profile`

What the first launch opens: `persisted_window_layout` restores the windows, tabs, split layouts, titles and scrollback of the previous session; `default_profile` (or any other value) starts fresh and stops writing the session file. Command-line commands skip the restore. See [file-locations.md](file-locations.md#session-file).

```toml
first_window_preference = "default_profile"
```

### windowing_behavior

**Type:** string | **Default:** `"use_new"` | **Windows Terminal:** `windowingBehavior`

**Values:** `use_new`, `use_existing`, `use_any_existing` (same as `use_existing`)

Where a new `terminux` invocation goes when Terminux is already running and no `-w` is given: a new window, or the most recently used one. See [command-line.md](command-line.md#windowing_behavior).

```toml
windowing_behavior = "use_existing"
```

### startup_actions

**Type:** string | **Default:** unset | **Windows Terminal:** `startupActions`

A command line (see [command-line.md](command-line.md)) run in the first window when Terminux starts without command-line commands and without a session to restore.

```toml
startup_actions = "new-tab -p python ; split-pane -V -s .3 -p shell"
```

### start_on_user_login

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `startOnUserLogin`

Launch Terminux at login (registers an autostart entry; LaunchAgent on macOS).

```toml
start_on_user_login = true
```

### allow_headless

**Type:** boolean | **Default:** `false`

Keep running (tray icon, quake mode, global shortcuts) after the last window closes. Use the tray menu or the `quit` action to exit. Enables the tray icon.

```toml
allow_headless = true
```


## Interaction

### copy_on_select

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `copyOnSelect`

Copy the selection to the clipboard when the mouse is released.

```toml
copy_on_select = true
```

### copy_feedback

**Type:** boolean | **Default:** `true`

Show a "Copied to clipboard" toast when the selection is copied (copy action, `copy_on_select`, right click). Clipboard writes by programs (OSC 52) show nothing.

```toml
copy_feedback = false
```

### osc52_clipboard

**Type:** boolean | **Default:** `false`

Let programs set the clipboard with OSC 52 (write only, never read). Off by default: any output, such as a `cat`ed file, could otherwise replace what you paste next. See [escape-sequences.md](escape-sequences.md#clipboard-osc-52).

```toml
osc52_clipboard = true
```

### middle_click_paste

**Type:** boolean | **Default:** `true`

Paste the clipboard on middle click (also blocks the X11 primary-selection paste). `Shift`+click when an application grabs the mouse.

```toml
middle_click_paste = false
```

### right_click_paste

**Type:** boolean | **Default:** `true`

Right click copies the selection when there is one (and `copy_on_select` is off), otherwise pastes. `Ctrl`/`Shift`+right click always opens the pane menu. With `false` Terminux does not handle the right click at all (the web view's default applies).

```toml
right_click_paste = false
```

### word_separators

**Type:** string | **Default:** a space plus the characters ( ) [ ] { } ' " and backtick | **Windows Terminal:** `wordDelimiters`

Characters that delimit a word on double-click selection and in mark mode word jumps. Alias: `word_delimiters`.

```toml
word_separators = " ()[]{}',\"`/"
```

### copy_formatting

**Type:** boolean or string | **Default:** `false` | **Windows Terminal:** `copyFormatting`

**Values:** `true`, `false`, `"html"`, `"all"`, `"none"`

Also place an HTML copy with colors and styles on the clipboard. `true`, `"all"` or `"html"` enable it; `false` or `"none"` disable it. The `copy` action's `copy_formatting` argument overrides it.

```toml
copy_formatting = "html"
```

### trim_block_selection

**Type:** boolean | **Default:** `true` | **Windows Terminal:** `trimBlockSelection`

Trim trailing spaces of rectangular selections (`Alt`+drag or block mark mode). When `false`, lines are padded to the block width.

```toml
trim_block_selection = false
```

### trim_paste

**Type:** boolean | **Default:** `true` | **Windows Terminal:** `trimPaste`

Remove trailing whitespace and newlines from pasted text. Control characters (other than tab, CR, LF) are always removed.

```toml
trim_paste = false
```

### right_click_context_menu

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `experimental.rightClickContextMenu`

Right click opens the pane context menu instead of copy / paste. Can also be set per profile (the profile value wins).

```toml
right_click_context_menu = true
```

### focus_follow_mouse

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `focusFollowMouse`

Focus the pane under the mouse pointer.

```toml
focus_follow_mouse = true
```

### scroll_to_zoom

**Type:** boolean | **Default:** `true`

`Ctrl`+wheel changes the font size of the window.

```toml
scroll_to_zoom = false
```

### scroll_to_change_opacity

**Type:** boolean | **Default:** `true`

`Ctrl+Shift`+wheel changes the pane opacity (5 points per notch).

```toml
scroll_to_change_opacity = false
```

### detect_urls

**Type:** boolean | **Default:** `true` | **Windows Terminal:** `experimental.detectURLs`

Underline plain-text `http(s)` URLs and open them on Ctrl+click (Cmd+click on macOS). OSC 8 hyperlinks always work, also with Ctrl+click.

```toml
detect_urls = false
```

### detect_file_paths

**Type:** boolean | **Default:** `true`

Underline file paths printed in the terminal (with an optional `:line:col`, `(line,col)` or `", line N` suffix). Ctrl+click (Cmd+click on macOS) opens the file with [`file_link_editor`](#file_link_editor). Relative paths resolve against the pane's current directory.

```toml
detect_file_paths = false
```

### file_link_editor

**Type:** string | **Default:** unset

Command opening Ctrl+clicked file paths when [`file_link_open`](#file_link_open) is `"external"`, `"tab"` or `"pane"`, run directly (no shell) and detached. `{file}`, `{line}` and `{col}` are substituted (line/column default to `1`); the file is appended when `{file}` is absent. Unset: a new tab runs `$VISUAL` / `$EDITOR` (`vi` fallback) as `editor +line file`; on Windows, Notepad. Paths from WSL shells are passed as-is (use e.g. `"wsl code --goto {file}:{line}:{col}"`).

```toml
file_link_editor = "code --goto {file}:{line}:{col}"
# file_link_editor = "subl {file}:{line}:{col}"
# file_link_editor = "idea --line {line} {file}"
```

### file_link_open

**Type:** string | **Default:** `"builtin"`

**Values:** `"builtin"`, `"builtin_pane"`, `"external"`, `"tab"`, `"pane"`

Where Ctrl+clicked file paths open:

- `"builtin"`: Terminux's own editor in a new tab (syntax highlighting, Ctrl+S save, Ctrl+F find, Reload). Clicking a file already open focuses its tab at the line. Text files up to 8 MiB (UTF-8); only files opened this way can be saved.
- `"builtin_pane"`: the same editor as a split next to the clicked pane (direction leaving the most room).

- `"external"`: [`file_link_editor`](#file_link_editor) launched detached (fallback: `$VISUAL` / `$EDITOR` in a new tab, Notepad on Windows).
- `"tab"` / `"pane"`: a new tab / a split next to the clicked pane running `file_link_editor` as a terminal program (e.g. `"nvim +{line} {file}"`), or `$VISUAL` / `$EDITOR` / `vi` when unset. On Windows `file_link_editor` is required.

In a pane running `ssh`, a clicked path is on the remote host: it is copied with `scp` and always opens in the built-in editor (as a split with `"builtin_pane"`, else in a tab); saving uploads it back. See [Shell integration › SSH](../user-guide/10-shell-integration.md#ssh-sessions).

```toml
file_link_open = "external"
```

### ssh_follow_directory

**Type:** boolean | **Default:** `true`

Splitting (without an explicit profile) or duplicating a pane that runs an interactive `ssh` reconnects to the same host with the same options, in the remote directory reported by the remote shell (OSC 7). Without OSC 7 from the remote shell, the new session starts in the remote home. See [Shell integration › SSH](../user-guide/10-shell-integration.md#ssh-sessions).

```toml
ssh_follow_directory = false
```

### large_paste_warning

**Type:** boolean or string | **Default:** `true` | **Windows Terminal:** `largePasteWarning`

**Values:** `true`, `false`, `"always"`, `"never"`

Confirm pastes larger than 5 KiB. `true` (or `"automatic"`) warns unless the application enabled bracketed paste; `"always"` always warns; `false` or `"never"` never warns.

```toml
large_paste_warning = "always"
```

### multi_line_paste_warning

**Type:** boolean or string | **Default:** `true` | **Windows Terminal:** `multiLinePasteWarning`

**Values:** `true`, `false`, `"always"`, `"never"`

Confirm pastes that contain several lines (shows a preview). Same values and rules as `large_paste_warning`.

```toml
multi_line_paste_warning = false
```

### search_web_url

**Type:** string | **Default:** `"https://www.bing.com/search?q=%s"` | **Windows Terminal:** `searchWebDefaultQueryUrl`

URL used by `search_web`; `%s` is replaced by the URL-encoded selection.

```toml
search_web_url = "https://duckduckgo.com/?q=%s"
```

### minimize_to_tray

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `minimizeToNotificationArea`

Minimizing hides the window in the notification area (creates the tray icon).

```toml
minimize_to_tray = true
```

### always_show_tray_icon

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `alwaysShowNotificationIcon`

Always show the notification-area icon.

```toml
always_show_tray_icon = true
```

### auto_hide_window

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `autoHideWindow`

Hide the window when it loses focus (pair with `global_summon` / `quake_mode` to bring it back).

```toml
auto_hide_window = true
```


## Tables


### defaults

**Windows Terminal:** `profiles.defaults`

Settings applied to every profile; any key listed in [profile-settings.md](profile-settings.md) can be set here and is overridden by the same key in a `[[profile]]`. Nested tables (`font`, `unfocused_appearance`, `env`) are merged key by key. `[defaults]` also accepts `cwd` / `starting_directory`, `env` and `login_shell`, which are inherited by profiles that do not set them.

```toml
[defaults]
color_scheme = { light = "One Half Light", dark = "One Half Dark" }
font = { face = "JetBrains Mono", size = 13 }
padding = "8, 6"
history_size = 50000
env = { EDITOR = "vim" }
```

The same settings can be written as sub-tables: `[defaults.font]`, `[defaults.unfocused_appearance]`, `[defaults.env]`.

### profile

**Windows Terminal:** `profiles.list`

A `[[profile]]` table defines one shell, tool or remote session. Spawn fields (`id`, `name`, `cmd`, `args`, `commandline`, `cwd`, `env`, `os`, `login_shell`, `hidden`) and every setting of [profile-settings.md](profile-settings.md) are accepted.

```toml
[[profile]]
id = "python"
name = "Python"
cmd = "python3"
cwd = "~/src"
tab_color = "#d97757"
color_scheme = "One Half Dark"
env = { PYTHONDONTWRITEBYTECODE = "1" }
```

`id` is the stable key used by `default_profile`, `-p` and menus; `name` defaults to the id. A profile named `shell` (`cmd = "$SHELL"`) is added automatically when missing. Full details, inheritance rules and generated profiles: [profile-settings.md](profile-settings.md).

### scheme

**Windows Terminal:** `schemes`

`[[scheme]]` defines a color scheme: `name` plus colors (`background`, `foreground`, `cursor_color`, `cursor_accent`, `selection_background`, `selection_foreground`, `black` ... `bright_white`). Referenced by [`color_scheme`](profile-settings.md#color_scheme). The 17 built-in schemes, all color keys and the light/dark pair syntax are in [color-schemes.md](color-schemes.md).

```toml
[[scheme]]
name = "Mine"
background = "#101010"
foreground = "#e0e0e0"
cursor_color = "#ffffff"
selection_background = "#404040"
red = "#ff5555"
```

### theme

**Windows Terminal:** none

`[theme]` is a table of color keys (the same names as `[[scheme]]`, without `name`) applied on top of the active scheme for **every** pane, before the profile's own `foreground` / `background` / `selection_background` / `cursor_color`. It is the pre-parity way to tweak colors globally.

```toml
[theme]
cursor_color = "#ffcc00"
selection_background = "#2f3b54"
```

### ui_theme

**Windows Terminal:** `themes`

`[[ui_theme]]` defines an application ("chrome") theme, selected with [`app_theme`](#app_theme). All keys are optional.

| Key | Type | Values / meaning |
| --- | --- | --- |
| `name` | string | Theme name used by `app_theme` (matched ignoring case, `_` and `-`). |
| `tab.background` | string | Active tab: a color, `"terminalBackground"` (the pane background) or `"accent"`. |
| `tab.unfocused_background` | string | Inactive tabs. |
| `tab.show_close_button` | string | `always`, `hover` (default), `never`, `active_only` (aliases: `activeOnly`). |
| `tab.icon_style` | string | `default`, `hidden`, `monochrome`. |
| `tab.foreground` | string | Active tab text color (default: readable on the tab background). |
| `tab.unfocused_foreground` | string | Inactive tabs text color. |
| `tab.indicator` | string | Active tab marker: `outline` (default, joins the terminal), `underline` (bar on the terminal side), `filled` (accent tint), `none`. |
| `tab.radius` | number | Tab corner radius in px (default 6; vertical tabs 5). |
| `tab.height` | number | Tab row height in px (default 34; vertical tab items are 2 px shorter). |
| `tab_row.background` | string | Tab row (title bar) color. |
| `tab_row.unfocused_background` | string | Tab row color while the window is unfocused. |
| `window.application_theme` | string | Chrome brightness: `dark`, `light`, `system` (default `system` when omitted). |
| `window.frame` | string | Window border color (focused). |
| `window.unfocused_frame` | string | Window border color when unfocused. |
| `window.use_mica` | boolean | Mica backdrop (Windows 11). |
| `window.rainbow_frame` | boolean | Animated rainbow window border. |
| `window.font` | string | Interface font family, CSS list (tabs, menus, settings). Terminals keep their profile font. |
| `window.font_size` | number | Interface font size in px (default 12.5). |
| `colors.accent` | string | Accent: active tab outline, focus rings, highlights. |
| `colors.background` | string | Background of settings, editors and other non-terminal panes. |
| `colors.foreground` | string | Interface text. |
| `colors.muted` | string | Secondary text (inactive tabs, descriptions). |
| `colors.panel` | string | Menus, dialogs and buttons. |
| `colors.border` | string | Borders and separators. |
| `colors.hover` | string | Hovered items; a translucent color works best (`#ffffff12`). |
| `colors.warning` | string | Warnings. |
| `colors.danger` | string | Errors and destructive actions. |
| `pane.divider` | string | Split divider color (default: `colors.border`). |
| `pane.divider_width` | number | Split divider thickness in px (default 4). |
| `pane.active_border` | string | Active pane outline when the tab shows several panes (default: dimmed accent). |

Unset `colors` keep the `dark` or `light` palette chosen by `window.application_theme`. The settings UI (UI themes page) shows a live preview and a **Try** button that applies the edited theme to the window without saving.

```toml
app_theme = "midnight"

[[ui_theme]]
name = "midnight"

[ui_theme.tab]
background = "accent"
show_close_button = "hover"
icon_style = "monochrome"

[ui_theme.tab_row]
background = "#0b0f19"

[ui_theme.window]
application_theme = "dark"
frame = "#58a6ff"
rainbow_frame = false
font = "Inter, system-ui, sans-serif"

[ui_theme.colors]
accent = "#58a6ff"
border = "#1f2937"

[ui_theme.pane]
divider_width = 2
```

Inline tables work too: `tab = { background = "terminalBackground" }`.

### action

**Windows Terminal:** `actions`

`[[action]]` defines a custom action: it appears in the command palette, can be bound to keys, put on the toolbar or in the new tab menu, and run from `[keys]` by `id`. Metadata keys: `id`, `name` (palette label; defaults to a description), `icon`, `keys` (one combo or a list). `command` selects the action and **every other key is an argument**; or use `commands = [ ... ]` to run several actions. All actions and arguments are in [actions.md](actions.md).

```toml
[[action]]
id = "git_status"
name = "Git status"
keys = "Ctrl+Shift+G"
command = "send_input"
input = "git status\r"

[[action]]
name = "Dev layout"
commands = [
  { command = "new_tab", profile = "python" },
  { command = "split_pane", split = "right", profile = "shell", size = 0.3 },
]
```

`send_input` actions are also listed as *tasks* in the suggestions palette and the snippets pane. Because `name` is reserved metadata, an `[[action]]` cannot pass a `name` argument to its command.

### keys

**Windows Terminal:** `keybindings` (`actions` with `keys`)

`[keys]` maps a command name to a combo, a list of combos or `""` (unbind). Commands you do not mention keep their default keys. The full default keymap, the key syntax and rules are in [keybindings.md](keybindings.md).

```toml
[keys]
find = "F3"
paste = ["Ctrl+Shift+V", "Shift+Insert"]
clear_buffer = ""
```

### new_tab_menu

**Windows Terminal:** `newTabMenu`

`[[new_tab_menu]]` arrays describe the new-tab dropdown. When unset, every visible profile is listed (equal to a single `remaining_profiles` entry). Each entry has a `type`:

| `type` | Fields | Effect |
| --- | --- | --- |
| `profile` | `profile` (id or name), `icon` | One profile. |
| `folder` | `name`, `icon`, `entries`, `allow_empty`, `inline` | A submenu. `allow_empty = false` hides it when it has no entries (default: shown with an `(empty)` item); `inline = true` replaces a folder holding a single entry by that entry. |
| `separator` | none | A separator line. |
| `match_profiles` | `name`, `source`, `commandline` | Every visible profile matching **all** given fields: exact display `name`, `source` (`wsl`, `ssh`, `powershell`, `windows`, or `fragment:<file>`), exact `commandline` (command and arguments joined with spaces). |
| `remaining_profiles` | none | Every visible profile not already placed by a `profile`, `match_profiles` or folder entry. |
| `action` | `id`, `icon` | An `[[action]]` by its `id`, or a built-in [command name](actions.md#named-commands) (legacy names accepted). Label, icon and key hint come from the action/command; `icon` overrides the icon. Unknown ids are skipped. |

```toml
[[new_tab_menu]]
type = "profile"
profile = "python"

[[new_tab_menu]]
type = "separator"

[[new_tab_menu]]
type = "folder"
name = "Remote"
icon = "terminal"
entries = [
  { type = "match_profiles", source = "ssh" },
]

[[new_tab_menu]]
type = "remaining_profiles"

[[new_tab_menu]]
type = "action"
id = "git_status"

[[new_tab_menu]]
type = "action"
id = "open_settings"
```

Folder entries can also be written as `[[new_tab_menu.entries]]` sub-tables.

### toolbar

**Type:** array of strings | **Default:** `["duplicate_pane_right", "duplicate_pane_down", "toggle_pane_zoom", "find", "separator", "open_settings"]` | **Windows Terminal:** none

Buttons in the title-bar toolbar, left to right. Each entry is a [command name](actions.md#named-commands) (legacy names accepted), the `id` of an [`[[action]]`](#action), or `"separator"`. Unknown entries are skipped and kept in the file. Consecutive separators collapse into one. `toolbar = []` shows no buttons; deleting the key restores the default.

Right-click the toolbar (or run [`customize_toolbar`](actions.md#customize_toolbar)) to add, remove, reorder (Settings → Toolbar) or reset buttons: the result is written back to this key of `config.toml`.

```toml
toolbar = ["new_tab", "duplicate_pane_right", "separator", "git_status", "open_settings"]
```

## See also

- [profile-settings.md](profile-settings.md): `[defaults]` and `[[profile]]` settings
- [actions.md](actions.md), [keybindings.md](keybindings.md), [color-schemes.md](color-schemes.md)
- [command-line.md](command-line.md): `startup_actions` and `windowing_behavior` syntax
- [file-locations.md](file-locations.md): where `config.toml` lives
- [config-example.toml](config-example.toml): a commented example using every section
