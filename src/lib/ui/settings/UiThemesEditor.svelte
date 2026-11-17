<script lang="ts">
  // [[ui_theme]] tables (tab, tab row and window colors), selected with app_theme; built-in ones are read-only.
  import Fields from "./Fields.svelte";
  import UiThemePreview from "./UiThemePreview.svelte";
  import { onDestroy, untrack } from "svelte";
  import { app } from "../../state.svelte";
  import type { UiTheme } from "../../config";
  import { fieldsOf } from "../../config-schema";
  import { BUILTIN_UI_THEMES } from "../../ui-theme";
  import { settingsDoc } from "../../settings/doc.svelte";
  import { freshName } from "../../settings/pages";
  import { set, type Json } from "../../settings/value";
  import Icon from "../Icon.svelte";
  import SideTabs from "./SideTabs.svelte";

  let { json, query = "" }: { json: Json; query?: string } = $props();

  const themes = $derived(Array.isArray(json.ui_theme) ? (json.ui_theme as Json[]) : []);
  const names = $derived([...BUILTIN_UI_THEMES.map((t) => t.name), ...themes.map((t) => String(t.name ?? ""))]);
  const fields = fieldsOf("ui_theme")!;
  /** "c:<index>" (user theme) or "b:<name>" (built-in). */
  let selected = $state("");
  const current = $derived.by(() => {
    if (selected.startsWith("b:") && BUILTIN_UI_THEMES.some((t) => t.name === selected.slice(2))) return selected;
    if (selected.startsWith("c:") && themes[Number(selected.slice(2))]) return selected;
    return themes.length ? "c:0" : `b:${BUILTIN_UI_THEMES[0].name}`;
  });
  const builtin = $derived(current.startsWith("b:") ? (BUILTIN_UI_THEMES.find((t) => t.name === current.slice(2)) as unknown as Json) : null);
  const index = $derived(builtin ? -1 : Number(current.slice(2)));
  const theme = $derived(builtin ?? themes[index]);

  /** "Try": apply the edited theme to this window until turned off or the page is left. */
  let trying = $state(false);
  $effect(() => {
    const t = trying && theme ? (JSON.parse(JSON.stringify(theme)) as UiTheme) : null;
    untrack(() => app.previewUiTheme(t));
  });
  onDestroy(() => app.previewUiTheme(null));

  async function add(base: Json) {
    const at = themes.length;
    const copy = JSON.parse(JSON.stringify(base)) as Json;
    await settingsDoc.patch([{ op: "insert", path: ["ui_theme"], value: { ...copy, name: freshName(String(base.name ?? "My theme"), names) } }]);
    selected = `c:${at}`;
  }
</script>

<SideTabs groups={[{ label: "Custom", items: themes.map((t, i) => ({ key: `c:${i}`, label: String(t.name ?? "Unnamed") })) }, { label: "Built-in", items: BUILTIN_UI_THEMES.map((t) => ({ key: `b:${t.name}`, label: t.name })) }]} selected={current} onselect={(k) => (selected = k)} onadd={() => void add({ name: "My theme", window: { application_theme: "dark" } })}>
<div class="bar">
  <button class:on={trying} title="Apply this theme to the window without saving" onclick={() => (trying = !trying)}>
    <Icon name="sparkle" size={12} /> {trying ? "Stop trying" : "Try"}
  </button>
  {#if builtin}
    <button title="Copy this theme into a new custom theme" onclick={() => void add(builtin)}><Icon name="duplicate" size={12} /> Duplicate to customize</button>
  {:else}
    <button onclick={() => void add(theme)}><Icon name="duplicate" size={12} /> Duplicate</button>
    <button class="danger" onclick={() => void settingsDoc.patch([{ op: "remove", path: ["ui_theme", index] }])}><Icon name="trash" size={12} /> Delete</button>
  {/if}
</div>

{#if theme}
  <div class="sticky"><UiThemePreview theme={theme as unknown as UiTheme} /></div>
  <p class="muted">{builtin ? "Built-in theme: read-only. Duplicate it to change it. " : ""}Select it with <b>app_theme</b> (Appearance).</p>
  {#key current}
    <Fields
      section="ui_theme"
      keys={Object.keys(fields)}
      {fields}
      values={theme}
      write={(rel, v) => void settingsDoc.patch([set(["ui_theme", index, ...rel], v)])}
      tomlPath={["ui_theme", index]}
      {query}
      readonly={!!builtin}
    />
  {/key}
{/if}

</SideTabs>

<style>
  .bar {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    padding-bottom: 10px;
  }
  button {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--fg);
    cursor: pointer;
    font: inherit;
    padding: 4px 10px;
  }
  button:hover {
    background: var(--hover);
  }
  .on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .danger:hover {
    color: var(--danger);
  }
  .muted {
    color: var(--muted);
    margin: 0;
  }
  /* Keep the preview visible while scrolling the fields (offsets .page top padding). */
  .sticky {
    position: sticky;
    top: -12px;
    z-index: 2;
    background: var(--term-bg);
    padding-top: 8px;
  }
</style>
