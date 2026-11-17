<script lang="ts">
  // [[action]] tables: custom commands for the palette, keys, toolbar and new tab menu.
  import Field from "./Field.svelte";
  import ListPicker from "./ListPicker.svelte";
  import { ACTION_COMMANDS, fieldsOf } from "../../config-schema";
  import { describe, parseAction, toArray } from "../../commands";
  import { settingsDoc } from "../../settings/doc.svelte";
  import { set, type Json } from "../../settings/value";
  import Icon from "../Icon.svelte";

  let { json }: { json: Json } = $props();

  const actions = $derived(Array.isArray(json.action) ? (json.action as Json[]) : []);
  let selected = $state(0);
  const index = $derived(Math.max(0, Math.min(selected, actions.length - 1)));
  const action = $derived(actions[index]);
  const META = ["name", "id", "icon", "command", "keys", "commands"];
  const ARGS = Object.keys(fieldsOf("action")!).filter((k) => !META.includes(k));
  const args = $derived(action ? Object.keys(action).filter((k) => !META.includes(k)) : []);
  let newArg = $state("");

  const label = (a: unknown) => {
    const t = a as Json;
    if (typeof t.name === "string" && t.name) return t.name;
    const spec = parseAction(t);
    return spec ? describe(spec) : "Action";
  };

  const write = (rel: (string | number)[], v: unknown) => void settingsDoc.patch([set(["action", index, ...rel], v)]);

  /** Control characters shown as escapes ("\r", "\x1b", ...) so send_input text is editable. */
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/[\x00-\x1f\x7f]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, "0")}`);
  const unescape = (s: string) =>
    s.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[rnte\\])/g, (_, e: string) =>
      e === "r" ? "\r" : e === "n" ? "\n" : e === "t" ? "\t" : e === "e" ? "\x1b" : e === "\\" ? "\\" : String.fromCharCode(parseInt(e.slice(1), 16)),
    );

  /** Keep the type of the current value; new arguments are numbers / booleans when they look like one. */
  function argValue(text: string, old: unknown): unknown {
    if (text === "") return undefined;
    if (typeof old === "number" || (old === undefined && /^-?\d+(\.\d+)?$/.test(text))) return Number(text);
    if (typeof old === "boolean" || (old === undefined && /^(true|false)$/.test(text))) return text === "true";
    return unescape(text);
  }

  async function add() {
    const at = actions.length;
    await settingsDoc.patch([{ op: "insert", path: ["action"], value: { name: "New action", command: "send_input", input: "" } }]);
    selected = at;
  }
</script>

<ListPicker
  items={actions}
  bind:selected
  {label}
  onadd={() => void add()}
  onremove={(i) => void settingsDoc.patch([{ op: "remove", path: ["action", i] }])}
  onmove={(from, to) => void settingsDoc.patch([{ op: "move", path: ["action"], from, to }])}
>

{#if action}
  <Field name="name" doc="Label in the command palette." control={{ kind: "text" }} value={action.name} onchange={(v) => write(["name"], v)} />
  <Field name="id" doc="Id, usable in the toolbar, new_tab_menu and [keys]." control={{ kind: "text" }} value={action.id} onchange={(v) => write(["id"], v)} />
  <Field name="icon" doc="Emoji, image path or built-in icon name." control={{ kind: "text" }} value={action.icon} onchange={(v) => write(["icon"], v)} />
  <Field name="keys" doc="Key combos (also editable in Keyboard)." control={{ kind: "list" }} value={action.keys === undefined ? undefined : toArray(action.keys as string | string[])} onchange={(v) => write(["keys"], Array.isArray(v) && v.length === 1 ? v[0] : v)} />
  {#if Array.isArray(action.commands)}
    <Field name="commands" doc="Several actions run in order." control={{ kind: "toml" }} value={action.commands} onchange={(v) => write(["commands"], v)} ontoml={() => settingsDoc.setView("toml", ["action", index, "commands"])} />
  {:else}
    <Field name="command" doc="Command to run; its arguments follow." control={{ kind: "select", options: ACTION_COMMANDS }} value={action.command} onchange={(v) => write(["command"], v)} />
    {#each args as k (k)}
      {@const v = action[k]}
      <div class="arg">
        <code>{k}</code>
        {#if typeof v === "object" && v !== null}
          <button class="link" onclick={() => settingsDoc.setView("toml", ["action", index, k])}>Edit in TOML</button>
        {:else}
          <input type="text" value={typeof v === "string" ? escape(v) : String(v)} onchange={(e) => write([k], argValue(e.currentTarget.value, v))} />
        {/if}
        <button title="Remove argument" onclick={() => write([k], undefined)}><Icon name="close" size={10} /></button>
      </div>
    {/each}
    <div class="arg">
      <select bind:value={newArg}>
        <option value="">Add an argument…</option>
        {#each ARGS.filter((a) => !args.includes(a)) as a (a)}<option value={a}>{a}</option>{/each}
      </select>
      {#if newArg}
        <input type="text" placeholder="Value (\r = Enter, \x1b = Esc)" onchange={(e) => { write([newArg], argValue(e.currentTarget.value, undefined)); newArg = ""; }} />
      {/if}
    </div>
  {/if}
{:else}
  <p class="muted">No custom action yet.</p>
{/if}
</ListPicker>

<style>
  .arg {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }
  code {
    min-width: 160px;
  }
  input,
  select {
    background: var(--term-bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 6px;
    font: inherit;
    width: min(360px, 100%);
  }
  input:focus,
  select:focus {
    outline: 1px solid var(--accent);
  }
  button {
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    padding: 2px 4px;
    display: inline-flex;
  }
  button:hover {
    color: var(--fg);
  }
  .link {
    color: var(--accent);
    font: inherit;
  }
  .muted {
    color: var(--muted);
  }
</style>
