// Schema of config.toml used by the in-app editor for completion and lint.
import { COMMANDS, LEGACY_NAMES } from "./commands";
import { DEFAULT_THEME } from "./config";
import { EMOJI_ICONS } from "./emoji-icons";
import { ICONS } from "./ui/icons";
import { BUILTIN_SCHEMES } from "./schemes";
import { BUILTIN_UI_THEMES } from "./ui-theme";

export interface Field {
  type: "string" | "number" | "bool" | "array" | "table";
  doc: string;
  values?: string[];
}

const f = (type: Field["type"], doc: string, values?: string[]): Field => (values ? { type, doc, values } : { type, doc });
const bool = (doc: string) => f("bool", doc);
const str = (doc: string, values?: string[]) => f("string", doc, values);
const num = (doc: string) => f("number", doc);

export const ROOT_FIELDS: Record<string, Field> = {
  default_profile: str("Profile id used for new tabs."),
  font_size: num("Terminal font size in px (same as font.size in [defaults])."),
  font_family: str("CSS font-family list for terminals."),
  scrollback: num("Scrollback lines per terminal (same as history_size in [defaults])."),
  notifications: bool("Desktop notifications on OSC 9/777 or bell when unfocused."),
  copy_on_select: bool("Copy the selection to the clipboard on mouse release."),
  osc52_clipboard: bool("Let programs set the clipboard with OSC 52 (never read). Off: any output, e.g. a cat'ed file, could replace what you paste next."),
  middle_click_paste: bool("Paste the clipboard on middle click."),
  right_click_paste: bool("Right click copies the selection, or pastes."),
  word_separators: str("Characters delimiting a word on double-click selection."),
  word_delimiters: str("Alias of word_separators."),
  renderer: str("xterm.js renderer.", ["webgl", "canvas", "dom"]),
  disabled_profile_sources: f("array", "Generated profiles to skip: wsl, ssh, powershell, windows."),
  // Appearance
  app_theme: str("Application theme: dark, light, system or a [[ui_theme]] name.", ["dark", "light", "system", "legacyDark", "legacyLight", "legacySystem"]),
  tab_width_mode: str("Tab width.", ["equal", "title_length", "compact"]),
  tab_position: str("Where the tabs are shown: top bar or a vertical side panel.", ["top", "left", "right"]),
  vertical_tab_width: num("Initial width in px of the vertical tab panel (it can be resized by dragging its edge)."),
  vertical_tabs_collapsed: bool("Start with the vertical tab panel collapsed to icons."),
  new_tab_position: str("Where new tabs open.", ["after_last_tab", "after_current_tab"]),
  tab_switcher_mode: str("Ctrl+Tab behavior: MRU overlay or tab-bar order.", ["mru", "in_order", "disabled"]),
  show_tabs_fullscreen: bool("Keep the tab bar visible in fullscreen."),
  show_zoom_badge: bool("Show the ZOOM badge in the top-right corner of a zoomed pane."),
  show_terminal_title_in_titlebar: bool("Use the active tab title as the window title."),
  always_on_top: bool("Keep windows above the others."),
  disable_animations: bool("Disable UI animations."),
  confirm_close_all_tabs: bool("Confirm before closing a window with several tabs."),
  use_background_image_for_window: bool("Stretch the active profile's background image under all panes."),
  new_tab_menu: f("array", "Entries of the new tab dropdown (see [[new_tab_menu]])."),
  toolbar: f("array", 'Title-bar buttons: command names, [[action]] ids or "separator". Edited from the UI too (right-click the toolbar): changes are written here.'),
  // Startup
  launch_mode: str("Window state at launch.", ["default", "maximized", "fullscreen", "focus", "maximized_focus"]),
  initial_cols: num("Columns of the first window."),
  initial_rows: num("Rows of the first window."),
  initial_position: str('Top-left corner of the first window: "x,y", "x," or ",y".'),
  center_on_launch: bool("Center the first window on its monitor."),
  first_window_preference: str("What the first window opens (default: persisted_window_layout).", ["persisted_window_layout", "default_profile"]),
  windowing_behavior: str("Where `terminux` invocations open when already running.", ["use_new", "use_existing", "use_any_existing"]),
  startup_actions: str('Command line run at startup without arguments, e.g. "new-tab -p python ; split-pane -H".'),
  start_on_user_login: bool("Launch Terminux when you log in."),
  allow_headless: bool("Keep running (tray, quake mode) after the last window closes."),
  // Interaction
  copy_formatting: str("Also copy colors and styles (HTML).", ["true", "false", "html", "all", "none"]),
  trim_block_selection: bool("Trim trailing spaces of rectangular (Alt+drag) selections."),
  trim_paste: bool("Trim trailing whitespace of pasted text."),
  right_click_context_menu: bool("Right click opens the context menu instead of copy/paste."),
  focus_follow_mouse: bool("Focus panes on mouse hover."),
  scroll_to_zoom: bool("Ctrl+wheel changes the font size."),
  scroll_to_change_opacity: bool("Ctrl+Shift+wheel changes the background opacity."),
  detect_urls: bool("Underline and open URLs (Ctrl+click)."),
  large_paste_warning: str("Confirm pastes larger than 5 KiB.", ["true", "false", "always", "never"]),
  multi_line_paste_warning: str("Confirm pastes of several lines.", ["true", "false", "always", "never"]),
  search_web_url: str('Search the web URL; %s is the selection.'),
  minimize_to_tray: bool("Minimizing hides the window in the notification area."),
  always_show_tray_icon: bool("Always show the notification area icon."),
  auto_hide_window: bool("Hide the window when it loses focus."),
  screen_reader: bool("Screen reader support (accessible buffer)."),
};

const APPEARANCE_FIELDS: Record<string, Field> = {
  color_scheme: str('Color scheme name, or { light = "...", dark = "..." }.'),
  foreground: str("Text color override."),
  background: str("Background color override."),
  selection_background: str("Selection color override."),
  cursor_color: str("Cursor color override."),
  cursor_shape: str("Cursor shape.", ["bar", "vintage", "underscore", "filled_box", "empty_box", "double_underscore"]),
  cursor_height: num("Vintage cursor height (1-100)."),
  opacity: num("Background opacity, 0-100."),
  use_acrylic: bool("Blurred transparency (Windows / macOS)."),
  background_image: str("Background image path (relative to the config directory)."),
  background_image_stretch_mode: str("Image scaling.", ["none", "fill", "uniform", "uniform_to_fill"]),
  background_image_alignment: str("Image alignment.", ["center", "left", "top", "right", "bottom", "top_left", "top_right", "bottom_left", "bottom_right"]),
  background_image_opacity: num("Image opacity, 0-1."),
  retro_terminal_effect: bool("CRT scanlines and glow."),
};

/** Settings accepted in [defaults] and in every [[profile]]. */
export const SETTINGS_FIELDS: Record<string, Field> = {
  ...APPEARANCE_FIELDS,
  font: f("table", "{ face, size, weight, cell_height, cell_width, ligatures, features, axes }"),
  intense_text_style: str("How bold (SGR 1) text renders.", ["none", "bold", "bright", "all"]),
  adjust_indistinguishable_colors: str("Raise contrast of hard-to-read text.", ["never", "indexed", "always"]),
  padding: str('Padding: "all", "horizontal, vertical" or "left, top, right, bottom".'),
  scrollbar_state: str("Scrollbar visibility.", ["visible", "hidden", "always"]),
  unfocused_appearance: f("table", "Appearance overrides while the pane is not focused."),
  tab_title: str("Initial tab title."),
  suppress_application_title: bool("Ignore titles set by the application."),
  tab_color: str("Tab color."),
  icon: str("Icon: an emoji, an image path or a built-in name (terminal, ...)."),
  history_size: num("Scrollback lines."),
  snap_on_input: bool("Scroll to the bottom when typing."),
  close_on_exit: str("Close the pane when the process exits.", ["automatic", "graceful", "always", "never"]),
  startup_timeout: num("Restart a new process that prints nothing within this many seconds (0 = off)."),
  startup_retries: num("Automatic restarts when the process fails to spawn or stays silent at startup."),
  bell_style: str("Bell: audible, window (flash), taskbar, all, none, or a list.", ["audible", "window", "taskbar", "all", "none"]),
  bell_sound: str("Bell sound file, or a list (one is picked at random)."),
  auto_mark_prompts: bool("Mark the prompt line on Enter."),
  show_marks_on_scrollbar: bool("Show scroll marks on the scrollbar."),
  right_click_context_menu: bool("Right click opens the context menu."),
  reposition_cursor_with_mouse: bool("Click on the command line moves the cursor (shell integration)."),
  path_translation_style: str("Dropped file paths.", ["none", "wsl", "cygwin", "msys2", "mingw"]),
  cwd: str("Starting directory."),
  starting_directory: str("Alias of cwd."),
  env: f("table", "Extra environment variables."),
  login_shell: bool("Run through the login shell (Unix)."),
};

export const PROFILE_FIELDS: Record<string, Field> = {
  id: str("Unique profile id."),
  name: str("Display name."),
  cmd: str('Command to run. "$SHELL" is the user\'s default shell.', ["$SHELL"]),
  args: f("array", "Command arguments."),
  commandline: str("Full command line (instead of cmd + args)."),
  os: str("Only show this profile on this OS.", ["linux", "windows", "macos"]),
  hidden: bool("Hide from menus (generated profiles can be hidden by id)."),
  ...SETTINGS_FIELDS,
};

const FONT_FIELDS: Record<string, Field> = {
  face: str("Font family."),
  size: num("Size in px."),
  weight: str("Weight.", ["thin", "extra-light", "light", "semi-light", "normal", "medium", "semi-bold", "bold", "extra-bold", "black", "extra-black"]),
  cell_height: num("Line height multiplier."),
  cell_width: num("Extra letter spacing in px."),
  ligatures: bool("Draw programming ligatures."),
  features: f("table", 'OpenType features, e.g. { ss01 = 1, liga = 0 } (DOM renderer).'),
  axes: f("table", "Variable font axes, e.g. { wght = 450 } (DOM renderer)."),
};

/** Color keys of [[scheme]] and [theme] (Windows Terminal names). */
const COLOR_NAMES = [
  "background", "foreground", "cursor_color", "selection_background",
  "black", "red", "green", "yellow", "blue", "purple", "cyan", "white",
  "bright_black", "bright_red", "bright_green", "bright_yellow", "bright_blue", "bright_purple", "bright_cyan", "bright_white",
];
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const XTERM_KEY: Record<string, string> = { cursor_color: "cursor", purple: "magenta", bright_purple: "brightMagenta" };
const defaultColor = (k: string) => (DEFAULT_THEME as Record<string, string | undefined>)[XTERM_KEY[k] ?? camel(k)] ?? (DEFAULT_THEME as Record<string, string | undefined>)[k];
const COLOR_FIELDS: Record<string, Field> = Object.fromEntries(COLOR_NAMES.map((k) => [k, str("Color")]));
/** Also accepted (xterm.js names). */
const XTERM_COLOR_KEYS = new Set([...Object.keys(DEFAULT_THEME), "selectionForeground", "selectionInactiveBackground", "cursor_accent", "selection_foreground", "magenta", "bright_magenta"]);

const SCHEME_FIELDS: Record<string, Field> = { name: str("Scheme name (used by color_scheme)."), ...COLOR_FIELDS };

const UI_THEME_FIELDS: Record<string, Field> = {
  name: str("Theme name (used by app_theme)."),
  tab: f("table", "{ background, unfocused_background, show_close_button, icon_style }"),
  tab_row: f("table", "{ background, unfocused_background }"),
  window: f("table", "{ application_theme, frame, unfocused_frame, use_mica, rainbow_frame }"),
};
const UI_TAB_FIELDS: Record<string, Field> = {
  background: str('Active tab: a color, "terminalBackground" or "accent".', ["terminalBackground", "accent"]),
  unfocused_background: str("Inactive tabs background."),
  show_close_button: str("Tab close button.", ["always", "hover", "never", "active_only"]),
  icon_style: str("Tab icons.", ["default", "hidden", "monochrome"]),
};
const UI_ROW_FIELDS: Record<string, Field> = { background: str("Tab row color."), unfocused_background: str("Tab row color when the window is unfocused.") };
const UI_WINDOW_FIELDS: Record<string, Field> = {
  application_theme: str("Chrome brightness.", ["dark", "light", "system"]),
  frame: str("Window border color."),
  unfocused_frame: str("Window border color when unfocused."),
  use_mica: bool("Mica backdrop (Windows 11)."),
  rainbow_frame: bool("Animated rainbow border."),
};

/** Commands accepted by [[action]] `command` (named commands use these with arguments). */
export const ACTION_COMMANDS: string[] = [
  ...new Set([
    ...Object.values(COMMANDS).map((c) => c.spec.command),
    "send_input", "multiple_actions", "wt", "global_summon", "set_color_scheme", "rename_window", "adjust_opacity",
    "set_tab_color", "rename_tab", "color_selection", "unbound",
  ]),
].sort();

const ACTION_ARGS = [
  "input", "commandline", "profile", "index", "starting_directory", "tab_title", "tab_color", "color_scheme",
  "suppress_application_title", "split", "split_mode", "size", "type", "direction", "target", "title", "color", "window",
  "rows_to_scroll", "clear", "path", "delta", "opacity", "relative", "source", "use_commandline", "query_url", "name",
  "monitor", "desktop", "dropdown_duration", "toggle_visibility", "single_line", "with_control_sequences",
  "copy_formatting", "dismiss_selection", "tab_switcher_mode", "background", "foreground", "match_mode",
];
const ACTION_FIELDS: Record<string, Field> = {
  id: str("Id, usable in [keys] and new_tab_menu."),
  name: str("Label in the command palette."),
  icon: str("Icon."),
  keys: str('Key binding, or a list of them.'),
  command: str("Command to run (its arguments go in the same table)."),
  commands: f("array", "Several actions run in order: [{ command = ... }, ...]."),
  ...Object.fromEntries(ACTION_ARGS.map((a) => [a, f("string", "Command argument")])),
};

const MENU_FIELDS: Record<string, Field> = {
  type: str("Entry type.", ["profile", "folder", "separator", "match_profiles", "remaining_profiles", "action"]),
  profile: str("Profile id or name."),
  icon: str("Icon."),
  name: str("Folder name / profile name to match."),
  entries: f("array", "Folder entries."),
  allow_empty: bool("Show the folder when empty."),
  inline: bool("A folder with one entry shows the entry directly."),
  source: str("Match generated profiles by source.", ["wsl", "ssh", "powershell", "windows"]),
  commandline: str("Match profiles by command line."),
  id: str("Action id."),
};

export const KEY_ACTIONS: string[] = Object.keys(COMMANDS);
export const THEME_KEYS: string[] = COLOR_NAMES;

export const HEADERS = [
  "[defaults]", "[defaults.font]", "[defaults.unfocused_appearance]", "[defaults.env]",
  "[[profile]]", "[profile.font]", "[profile.unfocused_appearance]", "[profile.env]",
  "[[scheme]]", "[[ui_theme]]", "[ui_theme.tab]", "[ui_theme.tab_row]", "[ui_theme.window]",
  "[[action]]", "[[new_tab_menu]]", "[[new_tab_menu.entries]]", "[keys]", "[theme]",
];

/** Sections whose keys are free-form. */
const FREE_SECTIONS = new Set(["profile.env", "defaults.env", "profile.font.features", "defaults.font.features", "profile.font.axes", "defaults.font.axes"]);

export interface Option {
  label: string;
  type: string;
  displayLabel?: string;
  detail?: string;
  info?: string;
  apply?: string;
}

export interface Ctx {
  section: string; // "" (root) | "profile" | "keys" | ... | other
  mode: "key" | "value" | "header";
  key?: string;
  from: number;
}

const HEADER_RE = /^\s*\[\[\s*([\w.-]+)\s*\]\]|^\s*\[\s*([\w."-]+)\s*\]/;
const KEY_RE = /^\s*("?)([\w-]+)\1\s*=/;

function sectionOf(line: string): string | null {
  const m = HEADER_RE.exec(line);
  return m ? (m[1] ?? m[2]).replace(/"/g, "") : null;
}

/** Section in effect at `lineStart`, and the offset where its block begins. */
function sectionAt(text: string, lineStart: number): { section: string; start: number } {
  let end = lineStart;
  while (end > 0) {
    const start = end >= 2 ? text.lastIndexOf("\n", end - 2) + 1 : 0;
    const s = sectionOf(text.slice(start, end));
    if (s !== null) return { section: s, start: end };
    end = start;
  }
  return { section: "", start: 0 };
}

function inComment(before: string): boolean {
  let q: string | null = null;
  for (const c of before) {
    if (q) {
      if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === "#") return true;
  }
  return false;
}

export function contextAt(text: string, pos: number): Ctx | null {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const before = text.slice(lineStart, pos);
  if (inComment(before)) return null;
  const indent = before.length - before.trimStart().length;
  if (before.trimStart().startsWith("[")) return { section: "", mode: "header", from: lineStart + indent };
  const { section } = sectionAt(text, lineStart);
  const eq = before.indexOf("=");
  if (eq >= 0) {
    const key = before.slice(0, eq).trim().replace(/^"|"$/g, "");
    const m = /["\w#$.+-]*$/.exec(before)!;
    if (m.index <= eq) return null;
    return { section, mode: "value", key, from: pos - m[0].length };
  }
  const m = /^\s*"?[\w-]*$/.exec(before);
  if (!m) return null;
  return { section, mode: "key", from: lineStart + indent };
}

/** Keys already set in the block containing `pos`. */
function keysInBlock(text: string, pos: number): Set<string> {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const { start } = sectionAt(text, lineStart);
  const out = new Set<string>();
  let i = start;
  while (i < text.length) {
    const nl = text.indexOf("\n", i);
    const end = nl < 0 ? text.length : nl;
    const line = text.slice(i, end);
    if (i !== lineStart) {
      if (sectionOf(line) !== null) break;
      const m = KEY_RE.exec(line);
      if (m) out.add(m[2]);
    }
    i = end + 1;
  }
  return out;
}

/** String values of `key` in blocks of `section`. */
function valuesIn(text: string, section: string, key: string): string[] {
  const out: string[] = [];
  let current = "";
  const re = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`);
  for (const line of text.split("\n")) {
    const s = sectionOf(line);
    if (s !== null) current = s;
    else if (current === section) {
      const m = re.exec(line);
      if (m) out.push(m[1]);
    }
  }
  return out;
}

export function profileIds(text: string): string[] {
  return [...new Set(["shell", ...valuesIn(text, "profile", "id")])];
}

function fieldsOf(section: string): Record<string, Field> | null {
  switch (section) {
    case "":
      return ROOT_FIELDS;
    case "defaults":
      return SETTINGS_FIELDS;
    case "profile":
      return PROFILE_FIELDS;
    case "defaults.font":
    case "profile.font":
      return FONT_FIELDS;
    case "defaults.unfocused_appearance":
    case "profile.unfocused_appearance":
      return APPEARANCE_FIELDS;
    case "scheme":
      return SCHEME_FIELDS;
    case "ui_theme":
      return UI_THEME_FIELDS;
    case "ui_theme.tab":
      return UI_TAB_FIELDS;
    case "ui_theme.tab_row":
      return UI_ROW_FIELDS;
    case "ui_theme.window":
      return UI_WINDOW_FIELDS;
    case "action":
      return ACTION_FIELDS;
    case "new_tab_menu":
    case "new_tab_menu.entries":
      return MENU_FIELDS;
    case "keys":
      return Object.fromEntries(KEY_ACTIONS.map((a) => [a, str(COMMANDS[a].label)]));
    case "theme":
      return COLOR_FIELDS;
  }
  return null;
}

const q = (s: string) => `"${s}"`;

function schemeNamesIn(text: string): string[] {
  return [...new Set([...Object.keys(BUILTIN_SCHEMES), ...valuesIn(text, "scheme", "name")])];
}

export function completions(text: string, pos: number): { from: number; options: Option[] } | null {
  const ctx = contextAt(text, pos);
  if (!ctx) return null;
  if (ctx.mode === "header") return { from: ctx.from, options: HEADERS.map((h) => ({ label: h, type: "namespace" })) };

  if (ctx.mode === "key") {
    const fields = fieldsOf(ctx.section);
    if (!fields) return null;
    const used = keysInBlock(text, pos);
    const options = Object.entries(fields)
      .filter(([k]) => !used.has(k))
      .map(([k, fd]) => {
        let detail: string = fd.type;
        if (ctx.section === "keys") detail = COMMANDS[k]?.keys.join(", ") || "unbound";
        if (ctx.section === "theme" || ctx.section === "scheme") detail = defaultColor(k) ?? detail;
        return { label: k, type: "property", detail, info: fd.doc, apply: `${k} = ` };
      });
    return { from: ctx.from, options };
  }

  const key = ctx.key ?? "";
  let options: Option[] = [];
  if (ctx.section === "keys") {
    const keys = COMMANDS[key]?.keys ?? COMMANDS[LEGACY_NAMES[key] ?? ""]?.keys ?? [];
    options = keys.map((k) => ({ label: q(k), type: "constant", detail: "default" }));
    if (keys.length > 1) options.push({ label: `[${keys.map(q).join(", ")}]`, type: "constant", detail: "all defaults" });
    options.push({ label: '""', type: "constant", detail: "unbind" });
  } else if (ctx.section === "theme" || ctx.section === "scheme") {
    const c = defaultColor(key);
    if (c) options = [{ label: q(c), type: "constant", detail: "default" }];
  } else if (key === "color_scheme") {
    options = schemeNamesIn(text).map((n) => ({ label: q(n), type: "enum" }));
  } else if (ctx.section === "" && key === "app_theme") {
    const names = new Set([...BUILTIN_UI_THEMES.map((t) => t.name), ...valuesIn(text, "ui_theme", "name")]);
    options = [...names].map((n) => ({ label: q(n), type: "enum" }));
  } else if (ctx.section === "" && key === "toolbar") {
    options = [
      ...Object.entries(COMMANDS).filter(([, c]) => !c.hidden).map(([n, c]) => ({ label: q(n), type: "enum", detail: c.label })),
      ...valuesIn(text, "action", "id").map((id) => ({ label: q(id), type: "variable", detail: "action" })),
      { label: q("separator"), type: "keyword" },
    ];
  } else if (key === "icon" && ctx.section !== "keys") {
    options = [
      ...Object.keys(ICONS).map((n) => ({ label: q(n), type: "enum", detail: "built-in" })),
      ...EMOJI_ICONS.map(([n, e]) => ({ label: q(n), displayLabel: `${e}  ${n}`, type: "text", detail: "emoji", apply: q(e) })),
    ];
  } else if (ctx.section === "action" && key === "command") {
    options = ACTION_COMMANDS.map((c) => ({ label: q(c), type: "enum" }));
  } else if (ctx.section === "action" && key === "profile") {
    options = profileIds(text).map((id) => ({ label: q(id), type: "variable", detail: "profile" }));
  } else {
    const fd = fieldsOf(ctx.section)?.[key];
    if (!fd) return null;
    if (fd.type === "bool") options = ["true", "false"].map((v) => ({ label: v, type: "keyword" }));
    else if (fd.values) options = fd.values.map((v) => (v === "true" || v === "false" ? { label: v, type: "keyword" } : { label: q(v), type: "enum" }));
    else if ((ctx.section === "" && key === "default_profile") || key === "profile")
      options = profileIds(text).map((id) => ({ label: q(id), type: "variable", detail: "profile" }));
  }
  return options.length ? { from: ctx.from, options } : null;
}

export interface Problem {
  from: number;
  to: number;
  message: string;
}

const KNOWN_SECTIONS = new Set(["", ...HEADERS.map((h) => h.replace(/[[\]]/g, "")), ...FREE_SECTIONS]);

function known(section: string, key: string): boolean {
  if (FREE_SECTIONS.has(section)) return true;
  if (section === "keys") return key in COMMANDS || key in LEGACY_NAMES || /^[\w.-]+$/.test(key) && key.includes(".");
  if (section === "theme" || section === "scheme") return key in COLOR_FIELDS || XTERM_COLOR_KEYS.has(key) || key === "name";
  const fields = fieldsOf(section);
  return !fields || key in fields;
}

/** Keys and sections serde would silently ignore. */
export function unknownKeys(text: string): Problem[] {
  const out: Problem[] = [];
  let section = "";
  let offset = 0;
  for (const line of text.split("\n")) {
    const s = sectionOf(line);
    if (s !== null) {
      section = s;
      if (!KNOWN_SECTIONS.has(s)) {
        const at = line.indexOf("[");
        out.push({ from: offset + at, to: offset + line.trimEnd().length, message: `Unknown section [${s}]` });
      }
    } else {
      const m = KEY_RE.exec(line);
      if (m && KNOWN_SECTIONS.has(section) && !known(section, m[2])) {
        const at = line.indexOf(m[2]);
        out.push({ from: offset + at, to: offset + at + m[2].length, message: `Unknown key "${m[2]}"` });
      }
    }
    offset += line.length + 1;
  }
  return out;
}

export interface KeyInfo {
  from: number;
  to: number;
  key: string;
  type: string;
  doc: string;
  values?: string[];
  /** Default bindings (keys) or default color (theme/scheme). */
  default?: string;
}

/** Documentation for the key under `pos`, for hover tooltips. */
export function keyInfoAt(text: string, pos: number): KeyInfo | null {
  const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
  const nl = text.indexOf("\n", pos);
  const line = text.slice(lineStart, nl < 0 ? text.length : nl);
  const m = KEY_RE.exec(line);
  if (!m) return null;
  const key = m[2];
  const from = lineStart + line.indexOf(key);
  const to = from + key.length;
  if (pos < from || pos > to) return null;
  const { section } = sectionAt(text, lineStart);
  if (FREE_SECTIONS.has(section)) return null;
  if (section === "keys") {
    const name = key in COMMANDS ? key : LEGACY_NAMES[key];
    const cmd = name ? COMMANDS[name] : undefined;
    if (!cmd) return null;
    const doc = name === key ? cmd.label : `${cmd.label} (legacy name of ${name})`;
    return { from, to, key, type: "string | string[]", doc, default: cmd.keys.join(", ") || "unbound" };
  }
  const fd = fieldsOf(section)?.[key];
  if (!fd) return null;
  const info: KeyInfo = { from, to, key, type: fd.type, doc: fd.doc };
  if (fd.values) info.values = fd.values;
  if (section === "theme" || section === "scheme") {
    const c = defaultColor(key);
    if (c) info.default = c;
  }
  return info;
}
