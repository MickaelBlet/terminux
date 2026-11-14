<script lang="ts">
  // Context menu with keyboard navigation and nested submenus.
  import { onMount } from "svelte";
  import { app } from "../state.svelte";
  import Self from "./Menu.svelte";
  import Icon from "./Icon.svelte";
  import ProfileIcon from "./ProfileIcon.svelte";
  import type { MenuItem } from "./types";

  let {
    groups,
    x,
    y,
    sub = false,
    onclose,
  }: { groups: MenuItem[][]; x: number; y: number; sub?: boolean; onclose?: () => void } = $props();

  const flat = $derived(groups.flat());
  const enabled = $derived(flat.filter((it) => !it.disabled));
  let el: HTMLDivElement;
  let sel = $state(-1);
  let open = $state<{ item: MenuItem; x: number; y: number } | null>(null);
  let pos = $state({ x: 0, y: 0 });

  onMount(() => {
    const r = el.getBoundingClientRect();
    // Submenus open on the left when there is no room on the right.
    const left = sub && x + r.width > window.innerWidth - 4 ? x - r.width - (el.parentElement?.getBoundingClientRect().width ?? 0) : x;
    pos = {
      x: Math.max(4, Math.min(left, window.innerWidth - r.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)),
    };
    el.focus();
    if (sub) return;
    const dismiss = () => close();
    window.addEventListener("blur", dismiss);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("blur", dismiss);
      window.removeEventListener("resize", dismiss);
    };
  });

  function close() {
    if (sub) return onclose?.();
    if (!app.menu) return;
    app.menu = null;
    app.focusCurrent();
  }

  function openSub(it: MenuItem, target: HTMLElement) {
    const r = target.getBoundingClientRect();
    open = { item: it, x: r.right - 2, y: r.top - 5 };
  }

  function exec(it: MenuItem | undefined, target?: HTMLElement) {
    if (!it || it.disabled) return;
    if (it.children) {
      if (target) openSub(it, target);
      return;
    }
    app.menu = null;
    app.focusCurrent();
    it.run?.();
  }

  function move(d: number) {
    const i = enabled.indexOf(flat[sel]);
    const n = enabled.length;
    if (!n) return;
    const next = i < 0 ? (d > 0 ? 0 : n - 1) : (i + d + n) % n;
    sel = flat.indexOf(enabled[next]);
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") move(1);
    else if (e.key === "ArrowUp") move(-1);
    else if (e.key === "ArrowRight" || e.key === "Enter") {
      const it = flat[sel];
      const btn = el.querySelectorAll<HTMLElement>("button[role=menuitem]")[sel];
      if (it?.children) openSub(it, btn);
      else if (e.key === "Enter") exec(it);
    } else if (e.key === "ArrowLeft" && sub) close();
    else if (e.key === "Escape") close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
</script>

{#if !sub}
  <div
    class="backdrop"
    onmousedown={close}
    oncontextmenu={(e) => {
      e.preventDefault();
      close();
    }}
    role="presentation"
  ></div>
{/if}
<div
  class="menu"
  bind:this={el}
  style:left="{pos.x}px"
  style:top="{pos.y}px"
  {onkeydown}
  oncontextmenu={(e) => e.preventDefault()}
  role="menu"
  tabindex="-1"
>
  {#each groups as group, gi}
    {#if gi > 0 && group.length}<div class="sep" role="separator"></div>{/if}
    {#each group as it, ii (gi + ":" + ii)}
      {@const i = flat.indexOf(it)}
      <button
        role="menuitem"
        class:sel={i === sel}
        disabled={it.disabled}
        onclick={(e) => exec(it, e.currentTarget)}
        onmouseenter={(e) => {
          sel = it.disabled ? -1 : i;
          if (it.children && !it.disabled) openSub(it, e.currentTarget);
          else open = null;
        }}
      >
        <span class="check">
          {#if it.checked}<Icon name="check" size={12} />{:else if it.icon}<ProfileIcon icon={it.icon} size={12} />{/if}
        </span>
        <span class="label">{it.label}</span>
        {#if it.hint}<kbd>{it.hint}</kbd>{/if}
        {#if it.children}<Icon name="right" size={11} />{/if}
      </button>
    {/each}
  {/each}
  {#if open?.item.children}
    {#key open.item}
      <Self groups={open.item.children} x={open.x} y={open.y} sub onclose={() => ((open = null), el.focus())} />
    {/key}
  {/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 110;
  }
  .menu {
    position: fixed;
    z-index: 111;
    min-width: 220px;
    max-height: calc(100vh - 8px);
    overflow-y: auto;
    padding: 4px;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 8px 24px var(--shadow);
    outline: none;
    font-size: 13px;
  }
  button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 10px 5px 6px;
    background: none;
    border: none;
    border-radius: 4px;
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  button.sel {
    background: var(--hover);
  }
  button:disabled {
    color: var(--muted);
    cursor: default;
  }
  .check {
    display: grid;
    place-items: center;
    width: 14px;
    flex-shrink: 0;
  }
  .label {
    flex: 1;
    white-space: nowrap;
  }
  kbd {
    margin-left: 24px;
    font-size: 11px;
    color: var(--muted);
  }
  .sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--border);
  }
</style>
