// Pure helpers of the settings UI: paths, controls, default values, key bindings.
import { COMMANDS, LEGACY_NAMES, toArray } from "../commands";
import { THEME_KEYS, type Field } from "../config-schema";
import { parseCombo } from "../keys";

export type Seg = string | number;
export type PatchOp =
  | { op: "set"; path: Seg[]; value: unknown }
  | { op: "remove"; path: Seg[] }
  | { op: "insert"; path: Seg[]; index?: number; value: unknown }
  | { op: "move"; path: Seg[]; from: number; to: number };

export type Json = Record<string, unknown>;

export const set = (path: Seg[], value: unknown): PatchOp => (value === undefined || value === null ? { op: "remove", path } : { op: "set", path, value });

/** `list` with the item at `from` moved to index `to` (indexes of the result). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length) return out;
  const [x] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, x);
  return out;
}

/** Drop index (0..rects.length) for pointer `y` over rows with vertical bounds `rects`. */
export function dropIndex(rects: { top: number; bottom: number }[], y: number): number {
  const i = rects.findIndex((r) => y < (r.top + r.bottom) / 2);
  return i < 0 ? rects.length : i;
}

export function getIn(obj: unknown, path: Seg[]): unknown {
  let v = obj;
  for (const s of path) {
    if (v === null || typeof v !== "object") return undefined;
    v = (v as Record<string | number, unknown>)[s];
  }
  return v;
}

export const isTable = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

/** "font_size" → "Font size". */
export const labelOf = (key: string) => (key[0]?.toUpperCase() ?? "") + key.slice(1).replace(/_/g, " ");

export type Control =
  | { kind: "toggle" }
  | { kind: "select"; options: string[]; labels?: Record<string, string> }
  | { kind: "number" }
  | { kind: "text"; suggestions?: string[] }
  | { kind: "color"; suggestions?: string[] }
  | { kind: "list" }
  | { kind: "map" }
  | { kind: "toml" };

const COLOR_KEYS = new Set([...THEME_KEYS, "tab_color", "scrollbar_color", "frame", "unfocused_frame", "unfocused_background", "unfocused_foreground", "divider", "active_border"]);
/** String fields whose listed values are suggestions, not the only choices. */
const OPEN_VALUES = new Set(["cmd", "bell_style"]);
const LIST_KEYS = new Set(["args", "disabled_profile_sources", "toolbar"]);
const MAP_KEYS = new Set(["env", "features", "axes"]);

export function controlFor(section: string, key: string, f: Field): Control {
  if ((section === "scheme" || section === "theme" || section === "ui_theme.colors") && key !== "name") return { kind: "color" };
  if (COLOR_KEYS.has(key) && f.type === "string") return { kind: "color", suggestions: f.values };
  switch (f.type) {
    case "bool":
      return { kind: "toggle" };
    case "number":
      return { kind: "number" };
    case "array":
      return LIST_KEYS.has(key) ? { kind: "list" } : { kind: "toml" };
    case "table":
      return MAP_KEYS.has(key) ? { kind: "map" } : { kind: "toml" };
  }
  if (f.values && !OPEN_VALUES.has(key)) return { kind: "select", options: f.values };
  return { kind: "text", suggestions: f.values };
}

/** Fields shown in the UI: aliases are left to the TOML view. */
export const visibleField = (f: Field) => !f.doc.startsWith("Alias of");

/** Select options listed as "true"/"false" are written as booleans. */
export function fromSelect(v: string): unknown {
  if (v === "") return undefined;
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

export const toSelect = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Number input text → value (empty / invalid = unset). */
export function fromNumber(s: string): number | undefined {
  if (s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Compact display of a value (placeholders, summaries). */
export function show(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

export function matchesQuery(query: string, ...texts: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return texts.some((t) => t && t.toLowerCase().replace(/_/g, " ").includes(q.replace(/_/g, " ")));
}

// --- Defaults from the commented examples of default_config.toml ---

/** Parse a TOML literal (strings, numbers, booleans, arrays, inline tables); undefined if unsupported. */
export function parseLiteral(src: string): unknown {
  let i = 0;
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const fail = Symbol();
  const value = (): unknown => {
    ws();
    const c = src[i];
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
      const s = src.slice(i, j + 1);
      i = j + 1;
      return JSON.parse(s);
    }
    if (c === "'") {
      const j = src.indexOf("'", i + 1);
      if (j < 0) throw fail;
      const s = src.slice(i + 1, j);
      i = j + 1;
      return s;
    }
    if (c === "[" || c === "{") {
      const table = c === "{";
      const out: unknown[] = [];
      const obj: Json = {};
      i++;
      for (;;) {
        ws();
        if (src[i] === (table ? "}" : "]")) {
          i++;
          return table ? obj : out;
        }
        if (table) {
          const m = /^("[^"]*"|[\w-]+)\s*=/.exec(src.slice(i));
          if (!m) throw fail;
          i += m[0].length;
          obj[m[1].replace(/"/g, "")] = value();
        } else out.push(value());
        ws();
        if (src[i] === ",") i++;
        else if (src[i] !== (table ? "}" : "]")) throw fail;
      }
    }
    const m = /^(true|false|[+-]?\d[\d_]*(\.\d+)?([eE][+-]?\d+)?)/.exec(src.slice(i));
    if (!m) throw fail;
    i += m[0].length;
    return m[1] === "true" ? true : m[1] === "false" ? false : Number(m[1].replace(/_/g, ""));
  };
  try {
    return value();
  } catch {
    return undefined;
  }
}

/**
 * Values of the root and `[defaults]` keys, set or shown as commented examples in the default config.
 * A commented header (`# [[profile]]`) ends the section so its examples are not taken.
 */
export function exampleDefaults(text: string): { root: Json; defaults: Json } {
  const out = { root: {} as Json, defaults: {} as Json };
  let section: Json | null = out.root;
  for (const line of text.split("\n")) {
    const header = /^\s*#?\s*\[\[?\s*([\w.]+)\s*\]?\]/.exec(line);
    if (header) {
      section = !line.trim().startsWith("#") && header[1] === "defaults" ? out.defaults : null;
      continue;
    }
    const m = /^\s*#?\s*([a-z_]+)\s*=\s*(.+)$/.exec(line);
    if (!section || !m || m[1] in section) continue;
    const v = parseLiteral(m[2]);
    if (v !== undefined) section[m[1]] = v;
  }
  return out;
}

// --- Key bindings ---

const MOD_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "OS", "AltGraph"]);
const KEY_NAMES: Record<string, string> = { " ": "Space", arrowup: "Up", arrowdown: "Down", arrowleft: "Left", arrowright: "Right", pageup: "PgUp", pagedown: "PgDn", escape: "Esc" };

/** Combo text for a key event (`key`: layout-independent name from keys.ts `eventKey`); null for a lone modifier. */
export function comboText(e: { ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean; key: string }, key: string): string | null {
  if (MOD_KEYS.has(e.key)) return null;
  const name = KEY_NAMES[key] ?? (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1));
  return [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super", name].filter(Boolean).join("+");
}

/** Normalized combo for comparisons; null if invalid. */
export function comboSig(s: string): string | null {
  const c = parseCombo(s);
  return c && `${+c.ctrl}${+c.shift}${+c.alt}${+c.meta}:${c.key}`;
}

export interface Binding {
  /** Command name, or `action:<index>` for an `[[action]]`. */
  id: string;
  label: string;
  keys: string[];
  /** Keys come from config.toml (else the defaults). */
  custom: boolean;
}

/** Effective bindings of the named commands and `[[action]]`s. */
export function bindings(keys: Json | undefined, actions: Json[] | undefined, describe: (a: Json) => string): Binding[] {
  const user: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(keys ?? {})) user[k in COMMANDS ? k : (LEGACY_NAMES[k] ?? k)] = v;
  const out: Binding[] = Object.entries(COMMANDS).map(([id, c]) => {
    const custom = id in user;
    const keys = custom ? toArray(user[id] as string | string[]).filter((k) => typeof k === "string" && k) : c.keys;
    return { id, label: c.label, keys, custom };
  });
  (actions ?? []).forEach((a, i) => {
    const keys = toArray(a.keys as string | string[] | undefined).filter((k): k is string => typeof k === "string" && !!k);
    out.push({ id: `action:${i}`, label: typeof a.name === "string" && a.name ? a.name : describe(a), keys, custom: true });
  });
  return out;
}

/** Combo signature → ids of the bindings using it, for combos bound more than once. */
export function conflicts(list: Binding[]): Map<string, string[]> {
  const by = new Map<string, string[]>();
  for (const b of list) {
    for (const k of new Set(b.keys.map(comboSig).filter((s): s is string => !!s))) by.set(k, [...(by.get(k) ?? []), b.id]);
  }
  for (const [k, ids] of by) if (ids.length < 2) by.delete(k);
  return by;
}

/** TOML value for a key list: one combo as a string, several as an array, none = "" (unbound). */
export const keysValue = (keys: string[]): string | string[] => (keys.length === 1 ? keys[0] : keys.length ? keys : "");

/**
 * Offset of the line setting `path` in config.toml text, or -1. Heuristic: walks to the n-th
 * `[[table]]` header for each indexed segment, then finds the last key after it.
 */
export function locate(text: string, path: Seg[]): number {
  let from = 0;
  const tables: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const seg = path[i];
    if (typeof seg === "number") continue;
    tables.push(seg);
    const next = path[i + 1];
    if (typeof next === "number") {
      const esc = tables.join(".").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^\\s*\\[\\[\\s*${esc}\\s*\\]\\]`, "gm");
      re.lastIndex = from;
      for (let n = 0; n <= next; n++) {
        const m = re.exec(text);
        if (!m) return -1;
        from = m.index + m[0].length;
      }
    } else if (i === path.length - 1) {
      const esc = seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^\\s*"?${esc}"?\\s*=`, "gm");
      re.lastIndex = from;
      const m = re.exec(text);
      return m ? m.index + (m[0].length - m[0].trimStart().length) : -1;
    }
  }
  return from;
}
