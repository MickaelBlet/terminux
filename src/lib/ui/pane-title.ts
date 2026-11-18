// When panes show a title bar (`show_pane_title_bar`).

export type PaneTitleBarMode = "never" | "multiple" | "always";

/** Config value → mode (booleans accepted: true = always, false = never). Default: multiple. */
export function paneTitleBarMode(v: unknown): PaneTitleBarMode {
  if (v === true || v === "always" || v === "true") return "always";
  if (v === false || v === "never" || v === "false") return "never";
  return "multiple";
}

/** "multiple": only while several panes are visible (tab split and not zoomed). */
export function showPaneTitleBar(mode: PaneTitleBarMode, paneCount: number, zoomed: boolean): boolean {
  if (mode === "always") return true;
  return mode === "multiple" && paneCount > 1 && !zoomed;
}
