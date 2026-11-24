<script lang="ts">
  // Window sidebar, fixed on the left or right of the panes: Git and snippets views.
  import { app, type SidebarView } from "../state.svelte";
  import type { MenuItem } from "./types";
  import GitPane from "./GitPane.svelte";
  import SnippetsPane from "./SnippetsPane.svelte";
  import Icon from "./Icon.svelte";

  const VIEWS: { id: SidebarView; label: string; icon: string; command: string }[] = [
    { id: "git", label: "Source control", icon: "git", command: "toggle_git_sidebar" },
    { id: "snippets", label: "Snippets", icon: "snippet", command: "toggle_snippets_sidebar" },
  ];

  const side = $derived(app.sidebarSide);
  const view = $derived(app.sidebar);

  let resize = $state<{ x0: number; w0: number } | null>(null);
  function onResizeDown(e: PointerEvent) {
    if (e.button !== 0) return;
    resize = { x0: e.clientX, w0: app.sidebarWidth };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onResizeMove(e: PointerEvent) {
    if (!resize) return;
    const dx = e.clientX - resize.x0;
    app.setSidebarWidth(resize.w0 + (side === "left" ? dx : -dx));
  }
  function onResizeUp() {
    resize = null;
  }

  function menu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const groups: MenuItem[][] = [
      VIEWS.map((v) => ({ label: v.label, icon: v.icon, checked: view === v.id, hint: app.keymap.hint(v.command), run: () => app.showSidebar(v.id) })),
      [
        { label: side === "left" ? "Move sidebar right" : "Move sidebar left", icon: side === "left" ? "right" : "left", run: () => app.setSidebarSide(side === "left" ? "right" : "left") },
        { label: "Close sidebar", icon: "close", run: () => app.showSidebar(null) },
      ],
    ];
    app.menu = { x: e.clientX, y: e.clientY, groups };
  }

  function onKey(e: KeyboardEvent) {
    // Escape (outside dialogs/menus) returns to the terminal.
    if (e.key === "Escape" && !e.defaultPrevented && !app.palette && !app.dialog && !app.menu) {
      const id = app.activePane;
      if (id) app.focusPane(id);
    }
  }
</script>

{#if view}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <aside class="sidebar {side}" class:resizing={!!resize} style:width="{app.sidebarWidth}px" onkeydown={onKey} aria-label="Sidebar">
    <div class="bar" role="tablist" tabindex="-1" oncontextmenu={menu}>
      {#each VIEWS as v (v.id)}
        {@const hint = app.keymap.hint(v.command)}
        <button
          class="view"
          class:active={view === v.id}
          role="tab"
          aria-selected={view === v.id}
          title={v.label + (hint ? ` (${hint})` : "")}
          onclick={() => app.showSidebar(v.id)}
        >
          <Icon name={v.icon} size={14} />
          {#if view === v.id}<span>{v.label}</span>{/if}
        </button>
      {/each}
      <span class="spacer"></span>
      <button class="view" title="Sidebar options" aria-label="Sidebar options" onclick={menu}><Icon name="menu" size={13} /></button>
      <button class="view" title="Close sidebar" aria-label="Close sidebar" onclick={() => app.showSidebar(null)}><Icon name="close" size={12} /></button>
    </div>
    <div class="content">
      {#if view === "git"}<GitPane />{:else if view === "snippets"}<SnippetsPane />{/if}
    </div>
    <div
      class="grip"
      role="separator"
      aria-orientation="vertical"
      title="Resize"
      onpointerdown={onResizeDown}
      onpointermove={onResizeMove}
      onpointerup={onResizeUp}
      onpointercancel={onResizeUp}
    ></div>
  </aside>
{/if}

<style>
  .sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-height: 0;
    min-width: 0;
    background: var(--chrome);
    color: var(--fg);
  }
  :global(html:not(.focused)) .sidebar {
    background: var(--chrome-unfocused);
  }
  .sidebar.left {
    box-shadow: inset -1px 0 0 var(--border);
  }
  .sidebar.right {
    box-shadow: inset 1px 0 0 var(--border);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 6px;
    border-bottom: 1px solid var(--border);
    user-select: none;
    outline: none;
  }
  .spacer {
    flex: 1;
  }
  .view {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--muted);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .view:hover {
    background: var(--hover, #ffffff14);
    color: var(--fg);
  }
  .view.active {
    color: var(--fg);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .content {
    flex: 1;
    min-height: 0;
    padding: 4px 2px 2px;
    overflow: hidden;
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
