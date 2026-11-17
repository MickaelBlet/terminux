<script lang="ts">
  // One setting: label, description and an input for its value (unset = falls back to `fallback`).
  import { fromPickerHex, toPickerHex } from "../../color-swatch";
  import { fromNumber, fromSelect, isTable, labelOf, show, toSelect, type Control } from "../../settings/value";
  import Icon from "../Icon.svelte";

  let {
    name,
    doc = "",
    control,
    value,
    fallback,
    onchange,
    ontoml,
    readonly = false,
  }: {
    name: string;
    doc?: string;
    control: Control;
    value: unknown;
    fallback?: unknown;
    /** New value; undefined removes the key. */
    onchange: (v: unknown) => void;
    /** Open the TOML view at this key. */
    ontoml?: () => void;
    /** Show the value only (built-in schemes and themes). */
    readonly?: boolean;
  } = $props();

  const set = $derived(value !== undefined);
  const shown = $derived(value ?? fallback);
  const listId = `dl-${Math.random().toString(36).slice(2)}`;

  let draftKey = $state("");
  let draftVal = $state("");
  let draftItem = $state("");

  const list = $derived(Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : []);
  const map = $derived(isTable(value) ? Object.entries(value).map(([k, v]) => [k, String(v)] as const) : []);

  function commitText(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value;
    if (v !== toSelect(value)) onchange(v === "" ? undefined : v);
  }

  function commitNumber(e: Event) {
    const v = fromNumber((e.currentTarget as HTMLInputElement).value);
    if (v !== value) onchange(v);
  }

  function addItem() {
    const v = draftItem.trim();
    if (!v) return;
    onchange([...list, v]);
    draftItem = "";
  }

  function addPair() {
    const k = draftKey.trim();
    if (!k) return;
    onchange({ ...(isTable(value) ? value : {}), [k]: draftVal });
    draftKey = draftVal = "";
  }

  function withoutKey(k: string) {
    const next = { ...(isTable(value) ? value : {}) };
    delete next[k];
    onchange(Object.keys(next).length ? next : undefined);
  }

  /** Text / color fields with known values: a plain select, plus "Custom…" for any other value. */
  const CUSTOM = "\u0000custom";
  const choices = $derived(control.kind === "text" || control.kind === "color" ? control.suggestions : undefined);
  let customMode = $state(false);
  const isCustom = $derived(customMode || (set && !!choices && !choices.includes(toSelect(value))));
  function pick(e: Event & { currentTarget: HTMLSelectElement }) {
    const v = e.currentTarget.value;
    customMode = v === CUSTOM;
    if (customMode) queueMicrotask(() => document.getElementById(listId + "-custom")?.focus());
    else onchange(fromSelect(v));
  }

  const hex = (v: unknown) => (typeof v === "string" && /^#[0-9a-f]{3,8}$/i.test(v) ? v : "");
</script>

{#snippet choiceSelect(opts: string[], customLabel: string)}
  <select id={listId + "-in"} value={isCustom ? CUSTOM : toSelect(value)} onchange={pick}>
    <option value="">Default{fallback !== undefined ? ` (${show(fallback)})` : ""}</option>
    {#each opts as o (o)}<option value={o}>{o}</option>{/each}
    <option value={CUSTOM}>{customLabel}</option>
  </select>
{/snippet}

<div class="field" class:set={set && !readonly}>
  <div class="head">
    <label class="name" for={listId + "-in"} title={name}>{labelOf(name)}</label>
    {#if set && !readonly}
      <span class="dot" title="Set in config file">●</span>
      <button class="reset" title="Reset to default (remove from config.toml)" onclick={() => { customMode = false; onchange(undefined); }}><Icon name="undo" size={12} /></button>
    {/if}
  </div>
  {#if doc}<div class="doc">{doc}</div>{/if}
  <fieldset class="ctl" disabled={readonly}>
    {#if control.kind === "toggle"}
      <label class="switch">
        <input id={listId + "-in"} type="checkbox" checked={shown === true} onchange={(e) => onchange(e.currentTarget.checked)} />
        <span>{shown === true ? "On" : "Off"}{set ? "" : " (default)"}</span>
      </label>
    {:else if control.kind === "select"}
      <select id={listId + "-in"} value={toSelect(value)} onchange={(e) => onchange(fromSelect(e.currentTarget.value))}>
        <option value="">Default{fallback !== undefined ? ` (${control.labels?.[String(fallback)] ?? show(fallback)})` : ""}</option>
        {#each control.options as o (o)}<option value={o}>{control.labels?.[o] ?? o}</option>{/each}
        {#if set && !control.options.includes(toSelect(value))}<option value={toSelect(value)}>{show(value)}</option>{/if}
      </select>
    {:else if control.kind === "number"}
      <input id={listId + "-in"} type="number" step="any" value={typeof value === "number" ? value : ""} placeholder={show(fallback)} onchange={commitNumber} />
    {:else if control.kind === "text"}
      {#if choices && !isTable(value) && !Array.isArray(value)}
        {@render choiceSelect(choices, "Custom…")}
        {#if isCustom}<input id={listId + "-custom"} type="text" value={toSelect(value)} placeholder={show(fallback)} onchange={commitText} />{/if}
      {:else}
        <input id={listId + "-in"} type="text" value={isTable(value) || Array.isArray(value) ? show(value) : toSelect(value)} placeholder={show(fallback)} onchange={commitText} disabled={isTable(value) || Array.isArray(value)} />
      {/if}
      {#if (isTable(value) || Array.isArray(value)) && !readonly}<button class="link" onclick={ontoml}>Edit in TOML</button>{/if}
    {:else if control.kind === "color"}
      <span class="color">
        <input type="color" value={toPickerHex(hex(shown) || "#000000")} oninput={(e) => onchange(fromPickerHex(e.currentTarget.value, hex(value) || "#000000"))} disabled={!!shown && !hex(shown)} />
        {#if choices}
          {@render choiceSelect(choices, "Color…")}
          {#if isCustom}<input id={listId + "-custom"} type="text" value={toSelect(value)} placeholder="#rrggbb" onchange={commitText} />{/if}
        {:else}
          <input id={listId + "-in"} type="text" value={toSelect(value)} placeholder={show(fallback)} onchange={commitText} />
        {/if}
      </span>
    {:else if control.kind === "list"}
      <div class="chips">
        {#each list as item, i (i)}
          <span class="chip">{item}<button title="Remove" onclick={() => onchange(list.length > 1 ? list.filter((_, j) => j !== i) : undefined)}><Icon name="close" size={10} /></button></span>
        {/each}
        {#if !set && Array.isArray(fallback)}<span class="muted">{fallback.join(", ") || "(empty)"}</span>{/if}
        <input id={listId + "-in"} type="text" placeholder="Add…" bind:value={draftItem} onkeydown={(e) => e.key === "Enter" && addItem()} onblur={addItem} />
      </div>
    {:else if control.kind === "map"}
      <div class="map">
        {#each map as [k, v] (k)}
          <div class="pair">
            <code>{k}</code>
            <input type="text" value={v} onchange={(e) => onchange({ ...(value as object), [k]: e.currentTarget.value })} />
            <button title="Remove" onclick={() => withoutKey(k)}><Icon name="close" size={10} /></button>
          </div>
        {/each}
        <div class="pair">
          <input id={listId + "-in"} type="text" placeholder="Name" bind:value={draftKey} />
          <input type="text" placeholder="Value" bind:value={draftVal} onkeydown={(e) => e.key === "Enter" && addPair()} />
          <button title="Add" onclick={addPair}><Icon name="plus" size={10} /></button>
        </div>
      </div>
    {:else}
      <span class="muted value">{set ? show(value) : fallback !== undefined ? `${show(fallback)} (default)` : "Not set"}</span>
      {#if !readonly}<button class="link" onclick={ontoml}>Edit in TOML</button>{/if}
    {/if}
  </fieldset>
</div>

<style>
  .field {
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .name {
    font-weight: 500;
    color: var(--fg);
  }
  .dot {
    color: var(--accent);
    font-size: 9px;
  }
  .doc {
    color: var(--muted);
    font-size: 12px;
    margin: 2px 0 6px;
  }
  .ctl {
    border: none;
    margin: 0;
    padding: 0;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  input[type="text"],
  input[type="number"],
  select {
    background: var(--term-bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 6px;
    font: inherit;
    min-width: 0;
    width: min(360px, 100%);
  }
  fieldset:disabled input,
  fieldset:disabled select {
    opacity: 0.85;
    cursor: default;
  }
  input:focus,
  select:focus {
    outline: 1px solid var(--accent);
  }
  input::placeholder {
    color: var(--muted);
    opacity: 0.7;
  }
  .switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    color: var(--muted);
  }
  .switch input {
    width: 16px;
    height: 16px;
  }
  .color {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }
  .color input[type="color"] {
    width: 28px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: none;
  }
  .color input[type="text"] {
    width: 160px;
  }
  .color select {
    width: 200px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .chips input {
    width: 140px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px 2px 8px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--panel);
  }
  .map {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .pair {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .pair code {
    min-width: 120px;
  }
  .pair input {
    width: 180px;
  }
  button {
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--muted);
    cursor: pointer;
    padding: 2px 4px;
    display: inline-flex;
    align-items: center;
  }
  button:hover {
    color: var(--fg);
    background: var(--hover);
  }
  .link {
    color: var(--accent);
    font: inherit;
  }
  .muted {
    color: var(--muted);
  }
  .value {
    font-family: var(--mono, monospace);
    font-size: 12px;
    max-width: 480px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
