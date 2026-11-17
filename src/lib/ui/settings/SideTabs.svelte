<script lang="ts">
  // Vertical tabs beside an editor (same look as the settings nav): lists of tables like [[action]], [[scheme]].
  import type { Snippet } from "svelte";
  import { trackActiveTab } from "../tab-baseline";
  import Icon from "../Icon.svelte";

  export type SideTabGroup = { label?: string; items: { key: string; label: string }[] };

  let {
    groups,
    selected,
    onselect,
    onadd,
    addTitle,
    children,
  }: {
    groups: SideTabGroup[];
    selected: string;
    onselect: (key: string) => void;
    /** Shows a "New" button below the tabs. */
    onadd?: () => void;
    addTitle?: string;
    children: Snippet;
  } = $props();

  let sideEl = $state<HTMLElement>();
  let listEl = $state<HTMLElement>();

  $effect(() => {
    void selected;
    void groups;
    if (!sideEl || !listEl) return;
    return trackActiveTab(sideEl, listEl, "y");
  });

  // Keep the active tab visible (selection changed from the editor: add, duplicate...).
  $effect(() => {
    void selected;
    listEl?.querySelector(".tab.active")?.scrollIntoView({ block: "nearest" });
  });
</script>

<div class="split">
  <div class="side" bind:this={sideEl}>
    <nav bind:this={listEl}>
      {#each groups as g, gi (gi)}
        {#if g.label && g.items.length}<h5>{g.label}</h5>{/if}
        {#each g.items as it (it.key)}
          <button class="tab" class:active={it.key === selected} title={it.label} onclick={() => onselect(it.key)}>{it.label}</button>
        {/each}
      {/each}
    </nav>
    {#if onadd}<button class="add" title={addTitle} onclick={onadd}><Icon name="plus" size={12} /> New</button>{/if}
  </div>
  <div class="body">{@render children()}</div>
</div>

<style>
  .split {
    display: flex;
    align-items: flex-start;
    gap: 16px;
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  .side {
    position: sticky;
    top: 0;
    z-index: 3;
    flex: 0 0 200px;
    display: flex;
    flex-direction: column;
    /* Full height; nav shrinks/scrolls and "New" stays right below the last tab. */
    height: calc(100vh - 140px);
    background: var(--chrome);
    border-radius: 6px 0 0 6px;
    /* Inset line instead of a border: the active item paints over it and joins the editor. */
    box-shadow: inset -1px 0 0 var(--border);
    --ind: var(--accent);
    --ind-bg: var(--chrome);
  }
  :global(html:not(.focused)) .side {
    --ind: var(--muted);
  }
  .side::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    width: 1.5px;
    pointer-events: none;
    z-index: 2;
    background: linear-gradient(
      to bottom,
      var(--ind-bg) 0,
      var(--ind) var(--a0),
      transparent var(--a0),
      transparent var(--a1),
      var(--ind) var(--a1),
      var(--ind-bg) 100%
    );
  }
  .side:not([style*="--a0"])::after {
    display: none;
  }
  nav {
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    padding: 4px 0;
    display: flex;
    flex-direction: column;
  }
  h5 {
    margin: 10px 10px 4px 14px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  h5:first-child {
    margin-top: 4px;
  }
  .add {
    flex: 0 0 auto;
    display: inline-flex;
    gap: 4px;
    align-items: center;
    margin: 4px 8px 8px;
    padding: 4px 10px;
    border: 1px dashed var(--border);
    border-radius: 4px;
    background: none;
    color: var(--muted);
    cursor: pointer;
    font: inherit;
  }
  .add:hover {
    background: var(--hover);
    color: var(--fg);
  }
  /* Vertical tab look (SettingsView nav / TabItem.svelte). */
  .tab {
    position: relative;
    flex: 0 0 auto;
    display: block;
    height: 30px;
    line-height: 30px;
    margin: 1px 0 1px 4px;
    padding: 0 10px;
    border: none;
    border-radius: 5px 0 0 5px;
    background: none;
    color: var(--muted);
    cursor: pointer;
    font: inherit;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition:
      background 0.12s,
      color 0.12s;
  }
  .tab:hover:not(.active) {
    background: var(--hover);
    color: var(--fg);
  }
  .tab.active {
    background: var(--term-bg);
    color: var(--fg);
    font-weight: 500;
    z-index: 1;
  }
  .tab.active::before {
    content: "";
    position: absolute;
    inset: 0;
    padding: 1.5px 0 1.5px 1.5px;
    border-radius: inherit;
    pointer-events: none;
    background: var(--ind);
    -webkit-mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask:
      linear-gradient(#000 0 0) content-box,
      linear-gradient(#000 0 0);
    mask-composite: exclude;
  }
</style>
