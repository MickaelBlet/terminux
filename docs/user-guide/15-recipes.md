# Recipes

Copy-paste solutions for common setups. Every snippet uses real keys; keys and actions link to the [reference](../reference/configuration.md). Put root keys (`startup_actions`, `toolbar`, ...) **above** the first `[table]` of `config.toml`.

## Contents

- [Dev workspace layout](#dev-workspace-layout)
- [One-key project launchers](#one-key-project-launchers)
- [Per-project fragments](#per-project-fragments)
- [SSH hosts](#ssh-hosts)
- [WSL](#wsl)
- [Quake dropdown](#quake-dropdown)
- [Kiosk, focus mode and dashboards](#kiosk-focus-mode-and-dashboards)
- [Terminator-style keys](#terminator-style-keys)
- [Always-on-top scratch terminal](#always-on-top-scratch-terminal)
- [Environment colors (prod in red)](#environment-colors-prod-in-red)
- [Start fresh or restore](#start-fresh-or-restore)

## Dev workspace layout

An editor on the left, a dev server top-right, a test watcher bottom-right, in one tab:

```toml
first_window_preference = "default_profile"     # always start with the layout below
startup_actions = "new-tab -d ~/src/app --title app ; split-pane -V -s .4 -d ~/src/app npm run dev ; split-pane -H -s .5 -d ~/src/app npm test -- --watch ; move-focus left"
```

How to read it:

- `new-tab` opens the first pane (default profile). `split-pane -V` adds a pane to the **right** taking 40 % (`-s .4`); the new pane gets the focus, so the next `split-pane -H` divides *that* pane **horizontally**, adding one below with half its height.
- Everything after the options is the command to run in that pane (`npm run dev`). Words are split like a shell would; wrap arguments with spaces in `"..."` (escape inner quotes in the TOML string with `\"`, or use a TOML literal string `'...'` for the whole value).
- `move-focus left` returns the focus to the first pane.
- `;` separates commands. See [command line](../reference/command-line.md).

Without `first_window_preference = "default_profile"` Terminux restores your last session instead and ignores `startup_actions`.

## One-key project launchers

Put the same layout behind a key, one action per project:

```toml
[[action]]
name = "Project: app"
keys = "Ctrl+Alt+1"
command = "wt"
commandline = "new-tab -d ~/src/app --title app ; split-pane -V -s .4 -d ~/src/app npm run dev ; move-focus left"

[[action]]
name = "Project: api"
keys = "Ctrl+Alt+2"
command = "wt"
commandline = "new-tab -d ~/src/api --title api ; split-pane -H -s .3 -d ~/src/api cargo watch -x test ; move-focus up"
```

They are also in the [command palette](11-command-palette.md) by name, and can go on the [toolbar](13-toolbar.md) (give them an `id`). From a script or a desktop launcher: `terminux -w 0 nt -d ~/src/app --title app ; sp -V -s .4 npm run dev` (escape `;` for the shell: `\;`).

## Per-project fragments

Terminux merges every `*.toml` in the `fragments` directory next to `config.toml` (`~/.config/terminux/fragments/` on Linux, `%APPDATA%\terminux\fragments\` on Windows, `<exe dir>\settings\fragments\` in [portable mode](01-installation.md)). A fragment can contribute `[[profile]]`, `[[scheme]]` and `[[action]]` tables; anything else in it is ignored. Profiles whose `id` already exists in your main config are skipped. Fragments are hot-reloaded and processed in alphabetical order; an invalid fragment is ignored (a message goes to stderr).

`~/.config/terminux/fragments/blog.toml`:

```toml
[[profile]]
id = "blog-server"
name = "Blog server"
cmd = "npm"
args = ["run", "dev"]
cwd = "~/src/blog"
tab_color = "#34d399"

[[profile]]
id = "blog-shell"
name = "Blog shell"
cmd = "$SHELL"
cwd = "~/src/blog"

[[action]]
name = "Blog workspace"
keys = "Ctrl+Alt+B"
command = "wt"
commandline = "new-tab -p blog-shell --title blog ; split-pane -V -s .4 -p blog-server"
```

Good for sharing a team's launchers: drop the file in the directory, no edit of the main config. Fragments live in the config directory, not in the repository; keep them in a dotfiles repo or symlink them. See [Profiles](06-profiles.md).

## SSH hosts

Every concrete `Host` alias of `~/.ssh/config` (patterns containing `*`, `?` or `!` are skipped) becomes a generated profile named `SSH - <host>` with id `ssh-<slug>` (lowercase, every non-alphanumeric character replaced by `-`) when `ssh` is on PATH. They appear in the new-tab menu and the palette; turn them off with `disabled_profile_sources = ["ssh"]`.

Customize a generated profile by declaring one with the **same id**: the missing fields (`cmd`, `args`, ...) are filled from the generated one.

```toml
[[profile]]
id = "ssh-prod-db"            # generated from "Host prod-db"
tab_color = "#e06c75"
color_scheme = "Campbell"
tab_title = "PROD DB"
suppress_application_title = true
```

Or write one by hand:

```toml
[[profile]]
id = "bastion"
name = "Bastion"
cmd = "ssh"
args = ["-A", "-J", "jump.example.com", "ops@10.0.0.5"]
```

Notes:

- A split without `-p` **duplicates the profile** and so opens another `ssh` session; it does not share the connection of the original pane. To share it, enable `ControlMaster` in your `~/.ssh/config`.
- Remote working directories are not inherited by splits (the reported path does not exist locally, see [Shell integration](10-shell-integration.md#current-directory-osc-7-vs-osc-99)).
- `startup_timeout` / `startup_retries` restart a connection that stays silent at start.
- When `ssh` exits, the pane closes on exit code 0; use `close_on_exit = "never"` to keep errors on screen, and **Enter** in a dead pane to reconnect ([`restart_connection`](../reference/actions.md#restart_connection)).

## WSL

On Windows, Terminux generates a profile per installed WSL distribution (`wsl.exe -l -q`, `docker-desktop*` excluded): id `wsl-<slug>` (for example `wsl-ubuntu-22-04`), name = the distribution, command `wsl.exe -d <distro> --cd ~`, and `path_translation_style = "wsl"` so dropped Windows files are pasted as `/mnt/c/...`. `powershell` (Windows PowerShell), `cmd` and `pwsh` (when installed) are generated too. `disabled_profile_sources` accepts `wsl`, `ssh`, `powershell`, `windows`.

```toml
default_profile = "wsl-ubuntu-22-04"

[[profile]]
id = "wsl-ubuntu-22-04"          # same id: inherits cmd / args from the generated profile
tab_color = "#e95420"
icon = "🐧"
color_scheme = "Tango Dark"      # a built-in scheme, or one of your [[scheme]]
```

Tips:

- Use `-p "Ubuntu 22.04"` or the id on the command line: `terminux nt -p wsl-ubuntu-22-04`.
- For splits that stay in the same directory, make the WSL shell report it with OSC 9;9 / OSC 7 ([Shell integration](10-shell-integration.md)).
- Running **Terminux itself inside WSL** (WSLg) is supported through WebKitGTK; see [Troubleshooting](16-troubleshooting.md#wsl--wslg).

## Quake dropdown

[`quake_mode`](../reference/actions.md#quake_mode) (default `Win+``, an OS-level global shortcut) shows or hides a dedicated window docked at the top of the monitor under the mouse: full width, half the height. Pressing it again while the window is focused hides it. The quake window is not saved in the session.

```toml
allow_headless = true            # keep running (tray + shortcut) when no window is open
start_on_user_login = true       # launch at login
always_show_tray_icon = true
minimize_to_tray = true

[keys]
quake_mode = "Ctrl+Alt+Space"    # global; may need a combo the OS does not use

[defaults]
opacity = 90                     # needs a restart the first time (window transparency is set at creation)
```

- Bind more summons with an `[[action]]` of `command = "global_summon"` (`monitor = "toMouse"` moves the window to the monitor under the cursor; `toggle_visibility = true` hides it when already in front; `dropdown_duration` > 0 hides instead of minimizing). Without a window name, it summons the most recently used window.
- Global shortcuts are registered with the OS: some desktops (for example Wayland compositors) restrict them. An unsupported or already-taken combo is not registered (a warning is written to the log, see [Troubleshooting](16-troubleshooting.md)). <!-- TODO verify global shortcut behavior on Wayland -->
- Details in [Windows](05-windows.md).

## Kiosk, focus mode and dashboards

- `terminux -f` (`--focus`) launches in **focus mode** (no tab bar); `-F` fullscreen; `-M` maximized. The same as `launch_mode = "focus" | "fullscreen" | "maximized" | "maximized_focus"`. At runtime: [`toggle_focus_mode`](../reference/actions.md#toggle_focus_mode), `F11` / `Alt+Enter` for fullscreen. `show_tabs_fullscreen = true` keeps the tab bar in fullscreen.
- A monitoring wall, started on demand:

  ```toml
  [[action]]
  name = "Monitoring wall"
  commands = [
    { command = "new_tab", commandline = "htop", tab_title = "ops" },
    { command = "split_pane", split = "right", commandline = "journalctl -f", size = 0.5 },
    { command = "split_pane", split = "down", commandline = "watch -n2 df -h", size = 0.4 },
    { command = "enable_read_only_mode" },
    { command = "toggle_fullscreen" },
  ]
  ```

  `enable_read_only_mode` applies to the pane that has focus (the last split here); run it per pane with `move_focus` in between, or toggle per pane by hand. A read-only pane drops typed input and pastes.
- Pane processes that should stay visible when they end: profile `close_on_exit = "never"`.
- Hide chrome you do not need: `tab_position = "left"` with `vertical_tabs_collapsed = true`, `disable_animations = true`.

## Terminator-style keys

The default config ships a commented Terminator-like keymap (split with `Ctrl+Shift+O` / `Ctrl+Shift+E`, focus with `Alt+Arrows`, broadcast with `Alt+A`, ...). Uncomment the lines you want in `[keys]`; conflicting defaults are moved. See [keybindings](../reference/keybindings.md).

```toml
[keys]
split_pane_down = "Ctrl+Shift+O"
split_pane_right = "Ctrl+Shift+E"
toggle_pane_zoom = "Ctrl+Shift+X"
toggle_broadcast_input = "Alt+A"
move_focus_up = "Alt+Up"
move_focus_down = "Alt+Down"
move_focus_left = "Alt+Left"
move_focus_right = "Alt+Right"
```

Because `Alt+Arrows` is also the default for `move_focus_*`, the example mostly matters for the split keys; remember that a combo claimed by a new binding is taken away from programs inside the terminal.

## Always-on-top scratch terminal

```sh
terminux --size 100,24 --pos 40,40 nt -p shell --title scratch
```

then run [`toggle_always_on_top`](../reference/actions.md#toggle_always_on_top) from the palette, or set `always_on_top = true` globally. `--size` is in characters (columns,rows), `--pos` in pixels (`x,y`, either may be omitted).

## Environment colors (prod in red)

Give dangerous environments an unmistakable look so you do not type in the wrong tab:

```toml
[[profile]]
id = "prod"
name = "PROD shell"
cmd = "ssh"
args = ["prod.example.com"]
tab_color = "#e06c75"
color_scheme = { light = "Tango Light", dark = "Campbell" }
background = "#2a1010"
unfocused_appearance = { opacity = 80 }
```

`color_scheme` may also be set per tab on the command line: `terminux nt -p prod --colorScheme "Campbell" --tabColor "#e06c75"`. See [Appearance](07-appearance.md).

## Start fresh or restore

- Default: Terminux saves the layout (tabs, panes, scrollback, window positions) periodically and restores it at the next start (`first_window_preference = "persisted_window_layout"`).
- Start clean every time, with a layout: `first_window_preference = "default_profile"` plus `startup_actions`.
- The restore file is `session.json` in the state directory (see [file locations](../reference/file-locations.md)). Delete it to reset a bad session.

## See also

- [Profiles](06-profiles.md), [Windows](05-windows.md), [Panes](04-panes.md)
- [Custom actions](12-custom-actions.md)
- [Command line](../reference/command-line.md)
- [Troubleshooting](16-troubleshooting.md)
