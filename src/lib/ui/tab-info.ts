// Per-tab display data shared by the horizontal tab bar and the vertical tab panel.
import type { App, Tab } from "../state.svelte";
import { findProfile } from "../config";
import { paneIds } from "../layout/tree";
import { luminance, parseHex } from "../schemes";

/** equal / titlelength / compact: horizontal bar modes; vertical / collapsed: side panel. */
export type TabVariant = "equal" | "titlelength" | "compact" | "vertical" | "collapsed";

export function tabInfo(app: App, t: Tab, i: number) {
  const ids = paneIds(t.root);
  const panes = ids.map((id) => app.panes[id]).filter((p) => !!p);
  const active = app.panes[t.active];
  return {
    bell: panes.some((p) => p.bell),
    activity: i !== app.activeTab && panes.some((p) => p.activity),
    count: ids.length,
    readOnly: panes.some((p) => p.readOnly),
    progress: active?.progress ?? panes.find((p) => p.progress)?.progress ?? null,
    icon: active?.kind === "file" ? "📝" : (active?.look?.icon ?? findProfile(app.config, active?.spec.profileId)?.icon ?? null),
    background: active?.look?.background ?? null,
  };
}

/** Inline style of a tab: tab color, or the theme's active / inactive background. */
export function tabStyle(app: App, t: Tab, active: boolean, bg: string | null): string {
  const color = app.tabColor(t);
  if (color) return `--tab-bg:${color};background:${color};color:${contrastText(color)}`;
  const ui = app.ui;
  if (active) return filled(ui?.tabActive === "terminal" || !ui ? (bg ?? "var(--tab-active)") : ui.tabActive);
  return ui?.tabInactive && ui.tabInactive !== "terminal" ? filled(ui.tabInactive) : "";
}

const contrastText = (hex: string) => (luminance(hex) > 0.55 ? "#111" : "#fff");

/** Background plus a readable text color when the background is a concrete color
 *  (e.g. a dark terminal background under a light theme). */
function filled(bg: string): string {
  return parseHex(bg) ? `background:${bg};color:${contrastText(bg)}` : `background:${bg}`;
}
