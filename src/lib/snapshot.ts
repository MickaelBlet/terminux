// Serializable captures of panes and tabs: undo close, session persistence, moving between windows.
import type { LayoutNode } from "./layout/tree";
import type { PaneSpec } from "./term/appearance";
import type { Restore } from "./term/session";

export interface PaneSnapshot {
  id: string;
  kind: "term" | "snippets";
  spec: PaneSpec;
  title: string;
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
