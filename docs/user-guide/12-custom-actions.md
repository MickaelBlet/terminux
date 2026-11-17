# Custom actions

`[[action]]` tables define your own commands: they show up in the [command palette](11-command-palette.md), can be bound to keys, put on the [toolbar](13-toolbar.md), listed in the `new_tab_menu` and in the snippets pane. They are the equivalent of Windows Terminal's `actions` array.

## Contents

- [Anatomy](#anatomy)
- [Binding keys](#binding-keys)
- [send_input](#send_input)
- [multiple_actions](#multiple_actions)
- [Running command lines (`wt`)](#running-command-lines-wt)
- [Argument reference](#argument-reference)
- [Windows Terminal syntax](#windows-terminal-syntax)
- [Where actions appear](#where-actions-appear)
- [Recipes](#recipes)
- [Pitfalls](#pitfalls)

## Anatomy

```toml
[[action]]
id      = "gs"                 # optional: lets [keys], toolbar and new_tab_menu refer to it
name    = "Git status"         # label in the palette (default: a description of the command)
icon    = "terminal"           # optional built-in icon name
keys    = "Ctrl+Shift+G"       # optional: one combo or a list
command = "send_input"         # any command name (see actions reference)
input   = "git status\r"       # the command's arguments sit in the same table
```

Fields (see [`action`](../reference/configuration.md#action)):

| Field | Meaning |
| --- | --- |
| `id` | Unique id. Needed to reference the action from `[keys]`, `toolbar` and `new_tab_menu`. |
| `name` | Label shown in the palette. Without it Terminux builds one from the command and its arguments. |
| `icon` | Icon name (the default depends on the command). |
| `keys` | Key combo or list of combos. |
| `command` | The command to run. Accepts any command listed in [actions](../reference/actions.md) (`new_tab`, `split_pane`, `toggle_pane_zoom`, ...), plus `send_input`, `multiple_actions`, `wt`, `global_summon`, `set_color_scheme`, `rename_window`, `adjust_opacity`, `set_tab_color`, `rename_tab`, `color_selection`, `unbound`. |
| `commands` | A list of actions to run in order (turns the entry into `multiple_actions`). |
| other keys | Arguments of `command` (`input`, `profile`, `split`, `size`, `direction`, ...). |

Names follow Windows Terminal in snake_case; the old pre-parity names (`split_right`, `zoom`, ...) are accepted only in `[keys]`, see [keybindings](../reference/keybindings.md).

## Binding keys

Three ways, all equivalent:

```toml
# 1. keys inside the action
[[action]]
name = "Zoom"
keys = "Ctrl+Shift+Z"
command = "toggle_pane_zoom"

# 2. by id, from [keys]
[[action]]
id = "gs"
name = "Git status"
command = "send_input"
input = "git status\r"

[keys]
gs = "Ctrl+Shift+G"          # an action id works like a command name
```

- The settings editor only knows command names inside `[keys]`: an action id there is underlined as an unknown key unless it contains a dot (`user.gs`). The binding works either way; putting `keys` in the `[[action]]` avoids the warning.
- Several combos: `keys = ["Ctrl+Shift+G", "F9"]`.
- Combos are case-insensitive: `ctrl+shift+g` works, as do `Win`, `Super`, `Meta`, `Cmd` for the logo key. See [keybindings](../reference/keybindings.md) for the grammar (`Plus`, `Period`, `Space`, `PgUp`, ...).
- Precedence: built-in defaults < `[keys]` overrides of named commands < `[[action]]` bindings. A combo bound by an action therefore **replaces** a default binding of the same combo, without having to unbind it.
- Unbind a default: `[keys]` with `new_tab = ""`. An unbound key reaches the terminal.
- Actions that cannot apply (for example `find` in a settings tab) return "not handled" and the key falls through to the program in the terminal.

## send_input

Types text into the focused terminal as if you typed it.

```toml
[[action]]
name = "Git status"
command = "send_input"
input = "git status\r"          # \r = Enter
```

- `input` is a TOML string: use `\r` for Enter, `\t` for Tab, `\u001b` for Escape (TOML 1.0 does not have `\x1b`), `\u0003` for Ctrl+C, and `\\` for a backslash.
- Without a trailing `\r` the text is typed and left on the prompt: handy for commands you want to edit first.
- The text goes through the normal input path: it respects **read-only** panes and is mirrored by **broadcast input**.
- An empty `input` makes the action "not handled".
- Actions with a string `input` appear in the [snippets pane](11-command-palette.md#snippets-pane) and in the [suggestions](11-command-palette.md#suggestions) palette (`source = "tasks"`).

## multiple_actions

Run several actions in order, either with `commands` or the explicit form:

```toml
[[action]]
name = "Dev layout"
commands = [
  { command = "new_tab", profile = "python" },
  { command = "split_pane", split = "right", profile = "shell", size = 0.3 },
  { command = "move_focus", direction = "left" },
]
```

- Entries can be tables or plain command names (`commands = ["find", "scroll_to_top"]`).
- Actions run sequentially; each waits for the previous one.
- `split_pane` `size` is the **new pane's** share of the split (0 to 1): `0.3` gives the new pane 30 %. `split` is `right`, `down`, `left`, `up` or `auto`; `split_mode = "duplicate"` duplicates the current pane instead of using a profile.

## Running command lines (`wt`)

`command = "wt"` with `commandline` runs a `terminux` / `wt.exe` style command line, the same syntax as the palette's command-line mode and `startup_actions`:

```toml
[[action]]
name = "Dev layout"
keys = "Ctrl+Alt+D"
command = "wt"
commandline = "new-tab -p shell -d ~/src/app --title app ; split-pane -V -s .4 -p shell -d ~/src/app npm run dev"
```

This is often shorter than `commands = [...]`. See [command line](../reference/command-line.md) for flags. Quote values containing spaces with `"..."` (escape inner quotes in TOML with `\"`, or use a literal string `'...'` for the whole `commandline`).

## Argument reference

Arguments recognised by the editor's completion (`ACTION_ARGS`): `input`, `commandline`, `profile`, `index`, `starting_directory`, `tab_title`, `tab_color`, `color_scheme`, `suppress_application_title`, `split`, `split_mode`, `size`, `type`, `direction`, `target`, `title`, `color`, `window`, `rows_to_scroll`, `clear`, `path`, `delta`, `opacity`, `relative`, `source`, `use_commandline`, `query_url`, `name`, `monitor`, `desktop`, `dropdown_duration`, `toggle_visibility`, `single_line`, `with_control_sequences`, `copy_formatting`, `dismiss_selection`, `tab_switcher_mode`, `background`, `foreground`, `match_mode`. What each command accepts is listed per command in [actions](../reference/actions.md).

## Windows Terminal syntax

Windows Terminal's nested form is accepted too: `command = { action = "splitPane", ... }` becomes

```toml
[[action]]
keys = "Alt+Shift+Plus"
command = { action = "split_pane", split = "right", split_mode = "duplicate" }
```

Both `command` and `action` are read as the command name. The names must be Terminux's snake_case ones (`split_pane`, not `splitPane`); see [Migrating from Windows Terminal](17-migrating-from-windows-terminal.md).

## Where actions appear

| Place | How |
| --- | --- |
| Command palette | always (`name`) |
| Key | `keys`, or `[keys]` by `id` |
| Toolbar | `toolbar = ["gs", ...]` by `id`, see [Toolbar](13-toolbar.md) |
| New-tab dropdown | `[[new_tab_menu]]` entry `type = "action"`, `id = "..."` (built-in command names work too) |
| Snippets pane / suggestions | `send_input` with a string `input` |
| Fragments | `[[action]]` tables in `fragments/*.toml` are merged in, see [Profiles](06-profiles.md) |

## Recipes

Git helpers:

```toml
[[action]]
name = "git: status"
command = "send_input"
input = "git status -sb\r"

[[action]]
name = "git: log graph"
command = "send_input"
input = "git log --oneline --graph --decorate -20\r"
```

Interrupt and clear (Ctrl+C, Ctrl+U, then a clear):

```toml
[[action]]
name = "Cancel and clear line"
keys = "Ctrl+Alt+C"
command = "send_input"
input = "\u0003\u0015"
```

Switch color scheme and opacity:

```toml
[[action]]
name = "Light mode"
command = "set_color_scheme"
color_scheme = "One Half Light"

[[action]]
name = "More transparent"
keys = "Ctrl+Alt+O"
command = "adjust_opacity"
opacity = -10
relative = true
```

Tab color and name:

```toml
[[action]]
name = "Mark tab red"
command = "set_tab_color"
color = "#e06c75"

[[action]]
name = "Name tab: build"
command = "rename_tab"
title = "build"
```

A test pane next to the current one:

```toml
[[action]]
name = "Tests below"
keys = "Ctrl+Alt+T"
commands = [
  { command = "split_pane", split = "down", size = 0.3, profile = "shell" },
  { command = "send_input", input = "npm test\r" },
]
```

Summon the most recent window from anywhere (OS-level shortcut, see [Windows](05-windows.md)):

```toml
[[action]]
name = "Summon"
keys = "Win+F12"
command = "global_summon"
monitor = "toMouse"
toggle_visibility = true
```

For the default quake window use [`quake_mode`](../reference/actions.md#quake_mode) (default `Win+``).

Broadcast toggle on a short key:

```toml
[[action]]
name = "Broadcast"
keys = "Alt+B"
command = "toggle_broadcast_input"
```

## Pitfalls

- `[[action]]` blocks must come **before** `[keys]` and `[theme]` in the file, or the tables are parsed inside them. Terminux inserts saved snippets before these tables for that reason.
- A TOML basic string treats `\` as an escape: write `\\` for backslashes (Windows paths). Use single quotes for literal strings.
- `name`, `id`, `icon` and `keys` are metadata of the entry and are never passed to the command. An argument that is itself called `name` (for example the window name of `rename_window` or `global_summon`) therefore cannot be set from an `[[action]]`; use the real [command line](../reference/command-line.md) or the dedicated palette entries. <!-- TODO verify -->
- `id` is a plain string; it is also what the toolbar stores. Renaming an `id` removes the action from the toolbar silently (unknown entries are skipped, not deleted).
- Bindings that conflict with the shell (`Ctrl+R`, `Ctrl+A`, ...) steal the key from programs. Prefer `Alt+` / `Ctrl+Alt+` / `Ctrl+Shift+` combos.
- Global shortcuts (`quake_mode`, `global_summon`) are registered with the OS; an unsupported or already-taken combo is not registered (only a log warning).

## See also

- [Command palette](11-command-palette.md)
- [Toolbar](13-toolbar.md)
- [Panes](04-panes.md) and [Windows](05-windows.md)
- [Configuration: `action`](../reference/configuration.md#action), [`keys`](../reference/configuration.md#keys)
- [Actions reference](../reference/actions.md), [Keybindings](../reference/keybindings.md), [Command line](../reference/command-line.md)
