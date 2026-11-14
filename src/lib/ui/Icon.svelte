<script lang="ts" module>
  // Inline SVG icons: no icon font required.
  import { ICONS } from "./icons";
  export { ICONS };
</script>

<script lang="ts">
  let { name, size = 14 }: { name: string; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 16 16"
  fill="none"
  stroke="currentColor"
  stroke-width="1.4"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={ICONS[name] ?? ""} />
</svg>
