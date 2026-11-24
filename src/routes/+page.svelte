<script lang="ts">
  import { onMount } from "svelte";
  import { app } from "$lib/state.svelte";
  import { find } from "$lib/layout/tree";
  import { fileUrl } from "$lib/audio";
  import TabBar from "$lib/ui/TabBar.svelte";
  import VerticalTabs from "$lib/ui/VerticalTabs.svelte";
  import SplitView from "$lib/ui/SplitView.svelte";
  import Sidebar from "$lib/ui/Sidebar.svelte";
  import Palette from "$lib/ui/Palette.svelte";
  import Menu from "$lib/ui/Menu.svelte";
  import Overlays from "$lib/ui/Overlays.svelte";
  import ResizeHandles from "$lib/ui/ResizeHandles.svelte";
  import ConfigEditor from "$lib/ui/ConfigEditor.svelte";
  import SettingsTab from "$lib/ui/settings/SettingsTab.svelte";

  onMount(() => {
    app.init();
  });

  // Never show the webview's native context menu (except in text fields); our own menus handle right-click.
  function blockNativeMenu(e: MouseEvent) {
    // xterm moves its hidden helper textarea under the cursor on right-click: still block there.
    if ((e.target as Element | null)?.closest?.("input, textarea:not(.xterm-helper-textarea)")) return;
    e.preventDefault();
  }

  $effect(() => {
    document.documentElement.classList.toggle("focused", app.windowFocused);
  });
  $effect(() => {
    document.documentElement.classList.toggle("rainbow", !!app.ui?.rainbowFrame);
  });

  // use_background_image_for_window: the active pane's image under every pane.
  const look = $derived(app.tab?.kind === "term" ? app.panes[app.tab.active]?.look : null);
  let windowImage = $state<string | null>(null);
  $effect(() => {
    const path = app.config.use_background_image_for_window ? look?.backgroundImage?.path : null;
    windowImage = null;
    if (path) fileUrl(path).then((u) => (windowImage = u));
  });
</script>

<svelte:window oncontextmenu={blockNativeMenu} />

<main>
  <!-- Left panel spans the full height, its head beside the title bar. -->
  {#if app.tabBarVisible && app.tabPosition === "left"}<VerticalTabs side="left" />{/if}
  <div class="col">
  {#if app.tabBarVisible}<TabBar />{/if}
  {#if app.config.error}
    <div class="error">Config error, using defaults — {app.config.error}</div>
  {/if}
  <div class="body">
    {#if app.sidebarSide === "left"}<Sidebar />{/if}
    <div class="tabs" style:background={windowImage ? (look?.paneBackground ?? "") : ""}>
      {#if windowImage && look?.backgroundImage}
        <div
          class="window-image"
          style:background-image="url({windowImage})"
          style:background-size={look.backgroundImage.size}
          style:background-position={look.backgroundImage.position}
          style:opacity={look.backgroundImage.opacity}
        ></div>
      {/if}
      {#each app.tabs as tab, i (tab.id)}
        <section class="tab" class:hidden={i !== app.activeTab}>
          {#if tab.kind !== "term"}
            {#if tab.kind === "config"}<SettingsTab />{:else}<ConfigEditor readonly />{/if}
          {:else if tab.zoom && find(tab.root, tab.zoom)}
            {#key tab.zoom}
              <SplitView node={find(tab.root, tab.zoom)!} {tab} />
            {/key}
          {:else}
            <SplitView node={tab.root} {tab} />
          {/if}
        </section>
      {/each}
    </div>
    {#if app.sidebarSide === "right"}<Sidebar />{/if}
    {#if app.tabBarVisible && app.tabPosition === "right"}<VerticalTabs side="right" />{/if}
  </div>
  </div>
  {#if app.palette}
    {#key app.palette}<Palette />{/key}
  {/if}
  {#if app.menu}
    {#key app.menu}<Menu groups={app.menu.groups} x={app.menu.x} y={app.menu.y} />{/key}
  {/if}
  <Overlays />
  <ResizeHandles />
</main>

<style>
  main {
    display: flex;
    height: 100%;
  }
  .col {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }
  .tabs {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
  .window-image {
    position: absolute;
    inset: 0;
    background-repeat: no-repeat;
    pointer-events: none;
  }
  .tab {
    position: absolute;
    inset: 0;
  }
  .tab.hidden {
    visibility: hidden;
    pointer-events: none;
  }
  .error {
    padding: 4px 10px;
    background: #4a1f24;
    color: #ffb4bb;
    font-size: 12px;
  }
</style>
