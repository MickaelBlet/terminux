<script lang="ts">
  // Snippets sidebar view: send_input actions from the config, sent to the last focused terminal.
  import { app } from "../state.svelte";
  import { tasks } from "../snippets";
  import { sessions } from "../term/session";

  let filter = $state("");
  const list = $derived(tasks(app).filter((t) => !filter || t.name.toLowerCase().includes(filter.toLowerCase()) || String(t.spec.input).toLowerCase().includes(filter.toLowerCase())));

  function target() {
    const id = app.recentTerminal;
    return id ? sessions.get(id) : undefined;
  }
  function send(input: string) {
    const s = target();
    if (!s) return app.toast("No terminal.", "warn");
    s.input(input);
    app.focusPane(s.paneId);
  }
</script>

<div class="snippets">
  <input bind:value={filter} placeholder="Filter…" spellcheck="false" />
  <ul>
    {#each list as t, i (i)}
      <li>
        <button onclick={() => send(String(t.spec.input))} title="Send to terminal">
          <span class="name">{t.name}</span>
          <code>{String(t.spec.input).trim()}</code>
        </button>
      </li>
    {:else}
      <li class="empty">No snippets. Add [[action]] entries with command = "send_input", or use "Save as snippet".</li>
    {/each}
  </ul>
</div>

<style>
  .snippets {
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--fg);
  }
  input {
    margin: 6px 4px;
    padding: 5px 8px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--fg);
    font: inherit;
    outline: none;
  }
  input:focus {
    border-color: var(--accent);
  }
  ul {
    flex: 1;
    overflow-y: auto;
    list-style: none;
    margin: 0;
    padding: 0 4px;
  }
  button {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: 6px 8px;
    background: none;
    border: none;
    border-radius: 4px;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  button:hover {
    background: var(--hover);
  }
  code {
    color: var(--muted);
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .empty {
    padding: 8px;
    color: var(--muted);
  }
</style>
