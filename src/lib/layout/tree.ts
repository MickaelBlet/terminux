// Pure layout-tree operations for split panes.
// "row" = children side by side (split right), "col" = stacked (split down).

export type Dir = "row" | "col";
export type Direction = "left" | "right" | "up" | "down";

export interface PaneNode {
  kind: "pane";
  id: string;
}

export interface SplitNode {
  kind: "split";
  id: string;
  dir: Dir;
  sizes: number[]; // fractions, sum = 1
  children: LayoutNode[];
}

export type LayoutNode = PaneNode | SplitNode;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

let seq = 0;
export const newId = (prefix: string) => `${prefix}${++seq}-${Date.now().toString(36)}`;

export const pane = (id: string): PaneNode => ({ kind: "pane", id });

export function paneIds(node: LayoutNode): string[] {
  return node.kind === "pane" ? [node.id] : node.children.flatMap(paneIds);
}

/** True when the subtree holds the node (pane or split) `id`. */
export function contains(node: LayoutNode, id: string): boolean {
  return node.id === id || (node.kind === "split" && node.children.some((c) => contains(c, id)));
}

/** Node (pane or split) by id. */
export function find(node: LayoutNode, id: string): LayoutNode | null {
  if (node.id === id) return node;
  if (node.kind === "pane") return null;
  for (const c of node.children) {
    const r = find(c, id);
    if (r) return r;
  }
  return null;
}

/** Split node directly holding the node `id`. */
export function parentOf(root: LayoutNode, id: string): SplitNode | null {
  if (root.kind === "pane") return null;
  if (root.children.some((c) => c.id === id)) return root;
  for (const c of root.children) {
    const r = parentOf(c, id);
    if (r) return r;
  }
  return null;
}

export const firstPane = (node: LayoutNode): string => (node.kind === "pane" ? node.id : firstPane(node.children[0]));

export interface SplitOptions {
  /** Insert before the target (split left / up). */
  before?: boolean;
  /** Share of the target given to the new pane, in (0, 1). Default 0.5. */
  size?: number;
}

/** Split `target` adding `add` next to it in direction `dir`. */
export function insert(root: LayoutNode, target: string, dir: Dir, add: LayoutNode, opts: SplitOptions = {}): LayoutNode {
  const size = Math.max(0.05, Math.min(0.95, opts.size ?? 0.5));
  const pair = (node: LayoutNode): [LayoutNode[], number[]] =>
    opts.before ? [[add, node], [size, 1 - size]] : [[node, add], [1 - size, size]];
  const rec = (node: LayoutNode): LayoutNode => {
    if (node.id === target) {
      const [children, sizes] = pair(node);
      return { kind: "split", id: newId("s"), dir, sizes, children };
    }
    if (node.kind === "pane") return node;
    const idx = node.children.findIndex((c) => c.id === target);
    if (idx >= 0 && node.dir === dir) {
      const [pieces, shares] = pair(node.children[idx]);
      const sizes = [...node.sizes];
      sizes.splice(idx, 1, ...shares.map((s) => s * node.sizes[idx]));
      const children = [...node.children];
      children.splice(idx, 1, ...pieces);
      return { ...node, sizes, children };
    }
    return { ...node, children: node.children.map(rec) };
  };
  return rec(root);
}

/** Split `target` adding the pane `newPaneId` next to it in direction `dir`. */
export function split(root: LayoutNode, target: string, dir: Dir, newPaneId: string, opts: SplitOptions = {}): LayoutNode {
  return insert(root, target, dir, pane(newPaneId), opts);
}

/** Remove a node (pane or whole split); returns null when the tree becomes empty. */
export function remove(root: LayoutNode, target: string): LayoutNode | null {
  const rec = (node: LayoutNode): LayoutNode | null => {
    if (node.id === target) return null;
    if (node.kind === "pane") return node;
    const children: LayoutNode[] = [];
    const sizes: number[] = [];
    let freed = 0;
    node.children.forEach((c, i) => {
      const r = rec(c);
      if (r) {
        children.push(r);
        sizes.push(node.sizes[i]);
      } else {
        freed += node.sizes[i];
      }
    });
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    if (freed > 0) {
      const total = sizes.reduce((a, b) => a + b, 0);
      for (let i = 0; i < sizes.length; i++) sizes[i] = sizes[i] / total;
    }
    return { ...node, children, sizes };
  };
  return rec(root);
}

/** Exchange the positions of two disjoint nodes. */
export function swap(root: LayoutNode, a: string, b: string): LayoutNode {
  const na = find(root, a);
  const nb = find(root, b);
  if (!na || !nb || a === b || contains(na, b) || contains(nb, a)) return root;
  const rec = (node: LayoutNode): LayoutNode => {
    if (node.id === a) return nb;
    if (node.id === b) return na;
    return node.kind === "pane" ? node : { ...node, children: node.children.map(rec) };
  };
  return rec(root);
}

/** Flip the orientation of the split holding `target`. */
export function toggleOrientation(root: LayoutNode, target: string): LayoutNode {
  const parent = parentOf(root, target);
  if (!parent) return root;
  const rec = (node: LayoutNode): LayoutNode => {
    if (node.kind === "pane") return node;
    if (node.id === parent.id) return { ...node, dir: node.dir === "row" ? "col" : "row" };
    return { ...node, children: node.children.map(rec) };
  };
  return rec(root);
}

/** Copy of a tree with pane ids replaced (`ids`) and fresh split ids. */
export function remap(node: LayoutNode, ids: Map<string, string>): LayoutNode {
  if (node.kind === "pane") return pane(ids.get(node.id) ?? node.id);
  return { ...node, id: newId("s"), sizes: [...node.sizes], children: node.children.map((c) => remap(c, ids)) };
}

/** Pane rectangles in the unit square. */
export function rects(root: LayoutNode, r: Rect = { x: 0, y: 0, w: 1, h: 1 }): Map<string, Rect> {
  const out = new Map<string, Rect>();
  const rec = (node: LayoutNode, r: Rect) => {
    if (node.kind === "pane") {
      out.set(node.id, r);
      return;
    }
    let off = 0;
    node.children.forEach((c, i) => {
      const s = node.sizes[i];
      rec(
        c,
        node.dir === "row"
          ? { x: r.x + off * r.w, y: r.y, w: s * r.w, h: r.h }
          : { x: r.x, y: r.y + off * r.h, w: r.w, h: s * r.h },
      );
      off += s;
    });
  };
  rec(root, r);
  return out;
}

/** Bounding rectangle of a node (pane or split) in the unit square. */
export function rectOf(root: LayoutNode, id: string): Rect | null {
  const node = find(root, id);
  if (!node) return null;
  const all = rects(root);
  let x1 = 1, y1 = 1, x2 = 0, y2 = 0;
  for (const p of paneIds(node)) {
    const r = all.get(p)!;
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w);
    y2 = Math.max(y2, r.y + r.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

const EPS = 1e-6;

/** Closest pane in a direction from a node, preferring the largest overlap. */
export function neighbor(root: LayoutNode, from: string, d: Direction): string | null {
  const all = rects(root);
  const node = find(root, from);
  const a = node?.kind === "pane" ? all.get(from) : rectOf(root, from);
  if (!a || !node) return null;
  const own = new Set(paneIds(node));
  let best: { id: string; dist: number; overlap: number } | null = null;
  for (const [id, b] of all) {
    if (own.has(id)) continue;
    let dist: number, overlap: number;
    if (d === "left" || d === "right") {
      dist = d === "left" ? a.x - (b.x + b.w) : b.x - (a.x + a.w);
      overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    } else {
      dist = d === "up" ? a.y - (b.y + b.h) : b.y - (a.y + a.h);
      overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    }
    if (dist < -EPS || overlap <= EPS) continue;
    if (!best || dist < best.dist - EPS || (Math.abs(dist - best.dist) < EPS && overlap > best.overlap)) {
      best = { id, dist, overlap };
    }
  }
  return best?.id ?? null;
}

/** Set the sizes of a split node by id. */
export function setSizes(root: LayoutNode, splitId: string, sizes: number[]): LayoutNode {
  if (root.kind === "pane") return root;
  if (root.id === splitId) return { ...root, sizes };
  return { ...root, children: root.children.map((c) => setSizes(c, splitId, sizes)) };
}

/**
 * Move a separator of `target` (pane or split) toward `d` by `delta` (fraction of the parent split).
 * Prefers the edge facing `d` (grow); falls back to the opposite edge (shrink), like Windows Terminal.
 */
export function resize(root: LayoutNode, target: string, d: Direction, delta: number): LayoutNode {
  const axis: Dir = d === "left" || d === "right" ? "row" : "col";
  const forward = d === "right" || d === "down";
  const MIN = 0.05;
  // Deepest split on the matching axis with a separator on the facing side, else on the opposite side.
  let facing: { node: SplitNode; sep: number } | null = null;
  let opposite: { node: SplitNode; sep: number } | null = null;
  const rec = (node: LayoutNode) => {
    if (node.kind === "pane" || node.id === target) return;
    const idx = node.children.findIndex((c) => contains(c, target));
    if (idx < 0) return;
    if (node.dir === axis) {
      const n = node.children.length;
      if (forward ? idx < n - 1 : idx > 0) facing = { node, sep: forward ? idx : idx - 1 };
      if (forward ? idx > 0 : idx < n - 1) opposite = { node, sep: forward ? idx - 1 : idx };
    }
    rec(node.children[idx]);
  };
  rec(root);
  const found = (facing ?? opposite) as { node: SplitNode; sep: number } | null;
  if (!found) return root;
  const { node, sep } = found;
  // Separator between children sep and sep+1 moves forward by `move` (negative = backward).
  const sizes = [...node.sizes];
  const want = forward ? delta : -delta;
  const move = Math.max(-(sizes[sep] - MIN), Math.min(want, sizes[sep + 1] - MIN));
  sizes[sep] += move;
  sizes[sep + 1] -= move;
  return setSizes(root, node.id, sizes);
}

/** Equalize all split sizes. */
export function equalize(root: LayoutNode): LayoutNode {
  if (root.kind === "pane") return root;
  const n = root.children.length;
  return { ...root, sizes: Array(n).fill(1 / n), children: root.children.map(equalize) };
}
