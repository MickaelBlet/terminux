<script lang="ts">
  // Tab strip of one tab group (shown above each group when the window has several).
  import { app } from "../state.svelte";
  import { tabsOf } from "../layout/groups";
  import { tabBarMenu } from "./menus";
  import { TabDrag } from "./tab-drag.svelte";
  import { useFlip } from "./flip.svelte";
  import { trackActiveTab } from "./tab-baseline";
  import { groupDrop } from "./group-drop.svelte";
  import type { TabVariant } from "./tab-info";
  import Icon from "./Icon.svelte";
  import TabItem from "./TabItem.svelte";

  let { gid }: { gid: string } = $props();

  const tabs = $derived(tabsOf(app.tabs, gid));
  const focused = $derived(app.activeGroup === gid);
  const mode = $derived((app.config.tab_width_mode ?? "equal").toLowerCase().replace(/[_-]/g, "") as TabVariant);
  const variant = $derived<TabVariant>(mode === "compact" || mode === "titlelength" ? mode : "equal");

  let listEl = $state<HTMLDivElement>();
  let barEl = $state<HTMLElement>();
  const drag = new TabDrag(app, () => "x", () => listEl, () => tabsOf(app.tabs, gid));
  useFlip(
    () => listEl,
    () => tabs.map((t) => t.id).join() + (drag.state?.active ? "|drag" : ""),
    () => !!drag.state?.active,
  );

  $effect(() => {
    void app.shownTab(gid)?.id;
    void tabs.map((t) => `${t.id}:${app.tabColor(t)}`).join();
    if (!barEl || !listEl) return;
    return trackActiveTab(barEl, listEl, "x");
  });

  function onMenu(e: MouseEvent) {
    e.preventDefault();
    if ((e.target as HTMLElement).closest("button")) return;
    app.menu = tabBarMenu(app, e.clientX, e.clientY);
  }
</script>

<header class="strip" class:focused class:drop={groupDrop.strip === gid} bind:this={barEl}>
  <div class="tabs" role="tablist" tabindex="-1" data-group-id={gid} bind:this={listEl} oncontextmenu={onMenu}>
    {#each tabs as t (t.id)}
      <TabItem {t} {drag} {variant} />
    {/each}
    <div class="new">
      <button title="New tab in this group" onclick={() => app.newTab({}, gid)}><Icon name="plus" /></button>
    </div>
    <div class="fill"></div>
  </div>
  <div class="actions">
    <button title="Split tab group right" onclick={() => app.splitTabGroup("right", { target: gid })}><Icon name="split-right" size={14} /></button>
    <button title="Close tab group" onclick={() => void app.closeGroup(gid)}><Icon name="close" size={12} /></button>
  </div>
</header>

<style>
  .strip {
    position: relative;
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
    height: var(--tab-height, 34px);
    background: var(--chrome);
    box-shadow: inset 0 -1px 0 var(--border);
    user-select: none;
    --ind: var(--muted);
    --ind-bg: var(--chrome);
  }
  .strip.focused {
    --ind: var(--accent);
  }
  :global(html:not(.focused)) .strip {
    background: var(--chrome-unfocused);
    --ind: var(--muted);
    --ind-bg: var(--chrome-unfocused);
  }
  .strip.drop {
    background: color-mix(in srgb, var(--accent) 18%, var(--chrome));
  }
  /* Accent baseline from each edge of the strip to the shown tab (accent only in the focused group). */
  .strip::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 1.5px;
    pointer-events: none;
    z-index: 2;
    background: linear-gradient(
      to right,
      var(--ind-bg) 0,
      var(--tab-ind, var(--ind)) var(--a0),
      transparent var(--a0),
      transparent var(--a1),
      var(--tab-ind, var(--ind)) var(--a1),
      var(--ind-bg) 100%
    );
  }
  .strip:not([style*="--a0"])::after,
  :global(html[data-tab-indicator]:not([data-tab-indicator="outline"])) .strip::after {
    display: none;
  }
  .strip:not(.focused) :global(.tab.active) {
    opacity: 0.8;
  }
  .tabs {
    display: flex;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .fill {
    flex: 1;
    min-width: 24px;
  }
  button {
    display: grid;
    place-items: center;
    padding: 5px;
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
  .new,
  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 4px;
  }
</style>
