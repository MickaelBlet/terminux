<script lang="ts">
  import { app } from "../state.svelte";
  import { newTabMenu, tabBarMenu } from "./menus";
  import { TabDrag } from "./tab-drag.svelte";
  import { useFlip } from "./flip.svelte";
  import Icon from "./Icon.svelte";
  import TabItem from "./TabItem.svelte";
  import { trackActiveTab } from "./tab-baseline";

  let { side }: { side: "left" | "right" } = $props();

  const collapsed = $derived(app.verticalCollapsed);
  // Renaming needs the title input: expand the panel.
  $effect(() => {
    if (app.renaming && collapsed) app.setVerticalCollapsed(false);
  });

  let listEl = $state<HTMLDivElement>();
  const drag = new TabDrag(app, () => "y", () => listEl);
  useFlip(
    () => listEl,
    () => app.tabs.map((t) => t.id).join() + (drag.state?.active ? "|drag" : ""),
    () => !!drag.state?.active,
  );

  let dropdownBtn = $state<HTMLButtonElement>();
  let navEl = $state<HTMLElement>();
  $effect(() => {
    app.dropdownAnchor = () => {
      const r = (dropdownBtn ?? navEl)?.getBoundingClientRect();
      if (!r) return { x: 40, y: 34 };
      return side === "left" ? { x: r.right + 2, y: r.top } : { x: r.left - 2, y: r.top };
    };
  });

  /** Baseline along the inner edge: fades out from the active tab toward the panel ends. */
  $effect(() => {
    void app.tab?.id;
    void (app.tab && app.tabColor(app.tab));
    void app.tabs.map((t) => t.id).join();
    void collapsed;
    if (!navEl || !listEl) return;
    return trackActiveTab(navEl, listEl, "y");
  });

  function openDropdown(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    app.menu = newTabMenu(app, side === "left" ? r.right + 2 : r.left - 2, r.top);
  }

  function onBarMenu(e: MouseEvent) {
    e.preventDefault();
    if ((e.target as HTMLElement).closest("button")) return;
    app.menu = tabBarMenu(app, e.clientX, e.clientY);
  }

  // ---------- resize by dragging the inner edge ----------
  let resize = $state<{ x0: number; w0: number } | null>(null);
  function onResizeDown(e: PointerEvent) {
    if (e.button !== 0 || collapsed) return;
    resize = { x0: e.clientX, w0: app.verticalWidth };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onResizeMove(e: PointerEvent) {
    if (!resize) return;
    const dx = e.clientX - resize.x0;
    app.setVerticalWidth(resize.w0 + (side === "left" ? dx : -dx));
  }
  function onResizeUp() {
    resize = null;
  }
</script>

<nav class="vtabs {side}" class:collapsed class:resizing={!!resize} style:width={collapsed ? null : `${app.verticalWidth}px`} bind:this={navEl}>
  <div class="list" role="tablist" tabindex="-1" aria-orientation="vertical" bind:this={listEl} oncontextmenu={onBarMenu}>
    {#each app.tabs as t (t.id)}
      <TabItem {t} {drag} {side} variant={collapsed ? "collapsed" : "vertical"} />
    {/each}
    <div class="add">
      <button class="plus" title="New tab ({app.keymap.hint('new_tab') ?? ''})" onclick={() => app.newTab()}><Icon name="plus" /></button>
      {#if !collapsed}
        <button bind:this={dropdownBtn} title="New tab with profile ({app.keymap.hint('open_new_tab_dropdown') ?? ''})" onclick={openDropdown}
          ><Icon name="chevron" size={12} /></button
        >
      {/if}
    </div>
  </div>
  <div class="foot" role="toolbar" tabindex="-1" oncontextmenu={onBarMenu}>
    {#if !collapsed}
      <span class="spacer"></span>
    {/if}
    <button
      title={collapsed ? "Expand tabs" : "Collapse tabs"}
      onclick={() => app.setVerticalCollapsed(!collapsed)}
      ><Icon name={(side === "left") === collapsed ? "right" : "left"} size={12} /></button
    >
  </div>
  {#if !collapsed}
    <div
      class="grip"
      role="separator"
      aria-orientation="vertical"
      title="Resize"
      onpointerdown={onResizeDown}
      onpointermove={onResizeMove}
      onpointerup={onResizeUp}
      onpointercancel={onResizeUp}
      ondblclick={() => app.setVerticalWidth(app.config.vertical_tab_width ?? 200)}
    ></div>
  {/if}
</nav>

<style>
  .vtabs {
    position: relative;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-height: 0;
    background: var(--chrome);
    user-select: none;
  }
  :global(html:not(.focused)) .vtabs {
    background: var(--chrome-unfocused);
  }
  /* Inset line instead of a border: the active tab paints over it and joins the terminal. */
  .vtabs.left {
    box-shadow: inset -1px 0 0 var(--border);
  }
  .vtabs.right {
    box-shadow: inset 1px 0 0 var(--border);
  }
  .vtabs {
    --ind: var(--accent);
    --ind-bg: var(--chrome);
  }
  :global(html:not(.focused)) .vtabs {
    --ind: var(--muted);
    --ind-bg: var(--chrome-unfocused);
  }
  .vtabs::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1.5px;
    pointer-events: none;
    z-index: 2;
    background: linear-gradient(
      to bottom,
      var(--ind-bg) 0,
      var(--tab-ind, var(--ind)) var(--a0),
      transparent var(--a0),
      transparent var(--a1),
      var(--tab-ind, var(--ind)) var(--a1),
      var(--ind-bg) 100%
    );
  }
  .vtabs.left::after {
    right: 0;
  }
  .vtabs.right::after {
    left: 0;
  }
  .vtabs:not([style*="--a0"])::after,
  :global(html[data-tab-indicator]:not([data-tab-indicator="outline"])) .vtabs::after {
    display: none;
  }
  .vtabs.collapsed {
    width: 40px;
  }
  .list {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
  }
  /* Scrollbar on the outer (left) edge: rtl flips its side, children restore ltr. */
  .left .list {
    direction: rtl;
  }
  .left .list > :global(*) {
    direction: ltr;
  }
  .add {
    display: flex;
    align-items: center;
    gap: 1px;
    flex-shrink: 0;
    margin: 4px;
  }
  .add .plus {
    flex: 1;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 4px;
    border-top: 1px solid var(--border);
  }
  .collapsed .foot {
    flex-direction: column;
  }
  .spacer {
    flex: 1;
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
  .grip {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 5px;
    cursor: col-resize;
    z-index: 2;
  }
  .left .grip {
    right: -3px;
  }
  .right .grip {
    left: -3px;
  }
  .grip:hover,
  .resizing .grip {
    background: var(--accent);
    opacity: 0.5;
  }
</style>
