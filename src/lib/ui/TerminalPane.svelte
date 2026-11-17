<script lang="ts">
  import { onMount } from "svelte";
  import { app, type Tab } from "../state.svelte";
  import { sessions } from "../term/session";
  import { fileUrl } from "../audio";
  import { find, contains, paneIds } from "../layout/tree";
  import { paneTitleBarMode, showPaneTitleBar } from "./pane-title";
  import PaneTitleBar from "./PaneTitleBar.svelte";
  import { paneDrag } from "./pane-drag.svelte";
  import SearchBar from "./SearchBar.svelte";
  import SnippetsPane from "./SnippetsPane.svelte";
  import FilePane from "./FilePane.svelte";
  import Icon from "./Icon.svelte";

  let { paneId, tab }: { paneId: string; tab: Tab } = $props();
  let host = $state<HTMLDivElement>();

  const info = $derived(app.panes[paneId]);
  const kind = $derived(info?.kind ?? "term");

  onMount(() => {
    if (kind !== "term" || !host) return;
    const s = sessions.get(paneId);
    s?.attach(host);
    const ro = new ResizeObserver(() => s?.scheduleFit());
    ro.observe(host);
    return () => ro.disconnect();
  });

  const multi = $derived(tab.root.kind === "split" && !tab.zoom);
  const active = $derived(tab.active === paneId);
  const zoomed = $derived(!!tab.zoom);
  const grouped = $derived(!!tab.group && contains(find(tab.root, tab.group) ?? tab.root, paneId));
  const look = $derived(info?.look);
  const pad = $derived(look?.padding ?? [6, 4, 2, 2]);
  const titleBar = $derived(
    app.renamingPane === paneId ||
      showPaneTitleBar(paneTitleBarMode(app.config.show_pane_title_bar), paneIds(tab.root).length, zoomed),
  );
  const dragged = $derived(!!paneDrag.state?.active && paneDrag.state.paneId === paneId);
  const drop = $derived.by(() => {
    const t = paneDrag.state?.target;
    if (t?.kind === "pane" && t.paneId === paneId) return t.box;
    return paneDrag.external?.paneId === paneId ? paneDrag.external.box : null;
  });
  const windowImage = $derived(!!app.config.use_background_image_for_window);

  let image = $state<string | null>(null);
  $effect(() => {
    const path = windowImage ? null : look?.backgroundImage?.path;
    image = null;
    if (path) fileUrl(path).then((u) => path === look?.backgroundImage?.path && (image = u));
  });

  // Visual bell: restart the flash animation on each bell.
  let flashing = $state(false);
  $effect(() => {
    if (!info?.flash) return;
    flashing = false;
    requestAnimationFrame(() => (flashing = true));
    const t = setTimeout(() => (flashing = false), 250);
    return () => clearTimeout(t);
  });
</script>

<div
  class="pane"
  class:multi
  class:active
  class:zoomed
  class:grouped
  class:retro={look?.retro}
  class:flash={flashing}
  class:dragged
  data-pane-id={paneId}
  style:background={windowImage && look?.backgroundImage ? "transparent" : (look?.paneBackground ?? "var(--term-bg)")}
  onmousedown={() => app.focusPane(paneId)}
  onmouseenter={() => app.config.focus_follow_mouse && !active && app.windowFocused && app.focusPane(paneId)}
  role="presentation"
>
  {#if image && look?.backgroundImage}
    <div
      class="bg-image"
      style:background-image="url({image})"
      style:background-size={look.backgroundImage.size}
      style:background-position={look.backgroundImage.position}
      style:opacity={look.backgroundImage.opacity}
    ></div>
  {/if}
  {#if titleBar}<PaneTitleBar {paneId} {tab} />{/if}
  <div class="body" style:padding="{pad[1]}px {pad[2]}px {pad[3]}px {pad[0]}px">
  {#if kind === "snippets"}
    <SnippetsPane {paneId} />
  {:else if kind === "file"}
    {#key info?.spec.file}<FilePane {paneId} />{/key}
  {:else}
    <div class="host" bind:this={host}></div>
  {/if}
  <div class="badges">
    {#if info?.markMode}<span class="badge">{info.markMode === "block" ? "BLOCK SELECT" : "MARK MODE"}</span>{/if}
    {#if info?.readOnly}<span class="badge" title="Read-only"><Icon name="lock" size={10} /> READ-ONLY</span>{/if}
    {#if zoomed && tab.root.kind === "split" && app.config.show_zoom_badge !== false}
      <button class="badge" title="Unzoom (show all panes)" onmousedown={(e) => e.stopPropagation()} onclick={() => app.toggleZoom()}>
        <Icon name="zoom" size={11} /> ZOOM
      </button>
    {/if}
  </div>
  {#if app.searchPane === paneId}
    <SearchBar {paneId} />
  {/if}
  </div>
  {#if drop}
    <div class="drop" style:left="{drop.left}px" style:top="{drop.top}px" style:width="{drop.width}px" style:height="{drop.height}px"></div>
  {/if}
</div>

<style>
  .pane {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
  }
  .body {
    position: relative;
    flex: 1;
    min-height: 0;
    box-sizing: border-box;
  }
  .pane.multi {
    border: 2px solid transparent;
    border-radius: 4px;
  }
  .pane.multi.active {
    border-color: var(--accent-dim);
  }
  .pane.grouped {
    border-color: var(--accent) !important;
  }
  .pane.multi:not(.active):not(.grouped) {
    opacity: 0.88;
  }
  .pane.dragged {
    opacity: 0.5;
  }
  .drop {
    position: absolute;
    z-index: 20;
    box-sizing: border-box;
    background: color-mix(in srgb, var(--accent) 25%, transparent);
    border: 2px solid var(--accent);
    border-radius: 4px;
    pointer-events: none;
    transition: all 0.08s ease-out;
  }
  .pane.flash::after {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--fg);
    opacity: 0.18;
    pointer-events: none;
    animation: flash 0.25s ease-out forwards;
  }
  @keyframes flash {
    to {
      opacity: 0;
    }
  }
  .bg-image {
    position: absolute;
    inset: 0;
    background-repeat: no-repeat;
    pointer-events: none;
  }
  .host {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  /* Retro CRT: scanlines over a soft glow. */
  .retro .host {
    filter: drop-shadow(0 0 2px currentColor) contrast(1.1);
  }
  .retro::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 4;
    pointer-events: none;
    background: repeating-linear-gradient(to bottom, #0000 0 2px, #0003 2px 3px);
    box-shadow: inset 0 0 60px #0008;
  }
  .badges {
    position: absolute;
    top: 4px;
    right: 14px;
    z-index: 5;
    display: flex;
    gap: 6px;
  }
  .badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    font: inherit;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--term-bg);
    background: var(--accent);
    border: none;
    border-radius: 9px;
    opacity: 0.85;
  }
  button.badge {
    cursor: pointer;
  }
  .badge:hover {
    opacity: 1;
  }
</style>
