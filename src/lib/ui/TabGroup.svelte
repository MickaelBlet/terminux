<script lang="ts">
  import { app } from "../state.svelte";
  import { find } from "../layout/tree";
  import { tabsOf } from "../layout/groups";
  import SplitView from "./SplitView.svelte";
  import ConfigEditor from "./ConfigEditor.svelte";
  import SettingsTab from "./settings/SettingsTab.svelte";
  import TabStrip from "./TabStrip.svelte";
  import { groupDrop } from "./group-drop.svelte";

  let { gid }: { gid: string } = $props();

  const multi = $derived(app.groupIds.length > 1);
  /** Own strip with several groups in horizontal mode; the vertical panel lists groups itself. */
  const strip = $derived(multi && app.tabBarVisible && app.tabPosition === "top");
  const focused = $derived(app.activeGroup === gid);
  const shown = $derived(app.shownTab(gid));
  const hint = $derived(groupDrop.hint?.gid === gid ? groupDrop.hint.box : null);
</script>

<div class="group" class:multi class:focused>
  {#if strip}<TabStrip {gid} />{/if}
  <div class="body" data-group-body={gid}>
    {#each tabsOf(app.tabs, gid) as tab (tab.id)}
      <section class="tab" class:hidden={tab !== shown}>
        {#if tab.kind !== "term"}
          {#if tab.kind === "config"}<SettingsTab />{:else}<ConfigEditor readonly />{/if}
        {:else if tab.zoom && find(tab.root, tab.zoom)}
          {#key tab.zoom}
            <SplitView node={find(tab.root, tab.zoom)!} {tab} />
          {/key}
        {:else}
          <SplitView node={tab.root} {tab} />
        {/if}
      </section>
    {/each}
    {#if hint}
      <div class="drop" style:left="{hint.left}px" style:top="{hint.top}px" style:width="{hint.width}px" style:height="{hint.height}px"></div>
    {/if}
  </div>
</div>

<style>
  .group {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }
  .body {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
  .tab {
    position: absolute;
    inset: 0;
  }
  .tab.hidden {
    visibility: hidden;
    pointer-events: none;
  }
  .drop {
    position: absolute;
    z-index: 30;
    box-sizing: border-box;
    background: color-mix(in srgb, var(--accent) 25%, transparent);
    border: 2px solid var(--accent);
    border-radius: 4px;
    pointer-events: none;
    transition: all 0.08s ease-out;
  }
</style>
