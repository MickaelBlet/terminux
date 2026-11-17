<script lang="ts">
  // [[scheme]] tables: edit user schemes; built-in ones are shown read-only and can be duplicated.
  import Field from "./Field.svelte";
  import { THEME_KEYS, THEME_KEY_PAIRS, defaultColor } from "../../config-schema";
  import { BUILTIN_SCHEMES } from "../../schemes";
  import { settingsDoc } from "../../settings/doc.svelte";
  import { freshName } from "../../settings/pages";
  import { matchesQuery, set, type Json } from "../../settings/value";
  import Icon from "../Icon.svelte";
  import SideTabs from "./SideTabs.svelte";

  let { json, query = "" }: { json: Json; query?: string } = $props();

  const schemes = $derived(Array.isArray(json.scheme) ? (json.scheme as Json[]) : []);
  const builtins = Object.keys(BUILTIN_SCHEMES);
  const names = $derived([...builtins, ...schemes.map((s) => String(s.name ?? ""))]);
  /** "c:<index>" (user scheme) or "b:<name>" (built-in). */
  let selected = $state("");
  const current = $derived.by(() => {
    if (selected.startsWith("b:") && BUILTIN_SCHEMES[selected.slice(2)]) return selected;
    const i = Number(selected.slice(2));
    if (selected.startsWith("c:") && schemes[i]) return selected;
    return schemes.length ? "c:0" : `b:${builtins[0]}`;
  });
  const builtin = $derived(current.startsWith("b:") ? current.slice(2) : null);
  const index = $derived(builtin === null ? Number(current.slice(2)) : -1);
  const scheme = $derived(builtin !== null ? fromBuiltin(builtin, builtin) : schemes[index]);

  const XTERM: Record<string, string> = { cursor_color: "cursor", selection_background: "selectionBackground", purple: "magenta", bright_purple: "brightMagenta" };
  const camel = (k: string) => XTERM[k] ?? k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

  /** A built-in scheme as a [[scheme]] table (Windows Terminal key names). */
  function fromBuiltin(name: string, as: string): Json {
    const t = BUILTIN_SCHEMES[name] as Record<string, string | undefined>;
    const out: Json = { name: as };
    for (const k of THEME_KEYS) {
      const v = t[camel(k)];
      if (v) out[k] = v;
    }
    return out;
  }

  async function add(table: Json) {
    const at = schemes.length;
    await settingsDoc.patch([{ op: "insert", path: ["scheme"], value: table }]);
    selected = `c:${at}`;
  }

  const duplicate = (name: string) => add(fromBuiltin(name, freshName(name, names)));
  const color = (s: Json | undefined, k: string) => (typeof s?.[k] === "string" ? (s[k] as string) : defaultColor(k));
  const ANSI = ["black", "red", "green", "yellow", "blue", "purple", "cyan", "white"];
</script>

<SideTabs groups={[{ label: "Custom", items: schemes.map((s, i) => ({ key: `c:${i}`, label: String(s.name ?? `Scheme ${i + 1}`) })) }, { label: "Built-in", items: builtins.map((n) => ({ key: `b:${n}`, label: n })) }]} selected={current} onselect={(k) => (selected = k)} onadd={() => void add(fromBuiltin("Terminux", freshName("New scheme", names)))} addTitle="New scheme from Terminux">
<div class="bar">
  {#if builtin}
    <button onclick={() => void duplicate(builtin)} title={`Copy “${builtin}” into a new custom scheme`}><Icon name="duplicate" size={12} /> Duplicate to customize</button>
  {/if}
  {#if builtin === null && scheme}
    <button onclick={() => void add({ ...scheme, name: freshName(String(scheme.name ?? "Scheme"), names) })}><Icon name="duplicate" size={12} /> Duplicate</button>
    <button class="danger" onclick={() => void settingsDoc.patch([{ op: "remove", path: ["scheme", index] }])}><Icon name="trash" size={12} /> Delete</button>
  {/if}
</div>

{#if scheme}
  <div class="sticky">
  <div class="preview" style:background={color(scheme, "background")} style:color={color(scheme, "foreground")}>
    <div>user@host:~$ <span style:background={color(scheme, "cursor_color")}>&nbsp;</span> <span style:background={color(scheme, "selection_background")} style:color={typeof scheme.selection_foreground === "string" ? scheme.selection_foreground : undefined}>selected</span></div>
    <div class="ansi">
      {#each ANSI as c (c)}<span style:color={color(scheme, c)}>{c}</span>{/each}
    </div>
    <div class="ansi">
      {#each ANSI as c (c)}<span style:color={color(scheme, `bright_${c}`)}>{c}</span>{/each}
    </div>
  </div>
  </div>
  {#if builtin !== null}
    <p class="muted">Built-in scheme: read-only. Duplicate it to change its colors.</p>
  {:else}
    <Field name="name" doc="Used by color_scheme in profiles." control={{ kind: "text" }} value={scheme.name} onchange={(v) => void settingsDoc.patch([set(["scheme", index, "name"], v)])} />
  {/if}
  <div class="grid">
    {#each THEME_KEY_PAIRS.filter((p) => p.some((k) => matchesQuery(query, k))).flat() as k (k)}
      <Field name={k} control={{ kind: "color" }} value={scheme[k]} fallback={defaultColor(k)} readonly={builtin !== null} onchange={(v) => void settingsDoc.patch([set(["scheme", index, k], v)])} />
    {/each}
  </div>
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
  .danger:hover {
    color: var(--danger);
  }
  .preview {
    font-family: var(--mono, monospace);
    padding: 10px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
    margin-bottom: 6px;
    line-height: 1.6;
  }
  /* Keep the preview visible while scrolling the fields (offsets .page top padding). */
  .sticky {
    position: sticky;
    top: -12px;
    z-index: 2;
    background: var(--term-bg);
    padding: 12px 0 4px;
  }
  .ansi {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 420px));
    column-gap: 24px;
  }
  .muted {
    color: var(--muted);
  }
</style>
