<script lang="ts">
  // `toolbar` list: reorder by dragging rows (pointer events: HTML5 drag & drop is unreliable in the webview).
  import { COMMANDS, commandIcon, commandName, parseUserActions } from "../../commands";
  import { DEFAULT_TOOLBAR, SEPARATOR } from "../../toolbar";
  import { settingsDoc } from "../../settings/doc.svelte";
  import { dropIndex, moveItem, set, type Json } from "../../settings/value";
  import Icon from "../Icon.svelte";
  import ProfileIcon from "../ProfileIcon.svelte";

  let { json, actionIds }: { json: Json; actionIds: string[] } = $props();

  const custom = $derived(Array.isArray(json.toolbar) ? (json.toolbar as unknown[]).map(String) : null);
  const list = $derived(custom ?? DEFAULT_TOOLBAR);
  const choices = $derived([SEPARATOR, ...actionIds, ...Object.keys(COMMANDS)]);
  let open = $state(false);
  let filter = $state("");
  let pickerEl = $state<HTMLDivElement>();
  let filterEl = $state<HTMLInputElement>();
  const filtered = $derived(choices.filter((c) => !filter || `${label(c)} ${c}`.toLowerCase().includes(filter.toLowerCase())));
  let listEl = $state<HTMLDivElement>();
  let drag = $state<{ from: number; to: number; y0: number; dy: number; moved: boolean } | null>(null);

  const label = (item: string) => (item === SEPARATOR ? "— separator —" : (COMMANDS[item]?.label ?? `Action: ${item}`));
  const userActions = $derived(
    parseUserActions(Array.isArray(json.action) ? (json.action as unknown[]).filter((t): t is Record<string, unknown> => !!t && typeof t === "object") : []),
  );
  /** Same icon as the title-bar button (see resolveToolbar). */
  function icon(item: string): string | undefined {
    const name = commandName(item);
    if (name) return COMMANDS[name].icon ?? "terminal";
    const a = userActions.find((x) => x.id === item);
    return a ? (a.icon ?? commandIcon(a.spec)) : undefined;
  }
  const save = (l: string[]) => void settingsDoc.patch([set(["toolbar"], l)]);

  function toggle() {
    open = !open;
    filter = "";
    if (open) queueMicrotask(() => filterEl?.focus());
  }
  function add(c: string) {
    save([...list, c]);
    open = false;
  }
  function outside(e: PointerEvent) {
    if (open && !pickerEl?.contains(e.target as Node)) open = false;
  }
  function pickerKey(e: KeyboardEvent) {
    if (e.key === "Escape") open = false;
    else if (e.key === "Enter" && filtered[0]) add(filtered[0]);
  }

  /** Row bounds at drag start (before rows are shifted). */
  let rects: DOMRect[] = [];

  function down(e: PointerEvent, i: number) {
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    rects = [...(listEl?.querySelectorAll<HTMLElement>(".row") ?? [])].map((r) => r.getBoundingClientRect());
    drag = { from: i, to: i, y0: e.clientY, dy: 0, moved: false };
  }

  function move(e: PointerEvent) {
    if (!drag) return;
    drag.dy = e.clientY - drag.y0;
    if (Math.abs(drag.dy) > 3) drag.moved = true;
    // Ignore the dragged row itself: the drop index is among the other rows.
    const others = rects.filter((_, j) => j !== drag!.from);
    drag.to = dropIndex(others, e.clientY);
  }

  function up() {
    if (drag?.moved && drag.to !== drag.from) save(moveItem(list, drag.from, drag.to));
    drag = null;
  }

  /** Visual offset of row `i` while dragging: others slide to open a gap at the drop position. */
  function shift(i: number): number {
    if (!drag?.moved) return 0;
    if (i === drag.from) return drag.dy;
    const h = (rects[drag.from]?.height ?? 0) + 4;
    if (drag.from < i && i <= drag.to) return -h;
    if (drag.to <= i && i < drag.from) return h;
    return 0;
  }
</script>

<svelte:window onpointerdown={outside} />

<p class="muted">Title-bar buttons{custom ? "" : " (default)"}. Drag a row to move it. Also editable by right-clicking the toolbar.</p>
<div class="list" bind:this={listEl}>
  {#each list as item, i (i)}
    <div
      class="row"
      class:dragging={drag?.moved && drag.from === i}
      class:sep={item === SEPARATOR}
      style:transform={drag?.moved ? `translateY(${shift(i)}px)` : undefined}
      role="listitem"
      onpointerdown={(e) => down(e, i)}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={() => (drag = null)}
    >
      <span class="grip"><Icon name="grip" size={12} /></span>
      <span class="icon">{#if item !== SEPARATOR && icon(item)}<ProfileIcon icon={icon(item)} size={14} />{/if}</span>
      <span class="name">{label(item)}</span>
      <button title="Remove" onclick={() => save(list.filter((_, j) => j !== i))}><Icon name="close" size={12} /></button>
    </div>
  {/each}
</div>
<div class="add">
  <div class="picker" bind:this={pickerEl}>
    <button onclick={toggle}><Icon name="plus" size={12} /> Add a button…</button>
    {#if open}
      <div class="pop">
        <input bind:this={filterEl} bind:value={filter} placeholder="Filter…" onkeydown={pickerKey} />
        <ul>
          {#each filtered as c (c)}
            <li>
              <button onclick={() => add(c)}>
                <span class="icon">{#if c !== SEPARATOR && icon(c)}<ProfileIcon icon={icon(c)} size={14} />{/if}</span>
                <span class="name">{c === SEPARATOR ? "Separator" : label(c)}</span>
              </button>
            </li>
          {:else}
            <li class="empty">No match</li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</div>

<style>
  .muted {
    color: var(--muted);
  }
  .list {
    display: flex;
    flex-direction: column;
    max-width: 480px;
    user-select: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    margin-bottom: 4px;
    background: var(--panel);
    cursor: grab;
    position: relative;
    transition: transform 0.12s;
  }
  .row.dragging {
    transition: none;
    z-index: 1;
    cursor: grabbing;
    border-color: var(--accent);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  }
  .row.sep .name {
    color: var(--muted);
  }
  .grip {
    color: var(--muted);
    display: inline-flex;
  }
  .icon {
    display: inline-flex;
    justify-content: center;
    width: 16px;
  }
  .name {
    flex: 1;
  }
  .add {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
  }
  button {
    display: inline-flex;
    gap: 4px;
    align-items: center;
    background: none;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--muted);
    cursor: pointer;
    font: inherit;
    padding: 2px 6px;
  }
  .add button {
    background: var(--panel);
    border-color: var(--border);
    color: var(--fg);
    padding: 3px 10px;
  }
  button:hover:not(:disabled) {
    background: var(--hover);
    color: var(--fg);
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .picker {
    position: relative;
  }
  .picker > button {
    background: var(--panel);
    border-color: var(--border);
    color: var(--fg);
    padding: 3px 10px;
  }
  .pop {
    position: absolute;
    left: 0;
    bottom: calc(100% + 4px);
    z-index: 10;
    width: 320px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    padding: 4px;
  }
  .pop input {
    width: 100%;
    box-sizing: border-box;
    background: var(--term-bg);
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 6px;
    font: inherit;
    margin-bottom: 4px;
  }
  .pop input:focus {
    outline: 1px solid var(--accent);
  }
  .pop ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 300px;
    overflow-y: auto;
  }
  .pop li button {
    width: 100%;
    gap: 8px;
    color: var(--fg);
    text-align: left;
    padding: 3px 6px;
  }
  .pop .empty {
    color: var(--muted);
    padding: 3px 6px;
  }
</style>
