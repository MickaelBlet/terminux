# Profile settings

Every setting accepted in `[defaults]` and in each `[[profile]]` of `config.toml`: how a profile starts its process, how it looks and how it behaves. Global (window-level) keys are in [configuration.md](configuration.md).

- [How settings combine](#how-settings-combine)
- [Process and identity](#process-and-identity)
- [Colors and cursor](#colors-and-cursor)
- [Font](#font)
- [Window of the pane: padding, scrollbar, opacity, background](#window-of-the-pane)
- [Tab](#tab)
- [Behavior](#behavior)
- [unfocused_appearance](#unfocused_appearance)
- [Generated profiles](#generated-profiles)

## How settings combine

The effective settings of a pane are layered, last wins:

1. Legacy global keys: `font_size`, `scrollback`, `font_family`, `right_click_context_menu`.
2. `[defaults]`.
3. The `[[profile]]` (nested tables `font`, `unfocused_appearance` and `env` are merged key by key, not replaced).
4. While the pane is **not focused**: the profile's `unfocused_appearance` keys on top.
5. Per-pane overrides: `--colorScheme`, `--title`, `--tabColor`, `--suppressApplicationTitle` (or the matching action arguments), the `set_color_scheme` action, `adjust_opacity` and `toggle_shader_effects`. These last for the life of the pane.

`[defaults]` accepts every setting below **except** the profile-identity fields `id`, `name`, `cmd`, `args`, `commandline`, `os` and `hidden`. `cwd`, `env` and `login_shell` in `[defaults]` are inherited by profiles that do not set them (`env` is merged, profile values win).

```toml
[defaults]
color_scheme = "One Half Dark"
font = { face = "JetBrains Mono", size = 13 }
env = { EDITOR = "vim" }

[[profile]]
id = "notes"
name = "Notes"
cmd = "nvim"
font = { size = 15 }        # keeps face from [defaults]
env = { NOTES = "1" }       # EDITOR is inherited
```

Every setting can also be written as a sub-table (`[defaults.font]`, `[profile.font]`, `[profile.env]`, `[profile.unfocused_appearance]`).

## Process and identity


### id

**Type:** string | **Default:** required (profiles only) | **Windows Terminal:** `guid` (Terminux uses a readable id)

Stable identifier of the profile: used by `default_profile`, `-p` / `--profile`, the `profile` argument of actions and menus, and `TERMINUX_PROFILE_ID` in the process environment. A profile without an `id` makes the file invalid.

```toml
[[profile]]
id = "python"
```

### name

**Type:** string | **Default:** the `id` | **Windows Terminal:** `name`

Display name in menus, the palette and the profile picker. `-p` and menus also accept the name (case-insensitive).

```toml
name = "Python"
```

### cmd

**Type:** string | **Default:** `""` (the user's shell) | **Windows Terminal:** `commandline` (program part)

Program to run. `"$SHELL"` (or an empty value) means the user's default shell (`$SHELL` on Unix, `%TERMINUX_SHELL%` or `powershell.exe` on Windows). On Unix any other command is started through your **interactive login shell** (`$SHELL -lic 'exec cmd args'`) so that PATH from your rc files (nvm, `~/.local/bin`, ...) applies; set `login_shell = false` to run it directly. On Windows `.exe` commands run directly and anything else (`.cmd`, `.ps1` shims such as npm-installed CLIs) through `cmd.exe /d /c`.

```toml
cmd = "python3"
```

### args

**Type:** array of strings | **Default:** `[]`

Arguments passed to `cmd`.

```toml
cmd = "ssh"
args = ["-p", "2222", "host"]
```

### commandline

**Type:** string | **Default:** unset | **Windows Terminal:** `commandline`

Alternative to `cmd` + `args`: a full command line, split into words (single and double quotes group; a backslash only escapes a double quote so Windows paths survive). Only used when `cmd` is empty.

```toml
commandline = "wsl.exe -d Ubuntu --cd ~"
```

### cwd

**Type:** string | **Default:** unset (inherits `[defaults]`, else the directory of the pane being split, else home) | **Windows Terminal:** `startingDirectory`

Starting directory (`~` expanded). If it does not exist the next candidate is used: an explicit directory from the command line or an action wins over this setting, then this setting, then the directory of the pane a split comes from, then your home directory. Alias: `starting_directory`.

```toml
cwd = "~/src"
```

### starting_directory

**Type:** string | **Default:** unset | **Windows Terminal:** `startingDirectory`

Alias of [`cwd`](#cwd).

```toml
starting_directory = "~/src"
```

### env

**Type:** table of strings | **Default:** `{}`

Extra environment variables for the process. Merged with `[defaults].env` (the profile wins) and applied after the variables Terminux sets ([file-locations.md](file-locations.md#environment-variables)).

```toml
env = { EDITOR = "vim", LANG = "en_US.UTF-8" }
```

### os

**Type:** string | **Default:** unset

**Values:** `linux`, `windows`, `macos`

Only keep this profile on the given operating system; on others it is dropped. Compared ignoring case with the current OS.

```toml
os = "windows"
```

### login_shell

**Type:** boolean | **Default:** unset (inherits `[defaults]`; unset behaves as `true` for non-shell commands on Unix)

Unix: run `cmd` through an interactive login shell (see `cmd`). `false` executes it directly. Generated profiles (SSH, WSL, PowerShell) are `false`.

```toml
login_shell = false
```

### hidden

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `hidden`

Hide the profile from menus and profile lists (it can still be started by id with `-p`, `default_profile`, ...). A user profile with the same `id` as a generated one with `hidden = true` hides that generated profile.

```toml
hidden = true
```

### icon

**Type:** string | **Default:** unset (terminal icon) | **Windows Terminal:** `icon`

Profile icon shown in menus and tabs. Three forms: a **built-in icon name** (`terminal`, `folder`, `gear`, `lock`, `search`, `bell`, ...), an **image path** (anything containing `/` or `\`, or ending in png, jpg, gif, svg, ico, webp, bmp; relative to the config directory, `~` allowed), or an **emoji / short text**. In the built-in editor, completion (`Ctrl+Space`) on `icon` lists the built-in names and emoji searchable by name (type `"pyth` to insert `"🐍"`).

```toml
icon = "🐍"
# icon = "~/icons/python.svg"
# icon = "terminal"
```

## Colors and cursor

### color_scheme

**Type:** string or table | **Default:** `"Terminux"` | **Windows Terminal:** `colorScheme`

Color scheme name (built-in or `[[scheme]]`, case-insensitive), or a light/dark pair `{ light = "...", dark = "..." }` chosen by the effective UI brightness (`app_theme`). See [color-schemes.md](color-schemes.md).

```toml
color_scheme = "Campbell"
# color_scheme = { light = "One Half Light", dark = "One Half Dark" }
```

### foreground

**Type:** string (color) | **Default:** scheme value | **Windows Terminal:** `foreground`

Text color override.

```toml
foreground = "#d6d9e0"
```

### background

**Type:** string (color) | **Default:** scheme value | **Windows Terminal:** `background`

Background color override. Also sets the cursor accent to the same color.

```toml
background = "#14161b"
```

### selection_background

**Type:** string (color) | **Default:** scheme value | **Windows Terminal:** `selectionBackground`

Selection color override.

```toml
selection_background = "#3a4256"
```

### cursor_color

**Type:** string (color) | **Default:** scheme value | **Windows Terminal:** `cursorColor`

Cursor color override.

```toml
cursor_color = "#34d399"
```

### cursor_shape

**Type:** string | **Default:** `"filled_box"` | **Windows Terminal:** `cursorShape`

**Values:** `bar`, `vintage`, `underscore`, `filled_box`, `empty_box`, `double_underscore`

Cursor shape. `vintage`, `underscore` and `double_underscore` render as an underline; `filled_box` and `empty_box` as a block; `bar` as a 2 px bar. The cursor blinks.

```toml
cursor_shape = "bar"
```

### cursor_height

**Type:** number | **Default:** unset | **Windows Terminal:** `cursorHeight`

Height of the vintage cursor (1-100). Accepted for compatibility but **not applied** by Terminux at present (the shapes above have fixed sizes).

```toml
cursor_height = 25
```

### intense_text_style

**Type:** string | **Default:** `"bold"` | **Windows Terminal:** `intenseTextStyle`

**Values:** `none`, `bold`, `bright`, `all`

How SGR 1 (bold / intense) text renders: `bold` uses a bold font weight, `bright` draws it in the bright palette colors, `all` does both, `none` neither.

```toml
intense_text_style = "all"
```

### adjust_indistinguishable_colors

**Type:** string | **Default:** `"never"` | **Windows Terminal:** `adjustIndistinguishableColors`

**Values:** `never`, `indexed`, `always`

Raise the contrast of text that is hard to read against its background: `indexed` enforces a minimum contrast ratio of 3 on indexed (palette) colors, `always` a ratio of 4.5 on all text, `never` leaves colors alone.

```toml
adjust_indistinguishable_colors = "indexed"
```

## Font

### font

**Type:** table | **Default:** `{}` (inherits `font_size` / `font_family`) | **Windows Terminal:** `font`

Font settings. Written inline (`font = { face = "...", size = 13 }`) or as a `[defaults.font]` / `[profile.font]` sub-table. Missing keys fall back to the global `font_size` / `font_family` and the defaults below. The bundled symbol and emoji fonts (Symbols Nerd Font Mono, Twemoji Mozilla, Noto Sans Symbols, Noto Sans Symbols 2, Noto Sans Math) are always appended after `face`.

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `face` | string | `JetBrains Mono` | Font family. A CSS family list is accepted (`"'Fira Code', monospace"`). |
| `size` | number (px) | `font_size` (14) | Size; clamped to 6-72 after the window zoom is added. |
| `weight` | string or number | `normal` | `thin` (100), `extra-light` (200), `light` (300), `semi-light` (350), `normal` (400), `medium` (500), `semi-bold` (600), `bold` (700), `extra-bold` (800), `black` (900), `extra-black` (950), or a number 1-1000. |
| `cell_height` | number | `1.0` | Line height multiplier, clamped to 0.8-3. |
| `cell_width` | number (px) | `0` | Extra letter spacing in px, clamped to -4..20. |
| `ligatures` | boolean | `false` | Draw programming ligatures (`->`, `=>`, `!=`, `===`, `<=`, ...). |
| `features` | table | `{}` | OpenType features as `{ tag = value }`, e.g. `{ ss01 = 1, liga = 0 }`. Tags are 4 characters. Effective with the **DOM renderer** only. |
| `axes` | table | `{}` | Variable-font axes, e.g. `{ wght = 450 }`. Effective with the **DOM renderer** only. |

Bold text uses at least weight 700 when `intense_text_style` is `bold` or `all`.

```toml
[defaults]
font = { face = "JetBrains Mono", size = 13, weight = "medium", cell_height = 1.1, ligatures = true }

[[profile]]
id = "dom-font"
name = "Stylistic set"
cmd = "$SHELL"
font = { features = { ss01 = 1, liga = 0 }, axes = { wght = 450 } }   # set renderer = "dom" globally
```


## Window of the pane

### padding

**Type:** string or number | **Default:** `"6, 4, 2, 2"` (left, top, right, bottom) | **Windows Terminal:** `padding`

Space between the pane edge and the text, in px. One value applies to all sides, two values are `horizontal, vertical`, four are `left, top, right, bottom`. A single TOML number is accepted for one value. Invalid values fall back to the default.

```toml
padding = "8"
# padding = "8, 4"
# padding = "8, 4, 8, 4"
```

### scrollbar_state

**Type:** string | **Default:** `"visible"` | **Windows Terminal:** `scrollbarState`

**Values:** `visible`, `hidden`, `always`

Scrollbar visibility. `hidden` removes the scrollbar; `visible` and `always` show it.

```toml
scrollbar_state = "hidden"
```

### opacity

**Type:** number (0-100) | **Default:** `100` | **Windows Terminal:** `opacity`

Background opacity in percent. Anything below 100 makes the window transparent: transparency is decided when a window is created, so the first time you set it below 100 you must restart Terminux (a toast says so). `Ctrl+Shift+wheel`, `increase_opacity` and `adjust_opacity` change it per pane at runtime.

```toml
opacity = 85
```

### use_acrylic

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `useAcrylic`

Blurred translucent background (Acrylic on Windows; the HUD window effect on macOS). No effect on Linux. Enabled when any profile or `[defaults]` sets it, and applied at window creation.

```toml
use_acrylic = true
```

### background_image

**Type:** string | **Default:** unset | **Windows Terminal:** `backgroundImage`

Image drawn behind the text (path; `~` expanded, relative to the config directory). Must be readable (64 MB max). With [`use_background_image_for_window`](configuration.md#use_background_image_for_window) the active pane's image is stretched under the whole window.

```toml
background_image = "~/Pictures/bg.png"
```

### background_image_stretch_mode

**Type:** string | **Default:** `"uniform_to_fill"` | **Windows Terminal:** `backgroundImageStretchMode`

**Values:** `none`, `fill`, `uniform`, `uniform_to_fill`

How the image fills the pane: `none` (natural size), `fill` (stretch to the pane), `uniform` (fit inside, keep ratio), `uniform_to_fill` (cover, keep ratio).

```toml
background_image_stretch_mode = "fill"
```

### background_image_alignment

**Type:** string | **Default:** `"center"` | **Windows Terminal:** `backgroundImageAlignment`

**Values:** `center`, `left`, `top`, `right`, `bottom`, `top_left`, `top_right`, `bottom_left`, `bottom_right`

Position of the image inside the pane.

```toml
background_image_alignment = "bottom_right"
```

### background_image_opacity

**Type:** number (0-1) | **Default:** `1.0` | **Windows Terminal:** `backgroundImageOpacity`

Opacity of the image (not of the pane).

```toml
background_image_opacity = 0.3
```

### retro_terminal_effect

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `experimental.retroTerminalEffect`

CRT scanlines and glow. `toggle_shader_effects` toggles it per pane. (Windows Terminal's pixel-shader file option is not supported.)

```toml
retro_terminal_effect = true
```

## Tab

### tab_title

**Type:** string | **Default:** unset | **Windows Terminal:** `tabTitle`

Title of the tab while the application has not set one (an application title from OSC 0/2 or a manual rename takes over). Also `--title` on the command line. Falls back to the profile name.

```toml
tab_title = "Work"
```

### suppress_application_title

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `suppressApplicationTitle`

Ignore titles set by the application (OSC 0/2), so the tab keeps `tab_title` / the profile name.

```toml
suppress_application_title = true
```

### tab_color

**Type:** string (color) | **Default:** unset | **Windows Terminal:** `tabColor`

Color of tabs of this profile (can be changed per tab from the tab menu).

```toml
tab_color = "#34d399"
```

## Behavior

### history_size

**Type:** integer (lines) | **Default:** `10000` (global `scrollback`) | **Windows Terminal:** `historySize`

Scrollback lines for this profile. Takes precedence over the global `scrollback`.

```toml
history_size = 50000
```

### snap_on_input

**Type:** boolean | **Default:** `true` | **Windows Terminal:** `snapOnInput`

Scroll to the bottom when you type.

```toml
snap_on_input = false
```

### close_on_exit

**Type:** string or boolean | **Default:** `"automatic"` | **Windows Terminal:** `closeOnExit`

**Values:** `automatic`, `graceful`, `always`, `never`, `true`, `false`

What to do when the process exits. `always` closes the pane; `never` keeps it; `automatic` and `graceful` close it only when the exit code is 0 (otherwise the pane stays with `[process exited with code N]`). In a kept pane `Enter` restarts the process and `Ctrl+D` closes the pane. `true` equals `graceful`, `false` equals `never`.

```toml
close_on_exit = "always"
```

### startup_timeout

**Type:** number (seconds) | **Default:** `15`

Restart a freshly started process that has printed no visible text within this many seconds (a hung shell). `0` disables the watchdog. Terminal-only sequences (for example ConPTY initialization) do not count as output.

```toml
startup_timeout = 30
```

### startup_retries

**Type:** integer (0-10) | **Default:** `2`

Automatic restarts when the process fails to spawn (with a delay of 1 s, 2 s, 4 s, ...) or stays silent past `startup_timeout`. After the last retry the pane shows the error; `Enter` retries manually.

```toml
startup_retries = 0
```

### bell_style

**Type:** string or array | **Default:** `"none"` | **Windows Terminal:** `bellStyle`

**Values:** `audible`, `window`, `taskbar`, `all`, `none`, or a list

What the bell (BEL) does: `audible` plays the bell sound, `window` flashes the pane, `taskbar` requests window attention, `all` does all three, `none` nothing visible. A list combines styles. Independent of this, a bell in an unfocused window raises a desktop notification when `notifications` is on.

```toml
bell_style = ["audible", "taskbar"]
```

### bell_sound

**Type:** string or array | **Default:** unset (a short built-in 880 Hz tone) | **Windows Terminal:** `bellSound`

Sound file for the audible bell (path, `~` expanded). A list picks one at random. Bursts of BEL within 150 ms play once. If the file cannot be read the built-in tone is used.

```toml
bell_sound = ["~/sounds/a.wav", "~/sounds/b.wav"]
```

### auto_mark_prompts

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `autoMarkPrompts`

Add a scroll mark on the line where you press `Enter`, for shells that do not emit [shell integration](escape-sequences.md#shell-integration-osc-133-and-osc-633) marks. Normal screen only; ignored once the shell emits marks.

```toml
auto_mark_prompts = true
```

### show_marks_on_scrollbar

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `showMarksOnScrollbar`

Show scroll marks (and prompt marks) on the scrollbar as well as in the gutter.

```toml
show_marks_on_scrollbar = true
```

### right_click_context_menu

**Type:** boolean | **Default:** `false` (global value, else `false`) | **Windows Terminal:** `experimental.rightClickContextMenu`

Right click opens the pane context menu instead of copy / paste. Per-profile counterpart of the global [`right_click_context_menu`](configuration.md#right_click_context_menu); the profile value wins.

```toml
right_click_context_menu = true
```

### reposition_cursor_with_mouse

**Type:** boolean | **Default:** `false` | **Windows Terminal:** `experimental.repositionCursorWithMouse`

Clicking on the command line moves the shell cursor there by sending arrow keys. Needs shell integration (OSC 133 `B`). Ignored while an application grabs the mouse.

```toml
reposition_cursor_with_mouse = true
```

### path_translation_style

**Type:** string | **Default:** `"none"` | **Windows Terminal:** `pathTranslationStyle`

**Values:** `none`, `wsl`, `cygwin`, `msys2`, `mingw`

How dropped file paths are rewritten before being pasted: `wsl` -> `/mnt/c/...` (and `\\wsl$\Distro\path` -> `/path`), `cygwin` -> `/cygdrive/c/...`, `msys2` -> `/c/...`, `mingw` -> `C:/...`, `none` leaves them. Without translation, paths are quoted for the host shell. Generated WSL profiles set `wsl`.

```toml
path_translation_style = "wsl"
```

## unfocused_appearance

**Type:** table | **Default:** unset | **Windows Terminal:** `unfocusedAppearance`

Appearance overrides applied while the pane does not have focus. It accepts only the appearance settings: `color_scheme`, `foreground`, `background`, `selection_background`, `cursor_color`, `cursor_shape`, `cursor_height`, `opacity`, `use_acrylic`, `background_image`, `background_image_stretch_mode`, `background_image_alignment`, `background_image_opacity` and `retro_terminal_effect`. It is merged key by key between `[defaults]` and the profile. A transparent unfocused opacity also makes the window transparent from the start.

```toml
[defaults]
unfocused_appearance = { opacity = 80 }

[[profile]]
id = "prod"
name = "Prod"
cmd = "ssh"
args = ["prod"]

[profile.unfocused_appearance]
color_scheme = "Solarized Dark"
opacity = 60
```

## Generated profiles

Terminux generates profiles from what it finds on the machine. They are computed once per run, appear after your own profiles in menus, and the first `config.toml` written lists them as `[[profile]]` blocks (marked `# generated: <source>`). Turn a source off with [`disabled_profile_sources`](configuration.md#disabled_profile_sources).

| Source | Platform | `id` | Name | Command |
| --- | --- | --- | --- | --- |
| `wsl` | Windows | `wsl-<distro>` | the distribution name | `wsl.exe -d <distro> --cd ~` (also `path_translation_style = "wsl"`). `docker-desktop*` is skipped. |
| `ssh` | all (needs `ssh` in `PATH`) | `ssh-<host>` | `SSH - <host>` | `ssh <host>` for each concrete `Host` alias in `~/.ssh/config` (patterns with `*`, `?` or `!` are skipped) |
| `powershell` | all (needs `pwsh` in `PATH`) | `pwsh` | `PowerShell` | `pwsh` |
| `windows` | Windows | `powershell`, `cmd` | `Windows PowerShell`, `Command Prompt` | `powershell.exe`, `cmd.exe` |

`<distro>` and `<host>` are lowercased with every character other than letters and digits replaced by `-` (`Ubuntu-22.04` gives `wsl-ubuntu-22-04`). Generated profiles run directly (`login_shell = false`).

**Customizing a generated profile**: define a `[[profile]]` with the same `id`. Fields you leave out are inherited from the generated one: `cmd` and `args` (when yours is empty or `$SHELL`), `name`, `cwd`, `login_shell` and every extra setting. Anything you set wins. A user profile also keeps the generated `source`, so `match_profiles` in [`new_tab_menu`](configuration.md#new_tab_menu) still sees it.

```toml
# Hide a generated profile, keep the rest
[[profile]]
id = "ssh-staging"
hidden = true

# Give a generated profile its own look
[[profile]]
id = "wsl-ubuntu-22-04"
tab_color = "#e95420"
color_scheme = "Tango Dark"
```

Profiles can also come from [fragments](file-locations.md#fragments) (`fragments/*.toml`); their `source` is `fragment:<file name>`.

## See also

- [configuration.md](configuration.md#defaults): the `[defaults]` and `[[profile]]` tables, `default_profile`, `new_tab_menu`
- [color-schemes.md](color-schemes.md): schemes for `color_scheme`
- [command-line.md](command-line.md#new-tab): `-p`, `--title`, `--tabColor`, `--colorScheme`
- [escape-sequences.md](escape-sequences.md): bell, marks, titles
