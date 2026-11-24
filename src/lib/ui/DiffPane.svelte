<script lang="ts">
  // Diff tab: unified diff of a file (working tree or index), a commit or a stash, opened from the Git sidebar.
  import { app } from "../state.svelte";
  import { fontFamilyOf } from "../config";
  import { sessions } from "../term/session";
  import { cmd, errorMessage, joinRepo, parseDiff, type DiffLine } from "../git";
  import { git, hostOf } from "./git/run";
  import Icon from "./Icon.svelte";

  let { paneId }: { paneId: string } = $props();
  const spec = $derived(app.panes[paneId]?.spec.diff);

  /** Long diffs are cut to keep the DOM light. */
  const MAX_LINES = 20000;

  let lines = $state<DiffLine[]>([]);
  let truncated = $state(false);
  let error = $state("");
  let loading = $state(true);

  /** Terminal providing the host: the one the Git sidebar used, else the last focused one. */
  function source(): string | undefined {
    const s = spec?.source;
    if (s && sessions.has(s)) return s;
    return app.recentTerminal;
  }

  async function load() {
    const d = spec;
    if (!d) return;
    loading = true;
    const src = source();
    const h = src ? await hostOf(src) : null;
    const host = { id: h?.id ?? null, dir: d.root };
    const args = d.commit ? cmd.show(d.commit) : d.stash ? cmd.stashShow(d.stash) : cmd.diff(d.path ?? "", !!d.staged);
    const r = await git(host, args);
    if (d !== spec) return;
    loading = false;
    if (r.code !== 0) {
      error = errorMessage(r.stderr, r.stdout);
      lines = [];
      return;
    }
    error = "";
    const all = parseDiff(r.stdout);
    truncated = all.length > MAX_LINES;
    lines = truncated ? all.slice(0, MAX_LINES) : all;
  }

  $effect(() => {
    void spec;
    load();
  });

  async function stageToggle() {
    const d = spec;
    const src = source();
    const h = src ? await hostOf(src) : null;
    if (!d?.path) return;
    const r = await git({ id: h?.id ?? null, dir: d.root }, d.staged ? cmd.unstage([d.path]) : cmd.stage([d.path]));
    if (r.code !== 0) return app.toast(errorMessage(r.stderr), "error");
    app.commandsDone++;
    app.panes[paneId].spec = { ...app.panes[paneId].spec, diff: { ...d, staged: !d.staged, title: d.title.replace(/\((Index|Working tree)\)$/, d.staged ? "(Working tree)" : "(Index)") } };
  }

  async function openFile() {
    const d = spec;
    const src = source();
    const s = src ? sessions.get(src) : undefined;
    if (!d?.path || !s) return;
    try {
      await s.openFile({ path: joinRepo(d.root, d.path) });
    } catch (e) {
      app.toast(e instanceof Error ? e.message : String(e), "error");
    }
  }

  const fileHeader = (text: string) => (text.startsWith("diff --git ") ? text.replace(/^diff --git a\/(.*) b\/.*$/, "$1") : text);
</script>

<div class="diff">
  <header>
    <Icon name="git" size={13} />
    <span class="title" title={spec?.title}>{spec?.title ?? "Diff"}</span>
    <span class="spacer"></span>
    {#if spec?.path}
      <button title={spec.staged ? "Unstage file" : "Stage file"} onclick={stageToggle}>{spec.staged ? "Unstage" : "Stage"}</button>
      <button title="Open file" aria-label="Open file" onclick={openFile}><Icon name="file" size={13} /></button>
    {/if}
    <button title="Refresh" aria-label="Refresh" onclick={load}><Icon name="refresh" size={13} /></button>
    <button title="Close" aria-label="Close" onclick={() => app.closePane(paneId, { force: true, record: false })}><Icon name="close" size={12} /></button>
  </header>
  <div class="body" style:font-family={fontFamilyOf(app.config)} style:font-size="{app.editorFontSize}px">
    {#if error}
      <p class="msg error">{error}</p>
    {:else if loading && !lines.length}
      <p class="msg">Loading…</p>
    {:else if !lines.length}
      <p class="msg">No differences.</p>
    {:else}
      <table>
        <tbody>
          {#each lines as l, i (i)}
            <tr class={l.kind}>
              {#if l.kind === "file"}
                <td colspan="3" class="file-head">{fileHeader(l.text)}</td>
              {:else}
                <td class="no">{l.old ?? ""}</td>
                <td class="no">{l.new ?? ""}</td>
                <td class="text">{l.text || " "}</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
      {#if truncated}<p class="msg">Diff truncated to {MAX_LINES} lines.</p>{/if}
    {/if}
  </div>
</div>

<style>
  .diff {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--fg);
  }
  header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px 6px 6px;
    font-size: 12px;
    font-weight: 600;
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .spacer {
    flex: 1;
  }
  button {
    display: inline-flex;
    align-items: center;
    padding: 3px 5px;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--muted);
    font: inherit;
    cursor: pointer;
  }
  button:hover {
    background: var(--hover, #ffffff14);
    color: var(--fg);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  table {
    border-collapse: collapse;
    min-width: 100%;
  }
  td {
    padding: 0 6px;
    white-space: pre;
    vertical-align: top;
    line-height: 1.45;
  }
  .no {
    width: 1%;
    color: var(--muted);
    text-align: right;
    user-select: none;
    opacity: 0.7;
  }
  .add {
    background: #2ea04326;
  }
  .add .text {
    color: #7ee787;
  }
  .del {
    background: #f8514926;
  }
  .del .text {
    color: #ffa198;
  }
  .hunk td {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    color: var(--accent);
  }
  .meta .text {
    color: var(--muted);
  }
  .file-head {
    position: sticky;
    left: 0;
    padding: 6px 6px 3px;
    font-weight: 700;
    border-top: 1px solid var(--border);
  }
  .msg {
    padding: 8px;
    margin: 0;
    color: var(--muted);
    font-family: inherit;
  }
  .msg.error {
    color: var(--danger, #f14c4c);
    white-space: pre-wrap;
  }
</style>
