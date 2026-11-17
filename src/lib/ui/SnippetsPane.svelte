<script lang="ts">
  // Snippets pane: send_input actions from the config, sent to the last focused terminal of the tab.
  import { app } from "../state.svelte";
  import { tasks } from "../snippets";
  import { sessions } from "../term/session";
  import Icon from "./Icon.svelte";

  let { paneId }: { paneId: string } = $props();
  let filter = $state("");
  const list = $derived(tasks(app).filter((t) => !filter || t.name.toLowerCase().includes(filter.toLowerCase()) || String(t.spec.input).toLowerCase().includes(filter.toLowerCase())));

  function target() {
    const tab = app.tabOf(paneId);
    const id = tab?.mru.find((p) => p !== paneId && sessions.has(p));
    return id ? sessions.get(id) : undefined;
  }
  function send(input: string) {
    const s = target();
    if (!s) return app.toast("No terminal in this tab.", "warn");
    s.input(input);
    app.focusPane(s.paneId);
  }
</script>

<div class="snippets">
  <header>
    <Icon name="snippet" size={13} /> Snippets
    <button class="close" onclick={() => app.closePane(paneId, { force: true, record: false })} title="Close snippets pane" aria-label="Close snippets pane">
      <Icon name="close" size={12} />
    </button>
  </header>
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
  header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px 8px;
    font-weight: 600;
  }
  input {
    margin: 0 4px 6px;
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
  header .close {
    flex-direction: row;
    width: auto;
    margin-left: auto;
    padding: 3px;
    color: var(--muted);
  }
  header .close:hover {
    color: var(--fg);
  }
  .empty {
    padding: 8px;
    color: var(--muted);
  }
</style>
