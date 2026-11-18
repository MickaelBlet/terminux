// Tab drag: reorder along one axis, tear out of the window, drop on another window.
import type { App } from "../state.svelte";
import { moveTabToWindow, windowAt } from "../windows";
import { notifyTabMotion } from "./tab-baseline";
import { slotAt } from "./tab-shift";
import { paneAt, paneDrag } from "./pane-drag.svelte";

export type Axis = "x" | "y";

export interface DragState {
  from: number;
  to: number;
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
  ) {}

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

  down(e: PointerEvent, i: number) {
    if (e.button !== 0 || this.app.renaming) return;
    this.state = { from: i, to: i, p0: this.pos(e), x0: e.clientX, y0: e.clientY, active: false, outside: false, offset: 0, size: 0, mids: [], min: 0, max: 0 };
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
    const hit = d.outside ? null : this.editorDrop(d, e);
    paneDrag.external = hit;
    d.to = d.outside || hit ? d.from : slotAt(d.mids, this.pos(e));
    const c = this.container();
    if (c) notifyTabMotion(c);
  }

  /** Tab dragged off the tab strip: show a terminal tab and target its panes. */
  private editorDrop(d: DragState, e: PointerEvent) {
    const app = this.app;
    const t = app.tabs[d.from];
    if (!app.canDockTab(t)) return null;
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
    paneDrag.external = null;
    if (!d?.active) return;
    const app = this.app;
    const t = app.tabs[d.from];
    if (hint || d.shown) swallowClick(); // the tab under the pointer must not be selected
    if (hint && t && app.canDockTab(t)) {
      const tab = app.tabOf(hint.paneId);
      const at = tab && { tab, target: hint.paneId, side: hint.zone };
      if (at) t.kind === "term" ? app.tabToPane(t, at) : app.openEditorPane(t.kind, at);
      return;
    }
    if (d.shown && t) app.gotoTab(app.tabs.indexOf(t)); // dropped elsewhere: show the settings tab again
    if (d.outside && t) {
      const target = await windowAt(e.screenX, e.screenY);
      await moveTabToWindow(app, app.tabs.indexOf(t), target ?? "new", target ? undefined : { x: e.screenX - 60, y: e.screenY - 16 });
      return;
    }
    app.moveTab(d.from, d.to);
  }
}

/** Drop the click that follows this pointerup. */
function swallowClick() {
  const stop = (e: Event) => (e.stopPropagation(), e.preventDefault());
  window.addEventListener("click", stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener("click", stop, { capture: true }));
}
