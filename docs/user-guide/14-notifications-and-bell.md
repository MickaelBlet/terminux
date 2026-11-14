# Notifications and bell

Terminux can tell you when something happens in a pane you are not looking at: a program rings the bell, or sends a desktop notification sequence (OSC 9, OSC 777).

## Contents

- [Overview](#overview)
- [Bell](#bell)
- [Desktop notifications](#desktop-notifications)
- [Progress](#progress)
- [Tab indicators](#tab-indicators)
- [Sending notifications from scripts](#sending-notifications-from-scripts)
- [Troubleshooting](#troubleshooting)

## Overview

| Event | Sequence | Visual in Terminux | Desktop notification |
| --- | --- | --- | --- |
| Bell | `BEL` (`\a`, `0x07`) | per `bell_style`, bell icon on the tab if not active | when the window is unfocused |
| Notification | `OSC 9;<text>` (iTerm2) | bell icon on the tab if not the active pane | when the window or pane is not in focus |
| Notification | `OSC 777;notify;<title>;<body>` (urxvt / VTE) | same | same |
| Progress | `OSC 9;4;<state>;<value>` (ConEmu / Windows Terminal) | progress ring on the tab, taskbar progress | no |

Desktop notifications can be switched off globally with [`notifications`](../reference/configuration.md#notifications) (`true` by default).

## Bell

The bell is a **profile setting** (put it in `[defaults]` or a `[[profile]]`):

```toml
[defaults]
bell_style = "none"          # "audible" | "window" | "taskbar" | "all" | "none", or a list
bell_sound = "~/sounds/bell.wav"
```

| `bell_style` | Effect |
| --- | --- |
| `none` (default) | no sound, no flash, no taskbar attention. The tab bell icon and the unfocused desktop notification still apply. |
| `audible` | play a sound |
| `window` | flash the pane for a quarter of a second (visual bell) |
| `taskbar` | request the OS's "attention" state for the window, only when the window is unfocused |
| `all` | all of the above |
| list, e.g. `["audible", "window"]` | any combination |

[`bell_sound`](../reference/profile-settings.md#bell_sound):

- Without it, `audible` plays a short 880 Hz tone (about 150 ms).
- With a file path, that file is played (any format the webview can decode). A list of files plays one picked at random each time.
- Relative paths are resolved against the config directory, `~` is expanded. The file must be referenced by the config (that is the case for any path you put in `bell_sound`) and be at most 64 MB.
- If the file cannot be read or played the built-in tone is used.
- A burst of bells (for example from tab completion) plays once: bells less than 150 ms apart are coalesced.

Visual aspects regardless of `bell_style`:

- If the pane that rang is not the active pane, a **bell icon** appears on its tab (and clears when you switch to it).
- If the window is not focused, a desktop notification titled with the pane title (or the profile name) and the body "Bell" is sent, subject to `notifications`.

Windows Terminal's `bellStyle` accepts `"all"`, `"audible"`, `"window"`, `"taskbar"`, `"none"` and arrays; the same values work here (its camelCase `bellSound` is `bell_sound`).

## Desktop notifications

Programs request a notification with:

```sh
# iTerm2 style (OSC 9): body only
printf '\e]9;Build finished\a'

# urxvt / VTE style (OSC 777): title and body
printf '\e]777;notify;%s;%s\a' "Build" "finished with 0 errors"
```

Terminux shows the notification through the OS notification service (first use asks the OS for permission). Details:

- Nothing is shown while the **window has focus and the sending pane is the active pane**. In every other case (another pane or tab is active, or the app is in the background) a notification is sent.
- The title is the title you gave (`777`), otherwise the pane's title, otherwise "Terminux". For `OSC 9;<text>` the whole text is the body.
- If the sending pane is not the active one, it gets the bell icon on its tab.
- `OSC 9;4;...` is progress and `OSC 9;9;...` a directory report (see below); neither raises a notification, and neither does any other `OSC 9;<digits>;...` payload. Everything else after `OSC 9;` is the notification body.
- Notifications are turned off globally with `notifications = false`; the tab icon still appears.

OSC 777 forms other than `notify` are ignored.

## Progress

`OSC 9;4;<state>;<value>` drives a progress ring on the tab and the taskbar progress of the window (Windows Terminal compatible):

| State | Meaning |
| --- | --- |
| `0` | clear the progress |
| `1` | normal, `<value>` is 0 to 100 |
| `2` | error, `<value>` 0 to 100 |
| `3` | indeterminate (spinner), no value |
| `4` | paused / warning, `<value>` 0 to 100 |

```sh
printf '\e]9;4;1;40\a'   # 40 %
printf '\e]9;4;3\a'      # busy
printf '\e]9;4;0\a'      # done, clear
```

The taskbar follows the active tab (the first pane with progress). Whether the OS displays taskbar progress depends on the platform; the tab ring always works. Remember to clear it (`4;0`), otherwise the ring stays.

## Tab indicators

- **Bell icon**: a bell or notification came from a pane that is not the active one.
- **Activity dot**: output arrived in a pane that is not visible (another tab, or a hidden pane).
- **Progress ring**: from `OSC 9;4`.

They clear when you focus the pane / tab.

## Sending notifications from scripts

Make a reusable helper (works in Terminux and, for `OSC 9`, in several other terminals):

```sh
# ~/.local/bin/tnotify
#!/bin/sh
printf '\e]777;notify;%s;%s\a' "${1:-Done}" "${2:-}"
```

Use it at the end of long commands: `make && tnotify Build ok || tnotify Build FAILED`.

Inside `tmux` or `screen` the sequences must be passed through (tmux: `set -g allow-passthrough on` and wrap the sequence in tmux's DCS passthrough); otherwise the multiplexer swallows them.

## Troubleshooting

- **No desktop notification**: check `notifications = true`; the window must be unfocused or another pane active; on Linux a notification daemon (D-Bus `org.freedesktop.Notifications`) must be running; the OS may have denied the permission prompt.
- **Sound does not play**: `bell_style` must include `audible` (or `all`); a custom file must exist, be inside the config reference (a path written in `bell_sound`) and be decodable by the webview; try without `bell_sound` to hear the default tone.
- **Beeps from tab completion**: set `bell_style = "none"` (the default), or leave only `window`.
- **Notification repeats**: the program is printing the sequence repeatedly.
- More in [Troubleshooting](16-troubleshooting.md).

## See also

- [Tabs](03-tabs.md): progress ring, indicators
- [Shell integration](10-shell-integration.md)
- [Configuration: `notifications`](../reference/configuration.md#notifications)
- [Profile settings: `bell_style`](../reference/profile-settings.md#bell_style), [`bell_sound`](../reference/profile-settings.md#bell_sound)
- [Escape sequences](../reference/escape-sequences.md)
