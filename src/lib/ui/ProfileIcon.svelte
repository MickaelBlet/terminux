<script lang="ts">
  // Profile / action icon: built-in name, image file, or emoji / text.
  import Icon, { ICONS } from "./Icon.svelte";
  import { fileUrl } from "../audio";

  let { icon, size = 13, mono = false }: { icon?: string | null; size?: number; mono?: boolean } = $props();
  const isPath = (s: string) => /[\\/]/.test(s) || /\.(png|jpe?g|gif|svg|ico|webp|bmp)$/i.test(s);
  let url = $state<string | null>(null);
  $effect(() => {
    url = null;
    const i = icon;
    if (i && isPath(i)) fileUrl(i).then((u) => i === icon && (url = u));
  });
</script>

{#if !icon || icon in ICONS}
  <Icon name={icon && icon in ICONS ? icon : "terminal"} {size} />
{:else if isPath(icon)}
  {#if url}<img src={url} alt="" width={size} height={size} class:mono />{/if}
{:else}
  <span class="emoji" class:mono style:font-size="{size}px">{icon}</span>
{/if}

<style>
  img {
    object-fit: contain;
  }
  .emoji {
    line-height: 1;
    font-family: "Twemoji Mozilla", system-ui, sans-serif;
  }
  .mono {
    filter: grayscale(1);
  }
</style>
