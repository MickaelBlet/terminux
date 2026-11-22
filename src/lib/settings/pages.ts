// Layout of the settings UI: which schema fields go on which page.
import { PROFILE_FIELDS, ROOT_FIELDS, SETTINGS_FIELDS, type Field } from "../config-schema";
import { visibleField } from "./value";

export interface Group {
  id: string;
  label: string;
  keys: string[];
}

/** Root keys are grouped by the first key of each group, in ROOT_FIELDS order. */
const ROOT_STARTS: [string, string, string][] = [
  ["general", "General", "default_profile"],
  ["appearance", "Appearance", "app_theme"],
  ["startup", "Startup", "launch_mode"],
  ["interaction", "Interaction", "copy_formatting"],
];
/** Edited on dedicated pages. */
const ROOT_ELSEWHERE = new Set(["new_tab_menu", "toolbar"]);

export function rootGroups(): Group[] {
  const groups: Group[] = ROOT_STARTS.map(([id, label]) => ({ id, label, keys: [] }));
  let g = -1;
  for (const [key, f] of Object.entries(ROOT_FIELDS)) {
    const start = ROOT_STARTS.findIndex((s) => s[2] === key);
    if (start >= 0) g = start;
    if (g >= 0 && visibleField(f) && !ROOT_ELSEWHERE.has(key)) groups[g].keys.push(key);
  }
  return groups;
}

const PROFILE_GENERAL = ["name", "id", "commandline", "cmd", "args", "cwd", "login_shell", "env", "os", "hidden", "icon", "tab_title", "suppress_application_title", "tab_color"];
const PROFILE_APPEARANCE = [
  "color_scheme", "font", "foreground", "background", "selection_background", "cursor_shape", "cursor_color",
  "opacity", "use_acrylic", "padding", "scrollbar_state", "scrollbar_width", "scrollbar_color", "intense_text_style", "adjust_indistinguishable_colors",
  "background_image", "background_image_stretch_mode", "background_image_alignment", "background_image_opacity",
  "retro_terminal_effect", "unfocused_appearance",
];

/** Profile (or `[defaults]` when `defaults`) fields per sub-page: General, Appearance, Advanced (the rest). */
export function profileGroups(defaults: boolean): Group[] {
  const fields: Record<string, Field> = defaults ? SETTINGS_FIELDS : PROFILE_FIELDS;
  const keys = Object.keys(fields).filter((k) => visibleField(fields[k]));
  const general = PROFILE_GENERAL.filter((k) => keys.includes(k));
  const appearance = PROFILE_APPEARANCE.filter((k) => keys.includes(k));
  const advanced = keys.filter((k) => !general.includes(k) && !appearance.includes(k));
  return [
    { id: "general", label: "General", keys: general },
    { id: "appearance", label: "Appearance", keys: appearance },
    { id: "advanced", label: "Advanced", keys: advanced },
  ].filter((g) => g.keys.length);
}

/** Keys of a `[[profile]]` that must not be copied to a duplicate. */
export const UNIQUE_PROFILE_KEYS = ["id"];

/** Id not used by `taken`, derived from `name`. */
export function freshId(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "profile";
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** Name not used by `taken`: "Name", "Name (2)", ... */
export function freshName(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(name)) return name;
  for (let i = 2; ; i++) if (!used.has(`${name} (${i})`)) return `${name} (${i})`;
}
