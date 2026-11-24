# Sidebar

A panel fixed on the right (or left) edge of the window, beside the panes, with two views: **Git** (source control) and **Snippets**. It belongs to the window: it stays open when you switch tabs and always works on the **last focused terminal** (of the active tab, or of the last terminal tab when the active one has none, e.g. a diff or settings tab).

## Contents

- [Opening, switching and placing it](#opening-switching-and-placing-it)
- [Git](#git)
- [Snippets](#snippets)
- [See also](#see-also)

## Opening, switching and placing it

| Command | Default keys | Effect |
| --- | --- | --- |
| [`toggle_git_sidebar`](../reference/actions.md#toggle_git_sidebar) | `Ctrl+Shift+G` | Show the Git view, or close the sidebar when it already shows it |
| [`toggle_snippets_sidebar`](../reference/actions.md#toggle_snippets_sidebar) | none | Same for the Snippets view |
| [`toggle_sidebar`](../reference/actions.md#toggle_sidebar) | none | Open the last used view, or close the sidebar |

- The bar at its top switches views (icons; the current one shows its name), has a `⋯` menu and a close button. Right-click the bar (or `⋯`) for "Move sidebar left / right" and "Close sidebar".
- Drag its inner edge to resize it. Width and side are remembered (per machine); the initial values come from [`sidebar_width`](../reference/configuration.md#sidebar_width) (300 px) and [`sidebar_position`](../reference/configuration.md#sidebar_position) (`"right"`).
- With vertical tabs on the same side, the sidebar sits between the tabs and the panes.
- `Escape` in the sidebar returns the focus to the terminal. The open view is saved with the [session](05-windows.md).
- Configs written for older versions keep working: `split_pane` with `type = "snippets"` / `"git"` and the `toggle_snippets_pane` / `open_snippets_pane` key names toggle the sidebar views; snippets / git panes in a saved session are dropped on restore.

## Git

Similar to VS Code's Source Control view, for the repository of the terminal you are working in.

- Open it with [`toggle_git_sidebar`](../reference/actions.md#toggle_git_sidebar) (`Ctrl+Shift+G`, palette "Toggle Git sidebar", pane menu "Source control (Git)").
- It follows the **last focused terminal**: click another pane or tab and the view switches to that pane's repository (the directory comes from the process, or from OSC 7 [shell integration](10-shell-integration.md)). "Pin to this terminal" in the `⋯` menu keeps it on the current terminal.
- Works in local, **SSH** (git runs on the remote host over a non-interactive `ssh` using the pane's own connection options) and **WSL** panes (`wsl.exe --cd <dir> --exec git`).
- Refreshes when the panel opens, after each action, when the terminal changes directory, when a shell-integrated command ends, when the window gets focus, and every [`git_pane_refresh_interval`](../reference/configuration.md#git_pane_refresh_interval) seconds (5) while the window is focused.

What it shows and does:

| Area | Actions |
| --- | --- |
| Header | Repository name (hover: root and tracked terminal), refresh, `⋯` menu (fetch, pull, pull with rebase, push, force push with lease, publish, amend, undo last commit, stage / unstage / discard all, stash, branches, pin) |
| Branch bar | Current branch (click: switch to a local or remote branch, create a branch, create from another branch); sync button with behind↓ / ahead↑ counts (pull then push, or **Publish** when the branch has no upstream); fetch |
| Commit box | Message (kept per repository until committed), `Ctrl+Enter` commits, **Amend** (prefills the last message). With nothing staged it offers to stage everything and commit |
| Merge changes / Staged changes / Changes | Status letter (M, A, D, R, U = untracked, ! = conflict). Click: diff (untracked and conflicted files open the file); double-click: open the file; hover buttons: open file, discard, stage / unstage; right-click: same plus copy path. Section buttons: stage all, unstage all, discard all |
| Stashes | Click: diff; apply, pop, drop; `+` stashes the changes (optional message) |
| Commits | Last 100 commits with branch / tag badges. Click: commit diff; right-click: copy id / message, create branch from it, switch to it (detached), revert |

Diffs open in a **diff tab** (one per window, reused for the next diff; the tab icon is the Git icon): file diffs against the index or `HEAD` with old/new line numbers, commit and stash patches with their stats. Its header can stage / unstage the file and open it.

Discard, delete, force push and branch deletion ask for confirmation. git never prompts: when an operation needs credentials or a host key confirmation (or fails for another reason during fetch / pull / push), the error toast has a **Run in terminal** button that types the same `git -C <root> …` command in the tracked terminal. The view only runs a fixed set of git subcommands and options.

## Snippets

Lists the `send_input` actions (snippets) with a filter box; clicking one sends it to the last focused terminal. See [Snippets](11-command-palette.md#snippets) for saving and writing snippets.

## See also

- [Panes](04-panes.md)
- [Command palette](11-command-palette.md)
- [Shell integration](10-shell-integration.md) (directory tracking, finished-command refresh)
- [Actions reference](../reference/actions.md)
