// Tab drag: reorder along one axis, tear out of the window, drop on another window.
import type { App } from "../state.svelte";
import { moveTabToWindow, windowAt } from "../windows";
import { notifyTabMotion } from "./tab-baseline";
import { slotAt } from "./tab-shift";

export type Axis = "x" | "y";

export interface DragState {
  from: number;
  to: number;
  p0: number;
  active: boolean;
  outside: boolean;
  /** Pointer delta along the axis, clamped to the tab strip. */
  offset: number;
  /** Extent of the dragged tab (margins included): how far neighbors slide aside. */
  size: number;
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
    this.state = { from: i, to: i, p0: this.pos(e), active: false, outside: false, offset: 0, size: 0, mids: [], min: 0, max: 0 };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  move(e: PointerEvent) {
    const d = this.state;
    if (!d) return;
    const delta = this.pos(e) - d.p0;
    if (!d.active && Math.abs(delta) < 6) return;
    if (!d.active) {
      this.measure(d);
      d.active = true;
    }
    d.outside = e.clientY < -20 || e.clientY > window.innerHeight || e.clientX < 0 || e.clientX > window.innerWidth;
    d.offset = Math.min(d.max, Math.max(d.min, delta));
    d.to = d.outside ? d.from : slotAt(d.mids, this.pos(e));
    const c = this.container();
    if (c) notifyTabMotion(c);
  }

  async up(e: PointerEvent) {
    const d = this.state;
    this.state = null;
    if (!d?.active) return;
    const app = this.app;
    const t = app.tabs[d.from];
    if (d.outside && t?.kind === "term") {
      const target = await windowAt(e.screenX, e.screenY);
      await moveTabToWindow(app, app.tabs.indexOf(t), target ?? "new", target ? undefined : { x: e.screenX - 60, y: e.screenY - 16 });
      return;
    }
    app.moveTab(d.from, d.to);
  }
}
