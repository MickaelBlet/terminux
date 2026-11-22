<script lang="ts">
  // Tab icon slot: gear / ringing bell / profile icon, plus the OSC 9;4 progress ring.
  import { app, type Tab } from "../state.svelte";
  import type { tabInfo } from "./tab-info";
  import Icon from "./Icon.svelte";
  import ProfileIcon from "./ProfileIcon.svelte";
  import ProgressRing from "./ProgressRing.svelte";

  let { t, f, forceIcon = false }: { t: Tab; f: ReturnType<typeof tabInfo>; forceIcon?: boolean } = $props();
</script>

<span class="lead">
  {#if t.kind !== "term"}<Icon name="gear" size={12} />
  {:else if f.bell}<span class="bell"><Icon name="bell" size={12} /></span>
  {:else if app.ui?.iconStyle !== "hidden" || forceIcon}<ProfileIcon icon={f.icon} size={12} mono={app.ui?.iconStyle === "monochrome"} />{/if}
  {#if f.progress}
    <ProgressRing progress={f.progress} />
  {/if}
</span>

<style>
  .lead {
    position: relative;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  .bell {
    color: var(--warn);
    display: grid;
    transform-origin: 50% 15%;
    animation: bell-ring 1.5s ease-in-out infinite;
  }
  .bell :global(path) {
    fill: currentColor;
  }
</style>
