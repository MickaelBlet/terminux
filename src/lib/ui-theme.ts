// Application ("chrome") themes: Windows Terminal's dark / light / system plus `[[ui_theme]]`.
import type { Config, UiTheme } from "./config";

export interface UiLook {
  name: string;
  dark: boolean;
  /** Active tab background: a CSS color, or "terminal" (active pane background). */
  tabActive: string;
  tabInactive: string | null;
  closeButton: "always" | "hover" | "never" | "activeonly";
  iconStyle: "default" | "hidden" | "monochrome";
  rainbowFrame: boolean;
  /** Tab text colors (null: theme default / contrast with the tab background). */
  tabFg: string | null;
  tabFgInactive: string | null;
}

export type TabIndicator = "outline" | "underline" | "filled" | "none";

export const BUILTIN_UI_THEMES: UiTheme[] = [
  { name: "dark", window: { application_theme: "dark" }, tab: { background: "terminalBackground" } },
  { name: "light", window: { application_theme: "light" }, tab: { background: "terminalBackground" } },
  { name: "system", window: { application_theme: "system" }, tab: { background: "terminalBackground" } },
  { name: "legacyDark", window: { application_theme: "dark" } },
  { name: "legacyLight", window: { application_theme: "light" } },
  { name: "legacySystem", window: { application_theme: "system" } },
];

const norm = (s: unknown) => (typeof s === "string" ? s : "").toLowerCase().replace(/[_-]/g, "");

export function uiThemeNames(cfg: Config): string[] {
  return [...new Set([...BUILTIN_UI_THEMES.map((t) => t.name), ...(cfg.ui_themes ?? []).map((t) => t.name)])];
}

export function findUiTheme(cfg: Config): UiTheme {
  const name = norm(cfg.app_theme ?? "dark");
  return (
    (cfg.ui_themes ?? []).find((t) => norm(t.name) === name) ??
    BUILTIN_UI_THEMES.find((t) => norm(t.name) === name) ??
    BUILTIN_UI_THEMES[0]
  );
}

const systemDark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;

export function isDarkTheme(cfg: Config): boolean {
  const mode = norm(findUiTheme(cfg).window?.application_theme ?? "system");
  return mode === "dark" ? true : mode === "light" ? false : systemDark();
}

/** A theme color value as CSS ("accent", "terminalBackground" handled by the caller). */
function cssColor(v: string | undefined): string | null {
  if (!v) return null;
  const k = norm(v);
  if (k === "accent") return "var(--accent)";
  if (k === "terminalbackground") return "terminal";
  return v;
}

/** CSS variables set by a theme (all optional; unset ones fall back to app.css). */
export const UI_THEME_VARS = [
  "--chrome-custom", "--chrome-unfocused-custom", "--frame-custom", "--frame-focus-custom",
  "--accent", "--accent-dim", "--term-bg", "--fg", "--muted", "--panel", "--border", "--hover", "--warn", "--danger",
  "--tab-radius", "--tab-height", "--pane-divider", "--pane-divider-width", "--pane-active", "--ui-font", "--ui-font-size",
] as const;

const px = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? `${v}px` : null);

export function tabIndicator(t: UiTheme): TabIndicator {
  const v = norm(t.tab?.indicator);
  return v === "underline" || v === "filled" || v === "none" ? v : "outline";
}

/** CSS variables of a theme: applied on the document, or on a preview element. */
export function uiThemeVars(t: UiTheme): Record<string, string> {
  const out: Record<string, string> = {};
  const color = (name: string, v: string | undefined) => {
    const c = cssColor(v);
    if (c && c !== "terminal") out[name] = c;
  };
  color("--chrome-custom", t.tab_row?.background);
  color("--chrome-unfocused-custom", t.tab_row?.unfocused_background);
  color("--frame-custom", t.window?.unfocused_frame ?? t.window?.frame);
  color("--frame-focus-custom", t.window?.frame);
  const c = t.colors ?? {};
  // "accent" in the accent itself would be circular.
  if (c.accent && norm(c.accent) !== "accent") {
    out["--accent"] = c.accent;
    out["--accent-dim"] = `color-mix(in srgb, ${c.accent} 72%, transparent)`;
  }
  color("--term-bg", c.background);
  color("--fg", c.foreground);
  color("--muted", c.muted);
  color("--panel", c.panel);
  color("--border", c.border);
  color("--hover", c.hover);
  color("--warn", c.warning);
  color("--danger", c.danger);
  color("--pane-divider", t.pane?.divider);
  color("--pane-active", t.pane?.active_border);
  const sizes: [string, unknown][] = [
    ["--tab-radius", t.tab?.radius],
    ["--tab-height", t.tab?.height],
    ["--pane-divider-width", t.pane?.divider_width],
    ["--ui-font-size", t.window?.font_size],
  ];
  for (const [k, v] of sizes) {
    const p = px(v);
    if (p) out[k] = p;
  }
  if (t.window?.font?.trim()) out["--ui-font"] = t.window.font;
  return out;
}

export function applyUiTheme(cfg: Config, dark: boolean): UiLook {
  const t = findUiTheme(cfg);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  const vars = uiThemeVars(t);
  for (const k of UI_THEME_VARS) {
    if (vars[k]) root.style.setProperty(k, vars[k]);
    else root.style.removeProperty(k);
  }
  root.dataset.tabIndicator = tabIndicator(t);
  root.classList.toggle("no-animations", !!cfg.disable_animations);
  const close = norm(t.tab?.show_close_button);
  const icon = norm(t.tab?.icon_style);
  return {
    name: t.name,
    dark,
    tabActive: cssColor(t.tab?.background) ?? "var(--tab-active)",
    tabInactive: cssColor(t.tab?.unfocused_background),
    closeButton: close === "always" || close === "never" || close === "activeonly" ? close : "hover",
    iconStyle: icon === "hidden" || icon === "monochrome" ? icon : "default",
    rainbowFrame: !!t.window?.rainbow_frame,
    tabFg: cssColor(t.tab?.foreground),
    tabFgInactive: cssColor(t.tab?.unfocused_foreground),
  };
}
