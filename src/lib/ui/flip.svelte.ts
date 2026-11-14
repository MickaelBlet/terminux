// FLIP glide for tab strips: when the tab order changes, tabs slide from their old position.
import { untrack } from "svelte";
import { notifyTabMotion } from "./tab-baseline";

const DURATION = 150;

function reducedMotion(): boolean {
  return document.documentElement.classList.contains("no-animations") || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function tabs(c: HTMLElement): Map<string, HTMLElement> {
  const m = new Map<string, HTMLElement>();
  for (const el of c.querySelectorAll<HTMLElement>("[data-tab-id]")) m.set(el.dataset.tabId!, el);
  return m;
}

/**
 * Must be called during component init. `key` changes whenever tabs may have moved;
 * `paused` suppresses the glide (live drag positions tabs itself).
 */
export function useFlip(container: () => HTMLElement | undefined, key: () => string, paused: () => boolean = () => false) {
  let before = new Map<string, DOMRect>();

  $effect.pre(() => {
    key();
    untrack(() => {
      const c = container();
      // Visual rects (transforms included): a dropped tab glides from where it was let go.
      before = new Map(c ? [...tabs(c)].map(([id, el]) => [id, el.getBoundingClientRect()]) : []);
    });
  });

  $effect(() => {
    key();
    untrack(() => {
      const c = container();
      if (!c || paused() || reducedMotion()) return;
      let moved = false;
      for (const [id, el] of tabs(c)) {
        const old = before.get(id);
        if (!old) continue;
        for (const a of el.getAnimations()) if (a.id === "flip") a.cancel();
        const r = el.getBoundingClientRect();
        const dx = old.left - r.left;
        const dy = old.top - r.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        const a = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: DURATION, easing: "ease-out" });
        a.id = "flip";
        moved = true;
      }
      if (moved) notifyTabMotion(c);
    });
  });
}
