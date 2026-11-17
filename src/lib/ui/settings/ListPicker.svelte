<script lang="ts">
  // Selector + add / delete / reorder buttons for an array of tables ([[scheme]], [[action]], ...).
  // With `children`, items are vertical tabs (SideTabs) beside the editor.
  import type { Snippet } from "svelte";
  import Icon from "../Icon.svelte";
  import SideTabs from "./SideTabs.svelte";

  let {
    items,
    selected = $bindable(0),
    label,
    onadd,
    onremove,
    onmove,
    extra,
    children,
  }: {
    items: unknown[];
    selected?: number;
    label: (item: unknown, i: number) => string;
    onadd: () => void;
    onremove: (i: number) => void;
    onmove?: (from: number, to: number) => void;
    extra?: Snippet;
    /** Editor of the selected item; switches to the vertical tab layout. */
    children?: Snippet;
  } = $props();

  const i = $derived(Math.max(0, Math.min(selected, items.length - 1)));
  const move = (to: number) => {
    onmove?.(i, to);
    selected = to;
  };
</script>

{#snippet buttons(withAdd: boolean)}
  {#if withAdd}<button onclick={onadd}><Icon name="plus" size={12} /> New</button>{/if}
  {@render extra?.()}
  {#if items.length}
    {#if onmove}
      <button title="Move up" disabled={i === 0} onclick={() => move(i - 1)}><Icon name="up" size={12} /></button>
      <button title="Move down" disabled={i === items.length - 1} onclick={() => move(i + 1)}><Icon name="down" size={12} /></button>
    {/if}
    <button class="danger" title="Delete" onclick={() => onremove(i)}><Icon name="trash" size={12} /> Delete</button>
  {/if}
{/snippet}

{#if children}
  <SideTabs groups={[{ items: items.map((it, j) => ({ key: String(j), label: label(it, j) })) }]} selected={String(i)} onselect={(k) => (selected = Number(k))} {onadd}>
    <div class="bar">{@render buttons(false)}</div>
    {@render children()}
  </SideTabs>
{:else}
  <div class="bar">
    <select value={String(i)} onchange={(e) => (selected = Number(e.currentTarget.value))} disabled={!items.length}>
      {#each items as it, j (j)}<option value={String(j)}>{label(it, j)}</option>{/each}
      {#if !items.length}<option>None</option>{/if}
    </select>
    {@render buttons(true)}
  </div>
{/if}

<style>
  .bar {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    padding-bottom: 10px;
  }
  select {
    background: var(--term-bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 6px;
    font: inherit;
    min-width: 200px;
  }
  select:focus {
    outline: 1px solid var(--accent);
  }
  button {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--fg);
    cursor: pointer;
    font: inherit;
    padding: 4px 10px;
  }
  button:hover:not(:disabled) {
    background: var(--hover);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .danger:hover {
    color: var(--danger);
  }

</style>
