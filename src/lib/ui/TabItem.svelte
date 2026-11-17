<script lang="ts">
  import { app, type Tab } from "../state.svelte";
  import { tabMenu } from "./menus";
  import { tabInfo, tabStyle, type TabVariant } from "./tab-info";
  import type { TabDrag } from "./tab-drag.svelte";
  import { paneDrag } from "./pane-drag.svelte";
  import { shiftFor } from "./tab-shift";
  import Icon from "./Icon.svelte";
  import ProfileIcon from "./ProfileIcon.svelte";

  let { t, drag, variant = "equal", side = "left" }: { t: Tab; drag: TabDrag; variant?: TabVariant; side?: "left" | "right" } = $props();

  const i = $derived(app.tabs.indexOf(t));
  const f = $derived(tabInfo(app, t, i));
  const active = $derived(i === app.activeTab);
  const vertical = $derived(variant === "vertical" || variant === "collapsed");
  const closeMode = $derived(app.ui?.closeButton ?? "hover");
  const ellipsisStart = $derived(app.config?.tab_title_ellipsis === "start");
  const d = $derived(drag.state);
  const live = $derived(!!d?.active && !d.outside);
  const dragged = $derived(!!d?.active && d.from === i);
  /** Live drag: the dragged tab follows the pointer, neighbors slide aside. */
  const shift = $derived(!live || !d ? 0 : dragged ? d.offset : shiftFor(i, d.from, d.to, d.size));
  const style = $derived.by(() => {
    const base = tabStyle(app, t, active, f.background);
    if (!shift) return base;
    const tr = `transform:translate${vertical ? "Y" : "X"}(${shift}px)`;
    return base ? `${base};${tr}` : tr;
  });

  // Rename: the app says which tab, the tab item owns the input.
  let editValue = $state("");
  $effect(() => {
    if (app.renaming === t.id) editValue = app.tabTitle(t);
  });
  function commitRename(save: boolean) {
    if (app.renaming !== t.id) return;
    const idx = app.tabs.indexOf(t);
    if (save && idx >= 0) app.renameTab(idx, editValue);
    app.renaming = null;
    app.focusCurrent();
  }
  function focusInput(el: HTMLInputElement) {
    el.focus();
    el.select();
  }

  const RING = 2 * Math.PI * 6;
</script>

<div
  class="tab {variant}"
  class:vertical
  class:right={vertical && side === "right"}
  class:active
  class:drag-live={live}
  class:dragging={dragged}
  class:torn={dragged && d?.outside}
  class:colored={!!app.tabColor(t)}
  class:pane-drop={paneDrag.state?.target?.kind === "tab" && paneDrag.state.target.tabId === t.id}
  data-tab-id={t.id}
  role="tab"
  tabindex="-1"
  aria-selected={active}
  title={app.tabTitle(t)}
  {style}
  onclick={() => app.gotoTab(i)}
  onpointerdown={(e) => drag.down(e, i)}
  onpointermove={(e) => drag.move(e)}
  onpointerup={(e) => drag.up(e)}
  onmousedown={(e) => e.button === 1 && e.preventDefault()}
  onmouseup={(e) => e.button === 1 && e.preventDefault()}
  onauxclick={(e) => {
    if (e.button !== 1) return;
    // Block X11 primary-selection paste into the refocused terminal.
    e.preventDefault();
    setTimeout(() => app.closeTab(app.tabs.indexOf(t)));
  }}
  oncontextmenu={(e) => {
    e.preventDefault();
    e.stopPropagation();
    app.menu = tabMenu(app, i, e.clientX, e.clientY);
  }}
  ondblclick={() => {
    if (variant !== "collapsed") app.renaming = t.id;
  }}
  onkeydown={() => {}}
>
  <span class="lead">
    {#if t.kind !== "term"}<Icon name="gear" size={12} />
    {:else if f.bell}<span class="bell"><Icon name="bell" size={12} /></span>
    {:else if app.ui?.iconStyle !== "hidden" || variant === "collapsed"}<ProfileIcon icon={f.icon} size={12} mono={app.ui?.iconStyle === "monochrome"} />{/if}
    {#if f.progress}
      <svg class="ring s{f.progress.state}" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6" stroke-dasharray={f.progress.state === 3 ? `${RING / 4} ${RING}` : `${(RING * Math.max(f.progress.value, 3)) / 100} ${RING}`} />
      </svg>
    {/if}
  </span>
  {#if f.activity}<span class="dot"></span>{/if}
  {#if app.renaming === t.id && variant !== "collapsed"}
    <input
      use:focusInput
      bind:value={editValue}
      onblur={() => commitRename(true)}
      onpointerdown={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        if (e.key === "Enter") commitRename(true);
        if (e.key === "Escape") commitRename(false);
        e.stopPropagation();
      }}
    />
  {:else}
    <span class="title" class:ellipsis-start={ellipsisStart}><bdi>{app.tabTitle(t) || "Terminal"}</bdi></span>
  {/if}
  {#if f.readOnly}<span class="flag" title="Read-only"><Icon name="lock" size={11} /></span>{/if}
  {#if t.broadcast}<span class="flag" title="Broadcasting input to all panes"><Icon name="broadcast" size={11} /></span>{/if}
  {#if f.count > 1}<span class="count" class:zoomed={!!t.zoom} title={t.zoom ? "Pane zoomed" : `${f.count} panes`}
      >{#if t.zoom}<Icon name="zoom" size={9} />{/if}{f.count}</span
    >{/if}
  {#if closeMode !== "never" && (closeMode !== "activeonly" || active)}
    <button
      class="close"
      class:always={closeMode === "always" || closeMode === "activeonly"}
      title="Close tab"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={(e) => {
        e.stopPropagation();
        app.closeTab(app.tabs.indexOf(t));
      }}><Icon name="close" size={11} /></button
    >
  {/if}
</div>

<style>
  .tab {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 0;
    min-width: 90px;
    max-width: 220px;
    padding: 0 6px 0 10px;
    color: var(--tab-fg, var(--muted));
    cursor: pointer;
    border-radius: var(--tab-radius, 6px) var(--tab-radius, 6px) 0 0;
    transition:
      background 0.12s,
      color 0.12s;
  }
  /* Transparent border instead of a margin: the gap above the tab stays clickable,
     so a pointer at the screen's top edge hits the tab (fullscreen/maximized). */
  .tab:not(.vertical) {
    border-top: 4px solid transparent;
    /* !important: inline/shorthand `background` (colored tabs, drag) would reset it. */
    background-clip: padding-box !important;
  }
  /* Short centered separator between inactive tabs. */
  .tab:not(.vertical)::after {
    content: "";
    position: absolute;
    right: 0;
    top: 25%;
    height: 50%;
    width: 1px;
    background: var(--border);
  }
  .tab.active::after,
  .tab:hover::after,
  .tab:has(+ :global(.tab.active))::after,
  .tab:has(+ :global(.tab:hover))::after,
  .tab.colored::after,
  .tab:has(+ :global(.tab.colored))::after {
    display: none;
  }
  /* Active indicator: accent outline, open on the side facing the terminal. */
  .tab {
    --ind: var(--accent);
  }
  :global(html:not(.focused)) .tab {
    --ind: var(--muted);
  }
  .tab.colored.active {
    --ind: var(--tab-bg);
  }
  .tab.active::before {
    content: "";
    position: absolute;
    inset: 0;
    padding: 1.5px;
    border-radius: inherit;
    pointer-events: none;
    z-index: -1;
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
  .tab:not(.vertical).active::before {
    padding-bottom: 0;
  }
  .tab.vertical.active::before {
    padding-right: 0;
  }
  .tab.vertical.right.active::before {
    padding-right: 1.5px;
    padding-left: 0;
  }
  /* ui_theme.tab.indicator: underline (bar on the side facing the terminal), filled, none. */
  :global(html[data-tab-indicator="none"]) .tab.active::before {
    display: none;
  }
  :global(html[data-tab-indicator="filled"]) .tab.active::before {
    padding: 0;
    -webkit-mask: none;
    mask: none;
    opacity: 0.25;
  }
  :global(html[data-tab-indicator="underline"]) .tab.active::before {
    padding: 0;
    -webkit-mask: none;
    mask: none;
    border-radius: 0;
    top: auto;
    height: 2px;
  }
  :global(html[data-tab-indicator="underline"]) .tab.vertical.active::before {
    top: 0;
    height: auto;
    left: auto;
    width: 2px;
  }
  :global(html[data-tab-indicator="underline"]) .tab.vertical.right.active::before {
    left: 0;
    right: auto;
  }
  .titlelength {
    flex: 0 0 auto;
    max-width: 320px;
  }
  .compact:not(.active) {
    flex: 0 0 auto;
    min-width: 0;
  }
  .compact:not(.active) .title,
  .compact:not(.active) .count,
  .compact:not(.active) .close {
    display: none;
  }
  .tab.vertical {
    flex: 0 0 auto;
    height: calc(var(--tab-height, 34px) - 2px);
    /* Flush with the inner edge so the active tab joins the terminal. The outer gap is a
       transparent border, not a margin: a pointer at the screen's side edge hits the tab
       (fullscreen/maximized). */
    margin: 1px 0;
    border-left: 4px solid transparent;
    background-clip: padding-box !important;
    min-width: 0;
    max-width: none;
    /* Outer radius widened by the border so the visible (padding-box) corners stay round. */
    --r: var(--tab-radius, 5px);
    --rb: calc(var(--r) + 4px);
    border-radius: var(--rb) 0 0 var(--rb) / var(--r) 0 0 var(--r);
  }
  .tab.vertical.right {
    border-left: none;
    border-right: 4px solid transparent;
    border-radius: 0 var(--rb) var(--rb) 0 / 0 var(--r) var(--r) 0;
  }
  .tab.vertical::before {
    border-radius: var(--r) 0 0 var(--r);
  }
  .tab.vertical.right::before {
    border-radius: 0 var(--r) var(--r) 0;
  }
  .tab.collapsed {
    justify-content: center;
    padding: 0;
    gap: 0;
  }
  .collapsed .title,
  .collapsed .count,
  .collapsed .flag,
  .collapsed .close {
    display: none;
  }
  .collapsed .dot {
    position: absolute;
    top: 6px;
    right: 6px;
  }
  .tab:hover:not(.colored):not(.active) {
    background: var(--hover);
    color: var(--fg);
  }
  .tab.active {
    color: var(--fg);
    font-weight: 500;
    z-index: 1;
  }
  .tab.pane-drop {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .tab:not(.active) .lead {
    opacity: 0.7;
  }
  .tab.colored {
    color: inherit;
    opacity: 0.7;
  }
  .tab.colored:hover,
  .tab.colored.active {
    opacity: 1;
  }
  /* Only during a live drag: on drop, transforms vanish instantly and the FLIP glide takes over. */
  .tab.drag-live {
    transition:
      background 0.12s,
      color 0.12s,
      transform 0.15s ease-out;
  }
  .tab.drag-live.dragging {
    z-index: 2;
    cursor: grabbing;
    transition:
      background 0.12s,
      color 0.12s;
    filter: drop-shadow(0 2px 6px rgb(0 0 0 / 0.35));
  }
  .tab.drag-live.dragging:not(.active):not(.colored) {
    background: var(--chrome);
    color: var(--fg);
  }
  .tab.torn {
    opacity: 0.5;
  }
  .lead {
    position: relative;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  .ring {
    position: absolute;
    inset: -2px;
    width: 20px;
    height: 20px;
    transform: rotate(-90deg);
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.6;
    stroke-linecap: round;
  }
  .ring.s2 {
    stroke: var(--danger);
  }
  .ring.s4 {
    stroke: var(--warn);
    opacity: 0.6;
  }
  .ring.s3 {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  .title {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* RTL line box puts the ellipsis on the left; <bdi> keeps the text LTR. */
  .title.ellipsis-start {
    direction: rtl;
    text-align: left;
  }
  .title bdi {
    direction: ltr;
  }
  .tab input {
    flex: 1;
    min-width: 0;
    background: var(--panel);
    border: 1px solid var(--accent);
    color: var(--fg);
    font: inherit;
    padding: 1px 4px;
    border-radius: 3px;
    outline: none;
  }
  .flag {
    display: grid;
    opacity: 0.8;
  }
  .count {
    font-size: 10px;
    padding: 0 5px;
    border-radius: 8px;
    background: var(--hover);
  }
  .count.zoomed {
    display: flex;
    align-items: center;
    gap: 3px;
    background: var(--accent);
    color: var(--term-bg);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
  }
  .bell {
    color: var(--warn);
    display: grid;
  }
  button {
    display: grid;
    place-items: center;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    border-radius: 4px;
  }
  button:hover {
    color: var(--fg);
    background: var(--hover);
  }
  .close {
    padding: 3px;
    opacity: 0;
  }
  .close.always,
  .tab:hover .close,
  .tab.active .close {
    opacity: 1;
  }
</style>
