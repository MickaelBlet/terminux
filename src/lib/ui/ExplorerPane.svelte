<script lang="ts" module>
  import type { DirEntry } from "../explorer";
  /** Expanded directories per `host:root` (survive remounts and switching sidebar views). */
  const expandedByRoot = new Map<string, Set<string>>();
  let pinnedPane: string | null = null;
  const HIDDEN_KEY = "terminux.explorerHidden";
  type Listing = DirEntry[] | { error: string };
</script>

<script lang="ts">
  // Explorer sidebar view: directory tree of the last focused terminal (or the pinned one), rooted
  // at its Git repository when it is in one. Local, ssh and WSL panes; read-only.
  import { untrack } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";
  import { app } from "../state.svelte";
  import { sessions } from "../term/session";
  import { cmd } from "../git";
  import { ancestors, baseName, cdLine, flatten, quotePath, relPath, type Row } from "../explorer";
  import type { MenuItem } from "./types";
  import { git, hostOf, type GitHost } from "./git/run";
  import Icon from "./Icon.svelte";

  let pinned = $state<string | null>(pinnedPane);
  $effect(() => {
    pinnedPane = pinned;
  });
  /** Terminal pane the view works on. */
  const tracked = $derived(pinned && app.panes[pinned] && sessions.has(pinned) ? pinned : app.recentTerminal);
  /** Hidden-files toggle of the menu (per machine), else `explorer_show_hidden`. */
  let hiddenOverride = $state<boolean | null>(lsHidden());
  function lsHidden(): boolean | null {
    try {
      const v = localStorage.getItem(HIDDEN_KEY);
      return v == null ? null : v === "true";
    } catch {
      return null;
    }
  }
  function toggleHidden() {
    hiddenOverride = !hidden;
    try {
      localStorage.setItem(HIDDEN_KEY, String(hiddenOverride));
    } catch {}
  }
  const hidden = $derived(hiddenOverride ?? app.config.explorer_show_hidden !== false);

  type Phase = "loading" | "ready" | "no-terminal" | "error";
  let phase = $state<Phase>("loading");
  let errorText = $state("");
  /** Terminal directory. */
  let here = $state<GitHost | null>(null);
  /** Tree root (repository top-level, else the terminal directory). */
  let root = $state<GitHost | null>(null);
  let entries = $state.raw(new Map<string, Listing>());
  let expanded = $state.raw(new Set<string>());
  let selected = $state<string | null>(null);
  let busy = $state(false);
  let list = $state<HTMLDivElement>();

  const rows = $derived(root ? flatten(root.dir, entries, expanded, hidden) : []);
  const rootListing = $derived(root ? entries.get(root.dir) : undefined);

  const keyOf = (h: Pick<GitHost, "id" | "dir">) => `${h.id ?? ""}:${h.dir}`;

  async function listDir(h: Pick<GitHost, "id">, dir: string): Promise<Listing> {
    try {
      return await invoke<DirEntry[]>("dir_list", { id: h.id, dir });
    } catch (e) {
      return { error: String(e) };
    }
  }

  function setExpanded(next: Set<string>) {
    expanded = next;
    if (root) expandedByRoot.set(keyOf(root), next);
  }

  // ---------- loading ----------

  let seq = 0;
  /** Resolve the root from the tracked terminal, then (re)list the root and the expanded directories. */
  async function refresh() {
    const my = ++seq;
    const id = tracked;
    const h = id ? await hostOf(id) : null;
    if (my !== seq) return;
    if (!h) {
      [phase, here, root] = ["no-terminal", null, null];
      return;
    }
    const sameHere = here && here.id === h.id && here.dir === h.dir && here.paneId === h.paneId;
    let top = sameHere && root ? root.dir : null;
    if (!top) {
      const r = await git(h, cmd.root());
      if (my !== seq) return;
      top = r.code === 0 && r.stdout.trim() ? r.stdout.trim() : h.dir;
    }
    const next = { ...h, dir: top };
    const changedRoot = !root || keyOf(root) !== keyOf(next) || root.paneId !== next.paneId;
    let open = changedRoot ? new Set(expandedByRoot.get(keyOf(next)) ?? []) : new Set(expanded);
    // Reveal the terminal directory when it changed.
    if (!sameHere) for (const d of ancestors(top, h.dir)) open.add(d);
    busy = true;
    try {
      const dirs = [top, ...[...open].filter((d) => relPath(top, d))];
      const lists = await Promise.all(dirs.map((d) => listDir(h, d)));
      if (my !== seq) return;
      const map = new Map<string, Listing>();
      dirs.forEach((d, i) => map.set(d, lists[i]));
      // Directories that disappeared are collapsed.
      open = new Set([...open].filter((d) => { const l = map.get(d); return l && !("error" in l && /No such file|not found|cannot find/i.test(l.error)); }));
      here = h;
      if (changedRoot) root = next;
      entries = map;
      setExpanded(open);
      if (!sameHere && h.dir !== top) selected = h.dir;
      const l = map.get(top);
      if (l && "error" in l) {
        phase = "error";
        errorText = l.error;
      } else phase = "ready";
    } finally {
      if (my === seq) busy = false;
    }
  }

  // Tracked terminal, its directory, finished commands.
  $effect(() => {
    void [tracked, tracked && app.panes[tracked]?.cwd, app.commandsDone];
    untrack(() => refresh());
  });
  $effect(() => {
    if (app.windowFocused) untrack(() => refresh());
  });

  async function expand(path: string) {
    const h = root;
    if (!h || expanded.has(path)) return;
    setExpanded(new Set([...expanded, path]));
    const my = seq;
    const l = await listDir(h, path);
    if (my !== seq || root !== h) return;
    entries = new Map(entries).set(path, l);
  }

  function collapse(path: string) {
    if (!expanded.has(path)) return;
    setExpanded(new Set([...expanded].filter((d) => d !== path && !relPath(path, d))));
  }

  function collapseAll() {
    setExpanded(new Set());
  }

  // ---------- actions ----------

  function terminal() {
    const id = root?.paneId ?? tracked;
    return id ? sessions.get(id) : undefined;
  }

  async function open(path: string, mode?: string) {
    const s = terminal();
    if (!s) return app.toast("No terminal.", "warn");
    try {
      await s.openFile({ path }, mode);
    } catch (e) {
      app.toast(e instanceof Error ? e.message : String(e), "error");
    }
  }

  function activate(r: Row) {
    selected = r.path;
    if (r.dir) (expanded.has(r.path) ? collapse : expand)(r.path);
    else void open(r.path);
  }

  function send(text: string, focus = true) {
    const s = terminal();
    if (!s) return app.toast("No terminal.", "warn");
    s.input(text);
    if (focus) app.focusPane(s.paneId);
  }

  const copy = (text: string) => writeText(text).then(() => app.toast("Copied to clipboard", "info"), () => {});

  function reveal(dir: string) {
    invoke("open_path", { path: dir }).catch((e) => app.toast(String(e), "error"));
  }

  /** Parent directory of a tree entry (the root for its top-level entries). */
  const parentOf = (path: string) => {
    const i = path.search(/[\\/][^\\/]*$/);
    const p = i > 0 ? path.slice(0, i) : path;
    return root && relPath(root.dir, p) !== null ? p : (root?.dir ?? p);
  };

  function showMenu(e: MouseEvent, groups: MenuItem[][]) {
    e.preventDefault();
    e.stopPropagation();
    app.menu = { x: e.clientX, y: e.clientY, groups: groups.filter((g) => g.length) };
  }

  function rowMenu(e: MouseEvent, r: Row) {
    selected = r.path;
    const dir = r.dir ? r.path : parentOf(r.path);
    const rel = root ? (relPath(root.dir, r.path) ?? r.path) : r.path;
    showMenu(e, [
      r.dir
        ? [{ label: expanded.has(r.path) ? "Collapse" : "Expand", icon: "folder-open", run: () => activate(r) }]
        : [
            { label: "Open", icon: "file", run: () => void open(r.path, "builtin") },
            { label: "Open to the side", icon: "split-right", run: () => void open(r.path, "builtin_pane") },
          ],
      [
        { label: "cd here in terminal", icon: "terminal", run: () => send(cdLine(dir) + "\r") },
        { label: "Insert path in terminal", run: () => send(quotePath(r.path) + " ") },
        { label: "Reveal in file manager", icon: "folder", run: () => reveal(dir) },
      ],
      [
        { label: "Copy path", icon: "copy", run: () => void copy(r.path) },
        { label: "Copy relative path", icon: "copy", run: () => void copy(rel) },
      ],
    ]);
  }

  function mainMenu(e: MouseEvent) {
    showMenu(e, [
      [
        { label: "Reveal terminal directory", icon: "focus", disabled: !here, run: () => void revealCwd() },
        { label: "Collapse all", icon: "collapse-all", run: collapseAll },
        { label: "Refresh", icon: "refresh", run: () => void refresh() },
      ],
      [
        { label: "Show hidden files", checked: hidden, run: toggleHidden },
        { label: "Pin to this terminal", icon: "pin", checked: !!pinned, run: togglePin },
      ],
      [{ label: "Reveal root in file manager", icon: "folder", disabled: !root, run: () => root && reveal(root.dir) }],
    ]);
  }

  async function revealCwd() {
    if (!here || !root) return;
    for (const d of ancestors(root.dir, here.dir)) await expand(d);
    selected = here.dir;
    scrollToSelected();
  }

  function togglePin() {
    pinned = pinned ? null : (tracked ?? null);
  }

  // ---------- keyboard ----------

  function scrollToSelected() {
    queueMicrotask(() => list?.querySelector(".row.selected")?.scrollIntoView({ block: "nearest" }));
  }

  function onKey(e: KeyboardEvent) {
    if (!rows.length) return;
    const i = rows.findIndex((r) => r.path === selected);
    const r = rows[i];
    const go = (j: number) => {
      selected = rows[Math.max(0, Math.min(rows.length - 1, j))].path;
      scrollToSelected();
    };
    switch (e.key) {
      case "ArrowDown":
        go(i + 1);
        break;
      case "ArrowUp":
        go(i < 0 ? rows.length - 1 : i - 1);
        break;
      case "Home":
        go(0);
        break;
      case "End":
        go(rows.length - 1);
        break;
      case "ArrowRight":
        if (r?.dir && !expanded.has(r.path)) void expand(r.path);
        else if (r?.dir) go(i + 1);
        break;
      case "ArrowLeft":
        if (r?.dir && expanded.has(r.path)) collapse(r.path);
        else if (r) {
          const p = parentOf(r.path);
          const j = rows.findIndex((x) => x.path === p);
          if (j >= 0) go(j);
        }
        break;
      case "Enter":
      case " ":
        if (r) activate(r);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  const trackedTitle = $derived(tracked ? app.paneTitle(tracked) : "");
</script>

<div class="explorer">
  <header>
    <Icon name="folder" size={13} />
    <span class="head-title" title={root ? `${root.dir}\nTerminal: ${trackedTitle}` : trackedTitle}>
      {root ? baseName(root.dir) : "Explorer"}
    </span>
    {#if pinned}<span class="pinned" title="Pinned to {trackedTitle}"><Icon name="pin" size={11} /></span>{/if}
    <span class="spacer"></span>
    {#if busy}<span class="busy"></span>{/if}
    <button title="Collapse all" aria-label="Collapse all" disabled={!expanded.size} onclick={collapseAll}><Icon name="collapse-all" size={13} /></button>
    <button title="Refresh" aria-label="Refresh" onclick={() => refresh()}><Icon name="refresh" size={13} /></button>
    <button title="More actions…" aria-label="More actions" onclick={mainMenu}><Icon name="menu" size={13} /></button>
  </header>

  {#if phase === "no-terminal"}
    <p class="empty">No terminal.</p>
  {:else if phase === "error"}
    <div class="empty error">
      <p>{errorText}</p>
      <button onclick={() => refresh()}>Retry</button>
    </div>
  {:else if phase === "loading" || !rootListing}
    <p class="empty">Loading…</p>
  {:else}
    <div
      class="tree"
      role="tree"
      tabindex="0"
      aria-label="Files"
      bind:this={list}
      onkeydown={onKey}
      onfocus={() => !selected && rows.length && (selected = rows[0].path)}
    >
      {#each rows as r (r.path)}
        <div
          class="row"
          class:selected={selected === r.path}
          class:cwd={r.dir && here?.dir === r.path}
          role="treeitem"
          aria-selected={selected === r.path}
          aria-expanded={r.dir ? expanded.has(r.path) : undefined}
          tabindex="-1"
          title={r.error ?? r.path}
          style:padding-left="{6 + r.depth * 12}px"
          onclick={() => activate(r)}
          oncontextmenu={(e) => rowMenu(e, r)}
          onkeydown={() => {}}
        >
          <span class="chev" class:open={r.dir && expanded.has(r.path)}>
            {#if r.dir}<Icon name="chevron" size={11} />{/if}
          </span>
          <Icon name={r.dir ? (expanded.has(r.path) ? "folder-open" : "folder") : "file"} size={13} />
          <span class="name" class:dot={r.name.startsWith(".")}>{r.name}</span>
          {#if r.loading}<span class="hint">…</span>{:else if r.error}<span class="hint err">!</span>{/if}
        </div>
      {:else}
        <p class="empty">Empty directory.</p>
      {/each}
    </div>
  {/if}
</div>

<style>
  .explorer {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--fg);
    font-size: 12px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px 6px 6px;
    font-weight: 600;
  }
  .head-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pinned {
    color: var(--accent);
    display: flex;
  }
  .spacer {
    flex: 1;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--muted);
    font: inherit;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    background: var(--hover, #ffffff14);
    color: var(--fg);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .busy {
    width: 10px;
    height: 10px;
    border: 2px solid var(--accent);
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .tree {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0 2px 4px;
    outline: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 22px;
    padding-right: 6px;
    border-radius: 3px;
    color: var(--fg);
    cursor: pointer;
    white-space: nowrap;
    outline: none;
    user-select: none;
  }
  .row :global(svg) {
    flex-shrink: 0;
    color: var(--muted);
  }
  .row:hover {
    background: var(--hover, #ffffff10);
  }
  .row.selected {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .tree:focus .row.selected {
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .row.cwd .name {
    color: var(--accent);
    font-weight: 600;
  }
  .chev {
    display: inline-flex;
    width: 11px;
    flex-shrink: 0;
    transform: rotate(-90deg);
    transition: transform 0.1s;
  }
  .chev.open {
    transform: none;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }
  .name.dot {
    opacity: 0.7;
  }
  .hint {
    color: var(--muted);
  }
  .hint.err {
    color: var(--red, #e06c75);
  }
  .empty {
    padding: 8px;
    color: var(--muted);
  }
  .empty.error p {
    color: var(--red, #e06c75);
    word-break: break-word;
  }
</style>
