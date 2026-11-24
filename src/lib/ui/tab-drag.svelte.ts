// Tab drag: reorder along one axis, move to another tab group or split one, dock onto a pane (Shift),
// tear out of the window, drop on another window.
import type { App, Tab } from "../state.svelte";
import { insertIndex, tabsOf } from "../layout/groups";
import { groupAt, groupDrop, stripAt, stripSlot } from "./group-drop.svelte";
import { moveTabToWindow, windowAt } from "../windows";
import { notifyTabMotion } from "./tab-baseline";
import { slotAt } from "./tab-shift";
import { paneAt, paneDrag } from "./pane-drag.svelte";

export type Axis = "x" | "y";

export interface DragState {
  /** Slots in the strip's tab list. */
  from: number;
  to: number;
  tabId: string;
  /** Over another group's strip: insertion slot in that group. */
  cross: { gid: string; slot: number } | null;
  p0: number;
  x0: number;
  y0: number;
  active: boolean;
  outside: boolean;
  /** Pointer delta along the axis, clamped to the tab strip. */
  offset: number;
  /** Extent of the dragged tab (margins included): how far neighbors slide aside. */
  size: number;
  /** A settings tab dragged over the panes: the terminal tab shown meanwhile. */
  shown?: string;
  /** Slot midpoints along the axis, measured once when the drag starts. */
  mids: number[];
  min: number;
  max: number;
}

export class TabDrag {
  state = $state<DragState | null>(null);

  constructor(
    private app: App,
    private axis: () => Axis,
    private container: () => HTMLElement | undefined,
    /** Tabs of this strip, in display order. */
    private list: () => Tab[] = () => app.tabs,
  ) {}

  /** Slot of `t` in this strip. */
  slot(t: Tab): number {
    return this.list().indexOf(t);
  }

  private dragged(d: DragState): Tab | undefined {
    return this.app.tabs.find((t) => t.id === d.tabId);
  }

  private pos(e: PointerEvent) {
    return this.axis() === "x" ? e.clientX : e.clientY;
  }

  /** Measure the untransformed layout once, so live transforms don't feed back into hit-testing. */
  private measure(d: DragState) {
    const els = [...(this.container()?.querySelectorAll<HTMLElement>(".tab") ?? [])];
    const x = this.axis() === "x";
    const rects = els.map((el) => el.getBoundingClientRect());
    d.mids = rects.map((r) => (x ? r.left + r.width / 2 : r.top + r.height / 2));
    const el = els[d.from];
    const r = rects[d.from];
    if (!el || !r) return;
    const cs = getComputedStyle(el);
    const margin = x ? parseFloat(cs.marginLeft) + parseFloat(cs.marginRight) : parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    d.size = (x ? r.width : r.height) + (margin || 0);
    const first = rects[0];
    const last = rects[rects.length - 1];
    d.min = x ? first.left - r.left : first.top - r.top;
    d.max = x ? last.right - r.right : last.bottom - r.bottom;
  }

  down(e: PointerEvent, t: Tab) {
    if (e.button !== 0 || this.app.renaming) return;
    const i = this.slot(t);
    if (i < 0) return;
    this.state = { from: i, to: i, tabId: t.id, cross: null, p0: this.pos(e), x0: e.clientX, y0: e.clientY, active: false, outside: false, offset: 0, size: 0, mids: [], min: 0, max: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  move(e: PointerEvent) {
    const d = this.state;
    if (!d) return;
    const delta = this.pos(e) - d.p0;
    if (!d.active && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
    if (!d.active) {
      this.measure(d);
      d.active = true;
    }
    d.outside = e.clientY < -20 || e.clientY > window.innerHeight || e.clientX < 0 || e.clientX > window.innerWidth;
    d.offset = Math.min(d.max, Math.max(d.min, delta));
    const t = this.dragged(d);
    const strip = d.outside ? null : stripAt(e.clientX, e.clientY);
    // Own strip, or the panel holding it (empty space below the vertical list).
    const c = this.container();
    const bar = d.outside ? null : (document.elementFromPoint(e.clientX, e.clientY)?.closest('[role="tablist"]') ?? null);
    const own = strip ? strip.el === c : !!(bar && c && bar.contains(c));
    d.cross = strip && !own && t && strip.gid !== t.groupId ? { gid: strip.gid, slot: stripSlot(strip.el, e.clientX, e.clientY) } : null;
    groupDrop.strip = d.cross?.gid ?? null;
    // Off the strips: Shift docks onto a pane, else the group zones (split / move into a group).
    const body = !d.outside && !strip && !bar;
    const hit = body && e.shiftKey ? this.editorDrop(d, e) : null;
    if (!(body && e.shiftKey)) this.unshow(d);
    paneDrag.external = hit;
    groupDrop.hint = body && !e.shiftKey && t ? this.groupHint(t, e) : null;
    d.to = own ? slotAt(d.mids, this.pos(e)) : d.from;
    if (c) notifyTabMotion(c);
  }

  /** Group zone under the pointer, when dropping there would change something. */
  private groupHint(t: Tab, e: PointerEvent) {
    const hit = groupAt(e.clientX, e.clientY);
    if (!hit) return null;
    const own = hit.gid === t.groupId;
    if (own && (hit.zone === "center" || tabsOf(this.app.tabs, t.groupId).length < 2)) return null;
    return hit;
  }

  /** Show the dragged settings tab again after it was swapped out for a terminal tab. */
  private unshow(d: DragState) {
    if (!d.shown) return;
    const i = this.app.tabs.findIndex((t) => t.id === d.shown);
    d.shown = undefined;
    if (i >= 0) this.app.gotoTab(i);
  }

  /** Tab dragged off the tab strip: show a terminal tab and target its panes. */
  private editorDrop(d: DragState, e: PointerEvent) {
    const app = this.app;
    const t = this.dragged(d);
    if (!t || !app.canDockTab(t)) return null;
    if (document.elementsFromPoint(e.clientX, e.clientY).some((el) => el.closest('[role="tablist"]'))) return null;
    if (app.tab === t) {
      const host = app.recentTermTab(t);
      if (!host) return null;
      d.shown = t.id;
      app.gotoTab(app.tabs.indexOf(host));
    }
    return paneAt(e.clientX, e.clientY);
  }

  async up(e: PointerEvent) {
    const d = this.state;
    this.state = null;
    const hint = paneDrag.external;
    const ghint = groupDrop.hint;
    paneDrag.external = null;
    groupDrop.hint = null;
    groupDrop.strip = null;
    if (!d?.active) return;
    const app = this.app;
    const t = this.dragged(d);
    if (hint || ghint || d.shown || d.cross) swallowClick(); // the tab under the pointer must not be selected
    if (t && d.cross) {
      const target = tabsOf(app.tabs, d.cross.gid)[d.cross.slot];
      app.moveTabToGroup(app.tabs.indexOf(t), d.cross.gid, target ? app.tabs.indexOf(target) : insertIndex(app.tabs, d.cross.gid));
      return;
    }
    if (hint && t && app.canDockTab(t)) {
      const tab = app.tabOf(hint.paneId);
      const at = tab && { tab, target: hint.paneId, side: hint.zone };
      if (at) t.kind === "term" ? app.tabToPane(t, at) : app.openEditorPane(t.kind, at);
      return;
    }
    if (d.shown && t) app.gotoTab(app.tabs.indexOf(t)); // dropped elsewhere: show the settings tab again
    if (t && ghint) {
      const i = app.tabs.indexOf(t);
      if (ghint.zone === "center") app.moveTabToGroup(i, ghint.gid);
      else app.splitTabGroup(ghint.zone, { tab: i, target: ghint.gid });
      return;
    }
    if (d.outside && t) {
      const target = await windowAt(e.screenX, e.screenY);
      await moveTabToWindow(app, app.tabs.indexOf(t), target ?? "new", target ? undefined : { x: e.screenX - 60, y: e.screenY - 16 });
      return;
    }
    const list = this.list();
    const [from, to] = [list[d.from], list[d.to]];
    if (from && to) app.moveTab(app.tabs.indexOf(from), app.tabs.indexOf(to));
  }
}

/** Drop the click that follows this pointerup. */
function swallowClick() {
  const stop = (e: Event) => (e.stopPropagation(), e.preventDefault());
  window.addEventListener("click", stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", stop, { capture: true }));
}
