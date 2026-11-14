<script lang="ts">
  // Edge/corner grips for undecorated windows on Linux, where GTK provides no
  // native resize borders once decorations are disabled.
  import { getCurrentWindow } from "@tauri-apps/api/window";

  type Dir = "North" | "South" | "East" | "West" | "NorthEast" | "NorthWest" | "SouthEast" | "SouthWest";
  const win = getCurrentWindow();
  const enabled = navigator.userAgent.includes("Linux");
  const dirs: Dir[] = ["North", "South", "East", "West", "NorthEast", "NorthWest", "SouthEast", "SouthWest"];

  let maximized = $state(false);
  $effect(() => {
    if (!enabled) return;
    const sync = () => win.isMaximized().then((m) => (maximized = m));
    sync();
    const un = win.onResized(sync);
    return () => void un.then((f) => f());
  });
  // Visible 1px frame: undecorated windows have no border on Linux.
  $effect(() => {
    document.documentElement.classList.toggle("framed", enabled && !maximized);
  });
  $effect(() => {
    if (!enabled) return;
    const set = (f: boolean) => document.documentElement.classList.toggle("focused", f);
    set(document.hasFocus());
    const un = win.onFocusChanged(({ payload }) => set(payload));
    return () => void un.then((f) => f());
  });

  function start(e: PointerEvent, dir: Dir) {
    if (e.button !== 0) return;
    e.preventDefault();
    win.startResizeDragging(dir);
  }
</script>

{#if enabled && !maximized}
  {#each dirs as d (d)}
    <div class="grip {d}" role="presentation" onpointerdown={(e) => start(e, d)}></div>
  {/each}
{/if}

<style>
  .grip {
    position: fixed;
    z-index: 1000;
  }
  .North,
  .South {
    left: 8px;
    right: 8px;
    height: 4px;
    cursor: ns-resize;
  }
  .East,
  .West {
    top: 8px;
    bottom: 8px;
    width: 4px;
    cursor: ew-resize;
  }
  .North { top: 0; }
  .South { bottom: 0; }
  .East { right: 0; }
  .West { left: 0; }
  .NorthEast,
  .NorthWest,
  .SouthEast,
  .SouthWest {
    width: 8px;
    height: 8px;
  }
  .NorthWest { top: 0; left: 0; cursor: nwse-resize; }
  .SouthEast { bottom: 0; right: 0; cursor: nwse-resize; }
  .NorthEast { top: 0; right: 0; cursor: nesw-resize; }
  .SouthWest { bottom: 0; left: 0; cursor: nesw-resize; }
</style>
