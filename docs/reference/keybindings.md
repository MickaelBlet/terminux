# Key bindings

The default keymap (Windows Terminal defaults), the `[keys]` syntax and the key-name grammar. Bindings are configured in the [`[keys]`](configuration.md#keys) table and in the `keys` field of [`[[action]]`](configuration.md#action) entries.

- [Overriding keys](#overriding-keys)
- [Key syntax](#key-syntax)
- [Default keymap](#default-keymap)
- [Keys that are not rebindable](#keys-that-are-not-rebindable)
- [Global (OS-level) shortcuts](#global-os-level-shortcuts)
- [Recipe: Terminator-style keys](#recipe-terminator-style-keys)

## Overriding keys

```toml
[keys]
find = "F3"                              # one combo
paste = ["Ctrl+Shift+V", "Shift+Insert"] # several combos
clear_buffer = ""                        # unbind (the default keys are NOT restored)
find_next = "F3"                         # commands with no default key can be bound too
```

Rules (from the key map builder):

- The key of an entry is a [command name](actions.md#named-commands) or one of its [legacy names](#legacy-names); the value is a combo, a list of combos or `""`.
- A command that appears in `[keys]` uses **only** the combos you give: its default keys are dropped. Commands not mentioned keep their defaults.
- When two commands share a combo, user bindings win over defaults, and `[[action]]` `keys` win over `[keys]` entries of named commands.
- An `[[action]]` with an `id` can also be bound from `[keys]`: `my_action_id = "Ctrl+Alt+K"`.
- A key is matched on the exact modifier set: `Ctrl+Shift+T` does not fire for `Ctrl+Alt+Shift+T`.
- Bind a combo to the `unbound` action to neutralize it so it reaches the terminal:

```toml
[[action]]
keys = "Ctrl+Shift+W"
command = "unbound"
```

- There are no chords (multi-key sequences such as `Ctrl+K Ctrl+C`): a binding is a single combo.
- While you edit text (settings editor, palette, dialogs) only [window-level commands](actions.md#how-actions-are-written) stay active.

## Key syntax

A combo is `Modifier+Modifier+Key`, case-insensitive, with optional spaces around the `+`.

**Modifiers**: `Ctrl` (or `Control`), `Shift`, `Alt`, and `Meta` / `Super` / `Cmd` / `Win` (all four mean the same key).

**Key** (the last part). Letters and digits match the **physical** key position, so bindings do not depend on the keyboard layout. If the key press produces a printable non-alphanumeric character, that character is also tried (so a binding written with the literal character works on layouts such as AZERTY).

| Key | Names accepted |
| --- | --- |
| Letters, digits | `A`..`Z`, `0`..`9` |
| Numpad digits | `Numpad_0`..`Numpad_9` |
| Numpad operators | `Numpad_Plus` (alias `Numpad_Add`), `Numpad_Minus` (alias `Numpad_Subtract`), `Numpad_Multiply`, `Numpad_Divide`, `Numpad_Period` (numpad Enter is plain `Enter`) |
| Arrows | `Left`, `Right`, `Up`, `Down` (also `ArrowLeft` ...) |
| Editing and navigation | `Enter` (`Return`), `Tab`, `Space`, `Escape` (`Esc`), `Backspace`, `Insert` (`Ins`), `Delete` (`Del`), `Home`, `End`, `PageUp` (`PgUp`), `PageDown` (`PgDn`) |
| Function keys | `F1`, `F2`, ... (as reported by the browser key name) |
| Menu key | `Menu` (aliases `App`, `ContextMenu`) |
| Punctuation names | `Plus` (the `=` / `+` key, matched **without** Shift unless you write `Shift`), `Minus`, `Period`, `Comma`, `Backquote` (alias `Grave`) |
| Punctuation characters | `=` `-` `,` `.` `` ` `` `;` `'` `/` `\` `[` `]` |

`Ctrl++` (a trailing `++`) means the `+` character as the key.

Examples: `Ctrl+Shift+T`, `Alt+Shift+Plus`, `Alt+Shift+-`, `Ctrl+Alt+9`, `Ctrl+Numpad_Plus`, `Shift+Insert`, `F11`, ``Win+` ``.

### Legacy names

Names from before Windows Terminal parity are still accepted in `[keys]` and mapped to the current command:

| Legacy | Current |
| --- | --- |
| `split_right` | `duplicate_pane_right` |
| `split_down` | `duplicate_pane_down` |
| `zoom` | `toggle_pane_zoom` |
| `equalize` | `equalize_panes` |
| `search` | `find` |
| `palette` | `command_palette` |
| `font_bigger` | `increase_font_size` |
| `font_smaller` | `decrease_font_size` |
| `font_reset` | `reset_font_size` |
| `open_config` | `open_settings` |
| `open_config_external` | `open_settings_file` |
| `open_snippets_pane` | `toggle_snippets_sidebar` |
| `toggle_snippets_pane` | `toggle_snippets_sidebar` |
| `toggle_git_pane` | `toggle_git_sidebar` |
| `focus_left` | `move_focus_left` |
| `resize_left` | `resize_pane_left` |
| `focus_right` | `move_focus_right` |
| `resize_right` | `resize_pane_right` |
| `focus_up` | `move_focus_up` |
| `resize_up` | `resize_pane_up` |
| `focus_down` | `move_focus_down` |
| `resize_down` | `resize_pane_down` |
| `tab_1` | `switch_to_tab_1` |
| `tab_2` | `switch_to_tab_2` |
| `tab_3` | `switch_to_tab_3` |
| `tab_4` | `switch_to_tab_4` |
| `tab_5` | `switch_to_tab_5` |
| `tab_6` | `switch_to_tab_6` |
| `tab_7` | `switch_to_tab_7` |
| `tab_8` | `switch_to_tab_8` |
| `tab_9` | `switch_to_last_tab` |

## Default keymap

Every command with default keys. All other commands (`toggle_focus_mode`, `toggle_vertical_tabs`, `toggle_vertical_tabs_collapsed`, `toggle_always_on_top`, `open_settings_directory`, `open_settings_toml`, `find_next`, `find_prev`, `toggle_shader_effects`, ...) have no default binding: see [actions.md](actions.md) for the complete list.

### Application and windows

| Command | Default keys |
| --- | --- |
| [`close_window`](actions.md#close_window) | `Alt+F4` |
| [`toggle_fullscreen`](actions.md#toggle_fullscreen) | `Alt+Enter`, `F11` |
| [`open_new_tab_dropdown`](actions.md#open_new_tab_dropdown) | `Ctrl+Shift+Space` |
| [`open_settings`](actions.md#open_settings) | `Ctrl+,` |
| [`open_settings_file`](actions.md#open_settings_file) | `Ctrl+Shift+,` |
| [`open_default_settings`](actions.md#open_default_settings) | `Ctrl+Alt+,` |
| [`find`](actions.md#find) | `Ctrl+Shift+F` |
| [`command_palette`](actions.md#command_palette) | `Ctrl+Shift+P` |
| [`quake_mode`](actions.md#quake_mode) | `` Win+` `` |
| [`show_suggestions`](actions.md#show_suggestions) | `Ctrl+Shift+Period` |

### Tabs

| Command | Default keys |
| --- | --- |
| [`new_tab`](actions.md#new_tab) | `Ctrl+Shift+T` |
| [`new_window`](actions.md#new_window) | `Ctrl+Shift+N` |
| [`duplicate_tab`](actions.md#duplicate_tab) | `Ctrl+Shift+D` |
| [`next_tab`](actions.md#next_tab) | `Ctrl+Tab` |
| [`prev_tab`](actions.md#prev_tab) | `Ctrl+Shift+Tab` |
| [`switch_to_last_tab`](actions.md#switch_to_last_tab) | `Ctrl+Alt+9` |
| [`switch_to_tab_1`](actions.md#switch_to_tab_1) | `Ctrl+Alt+1` |
| [`switch_to_tab_2`](actions.md#switch_to_tab_2) | `Ctrl+Alt+2` |
| [`switch_to_tab_3`](actions.md#switch_to_tab_3) | `Ctrl+Alt+3` |
| [`switch_to_tab_4`](actions.md#switch_to_tab_4) | `Ctrl+Alt+4` |
| [`switch_to_tab_5`](actions.md#switch_to_tab_5) | `Ctrl+Alt+5` |
| [`switch_to_tab_6`](actions.md#switch_to_tab_6) | `Ctrl+Alt+6` |
| [`switch_to_tab_7`](actions.md#switch_to_tab_7) | `Ctrl+Alt+7` |
| [`switch_to_tab_8`](actions.md#switch_to_tab_8) | `Ctrl+Alt+8` |
| [`new_tab_profile_1`](actions.md#new_tab_profile_1) | `Ctrl+Shift+1` |
| [`new_tab_profile_2`](actions.md#new_tab_profile_2) | `Ctrl+Shift+2` |
| [`new_tab_profile_3`](actions.md#new_tab_profile_3) | `Ctrl+Shift+3` |
| [`new_tab_profile_4`](actions.md#new_tab_profile_4) | `Ctrl+Shift+4` |
| [`new_tab_profile_5`](actions.md#new_tab_profile_5) | `Ctrl+Shift+5` |
| [`new_tab_profile_6`](actions.md#new_tab_profile_6) | `Ctrl+Shift+6` |
| [`new_tab_profile_7`](actions.md#new_tab_profile_7) | `Ctrl+Shift+7` |
| [`new_tab_profile_8`](actions.md#new_tab_profile_8) | `Ctrl+Shift+8` |
| [`new_tab_profile_9`](actions.md#new_tab_profile_9) | `Ctrl+Shift+9` |

### Panes

| Command | Default keys |
| --- | --- |
| [`close_pane`](actions.md#close_pane) | `Ctrl+Shift+W` |
| [`duplicate_pane_auto`](actions.md#duplicate_pane_auto) | `Alt+Shift+D` |
| [`duplicate_pane_down`](actions.md#duplicate_pane_down) | `Alt+Shift+-` |
| [`duplicate_pane_right`](actions.md#duplicate_pane_right) | `Alt+Shift+Plus` |
| [`move_focus_left`](actions.md#move_focus_left) | `Alt+Left` |
| [`move_focus_right`](actions.md#move_focus_right) | `Alt+Right` |
| [`move_focus_up`](actions.md#move_focus_up) | `Alt+Up` |
| [`move_focus_down`](actions.md#move_focus_down) | `Alt+Down` |
| [`move_focus_previous`](actions.md#move_focus_previous) | `Ctrl+Alt+Left` |
| [`resize_pane_left`](actions.md#resize_pane_left) | `Alt+Shift+Left` |
| [`resize_pane_right`](actions.md#resize_pane_right) | `Alt+Shift+Right` |
| [`resize_pane_up`](actions.md#resize_pane_up) | `Alt+Shift+Up` |
| [`resize_pane_down`](actions.md#resize_pane_down) | `Alt+Shift+Down` |
| [`move_pane_left`](actions.md#move_pane_left) | `Ctrl+Alt+Shift+Left` |
| [`move_pane_right`](actions.md#move_pane_right) | `Ctrl+Alt+Shift+Right` |
| [`move_pane_up`](actions.md#move_pane_up) | `Ctrl+Alt+Shift+Up` |
| [`move_pane_down`](actions.md#move_pane_down) | `Ctrl+Alt+Shift+Down` |
| [`toggle_git_sidebar`](actions.md#toggle_git_sidebar) | `Ctrl+Shift+G` |

### Clipboard and selection

| Command | Default keys |
| --- | --- |
| [`copy`](actions.md#copy) | `Ctrl+C`, `Ctrl+Shift+C`, `Ctrl+Insert`, `Enter` |
| [`paste`](actions.md#paste) | `Ctrl+V`, `Ctrl+Shift+V`, `Shift+Insert` |
| [`select_all`](actions.md#select_all) | `Ctrl+Shift+A` |
| [`mark_mode`](actions.md#mark_mode) | `Ctrl+Shift+M` |
| [`show_context_menu`](actions.md#show_context_menu) | `Menu` |

### Scrollback, marks and shell integration

| Command | Default keys |
| --- | --- |
| [`scroll_up`](actions.md#scroll_up) | `Ctrl+Shift+Up` |
| [`scroll_down`](actions.md#scroll_down) | `Ctrl+Shift+Down` |
| [`scroll_up_page`](actions.md#scroll_up_page) | `Ctrl+Shift+PgUp` |
| [`scroll_down_page`](actions.md#scroll_down_page) | `Ctrl+Shift+PgDn` |
| [`scroll_to_top`](actions.md#scroll_to_top) | `Ctrl+Shift+Home` |
| [`scroll_to_bottom`](actions.md#scroll_to_bottom) | `Ctrl+Shift+End` |
| [`scroll_to_previous_mark`](actions.md#scroll_to_previous_mark) | `Ctrl+Up` |
| [`scroll_to_next_mark`](actions.md#scroll_to_next_mark) | `Ctrl+Down` |
| [`clear_buffer`](actions.md#clear_buffer) | `Ctrl+Shift+K` |

### Visual

| Command | Default keys |
| --- | --- |
| [`increase_font_size`](actions.md#increase_font_size) | `Ctrl+Plus`, `Ctrl+Numpad_Plus` |
| [`decrease_font_size`](actions.md#decrease_font_size) | `Ctrl+Minus`, `Ctrl+Numpad_Minus` |
| [`reset_font_size`](actions.md#reset_font_size) | `Ctrl+0`, `Ctrl+Numpad_0` |

Mouse wheel (not rebindable, toggled by [`scroll_to_zoom`](configuration.md#scroll_to_zoom) and [`scroll_to_change_opacity`](configuration.md#scroll_to_change_opacity)): `Ctrl+wheel` changes the font size, `Ctrl+Alt+wheel` the font size of the pane under the mouse only, `Ctrl+Shift+wheel` changes the pane opacity by 5 points per notch.

`Ctrl+V` with an image on the clipboard is passed through to the application as a literal `Ctrl+V`, which lets the application read the image itself.

## Keys that are not rebindable

| Context | Keys |
| --- | --- |
| Terminal | `Shift+Enter` sends `ESC` `CR` (a newline instead of submit in programs that support it) |
| Mark mode | Arrows move the cursor end, `Shift+Arrow` extends, `Ctrl+Left/Right` jump by word, `Home`/`End` line start/end, `Ctrl+Home`/`Ctrl+End` buffer start/end, `PageUp`/`PageDown` page, `Ctrl+A` select all, `Escape` leave |
| Tab switcher overlay (`tab_switcher_mode = "mru"`) | `Tab` / `Shift+Tab` / `Down` / `Up` move, `Enter` or releasing the modifier selects, `Escape` cancels |
| Exited pane | `Enter` restarts the process, `Ctrl+D` closes the pane |
| Mouse | `Alt+drag` rectangular selection, `Ctrl`/`Shift`+right click opens the pane menu, `Shift` held bypasses applications that grab the mouse |
| Settings (UI or TOML editor) | `Ctrl+S` save, `Ctrl+F` find, `Ctrl+A` select all, `Ctrl+Space` completion |

## Global (OS-level) shortcuts

[`quake_mode`](actions.md#quake_mode) and any `[[action]]` whose `command` is `quake_mode` or `global_summon` are registered with the operating system, so they work while Terminux is not focused. Their combos use a narrower syntax:

- Modifiers: `Ctrl`/`Control`, `Shift`, `Alt`, `Win`/`Meta`/`Super`/`Cmd`.
- Keys: letters, digits, `F1`..`F24`, `` ` `` / `Backquote`, `-` / `Minus`, `=` / `Plus` / `Equal`, `,` `.` `/` `;`, `Space`, `Enter`, `Tab`, `Esc`, arrows, `PgUp`, `PgDn`, `Home`, `End`, `Insert`, `Delete`.
- Anything else is reported as an unsupported global shortcut and ignored.

```toml
[keys]
quake_mode = "Ctrl+Alt+Q"      # replaces the default Win+`

[[action]]
name = "Summon"
keys = "Ctrl+Alt+T"
command = "global_summon"
monitor = "toMouse"
```

## Recipe: Terminator-style keys

These bindings are shipped (commented out) in the default `config.toml`. Conflicting defaults are moved too.

```toml
[keys]
duplicate_pane_right = "Ctrl+Shift+E"           # split vertically
duplicate_pane_down = "Ctrl+Shift+O"            # split horizontally
toggle_pane_zoom = "Ctrl+Shift+X"
toggle_split_orientation = "Super+R"        # rotate
equalize_panes = "Ctrl+Shift+Alt+E"
move_focus_up = "Alt+Up"
move_focus_down = "Alt+Down"
move_focus_left = "Alt+Left"
move_focus_right = "Alt+Right"
move_focus_next_in_order = "Ctrl+Shift+N"
move_focus_previous_in_order = "Ctrl+Shift+P"
resize_pane_up = "Ctrl+Shift+Up"
resize_pane_down = "Ctrl+Shift+Down"
resize_pane_left = "Ctrl+Shift+Left"
resize_pane_right = "Ctrl+Shift+Right"
toggle_broadcast_input = "Alt+A"
new_window = "Ctrl+Shift+I"
close_window = "Ctrl+Shift+Q"
next_tab = ["Ctrl+PgDn", "Ctrl+Tab"]
prev_tab = ["Ctrl+PgUp", "Ctrl+Shift+Tab"]
move_tab_forward = "Ctrl+Shift+PgDn"
move_tab_backward = "Ctrl+Shift+PgUp"
open_tab_renamer = "Ctrl+Alt+A"
scroll_up_page = "Shift+PgUp"
scroll_down_page = "Shift+PgDn"
scroll_up = "Ctrl+Alt+Up"
scroll_down = "Ctrl+Alt+Down"
clear_buffer = "Ctrl+Shift+G"               # reset and clear
command_palette = "Ctrl+Alt+P"              # was Ctrl+Shift+P
```

## See also

- [actions.md](actions.md): every command and its arguments
- [configuration.md](configuration.md#keys): the `[keys]` table
- [command-line.md](command-line.md)
