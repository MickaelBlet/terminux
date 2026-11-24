<script lang="ts">
  // Tabs of one tab group in the vertical tab panel.
  import { app } from "../state.svelte";
  import { tabsOf } from "../layout/groups";
  import { TabDrag } from "./tab-drag.svelte";
  import { useFlip } from "./flip.svelte";
  import { groupDrop } from "./group-drop.svelte";
  import Icon from "./Icon.svelte";
  import TabItem from "./TabItem.svelte";

  let { gid, side, collapsed, label, onmenu }: { gid: string; side: "left" | "right"; collapsed: boolean; label: string | null; onmenu: (e: MouseEvent) => void } =
    $props();

  const tabs = $derived(tabsOf(app.tabs, gid));
  let listEl = $state<HTMLDivElement>();
  const drag = new TabDrag(app, () => "y", () => listEl, () => tabsOf(app.tabs, gid));
  useFlip(
    () => listEl,
    () => tabs.map((t) => t.id).join() + (drag.state?.active ? "|drag" : ""),
    () => !!drag.state?.active,
  );
</script>

{#if label !== null}
  <div class="ghead" class:focused={app.activeGroup === gid} title={label}>
    {#if collapsed}<span class="rule"></span>{:else}
      <span class="glabel">{label}</span>
      <button title="New tab in this group" onclick={() => app.newTab({}, gid)}><Icon name="plus" size={12} /></button>
    {/if}
  </div>
{/if}
<div
  class="glist"
  class:drop={groupDrop.strip === gid}
  role="tablist"
  tabindex="-1"
  aria-orientation="vertical"
  data-group-id={gid}
  bind:this={listEl}
  oncontextmenu={onmenu}
>
  {#each tabs as t (t.id)}
    <TabItem {t} {drag} {side} variant={collapsed ? "collapsed" : "vertical"} />
  {/each}
</div>

<style>
  .glist {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-height: 8px;
  }
  .glist.drop {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .ghead {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    margin: 6px 4px 2px 8px;
    color: var(--muted);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .ghead.focused {
    color: var(--fg);
  }
  .glabel {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .rule {
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  button {
    display: grid;
    place-items: center;
    padding: 3px;
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    border-radius: 4px;
  }
  button:hover {
    color: var(--fg);
    background: var(--hover);
  }
</style>
