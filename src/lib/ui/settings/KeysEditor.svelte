<script lang="ts">
  // Key bindings of the named commands ([keys]) and of the [[action]]s (their `keys`).
  import { COMMANDS, LEGACY_NAMES, describe, parseAction } from "../../commands";
  import { eventKey } from "../../keys";
  import { app } from "../../state.svelte";
  import { settingsDoc } from "../../settings/doc.svelte";
  import { bindings, comboSig, comboText, conflicts, keysValue, matchesQuery, set, type Binding, type Json, type PatchOp } from "../../settings/value";
  import Icon from "../Icon.svelte";

  let { json, query = "" }: { json: Json; query?: string } = $props();

  let onlyCustom = $state(false);
  let recording = $state<string | null>(null);

  const keysTable = $derived((json.keys ?? {}) as Json);
  const actions = $derived(Array.isArray(json.action) ? (json.action as Json[]) : []);
  const list = $derived(bindings(keysTable, actions, (a) => { const s = parseAction(a); return s ? describe(s) : "Action"; }));
  const clash = $derived(conflicts(list));
  const shown = $derived(list.filter((b) => (!onlyCustom || b.custom) && matchesQuery(query, b.label, b.id.startsWith("action:") ? "" : b.id, b.keys.join(" "))));

  /** Name used in [keys] for a command (an existing legacy name is kept). */
  const keyName = (id: string) => Object.keys(keysTable).find((k) => k === id || LEGACY_NAMES[k] === id) ?? id;

  function writeKeys(b: Binding, keys: string[] | null) {
    const ops: PatchOp[] = [];
    if (b.id.startsWith("action:")) {
      const i = Number(b.id.slice(7));
      ops.push(set(["action", i, "keys"], keys?.length ? keysValue(keys) : undefined));
    } else {
      // A legacy name is replaced by the current one; null: back to the default keys.
      const name = keyName(b.id);
      if (name !== b.id) ops.push(set(["keys", name], undefined));
      ops.push(set(["keys", b.id], keys === null ? undefined : keysValue(keys)));
    }
    void settingsDoc.patch(ops);
  }

  const isDefault = (b: Binding, keys: string[]) => !b.id.startsWith("action:") && JSON.stringify(keys) === JSON.stringify(COMMANDS[b.id]?.keys ?? []);

  function setKeys(b: Binding, keys: string[]) {
    writeKeys(b, isDefault(b, keys) ? null : keys);
  }

  function startRecord(id: string) {
    recording = id;
    app.keyCapture = true;
  }

  function stopRecord() {
    recording = null;
    app.keyCapture = false;
  }

  function onRecordKey(e: KeyboardEvent, b: Binding) {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) return stopRecord();
    const combo = comboText(e, eventKey(e));
    if (!combo) return;
    stopRecord();
    const sig = comboSig(combo);
    if (!b.keys.some((k) => comboSig(k) === sig)) setKeys(b, [...b.keys, combo]);
  }

  const conflictWith = (b: Binding, k: string) => {
    const ids = clash.get(comboSig(k) ?? "");
    if (!ids) return "";
    return ids.filter((id) => id !== b.id).map((id) => list.find((x) => x.id === id)?.label ?? id).join(", ");
  };
</script>

<div class="bar">
  <label><input type="checkbox" bind:checked={onlyCustom} /> Only customized</label>
  <span class="muted">{clash.size ? `${clash.size} conflicting combo${clash.size > 1 ? "s" : ""}` : ""}</span>
</div>

<div class="rows">
  {#each shown as b (b.id)}
    <div class="row" class:custom={b.custom}>
      <span class="label" title={b.id}>
        <span class="name">{b.label}</span>
        {#if b.custom}<span class="dot" title="Set in config file">●</span>{/if}
        {#if b.custom && !b.id.startsWith("action:")}
          <button title="Reset to default keys" onclick={() => writeKeys(b, null)}><Icon name="undo" size={12} /></button>
        {/if}
      </span>
      <span class="keys">
        {#each b.keys as k (k)}
          {@const other = conflictWith(b, k)}
          <span class="key" class:conflict={!!other} title={other ? `Also bound to: ${other}` : k}>
            {k}<button title="Remove" onclick={() => setKeys(b, b.keys.filter((x) => x !== k))}><Icon name="close" size={10} /></button>
          </span>
        {/each}
        {#if !b.keys.length}<span class="muted">Unbound</span>{/if}
        {#if recording === b.id}
          <!-- svelte-ignore a11y_autofocus -->
          <input class="rec" autofocus readonly placeholder="Press a combo… (Esc cancels)" onkeydown={(e) => onRecordKey(e, b)} onblur={stopRecord} />
        {:else}
          <button title="Add a key combo" onclick={() => startRecord(b.id)}><Icon name="plus" size={12} /></button>
        {/if}
      </span>
    </div>
  {/each}
</div>

<style>
  .bar {
    display: flex;
    gap: 16px;
    align-items: center;
    padding: 6px 0 10px;
    color: var(--muted);
  }
  .rows {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(180px, 280px) minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    padding: 4px 0;
    border-bottom: 1px solid var(--border);
  }
  .label {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    color: var(--accent);
    font-size: 9px;
  }
  .keys {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .key {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 1px 2px 1px 7px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--panel);
    font-family: var(--mono, monospace);
    font-size: 12px;
  }
  .conflict {
    border-color: var(--warn);
    color: var(--warn);
  }
  .rec {
    background: var(--term-bg);
    color: var(--fg);
    border: 1px solid var(--accent);
    border-radius: 4px;
    padding: 2px 6px;
    font: inherit;
    width: 220px;
  }
  button {
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
  }
  button:hover {
    color: var(--fg);
    background: var(--hover);
  }
  .muted {
    color: var(--muted);
  }
</style>
