<script lang="ts">
  // Dialog (confirm / prompt), toasts, tab switcher, tab color picker, about, window identification.
  import { app } from "../state.svelte";
  import { TAB_COLORS_DARK, TAB_COLORS_LIGHT } from "./menus";
  import Icon from "./Icon.svelte";

  let value = $state("");
  let checked = $state(false);
  let dialogEl = $state<HTMLDivElement>();
  $effect(() => {
    const d = app.dialog;
    if (!d) return;
    value = d.input?.value ?? "";
    checked = d.checkbox?.checked ?? false;
    queueMicrotask(() => {
      const input = dialogEl?.querySelector<HTMLInputElement>("input:not([type=checkbox])");
      if (input) {
        input.focus();
        input.select();
      } else dialogEl?.querySelector<HTMLButtonElement>("button.ok")?.focus();
    });
  });
  function answer(ok: boolean) {
    const d = app.dialog;
    if (!d) return;
    app.dialog = null;
    if (d.checkbox) d.checkbox.checked = checked;
    d.resolve(ok ? (d.input ? value : true) : d.input ? null : false);
    if (!app.dialog) app.focusCurrent();
  }
  function dialogKey(e: KeyboardEvent) {
    if (e.key === "Escape") answer(false);
    else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement && !e.target.classList.contains("ok"))) answer(true);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  let custom = $state("#");
  const colorGroups = $derived(
    app.dark
      ? [{ name: "Dark", colors: TAB_COLORS_DARK }, { name: "Light", colors: TAB_COLORS_LIGHT }]
      : [{ name: "Light", colors: TAB_COLORS_LIGHT }, { name: "Dark", colors: TAB_COLORS_DARK }],
  );
  const pickerTab = $derived(app.colorPicker ? app.tabs.findIndex((t) => t.id === app.colorPicker!.tabId) : -1);
  function pick(color: string | null) {
    if (pickerTab >= 0) app.setTabColor(pickerTab, color);
    app.colorPicker = null;
    app.focusCurrent();
  }
</script>

{#if app.dialog}
  {@const d = app.dialog}
  <div class="backdrop" role="presentation" onmousedown={() => answer(false)}>
    <div class="dialog" bind:this={dialogEl} role="dialog" tabindex="-1" onmousedown={(e) => e.stopPropagation()} onkeydown={dialogKey}>
      <h3>{d.title}</h3>
      {#if d.message}<pre>{d.message}</pre>{/if}
      {#if d.input}<input bind:value placeholder={d.input.placeholder} spellcheck="false" />{/if}
      {#if d.checkbox}<label class="check"><input type="checkbox" bind:checked />{d.checkbox.label}</label>{/if}
      <div class="buttons">
        {#if d.cancel}<button onclick={() => answer(false)}>{d.cancel}</button>{/if}
        <button class="ok" class:danger={d.danger} onclick={() => answer(true)}>{d.ok}</button>
      </div>
    </div>
  </div>
{/if}

{#if app.toasts.length}
  <div class="toasts">
    {#each app.toasts as t (t.id)}
      <div class="toast {t.kind}">{t.message}</div>
    {/each}
  </div>
{/if}

{#if app.tabSwitcher}
  {@const sw = app.tabSwitcher}
  <div class="switcher" role="listbox">
    {#each sw.order as id, i (id)}
      {@const t = app.tabs.find((x) => x.id === id)}
      {#if t}
        <button class:sel={i === sw.sel} role="option" aria-selected={i === sw.sel} onclick={() => ((sw.sel = i), app.commitTabSwitcher())}>
          {app.tabTitle(t) || "Terminal"}
        </button>
      {/if}
    {/each}
  </div>
{/if}

{#if app.colorPicker && pickerTab >= 0}
  <div class="backdrop clear" role="presentation" onmousedown={() => pick(app.tabs[pickerTab].color)}></div>
  <div class="picker" style:left="{app.colorPicker.x}px" style:top="{app.colorPicker.y}px" role="dialog">
    {#each colorGroups as g (g.name)}
      <div class="group">{g.name}</div>
      <div class="swatches">
        {#each g.colors as c (c)}
          <button class="swatch" style:background={c} title={c} aria-label={c} onclick={() => pick(c)}></button>
        {/each}
      </div>
    {/each}
    <div class="row">
      <input type="color" bind:value={custom} onchange={() => pick(custom)} title="Custom color" />
      <button onclick={() => pick(null)}>Reset</button>
    </div>
  </div>
{/if}

{#if app.about}
  <div class="backdrop" role="presentation" onmousedown={() => ((app.about = false), app.focusCurrent())}>
    <div class="dialog about" role="dialog" tabindex="-1" onmousedown={(e) => e.stopPropagation()}>
      <h3><Icon name="terminal" size={16} /> Terminux</h3>
      <p>Terminal multiplexer. Tauri v2, Svelte 5, xterm.js.</p>
      <p class="muted">Fonts: JetBrains Mono (OFL), Symbols Nerd Font (MIT), Twemoji Mozilla (CC-BY 4.0), Noto Sans Symbols / Math (OFL).</p>
      <div class="buttons"><button class="ok" onclick={() => ((app.about = false), app.focusCurrent())}>Close</button></div>
    </div>
  </div>
{/if}

{#if app.identify}
  <div class="identify">{app.identify}</div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: #0006;
    display: grid;
    place-items: center;
  }
  .backdrop.clear {
    background: none;
  }
  .dialog {
    min-width: 340px;
    max-width: min(640px, 90vw);
    padding: 16px 18px 14px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 16px 48px var(--shadow);
    outline: none;
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    font-size: 14px;
  }
  pre {
    margin: 0 0 12px;
    max-height: 40vh;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-all;
    color: var(--muted);
    font: inherit;
  }
  p {
    margin: 0 0 10px;
  }
  .muted {
    color: var(--muted);
    font-size: 11px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
    color: var(--muted);
    cursor: pointer;
  }
  input:not([type="color"]):not([type="checkbox"]) {
    width: 100%;
    box-sizing: border-box;
    margin-bottom: 12px;
    padding: 6px 8px;
    background: var(--term-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--fg);
    font: inherit;
    outline: none;
  }
  input:focus {
    border-color: var(--accent-dim);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  button {
    padding: 4px 12px;
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--fg);
    font: inherit;
    cursor: pointer;
  }
  button:hover,
  button:focus-visible {
    background: var(--hover);
    outline: none;
  }
  button.ok {
    border-color: var(--accent-dim);
  }
  button.danger {
    border-color: var(--danger);
    color: var(--danger);
  }
  .toasts {
    position: fixed;
    bottom: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 300;
    display: flex;
    flex-direction: column;
    gap: 6px;
    pointer-events: none;
  }
  .toast {
    padding: 7px 14px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 6px 20px var(--shadow);
  }
  .toast.warn {
    border-color: var(--warn);
  }
  .toast.error {
    border-color: var(--danger);
  }
  .switcher {
    position: fixed;
    top: 18vh;
    left: 50%;
    transform: translateX(-50%);
    z-index: 150;
    width: min(420px, 80vw);
    max-height: 60vh;
    overflow-y: auto;
    padding: 4px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 16px 48px var(--shadow);
  }
  .switcher button {
    display: block;
    width: 100%;
    border: none;
    text-align: left;
    padding: 7px 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .switcher button.sel {
    background: var(--hover);
    box-shadow: inset 2px 0 0 var(--accent);
  }
  .picker {
    position: fixed;
    z-index: 201;
    padding: 8px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 8px 24px var(--shadow);
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(8, 22px);
    gap: 6px;
    margin-bottom: 8px;
  }
  .group {
    margin-bottom: 4px;
    font-size: 11px;
    opacity: 0.7;
  }
  .swatch {
    width: 22px;
    height: 22px;
    padding: 0;
    border-radius: 4px;
    border: 1px solid #0003;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
  }
  input[type="color"] {
    width: 40px;
    height: 24px;
    padding: 0;
    border: none;
    background: none;
  }
  .identify {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 400;
    padding: 18px 36px;
    font-size: 48px;
    font-weight: 700;
    background: var(--panel);
    border: 2px solid var(--accent);
    border-radius: 12px;
    box-shadow: 0 16px 48px var(--shadow);
    pointer-events: none;
  }
</style>
