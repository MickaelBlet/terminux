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
}

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

export function applyUiTheme(cfg: Config, dark: boolean): UiLook {
  const t = findUiTheme(cfg);
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  const set = (name: string, v: string | null | undefined) => {
    const c = cssColor(v ?? undefined);
    if (c && c !== "terminal") root.style.setProperty(name, c);
    else root.style.removeProperty(name);
  };
  set("--chrome-custom", t.tab_row?.background);
  set("--chrome-unfocused-custom", t.tab_row?.unfocused_background);
  set("--frame-custom", t.window?.unfocused_frame ?? t.window?.frame);
  set("--frame-focus-custom", t.window?.frame);
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
  };
}
