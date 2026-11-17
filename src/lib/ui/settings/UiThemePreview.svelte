<script lang="ts">
  // Miniature window drawn with a [[ui_theme]]'s CSS variables (same ones the app uses).
  import type { UiTheme } from "../../config";
  import { UI_THEME_VARS, tabIndicator, uiThemeVars } from "../../ui-theme";
  import { app } from "../../state.svelte";
  import Icon from "../Icon.svelte";

  let { theme }: { theme: UiTheme } = $props();

  const mode = $derived(String(theme.window?.application_theme ?? "system").toLowerCase());
  const dark = $derived(mode === "dark" ? true : mode === "light" ? false : app.dark);
  /** Declared by the .theme-dark / .theme-light palettes, so they don't inherit from the window's theme. */
  const PALETTE = new Set(["--accent", "--accent-dim", "--term-bg", "--fg", "--muted", "--panel", "--border", "--hover", "--warn", "--danger"]);
  const style = $derived.by(() => {
    const vars = uiThemeVars(theme);
    // Unset the other variables: the window's own theme sets them on <html>.
    return UI_THEME_VARS.filter((k) => vars[k] || !PALETTE.has(k))
      .map((k) => `${k}:${vars[k] ?? "initial"}`)
      .join(";");
  });
  const color = (v: string | undefined, fallback: string) => {
    const k = (v ?? "").toLowerCase();
    return !v ? fallback : k === "terminalbackground" ? "var(--term-bg)" : k === "accent" ? "var(--accent)" : v;
  };
  const activeBg = $derived(color(theme.tab?.background, "var(--tab-active)"));
  const inactiveBg = $derived(color(theme.tab?.unfocused_background, "transparent"));
  const close = $derived(String(theme.tab?.show_close_button ?? "hover").toLowerCase().replace(/_/g, ""));
  const icons = $derived(String(theme.tab?.icon_style ?? "default").toLowerCase());
  const tabs = ["bash", "config.toml", "ssh server"];
</script>

<div class="win {dark ? 'theme-dark' : 'theme-light'} ind-{tabIndicator(theme)}" class:rainbow={theme.window?.rainbow_frame} {style}>
  <div class="row">
    {#each tabs as t, i (t)}
      {@const active = i === 0}
      <div class="tab" class:active style:background={active ? activeBg : inactiveBg} style:color={active ? (theme.tab?.foreground ?? null) : (theme.tab?.unfocused_foreground ?? null)}>
        {#if icons !== "hidden"}<span class="ico" class:mono={icons === "monochrome"}><Icon name={i === 1 ? "gear" : "terminal"} size={11} /></span>{/if}
        <span class="title">{t}</span>
        {#if close === "always" || (close === "activeonly" && active) || (close === "hover" && i === 1)}<Icon name="close" size={10} />{/if}
      </div>
    {/each}
    <span class="plus"><Icon name="plus" size={11} /></span>
  </div>
  <div class="body">
    <div class="pane active">
      <div><span class="acc">user@host</span>:~$ ls</div>
      <div class="dim">docs&nbsp; src&nbsp; README.md</div>
    </div>
    <div class="divider"></div>
    <div class="pane">
      <div class="menu">
        <div class="item hover">New tab</div>
        <div class="item">Split pane <span class="dim">Alt+Shift+D</span></div>
        <div class="item warn">Warning</div>
        <div class="item danger">Close window</div>
      </div>
    </div>
  </div>
</div>

<style>
  .win {
    font-family: var(--ui-font, "JetBrains Mono", system-ui, sans-serif);
    font-size: var(--ui-font-size, 12.5px);
    color: var(--fg);
    background: var(--term-bg);
    border: 1px solid var(--frame-focus);
    border-radius: 6px;
    overflow: hidden;
    margin: 4px 0 12px;
    max-width: 640px;
    user-select: none;
  }
  .win.rainbow {
    border: 2px solid #61afef;
  }
  .row {
    display: flex;
    align-items: stretch;
    height: var(--tab-height, 34px);
    background: var(--chrome);
    box-shadow: inset 0 -1px 0 var(--border);
  }
  .tab {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    width: 150px;
    padding: 0 8px 0 10px;
    margin-top: 4px;
    color: var(--muted);
    border-radius: var(--tab-radius, 6px) var(--tab-radius, 6px) 0 0;
  }
  .tab.active {
    color: var(--fg);
    font-weight: 500;
  }
  .tab .title {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .ico {
    display: inline-flex;
    color: var(--accent);
  }
  .ico.mono {
    color: inherit;
  }
  /* Indicators, as in TabItem.svelte. */
  .tab.active::before {
    content: "";
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
  }
  .ind-outline .tab.active::before {
    border: 1.5px solid var(--accent);
    border-bottom: none;
  }
  .ind-underline .tab.active::before {
    top: auto;
    height: 2px;
    border-radius: 0;
    background: var(--accent);
  }
  .ind-filled .tab.active::before {
    background: var(--accent);
    opacity: 0.25;
  }
  .plus {
    display: grid;
    place-items: center;
    padding: 0 10px;
    color: var(--muted);
  }
  .body {
    display: flex;
    min-height: 120px;
    padding: 4px;
    gap: 0;
  }
  .pane {
    flex: 1;
    border: 2px solid transparent;
    border-radius: 4px;
    padding: 6px 8px;
    font-family: "JetBrains Mono", monospace;
    font-size: 12px;
  }
  .pane.active {
    border-color: var(--pane-active, var(--accent-dim));
  }
  .divider {
    flex: 0 0 var(--pane-divider-width, 4px);
    background: var(--pane-divider, var(--border));
  }
  .acc {
    color: var(--accent);
  }
  .dim {
    color: var(--muted);
  }
  .menu {
    font-family: var(--ui-font, "JetBrains Mono", system-ui, sans-serif);
    font-size: var(--ui-font-size, 12.5px);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 4px;
    box-shadow: 0 4px 12px var(--shadow);
    width: max-content;
  }
  .item {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    white-space: nowrap;
    padding: 3px 8px;
    border-radius: 4px;
  }
  .item.hover {
    background: var(--hover);
  }
  .warn {
    color: var(--warn);
  }
  .danger {
    color: var(--danger);
  }
</style>
