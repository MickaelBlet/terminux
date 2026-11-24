<script lang="ts">
  // One file of the diff tab: header, then hunks in unified or side-by-side layout,
  // with word / syntax highlighting and hunk / line staging buttons.
  import { fileLabel, pairLines, segments, splitRows, wordDiff, type DiffFile, type DiffLine, type DiffOptions, type HunkAction, type Range, type Span } from "../../diff";
  import Icon from "../Icon.svelte";

  let {
    file,
    index,
    opts,
    spans,
    collapsed,
    staging,
    selection,
    onToggle,
    onSelect,
    onAction,
    onFileAction,
    onOpen,
  }: {
    file: DiffFile;
    index: number;
    opts: DiffOptions;
    /** Syntax spans per hunk, per line. */
    spans?: Span[][][];
    collapsed: boolean;
    /** What the hunk buttons do: working tree changes (stage, discard), index changes (unstage), or none. */
    staging: "worktree" | "index" | null;
    /** Selected lines of one hunk of this file. */
    selection: { hunk: number; lines: Set<number> } | null;
    onToggle: () => void;
    onSelect: (hunk: number, line: number, extend: boolean) => void;
    onAction: (hunk: number, action: HunkAction, selectedOnly: boolean) => void;
    onFileAction: (action: HunkAction) => void;
    onOpen: (() => void) | null;
  } = $props();

  /** Word-level changed ranges per hunk, per line. */
  const words = $derived.by(() => {
    if (!opts.wordHighlight) return [];
    return file.hunks.map((h) => {
      const m = new Map<number, Range[]>();
      for (const [i, j] of pairLines(h)) {
        if (h.lines[i].kind !== "del") continue;
        const w = wordDiff(h.lines[i].text, h.lines[j].text);
        if (w) {
          m.set(i, w.a);
          m.set(j, w.b);
        }
      }
      return m;
    });
  });

  const rows = $derived(opts.mode === "split" ? file.hunks.map(splitRows) : []);

  const statusLetter = $derived({ modified: "M", added: "A", deleted: "D", renamed: "R", copied: "C" }[file.status]);
  const selectable = (l: DiffLine | undefined) => !!staging && (l?.kind === "add" || l?.kind === "del");
  const isChange = (l: DiffLine | undefined) => l?.kind === "add" || l?.kind === "del";
  const isSel = (h: number, i: number | undefined) => i !== undefined && selection?.hunk === h && selection.lines.has(i);
  const selCount = (h: number) => (selection?.hunk === h ? selection.lines.size : 0);

  function pick(e: MouseEvent, h: number, i: number | undefined, l: DiffLine | undefined) {
    if (i === undefined || !selectable(l)) return;
    e.preventDefault();
    onSelect(h, i, e.shiftKey);
  }
</script>

{#snippet text(l: DiffLine, h: number, i: number)}
  {#if l.kind === "nonl"}<span class="nonl">⏎ {l.text}</span>{:else}{#each segments(l.text, spans?.[h]?.[i], words[h]?.get(i)) as s, k (k)}<span class={s.cls} class:wd={s.changed}>{s.text}</span>{:else}{" "}{/each}{#if !l.text}{" "}{/if}{/if}
{/snippet}

<section class="file" data-file={index}>
  <div class="file-head" role="button" tabindex="-1" onclick={onToggle} onkeydown={(e) => e.key === "Enter" && onToggle()}>
    <span class="chev" class:open={!collapsed}><Icon name="chevron" size={11} /></span>
    <span class="status s-{file.status}" title={file.status}>{statusLetter}</span>
    <span class="path" title={fileLabel(file)}>{fileLabel(file)}</span>
    <span class="counts"><span class="plus">+{file.added}</span> <span class="minus">−{file.removed}</span></span>
    <span class="spacer"></span>
    <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
    <span class="actions" onclick={(e) => e.stopPropagation()}>
      {#if staging === "worktree"}
        <button title="Stage file" onclick={() => onFileAction("stage")}><Icon name="plus" size={12} /></button>
        <button title="Discard file changes" onclick={() => onFileAction("discard")}><Icon name="undo" size={12} /></button>
      {:else if staging === "index"}
        <button title="Unstage file" onclick={() => onFileAction("unstage")}><Icon name="minimize" size={12} /></button>
      {/if}
      {#if onOpen}<button title="Open file" onclick={onOpen}><Icon name="file" size={12} /></button>{/if}
    </span>
  </div>
  {#if !collapsed}
    {#if file.binary}
      <p class="note">Binary file.</p>
    {:else if !file.hunks.length}
      <p class="note">{file.status === "renamed" ? "Renamed without changes." : file.status === "added" || file.status === "deleted" ? "Empty file." : "No content changes (mode or whitespace only)."}</p>
    {:else}
      <table class:wrap={opts.wrap} class:split={opts.mode === "split"} class:nonum={!opts.lineNumbers}>
        {#if opts.mode === "split"}
          <colgroup><col class="c-no" /><col class="c-text" /><col class="c-no" /><col class="c-text" /></colgroup>
        {/if}
        <tbody>
          {#each file.hunks as hunk, h (h)}
            <tr class="hunk">
              <td colspan="4">
                <div class="hunk-bar">
                  <span class="hunk-text">{hunk.header}</span>
                  {#if staging}
                    {@const n = selCount(h)}
                    <span class="hunk-actions">
                      {#if staging === "worktree"}
                        <button onclick={() => onAction(h, "stage", n > 0)}>{n ? `Stage ${n} line${n > 1 ? "s" : ""}` : "Stage hunk"}</button>
                        <button class="danger" onclick={() => onAction(h, "discard", n > 0)}>{n ? `Discard ${n} line${n > 1 ? "s" : ""}` : "Discard hunk"}</button>
                      {:else}
                        <button onclick={() => onAction(h, "unstage", n > 0)}>{n ? `Unstage ${n} line${n > 1 ? "s" : ""}` : "Unstage hunk"}</button>
                      {/if}
                    </span>
                  {/if}
                </div>
              </td>
            </tr>
            {#if opts.mode === "split"}
              {#each rows[h] ?? [] as r, k (k)}
                {@const first = (isChange(r.left) || isChange(r.right)) && !(k > 0 && (isChange(rows[h][k - 1].left) || isChange(rows[h][k - 1].right)))}
                <tr data-change={first ? "" : undefined}>
                  <td class="no {r.left?.kind ?? 'empty'}" class:sel={isSel(h, r.li)} class:pick={selectable(r.left)} onmousedown={(e) => pick(e, h, r.li, r.left)}>{r.left?.old ?? ""}</td>
                  <td class="text {r.left?.kind === 'ctx' ? 'ctx' : (r.left?.kind ?? 'empty')}" class:sel={isSel(h, r.li)}>{#if r.left}{@render text(r.left, h, r.li!)}{/if}</td>
                  <td class="no {r.right?.kind ?? 'empty'}" class:sel={isSel(h, r.ri)} class:pick={selectable(r.right)} onmousedown={(e) => pick(e, h, r.ri, r.right)}>{r.right?.new ?? ""}</td>
                  <td class="text {r.right?.kind === 'ctx' ? 'ctx' : (r.right?.kind ?? 'empty')}" class:sel={isSel(h, r.ri)}>{#if r.right}{@render text(r.right, h, r.ri!)}{/if}</td>
                </tr>
              {/each}
            {:else}
              {#each hunk.lines as l, i (i)}
                <tr class={l.kind} class:sel={isSel(h, i)} data-change={isChange(l) && !isChange(hunk.lines[i - 1]) ? "" : undefined}>
                  <td class="no" class:pick={selectable(l)} onmousedown={(e) => pick(e, h, i, l)}>{l.old ?? ""}</td>
                  <td class="no" class:pick={selectable(l)} onmousedown={(e) => pick(e, h, i, l)}>{l.new ?? ""}</td>
                  <td class="sign">{l.kind === "add" ? "+" : l.kind === "del" ? "−" : ""}</td>
                  <td class="text">{@render text(l, h, i)}</td>
                </tr>
              {/each}
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}
  {/if}
</section>

<style>
  .file {
    border-top: 1px solid var(--border);
  }
  .file-head {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    background: var(--chrome, var(--term-bg));
    font-family: var(--ui-font, inherit);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    user-select: none;
  }
  .chev {
    display: inline-flex;
    transform: rotate(-90deg);
    transition: transform 0.1s;
    color: var(--muted);
  }
  .chev.open {
    transform: none;
  }
  .status {
    font-size: 10px;
    width: 14px;
    text-align: center;
    border-radius: 3px;
    color: var(--muted);
  }
  .s-added {
    color: #7ee787;
  }
  .s-deleted {
    color: #ffa198;
  }
  .s-renamed,
  .s-copied {
    color: var(--accent);
  }
  .path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
  }
  .counts {
    font-weight: 400;
    white-space: nowrap;
  }
  .plus {
    color: #7ee787;
  }
  .minus {
    color: #ffa198;
  }
  .spacer {
    flex: 1;
  }
  .actions {
    display: inline-flex;
    gap: 2px;
  }
  button {
    display: inline-flex;
    align-items: center;
    padding: 2px 5px;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--muted);
    font: inherit;
    font-weight: 400;
    cursor: pointer;
  }
  button:hover {
    background: var(--hover, #ffffff14);
    color: var(--fg);
  }
  button.danger:hover {
    color: var(--danger, #f14c4c);
  }
  .note {
    margin: 0;
    padding: 6px 12px;
    color: var(--muted);
    font-family: var(--ui-font, inherit);
    font-size: 12px;
  }
  table {
    border-collapse: collapse;
    min-width: 100%;
  }
  table.split {
    table-layout: fixed;
    width: 100%;
  }
  .c-no {
    width: 4.5em;
  }
  table.split.nonum .c-no {
    width: 0;
  }
  td {
    padding: 0 6px;
    white-space: pre;
    vertical-align: top;
    line-height: 1.45;
  }
  table.split td.text {
    overflow: hidden;
    text-overflow: clip;
  }
  table.wrap td.text {
    white-space: pre-wrap;
    word-break: break-all;
  }
  .no {
    width: 1%;
    color: var(--muted);
    text-align: right;
    user-select: none;
    opacity: 0.7;
  }
  .nonum .no {
    display: none;
  }
  table.split.nonum .no {
    display: table-cell;
    padding: 0;
    font-size: 0;
  }
  .no.pick {
    cursor: pointer;
  }
  .no.pick:hover {
    opacity: 1;
    color: var(--fg);
  }
  .sign {
    width: 1%;
    padding: 0 2px;
    color: var(--muted);
    user-select: none;
  }
  tr.add,
  td.add {
    background: #2ea04326;
  }
  tr.del,
  td.del {
    background: #f8514926;
  }
  td.empty {
    background: repeating-linear-gradient(-45deg, transparent 0 4px, #ffffff08 4px 8px);
  }
  tr.add .sign {
    color: #7ee787;
  }
  tr.del .sign {
    color: #ffa198;
  }
  .wd {
    border-radius: 2px;
  }
  tr.add .wd,
  td.add .wd {
    background: #2ea04366;
  }
  tr.del .wd,
  td.del .wd {
    background: #f8514966;
  }
  tr.sel td,
  td.sel {
    box-shadow: inset 3px 0 0 var(--accent);
  }
  tr.sel td.text,
  td.text.sel {
    background-image: linear-gradient(color-mix(in srgb, var(--accent) 18%, transparent), color-mix(in srgb, var(--accent) 18%, transparent));
  }
  .hunk td {
    padding: 0;
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--accent);
  }
  .hunk-bar {
    position: sticky;
    left: 0;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 1px 6px;
  }
  .hunk-actions {
    display: inline-flex;
    gap: 2px;
    font-family: var(--ui-font, inherit);
    font-size: 11px;
  }
  .nonl {
    color: var(--muted);
    font-style: italic;
  }
</style>
