// Effective settings of a pane: root (legacy) ⊕ [defaults] ⊕ profile ⊕ per-pane overrides.
import type { ITerminalOptions, ITheme } from "@xterm/xterm";
import {
  findProfile,
  fontFamilyOf,
  wordSeparatorOf,
  type Appearance,
  type Config,
  type Profile,
  type ProfileSettings,
} from "../config";
import { findScheme, luminance, schemeName, toTheme, withAlpha, DEFAULT_SCHEME } from "../schemes";
import { scrollbarLook, type ScrollbarLook } from "./scrollbar";

/** What a pane runs and how it deviates from its profile. Serializable. */
export interface DiffSpec {
  /** Repository root. */
  root: string;
  /** Terminal pane whose host (local, ssh, wsl) runs git; the tab's last terminal when gone. */
  source?: string;
  title: string;
  /** File diff (repo-relative), against the index or HEAD (`staged`). */
  path?: string;
  staged?: boolean;
  /** Commit or stash to show. */
  commit?: string;
  stash?: string;
}

export interface PaneSpec {
  profileId: string;
  commandline?: string;
  /** Explicit starting directory. */
  cwd?: string | null;
  /** Directory of the pane this one was split from. */
  inheritCwd?: string | null;
  env?: Record<string, string>;
  tabTitle?: string;
  tabColor?: string;
  colorScheme?: string;
  suppressApplicationTitle?: boolean;
  /** File pane: the edited file and where to put the cursor. */
  file?: string;
  /** File pane of a remote file: `host:path` shown instead of the local copy. */
  remoteLabel?: string;
  line?: number;
  col?: number;
  /** Diff pane: what to show (re-fetched with git on mount). */
  diff?: DiffSpec;
  /** Runtime overrides (adjust_opacity, toggle_shader_effects, adjust_font_size with pane = true). */
  opacity?: number;
  retro?: boolean;
  /** Pane font zoom (px), added to the window zoom. */
  fontDelta?: number;
}

export interface BackgroundImage {
  path: string;
  size: string;
  position: string;
  opacity: number;
}

export interface Bell {
  audible: boolean;
  window: boolean;
  taskbar: boolean;
  sounds: string[];
}

export type CloseOnExit = "automatic" | "graceful" | "always" | "never";

export interface Resolved {
  profile: Profile | undefined;
  schemeName: string;
  theme: ITheme;
  /** Opaque scheme background (tab color, chrome). */
  background: string;
  /** CSS background of the pane (alpha applied). */
  paneBackground: string;
  transparent: boolean;
  opacity: number;
  useAcrylic: boolean;
  backgroundImage: BackgroundImage | null;
  retro: boolean;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontWeightBold: number;
  lineHeight: number;
  letterSpacing: number;
  ligatures: boolean;
  fontFeatures: string;
  fontVariations: string;
  cursorStyle: "block" | "underline" | "bar";
  cursorWidth: number;
  boldIsBright: boolean;
  minimumContrastRatio: number;
  scrollback: number;
  snapOnInput: boolean;
  /** left, top, right, bottom (px). */
  padding: [number, number, number, number];
  scrollbar: ScrollbarLook;
  tabTitle: string | null;
  suppressTitle: boolean;
  tabColor: string | null;
  icon: string | null;
  closeOnExit: CloseOnExit;
  /** Seconds without output before a fresh process is restarted (0 = off). */
  startupTimeout: number;
  /** Automatic restarts on spawn failure or silent startup. */
  startupRetries: number;
  bell: Bell;
  autoMarkPrompts: boolean;
  showMarksOnScrollbar: boolean;
  rightClickContextMenu: boolean;
  repositionCursorWithMouse: boolean;
  pathTranslation: string;
}

export interface ResolveEnv {
  focused: boolean;
  /** Effective UI brightness, selects `{ light, dark }` schemes. */
  dark: boolean;
  /** Global font zoom (px). */
  fontDelta: number;
}

const APPEARANCE_KEYS: (keyof Appearance)[] = [
  "color_scheme", "foreground", "background", "selection_background", "cursor_color", "cursor_shape", "cursor_height",
  "opacity", "use_acrylic", "background_image", "background_image_stretch_mode", "background_image_alignment",
  "background_image_opacity", "retro_terminal_effect",
];

const defined = <T extends object>(o: T | undefined | null): Partial<T> =>
  Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;

/** Raw merged settings (no interpretation). */
export function mergedSettings(cfg: Config, profile: Profile | undefined): ProfileSettings {
  const d = defined(cfg.defaults);
  const p = defined(profile as ProfileSettings | undefined);
  return {
    ...d,
    ...p,
    font: { ...defined(cfg.defaults?.font), ...defined(profile?.font) },
    unfocused_appearance: { ...defined(cfg.defaults?.unfocused_appearance), ...defined(profile?.unfocused_appearance) },
  };
}

const WEIGHTS: Record<string, number> = {
  thin: 100, "extra-light": 200, light: 300, "semi-light": 350, normal: 400, medium: 500, "semi-bold": 600,
  bold: 700, "extra-bold": 800, black: 900, "extra-black": 950,
};

export function fontWeightOf(w: string | number | undefined): number {
  if (typeof w === "number") return Math.max(1, Math.min(1000, w));
  if (!w) return 400;
  const key = w.toLowerCase().replace(/[_ ]/g, "-");
  return WEIGHTS[key] ?? (Number.isFinite(Number(w)) ? Number(w) : 400);
}

/** "8" | "8, 4" | "l, t, r, b" → [left, top, right, bottom]. */
export function parsePadding(p: string | number | undefined, fallback: [number, number, number, number]): [number, number, number, number] {
  if (p == null || p === "") return fallback;
  const v = String(p).split(",").map((x) => Number(x.trim()));
  if (v.some((x) => !Number.isFinite(x) || x < 0)) return fallback;
  if (v.length === 1) return [v[0], v[0], v[0], v[0]];
  if (v.length === 2) return [v[0], v[1], v[0], v[1]];
  if (v.length === 4) return [v[0], v[1], v[2], v[3]];
  return fallback;
}

const norm = (s: string | undefined) => (s ?? "").toLowerCase().replace(/[_-]/g, "");

const CURSORS: Record<string, "block" | "underline" | "bar"> = {
  bar: "bar",
  vintage: "underline",
  underscore: "underline",
  doubleunderscore: "underline",
  filledbox: "block",
  emptybox: "block",
};

const STRETCH: Record<string, string> = { none: "auto", fill: "100% 100%", uniform: "contain", uniformtofill: "cover" };
const ALIGN: Record<string, string> = {
  center: "center",
  left: "left center",
  top: "center top",
  right: "right center",
  bottom: "center bottom",
  topleft: "left top",
  topright: "right top",
  bottomleft: "left bottom",
  bottomright: "right bottom",
};

function bellOf(s: ProfileSettings): Bell {
  const styles = new Set((Array.isArray(s.bell_style) ? s.bell_style : [s.bell_style ?? "taskbar"]).map(norm));
  const all = styles.has("all");
  return {
    audible: all || styles.has("audible"),
    window: all || styles.has("window"),
    taskbar: all || styles.has("taskbar"),
    sounds: s.bell_sound == null ? [] : Array.isArray(s.bell_sound) ? s.bell_sound : [s.bell_sound],
  };
}

function closeOnExitOf(v: string | boolean | undefined): CloseOnExit {
  if (v === true) return "graceful";
  if (v === false) return "never";
  const k = norm(v);
  return k === "graceful" || k === "always" || k === "never" ? k : "automatic";
}

const fontSettings = (o: Record<string, number> | undefined) =>
  Object.entries(o ?? {})
    .filter(([k, v]) => /^[\w ]{4}$/.test(k) && Number.isFinite(v))
    .map(([k, v]) => `"${k}" ${v}`)
    .join(", ");

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function resolve(cfg: Config, spec: PaneSpec, env: ResolveEnv): Resolved {
  const profile = findProfile(cfg, spec.profileId) ?? findProfile(cfg, cfg.default_profile);
  const s = mergedSettings(cfg, profile);
  // Unfocused panes: appearance-only overlay.
  const a: Appearance = { ...s };
  if (!env.focused) {
    for (const k of APPEARANCE_KEYS) {
      const v = s.unfocused_appearance?.[k];
      if (v !== undefined && v !== null) (a as Record<string, unknown>)[k] = v;
    }
  }

  const name = spec.colorScheme ?? schemeName(a.color_scheme, env.dark);
  const scheme = findScheme(cfg, name);
  const theme: ITheme = { ...(scheme ?? findScheme(cfg, DEFAULT_SCHEME)), ...toTheme(cfg.theme) };
  if (a.foreground) theme.foreground = a.foreground;
  if (a.background) theme.background = a.background;
  if (a.selection_background) theme.selectionBackground = a.selection_background;
  if (a.cursor_color) theme.cursor = a.cursor_color;
  const background = theme.background ?? "#000000";
  if (!scheme?.cursorAccent || a.background) theme.cursorAccent = background;

  const opacity = clamp((spec.opacity ?? a.opacity ?? 100) / 100, 0, 1);
  const backgroundImage: BackgroundImage | null = a.background_image
    ? {
        path: a.background_image,
        size: STRETCH[norm(a.background_image_stretch_mode)] ?? "cover",
        position: ALIGN[norm(a.background_image_alignment)] ?? "center",
        opacity: clamp(a.background_image_opacity ?? 1, 0, 1),
      }
    : null;
  const transparent = opacity < 1 || !!backgroundImage;
  if (transparent) theme.background = "rgba(0, 0, 0, 0)";

  const font = s.font ?? {};
  const weight = fontWeightOf(font.weight);
  const intense = norm(s.intense_text_style) || "bold";
  const boldIsBold = intense === "bold" || intense === "all";
  const contrast = norm(s.adjust_indistinguishable_colors);

  return {
    profile,
    schemeName: scheme ? name : DEFAULT_SCHEME,
    theme,
    background,
    paneBackground: transparent ? withAlpha(background, opacity) : background,
    transparent,
    opacity,
    useAcrylic: !!a.use_acrylic,
    backgroundImage,
    retro: spec.retro ?? !!a.retro_terminal_effect,
    fontFamily: fontFamilyOf(cfg, font.face),
    fontSize: clamp((font.size ?? cfg.font_size ?? 14) + env.fontDelta + (spec.fontDelta ?? 0), 6, 72),
    fontWeight: weight,
    fontWeightBold: boldIsBold ? Math.max(700, weight) : weight,
    lineHeight: clamp(font.cell_height ?? 1, 0.8, 3),
    letterSpacing: clamp(font.cell_width ?? 0, -4, 20),
    ligatures: !!font.ligatures,
    fontFeatures: fontSettings(font.features),
    fontVariations: fontSettings(font.axes),
    cursorStyle: CURSORS[norm(a.cursor_shape)] ?? "block",
    cursorWidth: 2,
    boldIsBright: intense === "bright" || intense === "all",
    minimumContrastRatio: contrast === "always" ? 4.5 : contrast === "indexed" ? 3 : 1,
    scrollback: Math.max(0, s.history_size ?? cfg.scrollback ?? 100000),
    snapOnInput: s.snap_on_input ?? true,
    padding: parsePadding(s.padding, [6, 4, 2, 2]),
    scrollbar: scrollbarLook(s.scrollbar_state, s.scrollbar_width, s.scrollbar_color, theme.foreground ?? "#ffffff"),
    tabTitle: spec.tabTitle ?? s.tab_title ?? null,
    suppressTitle: spec.suppressApplicationTitle ?? s.suppress_application_title ?? false,
    tabColor: spec.tabColor ?? s.tab_color ?? null,
    icon: s.icon ?? null,
    closeOnExit: closeOnExitOf(s.close_on_exit),
    startupTimeout: Math.max(0, s.startup_timeout ?? 15),
    startupRetries: clamp(Math.floor(s.startup_retries ?? 2), 0, 10),
    bell: bellOf(s),
    autoMarkPrompts: !!s.auto_mark_prompts,
    showMarksOnScrollbar: !!s.show_marks_on_scrollbar,
    rightClickContextMenu: s.right_click_context_menu ?? cfg.right_click_context_menu ?? false,
    repositionCursorWithMouse: !!s.reposition_cursor_with_mouse,
    pathTranslation: norm(s.path_translation_style) || "none",
  };
}

/** True when the pane can ever need a see-through xterm canvas (decided at terminal creation). */
export function wantsTransparency(cfg: Config, spec: PaneSpec): boolean {
  const env = { dark: true, fontDelta: 0 };
  return resolve(cfg, spec, { ...env, focused: true }).transparent || resolve(cfg, spec, { ...env, focused: false }).transparent;
}

/** xterm options derived from resolved settings (everything that can change live). */
export function xtermOptions(cfg: Config, r: Resolved): ITerminalOptions {
  return {
    fontFamily: r.fontFamily,
    fontSize: r.fontSize,
    fontWeight: r.fontWeight as ITerminalOptions["fontWeight"],
    fontWeightBold: r.fontWeightBold as ITerminalOptions["fontWeightBold"],
    lineHeight: r.lineHeight,
    letterSpacing: r.letterSpacing,
    scrollback: r.scrollback,
    scrollOnUserInput: r.snapOnInput,
    wordSeparator: wordSeparatorOf(cfg),
    theme: r.theme,
    cursorStyle: r.cursorStyle,
    cursorWidth: r.cursorWidth,
    drawBoldTextInBrightColors: r.boldIsBright,
    minimumContrastRatio: r.minimumContrastRatio,
    screenReaderMode: !!cfg.screen_reader,
    overviewRulerWidth: r.showMarksOnScrollbar ? 10 : 0,
  };
}

/** Whether a color scheme is dark (drives light/dark chrome when following the terminal). */
export const isDark = (background: string) => luminance(background) < 0.5;
