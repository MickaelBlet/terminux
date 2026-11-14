# Escape sequences

The terminal control sequences Terminux handles itself on top of what xterm.js implements: OSC commands (titles, hyperlinks, progress, notifications, clipboard, working directory, shell integration), the `CSI 2 J` scrollback behavior, inline images (Sixel) and the keyboard sequence sent for `Shift+Enter`.

- [Terminal identity](#terminal-identity)
- [OSC summary](#osc-summary)
- [Titles: OSC 0, 1, 2](#titles-osc-0-1-2)
- [Hyperlinks: OSC 8](#hyperlinks-osc-8)
- [Progress and notifications: OSC 9, OSC 777, BEL](#progress-and-notifications-osc-9-osc-777-bel)
- [Working directory: OSC 7, OSC 9;9, OSC 633;P](#working-directory-osc-7-osc-99-osc-633p)
- [Shell integration: OSC 133 and OSC 633](#shell-integration-osc-133-and-osc-633)
- [Clipboard: OSC 52](#clipboard-osc-52)
- [Images: Sixel and iTerm inline images](#images-sixel-and-iterm-inline-images)
- [CSI and keyboard handling](#csi-and-keyboard-handling)
- [Modes that change Terminux behavior](#modes-that-change-terminux-behavior)
- [Not supported](#not-supported)

## Terminal identity

The terminal engine is [xterm.js](https://xtermjs.org/) 5.5 (renderer WebGL, canvas or DOM, see [`renderer`](configuration.md#renderer)) with the Unicode 11 width tables. Processes see:

| Variable | Value |
| --- | --- |
| `TERM` | `xterm-256color` |
| `COLORTERM` | `truecolor` |
| `TERM_PROGRAM` | `terminux` |
| `TERM_PROGRAM_VERSION` | the Terminux version |

All sequences implemented by xterm.js itself (SGR including 256 and true color, cursor movement, scrolling regions, alternate screen, mouse tracking modes, bracketed paste, application cursor keys, OSC 0/1/2 titles, DECSET/DECRST modes, device attribute reports, ...) work as in xterm.js; see its [supported sequences](https://xtermjs.org/docs/api/vtfeatures/). The sections below list what Terminux registers or customizes.

## OSC summary

| OSC | Form | Effect | Requires |
| --- | --- | --- | --- |
| 0, 1, 2 | `OSC 2 ; title ST` | Pane / tab title | not [`suppress_application_title`](profile-settings.md#suppress_application_title) |
| 7 | `OSC 7 ; file://host/path ST` | Working directory | none |
| 8 | `OSC 8 ; params ; URI ST text OSC 8 ; ; ST` | Clickable hyperlink | none |
| 9 | `OSC 9 ; 4 ; state ; progress ST` | Progress ring on the tab and taskbar | none |
| 9 | `OSC 9 ; 9 ; path ST` | Working directory (ConEmu) | none |
| 9 | `OSC 9 ; text ST` | Desktop notification (iTerm2 style) | [`notifications`](configuration.md#notifications) |
| 52 | `OSC 52 ; c ; base64 ST` | Set the clipboard | [`osc52_clipboard = true`](configuration.md#osc52_clipboard) |
| 133 | `OSC 133 ; A/B/C/D[;code] ST` | Shell integration marks (FinalTerm) | none |
| 633 | `OSC 633 ; A/B/C/D/E/P ST` | Shell integration marks (VS Code) | none |
| 777 | `OSC 777 ; notify ; title ; body ST` | Desktop notification (urxvt) | [`notifications`](configuration.md#notifications) |

`ST` is `ESC \` or `BEL` (`\a`). Every OSC listed here as handled is consumed (it is not passed on to xterm.js's own handler).

## Titles: OSC 0, 1, 2

Handled by xterm.js; Terminux uses the title as the pane title. The tab shows, in order of precedence: the name given with the rename action, the application title (OSC 0/2), the profile's `tab_title` (also `--title` on the command line), then the profile name. With [`show_terminal_title_in_titlebar`](configuration.md#show_terminal_title_in_titlebar) the active tab's title is also the window title. A profile with `suppress_application_title = true` ignores application titles.

```sh
printf '\e]2;build output\a'
```

## Hyperlinks: OSC 8

Explicit hyperlinks are supported through xterm.js's link handler: activating the link opens the URI with the system's default handler. Plain-text URLs (`http://` and `https://`) are detected and made clickable as well while [`detect_urls`](configuration.md#detect_urls) is on (default).

```sh
printf '\e]8;;https://example.com\e\\example\e]8;;\e\\\n'
```

## Progress and notifications: OSC 9, OSC 777, BEL

**Progress** (ConEmu / Windows Terminal convention): `OSC 9 ; 4 ; <state> ; <progress> ST`.

| State | Meaning |
| --- | --- |
| `0` | No progress (clears the indicator) |
| `1` | Normal; `progress` is 0-100 |
| `2` | Error |
| `3` | Indeterminate |
| `4` | Paused |

A state outside 1-4 clears the indicator. The progress is shown as a ring on the tab and mirrored in the window's taskbar progress bar (it follows the active tab). `progress` is clamped to 100 and optional (default 0).

```sh
printf '\e]9;4;1;40\a'   # 40 %
printf '\e]9;4;0\a'      # clear
```

**Notifications**: `OSC 9 ; <text> ST` (iTerm2) shows a desktop notification titled with the pane's title (or `Terminux` when it has none). `OSC 777 ; notify ; <title> ; <body> ST` (urxvt) shows a notification with the given title and body (semicolons in the body are kept). Notifications are skipped when the window has focus and the pane is the active one; otherwise they fire and the pane gets a bell badge. They are controlled by [`notifications`](configuration.md#notifications) (default `true`); the first one asks the system for permission. An `OSC 9` whose payload starts with `digits;` that is neither progress nor a directory report is ignored.

```sh
printf '\e]777;notify;Build;finished\a'
printf '\e]9;Build finished\a'
```

**Bell**: `BEL` (`\a`) triggers the profile's [`bell_style`](profile-settings.md#bell_style) (sound, window flash, taskbar attention, or any combination). When the window is not focused a desktop notification titled with the pane title and the body `Bell` is sent (if `notifications` is on), and a non-active pane gets a bell badge.

## Working directory: OSC 7, OSC 9;9, OSC 633;P

Three equivalent ways to report the current directory:

| Sequence | Payload |
| --- | --- |
| `OSC 7 ; file://host/path ST` | `file://` URI; the path is percent-decoded; `file:///C:/dir` becomes `C:/dir` |
| `OSC 9 ; 9 ; "path" ST` | ConEmu form; surrounding quotes are removed |
| `OSC 633 ; P ; Cwd=path ST` | VS Code form (backslash and `\xHH` escapes decoded, control characters stripped) |

The reported directory is used as a fallback to find where a pane is: when you split or duplicate a pane, open the current directory ([`open_cwd`](actions.md#open_cwd)) or save the pane in a session, Terminux first asks the operating system for the process's real directory and uses the reported one if that is unavailable (for example for processes the OS cannot inspect), then the profile's starting directory.

## Shell integration: OSC 133 and OSC 633

Shells (or their prompts) emit marks to delimit prompt, command and output. Two dialects are understood; the A-D marks are identical in both.

| Mark | Meaning |
| --- | --- |
| `OSC 133 ; A ST` (or `633 ; A`) | Prompt start |
| `OSC 133 ; B ST` | Prompt end / command start (where the typed command begins) |
| `OSC 133 ; C ST` | Output start (command executed) |
| `OSC 133 ; D ; <exit code> ST` | Command finished; the exit code is optional |
| `OSC 633 ; E ; <commandline> ST` | The exact command line (`\\` is a backslash, `\xHH` a byte; control characters are stripped). Used for recent commands |
| `OSC 633 ; P ; Cwd=<path> ST` | Working directory, see above |

Each `A` mark adds a **scroll mark** on the prompt line: grey until the command finishes, then green (exit code 0) or red (non-zero). Up to 500 commands are tracked per pane; marks disappear with the scrollback lines they point to.

What each feature needs:

| Feature | Needs |
| --- | --- |
| Colored command marks, [`scroll_to_*_mark`](actions.md#scroll_to_mark), [`show_marks_on_scrollbar`](profile-settings.md#show_marks_on_scrollbar) | `A` (and `C` + `D` for the colors) |
| [`select_command`](actions.md#select_command) (select the command line) | `B` and `C` |
| [`select_output`](actions.md#select_output) (select the output) | `C` and `D` |
| [`show_suggestions`](actions.md#show_suggestions) / [`show_recent_commands`](actions.md#show_recent_commands) | `B` and `C`, or `633 ; E` for the exact text |
| [`save_snippet`](actions.md#save_snippet) without a selection (current command line) | `B` |
| [`reposition_cursor_with_mouse`](profile-settings.md#reposition_cursor_with_mouse) (click on the command line moves the cursor) | `B` |
| Current directory for new splits | OSC 7 / 9;9 / 633;P (not required on Linux, see above) |

If the shell emits no marks, set [`auto_mark_prompts = true`](profile-settings.md#auto_mark_prompts) to add a mark on the line where you press `Enter` instead.

Ready-to-paste snippets for bash, zsh, fish, PowerShell and cmd are in [Shell integration](../user-guide/10-shell-integration.md). The minimal bash form:

```sh
PS0='\[\e]133;C\a\]'
PROMPT_COMMAND='printf "\e]133;D;%s\a\e]7;file://%s%s\a" "$?" "$HOSTNAME" "$PWD"'
PS1='\[\e]133;A\a\]'"$PS1"'\[\e]133;B\a\]'
```

## Clipboard: OSC 52

`OSC 52 ; <targets> ; <base64> ST` lets a program (vim, tmux, ssh sessions) put text on the system clipboard. It is **off by default** because any output, for example a `cat`ed file, could otherwise replace what you paste next. Enable it with [`osc52_clipboard = true`](configuration.md#osc52_clipboard).

- Write only: the clipboard is **never read**. A query (`OSC 52 ; c ; ? ST`) is ignored.
- The selection target field (`c`, `p`, ...) is ignored; the text goes to the system clipboard.
- The base64 payload is limited to 1 MiB (about 768 KB of text); larger payloads and invalid base64 are ignored.
- With the setting off the sequence is silently dropped.

```sh
printf '\e]52;c;%s\a' "$(printf 'copied from a script' | base64 | tr -d '\n')"
```

## Images: Sixel and iTerm inline images

Terminux loads the xterm.js image addon with its default options: **Sixel** graphics (`DCS q ... ST`) and the **iTerm2 inline image protocol** (`OSC 1337 ; File=...`) are rendered inline. Defaults of the addon: images up to 16 megapixels each, a 128 MB image storage (older images are replaced by a placeholder), a 256-color initial Sixel palette, scrolling when an image is output, and answers to the window / cell size reports `CSI 14 t`, `CSI 16 t` and `CSI 18 t` so that tools can scale images.

```sh
img2sixel picture.png       # libsixel
chafa -f sixel picture.png  # chafa
```

## CSI and keyboard handling

| Item | Behavior |
| --- | --- |
| `CSI 2 J` (erase display, sent by `clear` / `Ctrl+L`) | On the normal screen, the visible content is first pushed into the scrollback (like VTE terminals) so nothing is lost, then the screen is erased. Not applied on the alternate screen. |
| `CSI 3 J` (erase scrollback) | Standard xterm.js behavior; also what `clear_scrollback` sends internally. |
| `Shift+Enter` | Sends `ESC` `CR` (`\e\r`) instead of `CR`, so programs that support it insert a newline instead of submitting. Not rebindable. |
| `Ctrl+V` with no text on the clipboard | A literal `0x16` is sent so that applications can read an image from the clipboard themselves. |
| Pasted text | Control characters other than tab, CR and LF are removed. Sent with bracketed paste markers when the application enabled mode 2004. |
| Alt as Meta | On macOS (`macOptionIsMeta`). On Linux and Windows `Alt+key` sends `ESC` + key as xterm does. |
| Click to move cursor | With shell integration and [`reposition_cursor_with_mouse`](profile-settings.md#reposition_cursor_with_mouse): sends `ESC [ C` / `ESC [ D` (or `ESC O C` / `ESC O D` in application cursor key mode) repeated to reach the clicked cell. |
| `clear_screen` / `clear_buffer` with `clear = "screen"` | Performed on Terminux's own terminal state (the process receives nothing): the prompt row becomes the first row and the scrollback is untouched. |

## Modes that change Terminux behavior

| Mode | Effect |
| --- | --- |
| Bracketed paste (`CSI ? 2004 h`) | The multi-line and large paste warnings (`warn unless the application enabled bracketed paste`) are not shown by default; see [`multi_line_paste_warning`](configuration.md#multi_line_paste_warning). |
| Mouse tracking (`CSI ? 1000 h` and relatives) | Clicks go to the application (vim, htop, tmux), including middle and right clicks. Hold `Shift` to select text or to use Terminux's click actions. |
| Alternate screen (`CSI ? 1049 h`) | `auto_mark_prompts` only marks lines on the normal screen. |
| Application cursor keys (`CSI ? 1 h`) | Changes the sequences sent by click-to-move-cursor. |

## Not supported

- The Kitty graphics and keyboard protocols.
- OSC 1337 commands other than inline images (for example `SetMark`).
- Applications that need terminfo entries other than `xterm-256color`.

## See also

- [Shell integration guide](../user-guide/10-shell-integration.md)
- [configuration.md](configuration.md#osc52_clipboard): `osc52_clipboard`, `notifications`, `detect_urls`
- [profile-settings.md](profile-settings.md#bell_style): `bell_style`, `auto_mark_prompts`, `show_marks_on_scrollbar`
- [actions.md](actions.md#select_command): mark based actions
