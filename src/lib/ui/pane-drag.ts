// Drop zones of a pane dragged by its title bar (pure geometry).
import type { Direction } from "../layout/tree";

export type DropZone = Direction | "center";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Edge band, as a share of the pane's width / height. */
const EDGE = 0.25;

/** Zone under (x, y): the closest edge when within its band, else the center. */
export function dropZone(r: Box, x: number, y: number): DropZone {
  const fx = (x - r.left) / r.width;
  const fy = (y - r.top) / r.height;
  const edges: [Direction, number][] = [
    ["left", fx],
    ["right", 1 - fx],
    ["up", fy],
    ["down", 1 - fy],
  ];
  const [side, d] = edges.reduce((a, b) => (b[1] < a[1] ? b : a));
  return d < EDGE ? side : "center";
}

/** Highlighted part of the pane for a zone (relative to the pane). */
export function zoneBox(width: number, height: number, zone: DropZone): Box {
  switch (zone) {
    case "left":
      return { left: 0, top: 0, width: width / 2, height };
    case "right":
      return { left: width / 2, top: 0, width: width / 2, height };
    case "up":
      return { left: 0, top: 0, width, height: height / 2 };
    case "down":
      return { left: 0, top: height / 2, width, height: height / 2 };
    default:
      return { left: 0, top: 0, width, height };
  }
}
