// Pane drag by its title bar: dock next to / swap with another pane, move to a tab, a new tab or a window.
import { app } from "../state.svelte";
import { movePaneToWindow, windowAt } from "../windows";
import { dropZone, zoneBox, type Box, type DropZone } from "./pane-drag";

export type PaneDropTarget =
  | { kind: "pane"; paneId: string; zone: DropZone; box: Box }
  | { kind: "tab"; tabId: string }
  | { kind: "new_tab" }
  | { kind: "outside" };

interface PaneDragState {
  paneId: string;
  x0: number;
  y0: number;
  active: boolean;
  target: PaneDropTarget | null;
}

export type PaneHit = { paneId: string; zone: DropZone; box: Box };

/** Visible pane under (x, y) and the drop zone there. */
export function paneAt(x: number, y: number, exclude?: string): PaneHit | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (el.closest('[role="tablist"]')) return null;
    const pane = el.closest<HTMLElement>("[data-pane-id]");
    if (!pane || pane.closest(".tab.hidden")) continue;
    const paneId = pane.dataset.paneId!;
    if (paneId === exclude) return null;
    const r = pane.getBoundingClientRect();
    const zone = dropZone(r, x, y);
    // The hint is positioned inside the pane's border (padding box): size it to that box, or its
    // right/bottom edges end up clipped under the border.
    return { paneId, zone, box: zoneBox(pane.clientWidth, pane.clientHeight, zone) };
  }
  return null;
}

/** Hovering another tab this long switches to it, to drop at a precise spot there. */
const TAB_HOVER_MS = 500;

class PaneDrag {
  state = $state<PaneDragState | null>(null);
  /** Drop hint set by another drag (a settings tab dragged onto a pane). */
  external = $state<PaneHit | null>(null);
  private hoverTab: string | null = null;
  private hoverTimer: ReturnType<typeof setTimeout> | undefined;

  down(e: PointerEvent, paneId: string) {
    if (e.button !== 0 || app.renamingPane) return;
    this.state = { paneId, x0: e.clientX, y0: e.clientY, active: false, target: null };
    // Capture on the root: the source pane may get hidden when another tab is shown.
    document.documentElement.setPointerCapture(e.pointerId);
    window.addEventListener("pointermove", this.move);
    window.addEventListener("pointerup", this.up);
    window.addEventListener("pointercancel", this.cancel);
    window.addEventListener("keydown", this.key, true);
  }

  private move = (e: PointerEvent) => {
    const d = this.state;
    if (!d) return;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
      d.active = true;
      document.body.classList.add("dragging-pane");
    }
    d.target = this.hit(e.clientX, e.clientY);
    this.hover(d.target?.kind === "tab" ? d.target.tabId : null);
  };

  private hit(x: number, y: number): PaneDropTarget | null {
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return { kind: "outside" };
    for (const el of document.elementsFromPoint(x, y)) {
      const tab = el.closest<HTMLElement>("[data-tab-id]");
      if (tab) return { kind: "tab", tabId: tab.dataset.tabId! };
      if (el.closest("[data-pane-id]")) {
        const hit = paneAt(x, y, this.state?.paneId);
        return hit && { kind: "pane", ...hit };
      }
      // Tab strip (horizontal or vertical), outside any tab.
      if (el.closest('[role="tablist"]')) return { kind: "new_tab" };
    }
    return null;
  }

  private hover(tabId: string | null) {
    if (tabId === this.hoverTab) return;
    clearTimeout(this.hoverTimer);
    this.hoverTab = tabId;
    if (!tabId || tabId === app.tab?.id) return;
    this.hoverTimer = setTimeout(() => {
      const i = app.tabs.findIndex((t) => t.id === tabId);
      if (i >= 0 && app.tabs[i].kind === "term") app.gotoTab(i);
    }, TAB_HOVER_MS);
  }

  private key = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !this.state) return;
    e.preventDefault();
    e.stopPropagation();
    this.cancel();
  };

  private end() {
    const d = this.state;
    this.state = null;
    clearTimeout(this.hoverTimer);
    this.hoverTab = null;
    document.body.classList.remove("dragging-pane");
    window.removeEventListener("pointermove", this.move);
    window.removeEventListener("pointerup", this.up);
    window.removeEventListener("pointercancel", this.cancel);
    window.removeEventListener("keydown", this.key, true);
    return d;
  }

  private cancel = () => {
    const d = this.end();
    if (d?.active) app.focusCurrent();
  };

  private up = async (e: PointerEvent) => {
    const d = this.end();
    if (!d?.active) return;
    const id = d.paneId;
    const t = d.target;
    const done = await this.drop(id, t, e);
    if (!done) app.focusCurrent();
  };

  private async drop(id: string, t: PaneDropTarget | null, e: PointerEvent): Promise<boolean> {
    if (!t || !app.panes[id]) return false;
    switch (t.kind) {
      case "pane": {
        const to = app.tabOf(t.paneId);
        return !!to && app.dockPane(id, to, t.paneId, t.zone);
      }
      case "tab": {
        const to = app.tabs.find((x) => x.id === t.tabId);
        return !!to && to !== app.tabOf(id) && app.dockPane(id, to, to.active, "auto");
      }
      case "new_tab":
        app.focusPane(id);
        return app.movePane(-1);
      case "outside": {
        app.focusPane(id);
        const target = await windowAt(e.screenX, e.screenY);
        return !!(await movePaneToWindow(app, target ?? "new"));
      }
    }
  }
}

export const paneDrag = new PaneDrag();
