# Command line

`terminux [options] [command ; command ...]` uses the same syntax as Windows Terminal's `wt.exe`: global options, then a `;`-separated list of subcommands that open tabs and split panes. The same parser serves the process command line, the command palette's command-line mode and [`startup_actions`](configuration.md#startup_actions).

- [Synopsis](#synopsis)
- [Global options](#global-options)
- [Subcommands](#subcommands)
- [Separating commands with `;`](#separating-commands-with-)
- [Targeting windows with `-w`](#targeting-windows-with--w)
- [What happens on launch](#what-happens-on-launch)
- [Palette command-line mode](#palette-command-line-mode)
- [Differences from `wt.exe`](#differences-from-wtexe)
- [Examples](#examples)

## Synopsis

```text
Usage: terminux [options] [command [; command]...]

Options:
  -h, --help              Show this help
  -M, --maximized         Launch maximized
  -F, --fullscreen        Launch fullscreen
  -f, --focus             Launch in focus mode (no tab bar)
  --pos x,y               Window position
  --size cols,rows        Window size in characters
  -w, --window <id|name>  Target window (new / -1, last / 0)

Commands:
  new-tab, nt     [-p profile] [-d dir] [--title t] [--tabColor c] [--colorScheme s]
                  [--suppressApplicationTitle | --useApplicationTitle] [commandline]
  split-pane, sp  [-H | -V] [-s size] [-D] [same options as new-tab] [commandline]
  focus-tab, ft   [-t index | -n | -p]
  move-focus, mf  left|right|up|down|previous|nextInOrder|previousInOrder|first|parent|child
  move-pane, mp   -t index
  swap-pane       left|right|up|down|previous|nextInOrder|previousInOrder|first
```

This is the output of `terminux --help`. Global options must come **before** the first command: parsing of options stops at the first argument that is not a global option, and everything after it is a command. A first argument that is not a subcommand name is treated as an implicit [`new-tab`](#new-tab) (`terminux -p python`, `terminux htop`).

## Global options

Global options set up the window that is created by this invocation. They do not change windows that already exist (except `-w`, which chooses the target).

| Option | Argument | Description |
| --- | --- | --- |
| `-h`, `--help`, `-?`, `/?` | none | Print the usage text and exit without starting Terminux. |
| `-M`, `--maximized` | none | Launch maximized. |
| `-F`, `--fullscreen` | none | Launch fullscreen. Wins over `-M` and `-f`. |
| `-f`, `--focus` | none | Launch in focus mode (tab bar hidden). With `-M`: maximized focus mode. |
| `--pos` | `x,y` | Window position in pixels. Either part may be omitted: `--pos 100,` or `--pos ,50`. Non-numeric parts are ignored. |
| `--size` | `cols,rows` | Initial size in character cells. Both values must be positive integers, otherwise the command fails with `invalid size`. The window is clamped to 20-1000 columns and 5-500 rows. |
| `-w`, `--window` | `id` / `name` / `new` / `-1` / `last` / `0` | Target window, see [Targeting windows](#targeting-windows-with--w). |

The launch options combine into the [`launch_mode`](configuration.md#launch_mode) values like this:

| Flags | Resulting launch mode |
| --- | --- |
| `-F` (with or without others) | `fullscreen` |
| `-M -f` | `maximized_focus` |
| `-M` | `maximized` |
| `-f` | `focus` |
| none | [`launch_mode`](configuration.md#launch_mode) from the config |

`--size` and `--pos` override [`initial_cols`](configuration.md#initial_cols), [`initial_rows`](configuration.md#initial_rows) and [`initial_position`](configuration.md#initial_position). All launch options are ignored when the invocation restores the previous session or is routed to an existing window.

## Subcommands

Each subcommand opens with its name or alias, followed by its own flags, and ends at the next `;`.

### new-tab

Alias: `nt`. Opens a new tab (action [`new_tab`](actions.md#new_tab)).

```text
new-tab [-p <profile>] [-d <dir>] [--title <title>] [--tabColor <color>]
        [--colorScheme <scheme>] [--suppressApplicationTitle | --useApplicationTitle]
        [--] [commandline...]
```

| Flag | Argument | Description |
| --- | --- | --- |
| `-p`, `--profile` | profile | Profile `id`, or its display name (case-insensitive). Default: [`default_profile`](configuration.md#default_profile). |
| `-d`, `--startingDirectory` | path | Starting directory. A relative path is resolved against the directory `terminux` was invoked from; `~` is expanded by the backend. |
| `--title` | text | Initial tab title (`tab_title`). |
| `--tabColor` | color | Tab color, e.g. `"#c50f1f"`. |
| `--colorScheme` | name | Color scheme for the new pane. |
| `--suppressApplicationTitle` | none | Ignore titles set by the application (OSC 0/2). |
| `--useApplicationTitle` | none | Allow application titles (overrides a profile that suppresses them). |
| `--` | none | End of flags: everything after it is the command line. |
| `commandline` | words | The first argument that does not start with `-` begins the command line, which replaces the profile's command. It runs in the profile's environment. Quote it for the shell as usual. |

Accepted and ignored for compatibility: `--appendCommandLine`, `--inheritEnvironment`, `--reloadEnvironment`. Any other option starting with `-` is an error (`unknown option ...`), including the split-only flags `-H`, `-V`, `-D` and `-s`.

```sh
terminux nt -p python --title dev -d ~/src/app
terminux nt --tabColor "#c50f1f" -- ssh prod
```

### split-pane

Alias: `sp`. Splits the active pane (action [`split_pane`](actions.md#split_pane)). Accepts every `new-tab` flag, plus:

| Flag | Argument | Description |
| --- | --- | --- |
| `-H`, `--horizontal` | none | Split horizontally: the new pane goes **below** (`split = "down"`). |
| `-V`, `--vertical` | none | Split vertically: the new pane goes to the **right** (`split = "right"`). |
| `-s`, `--size` | number | Share of the new pane, a fraction (`.3` = 30%). Clamped to 0.05-0.95. A non-numeric value is an error (`invalid size`). Default `0.5`. |
| `-D`, `--duplicate` | none | Duplicate the active pane's profile (`split_mode = "duplicate"`). |

Without `-H`/`-V` the direction is `auto` (the one leaving the most room). Without `-p` the new pane continues the pane it is split from, with its working directory. Left and up splits are not available on the command line; use an [`[[action]]`](actions.md#split_pane) with `split = "left"` / `"up"`.

```sh
terminux sp -V -s .3 -p shell
terminux sp -H htop
```

### focus-tab

Alias: `ft`. Focuses a tab. Exactly one flag is needed.

| Flag | Argument | Description |
| --- | --- | --- |
| `-t`, `--target` | index | 0-based tab index (action `switch_to_tab`; a negative index selects the last tab). |
| `-n`, `--next` | none | Next tab (`next_tab`, direct switch, never the MRU overlay). |
| `-p`, `--previous` | none | Previous tab (`prev_tab`, direct switch). |

Without a flag the command fails with `focus-tab needs -t <index>, -n or -p`; a non-integer index fails with `invalid tab index`.

```sh
terminux ft -t 0
terminux ft -n
```

### move-focus

Alias: `mf`. Moves focus between panes of the active tab (action [`move_focus`](actions.md#move_focus)). Takes one direction (required): `left`, `right`, `up`, `down`, `previous`, `nextInOrder`, `previousInOrder`, `first`, `parent`, `child`. The camelCase spellings are converted, so `next-in-order` and `next_in_order` also work.

```sh
terminux mf left
terminux mf nextInOrder
```

### move-pane

Alias: `mp`. Moves the active pane to another tab (action [`move_pane`](actions.md#move_pane)).

| Flag | Argument | Description |
| --- | --- | --- |
| `-t`, `--tab` | index | 0-based index of the destination tab; a negative value or an index past the end creates a new tab. |

Without `-t` the command fails with `move-pane needs -t <index>`.

```sh
terminux mp -t 0
```

### swap-pane

No alias. Swaps the active pane with another (action [`swap_pane`](actions.md#swap_pane)). Takes one direction (required): `left`, `right`, `up`, `down`, `previous`, `nextInOrder`, `previousInOrder`, `first` (spellings as for `move-focus`; `parent` and `child` are not meaningful here).

```sh
terminux swap-pane right
```

## Separating commands with `;`

A `;` separates commands. The parser accepts it as a standalone argument (`nt ; sp`) or glued to the end of an argument (`nt; sp`). An argument ending in `\;` is not a separator: the backslash is removed and a literal `;` stays in the argument (`sh -c a\;b` passes `a;b`).

Your shell sees `;` too, so it must be escaped so that `terminux` receives it:

| Shell | Form |
| --- | --- |
| bash / zsh / fish | `terminux nt \; sp -V` or `terminux nt ';' sp -V` |
| PowerShell | ``terminux nt `; sp -V`` or `terminux nt ';' sp -V` |
| Terminux palette, `startup_actions` | write `;` plainly inside the string |

To pass a literal semicolon to a program, send `\;` to Terminux: in bash `terminux nt sh -c 'echo a\;b'`.

Quoting inside a command line string (palette, `startup_actions`): single and double quotes group words; a backslash only escapes a double quote (`\"`), so Windows paths like `C:\Users\me` survive.

## Targeting windows with `-w`

`-w <target>` (also `--window`) chooses where the commands run.

| Target | Meaning |
| --- | --- |
| `new` or `-1` | Always a new window. |
| `last` or `0` | The most recently focused window (the quake window is never chosen). If there is none, a new window is created. |
| a number | The window with that id. Ids are assigned in creation order (1, 2, ...) for the lifetime of the process; use `identify_window` to see them. A missing id creates a new unnamed window. |
| any other text | The window with that name. Names are set with `open_window_renamer` or by the first `-w name` that creates a window. A missing name creates a new window with that name. |

```sh
terminux -w 0 nt -d ~/src htop     # most recent window
terminux -w build nt cargo watch   # window named "build" (created if missing)
terminux -w new sp -V              # always a new window
```

The target window is shown, unminimized and focused. Actions sent to a window run there exactly as if typed in it.

### `windowing_behavior`

When Terminux is already running, a new `terminux ...` invocation is handed to the running instance (single instance). Without `-w`, [`windowing_behavior`](configuration.md#windowing_behavior) decides the target:

| Value | Effect |
| --- | --- |
| `use_new` (default) | A new window (`-w new`). |
| `use_existing` | The most recently focused window (`-w last`). |
| `use_any_existing` | Same as `use_existing` (Terminux has no virtual-desktop distinction). |

An explicit `-w` always wins. With no commands at all, the second invocation opens a `new-tab`.

## What happens on launch

**First invocation** (Terminux is not running):

1. The command line is parsed. A parse error is printed to stderr (`terminux: ...`) and the arguments are ignored.
2. If it contains commands, they run in the first window. The previous session is **not** restored.
3. Otherwise, with [`first_window_preference`](configuration.md#first_window_preference) `persisted_window_layout` (the default) and a saved session, the saved windows are reopened (launch options are ignored).
4. Otherwise, [`startup_actions`](configuration.md#startup_actions) (a command line string) runs if set.
5. Otherwise, one window with one tab of the default profile opens.

`-w <name>` on the first invocation names the first window unless the value is `new`, `-1`, `0`, `last` or a number.

**Further invocations** run in the existing instance as described under [`windowing_behavior`](#windowing_behavior): relative `-d` paths are resolved against the directory the new `terminux` process was started in, and `-M`, `-F`, `-f`, `--pos`, `--size` apply only if the invocation creates a new window.

## Palette command-line mode

Open the [command palette](actions.md#command_palette) (`Ctrl+Shift+P`). It starts with a `>` prefix (action mode). **Delete the `>`** and type a command line without the program name; `Enter` runs it:

```text
new-tab -p python ; split-pane -H
nt -p shell -d ~/src
-w 0 ft -t 0
```

The text goes through the same parser (action `wt`). With no commands it opens a new tab. With `-w` pointing to another window the commands are sent there; otherwise they run in the current window. Parse errors are shown as an error toast. Global launch options (`-M`, `--size`, ...) are parsed but have no effect in this mode.

The `wt` action can also be used in an [`[[action]]`](actions.md#wt):

```toml
[[action]]
name = "Dev layout"
command = "wt"
commandline = "new-tab -p python ; split-pane -V -s .3 -p shell"
```

## Differences from `wt.exe`

- Same subcommand names, aliases and flags for `new-tab`, `split-pane`, `focus-tab`, `move-focus`, `move-pane` and `swap-pane`; same `-w`, `-M`, `-F`, `-f`, `--pos`, `--size`.
- Not implemented: `--elevate` and other `wt.exe` options (they fail as `unknown option`), `focus-tab` by title, a per-subcommand `-w`.
- `--appendCommandLine`, `--inheritEnvironment` and `--reloadEnvironment` are accepted and ignored.
- Window-targeting with `-w` takes ids, names, `new`/`-1` and `last`/`0` like Windows Terminal.

## Examples

```sh
# Python on the left, a shell on the right (30%), focus the first tab again
terminux nt -p python \; sp -V -s .3 -p shell \; ft -t 0

# Same, as a maximized window of 140x40 cells
terminux -M --size 140,40 nt -p python \; sp -V -p shell

# Run a command in a new tab of an existing window
terminux -w 0 nt -d ~/src/app --title tests npm test

# Use a profile by display name with spaces
terminux nt -p "Ubuntu 22.04"

# A new focus-mode window of 160x30 cells
terminux -w new -f --size 160,30 nt

# Implicit new-tab: the first argument is not a subcommand
terminux htop
terminux -p python

# Rearrange: swap the pane with its right neighbour, then focus next pane in order
terminux swap-pane right \; mf nextInOrder

# Move the active pane to a new tab
terminux mp -t -1
```

Startup layout from the configuration:

```toml
startup_actions = "new-tab -p python ; split-pane -V -s .3 -p shell"
windowing_behavior = "use_existing"
first_window_preference = "default_profile"   # do not restore the previous session
```

## See also

- [actions.md](actions.md): the actions these commands produce
- [configuration.md](configuration.md#windowing_behavior): `windowing_behavior`, `startup_actions`, `first_window_preference`
- [profile-settings.md](profile-settings.md): profiles referenced by `-p`
- [file-locations.md](file-locations.md)
