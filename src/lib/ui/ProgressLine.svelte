<script lang="ts">
  // OSC 9;4 progress as a thin line along the top edge of a pane.
  import type { Progress } from "../osc";

  let { progress }: { progress: Progress } = $props();
</script>

<div class="line s{progress.state}" aria-hidden="true">
  <div class="fill" style:width={progress.state === 3 ? null : `${Math.max(progress.value, 2)}%`}></div>
</div>

<style>
  .line {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    overflow: hidden;
    pointer-events: none;
    z-index: 4;
  }
  .fill {
    height: 100%;
    background: var(--accent);
    transition: width 0.2s ease-out;
  }
  .s2 .fill {
    background: var(--danger);
  }
  .s4 .fill {
    background: var(--warn);
    opacity: 0.7;
  }
  .s3 .fill {
    width: 30%;
    animation: slide 1.2s ease-in-out infinite;
  }
  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(340%);
    }
  }
</style>
