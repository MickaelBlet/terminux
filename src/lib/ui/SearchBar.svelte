<script lang="ts">
  import { onMount } from "svelte";
  import { app, SEARCH_DECORATIONS } from "../state.svelte";
  import { sessions } from "../term/session";
  import Icon from "./Icon.svelte";

  let { paneId }: { paneId: string } = $props();
  let input: HTMLInputElement;
  let results = $state<{ index: number; count: number } | null>(null);
  let invalid = $state(false);
  const s = $derived(sessions.get(paneId));
  const q = app.search;

  onMount(() => {
    input.focus();
    input.select();
    const sub = s?.search.onDidChangeResults((r) => (results = r.resultCount ? { index: r.resultIndex, count: r.resultCount } : { index: -1, count: 0 }));
    if (q.query) run(true);
    return () => {
      sub?.dispose();
      s?.search.clearDecorations();
    };
  });

  function run(backward: boolean, incremental = false) {
    if (!s || !q.query) {
      s?.search.clearDecorations();
      results = null;
      return;
    }
    if (q.regex) {
      try {
        new RegExp(q.query);
        invalid = false;
      } catch {
        invalid = true;
        return;
      }
    } else invalid = false;
    const opts = { regex: q.regex, caseSensitive: q.caseSensitive, wholeWord: q.wholeWord, incremental, decorations: SEARCH_DECORATIONS };
    if (backward) s.search.findPrevious(q.query, opts);
    else s.search.findNext(q.query, opts);
  }
  function toggle(k: "regex" | "caseSensitive" | "wholeWord") {
    q[k] = !q[k];
    run(true);
    input.focus();
  }
  function close() {
    s?.search.clearDecorations();
    app.searchPane = null;
    s?.focus();
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Enter") run(!e.shiftKey);
    else if (e.key === "Escape") close();
    else if (e.altKey && e.key.toLowerCase() === "r") toggle("regex");
    else if (e.altKey && e.key.toLowerCase() === "c") toggle("caseSensitive");
    else if (e.altKey && e.key.toLowerCase() === "w") toggle("wholeWord");
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

<div class="search" onmousedown={(e) => e.stopPropagation()} role="toolbar" tabindex="-1">
  <Icon name="search" size={13} />
  <input bind:this={input} bind:value={q.query} class:invalid oninput={() => run(true, true)} {onkeydown} placeholder="Find" spellcheck="false" />
  <span class="count">{results ? (results.count ? `${results.index + 1}/${results.count}` : "No results") : ""}</span>
  <button class:on={q.caseSensitive} onclick={() => toggle("caseSensitive")} title="Match case (Alt+C)"><Icon name="case" size={13} /></button>
  <button class:on={q.wholeWord} onclick={() => toggle("wholeWord")} title="Whole word (Alt+W)"><Icon name="word" size={13} /></button>
  <button class:on={q.regex} onclick={() => toggle("regex")} title="Regular expression (Alt+R)"><Icon name="regex" size={13} /></button>
  <button onclick={() => run(true)} title="Previous (Enter)"><Icon name="up" size={13} /></button>
  <button onclick={() => run(false)} title="Next (Shift+Enter)"><Icon name="down" size={13} /></button>
  <button onclick={close} title="Close (Esc)"><Icon name="close" size={12} /></button>
</div>

<style>
  .search {
    position: absolute;
    top: 6px;
    right: 18px;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 4px 6px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--muted);
    box-shadow: 0 4px 16px var(--shadow);
  }
  input {
    width: 180px;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg);
    font: inherit;
  }
  input.invalid {
    color: var(--danger);
  }
  .count {
    min-width: 56px;
    font-size: 11px;
    text-align: right;
    padding-right: 4px;
  }
  button {
    display: grid;
    place-items: center;
    padding: 3px;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--muted);
    cursor: pointer;
  }
  button:hover {
    background: var(--hover);
    color: var(--fg);
  }
  button.on {
    color: var(--accent);
    background: var(--hover);
  }
</style>
