// Pure helpers for tab groups (VS Code-style editor groups): the window area is a split tree whose
// leaves are group ids; every tab belongs to one group and the tab list stays one flat ordered array.
import * as tree from "./tree";
import type { Direction, LayoutNode } from "./tree";

export interface GroupedTab {
  id: string;
  groupId: string;
}

/** Persisted group layout: group id per tab-row position and the shown tab (row position) per group. */
export interface GroupsSnapshot {
  layout: LayoutNode;
  of: string[];
  active: Record<string, number>;
}

const DIRECTIONS: Direction[] = ["left", "right", "up", "down"];

export const groupIds = (layout: LayoutNode): string[] => tree.paneIds(layout);

export const tabsOf = <T extends GroupedTab>(tabs: T[], gid: string): T[] => tabs.filter((t) => t.groupId === gid);

/** Tab shown in group `gid`: the remembered one if still there, else its first tab. */
export function shownTab<T extends GroupedTab>(tabs: T[], gid: string, remembered: string | undefined): T | undefined {
  const own = tabsOf(tabs, gid);
  return own.find((t) => t.id === remembered) ?? own[0];
}

/**
 * Row position for a new tab of group `gid`: right after `afterId` when it belongs to the group,
 * else after the group's last tab, else at the end.
 */
export function insertIndex(tabs: GroupedTab[], gid: string, afterId?: string | null): number {
  if (afterId) {
    const i = tabs.findIndex((t) => t.id === afterId);
    if (i >= 0 && tabs[i].groupId === gid) return i + 1;
  }
  for (let i = tabs.length - 1; i >= 0; i--) if (tabs[i].groupId === gid) return i + 1;
  return tabs.length;
}

/** Tab `delta` steps from `currentId` within its group (wrapping). */
export function cycleIn<T extends GroupedTab>(tabs: T[], currentId: string, delta: number): T | undefined {
  const cur = tabs.find((t) => t.id === currentId);
  if (!cur) return undefined;
  const own = tabsOf(tabs, cur.groupId);
  const n = own.length;
  return own[(((own.indexOf(cur) + delta) % n) + n) % n];
}

/** n-th tab (0-based) of group `gid`; negative: the last one. */
export function nthIn<T extends GroupedTab>(tabs: T[], gid: string, n: number): T | undefined {
  const own = tabsOf(tabs, gid);
  return n < 0 ? own[own.length - 1] : own[n];
}

/** Closest group next to `gid` (any direction), used to refocus when a group goes away. */
export function neighborGroup(layout: LayoutNode, gid: string): string | null {
  return DIRECTIONS.map((d) => tree.neighbor(layout, gid, d)).find((n) => !!n) ?? null;
}

/** Layout without group `gid` (never empties: the last group stays). */
export function removeGroup(layout: LayoutNode, gid: string): LayoutNode {
  return tree.remove(layout, gid) ?? layout;
}

/** Add group `newGid` beside `target` on `side`. */
export function splitGroup(layout: LayoutNode, target: string, side: Direction, newGid: string, size?: number): LayoutNode {
  const { dir, before } = tree.sideOf(side);
  return tree.split(layout, target, dir, newGid, { before, size });
}

const validLayout = (n: unknown): n is LayoutNode => {
  const node = n as LayoutNode;
  if (!node || typeof node.id !== "string") return false;
  if (node.kind === "pane") return true;
  return (
    node.kind === "split" &&
    (node.dir === "row" || node.dir === "col") &&
    Array.isArray(node.children) &&
    node.children.length > 0 &&
    Array.isArray(node.sizes) &&
    node.sizes.length === node.children.length &&
    node.children.every(validLayout)
  );
};

/**
 * Fit a persisted group layout to `count` restored tabs: unknown or missing groups go to the first
 * group, groups left without tabs are removed. Null when there is nothing to restore (one group).
 */
export function restoreGroups(snap: GroupsSnapshot | undefined | null, count: number): { layout: LayoutNode; of: string[]; active: Record<string, number> } | null {
  if (!snap || !validLayout(snap.layout) || !Array.isArray(snap.of) || count === 0) return null;
  const ids = groupIds(snap.layout);
  if (new Set(ids).size !== ids.length) return null;
  const known = new Set(ids);
  const of = Array.from({ length: count }, (_, i) => (known.has(snap.of[i]) ? snap.of[i] : ids[0]));
  let layout: LayoutNode = snap.layout;
  for (const g of ids) if (!of.includes(g)) layout = removeGroup(layout, g);
  if (groupIds(layout).length < 2) return null;
  const active: Record<string, number> = {};
  for (const [g, i] of Object.entries(snap.active ?? {})) if (of[i] === g) active[g] = i;
  return { layout, of, active };
}
