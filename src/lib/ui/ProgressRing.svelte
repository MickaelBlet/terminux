<script lang="ts">
  // OSC 9;4 progress ring drawn around a 16px icon slot (parent must be position: relative).
  import type { Progress } from "../osc";

  let { progress }: { progress: Progress } = $props();
  const RING = 2 * Math.PI * 6;
</script>

<svg class="ring s{progress.state}" viewBox="0 0 16 16" aria-hidden="true">
  <circle cx="8" cy="8" r="6" stroke-dasharray={progress.state === 3 ? `${RING / 4} ${RING}` : `${(RING * Math.max(progress.value, 3)) / 100} ${RING}`} />
</svg>

<style>
  .ring {
    position: absolute;
    inset: -2px;
    width: calc(100% + 4px);
    height: calc(100% + 4px);
    transform: rotate(-90deg);
    fill: none;
    stroke: var(--accent);
    stroke-width: 1.6;
    stroke-linecap: round;
    pointer-events: none;
  }
  .ring.s2 {
    stroke: var(--danger);
  }
  .ring.s4 {
    stroke: var(--warn);
    opacity: 0.6;
  }
  .ring.s3 {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
