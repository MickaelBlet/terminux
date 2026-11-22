<script lang="ts">
  import { app } from "../state.svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { GLOBAL_COMMANDS } from "../actions";
  import type { ActionSpec } from "../commands";
  import type { ToolbarItem } from "../toolbar";
  import { newTabMenu, tabBarMenu, toolbarMenu } from "./menus";
  import ProfileIcon from "./ProfileIcon.svelte";
  import { TabDrag } from "./tab-drag.svelte";
  import { useFlip } from "./flip.svelte";
  import type { TabVariant } from "./tab-info";
  import Icon from "./Icon.svelte";
  import TabItem from "./TabItem.svelte";
  import TabLead from "./TabLead.svelte";
  import { tabInfo } from "./tab-info";
  import { trackActiveTab } from "./tab-baseline";
  import { settingsDoc } from "../settings/doc.svelte";

  const win = getCurrentWindow();
  let maximized = $state(false);
  $effect(() => {
    const sync = () => win.isMaximized().then((m) => (maximized = m));
    sync();
    const un = win.onResized(sync);
    return () => void un.then((f) => f());
  });

  /** Vertical tabs: this bar is only the title bar, the tab list lives in VerticalTabs. */
  const vertical = $derived(app.tabPosition !== "top");
  const curInfo = $derived(vertical && app.tab ? tabInfo(app, app.tab, app.activeTab) : null);

  let dropdownBtn = $state<HTMLButtonElement>();
  $effect(() => {
    if (vertical) return;
    app.dropdownAnchor = () => {
      const r = dropdownBtn?.getBoundingClientRect();
      return r ? { x: r.left, y: r.bottom + 2 } : { x: 40, y: 34 };
    };
  });

  const mode = $derived((app.config.tab_width_mode ?? "equal").toLowerCase().replace(/[_-]/g, "") as TabVariant);
  const variant = $derived<TabVariant>(mode === "compact" || mode === "titlelength" ? mode : "equal");

  let tabsEl = $state<HTMLDivElement>();
  let barEl = $state<HTMLElement>();

  /** Baseline: fades out from the active tab's edges toward the bar ends. */
  $effect(() => {
    void app.tab?.id;
    void (app.tab && app.tabColor(app.tab));
    void app.tabs.map((t) => t.id).join();
    if (vertical || !barEl || !tabsEl) return;
    return trackActiveTab(barEl, tabsEl, "x");
  });

  /** Tab bar menu on empty space; buttons keep no menu. */
  function onBarMenu(e: MouseEvent) {
    e.preventDefault();
    if ((e.target as HTMLElement).closest("button")) return;
    app.menu = tabBarMenu(app, e.clientX, e.clientY);
  }
  const drag = new TabDrag(app, () => "x", () => tabsEl);
  useFlip(
    () => tabsEl,
    () => app.tabs.map((t) => t.id).join() + (drag.state?.active ? "|drag" : ""),
    () => !!drag.state?.active,
  );

  /** Toggle state shown on toolbar buttons. */
  function isOn(spec: ActionSpec): boolean {
    const pane = app.activePane ? app.panes[app.activePane] : undefined;
    switch (spec.command) {
      case "toggle_pane_zoom":
        return !!app.tab?.zoom;
      case "open_settings":
        if (app.tab?.kind !== "config") return false;
        if (spec.target === "settings_ui") return settingsDoc.view === "ui";
        if (spec.target === "settings_toml") return settingsDoc.view === "toml";
        return !spec.target;
      case "find":
        return !!app.searchPane && app.searchPane === app.activePane;
      case "toggle_broadcast_input":
        return !!app.tab?.broadcast;
      case "toggle_read_only_mode":
        return !!pane?.readOnly;
      case "mark_mode":
        return !!pane?.markMode;
      case "toggle_focus_mode":
        return app.focusMode;
      case "toggle_always_on_top":
        return app.alwaysOnTop;
      case "toggle_fullscreen":
        return app.fullscreen;
      case "toggle_vertical_tabs":
        return app.tabPosition !== "top";
    }
    return false;
  }

  /** Terminal commands are disabled on the settings tabs. */
  const needsTerm = (spec: ActionSpec) => !GLOBAL_COMMANDS.has(spec.command) && spec.command !== "multiple_actions" && spec.command !== "wt";

  // ---------- toolbar drag & drop (positions are in toolbarItems order) ----------
  let toolbarEl = $state<HTMLDivElement>();
  let tdrag = $state<{ from: number; to: number; x0: number; active: boolean } | null>(null);
  let suppressClick = false;

  /** Items in display order, with the dragged one at its drop position. */
  const shown = $derived.by(() => {
    const items = app.toolbarItems;
    const d = tdrag;
    if (!d?.active) return items;
    const list = [...items];
    const [moved] = list.splice(d.from, 1);
    list.splice(d.to, 0, moved);
    return list;
  });

  function tbDown(e: PointerEvent, it: ToolbarItem) {
    if (e.button !== 0) return;
    const from = app.toolbarItems.findIndex((x) => x.index === it.index);
    tdrag = { from, to: from, x0: e.clientX, active: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function tbMove(e: PointerEvent) {
    const d = tdrag;
    if (!d) return;
    if (!d.active && Math.abs(e.clientX - d.x0) < 6) return;
    d.active = true;
    // Drop position = number of other items whose middle is left of the pointer.
    const others = [...(toolbarEl?.querySelectorAll<HTMLElement>("[data-index]:not(.dragging)") ?? [])];
    d.to = others.filter((el) => {
      const r = el.getBoundingClientRect();
      return e.clientX > r.left + r.width / 2;
    }).length;
  }

  function tbUp() {
    const d = tdrag;
    tdrag = null;
    if (!d?.active) return;
    suppressClick = true;
    setTimeout(() => (suppressClick = false));
    app.moveToolbarItemTo(d.from, d.to);
  }

  function tbClick(it: ToolbarItem, off: boolean) {
    if (suppressClick || off) return;
    app.run(it.spec);
  }

  function onToolbarMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-index]");
    app.menu = toolbarMenu(app, btn ? Number(btn.dataset.index) : null, e.clientX, e.clientY);
  }
</script>

<header class="bar" data-tauri-drag-region bind:this={barEl}>
  {#if vertical}
    <div class="drag wtitle" data-tauri-drag-region role="presentation" oncontextmenu={onBarMenu}>
      {#if app.tab && curInfo}
        <span class="cur" class:belled={curInfo.bell}>
          {#if curInfo.bell}<span class="bell-glow"></span>{/if}
          <TabLead t={app.tab} f={curInfo} forceIcon />
        </span>
        <span class="wtext" data-tauri-drag-region>{app.tabTitle(app.tab)}</span>
      {/if}
    </div>
  {:else}
    <div class="tabs" role="tablist" tabindex="-1" data-tauri-drag-region bind:this={tabsEl} oncontextmenu={onBarMenu}>
      {#each app.tabs as t (t.id)}
        <TabItem {t} {drag} {variant} />
      {/each}
      <div class="new">
        <button title="New tab ({app.keymap.hint('new_tab') ?? ''})" onclick={() => app.newTab()}><Icon name="plus" /></button>
        <button
          bind:this={dropdownBtn}
          title="New tab with profile ({app.keymap.hint('open_new_tab_dropdown') ?? ''})"
          onclick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            app.menu = newTabMenu(app, r.left, r.bottom + 2);
          }}><Icon name="chevron" size={12} /></button
        >
      </div>
      <div class="drag" data-tauri-drag-region></div>
    </div>
  {/if}
  <div class="actions" role="toolbar" tabindex="-1" data-tauri-drag-region bind:this={toolbarEl} oncontextmenu={onToolbarMenu}>
    {#each shown as it (it.index)}
      {@const dragging = !!tdrag?.active && app.toolbarItems[tdrag.from]?.index === it.index}
      {#if it.separator}
        <span
          class="sep"
          class:dragging
          data-index={it.index}
          role="separator"
          onpointerdown={(e) => tbDown(e, it)}
          onpointermove={tbMove}
          onpointerup={tbUp}
          onpointercancel={() => (tdrag = null)}
        ></span>
      {:else}
        {@const hint = app.keymap.hint(it.spec)}
        {@const off = needsTerm(it.spec) && app.tab?.kind !== "term"}
        <button
          data-index={it.index}
          title={hint ? `${it.label} (${hint})` : it.label}
          class:on={isOn(it.spec)}
          class:off
          class:dragging
          aria-disabled={off}
          onpointerdown={(e) => tbDown(e, it)}
          onpointermove={tbMove}
          onpointerup={tbUp}
          onpointercancel={() => (tdrag = null)}
          onclick={() => tbClick(it, off)}><ProfileIcon icon={it.icon} size={14} /></button
        >
      {/if}
    {/each}
  </div>
  <div class="win">
    <button title="Minimize" onclick={() => win.minimize()}><Icon name="minimize" size={12} /></button>
    <button title={maximized ? "Restore" : "Maximize"} onclick={() => win.toggleMaximize()}
      ><Icon name={maximized ? "restore" : "maximize"} size={12} /></button
    >
    <button class="quit" title="Close" onclick={() => app.run("close_window")}><Icon name="win-close" size={12} /></button>
  </div>
</header>

<style>
  .bar {
    position: relative;
    display: flex;
    align-items: stretch;
    height: var(--tab-height, 34px);
    background: var(--chrome);
    /* Inset line instead of a border: the active tab paints over it and joins the terminal. */
    box-shadow: inset 0 -1px 0 var(--border);
    user-select: none;
  }
  :global(html:not(.focused)) .bar {
    background: var(--chrome-unfocused);
  }
  /* Accent baseline from each edge of the bar to the active tab, fading toward the bar ends. */
  .bar {
    --ind: var(--accent);
    --ind-bg: var(--chrome);
  }
  :global(html:not(.focused)) .bar {
    --ind: var(--muted);
    --ind-bg: var(--chrome-unfocused);
  }
  .bar::after {
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
  .bar:not([style*="--a0"])::after,
  :global(html[data-tab-indicator]:not([data-tab-indicator="outline"])) .bar::after {
    display: none;
  }
  .tabs {
    display: flex;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  button {
    display: grid;
    place-items: center;
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
  .new {
    position: relative;
    display: flex;
    align-items: center;
    padding: 0 4px;
    gap: 1px;
  }
  .new > button {
    padding: 5px;
  }
  .drag {
    flex: 1;
    min-width: 48px;
  }
  .wtitle {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 12px 0 6px;
    overflow: hidden;
    color: var(--muted);
    font-size: 12px;
  }
  .wtext {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* Active tab icon with its bell / progress animations. */
  .cur {
    position: relative;
    isolation: isolate;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    padding: 4px;
    border-radius: 4px;
    color: var(--fg);
  }
  .win {
    display: flex;
    align-items: stretch;
  }
  .win button {
    width: 44px;
    border-radius: 0;
  }
  .win .quit:hover {
    background: #e81123;
    color: #fff;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 8px;
  }
  .actions button.off {
    opacity: 0.35;
    cursor: default;
    color: var(--muted);
    background: none;
  }
  /* Wide hit area around a 1px line, so separators can be dragged. */
  .sep {
    align-self: stretch;
    width: 9px;
    cursor: grab;
    background: linear-gradient(var(--border), var(--border)) center / 1px 16px no-repeat;
  }
  .actions .dragging {
    opacity: 0.5;
    cursor: grabbing;
  }
  .actions button {
    padding: 5px;
  }
  .actions button.on {
    color: var(--accent);
    background: var(--hover);
  }
</style>
