// Drop targets of a dragged tab across tab groups: another group's strip, or a group's body (split zones).
import { dropZone, zoneBox, type Box, type DropZone } from "./pane-drag";

export interface GroupHit {
  gid: string;
  zone: DropZone;
  box: Box;
}

export interface StripHit {
  gid: string;
  el: HTMLElement;
}

class GroupDrop {
  /** Group body zone under a dragged tab. */
  hint = $state<GroupHit | null>(null);
  /** Group whose tab strip a dragged tab is over (moving it into that group). */
  strip = $state<string | null>(null);
}

export const groupDrop = new GroupDrop();

/** Tab strip of a group under (x, y). */
export function stripAt(x: number, y: number): StripHit | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const strip = el.closest<HTMLElement>('[role="tablist"][data-group-id]');
    if (strip) return { gid: strip.dataset.groupId!, el: strip };
  }
  return null;
}

/** Group body under (x, y) and the drop zone there. */
export function groupAt(x: number, y: number): GroupHit | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.closest('[role="tablist"]')) return null;
    const body = el.closest<HTMLElement>("[data-group-body]");
    if (!body) continue;
    const r = body.getBoundingClientRect();
    const zone = dropZone(r, x, y);
    return { gid: body.dataset.groupBody!, zone, box: zoneBox(r.width, r.height, zone) };
  }
  return null;
}

/** Insertion slot for pointer position (x, y) among the tabs of `strip`. */
export function stripSlot(strip: HTMLElement, x: number, y: number): number {
  const vertical = strip.getAttribute("aria-orientation") === "vertical";
  const p = vertical ? y : x;
  let n = 0;
  for (const el of strip.querySelectorAll<HTMLElement>("[data-tab-id]")) {
    const r = el.getBoundingClientRect();
    if (p > (vertical ? r.top + r.height / 2 : r.left + r.width / 2)) n++;
  }
  return n;
}
