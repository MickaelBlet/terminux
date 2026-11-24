<script lang="ts">
  // Tab groups layout: recursive splits of group ids (same resizing as SplitView).
  import Self from "./GroupView.svelte";
  import TabGroup from "./TabGroup.svelte";
  import { app } from "../state.svelte";
  import type { LayoutNode } from "../layout/tree";

  let { node }: { node: LayoutNode } = $props();
  let container: HTMLDivElement | undefined = $state();
  const MIN = 0.1;

  function startDrag(e: PointerEvent, i: number) {
    if (node.kind !== "split" || !container) return;
    e.preventDefault();
    const split = node;
    const rect = container.getBoundingClientRect();
    const total = split.dir === "row" ? rect.width : rect.height;
    const start = split.dir === "row" ? e.clientX : e.clientY;
    const base = [...split.sizes];
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    document.body.classList.add(split.dir === "row" ? "dragging-col" : "dragging-row");

    const move = (ev: PointerEvent) => {
      const pos = split.dir === "row" ? ev.clientX : ev.clientY;
      let d = (pos - start) / total;
      d = Math.max(-(base[i] - MIN), Math.min(d, base[i + 1] - MIN));
      const sizes = [...base];
      sizes[i] += d;
      sizes[i + 1] -= d;
      app.setGroupSizes(split.id, sizes);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      document.body.classList.remove("dragging-col", "dragging-row");
      app.focusCurrent();
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }
</script>

{#if node.kind === "pane"}
  <TabGroup gid={node.id} />
{:else}
  <div class="split {node.dir}" bind:this={container}>
    {#each node.children as child, i (child.id)}
      <div class="cell" style="flex: {node.sizes[i]} 1 0">
        <Self node={child} />
      </div>
      {#if i < node.children.length - 1}
        <div
          class="divider"
          onpointerdown={(e) => startDrag(e, i)}
          ondblclick={() => app.equalizeGroups()}
          role="separator"
          aria-orientation={node.dir === "row" ? "vertical" : "horizontal"}
        ></div>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .split {
    display: flex;
    width: 100%;
    height: 100%;
  }
  .split.row {
    flex-direction: row;
  }
  .split.col {
    flex-direction: column;
  }
  .cell {
    position: relative;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  /* Thicker than pane dividers: groups are a level above panes. */
  .divider {
    flex: 0 0 calc(var(--pane-divider-width, 4px) + 2px);
    background: var(--border);
    transition: background 0.1s;
  }
  .row > .divider {
    cursor: col-resize;
  }
  .col > .divider {
    cursor: row-resize;
  }
  .divider:hover {
    background: var(--accent-dim);
  }
</style>
