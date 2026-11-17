<script lang="ts">
  // Optional bar above a pane (`show_pane_title_bar`): icon, title, flags, zoom / close.
  import { app, type Tab } from "../state.svelte";
  import { findProfile } from "../config";
  import Icon from "./Icon.svelte";
  import ProfileIcon from "./ProfileIcon.svelte";
  import { paneDrag } from "./pane-drag.svelte";

  let { paneId, tab }: { paneId: string; tab: Tab } = $props();

  const p = $derived(app.panes[paneId]);
  const active = $derived(tab.active === paneId);
  const split = $derived(tab.root.kind === "split");
  const icon = $derived(
    p?.kind === "file" ? "📝" : p?.kind === "snippets" ? "snippet" : p?.kind === "config" || p?.kind === "defaults" ? "gear" : (p?.look?.icon ?? findProfile(app.config, p?.spec.profileId)?.icon ?? null),
  );

  let editValue = $state("");
  $effect(() => {
    if (app.renamingPane === paneId) editValue = app.paneTitle(paneId);
  });
  function commit(save: boolean) {
    if (app.renamingPane !== paneId) return;
    if (save) app.renamePane(paneId, editValue);
    app.renamingPane = null;
    app.focusCurrent();
  }
  function focusInput(el: HTMLInputElement) {
    el.focus();
    el.select();
  }
</script>

<div
  class="bar"
  class:active
  ondblclick={() => (app.renamingPane = paneId)}
  onpointerdown={(e) => !(e.target as Element).closest("button, input") && paneDrag.down(e, paneId)}
  title="Drag to move the pane, double-click to rename"
  role="presentation"
>
  {#if p?.bell}<span class="bell"><Icon name="bell" size={11} /></span>
  {:else if app.ui?.iconStyle !== "hidden"}<ProfileIcon {icon} size={11} mono={app.ui?.iconStyle === "monochrome"} />{/if}
  {#if app.renamingPane === paneId}
    <input
      use:focusInput
      bind:value={editValue}
      onblur={() => commit(true)}
      onmousedown={(e) => e.stopPropagation()}
      ondblclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        if (e.key === "Enter") commit(true);
        if (e.key === "Escape") commit(false);
        e.stopPropagation();
      }}
    />
  {:else}
    <span class="title" title={app.paneTitle(paneId)}>{app.paneTitle(paneId) || "Terminal"}</span>
  {/if}
  {#if p?.readOnly}<span class="flag" title="Read-only"><Icon name="lock" size={10} /></span>{/if}
  {#if split}
    <button
      class:on={!!tab.zoom}
      title={tab.zoom ? "Unzoom (show all panes)" : "Zoom pane"}
      ondblclick={(e) => e.stopPropagation()}
      onclick={() => app.toggleZoom()}><Icon name="zoom" size={10} /></button
    >
  {/if}
  <button
    title="Close pane"
    onmousedown={(e) => e.stopPropagation()}
    ondblclick={(e) => e.stopPropagation()}
    onclick={() => app.closePane(paneId)}><Icon name="close" size={10} /></button
  >
</div>

<style>
  .bar {
    flex: 0 0 22px;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 0 4px 0 8px;
    font-size: 11px;
    color: var(--muted);
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    user-select: none;
    cursor: grab;
    position: relative;
    z-index: 5;
  }
  .bar.active {
    color: var(--fg);
    border-bottom-color: var(--accent-dim);
  }
  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  input {
    flex: 1;
    min-width: 0;
    font: inherit;
    padding: 0 4px;
    color: var(--fg);
    background: var(--term-bg);
    border: 1px solid var(--accent);
    border-radius: 3px;
    outline: none;
  }
  .bell {
    color: var(--warn);
    display: flex;
  }
  .flag {
    display: flex;
  }
  button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    color: inherit;
    background: none;
    border: none;
    border-radius: 3px;
    opacity: 0.7;
    cursor: pointer;
  }
  button:hover {
    opacity: 1;
    background: var(--hover);
  }
  button.on {
    color: var(--accent);
    opacity: 1;
  }
</style>
