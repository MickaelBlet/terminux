/**
 * Svelte action keeping keyboard focus inside a modal while `active()` holds: focus moving
 * elsewhere (a terminal focused on window refocus or once opened, an editor…) is pulled back
 * to the element last focused in the modal. `active` turns false as soon as the modal is being
 * closed, so the focus can then go back to the pane.
 */
export function trapFocus(node: HTMLElement, active: () => boolean) {
  let last: HTMLElement | null = null;
  const onIn = (e: FocusEvent) => {
    const t = e.target as Node | null;
    if (t && node.contains(t)) {
      if (t instanceof HTMLElement) last = t;
      return;
    }
    if (!active()) return;
    queueMicrotask(() => {
      if (!active() || !node.isConnected || node.contains(document.activeElement)) return;
      const to = last?.isConnected ? last : (node.querySelector<HTMLElement>("input, button, [tabindex]") ?? node);
      to.focus();
    });
  };
  document.addEventListener("focusin", onIn, true);
  return {
    update(fn: () => boolean) {
      active = fn;
    },
    destroy() {
      document.removeEventListener("focusin", onIn, true);
    },
  };
}
