<script lang="ts">
  // Settings of one table: a Field per key; known sub-tables (font, unfocused_appearance) nest.
  import Fields from "./Fields.svelte";
  import Field from "./Field.svelte";
  import { fieldsOf, type Field as FieldDef } from "../../config-schema";
  import { controlFor, isTable, labelOf, matchesQuery, type Control, type Json, type Seg } from "../../settings/value";
  import { settingsDoc } from "../../settings/doc.svelte";

  let {
    section,
    keys,
    fields,
    values,
    fallback = {},
    write,
    tomlPath,
    options = {},
    query = "",
    labels = {},
    readonly = false,
  }: {
    /** Schema section ("", "defaults", "profile", "profile.font", ...). */
    section: string;
    keys: string[];
    fields: Record<string, FieldDef>;
    values: Json | undefined;
    fallback?: Json;
    write: (rel: Seg[], v: unknown) => void;
    /** Path of this table in config.toml (for "Edit in TOML"). */
    tomlPath: Seg[];
    /** Choices of fields whose values come from the config (schemes, profiles, ...). */
    options?: Record<string, string[]>;
    query?: string;
    /** Display names of option values; a key listed here is a strict select. */
    labels?: Record<string, Record<string, string>>;
    readonly?: boolean;
  } = $props();

  const sub = (key: string) => fieldsOf(section ? `${section}.${key}` : key);
  const nested = (key: string) => fields[key]?.type === "table" && key !== "env" && sub(key);

  function control(key: string): Control {
    const opts = options[key];
    const c = controlFor(section, key, fields[key]);
    if (!opts) return c;
    if (labels[key]) return { kind: "select", options: opts, labels: labels[key] };
    if (c.kind === "text" || c.kind === "color") return { ...c, suggestions: opts };
    return { kind: "select", options: opts };
  }

  const shownKeys = $derived(keys.filter((k) => fields[k] && (nested(k) || matchesQuery(query, k, fields[k].doc))));
  const v = (k: string) => (isTable(values) ? values[k] : undefined);
  const scheme = $derived(v("color_scheme"));
</script>

{#each shownKeys as key (key)}
  {@const subFields = nested(key)}
  {#if subFields}
    {@const subValues = v(key)}
    {#if isTable(subValues) || subValues === undefined}
      <div class="sub">
        <h4>{labelOf(key)}</h4>
        <Fields
          section={`${section}.${key}`}
          keys={Object.keys(subFields)}
          fields={subFields}
          values={subValues as Json | undefined}
          fallback={isTable(fallback[key]) ? (fallback[key] as Json) : {}}
          write={(rel, val) => write([key, ...rel], val)}
          tomlPath={[...tomlPath, key]}
          {options}
          {labels}
          {query}
          {readonly}
        />
      </div>
    {:else}
      <Field name={key} doc={fields[key].doc} control={{ kind: "toml" }} value={subValues} {readonly} onchange={(val) => write([key], val)} ontoml={() => settingsDoc.setView("toml", [...tomlPath, key])} />
    {/if}
  {:else if key === "color_scheme" && isTable(scheme)}
    <div class="sub">
      <h4>Color scheme {#if !readonly}<button class="link" onclick={() => write([key], (scheme as Json).dark ?? (scheme as Json).light)}>Use one scheme</button>{/if}</h4>
      {#each ["light", "dark"] as mode (mode)}
        <Field name={mode} control={control(key)} value={(scheme as Json)[mode]} {readonly} onchange={(val) => write([key, mode], val)} />
      {/each}
    </div>
  {:else}
    <Field
      name={key}
      doc={fields[key].doc}
      control={control(key)}
      value={v(key)}
      fallback={fallback[key]}
      {readonly}
      onchange={(val) => write([key], val)}
      ontoml={() => settingsDoc.setView("toml", [...tomlPath, key])}
    />
    {#if key === "color_scheme" && typeof scheme === "string" && !readonly}
      <button class="link split" onclick={() => write([key], { light: scheme, dark: scheme })}>Use different schemes for light and dark themes</button>
    {/if}
  {/if}
{/each}

<style>
  .sub {
    margin: 8px 0 4px;
    padding: 4px 0 0 12px;
    border-left: 2px solid var(--border);
  }
  h4 {
    margin: 6px 0 0;
    font-size: 13px;
    color: var(--fg);
    display: flex;
    gap: 12px;
    align-items: baseline;
  }
  .link {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: normal;
    padding: 0;
  }
  .split {
    margin: 4px 0 0;
  }
</style>
