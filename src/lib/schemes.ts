import type { ITheme } from "@xterm/xterm";
import { DEFAULT_THEME, type Config, type SchemeRef } from "./config";

export const DEFAULT_SCHEME = "Terminux";

/** Built-in color schemes: Terminux plus the Windows Terminal set. */
export const BUILTIN_SCHEMES: Record<string, ITheme> = {
  [DEFAULT_SCHEME]: DEFAULT_THEME,
  "Dimidium": { background: "#141414", foreground: "#bab7b6", cursor: "#37e57b", selectionBackground: "#8db8e5", black: "#000000", red: "#cf494c", green: "#60b442", yellow: "#db9c11", blue: "#0575d8", magenta: "#af5ed2", cyan: "#1db6bb", white: "#bab7b6", brightBlack: "#817e7e", brightRed: "#ff643b", brightGreen: "#37e57b", brightYellow: "#fccd1a", brightBlue: "#688dfd", brightMagenta: "#ed6fe9", brightCyan: "#32e0fb", brightWhite: "#dee3e4" },
  "Ottosson": { background: "#000000", foreground: "#bebebe", cursor: "#ffffff", selectionBackground: "#92a4fd", black: "#000000", red: "#be2c21", green: "#3fae3a", yellow: "#be9a4a", blue: "#204dbe", magenta: "#bb54be", cyan: "#00a7b2", white: "#bebebe", brightBlack: "#808080", brightRed: "#ff3e30", brightGreen: "#58ea51", brightYellow: "#ffc944", brightBlue: "#2f6aff", brightMagenta: "#fc74ff", brightCyan: "#00e1f0", brightWhite: "#ffffff" },
  "Campbell": { background: "#0c0c0c", foreground: "#cccccc", cursor: "#ffffff", black: "#0c0c0c", red: "#c50f1f", green: "#13a10e", yellow: "#c19c00", blue: "#0037da", magenta: "#881798", cyan: "#3a96dd", white: "#cccccc", brightBlack: "#767676", brightRed: "#e74856", brightGreen: "#16c60c", brightYellow: "#f9f1a5", brightBlue: "#3b78ff", brightMagenta: "#b4009e", brightCyan: "#61d6d6", brightWhite: "#f2f2f2" },
  "Campbell Powershell": { background: "#012456", foreground: "#cccccc", cursor: "#ffffff", black: "#0c0c0c", red: "#c50f1f", green: "#13a10e", yellow: "#c19c00", blue: "#0037da", magenta: "#881798", cyan: "#3a96dd", white: "#cccccc", brightBlack: "#767676", brightRed: "#e74856", brightGreen: "#16c60c", brightYellow: "#f9f1a5", brightBlue: "#3b78ff", brightMagenta: "#b4009e", brightCyan: "#61d6d6", brightWhite: "#f2f2f2" },
  "Vintage": { background: "#000000", foreground: "#c0c0c0", cursor: "#ffffff", black: "#000000", red: "#800000", green: "#008000", yellow: "#808000", blue: "#000080", magenta: "#800080", cyan: "#008080", white: "#c0c0c0", brightBlack: "#808080", brightRed: "#ff0000", brightGreen: "#00ff00", brightYellow: "#ffff00", brightBlue: "#0000ff", brightMagenta: "#ff00ff", brightCyan: "#00ffff", brightWhite: "#ffffff" },
  "One Half Dark": { background: "#282c34", foreground: "#dcdfe4", cursor: "#ffffff", black: "#282c34", red: "#e06c75", green: "#98c379", yellow: "#e5c07b", blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#dcdfe4", brightBlack: "#5a6374", brightRed: "#e06c75", brightGreen: "#98c379", brightYellow: "#e5c07b", brightBlue: "#61afef", brightMagenta: "#c678dd", brightCyan: "#56b6c2", brightWhite: "#dcdfe4" },
  "One Half Light": { background: "#fafafa", foreground: "#383a42", cursor: "#4f525d", selectionBackground: "#383a42", black: "#383a42", red: "#e45649", green: "#50a14f", yellow: "#c18301", blue: "#0184bc", magenta: "#a626a4", cyan: "#0997b3", white: "#fafafa", brightBlack: "#4f525d", brightRed: "#df6c75", brightGreen: "#98c379", brightYellow: "#e4c07a", brightBlue: "#61afef", brightMagenta: "#c577dd", brightCyan: "#56b5c1", brightWhite: "#ffffff" },
  "Solarized Dark": { background: "#002b36", foreground: "#839496", cursor: "#ffffff", black: "#002b36", red: "#dc322f", green: "#859900", yellow: "#b58900", blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5", brightBlack: "#073642", brightRed: "#cb4b16", brightGreen: "#586e75", brightYellow: "#657b83", brightBlue: "#839496", brightMagenta: "#6c71c4", brightCyan: "#93a1a1", brightWhite: "#fdf6e3" },
  "Solarized Light": { background: "#fdf6e3", foreground: "#657b83", cursor: "#002b36", selectionBackground: "#2c4d57", black: "#002b36", red: "#dc322f", green: "#859900", yellow: "#b58900", blue: "#268bd2", magenta: "#d33682", cyan: "#2aa198", white: "#eee8d5", brightBlack: "#073642", brightRed: "#cb4b16", brightGreen: "#586e75", brightYellow: "#657b83", brightBlue: "#839496", brightMagenta: "#6c71c4", brightCyan: "#93a1a1", brightWhite: "#fdf6e3" },
  "Tango Dark": { background: "#000000", foreground: "#d3d7cf", cursor: "#ffffff", black: "#000000", red: "#cc0000", green: "#4e9a06", yellow: "#c4a000", blue: "#3465a4", magenta: "#75507b", cyan: "#06989a", white: "#d3d7cf", brightBlack: "#555753", brightRed: "#ef2929", brightGreen: "#8ae234", brightYellow: "#fce94f", brightBlue: "#729fcf", brightMagenta: "#ad7fa8", brightCyan: "#34e2e2", brightWhite: "#eeeeec" },
  "Tango Light": { background: "#ffffff", foreground: "#555753", cursor: "#000000", selectionBackground: "#141414", black: "#000000", red: "#cc0000", green: "#4e9a06", yellow: "#c4a000", blue: "#3465a4", magenta: "#75507b", cyan: "#06989a", white: "#d3d7cf", brightBlack: "#555753", brightRed: "#ef2929", brightGreen: "#8ae234", brightYellow: "#fce94f", brightBlue: "#729fcf", brightMagenta: "#ad7fa8", brightCyan: "#34e2e2", brightWhite: "#eeeeec" },
  "Dark+": { background: "#1e1e1e", foreground: "#cccccc", cursor: "#808080", selectionBackground: "#ffffff", black: "#000000", red: "#cd3131", green: "#0dbc79", yellow: "#e5e510", blue: "#2472c8", magenta: "#bc3fbc", cyan: "#11a8cd", white: "#e5e5e5", brightBlack: "#666666", brightRed: "#f14c4c", brightGreen: "#23d18b", brightYellow: "#f5f543", brightBlue: "#3b8eea", brightMagenta: "#d670d6", brightCyan: "#29b8db", brightWhite: "#e5e5e5" },
  "VSCode Dark Modern": { background: "#1f1f1f", foreground: "#cccccc", cursor: "#ffffff", selectionBackground: "#264f78", black: "#000000", red: "#cd3131", green: "#0dbc79", yellow: "#e5e510", blue: "#2472c8", magenta: "#bc3fbc", cyan: "#11a8cd", white: "#e5e5e5", brightBlack: "#666666", brightRed: "#f14c4c", brightGreen: "#23d18b", brightYellow: "#f5f543", brightBlue: "#3b8eea", brightMagenta: "#d670d6", brightCyan: "#29b8db", brightWhite: "#e5e5e5" },
  "VSCode Light Modern": { background: "#ffffff", foreground: "#3b3b3b", cursor: "#000000", selectionBackground: "#add6ff", black: "#000000", red: "#cd3131", green: "#00bc00", yellow: "#949800", blue: "#0451a5", magenta: "#bc05bc", cyan: "#0598bc", white: "#555555", brightBlack: "#666666", brightRed: "#cd3131", brightGreen: "#14ce14", brightYellow: "#b5ba00", brightBlue: "#0451a5", brightMagenta: "#bc05bc", brightCyan: "#0598bc", brightWhite: "#a5a5a5" },
  "CGA": { background: "#000000", foreground: "#aaaaaa", cursor: "#00aa00", selectionBackground: "#ffffff", black: "#000000", red: "#aa0000", green: "#00aa00", yellow: "#aa5500", blue: "#0000aa", magenta: "#aa00aa", cyan: "#00aaaa", white: "#aaaaaa", brightBlack: "#555555", brightRed: "#ff5555", brightGreen: "#55ff55", brightYellow: "#ffff55", brightBlue: "#5555ff", brightMagenta: "#ff55ff", brightCyan: "#55ffff", brightWhite: "#ffffff" },
  "IBM 5153": { background: "#000000", foreground: "#aaaaaa", cursor: "#00aa00", selectionBackground: "#ffffff", black: "#000000", red: "#aa0000", green: "#00aa00", yellow: "#c47e00", blue: "#0000aa", magenta: "#aa00aa", cyan: "#00aaaa", white: "#aaaaaa", brightBlack: "#555555", brightRed: "#ff5555", brightGreen: "#55ff55", brightYellow: "#ffff55", brightBlue: "#5555ff", brightMagenta: "#ff55ff", brightCyan: "#55ffff", brightWhite: "#ffffff" },
};

/** `[[scheme]]` / `[theme]` key (snake_case, Windows Terminal names) → xterm theme key. */
const KEY_ALIASES: Record<string, keyof ITheme> = {
  cursor_color: "cursor",
  cursor_accent: "cursorAccent",
  selection_background: "selectionBackground",
  selection_foreground: "selectionForeground",
  purple: "magenta",
  bright_purple: "brightMagenta",
};

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Convert a user color table to an xterm theme (unknown keys are kept: xterm ignores them). */
export function toTheme(table: Record<string, unknown>): ITheme {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(table)) {
    if (k === "name" || typeof v !== "string") continue;
    out[KEY_ALIASES[k] ?? camel(k)] = v;
  }
  return out as ITheme;
}

export function schemeNames(cfg: Config): string[] {
  const names = new Set(Object.keys(BUILTIN_SCHEMES));
  for (const s of cfg.schemes) if (s.name) names.add(s.name);
  return [...names];
}

/** Scheme by name (user schemes first, case-insensitive), or undefined. */
export function findScheme(cfg: Config, name: string): ITheme | undefined {
  const lower = name.toLowerCase();
  const user = cfg.schemes.find((s) => s.name?.toLowerCase() === lower);
  if (user) return { ...DEFAULT_THEME, ...toTheme(user) };
  const key = Object.keys(BUILTIN_SCHEMES).find((k) => k.toLowerCase() === lower);
  return key ? BUILTIN_SCHEMES[key] : undefined;
}

/** Name selected by a scheme reference for the given UI brightness. */
export function schemeName(ref: SchemeRef | undefined, dark: boolean): string {
  if (!ref) return DEFAULT_SCHEME;
  if (typeof ref === "string") return ref;
  return (dark ? ref.dark : ref.light) ?? ref.dark ?? ref.light ?? DEFAULT_SCHEME;
}

/** Perceived brightness of a `#rgb` / `#rrggbb` color in [0, 1]. */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
}

export function parseHex(hex: string): [number, number, number, number] | null {
  let h = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3,4}$/i.test(h)) h = [...h].map((c) => c + c).join("");
  if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) return null;
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
}

/** `#rrggbb` with an alpha in [0, 1] as a CSS color. */
export function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.max(0, Math.min(1, alpha * rgb[3])).toFixed(3)})`;
}
