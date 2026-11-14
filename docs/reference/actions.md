# Actions

Every action Terminux can run: the named commands you can bind in [`[keys]`](configuration.md#keys), list in the command palette or put on the [`toolbar`](configuration.md#toolbar), and the parameterised actions behind them that you can use in [`[[action]]`](configuration.md#action) entries, [`startup_actions`](configuration.md#startup_actions) and the palette. Names follow Windows Terminal in snake_case (Windows Terminal `newTab` is `new_tab`).

- [How actions are written](#how-actions-are-written)
- [Parameterised actions](#parameterised-actions)
- [Named commands by category](#named-commands)

## How actions are written

An action is a `command` plus optional arguments. The same object is produced by every entry point:

```toml
# 1. Bind a named command to a key (see keybindings.md)
[keys]
find = "F3"
paste = ["Ctrl+Shift+V", "Shift+Insert"]
clear_buffer = ""                      # unbind

# 2. A custom [[action]]: command + its arguments in the same table
[[action]]
id = "right_python"                    # optional: usable in [keys], toolbar, new_tab_menu
name = "Python on the right"           # label in the command palette
icon = "terminal"                      # optional
keys = "Ctrl+Alt+C"                    # optional: one combo or a list
command = "split_pane"
split = "right"
profile = "python"
size = 0.4

# 3. Several actions in order
[[action]]
name = "Dev layout"
commands = [
  { command = "new_tab", profile = "python" },
  { command = "split_pane", split = "right", profile = "shell", size = 0.3 },
]
```

- Windows Terminal style `command = { action = "splitPane", ... }` tables are also parsed: `action` is an accepted alias of `command` and a nested table is unwrapped. Terminux action names are snake_case.
- `[[action]]` metadata keys are `id`, `name`, `icon` and `keys`; every other key is passed as an argument.
- A command line (`new-tab -p python ; split-pane -H`) produces the same actions: see [command-line.md](command-line.md).
- A handler that cannot act returns "not handled" and the key press then reaches the terminal (for example `copy` without a selection sends `Ctrl+C` to the program).
- While text is being edited (settings editor, palette, dialogs) only window-level commands stay active: `new_tab`, `new_window`, `close_tab`, `close_pane`, `close_window`, `next_tab`, `prev_tab`, `switch_to_tab`, `command_palette`, `open_settings`, `toggle_fullscreen`, `toggle_focus_mode`, `toggle_vertical_tabs`, `toggle_always_on_top`, `adjust_font_size`, `reset_font_size`, `quit`, `open_new_tab_dropdown`, `tab_search`, `restore_last_closed`, `quake_mode`, `global_summon`, `minimize_to_tray`, `identify_window`, `identify_windows`, `customize_toolbar`.
- In `[keys]`, old pre-parity names are still accepted (listed under each command as *Legacy names*).
- Terminux-specific additions with no Windows Terminal counterpart: `toggle_vertical_tabs`, `toggle_vertical_tabs_collapsed`, `save_snippet`, `open_cwd`, `customize_toolbar`, `open_snippets_pane`, `equalize_panes`, `show_recent_commands`.

## Parameterised actions

These are the underlying `command` values with their arguments. Named commands below are presets of them (for example `duplicate_pane_right` is `split_pane` with `split = "right"` and `split_mode = "duplicate"`). Argument names are the same in `[[action]]` tables, in `commands = [...]` lists and in the JSON produced by the command-line parser.

### find_match

Jump to the next or previous match of the current search query (the search bar must have been used).

Named commands using it: [`find_next`](#find_next), [`find_prev`](#find_prev).

Windows Terminal: `findMatch`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `direction` | string | `next` | `next` or `prev` (any value starting with `prev` means previous). |

```toml
[keys]
find_next = "F3"
find_prev = "Shift+F3"
```

### rename_tab

Set the active tab's title; without `title` it resets to automatic.

Named commands using it: [`reset_tab_title`](#reset_tab_title).

Windows Terminal: `renameTab`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `title` | string | none (reset) | New tab title. |

```toml
[[action]]
name = "Title: build"
command = "rename_tab"
title = "build"
```

### set_tab_color

Set the active tab's color; without `color` it resets.

Named commands using it: [`reset_tab_color`](#reset_tab_color).

Windows Terminal: `setTabColor`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `color` | string | none (reset) | Color such as `"#34d399"`. |

```toml
[[action]]
name = "Red tab"
command = "set_tab_color"
color = "#c50f1f"
```

### switch_to_tab

Switch to a tab by index.

Named commands using it: [`switch_to_last_tab`](#switch_to_last_tab), [`switch_to_tab_1`](#switch_to_tab_1), [`switch_to_tab_2`](#switch_to_tab_2), [`switch_to_tab_3`](#switch_to_tab_3), [`switch_to_tab_4`](#switch_to_tab_4), [`switch_to_tab_5`](#switch_to_tab_5), [`switch_to_tab_6`](#switch_to_tab_6), [`switch_to_tab_7`](#switch_to_tab_7), [`switch_to_tab_8`](#switch_to_tab_8).

Windows Terminal: `switchToTab`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `index` | integer | `0` | 0-based tab index; a negative value selects the last tab. |

```toml
[[action]]
name = "Go to tab 3"
keys = "Ctrl+Alt+F3"
command = "switch_to_tab"
index = 2
```

### move_tab

Move the active tab within the window, or to another window.

Named commands using it: [`move_tab_forward`](#move_tab_forward), [`move_tab_backward`](#move_tab_backward), [`move_tab_to_new_window`](#move_tab_to_new_window).

Windows Terminal: `moveTab`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `direction` | string | `forward` | `forward` or `backward` (ignored when `window` is set). |
| `window` | string or integer | none | Target window: id, name, `new` / `-1` (new window), `last` / `0` (most recently focused other window). |

```toml
[[action]]
name = "Tab to window main"
command = "move_tab"
window = "main"
```

### split_pane

Split the active pane.

Named commands using it: [`duplicate_pane_auto`](#duplicate_pane_auto), [`duplicate_pane_down`](#duplicate_pane_down), [`duplicate_pane_right`](#duplicate_pane_right), [`open_snippets_pane`](#open_snippets_pane), [`split_pane_left`](#split_pane_left), [`split_pane_right`](#split_pane_right), [`split_pane_up`](#split_pane_up), [`split_pane_down`](#split_pane_down).

Windows Terminal: `splitPane`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `split` | string | `auto` | `auto` (direction with most room), `right`, `down`, `left`, `up`; also `vertical` (= right) and `horizontal` (= down). |
| `split_mode` | string | none | `duplicate` copies the source pane's profile and settings. Without `profile`/`index` a split continues the source pane anyway. |
| `size` | number | `0.5` | Share of the **new** pane, 0.05 to 0.95. |
| `type` | string | terminal | `snippets` opens the snippets pane instead of a terminal. |
| `profile / index / commandline / starting_directory / tab_title / tab_color / color_scheme / suppress_application_title` |  |  | Same as `new_tab`. A split inherits the working directory of the pane it comes from unless `starting_directory` is given. |

```toml
[[action]]
name = "Split right, 30%"
command = "split_pane"
split = "right"
size = 0.3
profile = "shell"
```

### move_pane

Move the active pane (or selected subtree) to another tab or window.

Named commands using it: [`move_pane_to_new_tab`](#move_pane_to_new_tab), [`move_pane_to_new_window`](#move_pane_to_new_window), [`move_pane_to_tab_1`](#move_pane_to_tab_1), [`move_pane_to_tab_2`](#move_pane_to_tab_2), [`move_pane_to_tab_3`](#move_pane_to_tab_3), [`move_pane_to_tab_4`](#move_pane_to_tab_4), [`move_pane_to_tab_5`](#move_pane_to_tab_5), [`move_pane_to_tab_6`](#move_pane_to_tab_6), [`move_pane_to_tab_7`](#move_pane_to_tab_7), [`move_pane_to_tab_8`](#move_pane_to_tab_8), [`move_pane_to_tab_9`](#move_pane_to_tab_9).

Windows Terminal: `movePane`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `index` | integer | `-1` | Target tab index; `-1` (or past the end) creates a new tab. |
| `window` | string or integer | none | Target window (as `move_tab`); overrides `index`. |

```toml
[[action]]
name = "Pane to tab 2"
command = "move_pane"
index = 1
```

### scroll_to_mark

Scroll to a scroll mark.

Named commands using it: [`scroll_to_previous_mark`](#scroll_to_previous_mark), [`scroll_to_next_mark`](#scroll_to_next_mark), [`scroll_to_first_mark`](#scroll_to_first_mark), [`scroll_to_last_mark`](#scroll_to_last_mark).

Windows Terminal: `scrollToMark`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `direction` | string | `previous` | `previous`, `next`, `first`, `last`. |

```toml
[keys]
scroll_to_previous_mark = "Ctrl+Up"
```

### select_command

Select a previous or next command line (OSC 133 / 633 required).

Named commands using it: [`select_previous_command`](#select_previous_command), [`select_next_command`](#select_next_command).

Windows Terminal: `selectCommand`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `direction` | string | `prev` | `prev` or `next`. |

```toml
[keys]
select_previous_command = "Ctrl+Shift+["
```

### select_output

Select the output of a previous or next command (OSC 133 / 633 required).

Named commands using it: [`select_previous_output`](#select_previous_output), [`select_next_output`](#select_next_output).

Windows Terminal: `selectOutput`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `direction` | string | `prev` | `prev` or `next`. |

```toml
[keys]
select_previous_output = "Ctrl+Shift+]"
```

### adjust_font_size

Change the window font zoom.

Named commands using it: [`increase_font_size`](#increase_font_size), [`decrease_font_size`](#decrease_font_size).

Windows Terminal: `adjustFontSize`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `delta` | number | `1` | Pixels to add (negative to shrink). Total zoom is limited to -8..+40 px and the font to 6-72 px. |

```toml
[[action]]
name = "Bigger font"
command = "adjust_font_size"
delta = 2
```

### adjust_opacity

Change the active pane's opacity (runtime override).

Named commands using it: [`increase_opacity`](#increase_opacity), [`decrease_opacity`](#decrease_opacity).

Windows Terminal: `adjustOpacity`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `opacity` | number | `0` | Percentage (0-100). |
| `relative` | boolean | `true` | `true`: add to the current opacity; `false`: set it. |

```toml
[[action]]
name = "Opacity 80%"
command = "adjust_opacity"
opacity = 80
relative = false
```

### move_focus

Move focus between panes.

Named commands using it: [`move_focus_left`](#move_focus_left), [`move_focus_right`](#move_focus_right), [`move_focus_up`](#move_focus_up), [`move_focus_down`](#move_focus_down), [`move_focus_previous`](#move_focus_previous), [`move_focus_previous_in_order`](#move_focus_previous_in_order), [`move_focus_next_in_order`](#move_focus_next_in_order), [`move_focus_first`](#move_focus_first), [`move_focus_parent`](#move_focus_parent), [`move_focus_child`](#move_focus_child).

Windows Terminal: `moveFocus`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `direction` | string | `left` | `left`, `right`, `up`, `down`, `previous` (MRU), `previous_in_order`, `next_in_order`, `first`, `parent`, `child`. camelCase (`nextInOrder`) is accepted. |

```toml
[[action]]
name = "Focus next pane"
keys = "Ctrl+Alt+N"
command = "move_focus"
direction = "next_in_order"
```

### resize_pane

Resize the active pane by moving its border 5%.

Named commands using it: [`resize_pane_left`](#resize_pane_left), [`resize_pane_right`](#resize_pane_right), [`resize_pane_up`](#resize_pane_up), [`resize_pane_down`](#resize_pane_down).

Windows Terminal: `resizePane`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `direction` | string | `right` | `left`, `right`, `up`, `down`. |

```toml
[keys]
resize_pane_left = "Ctrl+Shift+Left"
```

### swap_pane

Swap the active pane with another.

Named commands using it: [`swap_pane_left`](#swap_pane_left), [`swap_pane_right`](#swap_pane_right), [`swap_pane_up`](#swap_pane_up), [`swap_pane_down`](#swap_pane_down), [`swap_pane_previous`](#swap_pane_previous), [`swap_pane_previous_in_order`](#swap_pane_previous_in_order), [`swap_pane_next_in_order`](#swap_pane_next_in_order), [`swap_pane_first`](#swap_pane_first).

Windows Terminal: `swapPane`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `direction` | string | `left` | `left`, `right`, `up`, `down`, `previous`, `previous_in_order`, `next_in_order`, `first`. |

```toml
[[action]]
name = "Swap with first"
command = "swap_pane"
direction = "first"
```

### set_color_scheme

Set the active pane's color scheme for this session; without `color_scheme` it opens the scheme picker with live preview.

Windows Terminal: `setColorScheme`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `color_scheme` | string | none | Scheme name (built-in or `[[scheme]]`). |

```toml
[[action]]
name = "Solarized here"
command = "set_color_scheme"
color_scheme = "Solarized Dark"
```

### send_input

Send text to the active pane's process.

Windows Terminal: `sendInput`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `input` | string | required | Text to send. Use TOML escapes: `\r` is Enter, `\x03` is Ctrl+C. An empty value is not handled. |

```toml
[[action]]
name = "Git status"
keys = "Ctrl+Shift+G"
command = "send_input"
input = "git status\r"
```

### multiple_actions

Run several actions in order.

Windows Terminal: `multipleActions`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `actions` | array | required | List of action tables. In `config.toml` write it as `commands = [ { command = "..." }, ... ]`; a string entry means a command with no arguments. |

```toml
[[action]]
name = "Dev layout"
commands = [
  { command = "new_tab", profile = "python" },
  { command = "split_pane", split = "right", profile = "shell", size = 0.3 },
]
```

### wt

Run a `wt`-style command line (see [command-line.md](command-line.md)).

Terminux extension modelled on the `wt.exe` command line.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `commandline` | string | required | e.g. `"new-tab -p python ; split-pane -H"`. Includes `-w` to target another window. |

```toml
[[action]]
name = "Two tabs"
command = "wt"
commandline = "new-tab -p shell ; new-tab -p python"
```

### rename_window

Rename the current window (names are usable as `-w` targets). `name` is reserved metadata in `[[action]]` tables (the palette label), so the argument cannot be passed from `config.toml`; use [`open_window_renamer`](#open_window_renamer) to name a window interactively.

Windows Terminal: `renameWindow`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | string | none (clears the name) | Window name (programmatic use only). |

### global_summon

Show or hide a window from anywhere using an OS-level shortcut (set `keys` on the `[[action]]`; registered with the operating system, only reacts when `keys` is set).

Windows Terminal: `globalSummon`.

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `name` | string | most recent window | Window name; `_quake` is the quake window. A missing window is created. In an `[[action]]` table `name` is the palette label and is not passed on, so a configured `global_summon` always targets the most recent window; use `quake_mode` for the quake window. |
| `monitor` | string | current | `toMouse` moves the window to the monitor under the cursor (non-quake windows). |
| `dropdown_duration` | integer (ms) | `0` | Slide-down animation duration; also hides instead of minimizing. |
| `toggle_visibility` | boolean | `true` | When the window is already focused, hide/minimize it. |
| `desktop` | string | ignored | Accepted by the config editor but not used by the backend. |

```toml
[[action]]
name = "Summon main window"
keys = "Ctrl+Alt+T"
command = "global_summon"
monitor = "toMouse"
```

### unbound

Does nothing and is not handled, so the key combo reaches the terminal. Use it to neutralize a binding.

Windows Terminal: `unbound`.

```toml
[[action]]
keys = "Ctrl+Shift+W"
command = "unbound"
```


## Named commands

Every name accepted in [`[keys]`](configuration.md#keys), the command palette and [`toolbar`](configuration.md#toolbar). *Hidden* commands are not listed in the palette. Default keys are the ones in effect when `[keys]` does not mention the command; see [keybindings.md](keybindings.md) for the full keymap.


---
**Application and windows**

### close_window

Close the window (asks for confirmation when it holds several terminal tabs, see [`confirm_close_all_tabs`](configuration.md#confirm_close_all_tabs)).

- Action: `close_window`
- Label: Close window
- Default keys: `Alt+F4`

```toml
[keys]
close_window = "Alt+F4"
```

### toggle_fullscreen

Toggle fullscreen. The tab bar is hidden in fullscreen unless [`show_tabs_fullscreen`](configuration.md#show_tabs_fullscreen) is set.

- Action: `toggle_fullscreen`
- Label: Toggle fullscreen
- Default keys: `Alt+Enter`, `F11`

```toml
[keys]
toggle_fullscreen = ["Alt+Enter", "F11"]
```

### toggle_focus_mode

Toggle focus mode: hides the tab bar (also what `launch_mode = "focus"` and `-f` start in).

- Action: `toggle_focus_mode`
- Label: Toggle focus mode
- Default keys: none

```toml
[keys]
toggle_focus_mode = "Ctrl+Alt+X"   # example binding
```

### toggle_vertical_tabs

Toggle between the top tab bar and the vertical tab panel (see [`tab_position`](configuration.md#tab_position)).

- Action: `toggle_vertical_tabs`
- Label: Toggle vertical tabs
- Default keys: none

```toml
[keys]
toggle_vertical_tabs = "Ctrl+Alt+X"   # example binding
```

### toggle_vertical_tabs_collapsed

Collapse the vertical tab panel to icons, or expand it. Not handled (key falls through) when tabs are at the top.

- Action: `toggle_vertical_tabs_collapsed`
- Label: Collapse/expand vertical tabs
- Default keys: none

```toml
[keys]
toggle_vertical_tabs_collapsed = "Ctrl+Alt+X"   # example binding
```

### toggle_always_on_top

Toggle always-on-top for the window.

- Action: `toggle_always_on_top`
- Label: Toggle always on top
- Default keys: none

```toml
[keys]
toggle_always_on_top = "Ctrl+Alt+X"   # example binding
```

### open_new_tab_dropdown

Open the new-tab dropdown ([`new_tab_menu`](configuration.md#new_tab_menu)) at the tab bar.

- Action: `open_new_tab_dropdown`
- Label: Open new tab dropdown
- Default keys: `Ctrl+Shift+Space`

```toml
[keys]
open_new_tab_dropdown = "Ctrl+Shift+Space"
```

### open_settings

Open the built-in settings editor (toggles it closed when it is the active tab). `target` selects another destination, see the arguments below.

- Action: `open_settings`, `target = "settings_ui"`
- Label: Open settings
- Default keys: `Ctrl+,`
- Legacy names: `open_config`

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `target` | string | `settings_ui` | `settings_ui` (built-in editor, toggles), `settings_file` or `all_files` (external editor), `defaults_file` (read-only defaults in the built-in editor), `directory` (file manager). Case and `_`/`-` are ignored. |

```toml
[[action]]
name = "Edit config externally"
command = "open_settings"
target = "settings_file"
```

### open_settings_file

Open `config.toml` in the system's external editor (`open_settings` with `target = "settings_file"`).

- Action: `open_settings`, `target = "settings_file"` ([parameters](#open_settings))
- Label: Open settings file in external editor
- Default keys: `Ctrl+Shift+,`
- Legacy names: `open_config_external`

```toml
[keys]
open_settings_file = "Ctrl+Shift+,"
```

### open_default_settings

Open the read-only default configuration in the built-in editor.

- Action: `open_settings`, `target = "defaults_file"` ([parameters](#open_settings))
- Label: Open default settings (read-only)
- Default keys: `Ctrl+Alt+,`

```toml
[keys]
open_default_settings = "Ctrl+Alt+,"
```

### open_settings_directory

Open the configuration directory in the system file manager.

- Action: `open_settings`, `target = "directory"` ([parameters](#open_settings))
- Label: Open settings directory
- Default keys: none

```toml
[keys]
open_settings_directory = "Ctrl+Alt+X"   # example binding
```

### find

Toggle the search bar of the active terminal pane (regex, case and whole-word options). Not handled when the active tab is not a terminal.

- Action: `find`
- Label: Find
- Default keys: `Ctrl+Shift+F`
- Legacy names: `search`

```toml
[keys]
find = "Ctrl+Shift+F"
```

### find_next

Jump to the next match of the current search query.

- Action: `find_match`, `direction = "next"` ([parameters](#find_match))
- Label: Find next match
- Default keys: none

```toml
[keys]
find_next = "Ctrl+Alt+X"   # example binding
```

### find_prev

Jump to the previous match of the current search query.

- Action: `find_match`, `direction = "prev"` ([parameters](#find_match))
- Label: Find previous match
- Default keys: none

```toml
[keys]
find_prev = "Ctrl+Alt+X"   # example binding
```

### toggle_shader_effects

Toggle the retro (CRT) effect of the active pane (runtime override of [`retro_terminal_effect`](profile-settings.md#retro_terminal_effect)).

- Action: `toggle_shader_effects`
- Label: Toggle retro terminal effect
- Default keys: none

```toml
[keys]
toggle_shader_effects = "Ctrl+Alt+X"   # example binding
```

### open_tab_color_picker

Open the color picker for the active tab.

- Action: `open_tab_color_picker`
- Label: Set tab color…
- Default keys: none

```toml
[keys]
open_tab_color_picker = "Ctrl+Alt+X"   # example binding
```

### open_tab_renamer

Rename the active tab inline.

- Action: `open_tab_renamer`
- Label: Rename tab…
- Default keys: none

```toml
[keys]
open_tab_renamer = "Ctrl+Alt+X"   # example binding
```

### reset_tab_title

Reset the active tab's title to automatic (`rename_tab` without `title`).

- Action: `rename_tab` ([parameters](#rename_tab))
- Label: Reset tab title
- Default keys: none

```toml
[keys]
reset_tab_title = "Ctrl+Alt+X"   # example binding
```

### reset_tab_color

Reset the active tab's color (`set_tab_color` without `color`).

- Action: `set_tab_color` ([parameters](#set_tab_color))
- Label: Reset tab color
- Default keys: none

```toml
[keys]
reset_tab_color = "Ctrl+Alt+X"   # example binding
```

### command_palette

Toggle the command palette (action mode; delete the leading `>` to type a command line, see [command-line.md](command-line.md#palette-command-line-mode)). Hidden from the palette listing.

- Action: `command_palette`
- Label: Toggle command palette
- Default keys: `Ctrl+Shift+P`
- Legacy names: `palette`
- Hidden from the palette

```toml
[keys]
command_palette = "Ctrl+Shift+P"
```

### identify_window

Briefly show this window's id (and name).

- Action: `identify_window`
- Label: Identify window
- Default keys: none

```toml
[keys]
identify_window = "Ctrl+Alt+X"   # example binding
```

### identify_windows

Show the id (and name) over every window.

- Action: `identify_windows`
- Label: Identify windows
- Default keys: none

```toml
[keys]
identify_windows = "Ctrl+Alt+X"   # example binding
```

### open_window_renamer

Prompt for a new name for this window (usable with `-w <name>`).

- Action: `open_window_renamer`
- Label: Rename window…
- Default keys: none

```toml
[keys]
open_window_renamer = "Ctrl+Alt+X"   # example binding
```

### quake_mode

Show or hide the quake window: a named window `_quake` docked full-width on the top half of the monitor under the cursor. Registered as an OS-level global shortcut (default ``Win+` ``).

- Action: `quake_mode`
- Label: Show / hide quake window
- Default keys: `` Win+` ``

```toml
[keys]
quake_mode = "Win+`"
```

### minimize_to_tray

Hide the window into the notification area (creates the tray icon).

- Action: `minimize_to_tray`
- Label: Minimize to notification area
- Default keys: none

```toml
[keys]
minimize_to_tray = "Ctrl+Alt+X"   # example binding
```

### quit

Quit Terminux: asks every window for a final session snapshot, kills all processes and exits (even with [`allow_headless`](configuration.md#allow_headless)).

- Action: `quit`
- Label: Quit
- Default keys: none

```toml
[keys]
quit = "Ctrl+Alt+X"   # example binding
```

### restore_last_closed

Reopen the last closed tab or pane (up to 20 are remembered per window). A pane returns next to its former neighbour when it still exists, otherwise as a new tab.

- Action: `restore_last_closed`
- Label: Restore last closed pane or tab
- Default keys: none

```toml
[keys]
restore_last_closed = "Ctrl+Alt+X"   # example binding
```

### open_about

Show the About dialog.

- Action: `open_about`
- Label: About Terminux
- Default keys: none

```toml
[keys]
open_about = "Ctrl+Alt+X"   # example binding
```

### show_suggestions

Open the suggestions palette: recent commands (needs shell integration) and `send_input` actions. Only handled in terminal tabs.

- Action: `show_suggestions`, `source = "all"`
- Label: Show suggestions
- Default keys: `Ctrl+Shift+Period`

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `source` | string or array | `all` | `all`, `recent_commands`, `tasks` (`send_input` actions), or a list. |
| `use_commandline` | boolean | `false` | Pre-fill the palette filter with the command line being typed. |

```toml
[[action]]
name = "Suggestions"
command = "show_suggestions"
source = ["recent_commands", "tasks"]
```

### show_recent_commands

Suggestions limited to recent commands (`show_suggestions` with `source = "recent_commands"`).

- Action: `show_suggestions`, `source = "recent_commands"` ([parameters](#show_suggestions))
- Label: Show recent commands
- Default keys: none

```toml
[keys]
show_recent_commands = "Ctrl+Alt+X"   # example binding
```

### save_snippet

Save the selection (or the command line being typed, with shell integration) as a `send_input` `[[action]]` appended to `config.toml`.

- Action: `save_snippet`
- Label: Save selection or command line as snippet
- Default keys: none

```toml
[keys]
save_snippet = "Ctrl+Alt+X"   # example binding
```

### open_cwd

Open the pane's current directory in the system file manager.

- Action: `open_cwd`
- Label: Open current directory in file manager
- Default keys: none

```toml
[keys]
open_cwd = "Ctrl+Alt+X"   # example binding
```

### customize_toolbar

Open the toolbar editor palette (add, remove and reorder title-bar buttons; saved to [`toolbar`](configuration.md#toolbar)).

- Action: `customize_toolbar`
- Label: Customize toolbar…
- Default keys: none

```toml
[keys]
customize_toolbar = "Ctrl+Alt+X"   # example binding
```


---
**Tabs**

### new_tab

Open a new tab. With no arguments it uses [`default_profile`](configuration.md#default_profile). Placed per [`new_tab_position`](configuration.md#new_tab_position).

- Action: `new_tab`
- Label: New tab
- Default keys: `Ctrl+Shift+T`

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `profile` | string | [`default_profile`](configuration.md#default_profile) | Profile `id`, or display `name` (case-insensitive). |
| `index` | integer | none | 0-based index among visible profiles (used when `profile` is not given). Out of range: the action fails. |
| `commandline` | string | profile command | Replaces the profile's command (split like a shell line; quotes group). |
| `starting_directory` | string | profile `cwd` | Starting directory (`~` expanded). Alias in CLI: `-d`. |
| `tab_title` | string | profile `tab_title` | Initial tab title. |
| `tab_color` | string | profile `tab_color` | Tab color. |
| `color_scheme` | string | profile scheme | Scheme name for this pane. |
| `suppress_application_title` | boolean | profile value | Ignore titles set by the application. |

```toml
[[action]]
name = "Python in ~/src"
command = "new_tab"
profile = "python"
starting_directory = "~/src"
tab_title = "Python"
```

### new_window

Open a new window with one new tab (same arguments as `new_tab`).

- Action: `new_window`
- Label: New window
- Default keys: `Ctrl+Shift+N`

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `(same as `new_tab`)` |  |  | `profile`, `index`, `commandline`, `starting_directory`, `tab_title`, `tab_color`, `color_scheme`, `suppress_application_title`. |

```toml
[keys]
new_window = "Ctrl+Shift+N"
```

### duplicate_tab

Duplicate the active tab (same profile and starting directory of its pane). Not handled in non-terminal tabs.

- Action: `duplicate_tab`
- Label: Duplicate tab
- Default keys: `Ctrl+Shift+D`

```toml
[keys]
duplicate_tab = "Ctrl+Shift+D"
```

### close_tab

Close a tab (default: the active one). Closed tabs are remembered for `restore_last_closed`.

- Action: `close_tab`
- Label: Close tab
- Default keys: none

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `index` | integer | active tab | 0-based tab index. |

```toml
[keys]
close_tab = "Ctrl+Alt+X"   # example binding
```

### close_other_tabs

Close every tab except one (default: the active one).

- Action: `close_other_tabs`
- Label: Close other tabs
- Default keys: none

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `index` | integer | active tab | The tab to keep. |

```toml
[keys]
close_other_tabs = "Ctrl+Alt+X"   # example binding
```

### close_tabs_after

Close the tabs to the right of one (default: the active one).

- Action: `close_tabs_after`
- Label: Close tabs to the right
- Default keys: none

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `index` | integer | active tab | Tabs after this index are closed. |

```toml
[keys]
close_tabs_after = "Ctrl+Alt+X"   # example binding
```

### next_tab

Go to the next tab. Behavior follows [`tab_switcher_mode`](configuration.md#tab_switcher_mode): in `mru` mode an overlay lists tabs by most recent use and stays open while the modifier is held.

- Action: `next_tab`
- Label: Next tab
- Default keys: `Ctrl+Tab`

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `tab_switcher_mode` | string or boolean | [`tab_switcher_mode`](configuration.md#tab_switcher_mode) | `mru` (or `true`) opens the MRU overlay; anything else (`in_order`, `disabled`) switches directly. |

```toml
[keys]
next_tab = "Ctrl+Tab"
```

### prev_tab

Go to the previous tab (see `next_tab`).

- Action: `prev_tab`
- Label: Previous tab
- Default keys: `Ctrl+Shift+Tab`

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `tab_switcher_mode` | string or boolean | [`tab_switcher_mode`](configuration.md#tab_switcher_mode) | As for `next_tab`. |

```toml
[keys]
prev_tab = "Ctrl+Shift+Tab"
```

### switch_to_last_tab

Switch to the last tab. Hidden from the palette.

- Action: `switch_to_tab`, `index = -1` ([parameters](#switch_to_tab))
- Label: Switch to the last tab
- Default keys: `Ctrl+Alt+9`
- Legacy names: `tab_9`
- Hidden from the palette

```toml
[keys]
switch_to_last_tab = "Ctrl+Alt+9"
```

### switch_to_tab_1

Switch to tab 1. Hidden from the palette.

- Action: `switch_to_tab`, `index = 0` ([parameters](#switch_to_tab))
- Label: Switch to tab 1
- Default keys: `Ctrl+Alt+1`
- Legacy names: `tab_1`
- Hidden from the palette

```toml
[keys]
switch_to_tab_1 = "Ctrl+Alt+1"
```

### switch_to_tab_2

Switch to tab 2. Hidden from the palette.

- Action: `switch_to_tab`, `index = 1` ([parameters](#switch_to_tab))
- Label: Switch to tab 2
- Default keys: `Ctrl+Alt+2`
- Legacy names: `tab_2`
- Hidden from the palette

```toml
[keys]
switch_to_tab_2 = "Ctrl+Alt+2"
```

### switch_to_tab_3

Switch to tab 3. Hidden from the palette.

- Action: `switch_to_tab`, `index = 2` ([parameters](#switch_to_tab))
- Label: Switch to tab 3
- Default keys: `Ctrl+Alt+3`
- Legacy names: `tab_3`
- Hidden from the palette

```toml
[keys]
switch_to_tab_3 = "Ctrl+Alt+3"
```

### switch_to_tab_4

Switch to tab 4. Hidden from the palette.

- Action: `switch_to_tab`, `index = 3` ([parameters](#switch_to_tab))
- Label: Switch to tab 4
- Default keys: `Ctrl+Alt+4`
- Legacy names: `tab_4`
- Hidden from the palette

```toml
[keys]
switch_to_tab_4 = "Ctrl+Alt+4"
```

### switch_to_tab_5

Switch to tab 5. Hidden from the palette.

- Action: `switch_to_tab`, `index = 4` ([parameters](#switch_to_tab))
- Label: Switch to tab 5
- Default keys: `Ctrl+Alt+5`
- Legacy names: `tab_5`
- Hidden from the palette

```toml
[keys]
switch_to_tab_5 = "Ctrl+Alt+5"
```

### switch_to_tab_6

Switch to tab 6. Hidden from the palette.

- Action: `switch_to_tab`, `index = 5` ([parameters](#switch_to_tab))
- Label: Switch to tab 6
- Default keys: `Ctrl+Alt+6`
- Legacy names: `tab_6`
- Hidden from the palette

```toml
[keys]
switch_to_tab_6 = "Ctrl+Alt+6"
```

### switch_to_tab_7

Switch to tab 7. Hidden from the palette.

- Action: `switch_to_tab`, `index = 6` ([parameters](#switch_to_tab))
- Label: Switch to tab 7
- Default keys: `Ctrl+Alt+7`
- Legacy names: `tab_7`
- Hidden from the palette

```toml
[keys]
switch_to_tab_7 = "Ctrl+Alt+7"
```

### switch_to_tab_8

Switch to tab 8. Hidden from the palette.

- Action: `switch_to_tab`, `index = 7` ([parameters](#switch_to_tab))
- Label: Switch to tab 8
- Default keys: `Ctrl+Alt+8`
- Legacy names: `tab_8`
- Hidden from the palette

```toml
[keys]
switch_to_tab_8 = "Ctrl+Alt+8"
```

### move_tab_forward

Move the active tab one position to the right.

- Action: `move_tab`, `direction = "forward"` ([parameters](#move_tab))
- Label: Move tab forward
- Default keys: none

```toml
[keys]
move_tab_forward = "Ctrl+Alt+X"   # example binding
```

### move_tab_backward

Move the active tab one position to the left.

- Action: `move_tab`, `direction = "backward"` ([parameters](#move_tab))
- Label: Move tab backward
- Default keys: none

```toml
[keys]
move_tab_backward = "Ctrl+Alt+X"   # example binding
```

### move_tab_to_new_window

Detach the active tab (its processes stay alive) into a new window.

- Action: `move_tab`, `window = "new"` ([parameters](#move_tab))
- Label: Move tab to new window
- Default keys: none

```toml
[keys]
move_tab_to_new_window = "Ctrl+Alt+X"   # example binding
```

### tab_search

Open the tab search palette (type to filter open tabs).

- Action: `tab_search`
- Label: Search tabs…
- Default keys: none

```toml
[keys]
tab_search = "Ctrl+Alt+X"   # example binding
```

### new_tab_profile_1

Open a new tab with the 1st visible (non-hidden) profile. Hidden from the palette; listed in the new-tab menus with its key.

- Action: `new_tab`, `index = 0` ([parameters](#new_tab))
- Label: New tab: profile 1
- Default keys: `Ctrl+Shift+1`
- Hidden from the palette

```toml
[keys]
new_tab_profile_1 = "Ctrl+Shift+1"
```

### new_tab_profile_2

Open a new tab with the 2nd visible (non-hidden) profile. Hidden from the palette; listed in the new-tab menus with its key.

- Action: `new_tab`, `index = 1` ([parameters](#new_tab))
- Label: New tab: profile 2
- Default keys: `Ctrl+Shift+2`
- Hidden from the palette

```toml
[keys]
new_tab_profile_2 = "Ctrl+Shift+2"
```

### new_tab_profile_3

Open a new tab with the 3rd visible (non-hidden) profile. Hidden from the palette; listed in the new-tab menus with its key.

- Action: `new_tab`, `index = 2` ([parameters](#new_tab))
- Label: New tab: profile 3
- Default keys: `Ctrl+Shift+3`
- Hidden from the palette

```toml
[keys]
new_tab_profile_3 = "Ctrl+Shift+3"
```

### new_tab_profile_4

Open a new tab with the 4th visible (non-hidden) profile. Hidden from the palette; listed in the new-tab menus with its key.

- Action: `new_tab`, `index = 3` ([parameters](#new_tab))
- Label: New tab: profile 4
- Default keys: `Ctrl+Shift+4`
- Hidden from the palette

```toml
[keys]
new_tab_profile_4 = "Ctrl+Shift+4"
```

### new_tab_profile_5

Open a new tab with the 5th visible (non-hidden) profile. Hidden from the palette; listed in the new-tab menus with its key.

- Action: `new_tab`, `index = 4` ([parameters](#new_tab))
- Label: New tab: profile 5
- Default keys: `Ctrl+Shift+5`
- Hidden from the palette

```toml
[keys]
new_tab_profile_5 = "Ctrl+Shift+5"
```

### new_tab_profile_6

Open a new tab with the 6th visible (non-hidden) profile. Hidden from the palette; listed in the new-tab menus with its key.

- Action: `new_tab`, `index = 5` ([parameters](#new_tab))
- Label: New tab: profile 6
- Default keys: `Ctrl+Shift+6`
- Hidden from the palette

```toml
[keys]
new_tab_profile_6 = "Ctrl+Shift+6"
```

### new_tab_profile_7

Open a new tab with the 7th visible (non-hidden) profile. Hidden from the palette; listed in the new-tab menus with its key.

- Action: `new_tab`, `index = 6` ([parameters](#new_tab))
- Label: New tab: profile 7
- Default keys: `Ctrl+Shift+7`
- Hidden from the palette

```toml
[keys]
new_tab_profile_7 = "Ctrl+Shift+7"
```

### new_tab_profile_8

Open a new tab with the 8th visible (non-hidden) profile. Hidden from the palette; listed in the new-tab menus with its key.

- Action: `new_tab`, `index = 7` ([parameters](#new_tab))
- Label: New tab: profile 8
- Default keys: `Ctrl+Shift+8`
- Hidden from the palette

```toml
[keys]
new_tab_profile_8 = "Ctrl+Shift+8"
```

### new_tab_profile_9

Open a new tab with the 9th visible (non-hidden) profile. Hidden from the palette; listed in the new-tab menus with its key.

- Action: `new_tab`, `index = 8` ([parameters](#new_tab))
- Label: New tab: profile 9
- Default keys: `Ctrl+Shift+9`
- Hidden from the palette

```toml
[keys]
new_tab_profile_9 = "Ctrl+Shift+9"
```


---
**Panes**

### close_pane

Close the active pane (or the subtree selected with `move_focus_parent`). Closing the last pane closes the tab. In a non-terminal tab it closes the tab.

- Action: `close_pane`
- Label: Close pane
- Default keys: `Ctrl+Shift+W`

```toml
[keys]
close_pane = "Ctrl+Shift+W"
```

### close_other_panes

Close every pane of the tab except the active one (or the selected subtree).

- Action: `close_other_panes`
- Label: Close other panes
- Default keys: none

```toml
[keys]
close_other_panes = "Ctrl+Alt+X"   # example binding
```

### duplicate_pane_auto

Split the active pane in the direction leaving the most room, duplicating its profile and working directory.

- Action: `split_pane`, `split = "auto"`, `split_mode = "duplicate"` ([parameters](#split_pane))
- Label: Duplicate pane
- Default keys: `Alt+Shift+D`

```toml
[keys]
duplicate_pane_auto = "Alt+Shift+D"
```

### duplicate_pane_down

Split the active pane downward, duplicating its profile and working directory.

- Action: `split_pane`, `split = "down"`, `split_mode = "duplicate"` ([parameters](#split_pane))
- Label: Duplicate pane down
- Default keys: `Alt+Shift+-`
- Legacy names: `split_down`

```toml
[keys]
duplicate_pane_down = "Alt+Shift+-"
```

### duplicate_pane_right

Split the active pane to the right, duplicating its profile and working directory.

- Action: `split_pane`, `split = "right"`, `split_mode = "duplicate"` ([parameters](#split_pane))
- Label: Duplicate pane right
- Default keys: `Alt+Shift+Plus`
- Legacy names: `split_right`

```toml
[keys]
duplicate_pane_right = "Alt+Shift+Plus"
```

### split_pane_left

Split the active pane toward the left. Without a `profile` the new pane duplicates the source pane's profile; add `profile` / `commandline` (via an `[[action]]`) to start something else.

- Action: `split_pane`, `split = "left"` ([parameters](#split_pane))
- Label: Split pane left
- Default keys: none

```toml
[keys]
split_pane_left = "Ctrl+Alt+X"   # example binding
```

### split_pane_right

Split the active pane toward the right. Without a `profile` the new pane duplicates the source pane's profile; add `profile` / `commandline` (via an `[[action]]`) to start something else.

- Action: `split_pane`, `split = "right"` ([parameters](#split_pane))
- Label: Split pane right
- Default keys: none

```toml
[keys]
split_pane_right = "Ctrl+Alt+X"   # example binding
```

### split_pane_up

Split the active pane toward the up. Without a `profile` the new pane duplicates the source pane's profile; add `profile` / `commandline` (via an `[[action]]`) to start something else.

- Action: `split_pane`, `split = "up"` ([parameters](#split_pane))
- Label: Split pane up
- Default keys: none

```toml
[keys]
split_pane_up = "Ctrl+Alt+X"   # example binding
```

### split_pane_down

Split the active pane toward the down. Without a `profile` the new pane duplicates the source pane's profile; add `profile` / `commandline` (via an `[[action]]`) to start something else.

- Action: `split_pane`, `split = "down"` ([parameters](#split_pane))
- Label: Split pane down
- Default keys: none

```toml
[keys]
split_pane_down = "Ctrl+Alt+X"   # example binding
```

### toggle_pane_zoom

Zoom the active pane (or selected subtree) to fill the tab, or unzoom. No effect with a single pane. A `ZOOM` badge is shown per [`show_zoom_badge`](configuration.md#show_zoom_badge).

- Action: `toggle_pane_zoom`
- Label: Toggle pane zoom
- Default keys: none
- Legacy names: `zoom`

```toml
[keys]
toggle_pane_zoom = "Ctrl+Alt+X"   # example binding
```

### toggle_split_orientation

Rotate the split containing the active pane (row to column and vice versa).

- Action: `toggle_split_orientation`
- Label: Toggle split orientation
- Default keys: none

```toml
[keys]
toggle_split_orientation = "Ctrl+Alt+X"   # example binding
```

### toggle_broadcast_input

Mirror typed input of the active pane to all other panes of the tab (read-only panes are skipped).

- Action: `toggle_broadcast_input`
- Label: Toggle broadcast input to all panes
- Default keys: none

```toml
[keys]
toggle_broadcast_input = "Ctrl+Alt+X"   # example binding
```

### toggle_read_only_mode

Toggle read-only mode of the active pane: typing and pasting are dropped with a toast.

- Action: `toggle_read_only_mode`
- Label: Toggle read-only mode
- Default keys: none

```toml
[keys]
toggle_read_only_mode = "Ctrl+Alt+X"   # example binding
```

### enable_read_only_mode

Make the active pane read-only.

- Action: `enable_read_only_mode`
- Label: Enable read-only mode
- Default keys: none

```toml
[keys]
enable_read_only_mode = "Ctrl+Alt+X"   # example binding
```

### disable_read_only_mode

Make the active pane writable again.

- Action: `disable_read_only_mode`
- Label: Disable read-only mode
- Default keys: none

```toml
[keys]
disable_read_only_mode = "Ctrl+Alt+X"   # example binding
```

### move_pane_to_new_tab

Move the active pane (or selected subtree) into a new tab. Not handled when it is already alone in its tab.

- Action: `move_pane`, `index = -1` ([parameters](#move_pane))
- Label: Move pane to new tab
- Default keys: none

```toml
[keys]
move_pane_to_new_tab = "Ctrl+Alt+X"   # example binding
```

### move_pane_to_new_window

Move the active pane into a new window (its process stays alive).

- Action: `move_pane`, `window = "new"` ([parameters](#move_pane))
- Label: Move pane to new window
- Default keys: none

```toml
[keys]
move_pane_to_new_window = "Ctrl+Alt+X"   # example binding
```

### move_pane_to_tab_1

Move the active pane into tab 1 (it becomes a split of that tab's active pane). Hidden from the palette.

- Action: `move_pane`, `index = 0` ([parameters](#move_pane))
- Label: Move pane to tab 1
- Default keys: none
- Hidden from the palette

```toml
[keys]
move_pane_to_tab_1 = "Ctrl+Alt+X"   # example binding
```

### move_pane_to_tab_2

Move the active pane into tab 2 (it becomes a split of that tab's active pane). Hidden from the palette.

- Action: `move_pane`, `index = 1` ([parameters](#move_pane))
- Label: Move pane to tab 2
- Default keys: none
- Hidden from the palette

```toml
[keys]
move_pane_to_tab_2 = "Ctrl+Alt+X"   # example binding
```

### move_pane_to_tab_3

Move the active pane into tab 3 (it becomes a split of that tab's active pane). Hidden from the palette.

- Action: `move_pane`, `index = 2` ([parameters](#move_pane))
- Label: Move pane to tab 3
- Default keys: none
- Hidden from the palette

```toml
[keys]
move_pane_to_tab_3 = "Ctrl+Alt+X"   # example binding
```

### move_pane_to_tab_4

Move the active pane into tab 4 (it becomes a split of that tab's active pane). Hidden from the palette.

- Action: `move_pane`, `index = 3` ([parameters](#move_pane))
- Label: Move pane to tab 4
- Default keys: none
- Hidden from the palette

```toml
[keys]
move_pane_to_tab_4 = "Ctrl+Alt+X"   # example binding
```

### move_pane_to_tab_5

Move the active pane into tab 5 (it becomes a split of that tab's active pane). Hidden from the palette.

- Action: `move_pane`, `index = 4` ([parameters](#move_pane))
- Label: Move pane to tab 5
- Default keys: none
- Hidden from the palette

```toml
[keys]
move_pane_to_tab_5 = "Ctrl+Alt+X"   # example binding
```

### move_pane_to_tab_6

Move the active pane into tab 6 (it becomes a split of that tab's active pane). Hidden from the palette.

- Action: `move_pane`, `index = 5` ([parameters](#move_pane))
- Label: Move pane to tab 6
- Default keys: none
- Hidden from the palette

```toml
[keys]
move_pane_to_tab_6 = "Ctrl+Alt+X"   # example binding
```

### move_pane_to_tab_7

Move the active pane into tab 7 (it becomes a split of that tab's active pane). Hidden from the palette.

- Action: `move_pane`, `index = 6` ([parameters](#move_pane))
- Label: Move pane to tab 7
- Default keys: none
- Hidden from the palette

```toml
[keys]
move_pane_to_tab_7 = "Ctrl+Alt+X"   # example binding
```

### move_pane_to_tab_8

Move the active pane into tab 8 (it becomes a split of that tab's active pane). Hidden from the palette.

- Action: `move_pane`, `index = 7` ([parameters](#move_pane))
- Label: Move pane to tab 8
- Default keys: none
- Hidden from the palette

```toml
[keys]
move_pane_to_tab_8 = "Ctrl+Alt+X"   # example binding
```

### move_pane_to_tab_9

Move the active pane into tab 9 (it becomes a split of that tab's active pane). Hidden from the palette.

- Action: `move_pane`, `index = 8` ([parameters](#move_pane))
- Label: Move pane to tab 9
- Default keys: none
- Hidden from the palette

```toml
[keys]
move_pane_to_tab_9 = "Ctrl+Alt+X"   # example binding
```

### restart_connection

Kill the pane's process and start it again in the same pane.

- Action: `restart_connection`
- Label: Restart connection
- Default keys: none

```toml
[keys]
restart_connection = "Ctrl+Alt+X"   # example binding
```

### open_snippets_pane

Open the snippets pane in a split to the right (lists `send_input` actions; click to run).

- Action: `split_pane`, `type = "snippets"`, `split = "right"` ([parameters](#split_pane))
- Label: Open snippets pane
- Default keys: none

```toml
[keys]
open_snippets_pane = "Ctrl+Alt+X"   # example binding
```

### equalize_panes

Give every pane of the tab an equal share (resets split ratios). A Terminux command.

- Action: `equalize_panes`
- Label: Equalize panes
- Default keys: none
- Legacy names: `equalize`

```toml
[keys]
equalize_panes = "Ctrl+Alt+X"   # example binding
```

### move_focus_left

Move focus to the pane left of the active one. Not handled (key reaches the terminal) when there is none or the tab is zoomed.

- Action: `move_focus`, `direction = "left"` ([parameters](#move_focus))
- Label: Move focus left
- Default keys: `Alt+Left`
- Legacy names: `focus_left`

```toml
[keys]
move_focus_left = "Alt+Left"
```

### move_focus_right

Move focus to the pane right of the active one. Not handled (key reaches the terminal) when there is none or the tab is zoomed.

- Action: `move_focus`, `direction = "right"` ([parameters](#move_focus))
- Label: Move focus right
- Default keys: `Alt+Right`
- Legacy names: `focus_right`

```toml
[keys]
move_focus_right = "Alt+Right"
```

### move_focus_up

Move focus to the pane up of the active one. Not handled (key reaches the terminal) when there is none or the tab is zoomed.

- Action: `move_focus`, `direction = "up"` ([parameters](#move_focus))
- Label: Move focus up
- Default keys: `Alt+Up`
- Legacy names: `focus_up`

```toml
[keys]
move_focus_up = "Alt+Up"
```

### move_focus_down

Move focus to the pane down of the active one. Not handled (key reaches the terminal) when there is none or the tab is zoomed.

- Action: `move_focus`, `direction = "down"` ([parameters](#move_focus))
- Label: Move focus down
- Default keys: `Alt+Down`
- Legacy names: `focus_down`

```toml
[keys]
move_focus_down = "Alt+Down"
```

### move_focus_previous

Focus the previously focused pane of the tab (MRU).

- Action: `move_focus`, `direction = "previous"` ([parameters](#move_focus))
- Label: Move focus to previous pane
- Default keys: `Ctrl+Alt+Left`

```toml
[keys]
move_focus_previous = "Ctrl+Alt+Left"
```

### move_focus_previous_in_order

Focus the previous pane in creation order (wraps).

- Action: `move_focus`, `direction = "previous_in_order"` ([parameters](#move_focus))
- Label: Move focus to previous in order pane
- Default keys: none

```toml
[keys]
move_focus_previous_in_order = "Ctrl+Alt+X"   # example binding
```

### move_focus_next_in_order

Focus the next pane in creation order (wraps).

- Action: `move_focus`, `direction = "next_in_order"` ([parameters](#move_focus))
- Label: Move focus to next in order pane
- Default keys: none

```toml
[keys]
move_focus_next_in_order = "Ctrl+Alt+X"   # example binding
```

### move_focus_first

Focus the first pane of the layout.

- Action: `move_focus`, `direction = "first"` ([parameters](#move_focus))
- Label: Move focus to first pane
- Default keys: none

```toml
[keys]
move_focus_first = "Ctrl+Alt+X"   # example binding
```

### move_focus_parent

Select the parent split of the active pane (or of the current selection); `close_pane`, `toggle_pane_zoom`, `swap_pane_*`, `move_pane_*` and `resize_pane_*` then act on the whole subtree.

- Action: `move_focus`, `direction = "parent"` ([parameters](#move_focus))
- Label: Move focus to parent pane
- Default keys: none

```toml
[keys]
move_focus_parent = "Ctrl+Alt+X"   # example binding
```

### move_focus_child

Narrow the selected subtree back toward the active pane.

- Action: `move_focus`, `direction = "child"` ([parameters](#move_focus))
- Label: Move focus to child pane
- Default keys: none

```toml
[keys]
move_focus_child = "Ctrl+Alt+X"   # example binding
```

### resize_pane_left

Move the active pane's left border by 5% of the split. Not handled with a single pane.

- Action: `resize_pane`, `direction = "left"` ([parameters](#resize_pane))
- Label: Resize pane left
- Default keys: `Alt+Shift+Left`
- Legacy names: `resize_left`

```toml
[keys]
resize_pane_left = "Alt+Shift+Left"
```

### resize_pane_right

Move the active pane's right border by 5% of the split. Not handled with a single pane.

- Action: `resize_pane`, `direction = "right"` ([parameters](#resize_pane))
- Label: Resize pane right
- Default keys: `Alt+Shift+Right`
- Legacy names: `resize_right`

```toml
[keys]
resize_pane_right = "Alt+Shift+Right"
```

### resize_pane_up

Move the active pane's up border by 5% of the split. Not handled with a single pane.

- Action: `resize_pane`, `direction = "up"` ([parameters](#resize_pane))
- Label: Resize pane up
- Default keys: `Alt+Shift+Up`
- Legacy names: `resize_up`

```toml
[keys]
resize_pane_up = "Alt+Shift+Up"
```

### resize_pane_down

Move the active pane's down border by 5% of the split. Not handled with a single pane.

- Action: `resize_pane`, `direction = "down"` ([parameters](#resize_pane))
- Label: Resize pane down
- Default keys: `Alt+Shift+Down`
- Legacy names: `resize_down`

```toml
[keys]
resize_pane_down = "Alt+Shift+Down"
```

### swap_pane_left

Swap the active pane with its neighbour left. Not handled when zoomed.

- Action: `swap_pane`, `direction = "left"` ([parameters](#swap_pane))
- Label: Swap pane left
- Default keys: none

```toml
[keys]
swap_pane_left = "Ctrl+Alt+X"   # example binding
```

### swap_pane_right

Swap the active pane with its neighbour right. Not handled when zoomed.

- Action: `swap_pane`, `direction = "right"` ([parameters](#swap_pane))
- Label: Swap pane right
- Default keys: none

```toml
[keys]
swap_pane_right = "Ctrl+Alt+X"   # example binding
```

### swap_pane_up

Swap the active pane with its neighbour up. Not handled when zoomed.

- Action: `swap_pane`, `direction = "up"` ([parameters](#swap_pane))
- Label: Swap pane up
- Default keys: none

```toml
[keys]
swap_pane_up = "Ctrl+Alt+X"   # example binding
```

### swap_pane_down

Swap the active pane with its neighbour down. Not handled when zoomed.

- Action: `swap_pane`, `direction = "down"` ([parameters](#swap_pane))
- Label: Swap pane down
- Default keys: none

```toml
[keys]
swap_pane_down = "Ctrl+Alt+X"   # example binding
```

### swap_pane_previous

Swap with the previously focused pane.

- Action: `swap_pane`, `direction = "previous"` ([parameters](#swap_pane))
- Label: Swap with previous pane
- Default keys: none

```toml
[keys]
swap_pane_previous = "Ctrl+Alt+X"   # example binding
```

### swap_pane_previous_in_order

Swap with the previous pane in creation order.

- Action: `swap_pane`, `direction = "previous_in_order"` ([parameters](#swap_pane))
- Label: Swap with previous in order pane
- Default keys: none

```toml
[keys]
swap_pane_previous_in_order = "Ctrl+Alt+X"   # example binding
```

### swap_pane_next_in_order

Swap with the next pane in creation order.

- Action: `swap_pane`, `direction = "next_in_order"` ([parameters](#swap_pane))
- Label: Swap with next in order pane
- Default keys: none

```toml
[keys]
swap_pane_next_in_order = "Ctrl+Alt+X"   # example binding
```

### swap_pane_first

Swap with the first pane of the layout.

- Action: `swap_pane`, `direction = "first"` ([parameters](#swap_pane))
- Label: Swap with first pane
- Default keys: none

```toml
[keys]
swap_pane_first = "Ctrl+Alt+X"   # example binding
```


---
**Clipboard and selection**

### copy

Copy the selection. Not handled when nothing is selected, so `Ctrl+C` reaches the terminal as interrupt.

- Action: `copy`, `single_line = false`
- Label: Copy
- Default keys: `Ctrl+C`, `Ctrl+Shift+C`, `Ctrl+Insert`, `Enter`

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `single_line` | boolean | `false` | Remove line breaks from the copied text. |
| `with_control_sequences` | boolean | `false` | Copy with ANSI escape sequences (colors and styles). |
| `copy_formatting` | boolean or string | [`copy_formatting`](configuration.md#copy_formatting) | `true`/`"all"`/`"html"` also put an HTML version on the clipboard. |
| `dismiss_selection` | boolean | `true` | Clear the selection after copying. |

```toml
[[action]]
name = "Copy as one line"
command = "copy"
single_line = true
```

### paste

Paste the clipboard text through bracketed paste when the application enabled it. Control characters are stripped (tab, CR, LF kept), a trailing newline is trimmed per [`trim_paste`](configuration.md#trim_paste), and warnings apply per [`large_paste_warning`](configuration.md#large_paste_warning) / [`multi_line_paste_warning`](configuration.md#multi_line_paste_warning). When the clipboard holds no text (an image), a literal `Ctrl+V` (`0x16`) is sent to the application instead.

- Action: `paste`
- Label: Paste
- Default keys: `Ctrl+V`, `Ctrl+Shift+V`, `Shift+Insert`

```toml
[keys]
paste = ["Ctrl+V", "Ctrl+Shift+V", "Shift+Insert"]
```

### select_all

Select the whole buffer.

- Action: `select_all`
- Label: Select all
- Default keys: `Ctrl+Shift+A`

```toml
[keys]
select_all = "Ctrl+Shift+A"
```

### mark_mode

Toggle mark mode (keyboard selection): arrows move, `Shift` extends, `Ctrl` jumps by word, `Home`/`End` line start/end (`Ctrl`: buffer start/end), `PgUp`/`PgDn` page, `Ctrl+A` select all, `Escape` leaves.

- Action: `mark_mode`
- Label: Toggle mark mode
- Default keys: `Ctrl+Shift+M`

```toml
[keys]
mark_mode = "Ctrl+Shift+M"
```

### toggle_block_selection

Toggle rectangular selection in mark mode (enters mark mode if needed).

- Action: `toggle_block_selection`
- Label: Toggle block selection
- Default keys: none

```toml
[keys]
toggle_block_selection = "Ctrl+Alt+X"   # example binding
```

### switch_selection_endpoint

In mark mode, swap which end of the selection moves.

- Action: `switch_selection_endpoint`
- Label: Switch selection endpoint
- Default keys: none

```toml
[keys]
switch_selection_endpoint = "Ctrl+Alt+X"   # example binding
```

### expand_selection_to_word

Expand the mark mode selection to whole words (separators: [`word_separators`](configuration.md#word_separators)).

- Action: `expand_selection_to_word`
- Label: Expand selection to word
- Default keys: none

```toml
[keys]
expand_selection_to_word = "Ctrl+Alt+X"   # example binding
```

### show_context_menu

Open the pane context menu at the pane. Hidden from the palette.

- Action: `show_context_menu`
- Label: Show context menu
- Default keys: `Menu`
- Hidden from the palette

```toml
[keys]
show_context_menu = "Menu"
```

### search_web

Open the selection in the browser using [`search_web_url`](configuration.md#search_web_url). Not handled without a selection.

- Action: `search_web`
- Label: Search the web for the selection
- Default keys: none

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `query_url` | string | [`search_web_url`](configuration.md#search_web_url) | URL template; `%s` is replaced by the URL-encoded selection. |

```toml
[keys]
search_web = "Ctrl+Alt+X"   # example binding
```

### color_selection

Highlight the selection with a background color (default `#7a6420aa`). Needs a selection.

- Action: `color_selection`
- Label: Highlight selection
- Default keys: none

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `background` | string | `#7a6420aa` | Highlight color (alias: `foreground`, used when `background` is absent). |
| `foreground` | string | none | See `background`. |
| `match_mode` | string | selection only | `all` highlights every occurrence of a single-line selection. |
| `clear` | boolean | `false` | Remove highlights instead. |

```toml
[[action]]
name = "Highlight all"
command = "color_selection"
background = "#7a6420aa"
match_mode = "all"
```

### clear_color_selection

Remove all highlights made with `color_selection`.

- Action: `color_selection`, `clear = true` ([parameters](#color_selection))
- Label: Clear highlights
- Default keys: none

```toml
[keys]
clear_color_selection = "Ctrl+Alt+X"   # example binding
```


---
**Scrollback, marks and shell integration**

### scroll_up

Scroll up by `rows_to_scroll` lines (default 1).

- Action: `scroll_up`
- Label: Scroll up
- Default keys: `Ctrl+Shift+Up`

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `rows_to_scroll` | integer | `1` | Lines to scroll. |

```toml
[keys]
scroll_up = "Ctrl+Shift+Up"
```

### scroll_down

Scroll down by `rows_to_scroll` lines (default 1).

- Action: `scroll_down`
- Label: Scroll down
- Default keys: `Ctrl+Shift+Down`

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `rows_to_scroll` | integer | `1` | Lines to scroll. |

```toml
[keys]
scroll_down = "Ctrl+Shift+Down"
```

### scroll_up_page

Scroll up one page.

- Action: `scroll_up_page`
- Label: Scroll up one page
- Default keys: `Ctrl+Shift+PgUp`

```toml
[keys]
scroll_up_page = "Ctrl+Shift+PgUp"
```

### scroll_down_page

Scroll down one page.

- Action: `scroll_down_page`
- Label: Scroll down one page
- Default keys: `Ctrl+Shift+PgDn`

```toml
[keys]
scroll_down_page = "Ctrl+Shift+PgDn"
```

### scroll_to_top

Scroll to the top of the buffer.

- Action: `scroll_to_top`
- Label: Scroll to the top
- Default keys: `Ctrl+Shift+Home`

```toml
[keys]
scroll_to_top = "Ctrl+Shift+Home"
```

### scroll_to_bottom

Scroll to the bottom of the buffer.

- Action: `scroll_to_bottom`
- Label: Scroll to the bottom
- Default keys: `Ctrl+Shift+End`

```toml
[keys]
scroll_to_bottom = "Ctrl+Shift+End"
```

### clear_buffer

Clear the buffer. `clear` selects what: `all` (default; screen and scrollback), `screen` or `scrollback`.

- Action: `clear_buffer`, `clear = "all"`
- Label: Clear buffer
- Default keys: `Ctrl+Shift+K`

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `clear` | string | `all` | `all`, `screen` or `scrollback`. |

```toml
[[action]]
name = "Clear scrollback"
command = "clear_buffer"
clear = "scrollback"
```

### clear_screen

Clear the screen, keeping the prompt line as first row and leaving scrollback untouched.

- Action: `clear_buffer`, `clear = "screen"` ([parameters](#clear_buffer))
- Label: Clear screen
- Default keys: none

```toml
[keys]
clear_screen = "Ctrl+Alt+X"   # example binding
```

### clear_scrollback

Clear the scrollback only.

- Action: `clear_buffer`, `clear = "scrollback"` ([parameters](#clear_buffer))
- Label: Clear scrollback
- Default keys: none

```toml
[keys]
clear_scrollback = "Ctrl+Alt+X"   # example binding
```

### export_buffer

Write the whole buffer as plain text to a file. With `path` it writes there (only paths named in the config are accepted by the backend), otherwise a save dialog opens.

- Action: `export_buffer`
- Label: Export text…
- Default keys: none

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `path` | string | none | Destination file (must be a path named in the config); empty opens a save dialog. |

```toml
[[action]]
name = "Export"
command = "export_buffer"
```

### add_mark

Add a scroll mark on the cursor line (one mark per line; optional `color`).

- Action: `add_mark`
- Label: Add scroll mark
- Default keys: none

| Argument | Type | Default | Description |
| --- | --- | --- | --- |
| `color` | string | `#f0c674` | Mark color. |

```toml
[keys]
add_mark = "Ctrl+Alt+X"   # example binding
```

### clear_mark

Remove the scroll mark at the cursor line.

- Action: `clear_mark`
- Label: Clear scroll mark
- Default keys: none

```toml
[keys]
clear_mark = "Ctrl+Alt+X"   # example binding
```

### clear_all_marks

Remove every scroll mark of the pane.

- Action: `clear_all_marks`
- Label: Clear all scroll marks
- Default keys: none

```toml
[keys]
clear_all_marks = "Ctrl+Alt+X"   # example binding
```

### scroll_to_previous_mark

Scroll to the previous mark (user marks and, with shell integration, prompt marks).

- Action: `scroll_to_mark`, `direction = "previous"` ([parameters](#scroll_to_mark))
- Label: Scroll to previous mark
- Default keys: none

```toml
[keys]
scroll_to_previous_mark = "Ctrl+Alt+X"   # example binding
```

### scroll_to_next_mark

Scroll to the next mark.

- Action: `scroll_to_mark`, `direction = "next"` ([parameters](#scroll_to_mark))
- Label: Scroll to next mark
- Default keys: none

```toml
[keys]
scroll_to_next_mark = "Ctrl+Alt+X"   # example binding
```

### scroll_to_first_mark

Scroll to the first mark.

- Action: `scroll_to_mark`, `direction = "first"` ([parameters](#scroll_to_mark))
- Label: Scroll to first mark
- Default keys: none

```toml
[keys]
scroll_to_first_mark = "Ctrl+Alt+X"   # example binding
```

### scroll_to_last_mark

Scroll to the last mark.

- Action: `scroll_to_mark`, `direction = "last"` ([parameters](#scroll_to_mark))
- Label: Scroll to last mark
- Default keys: none

```toml
[keys]
scroll_to_last_mark = "Ctrl+Alt+X"   # example binding
```

### select_previous_command

Select the previous command line (needs shell integration: OSC 133 / 633).

- Action: `select_command`, `direction = "prev"` ([parameters](#select_command))
- Label: Select previous command
- Default keys: none

```toml
[keys]
select_previous_command = "Ctrl+Alt+X"   # example binding
```

### select_next_command

Select the next command line (needs shell integration).

- Action: `select_command`, `direction = "next"` ([parameters](#select_command))
- Label: Select next command
- Default keys: none

```toml
[keys]
select_next_command = "Ctrl+Alt+X"   # example binding
```

### select_previous_output

Select the output of the previous command (needs shell integration).

- Action: `select_output`, `direction = "prev"` ([parameters](#select_output))
- Label: Select previous command output
- Default keys: none

```toml
[keys]
select_previous_output = "Ctrl+Alt+X"   # example binding
```

### select_next_output

Select the output of the next command (needs shell integration).

- Action: `select_output`, `direction = "next"` ([parameters](#select_output))
- Label: Select next command output
- Default keys: none

```toml
[keys]
select_next_output = "Ctrl+Alt+X"   # example binding
```


---
**Visual**

### increase_font_size

Increase the font size by 1 px for the whole window (clamped to 6-72 px total).

- Action: `adjust_font_size`, `delta = 1` ([parameters](#adjust_font_size))
- Label: Increase font size
- Default keys: `Ctrl+Plus`, `Ctrl+Numpad_Plus`
- Legacy names: `font_bigger`

```toml
[keys]
increase_font_size = ["Ctrl+Plus", "Ctrl+Numpad_Plus"]
```

### decrease_font_size

Decrease the font size by 1 px.

- Action: `adjust_font_size`, `delta = -1` ([parameters](#adjust_font_size))
- Label: Decrease font size
- Default keys: `Ctrl+Minus`, `Ctrl+Numpad_Minus`
- Legacy names: `font_smaller`

```toml
[keys]
decrease_font_size = ["Ctrl+Minus", "Ctrl+Numpad_Minus"]
```

### reset_font_size

Reset the window font zoom.

- Action: `reset_font_size`
- Label: Reset font size
- Default keys: `Ctrl+0`, `Ctrl+Numpad_0`
- Legacy names: `font_reset`

```toml
[keys]
reset_font_size = ["Ctrl+0", "Ctrl+Numpad_0"]
```

### increase_opacity

Increase the active pane's opacity by 10 points (runtime override).

- Action: `adjust_opacity`, `opacity = 10`, `relative = true` ([parameters](#adjust_opacity))
- Label: Increase opacity
- Default keys: none

```toml
[keys]
increase_opacity = "Ctrl+Alt+X"   # example binding
```

### decrease_opacity

Decrease the active pane's opacity by 10 points (runtime override).

- Action: `adjust_opacity`, `opacity = -10`, `relative = true` ([parameters](#adjust_opacity))
- Label: Decrease opacity
- Default keys: none

```toml
[keys]
decrease_opacity = "Ctrl+Alt+X"   # example binding
```

## See also

- [keybindings.md](keybindings.md): default keymap and key syntax
- [configuration.md](configuration.md#action): the `[[action]]` table, `[keys]` and `toolbar`
- [command-line.md](command-line.md): the same actions from the command line
