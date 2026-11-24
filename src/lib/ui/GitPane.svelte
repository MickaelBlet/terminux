<script lang="ts" module>
  /** Unsent commit messages, by repository root (survive remounts and moving the pane). */
  const drafts = new Map<string, string>();
  const SECTIONS_KEY = "terminux.gitSections";
  let pinnedPane: string | null = null;
</script>

<script lang="ts">
  // Git sidebar view (source control): status, staging, commit, branches, sync, log and stashes of
  // the repository of the last focused terminal (or the pinned one).
  import { untrack } from "svelte";
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";
  import { app } from "../state.svelte";
  import { sessions } from "../term/session";
  import {
    classifyError, cmd, errorMessage, gitRefreshMs, joinRepo, parseBranches, parseLog, parseStashes, parseStatus, remotesOf, repoName, shellLine, splitPath,
    type Branch, type Commit, type FileChange, type Stash, type Status,
  } from "../git";
  import type { DiffSpec } from "../term/appearance";
  import type { MenuItem, PaletteItem } from "./types";
  import { git, hostOf, type GitHost, type GitOut } from "./git/run";
  import Icon from "./Icon.svelte";

  /** Pinned terminal pane (module state: kept while switching sidebar views). */
  let pinned = $state<string | null>(pinnedPane);
  $effect(() => {
    pinnedPane = pinned;
  });
  /** Terminal pane the panel works on. */
  const tracked = $derived(pinned && app.panes[pinned] && sessions.has(pinned) ? pinned : app.recentTerminal);

  type Phase = "loading" | "ready" | "not-repo" | "no-terminal" | "error";
  let phase = $state<Phase>("loading");
  let errorText = $state("");
  /** Directory of the tracked terminal (also when it is not in a repository). */
  let here = $state<GitHost | null>(null);
  /** Repository: host with `dir` = root. */
  let repo = $state<GitHost | null>(null);
  let status = $state<Status | null>(null);
  let commits = $state<Commit[]>([]);
  let branches = $state<Branch[]>([]);
  let stashes = $state<Stash[]>([]);
  let busy = $state<string | null>(null);
  let message = $state("");
  let amend = $state(false);
  let textarea = $state<HTMLTextAreaElement>();

  const defaults = { conflicts: true, staged: true, changes: true, log: true, stashes: true };
  let open = $state<typeof defaults>({ ...defaults, ...lsSections() });
  function lsSections(): Partial<typeof defaults> {
    try {
      return JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "{}");
    } catch {
      return {};
    }
  }
  function toggle(k: keyof typeof defaults) {
    open[k] = !open[k];
    try {
      localStorage.setItem(SECTIONS_KEY, JSON.stringify(open));
    } catch {}
  }

  const untracked = $derived(app.config.git_pane_show_untracked !== false);
  const root = $derived(repo?.dir ?? "");
  const remotes = $derived(remotesOf(branches));

  // Commit message draft per repository.
  $effect(() => {
    const r = root;
    untrack(() => (message = drafts.get(r) ?? ""));
  });
  $effect(() => {
    const m = message;
    const r = untrack(() => root);
    if (r) m ? drafts.set(r, m) : drafts.delete(r);
  });

  // ---------- loading ----------

  let seq = 0;
  /** `full`: also log, branches and stashes (else only the status, refetching the rest when HEAD moved). */
  async function refresh(full = true) {
    const my = ++seq;
    const id = tracked;
    const h = id ? await hostOf(id) : null;
    if (my !== seq) return;
    if (!h) {
      [phase, here, repo] = ["no-terminal", null, null];
      return;
    }
    let base = repo && here && here.id === h.id && here.dir === h.dir && here.paneId === h.paneId ? repo.dir : null;
    here = h;
    if (!base) {
      const r = await git(h, cmd.root());
      if (my !== seq) return;
      if (r.code !== 0) {
        repo = null;
        status = null;
        phase = classifyError(r.stderr) === "not-repo" ? "not-repo" : "error";
        errorText = errorMessage(r.stderr, r.stdout);
        return;
      }
      base = r.stdout.trim();
      full = true;
    }
    const host = { ...h, dir: base };
    const st = await git(host, cmd.status(untracked));
    if (my !== seq) return;
    if (st.code !== 0) {
      phase = "error";
      errorText = errorMessage(st.stderr, st.stdout);
      return;
    }
    const next = parseStatus(st.stdout);
    if (!full && (next.oid !== status?.oid || next.branch !== status?.branch || repo?.dir !== base)) full = true;
    if (full) {
      const [lg, br, sh] = await Promise.all([git(host, cmd.log()), git(host, cmd.branches()), git(host, cmd.stashList())]);
      if (my !== seq) return;
      commits = lg.code === 0 ? parseLog(lg.stdout) : [];
      branches = br.code === 0 ? parseBranches(br.stdout) : [];
      stashes = sh.code === 0 ? parseStashes(sh.stdout) : [];
    }
    status = next;
    if (repo?.dir !== host.dir || repo.id !== host.id || repo.paneId !== host.paneId) repo = host;
    phase = "ready";
  }

  // Tracked terminal, its directory, finished commands, the tab becoming visible.
  $effect(() => {
    void [tracked, tracked && app.panes[tracked]?.cwd, app.commandsDone, untracked];
    untrack(() => refresh(true));
  });
  $effect(() => {
    if (app.windowFocused) untrack(() => refresh(false));
  });
  $effect(() => {
    const ms = gitRefreshMs(app.config.git_pane_refresh_interval);
    if (!ms || !app.windowFocused) return;
    const t = setInterval(() => !busy && refresh(false), ms);
    return () => clearInterval(t);
  });

  // ---------- operations ----------

  /** Run a git command on the repository; errors become toasts. */
  async function op(label: string, args: string[], o: { stdin?: string; done?: string } = {}): Promise<boolean> {
    const h = repo;
    if (!h || busy) return false;
    busy = label;
    let r: GitOut;
    try {
      r = await git(h, args, o.stdin);
    } finally {
      busy = null;
    }
    if (r.code !== 0) fail(args, r, !!o.stdin);
    else if (o.done) app.toast(o.done, "info");
    await refresh(true);
    return r.code === 0;
  }

  function fail(args: string[], r: GitOut, stdin: boolean) {
    const kind = classifyError(r.stderr);
    const msg = `git ${args[0]}: ${errorMessage(r.stderr, r.stdout)}`;
    const branch = status?.branch;
    if (kind === "no-upstream" && branch) {
      app.toast(msg, "warn", { label: "Publish branch", run: () => publish() });
    } else if (!stdin && (kind === "auth" || ["fetch", "pull", "push"].includes(args[0]))) {
      // Credentials, host keys, hooks needing a tty…: let the user run it interactively.
      app.toast(msg, "error", { label: "Run in terminal", run: () => runInTerminal(args) });
    } else {
      app.toast(msg, "error");
    }
  }

  function runInTerminal(args: string[]) {
    const id = repo?.paneId ?? tracked;
    const s = id ? sessions.get(id) : undefined;
    if (!s || !repo) return app.toast("No terminal in this tab.", "warn");
    s.input(shellLine(["-C", repo.dir, ...args]) + "\r");
    app.focusPane(s.paneId);
  }

  const paths = (list: FileChange[]) => list.map((f) => f.path);

  function stage(list: FileChange[]) {
    return op("Staging", cmd.stage(paths(list)));
  }
  function unstage(list: FileChange[]) {
    return op("Unstaging", cmd.unstage(paths(list)));
  }
  async function discard(list: FileChange[]) {
    if (!list.length) return;
    const fresh = list.filter((f) => f.kind === "untracked");
    const modified = list.filter((f) => f.kind === "changed");
    const what = list.length === 1 ? splitPath(list[0].path).name : `${list.length} files`;
    const title = fresh.length === list.length ? `Delete untracked ${what}?` : `Discard changes in ${what}?`;
    if (!(await app.confirm(title, fresh.length && modified.length ? `${fresh.length} untracked file(s) will be deleted.` : "This cannot be undone.", { ok: fresh.length === list.length ? "Delete" : "Discard", danger: true }))) return;
    if (modified.length) await op("Discarding", cmd.discard(paths(modified)));
    if (fresh.length) await op("Deleting", cmd.clean(paths(fresh)));
  }
  function stageAll() {
    return op("Staging", untracked ? cmd.stageAll() : ["add", "-u"]);
  }

  async function commit() {
    if (!status) return;
    const msg = message.trim();
    if (!msg && !amend) {
      app.toast("Enter a commit message.", "warn");
      textarea?.focus();
      return;
    }
    if (!amend && !status.staged.length) {
      if (!status.changes.length) return app.toast("Nothing to commit.", "info");
      if (!(await app.confirm("No staged changes", "Stage all changes and commit them?", { ok: "Stage all & commit" }))) return;
      if (!(await stageAll())) return;
    }
    const args = amend && !msg ? ["commit", "--amend", "--no-edit"] : cmd.commit({ amend });
    if (await op(amend ? "Amending" : "Committing", args, { stdin: msg ? message : undefined })) {
      message = "";
      amend = false;
    }
  }

  async function toggleAmend() {
    amend = !amend;
    if (amend && !message.trim() && repo) {
      const r = await git(repo, cmd.lastMessage());
      if (r.code === 0 && amend && !message.trim()) message = r.stdout.trimEnd();
    }
  }

  async function undoCommit() {
    if (!(await app.confirm("Undo last commit?", "The commit is removed; its changes stay staged.", { ok: "Undo commit" }))) return;
    const r = repo ? await git(repo, cmd.lastMessage()) : null;
    if (await op("Undoing commit", cmd.undoCommit()) && r?.code === 0 && !message.trim()) message = r.stdout.trimEnd();
  }

  function publish() {
    const b = status?.branch;
    if (!b) return;
    const remote = remotes[0] ?? "origin";
    return op(`Publishing ${b}`, cmd.publish(remote, b), { done: `Published ${b} to ${remote}` });
  }

  async function sync() {
    if (!status) return;
    if (!status.upstream) return publish();
    if (status.behind && !(await op("Pulling", cmd.pull()))) return;
    if (status.ahead || (status.behind === 0 && status.ahead === 0)) await op("Pushing", cmd.push());
  }

  async function forcePush() {
    if (!(await app.confirm("Force push?", "Overwrite the remote branch (only if nobody pushed since the last fetch: --force-with-lease).", { ok: "Force push", danger: true }))) return;
    await op("Pushing", cmd.push(true));
  }

  async function stashPush(withUntracked: boolean) {
    const msg = await app.promptText(withUntracked ? "Stash (including untracked)" : "Stash", "", "Message (optional)");
    if (msg === null) return;
    await op("Stashing", cmd.stashPush(msg.trim(), withUntracked));
  }

  async function stashDrop(s: Stash) {
    if (!(await app.confirm(`Drop ${s.ref}?`, s.message, { ok: "Drop", danger: true }))) return;
    await op("Dropping stash", cmd.stashDrop(s.ref));
  }

  // ---------- branches ----------

  async function createBranch(from?: string) {
    const name = await app.promptText(from ? `New branch from ${from}` : "New branch", "", "Branch name");
    const n = name?.trim().replace(/\s+/g, "-");
    if (n) await op(`Creating ${n}`, cmd.create(n, from));
  }

  function switchTo(b: Branch) {
    if (b.current) return;
    if (!b.remote) return op(`Switching to ${b.name}`, cmd.switch(b.name));
    const short = b.name.slice(b.name.indexOf("/") + 1);
    const local = branches.some((x) => !x.remote && x.name === short);
    return op(`Switching to ${short}`, local ? cmd.switch(short) : cmd.track(b.name));
  }

  function branchItem(b: Branch, run: () => void): PaletteItem {
    return { id: b.ref, label: b.name, icon: b.current ? "check" : b.remote ? "globe" : "git", detail: [b.remote ? "remote" : b.upstream, b.date].filter(Boolean).join(" · "), run };
  }

  function branchPicker() {
    if (!repo) return;
    app.palette = {
      placeholder: "Select a branch to switch to…",
      items: [
        { label: "Create new branch…", icon: "plus", run: () => void createBranch() },
        { label: "Create new branch from…", icon: "plus", children: () => branches.map((b) => branchItem(b, () => void createBranch(b.name))) },
        ...branches.map((b) => branchItem(b, () => void switchTo(b))),
      ],
    };
  }

  function deleteBranchPicker() {
    app.palette = {
      placeholder: "Select a branch to delete…",
      items: branches.filter((b) => !b.remote && !b.current).map((b) => branchItem(b, () => void deleteBranch(b.name))),
    };
  }

  async function deleteBranch(name: string) {
    if (!repo || busy) return;
    const r = await git(repo, cmd.deleteBranch(name));
    if (r.code === 0) return refresh(true);
    if (/not fully merged/.test(r.stderr) && (await app.confirm(`Branch ${name} is not fully merged`, "Delete it anyway?", { ok: "Delete", danger: true }))) {
      await op(`Deleting ${name}`, cmd.deleteBranch(name, true));
    } else if (!/not fully merged/.test(r.stderr)) {
      fail(["branch"], r, false);
    }
  }

  // ---------- opening files and diffs ----------

  function diff(spec: Omit<DiffSpec, "root" | "source">) {
    if (!repo) return;
    app.openDiff({ root: repo.dir, source: repo.paneId, ...spec });
  }

  function openChange(f: FileChange) {
    if (f.kind === "untracked" || f.kind === "conflict") return openFile(f);
    const where = f.kind === "staged" ? "Index" : "Working tree";
    diff({ title: `${splitPath(f.path).name} (${where})`, path: f.path, staged: f.kind === "staged" });
  }

  async function openFile(f: FileChange) {
    const s = repo ? sessions.get(repo.paneId) : undefined;
    if (!s || !repo) return;
    try {
      await s.openFile({ path: joinRepo(repo.dir, f.path) });
    } catch (e) {
      app.toast(e instanceof Error ? e.message : String(e), "error");
    }
  }

  const copy = (text: string) => writeText(text).then(() => app.toast("Copied to clipboard", "info"), () => {});

  // ---------- menus ----------

  function showMenu(e: MouseEvent, groups: MenuItem[][]) {
    e.preventDefault();
    e.stopPropagation();
    app.menu = { x: e.clientX, y: e.clientY, groups: groups.filter((g) => g.length) };
  }

  function mainMenu(e: MouseEvent) {
    const s = status;
    const hasUp = !!s?.upstream;
    showMenu(e, [
      [
        { label: "Fetch", icon: "refresh", run: () => void op("Fetching", cmd.fetch()) },
        { label: "Pull", icon: "down", disabled: !hasUp, run: () => void op("Pulling", cmd.pull()) },
        { label: "Pull (rebase)", icon: "down", disabled: !hasUp, run: () => void op("Pulling", cmd.pull(true)) },
        { label: "Push", icon: "up", disabled: !hasUp, run: () => void op("Pushing", cmd.push()) },
        { label: "Force push…", icon: "up", disabled: !hasUp, run: () => void forcePush() },
        { label: "Publish branch", icon: "globe", disabled: hasUp || !s?.branch, run: () => void publish() },
      ],
      [
        { label: "Commit", icon: "check", run: () => void commit() },
        { label: "Amend last commit", checked: amend, disabled: !s?.oid, run: () => void toggleAmend() },
        { label: "Undo last commit", icon: "undo", disabled: !s?.oid, run: () => void undoCommit() },
      ],
      [
        { label: "Stage all changes", icon: "plus", disabled: !s?.changes.length, run: () => void stageAll() },
        { label: "Unstage all changes", disabled: !s?.staged.length, run: () => void op("Unstaging", cmd.unstageAll()) },
        { label: "Discard all changes…", icon: "trash", disabled: !s?.changes.length, run: () => void discard(s?.changes ?? []) },
      ],
      [
        { label: "Stash…", icon: "bookmark", run: () => void stashPush(false) },
        { label: "Stash (include untracked)…", icon: "bookmark", run: () => void stashPush(true) },
        { label: "Pop latest stash", disabled: !stashes.length, run: () => void op("Popping stash", cmd.stashPop(stashes[0].ref)) },
      ],
      [
        { label: "Switch branch…", icon: "git", run: branchPicker },
        { label: "Create branch…", icon: "plus", run: () => void createBranch() },
        { label: "Delete branch…", icon: "trash", disabled: !branches.some((b) => !b.remote && !b.current), run: deleteBranchPicker },
      ],
      [
        { label: "Pin to this terminal", icon: "pin", checked: !!pinned, run: togglePin },
        { label: "Refresh", icon: "refresh", run: () => void refresh(true) },
      ],
    ]);
  }

  function fileMenu(e: MouseEvent, f: FileChange) {
    const items: MenuItem[][] = [
      [
        { label: "Open changes", disabled: f.kind === "untracked" || f.kind === "conflict", run: () => openChange(f) },
        { label: "Open file", icon: "file", disabled: f.code === "D", run: () => void openFile(f) },
      ],
      f.kind === "staged"
        ? [{ label: "Unstage", run: () => void unstage([f]) }]
        : [
            { label: f.kind === "conflict" ? "Mark resolved (stage)" : "Stage", icon: "plus", run: () => void stage([f]) },
            ...(f.kind === "conflict" ? [] : [{ label: f.kind === "untracked" ? "Delete file…" : "Discard changes…", icon: "trash", run: () => void discard([f]) }]),
          ],
      [
        { label: "Copy path", icon: "copy", run: () => void copy(repo ? joinRepo(repo.dir, f.path) : f.path) },
        { label: "Copy relative path", icon: "copy", run: () => void copy(f.path) },
      ],
    ];
    showMenu(e, items);
  }

  function commitMenu(e: MouseEvent, c: Commit) {
    showMenu(e, [
      [{ label: "Open changes", run: () => diff({ title: `${c.short} ${c.subject}`, commit: c.sha }) }],
      [
        { label: "Copy commit id", icon: "copy", run: () => void copy(c.sha) },
        { label: "Copy message", icon: "copy", run: () => void copy(c.subject) },
      ],
      [
        { label: "Create branch from commit…", icon: "plus", run: () => void createBranch(c.sha) },
        { label: "Switch to commit (detached)", run: () => void op(`Switching to ${c.short}`, cmd.detach(c.sha)) },
        { label: "Revert commit", icon: "undo", run: () => void op(`Reverting ${c.short}`, cmd.revert(c.sha)) },
      ],
    ]);
  }

  function togglePin() {
    pinned = pinned ? null : (tracked ?? null);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      e.stopPropagation();
      void commit();
    }
  }

  const trackedTitle = $derived(tracked ? app.paneTitle(tracked) : "");
  const counts = $derived((status?.staged.length ?? 0) + (status?.changes.length ?? 0) + (status?.conflicts.length ?? 0));
  const syncLabel = $derived.by(() => {
    const s = status;
    if (!s?.branch) return "";
    if (!s.upstream) return "Publish branch";
    return s.ahead || s.behind ? `Sync changes ${s.behind}↓ ${s.ahead}↑` : "Sync changes";
  });
</script>

{#snippet section(key: keyof typeof defaults, title: string, count: number, actions?: import("svelte").Snippet)}
  <div class="section-head" role="button" tabindex="0" onclick={() => toggle(key)} onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle(key))}>
    <span class="chev" class:closed={!open[key]}><Icon name="chevron" size={12} /></span>
    <span class="title">{title}</span>
    <span class="acts">{@render actions?.()}</span>
    {#if count}<span class="count">{count}</span>{/if}
  </div>
{/snippet}

{#snippet fileRow(f: FileChange)}
  {@const p = splitPath(f.path)}
  <li
    class="row"
    title={f.orig ? `${f.orig} → ${f.path}` : f.path}
    onclick={() => openChange(f)}
    ondblclick={() => f.code !== "D" && openFile(f)}
    oncontextmenu={(e) => fileMenu(e, f)}
    onkeydown={(e) => e.key === "Enter" && openChange(f)}
    role="option"
    aria-selected="false"
    tabindex="0"
  >
    <span class="name" class:deleted={f.code === "D"}>{p.name}</span>
    <span class="dir">{p.dir}</span>
    <span class="row-acts" role="presentation" onclick={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}>
      {#if f.code !== "D"}
        <button title="Open file" aria-label="Open file" onclick={() => openFile(f)}><Icon name="file" size={13} /></button>
      {/if}
      {#if f.kind === "staged"}
        <button title="Unstage" aria-label="Unstage" onclick={() => unstage([f])}><Icon name="minimize" size={13} /></button>
      {:else}
        {#if f.kind !== "conflict"}
          <button title={f.kind === "untracked" ? "Delete file" : "Discard changes"} aria-label="Discard" onclick={() => discard([f])}><Icon name="undo" size={13} /></button>
        {/if}
        <button title={f.kind === "conflict" ? "Mark resolved (stage)" : "Stage"} aria-label="Stage" onclick={() => stage([f])}><Icon name="plus" size={13} /></button>
      {/if}
    </span>
    <span class="code code-{f.code === '!' ? 'X' : f.code}">{f.code}</span>
  </li>
{/snippet}

<div class="git">
  <header>
    <Icon name="git" size={13} />
    <span class="head-title" title={repo ? `${repo.dir}\nTerminal: ${trackedTitle}` : trackedTitle}>
      {repo ? repoName(repo.dir) : "Source control"}
    </span>
    {#if pinned}<span class="pinned" title="Pinned to {trackedTitle}"><Icon name="pin" size={11} /></span>{/if}
    <span class="spacer"></span>
    {#if busy}<span class="busy" title={busy}></span>{/if}
    <button title="Refresh" aria-label="Refresh" onclick={() => refresh(true)}><Icon name="refresh" size={13} /></button>
    <button title="More actions…" aria-label="More actions" disabled={phase !== "ready"} onclick={mainMenu}><Icon name="menu" size={13} /></button>
  </header>

  {#if phase === "no-terminal"}
    <p class="empty">No terminal.</p>
  {:else if phase === "not-repo"}
    <div class="empty">
      <p>The terminal's directory is not in a Git repository.</p>
      {#if here}<code>{here.dir}</code>{/if}
      {#if here}
        <button
          class="primary"
          onclick={async () => {
            if (!here) return;
            const r = await git(here, cmd.init());
            if (r.code !== 0) app.toast(`git init: ${errorMessage(r.stderr)}`, "error");
            refresh(true);
          }}>Initialize repository</button
        >
      {/if}
    </div>
  {:else if phase === "error"}
    <div class="empty error">
      <p>{errorText}</p>
      <button onclick={() => refresh(true)}>Retry</button>
    </div>
  {:else if phase === "loading" || !status}
    <p class="empty">Loading…</p>
  {:else}
    <div class="branch-bar">
      <button class="branch" title="Switch branch" onclick={branchPicker}>
        <Icon name="git" size={12} />
        <span>{status.branch ?? `(detached ${status.oid?.slice(0, 7) ?? ""})`}</span>
        <Icon name="chevron" size={10} />
      </button>
      {#if status.branch}
        <button class="sync" title={status.upstream ? `${syncLabel} with ${status.upstream}` : `Publish ${status.branch}`} disabled={!!busy} onclick={sync}>
          {#if status.upstream}
            <Icon name="refresh" size={12} />
            {#if status.behind}<span>{status.behind}↓</span>{/if}
            {#if status.ahead}<span>{status.ahead}↑</span>{/if}
          {:else}
            <Icon name="up" size={12} /> Publish
          {/if}
        </button>
      {/if}
      <button title="Fetch" aria-label="Fetch" disabled={!!busy} onclick={() => op("Fetching", cmd.fetch())}><Icon name="down" size={12} /></button>
    </div>

    <div class="commit">
      <textarea
        bind:this={textarea}
        bind:value={message}
        onkeydown={onKey}
        rows="3"
        spellcheck="false"
        placeholder={`Message (Ctrl+Enter to ${amend ? "amend" : "commit"} on "${status.branch ?? "HEAD"}")`}
      ></textarea>
      <div class="commit-row">
        <button class="primary" disabled={!!busy} onclick={commit}>
          <Icon name="check" size={13} />
          {amend ? "Amend" : status.staged.length || !counts ? "Commit" : "Commit all"}
        </button>
        <label class="amend" title="Amend the last commit">
          <input type="checkbox" checked={amend} disabled={!status.oid} onchange={toggleAmend} /> Amend
        </label>
      </div>
      {#if busy}<div class="busy-text">{busy}…</div>{/if}
    </div>

    <div class="lists">
      {#if status.conflicts.length}
        {#snippet conflictActs()}
          <button title="Stage all (mark resolved)" aria-label="Stage all" onclick={(e) => (e.stopPropagation(), stage(status?.conflicts ?? []))}><Icon name="plus" size={13} /></button>
        {/snippet}
        {@render section("conflicts", "Merge changes", status.conflicts.length, conflictActs)}
        {#if open.conflicts}<ul>{#each status.conflicts as f (f.path)}{@render fileRow(f)}{/each}</ul>{/if}
      {/if}

      {#if status.staged.length}
        {#snippet stagedActs()}
          <button title="Unstage all" aria-label="Unstage all" onclick={(e) => (e.stopPropagation(), op("Unstaging", cmd.unstageAll()))}><Icon name="minimize" size={13} /></button>
        {/snippet}
        {@render section("staged", "Staged changes", status.staged.length, stagedActs)}
        {#if open.staged}<ul>{#each status.staged as f (f.path)}{@render fileRow(f)}{/each}</ul>{/if}
      {/if}

      {#snippet changeActs()}
        {#if status?.changes.length}
          <button title="Discard all changes" aria-label="Discard all" onclick={(e) => (e.stopPropagation(), discard(status?.changes ?? []))}><Icon name="undo" size={13} /></button>
          <button title="Stage all changes" aria-label="Stage all" onclick={(e) => (e.stopPropagation(), stageAll())}><Icon name="plus" size={13} /></button>
        {/if}
      {/snippet}
      {@render section("changes", "Changes", status.changes.length, changeActs)}
      {#if open.changes}
        <ul>
          {#each status.changes as f (f.kind + f.path)}{@render fileRow(f)}{:else}<li class="none">No changes.</li>{/each}
        </ul>
      {/if}

      {#snippet stashActs()}
        <button title="Stash changes…" aria-label="Stash" onclick={(e) => (e.stopPropagation(), stashPush(false))}><Icon name="plus" size={13} /></button>
      {/snippet}
      {@render section("stashes", "Stashes", stashes.length, stashActs)}
      {#if open.stashes}
        <ul>
          {#each stashes as s (s.ref)}
            <li class="row" title="{s.ref}: {s.message}" onclick={() => diff({ title: `${s.ref} ${s.message}`, stash: s.ref })} onkeydown={(e) => e.key === "Enter" && diff({ title: s.ref, stash: s.ref })} role="option" aria-selected="false" tabindex="0">
              <span class="name">{s.message.replace(/^(WIP on|On) [^:]+: /, "")}</span>
              <span class="dir">{s.date}</span>
              <span class="row-acts" role="presentation" onclick={(e) => e.stopPropagation()}>
                <button title="Apply" aria-label="Apply" onclick={() => op("Applying stash", cmd.stashApply(s.ref))}><Icon name="check" size={13} /></button>
                <button title="Pop (apply and drop)" aria-label="Pop" onclick={() => op("Popping stash", cmd.stashPop(s.ref))}><Icon name="output" size={13} /></button>
                <button title="Drop" aria-label="Drop" onclick={() => stashDrop(s)}><Icon name="trash" size={13} /></button>
              </span>
            </li>
          {:else}
            <li class="none">No stashes.</li>
          {/each}
        </ul>
      {/if}

      {@render section("log", "Commits", 0)}
      {#if open.log}
        <ul>
          {#each commits as c (c.sha)}
            <li
              class="row commit-row-item"
              title="{c.short} · {c.author} · {c.date}&#10;{c.subject}"
              onclick={() => diff({ title: `${c.short} ${c.subject}`, commit: c.sha })}
              oncontextmenu={(e) => commitMenu(e, c)}
              onkeydown={(e) => e.key === "Enter" && diff({ title: `${c.short} ${c.subject}`, commit: c.sha })}
              role="option"
              aria-selected="false"
              tabindex="0"
            >
              <span class="name">{c.subject}</span>
              {#each c.refs as r (r)}<span class="ref" class:tag={r.startsWith("tag: ")}>{r.replace(/^tag: /, "")}</span>{/each}
              <span class="dir">{c.date}</span>
            </li>
          {:else}
            <li class="none">No commits yet.</li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .git {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--fg);
    font-size: 12px;
    user-select: none;
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
  button.primary {
    justify-content: center;
    padding: 5px 10px;
    background: var(--accent);
    color: var(--term-bg);
    font-weight: 600;
  }
  button.primary:hover:not(:disabled) {
    background: var(--accent);
    color: var(--term-bg);
    filter: brightness(1.1);
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
  .busy-text {
    color: var(--muted);
    font-size: 11px;
  }
  .branch-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 4px 6px;
  }
  .branch {
    flex: 1;
    min-width: 0;
    justify-content: flex-start;
    color: var(--fg);
  }
  .branch span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .commit {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 4px 8px;
  }
  textarea {
    resize: vertical;
    min-height: 36px;
    padding: 5px 8px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--fg);
    font: inherit;
    outline: none;
    user-select: text;
  }
  textarea:focus {
    border-color: var(--accent);
  }
  .commit-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .commit-row .primary {
    flex: 1;
  }
  .amend {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--muted);
    cursor: pointer;
  }
  .lists {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
  .section-head {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    box-sizing: border-box;
    padding: 0 4px;
    background: var(--chrome);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
  }
  :global(html:not(.focused)) .section-head {
    background: var(--chrome-unfocused);
  }
  .section-head .title {
    flex: 1;
  }
  .chev {
    display: flex;
    transition: transform 0.1s;
  }
  .chev.closed {
    transform: rotate(-90deg);
  }
  /* Section buttons keep their space (no height jump on hover): only their visibility changes. */
  .section-head .acts {
    display: flex;
    visibility: hidden;
  }
  .section-head .acts button {
    padding: 1px 2px;
  }
  .section-head:hover .acts,
  .section-head:focus-within .acts {
    visibility: visible;
  }
  .row-acts {
    display: none;
    gap: 0;
  }
  .row:hover .row-acts,
  .row:focus-within .row-acts {
    display: flex;
  }
  .count {
    min-width: 16px;
    padding: 0 5px;
    border-radius: 8px;
    background: var(--panel);
    color: var(--muted);
    font-size: 10px;
    text-align: center;
  }
  ul {
    list-style: none;
    margin: 0 0 4px;
    padding: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 22px;
    padding: 0 6px 0 22px;
    border-radius: 3px;
    cursor: pointer;
    white-space: nowrap;
    outline: none;
  }
  .row:hover,
  .row:focus {
    background: var(--hover, #ffffff10);
  }
  .row .name {
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
  }
  .row .name.deleted {
    text-decoration: line-through;
  }
  .row .dir {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--muted);
    font-size: 11px;
  }
  .row-acts button {
    padding: 2px;
  }
  .code {
    width: 12px;
    text-align: center;
    font-weight: 700;
    font-size: 11px;
  }
  .code-M,
  .code-T {
    color: #e2c08d;
  }
  .code-A,
  .code-U {
    color: #73c991;
  }
  .code-D {
    color: #f14c4c;
  }
  .code-R,
  .code-C {
    color: #4fc1ff;
  }
  .code-X {
    color: #f14c4c;
  }
  .ref {
    flex-shrink: 0;
    padding: 0 5px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--accent) 25%, transparent);
    font-size: 10px;
  }
  .ref.tag {
    background: color-mix(in srgb, #e2c08d 30%, transparent);
  }
  .commit-row-item .dir {
    flex: 0 0 auto;
    margin-left: auto;
  }
  .none {
    padding: 2px 22px;
    color: var(--muted);
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    margin: 0;
    padding: 8px;
    color: var(--muted);
  }
  .empty p {
    margin: 0;
  }
  .empty code {
    word-break: break-all;
    user-select: text;
  }
  .empty.error p {
    color: var(--danger, #f14c4c);
    user-select: text;
  }
</style>
