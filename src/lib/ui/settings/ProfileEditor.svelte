<script lang="ts">
  // [defaults] or one [[profile]]: General / Appearance / Advanced sub-pages.
  import Fields from "./Fields.svelte";
  import { PROFILE_FIELDS, SETTINGS_FIELDS } from "../../config-schema";
  import { profileGroups } from "../../settings/pages";
  import type { Json, Seg } from "../../settings/value";

  let {
    defaults,
    values,
    fallback,
    write,
    tomlPath,
    options,
    query = "",
  }: {
    defaults: boolean;
    values: Json | undefined;
    fallback: Json;
    write: (rel: Seg[], v: unknown) => void;
    tomlPath: Seg[];
    options: Record<string, string[]>;
    query?: string;
  } = $props();

  const groups = $derived(profileGroups(defaults));
  let current = $state("general");
  const group = $derived(groups.find((g) => g.id === current) ?? groups[0]);
</script>

{#if query}
  {#each groups as g (g.id)}
    <Fields section={defaults ? "defaults" : "profile"} keys={g.keys} fields={defaults ? SETTINGS_FIELDS : PROFILE_FIELDS} {values} {fallback} {write} {tomlPath} {options} {query} />
  {/each}
{:else}
  <nav class="subtabs">
    {#each groups as g (g.id)}
      <button class:active={g.id === group.id} onclick={() => (current = g.id)}>{g.label}</button>
    {/each}
  </nav>
  <Fields section={defaults ? "defaults" : "profile"} keys={group.keys} fields={defaults ? SETTINGS_FIELDS : PROFILE_FIELDS} {values} {fallback} {write} {tomlPath} {options} />
{/if}

<style>
  .subtabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 4px;
  }
  .subtabs button {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--muted);
    cursor: pointer;
    font: inherit;
    padding: 6px 10px;
  }
  .subtabs button:hover {
    color: var(--fg);
  }
  .subtabs .active {
    color: var(--fg);
    border-bottom-color: var(--accent);
  }
</style>
