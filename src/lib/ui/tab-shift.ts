// Pure geometry for live tab dragging (kept free of Tauri imports for tests).

/** Drop index for pointer position `p` given slot midpoints. */
export function slotAt(mids: number[], p: number): number {
  for (let i = 0; i < mids.length; i++) if (p < mids[i]) return i;
  return Math.max(0, mids.length - 1);
}

/** Offset of tab `i` while the tab at `from` hovers over slot `to`. */
export function shiftFor(i: number, from: number, to: number, size: number): number {
  if (from < i && i <= to) return -size;
  if (to <= i && i < from) return size;
  return 0;
}
