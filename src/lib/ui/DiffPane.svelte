<script lang="ts">
  // Diff tab: a file (working tree or index), a commit, a stash or two refs, opened from the Git sidebar.
  // Unified or side-by-side, word / syntax highlighting, hunk and line staging, navigation and search.
  import { tick, untrack } from "svelte";
  import { app } from "../state.svelte";
  import { fontFamilyOf } from "../config";
  import { sessions } from "../term/session";
  import type { DiffSpec } from "../term/appearance";
  import { cmd, errorMessage, joinRepo, parseBranches, parseLog, parseTags, splitPath } from "../git";
  import { buildPatch, diffFlags, diffOptions, filePath, findAll, MAX_CONTEXT, parseDiffFiles, stepTo, type DiffAlgorithm, type DiffMode, type DiffOptions, type DiffWhitespace, type HunkAction, type ParsedDiff, type Span } from "../diff";
  import { git, hostOf } from "./git/run";
  import { highlightFile } from "./diff-highlight";
  import DiffFileView from "./diff/DiffFileView.svelte";
  import Icon from "./Icon.svelte";
  import type { MenuItem, PaletteItem } from "./types";

  let { paneId }: { paneId: string } = $props();
  const spec = $derived(app.panes[paneId]?.spec.diff);
  const opts = $derived(diffOptions(app.config, spec?.options));
  const flags = $derived(diffFlags(opts));
  /** Hunk/line staging needs patches that match the files exactly: off when whitespace is ignored. */
  const exact = $derived(opts.ignoreWhitespace === "none" && !opts.ignoreBlankLines);
  const kind = $derived(spec && !spec.commit && !spec.stash && !spec.base ? (spec.staged ? "index" : "worktree") : null);
  const staging = $derived(exact ? kind : null);

  /** Lines rendered before the remaining files start collapsed. */
  const MAX_LINES = 20000;
  /** Files longer than this start collapsed. */
  const LARGE_FILE = 2000;

  let parsed = $state.raw<ParsedDiff | null>(null);
  let error = $state("");
  let loading = $state(true);
  let collapsed = $state<Record<number, boolean>>({});
  let hl = $state.raw<Record<number, Span[][][]>>({});
  let selection = $state.raw<{ file: number; hunk: number; lines: Set<number>; anchor: number } | null>(null);
  let showFiles = $state(true);
  let root = $state<HTMLDivElement>();
  let body = $state<HTMLDivElement>();
  let gen = 0;
  let lastSource = "";
  /** Files being highlighted. */
  const pending = new Set<object>();

  const files = $derived(parsed?.files ?? []);
  const totals = $derived(files.reduce((t, f) => ({ add: t.add + f.added, del: t.del + f.removed }), { add: 0, del: 0 }));

  /** Terminal providing the host: the one the Git sidebar used, else the last focused one. */
  function source(): string | undefined {
    const s = spec?.source;
    if (s && sessions.has(s)) return s;
    return app.recentTerminal;
  }

  async function host(d: DiffSpec) {
    const src = source();
    const h = src ? await hostOf(src) : null;
    return { id: h?.id ?? null, dir: d.root };
  }

  function argsFor(d: DiffSpec, f: string[]): string[] {
    if (d.base) return cmd.diffRefs(d.base, d.target, d.path, f);
    if (d.commit) return cmd.show(d.commit, f);
    if (d.stash) return cmd.stashShow(d.stash, f);
    return cmd.diff(d.path ?? "", !!d.staged, f);
  }

  const sourceKey = $derived(spec ? JSON.stringify([spec.root, spec.path, spec.staged, spec.commit, spec.stash, spec.base, spec.target]) : "");
  const loadKey = $derived(`${sourceKey}|${flags.join(" ")}|${kind ? app.commandsDone : ""}`);

  async function load() {
    const d = spec;
    if (!d) return;
    const my = ++gen;
    loading = true;
    const r = await git(await host(d), argsFor(d, flags));
    if (my !== gen) return;
    loading = false;
    if (r.code !== 0) {
      error = errorMessage(r.stderr, r.stdout);
      parsed = null;
      return;
    }
    error = "";
    const same = lastSource === sourceKey;
    lastSource = sourceKey;
    const scroll = same ? (body?.scrollTop ?? 0) : 0;
    const p = parseDiffFiles(r.stdout);
    const prev = same ? (parsed?.files.map(filePath) ?? []) : [];
    const next: Record<number, boolean> = {};
    let budget = MAX_LINES;
    p.files.forEach((f, i) => {
      const n = f.hunks.reduce((s, h) => s + h.lines.length, 0);
      const was = prev.indexOf(filePath(f));
      next[i] = was >= 0 ? !!collapsed[was] : n > LARGE_FILE || budget <= 0;
      if (!next[i]) budget -= n;
    });
    parsed = p;
    collapsed = next;
    hl = {};
    selection = null;
    await tick();
    if (body) body.scrollTop = scroll;
    if (search.open) runSearch(false);
  }

  $effect(() => {
    void loadKey;
    untrack(load);
  });

  // Syntax highlighting of the expanded files, in the background.
  $effect(() => {
    if (!opts.syntax || !parsed) return;
    const p = parsed;
    for (const [i, f] of p.files.entries()) {
      if (collapsed[i] || untrack(() => hl[i]) || pending.has(f)) continue;
      pending.add(f);
      void highlightFile(f).then((s) => {
        pending.delete(f);
        if (s && parsed === p) hl = { ...hl, [i]: s };
      });
    }
  });

  // Search highlights follow re-renders.
  $effect(() => {
    void [hl, opts.mode, opts.wordHighlight, opts.syntax, JSON.stringify(collapsed)];
    if (untrack(() => search.open && search.query)) tick().then(() => runSearch(false));
  });

  // ---------- options ----------

  function setSpec(patch: Partial<DiffSpec>) {
    const p = app.panes[paneId];
    if (p?.spec.diff) p.spec = { ...p.spec, diff: { ...p.spec.diff, ...patch } };
  }

  function setOption(o: Partial<DiffOptions>) {
    setSpec({ options: { ...spec?.options, ...o } });
  }

  const radio = <T,>(label: string, value: T, current: T, set: (v: T) => void): MenuItem => ({ label, checked: value === current, run: () => set(value) });
  const toggle = (label: string, key: "renames" | "wordHighlight" | "syntax" | "wrap" | "lineNumbers" | "ignoreBlankLines", hint?: string): MenuItem => ({ label, hint, checked: opts[key], run: () => setOption({ [key]: !opts[key] }) });

  function optionsMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const o = opts;
    const ws = (v: DiffWhitespace) => setOption({ ignoreWhitespace: v });
    const algo = (v: DiffAlgorithm) => setOption({ algorithm: v });
    const ctx = (n: number) => setOption({ context: n, fullFile: false });
    app.menu = {
      x: e.clientX,
      y: e.clientY,
      groups: [
        [radio<DiffMode>("Unified", "unified", o.mode, (v) => setOption({ mode: v })), radio<DiffMode>("Side by side", "split", o.mode, (v) => setOption({ mode: v }))],
        [
          {
            label: "Whitespace",
            children: [
              [radio("Show all changes", "none", o.ignoreWhitespace, ws), radio("Ignore amount changes (-b)", "change", o.ignoreWhitespace, ws), radio("Ignore all whitespace (-w)", "all", o.ignoreWhitespace, ws)],
              [toggle("Ignore blank lines", "ignoreBlankLines")],
            ],
          },
          {
            label: "Context lines",
            children: [[0, 1, 3, 5, 10, 25, 50].map((n) => ({ label: String(n), checked: !o.fullFile && o.context === n, run: () => ctx(n) })), [{ label: "Whole file", checked: o.fullFile, run: () => setOption({ fullFile: !o.fullFile }) }]],
          },
          {
            label: "Algorithm",
            children: [[radio("Default", "default", o.algorithm, algo), radio("Minimal", "minimal", o.algorithm, algo), radio("Patience", "patience", o.algorithm, algo), radio("Histogram", "histogram", o.algorithm, algo)]],
          },
          toggle("Detect renames", "renames"),
        ],
        [toggle("Highlight changed words", "wordHighlight"), toggle("Syntax highlighting", "syntax"), toggle("Wrap lines", "wrap"), toggle("Line numbers", "lineNumbers")],
        [
          { label: "Expand all files", disabled: files.length < 1, run: () => setCollapsed(false) },
          { label: "Collapse all files", disabled: files.length < 1, run: () => setCollapsed(true) },
        ],
        [
          { label: "Compare with…", icon: "swap", run: () => void comparePicker("base") },
          { label: "Reset view options", disabled: !spec?.options || !Object.keys(spec.options).length, run: () => setSpec({ options: undefined }) },
        ],
      ],
    };
  }

  function setCollapsed(v: boolean) {
    collapsed = Object.fromEntries(files.map((_, i) => [i, v]));
  }

  function changeContext(delta: number) {
    if (opts.fullFile) return setOption({ fullFile: false });
    const steps = [0, 1, 3, 5, 10, 25, 50, MAX_CONTEXT];
    const i = steps.findIndex((s) => s >= opts.context);
    const at = i < 0 ? steps.length - 1 : steps[i] === opts.context ? i : delta > 0 ? i - 1 : i;
    const n = steps[Math.max(0, Math.min(steps.length - 1, at + delta))];
    setOption({ context: n });
  }

  // ---------- compare ----------

  const isSha = (r: string) => /^[0-9a-f]{40}$/.test(r);
  const shortRef = (r: string) => (isSha(r) ? r.slice(0, 7) : r.replace(/^([0-9a-f]{40})(?=[~^])/, (m) => m.slice(0, 7)));
  const validRef = (r: string) => !!r && !r.startsWith("-") && !/\s/.test(r);

  function compareTitle(base: string, target: string | undefined, path?: string) {
    return `${shortRef(base)} ↔ ${target ? shortRef(target) : "working tree"}${path ? ` · ${splitPath(path).name}` : ""}`;
  }

  function setCompare(patch: { base?: string; target?: string | null }) {
    const d = spec;
    if (!d) return;
    const origin = d.origin ?? { title: d.title, path: d.path, staged: d.staged, commit: d.commit, stash: d.stash };
    // Entering compare mode: start from the current source.
    const from = d.base ? { base: d.base, target: d.target } : d.commit ? { base: `${d.commit}^`, target: d.commit } : d.stash ? { base: `${d.stash}^`, target: d.stash } : { base: "HEAD", target: undefined };
    const base = patch.base ?? from.base;
    const target = patch.target === null ? undefined : (patch.target ?? from.target);
    setSpec({ origin, base, target, commit: undefined, stash: undefined, staged: undefined, title: compareTitle(base, target, d.path) });
  }

  function swapCompare() {
    const d = spec;
    if (!d?.base || !d.target) return;
    setSpec({ base: d.target, target: d.base, title: compareTitle(d.target, d.base, d.path) });
  }

  function resetCompare() {
    const d = spec;
    if (!d?.origin) return;
    setSpec({ ...d.origin, base: undefined, target: undefined, origin: undefined });
  }

  async function comparePicker(which: "base" | "target") {
    const d = spec;
    if (!d) return;
    const h = await host(d);
    const [b, t, l] = await Promise.all([git(h, cmd.branches()), git(h, cmd.tags()), git(h, cmd.log(50))]);
    const set = (ref: string) => setCompare(which === "base" ? { base: ref } : { target: ref });
    const items: PaletteItem[] = [
      ...(which === "target" ? [{ label: "Working tree", icon: "folder", run: () => setCompare({ target: null }) }] : []),
      {
        label: "Enter a ref…",
        icon: "pencil",
        run: async () => {
          const r = (await app.promptText(which === "base" ? "Compare from" : "Compare to", "", "branch, tag or commit (e.g. v1.2, HEAD~3)"))?.trim();
          if (!r) return;
          if (!validRef(r)) return app.toast(`Invalid ref: ${r}`, "error");
          set(r);
        },
      },
      ...(b.code === 0 ? parseBranches(b.stdout) : []).map((x) => ({ label: x.name, icon: x.current ? "check" : x.remote ? "globe" : "git", detail: x.date, run: () => set(x.name) })),
      ...(t.code === 0 ? parseTags(t.stdout) : []).map((x) => ({ label: x.name, icon: "bookmark", detail: [x.subject, x.date].filter(Boolean).join(" · "), run: () => set(x.name) })),
      ...(l.code === 0 ? parseLog(l.stdout) : []).map((c) => ({ label: c.short, icon: "history", detail: `${c.subject} · ${c.author}, ${c.date}`, run: () => set(c.sha) })),
    ];
    app.palette = { placeholder: which === "base" ? "Compare from (base)…" : "Compare to (target)…", items };
  }

  // ---------- staging ----------

  function select(file: number, hunk: number, line: number, extend: boolean) {
    const s = selection;
    if (!s || s.file !== file || s.hunk !== hunk) {
      selection = { file, hunk, lines: new Set([line]), anchor: line };
      return;
    }
    const lines = new Set(s.lines);
    if (extend) {
      const ls = files[file].hunks[hunk].lines;
      for (let i = Math.min(s.anchor, line); i <= Math.max(s.anchor, line); i++) if (ls[i].kind === "add" || ls[i].kind === "del") lines.add(i);
    } else if (lines.has(line)) lines.delete(line);
    else lines.add(line);
    selection = lines.size ? { ...s, lines, anchor: extend ? s.anchor : line } : null;
  }

  async function hunkAction(fi: number, hi: number, action: HunkAction, selectedOnly: boolean) {
    const d = spec;
    const f = files[fi];
    const h = f?.hunks[hi];
    if (!d || !h) return;
    const sel = selectedOnly && selection?.file === fi && selection.hunk === hi ? selection.lines : undefined;
    const reverse = action !== "stage";
    const patch = buildPatch(f, h, sel, reverse);
    if (!patch) return;
    const what = sel ? `${sel.size} line${sel.size > 1 ? "s" : ""}` : "this hunk";
    if (action === "discard" && !(await app.confirm(`Discard ${what}?`, "This cannot be undone.", { ok: "Discard", danger: true }))) return;
    const r = await git(await host(d), cmd.apply({ cached: action !== "discard", reverse, zeroContext: opts.context === 0 && !opts.fullFile }), patch);
    if (r.code !== 0) return app.toast(errorMessage(r.stderr), "error");
    selection = null;
    app.commandsDone++;
  }

  async function fileAction(fi: number, action: HunkAction) {
    const d = spec;
    const f = files[fi];
    if (!d || !f) return;
    const p = filePath(f);
    if (action === "discard" && !(await app.confirm(`Discard changes in ${splitPath(p).name}?`, "This cannot be undone.", { ok: "Discard", danger: true }))) return;
    const paths = f.status === "renamed" ? [f.oldPath, f.newPath] : [p];
    const r = await git(await host(d), action === "stage" ? cmd.stage(paths) : action === "unstage" ? cmd.unstage(paths) : cmd.discard([p]));
    if (r.code !== 0) return app.toast(errorMessage(r.stderr), "error");
    app.commandsDone++;
    // Single-file diff: follow the file to where its changes went.
    if (d.path === p && action !== "discard") showStaged(action === "stage");
  }

  function showStaged(staged: boolean) {
    const d = spec;
    if (!d) return;
    setSpec({ staged, title: d.title.replace(/\((Index|Working tree)\)$/, staged ? "(Index)" : "(Working tree)") });
  }

  async function openFile(fi: number) {
    const d = spec;
    const src = source();
    const s = src ? sessions.get(src) : undefined;
    const f = files[fi];
    if (!d || !f || !s) return;
    const line = f.hunks.find((h) => h.lines.some((l) => l.kind !== "ctx"))?.lines.find((l) => l.kind === "add" || l.kind === "del")?.new ?? f.hunks[0]?.newStart;
    try {
      await s.openFile({ path: joinRepo(d.root, filePath(f)), line });
    } catch (e) {
      app.toast(e instanceof Error ? e.message : String(e), "error");
    }
  }

  // ---------- navigation ----------

  /** Space taken by the sticky file header when scrolling to a row. */
  const STICKY = 28;

  function positions(sel: string): { els: HTMLElement[]; ys: number[] } {
    if (!body) return { els: [], ys: [] };
    const top = body.getBoundingClientRect().top - body.scrollTop;
    const els = [...body.querySelectorAll<HTMLElement>(sel)];
    return { els, ys: els.map((e) => e.getBoundingClientRect().top - top) };
  }

  function scrollToY(y: number, el?: HTMLElement) {
    if (!body) return;
    body.scrollTop = Math.max(0, y - STICKY - 8);
    if (el) {
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    }
  }

  function stepChange(dir: 1 | -1) {
    const { els, ys } = positions("tr[data-change]");
    const pos = (body?.scrollTop ?? 0) + STICKY + 8;
    const y = stepTo(ys, dir === 1 ? pos + 1 : pos - 1, dir);
    if (y !== undefined) scrollToY(y, els[ys.indexOf(y)]);
  }

  function stepFile(dir: 1 | -1) {
    const { ys } = positions("section[data-file]");
    const pos = body?.scrollTop ?? 0;
    const y = stepTo(ys, dir === 1 ? pos + 1 : pos - 1, dir);
    if (y !== undefined && body) body.scrollTop = y;
  }

  async function gotoFile(i: number) {
    if (collapsed[i]) collapsed = { ...collapsed, [i]: false };
    await tick();
    const el = body?.querySelector<HTMLElement>(`section[data-file="${i}"]`);
    if (el && body) body.scrollTop = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
  }

  // ---------- search ----------

  const search = $state({ open: false, query: "", caseSensitive: false, count: 0, current: 0 });
  let ranges: Range[] = [];
  let input = $state<HTMLInputElement>();
  const HL = typeof CSS !== "undefined" && "highlights" in CSS ? (CSS as unknown as { highlights: Map<string, unknown> }).highlights : null;
  const Highlight_ = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;

  $effect(() => {
    const open = app.searchPane === paneId;
    untrack(() => {
      search.open = open;
      if (open) tick().then(() => input?.select());
      else {
        clearHighlights();
        if (app.activePane === paneId) root?.focus({ preventScroll: true });
      }
    });
  });

  function clearHighlights() {
    HL?.delete("diff-search");
    HL?.delete("diff-search-current");
    ranges = [];
    search.count = 0;
  }

  /** DOM ranges of the matches in the rendered text cells. */
  function runSearch(jump = true) {
    clearHighlights();
    if (!body || !search.query) return;
    for (const cell of body.querySelectorAll<HTMLElement>("td.text")) {
      const text = cell.textContent ?? "";
      const found = findAll(text, search.query, search.caseSensitive);
      if (!found.length) continue;
      const nodes: { node: Text; start: number }[] = [];
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      let off = 0;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        nodes.push({ node: n as Text, start: off });
        off += (n as Text).length;
      }
      const at = (pos: number): [Text, number] => {
        let k = nodes.length - 1;
        while (k > 0 && nodes[k].start > pos) k--;
        return [nodes[k].node, pos - nodes[k].start];
      };
      for (const m of found) {
        const r = document.createRange();
        r.setStart(...at(m.from));
        const [en, eo] = at(m.to);
        // An end on a node boundary belongs to the previous node.
        if (eo === 0 && m.to > m.from) {
          const k = nodes.findIndex((x) => x.node === en);
          if (k > 0) r.setEnd(nodes[k - 1].node, nodes[k - 1].node.length);
          else r.setEnd(en, eo);
        } else r.setEnd(en, eo);
        ranges.push(r);
      }
    }
    search.count = ranges.length;
    if (HL && Highlight_) HL.set("diff-search", new Highlight_(...ranges));
    if (!ranges.length) return;
    if (jump) {
      // First match below the current scroll position.
      const top = (body.getBoundingClientRect().top ?? 0) + STICKY;
      const k = ranges.findIndex((r) => r.getBoundingClientRect().top >= top);
      gotoMatch(k < 0 ? 0 : k);
    } else gotoMatch(Math.min(search.current, ranges.length - 1), false);
  }

  function gotoMatch(i: number, scroll = true) {
    if (!ranges.length) return;
    search.current = (i + ranges.length) % ranges.length;
    const r = ranges[search.current];
    if (HL && Highlight_) HL.set("diff-search-current", new Highlight_(r));
    if (!scroll || !body) return;
    const rect = r.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    if (rect.top < b.top + STICKY || rect.bottom > b.bottom) body.scrollTop += rect.top - b.top - b.height / 3;
    const el = r.startContainer.parentElement?.closest("td");
    if (el && (rect.left < b.left || rect.right > b.right)) el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function closeSearch() {
    if (app.searchPane === paneId) app.toggleSearch();
  }

  function searchKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === "F3") {
      e.preventDefault();
      gotoMatch(search.current + (e.shiftKey ? -1 : 1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
    }
    e.stopPropagation();
  }

  // ---------- keys / focus ----------

  $effect(() => {
    if (app.activePane === paneId) untrack(() => !search.open && root?.focus({ preventScroll: true }));
  });

  function onKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const plain = !e.ctrlKey && !e.altKey && !e.metaKey;
    let done = true;
    if (e.key === "F7" && !e.ctrlKey && !e.altKey) stepChange(e.shiftKey ? -1 : 1);
    else if (plain && e.key === "n") stepChange(1);
    else if (plain && (e.key === "p" || e.key === "N")) stepChange(-1);
    else if (plain && e.key === "]") stepFile(1);
    else if (plain && e.key === "[") stepFile(-1);
    else if (plain && e.key === "u") setOption({ mode: opts.mode === "split" ? "unified" : "split" });
    else if (plain && e.key === "w") setOption({ wrap: !opts.wrap });
    else if (plain && e.key === "+") changeContext(1);
    else if (plain && e.key === "-") changeContext(-1);
    else if (plain && e.key === "r") void load();
    else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "f") {
      if (app.searchPane !== paneId) app.toggleSearch();
      else input?.select();
    } else if (plain && e.key === "/") {
      if (app.searchPane !== paneId) app.toggleSearch();
    } else if (e.key === "Escape" && selection) selection = null;
    else if (e.key === "Escape" && search.open) closeSearch();
    else done = false;
    if (done) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  const fileHint = $derived(files.length > 1 ? `${files.length} files · ` : "");
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="diff" bind:this={root} tabindex="-1" role="region" aria-label="Diff" onkeydown={onKey}>
  <header>
    <Icon name="git" size={13} />
    <span class="title" title={spec?.title}>{spec?.title ?? "Diff"}</span>
    {#if parsed && files.length}
      <span class="sum">{fileHint}<span class="plus">+{totals.add}</span> <span class="minus">−{totals.del}</span></span>
    {/if}
    <span class="spacer"></span>
    {#if spec?.base}
      <span class="compare">
        <button class="ref" title="Change base" onclick={() => comparePicker("base")}>{shortRef(spec.base)}</button>
        <button title="Swap sides" aria-label="Swap sides" disabled={!spec.target} onclick={swapCompare}><Icon name="swap" size={12} /></button>
        <button class="ref" title="Change target" onclick={() => comparePicker("target")}>{spec.target ? shortRef(spec.target) : "working tree"}</button>
        {#if spec.origin}<button title="Back to the original changes" aria-label="Reset compare" onclick={resetCompare}><Icon name="undo" size={12} /></button>{/if}
      </span>
    {/if}
    {#if kind && spec?.path}
      <span class="seg" role="group" aria-label="Changes">
        <button class:on={!spec.staged} title="Working tree changes (unstaged)" onclick={() => showStaged(false)}>Working tree</button>
        <button class:on={spec.staged} title="Index changes (staged)" onclick={() => showStaged(true)}>Index</button>
      </span>
    {/if}
    <span class="seg" role="group" aria-label="Layout">
      <button class:on={opts.mode === "unified"} title="Unified (u)" onclick={() => setOption({ mode: "unified" })}>Unified</button>
      <button class:on={opts.mode === "split"} title="Side by side (u)" onclick={() => setOption({ mode: "split" })}>Split</button>
    </span>
    <span class="ctx" title="Context lines (- / +)">
      <button aria-label="Less context" onclick={() => changeContext(-1)}><Icon name="minimize" size={11} /></button>
      <span class="n">{opts.fullFile ? "all" : opts.context}</span>
      <button aria-label="More context" onclick={() => changeContext(1)}><Icon name="plus" size={11} /></button>
    </span>
    <button class:on={opts.ignoreWhitespace !== "none"} title={opts.ignoreWhitespace === "none" ? "Ignore whitespace" : "Show whitespace changes"} onclick={() => setOption({ ignoreWhitespace: opts.ignoreWhitespace === "none" ? "all" : "none" })}>␣</button>
    <button title="Previous change (p, Shift+F7)" aria-label="Previous change" onclick={() => stepChange(-1)}><Icon name="up" size={13} /></button>
    <button title="Next change (n, F7)" aria-label="Next change" onclick={() => stepChange(1)}><Icon name="down" size={13} /></button>
    {#if files.length > 1}
      <button class:on={showFiles} title="File list" aria-label="File list" onclick={() => (showFiles = !showFiles)}><Icon name="sidebar" size={13} /></button>
    {/if}
    <button class:on={search.open} title="Find (Ctrl+F)" aria-label="Find" onclick={() => app.toggleSearch()}><Icon name="search" size={13} /></button>
    <button title="View options" aria-label="View options" onclick={optionsMenu}><Icon name="sliders" size={13} /></button>
    <button title="Refresh (r)" aria-label="Refresh" onclick={load}><Icon name="refresh" size={13} /></button>
    <button title="Close" aria-label="Close" onclick={() => app.closePane(paneId, { force: true, record: false })}><Icon name="close" size={12} /></button>
  </header>
  {#if search.open}
    <div class="search">
      <Icon name="search" size={12} />
      <input bind:this={input} bind:value={search.query} placeholder="Find in diff" spellcheck="false" oninput={() => runSearch()} onkeydown={searchKey} />
      <button class:on={search.caseSensitive} title="Match case" aria-label="Match case" onclick={() => ((search.caseSensitive = !search.caseSensitive), runSearch())}><Icon name="case" size={13} /></button>
      <span class="count">{search.query ? (search.count ? `${search.current + 1}/${search.count}` : "No results") : ""}</span>
      <button title="Previous match (Shift+Enter)" aria-label="Previous match" disabled={!search.count} onclick={() => gotoMatch(search.current - 1)}><Icon name="up" size={13} /></button>
      <button title="Next match (Enter)" aria-label="Next match" disabled={!search.count} onclick={() => gotoMatch(search.current + 1)}><Icon name="down" size={13} /></button>
      <button title="Close (Escape)" aria-label="Close search" onclick={closeSearch}><Icon name="close" size={12} /></button>
    </div>
  {/if}
  {#if kind && !exact}
    <p class="banner">Hunk and line staging is off while whitespace changes are ignored.</p>
  {/if}
  <div class="main">
    {#if showFiles && files.length > 1}
      <aside class="files">
        {#each files as f, i (i)}
          <button class="frow" title={filePath(f)} onclick={() => gotoFile(i)}>
            <span class="fname">{splitPath(filePath(f)).name}</span>
            <span class="fdir">{splitPath(filePath(f)).dir}</span>
            <span class="fcount"><span class="plus">+{f.added}</span> <span class="minus">−{f.removed}</span></span>
          </button>
        {/each}
      </aside>
    {/if}
    <div class="body" bind:this={body} style:font-family={fontFamilyOf(app.config)} style:font-size="{app.editorFontSize}px">
      {#if error}
        <p class="msg error">{error}</p>
      {:else if loading && !parsed}
        <p class="msg">Loading…</p>
      {:else if parsed}
        {#if parsed.preamble.some((l) => l.trim())}
          <pre class="preamble">{parsed.preamble.join("\n").trimEnd()}</pre>
        {/if}
        {#if !files.length}
          <p class="msg">No differences{opts.ignoreWhitespace !== "none" || opts.ignoreBlankLines ? " (whitespace ignored)" : ""}.</p>
        {/if}
        {#each files as f, i (i)}
          <DiffFileView
            file={f}
            index={i}
            {opts}
            spans={opts.syntax ? hl[i] : undefined}
            collapsed={!!collapsed[i]}
            {staging}
            selection={selection?.file === i ? selection : null}
            onToggle={() => (collapsed = { ...collapsed, [i]: !collapsed[i] })}
            onSelect={(h, l, ext) => select(i, h, l, ext)}
            onAction={(h, a, s) => hunkAction(i, h, a, s)}
            onFileAction={(a) => fileAction(i, a)}
            onOpen={kind || spec?.base ? () => openFile(i) : null}
          />
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .diff {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--fg);
    outline: none;
  }
  header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 4px 6px 6px;
    font-size: 12px;
    font-weight: 600;
    min-width: 0;
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 40px;
  }
  .sum {
    font-weight: 400;
    color: var(--muted);
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
  button {
    display: inline-flex;
    align-items: center;
    padding: 3px 5px;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--muted);
    font: inherit;
    font-weight: 400;
    cursor: pointer;
    white-space: nowrap;
  }
  button:hover:not(:disabled) {
    background: var(--hover, #ffffff14);
    color: var(--fg);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  button.on {
    color: var(--accent);
  }
  .seg,
  .compare,
  .ctx {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 1px;
  }
  .seg button {
    padding: 1px 6px;
  }
  .seg button.on {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--fg);
  }
  .ctx button {
    padding: 2px 3px;
  }
  .ctx .n {
    min-width: 2.2em;
    text-align: center;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .compare .ref {
    max-width: 14em;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--fg);
  }
  .search {
    display: flex;
    align-items: center;
    gap: 4px;
    margin: 0 6px 6px;
    padding: 2px 4px 2px 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--panel);
    color: var(--muted);
    font-size: 12px;
  }
  .search input {
    flex: 1;
    min-width: 60px;
    background: none;
    border: none;
    outline: none;
    color: var(--fg);
    font: inherit;
  }
  .count {
    min-width: 5em;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .banner {
    margin: 0 6px 6px;
    padding: 3px 8px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--warning, #e5c07b) 15%, transparent);
    color: var(--fg);
    font-size: 12px;
  }
  .main {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .files {
    width: 200px;
    flex: none;
    overflow: auto;
    border-right: 1px solid var(--border);
    font-size: 12px;
    padding: 2px 0;
  }
  .frow {
    display: flex;
    width: 100%;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 0;
    text-align: left;
    color: var(--fg);
  }
  .fname {
    white-space: nowrap;
  }
  .fdir {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--muted);
    direction: rtl;
  }
  .fcount {
    white-space: nowrap;
    font-size: 11px;
  }
  .body {
    flex: 1;
    min-width: 0;
    overflow: auto;
  }
  .preamble {
    margin: 0;
    padding: 6px 8px 8px;
    font: inherit;
    color: var(--muted);
    white-space: pre-wrap;
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
  .body :global(tr.flash td) {
    animation: diff-flash 0.7s ease-out;
  }
  @keyframes diff-flash {
    from {
      box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--accent) 30%, transparent);
    }
  }
  :global(::highlight(diff-search)) {
    background-color: #e5c07b55;
  }
  :global(::highlight(diff-search-current)) {
    background-color: #f0c674;
    color: #000;
  }
</style>
