// Serializable captures of panes and tabs: undo close, session persistence, moving between windows.
import { remove, type LayoutNode } from "./layout/tree";
import type { GroupsSnapshot } from "./layout/groups";
import type { PaneSpec } from "./term/appearance";
import type { Restore } from "./term/session";

export interface PaneSnapshot {
  id: string;
  /** "snippets" / "git": side panes of older versions (now sidebar views), dropped on restore. */
  kind: "term" | "snippets" | "git" | "diff" | "file" | "config" | "defaults";
  spec: PaneSpec;
  title: string;
  /** Name given by the user (pane title bar). */
  name?: string | null;
  cwd: string | null;
  readOnly: boolean;
  restore: Restore;
}

export interface TabSnapshot {
  root: LayoutNode;
  active: string;
  name: string | null;
  color: string | null;
  panes: PaneSnapshot[];
}

export interface WindowSnapshot {
  name: string | null;
  tabs: TabSnapshot[];
  activeTab: number;
  /** Editor tabs (settings, default settings) and their absolute position in the tab row. */
  editors?: { kind: "config" | "defaults"; index: number }[];
  /** Set when the active tab is an editor tab (activeTab then is ignored). */
  activeEditor?: "config" | "defaults";
  bounds?: { x: number; y: number; width: number; height: number; maximized: boolean };
  /** Open sidebar view. */
  sidebar?: "explorer" | "git" | "snippets" | null;
  /** Tab groups (absent with a single group); positions are in the tab row, editors included. */
  groups?: GroupsSnapshot;
}

/** The tab without its panes of the given kinds; null when nothing is left. */
export function dropPanes(t: TabSnapshot, kinds: string[]): TabSnapshot | null {
  const gone = t.panes.filter((p) => kinds.includes(p.kind));
  if (!gone.length) return t;
  let root: LayoutNode | null = t.root;
  for (const p of gone) root = root && remove(root, p.id);
  const panes = t.panes.filter((p) => !kinds.includes(p.kind));
  if (!root || !panes.length) return null;
  const active = panes.some((p) => p.id === t.active) ? t.active : panes[0].id;
  return { ...t, root, panes, active };
}

/** Drop what a persisted session cannot reuse (live ptys) and check the shape. */
export function sanitizeTab(t: TabSnapshot): TabSnapshot | null {
  if (!t || !t.root || !Array.isArray(t.panes) || !t.panes.length) return null;
  const ids = new Set(t.panes.map((p) => p.id));
  const leaves: string[] = [];
  const walk = (n: LayoutNode): boolean =>
    n.kind === "pane" ? (leaves.push(n.id), ids.has(n.id)) : Array.isArray(n.children) && n.children.length > 0 && n.children.every(walk);
  if (!walk(t.root)) return null;
  return {
    ...t,
    active: ids.has(t.active) ? t.active : leaves[0],
    panes: t.panes.map((p) => ({ ...p, restore: { buffer: p.restore?.buffer ?? "" } })),
  };
}
