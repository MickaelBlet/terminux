<script lang="ts">
  import { onMount } from "svelte";
  import { app } from "../state.svelte";
  import ProfileIcon from "./ProfileIcon.svelte";
  import Icon from "./Icon.svelte";
  import type { PaletteItem, PaletteView } from "./types";

  const root: PaletteView = app.palette!;
  // Nested lists (sub-commands); the last one is shown.
  let stack = $state<{ title: string; items: PaletteItem[] }[]>([{ title: "", items: root.items }]);
  let query = $state(root.query ?? "");
  let sel = $state(0);
  let input: HTMLInputElement;
  let done = false;

  const level = $derived(stack[stack.length - 1]);
  // Command palette: no leading ">" = command-line mode.
  const lineMode = $derived(!!root.commandline && stack.length === 1 && !query.startsWith(">"));
  const text = $derived((root.commandline && stack.length === 1 ? query.replace(/^>/, "") : query).trim().toLowerCase());

  /** Fuzzy score: every query char in order; consecutive and word-start matches rank higher. */
  function score(label: string, q: string): number {
    if (!q) return 1;
    const l = label.toLowerCase();
    if (l.includes(q)) return 1000 - l.indexOf(q);
    let i = 0;
    let s = 0;
    let run = 0;
    for (let j = 0; j < l.length && i < q.length; j++) {
      if (l[j] === q[i]) {
        i++;
        run++;
        s += run * 2 + (j === 0 || /[\s:._-]/.test(l[j - 1]) ? 5 : 0);
      } else run = 0;
    }
    return i === q.length ? s : 0;
  }

  const filtered = $derived.by(() => {
    if (lineMode) return [];
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length) return level.items;
    return level.items
      .map((it) => ({ it, s: words.reduce((acc, w) => (acc && score(it.label, w) ? acc + score(it.label, w) : 0), 1) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.it);
  });

  $effect(() => {
    void query;
    void stack.length;
    sel = 0;
  });
  $effect(() => {
    filtered[sel]?.preview?.();
  });

  onMount(() => {
    input.focus();
    if (root.query) input.setSelectionRange(query.length, query.length);
    return () => {
      if (!done) root.onCancel?.();
    };
  });

  function close(cancel = true) {
    if (cancel) root.onCancel?.();
    done = true;
    app.palette = null;
    app.focusCurrent();
  }
  function exec(it: PaletteItem | undefined) {
    if (!it) return;
    if (it.children) {
      stack = [...stack, { title: it.label, items: it.children() }];
      query = "";
      return;
    }
    if (it.keepOpen && root.refresh && stack.length === 1) {
      it.run?.();
      refresh(it);
      return;
    }
    done = true;
    app.palette = null;
    app.focusCurrent();
    it.run?.();
  }
  /** Rebuild the list and keep `it` selected. */
  function refresh(it: PaletteItem) {
    if (!root.refresh) return;
    stack[0] = { title: "", items: root.refresh() };
    const i = filtered.findIndex((x) => (it.id ? x.id === it.id : x.label === it.label));
    if (i >= 0) sel = i;
    input.focus();
  }
  function move(it: PaletteItem | undefined, delta: -1 | 1) {
    if (!it?.move) return;
    it.move(delta);
    refresh(it);
  }
  function submit() {
    if (lineMode) {
      const line = query.trim();
      if (!line) return;
      done = true;
      app.palette = null;
      root.commandline?.(line);
      return;
    }
    exec(filtered[sel]);
  }
  function back() {
    stack = stack.slice(0, -1);
    query = root.commandline && stack.length === 1 ? ">" : "";
  }
  function onkeydown(e: KeyboardEvent) {
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) move(filtered[sel], e.key === "ArrowUp" ? -1 : 1);
    else if (e.key === "ArrowDown") sel = Math.min(sel + 1, filtered.length - 1);
    else if (e.key === "ArrowUp") sel = Math.max(sel - 1, 0);
    else if (e.key === "PageDown") sel = Math.min(sel + 10, filtered.length - 1);
    else if (e.key === "PageUp") sel = Math.max(sel - 10, 0);
    else if (e.key === "Enter") submit();
    else if (e.key === "Escape") stack.length > 1 ? back() : close();
    else if (e.key === "Backspace" && stack.length > 1 && !query) back();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
  function scrollIntoView(el: HTMLElement, active: boolean) {
    if (active) el.scrollIntoView({ block: "nearest" });
    return { update: (a: boolean) => a && el.scrollIntoView({ block: "nearest" }) };
  }
</script>

<div class="backdrop" onmousedown={() => close()} role="presentation">
  <div class="palette" onmousedown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
    {#if stack.length > 1}
      <div class="crumb">
        <button onclick={back} title="Back (Backspace)"><Icon name="chevron" size={11} /></button>
        {stack.slice(1).map((s) => s.title).join(" › ")}
      </div>
    {/if}
    <input bind:this={input} bind:value={query} {onkeydown} placeholder={root.placeholder} spellcheck="false" />
    <ul>
      {#if lineMode}
        <li class="empty">{query.trim() ? `Enter: run "${query.trim()}"` : "Type a command line: new-tab -p shell ; split-pane -V -p python"}</li>
      {:else}
        {#each filtered as it, i ((it.id ?? it.label) + i)}
          <li class:sel={i === sel} class:movable={!!it.move} use:scrollIntoView={i === sel}>
            <button onclick={() => exec(it)} onmousemove={() => (sel = i)}>
              {#if it.icon}<span class="icon"><ProfileIcon icon={it.icon} /></span>{/if}
              <span class="label">{it.label}{#if it.detail}<span class="detail">{it.detail}</span>{/if}</span>
              {#if it.hint}<kbd>{it.hint}</kbd>{/if}
              {#if it.children}<span class="more"><Icon name="right" size={11} /></span>{/if}
            </button>
            {#if it.move}
              <span class="moves">
                <button title="Move up (Alt+Up)" tabindex="-1" onclick={() => move(it, -1)}><Icon name="up" size={12} /></button>
                <button title="Move down (Alt+Down)" tabindex="-1" onclick={() => move(it, 1)}><Icon name="down" size={12} /></button>
              </span>
            {/if}
          </li>
        {:else}
          <li class="empty">No match</li>
        {/each}
      {/if}
    </ul>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: #0005;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 12vh;
  }
  .palette {
    width: min(600px, 90vw);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 16px 48px var(--shadow);
    overflow: hidden;
  }
  .crumb {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px 0;
    color: var(--muted);
    font-size: 11px;
  }
  .crumb button {
    transform: rotate(90deg);
    padding: 2px;
  }
  input {
    width: 100%;
    box-sizing: border-box;
    padding: 12px 14px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--border);
    color: var(--fg);
    font: inherit;
    font-size: 14px;
    outline: none;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 50vh;
    overflow-y: auto;
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    background: none;
    border: none;
    border-radius: 5px;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .crumb button {
    width: auto;
    color: var(--muted);
  }
  li {
    position: relative;
  }
  li.sel > button {
    background: var(--hover);
  }
  li.movable > button {
    padding-right: 64px;
  }
  .moves {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    display: none;
    gap: 2px;
  }
  li.sel .moves {
    display: flex;
  }
  .moves button {
    width: auto;
    padding: 3px;
    color: var(--muted);
  }
  .moves button:hover {
    color: var(--fg);
    background: var(--panel);
  }
  .icon {
    display: grid;
    width: 14px;
  }
  .label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .detail {
    margin-left: 10px;
    color: var(--muted);
    font-size: 11px;
  }
  kbd {
    font-size: 11px;
    color: var(--muted);
  }
  .more {
    display: grid;
    color: var(--muted);
  }
  .empty {
    padding: 10px;
    color: var(--muted);
  }
</style>
