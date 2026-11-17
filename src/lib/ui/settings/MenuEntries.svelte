<script lang="ts">
  // Entries of new_tab_menu (folders nest): edited as a whole list, written back by the parent.
  import MenuEntries from "./MenuEntries.svelte";
  import { isTable, type Json } from "../../settings/value";
  import Icon from "../Icon.svelte";
  import { COMMANDS } from "../../commands";

  let { entries, onchange, profiles, actions }: { entries: Json[]; onchange: (e: Json[]) => void; profiles: string[]; actions: string[] } = $props();

  const TYPES = ["profile", "folder", "separator", "match_profiles", "remaining_profiles", "action"];
  const SOURCES = ["", "wsl", "ssh", "powershell", "windows"];

  const update = (i: number, patch: Json) => {
    const next = entries.map((e, j) => (j === i ? { ...e, ...patch } : e));
    for (const [k, v] of Object.entries(patch)) if (v === undefined || v === "") delete next[i][k];
    onchange(next);
  };
  const move = (i: number, d: number) => {
    const next = [...entries];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onchange(next);
  };
  const str = (v: unknown) => (typeof v === "string" ? v : "");
</script>

<div class="entries">
  {#each entries as e, i (i)}
    <div class="entry">
      <select value={str(e.type)} onchange={(ev) => onchange(entries.map((x, j) => (j === i ? { type: ev.currentTarget.value } : x)))}>
        {#each TYPES as t (t)}<option value={t}>{t.replace(/_/g, " ")}</option>{/each}
      </select>
      {#if e.type === "profile"}
        <select value={str(e.profile)} onchange={(ev) => update(i, { profile: ev.currentTarget.value })}>
          <option value="">Profile…</option>
          {#each profiles as p (p)}<option value={p}>{p}</option>{/each}
        </select>
      {:else if e.type === "action"}
        <select value={str(e.id)} onchange={(ev) => update(i, { id: ev.currentTarget.value })}>
          <option value="">Action…</option>
          {#if actions.length}
            <optgroup label="User actions">
              {#each actions as a (a)}<option value={a}>{a}</option>{/each}
            </optgroup>
          {/if}
          <optgroup label="Commands">
            {#each Object.entries(COMMANDS) as [name, c] (name)}<option value={name}>{c.label}</option>{/each}
          </optgroup>
        </select>
      {:else if e.type === "folder"}
        <input placeholder="Folder name" value={str(e.name)} onchange={(ev) => update(i, { name: ev.currentTarget.value })} />
        <label><input type="checkbox" checked={e.inline === true} onchange={(ev) => update(i, { inline: ev.currentTarget.checked || undefined })} /> inline</label>
        <label><input type="checkbox" checked={e.allow_empty === true} onchange={(ev) => update(i, { allow_empty: ev.currentTarget.checked || undefined })} /> allow empty</label>
      {:else if e.type === "match_profiles"}
        <input placeholder="Name" value={str(e.name)} onchange={(ev) => update(i, { name: ev.currentTarget.value })} />
        <select value={str(e.source)} onchange={(ev) => update(i, { source: ev.currentTarget.value })}>
          {#each SOURCES as s (s)}<option value={s}>{s || "Any source"}</option>{/each}
        </select>
        <input placeholder="Command line" value={str(e.commandline)} onchange={(ev) => update(i, { commandline: ev.currentTarget.value })} />
      {/if}
      {#if e.type === "profile" || e.type === "folder" || e.type === "action"}
        <input class="icon" placeholder="Icon" value={str(e.icon)} onchange={(ev) => update(i, { icon: ev.currentTarget.value })} />
      {/if}
      <span class="tools">
        <button title="Move up" disabled={i === 0} onclick={() => move(i, -1)}><Icon name="up" size={12} /></button>
        <button title="Move down" disabled={i === entries.length - 1} onclick={() => move(i, 1)}><Icon name="down" size={12} /></button>
        <button title="Remove" onclick={() => onchange(entries.filter((_, j) => j !== i))}><Icon name="trash" size={12} /></button>
      </span>
    </div>
    {#if e.type === "folder"}
      <div class="nested">
        <MenuEntries entries={Array.isArray(e.entries) ? (e.entries as Json[]).filter(isTable) : []} onchange={(sub) => update(i, { entries: sub })} {profiles} {actions} />
      </div>
    {/if}
  {/each}
  <button class="add" onclick={() => onchange([...entries, { type: "profile" }])}><Icon name="plus" size={12} /> Add entry</button>
</div>

<style>
  .entries {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .entry {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }
  .nested {
    margin-left: 18px;
    padding-left: 10px;
    border-left: 2px solid var(--border);
  }
  select,
  input:not([type="checkbox"]) {
    background: var(--term-bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 6px;
    font: inherit;
  }
  select:focus,
  input:not([type="checkbox"]):focus {
    outline: 1px solid var(--accent);
  }
  .icon {
    width: 90px;
  }
  label {
    color: var(--muted);
    display: inline-flex;
    gap: 4px;
    align-items: center;
  }
  .tools {
    display: inline-flex;
  }
  button {
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    padding: 2px 4px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: inherit;
  }
  button:hover:not(:disabled) {
    color: var(--fg);
  }
  button:disabled {
    opacity: 0.4;
  }
  .add {
    align-self: flex-start;
    color: var(--accent);
  }
</style>
