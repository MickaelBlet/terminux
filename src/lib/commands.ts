// Named commands: what `[keys]` binds, what the palette lists. Pure data, no app imports.
// Names and default keys follow Windows Terminal (snake_case).

export interface ActionSpec {
  command: string;
  [arg: string]: unknown;
}

export interface NamedCommand {
  spec: ActionSpec;
  label: string;
  /** Default key combos. */
  keys: string[];
  /** Not listed in the palette (reachable through a dedicated palette entry or keys only). */
  hidden?: boolean;
  /** Built-in icon name (see ui/icons.ts). */
  icon?: string;
}

const n = (label: string, command: string, args: Record<string, unknown> = {}, keys: string[] = [], hidden = false): NamedCommand => ({
  spec: { command, ...args },
  label,
  keys,
  ...(hidden ? { hidden } : {}),
});

const DIRS = ["left", "right", "up", "down"] as const;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const words = (s: string) => s.replace(/_/g, " ");

const FOCUS_EXTRA = ["previous", "previous_in_order", "next_in_order", "first", "parent", "child"] as const;
const SWAP_EXTRA = ["previous", "previous_in_order", "next_in_order", "first"] as const;

export const COMMANDS: Record<string, NamedCommand> = {
  // Application
  close_window: n("Close window", "close_window", {}, ["Alt+F4"]),
  toggle_fullscreen: n("Toggle fullscreen", "toggle_fullscreen", {}, ["Alt+Enter", "F11"]),
  toggle_focus_mode: n("Toggle focus mode", "toggle_focus_mode"),
  toggle_vertical_tabs: n("Toggle vertical tabs", "toggle_vertical_tabs"),
  toggle_sidebar: n("Toggle sidebar", "toggle_sidebar"),
  toggle_git_sidebar: n("Toggle Git sidebar (source control)", "toggle_sidebar", { view: "git" }, ["Ctrl+Shift+G"]),
  toggle_snippets_sidebar: n("Toggle snippets sidebar", "toggle_sidebar", { view: "snippets" }),
  toggle_vertical_tabs_collapsed: n("Collapse/expand vertical tabs", "toggle_vertical_tabs_collapsed"),
  toggle_always_on_top: n("Toggle always on top", "toggle_always_on_top"),
  open_new_tab_dropdown: n("Open new tab dropdown", "open_new_tab_dropdown", {}, ["Ctrl+Shift+Space"]),
  open_settings: n("Open settings", "open_settings", { target: "settings_ui" }, ["Ctrl+,"]),
  open_settings_toml: n("Open settings file (TOML editor)", "open_settings", { target: "settings_toml" }),
  open_settings_file: n("Open settings file in external editor", "open_settings", { target: "settings_file" }, ["Ctrl+Shift+,"]),
  open_default_settings: n("Open default settings (read-only)", "open_settings", { target: "defaults_file" }, ["Ctrl+Alt+,"]),
  open_settings_pane: n("Open settings in a pane", "open_settings", { target: "settings_pane" }),
  open_settings_directory: n("Open settings directory", "open_settings", { target: "directory" }),
  find: n("Find", "find", {}, ["Ctrl+Shift+F"]),
  find_next: n("Find next match", "find_match", { direction: "next" }),
  find_prev: n("Find previous match", "find_match", { direction: "prev" }),
  toggle_shader_effects: n("Toggle retro terminal effect", "toggle_shader_effects"),
  open_tab_color_picker: n("Set tab color…", "open_tab_color_picker"),
  open_tab_renamer: n("Rename tab…", "open_tab_renamer"),
  reset_tab_title: n("Reset tab title", "rename_tab"),
  reset_tab_color: n("Reset tab color", "set_tab_color"),
  command_palette: n("Toggle command palette", "command_palette", {}, ["Ctrl+Shift+P"], true),
  identify_window: n("Identify window", "identify_window"),
  identify_windows: n("Identify windows", "identify_windows"),
  open_window_renamer: n("Rename window…", "open_window_renamer"),
  quake_mode: n("Show / hide quake window", "quake_mode", {}, ["Win+`"]),
  minimize_to_tray: n("Minimize to notification area", "minimize_to_tray"),
  quit: n("Quit", "quit"),
  restore_last_closed: n("Restore last closed pane or tab", "restore_last_closed"),
  open_about: n("About Terminux", "open_about"),
  show_suggestions: n("Show suggestions", "show_suggestions", { source: "all" }, ["Ctrl+Shift+Period"]),
  show_recent_commands: n("Show recent commands", "show_suggestions", { source: "recent_commands" }),
  save_snippet: n("Save selection or command line as snippet", "save_snippet"),
  open_cwd: n("Open current directory in file manager", "open_cwd"),
  open_file: n("Open file…", "open_file"),
  customize_toolbar: n("Customize toolbar…", "customize_toolbar"),

  // Tabs
  new_tab: n("New tab", "new_tab", {}, ["Ctrl+Shift+T"]),
  new_window: n("New window", "new_window", {}, ["Ctrl+Shift+N"]),
  duplicate_tab: n("Duplicate tab", "duplicate_tab", {}, ["Ctrl+Shift+D"]),
  close_tab: n("Close tab", "close_tab"),
  close_other_tabs: n("Close other tabs", "close_other_tabs"),
  close_tabs_after: n("Close tabs to the right", "close_tabs_after"),
  next_tab: n("Next tab", "next_tab", {}, ["Ctrl+Tab"]),
  prev_tab: n("Previous tab", "prev_tab", {}, ["Ctrl+Shift+Tab"]),
  switch_to_last_tab: n("Switch to the last tab", "switch_to_tab", { index: -1 }, ["Ctrl+Alt+9"], true),
  move_tab_forward: n("Move tab forward", "move_tab", { direction: "forward" }),
  move_tab_backward: n("Move tab backward", "move_tab", { direction: "backward" }),
  move_tab_to_new_window: n("Move tab to new window", "move_tab", { window: "new" }),
  tab_search: n("Search tabs…", "tab_search"),

  // Panes
  close_pane: n("Close pane", "close_pane", {}, ["Ctrl+Shift+W"]),
  close_other_panes: n("Close other panes", "close_other_panes"),
  duplicate_pane_auto: n("Duplicate pane", "split_pane", { split: "auto", split_mode: "duplicate" }, ["Alt+Shift+D"]),
  duplicate_pane_down: n("Duplicate pane down", "split_pane", { split: "down", split_mode: "duplicate" }, ["Alt+Shift+-"]),
  duplicate_pane_right: n("Duplicate pane right", "split_pane", { split: "right", split_mode: "duplicate" }, ["Alt+Shift+Plus"]),
  toggle_pane_zoom: n("Toggle pane zoom", "toggle_pane_zoom"),
  open_pane_renamer: n("Rename pane…", "open_pane_renamer"),
  reset_pane_title: n("Reset pane title", "rename_pane"),
  toggle_split_orientation: n("Toggle split orientation", "toggle_split_orientation"),
  toggle_broadcast_input: n("Toggle broadcast input to all panes", "toggle_broadcast_input"),
  toggle_read_only_mode: n("Toggle read-only mode", "toggle_read_only_mode"),
  enable_read_only_mode: n("Enable read-only mode", "enable_read_only_mode"),
  disable_read_only_mode: n("Disable read-only mode", "disable_read_only_mode"),
  move_pane_to_new_tab: n("Move pane to new tab", "move_pane", { index: -1 }),
  move_pane_to_new_window: n("Move pane to new window", "move_pane", { window: "new" }),
  restart_connection: n("Restart connection", "restart_connection"),
  equalize_panes: n("Equalize panes", "equalize_panes"),

  // Clipboard and selection
  copy: n("Copy", "copy", { single_line: false }, ["Ctrl+C", "Ctrl+Shift+C", "Ctrl+Insert", "Enter"]),
  paste: n("Paste", "paste", {}, ["Ctrl+V", "Ctrl+Shift+V", "Shift+Insert"]),
  select_all: n("Select all", "select_all", {}, ["Ctrl+Shift+A"]),
  mark_mode: n("Toggle mark mode", "mark_mode", {}, ["Ctrl+Shift+M"]),
  toggle_block_selection: n("Toggle block selection", "toggle_block_selection"),
  switch_selection_endpoint: n("Switch selection endpoint", "switch_selection_endpoint"),
  expand_selection_to_word: n("Expand selection to word", "expand_selection_to_word"),
  show_context_menu: n("Show context menu", "show_context_menu", {}, ["Menu"], true),
  search_web: n("Search the web for the selection", "search_web"),
  color_selection: n("Highlight selection", "color_selection"),
  clear_color_selection: n("Clear highlights", "color_selection", { clear: true }),

  // Scrollback
  scroll_up: n("Scroll up", "scroll_up", {}, ["Ctrl+Shift+Up"]),
  scroll_down: n("Scroll down", "scroll_down", {}, ["Ctrl+Shift+Down"]),
  scroll_up_page: n("Scroll up one page", "scroll_up_page", {}, ["Ctrl+Shift+PgUp"]),
  scroll_down_page: n("Scroll down one page", "scroll_down_page", {}, ["Ctrl+Shift+PgDn"]),
  scroll_to_top: n("Scroll to the top", "scroll_to_top", {}, ["Ctrl+Shift+Home"]),
  scroll_to_bottom: n("Scroll to the bottom", "scroll_to_bottom", {}, ["Ctrl+Shift+End"]),
  clear_buffer: n("Clear buffer", "clear_buffer", { clear: "all" }, ["Ctrl+Shift+K"]),
  clear_screen: n("Clear screen", "clear_buffer", { clear: "screen" }),
  clear_scrollback: n("Clear scrollback", "clear_buffer", { clear: "scrollback" }),
  export_buffer: n("Export text…", "export_buffer"),
  add_mark: n("Add scroll mark", "add_mark"),
  clear_mark: n("Clear scroll mark", "clear_mark"),
  clear_all_marks: n("Clear all scroll marks", "clear_all_marks"),
  scroll_to_previous_mark: n("Scroll to previous mark", "scroll_to_mark", { direction: "previous" }, ["Ctrl+Up"]),
  scroll_to_next_mark: n("Scroll to next mark", "scroll_to_mark", { direction: "next" }, ["Ctrl+Down"]),
  scroll_to_first_mark: n("Scroll to first mark", "scroll_to_mark", { direction: "first" }),
  scroll_to_last_mark: n("Scroll to last mark", "scroll_to_mark", { direction: "last" }),
  select_previous_command: n("Select previous command", "select_command", { direction: "prev" }),
  select_next_command: n("Select next command", "select_command", { direction: "next" }),
  select_previous_output: n("Select previous command output", "select_output", { direction: "prev" }),
  select_next_output: n("Select next command output", "select_output", { direction: "next" }),

  // Visual
  increase_font_size: n("Increase font size", "adjust_font_size", { delta: 1 }, ["Ctrl+Plus", "Ctrl+Numpad_Plus"]),
  decrease_font_size: n("Decrease font size", "adjust_font_size", { delta: -1 }, ["Ctrl+Minus", "Ctrl+Numpad_Minus"]),
  reset_font_size: n("Reset font size", "reset_font_size", {}, ["Ctrl+0", "Ctrl+Numpad_0"]),
  increase_pane_font_size: n("Increase pane font size", "adjust_font_size", { delta: 1, pane: true }),
  decrease_pane_font_size: n("Decrease pane font size", "adjust_font_size", { delta: -1, pane: true }),
  reset_pane_font_size: n("Reset pane font size", "reset_font_size", { pane: true }),
  increase_opacity: n("Increase opacity", "adjust_opacity", { opacity: 10, relative: true }),
  decrease_opacity: n("Decrease opacity", "adjust_opacity", { opacity: -10, relative: true }),
};

for (const d of DIRS) {
  COMMANDS[`split_pane_${d}`] = n(`Split pane ${d}`, "split_pane", { split: d });
  COMMANDS[`move_focus_${d}`] = n(`Move focus ${d}`, "move_focus", { direction: d }, [`Alt+${cap(d)}`]);
  COMMANDS[`resize_pane_${d}`] = n(`Resize pane ${d}`, "resize_pane", { direction: d }, [`Alt+Shift+${cap(d)}`]);
  COMMANDS[`swap_pane_${d}`] = n(`Swap pane ${d}`, "swap_pane", { direction: d });
  COMMANDS[`move_pane_${d}`] = n(`Move pane ${d}`, "move_pane", { direction: d }, [`Ctrl+Alt+Shift+${cap(d)}`]);
}
for (const d of FOCUS_EXTRA) {
  COMMANDS[`move_focus_${d}`] = n(`Move focus to ${words(d)} pane`, "move_focus", { direction: d }, d === "previous" ? ["Ctrl+Alt+Left"] : []);
}
for (const d of SWAP_EXTRA) {
  COMMANDS[`swap_pane_${d}`] = n(`Swap with ${words(d)} pane`, "swap_pane", { direction: d });
}
for (let i = 1; i <= 9; i++) {
  COMMANDS[`new_tab_profile_${i}`] = n(`New tab: profile ${i}`, "new_tab", { index: i - 1 }, [`Ctrl+Shift+${i}`], true);
  COMMANDS[`move_pane_to_tab_${i}`] = n(`Move pane to tab ${i}`, "move_pane", { index: i - 1 }, [], true);
  if (i <= 8) COMMANDS[`switch_to_tab_${i}`] = n(`Switch to tab ${i}`, "switch_to_tab", { index: i - 1 }, [`Ctrl+Alt+${i}`], true);
}

// ---------- icons ----------

/** Icon of each action family (`spec.command`). */
const ICON_BY_ACTION: Record<string, string> = {
  close_window: "win-close",
  toggle_fullscreen: "fullscreen",
  toggle_focus_mode: "focus",
  toggle_vertical_tabs: "sidebar",
  toggle_vertical_tabs_collapsed: "sidebar-collapse",
  toggle_always_on_top: "pin",
  open_new_tab_dropdown: "chevron",
  open_settings: "gear",
  find: "search",
  toggle_shader_effects: "sparkle",
  open_tab_color_picker: "color",
  set_tab_color: "undo",
  open_tab_renamer: "pencil",
  rename_tab: "undo",
  command_palette: "command",
  identify_window: "info",
  identify_windows: "info",
  open_window_renamer: "pencil",
  rename_window: "pencil",
  quake_mode: "quake",
  global_summon: "quake",
  minimize_to_tray: "tray",
  quit: "power",
  restore_last_closed: "history",
  open_about: "info",
  show_suggestions: "bulb",
  save_snippet: "snippet",
  open_cwd: "folder",
  customize_toolbar: "sliders",
  new_tab: "plus",
  new_window: "window",
  duplicate_tab: "duplicate",
  close_tab: "close",
  close_other_tabs: "close-others",
  close_tabs_after: "close-right",
  next_tab: "right",
  prev_tab: "left",
  switch_to_tab: "tab",
  tab_search: "search",
  close_pane: "close",
  close_other_panes: "close-others",
  split_pane: "split-right",
  toggle_pane_zoom: "zoom",
  open_pane_renamer: "pencil",
  rename_pane: "undo",
  toggle_split_orientation: "rotate",
  toggle_broadcast_input: "broadcast",
  toggle_read_only_mode: "lock",
  enable_read_only_mode: "lock",
  disable_read_only_mode: "unlock",
  move_pane: "tab",
  restart_connection: "refresh",
  equalize_panes: "equalize",
  copy: "copy",
  paste: "paste",
  select_all: "select-all",
  mark_mode: "cursor",
  toggle_block_selection: "block-select",
  switch_selection_endpoint: "swap",
  expand_selection_to_word: "word",
  show_context_menu: "menu",
  search_web: "globe",
  color_selection: "highlight",
  scroll_up: "up",
  scroll_down: "down",
  scroll_up_page: "page-up",
  scroll_down_page: "page-down",
  scroll_to_top: "to-top",
  scroll_to_bottom: "to-bottom",
  clear_buffer: "trash",
  export_buffer: "export",
  add_mark: "bookmark",
  clear_mark: "bookmark-x",
  clear_all_marks: "bookmark-x",
  scroll_to_mark: "bookmark",
  select_command: "command",
  select_output: "output",
  adjust_font_size: "font-plus",
  reset_font_size: "font",
  adjust_opacity: "opacity",
  move_focus: "focus",
  resize_pane: "resize-h",
  swap_pane: "swap",
  send_input: "terminal",
  multiple_actions: "terminal",
  wt: "terminal",
};

const ARROWS: Record<string, string> = { left: "left", right: "right", up: "up", down: "down" };

/** Icon of an arbitrary action: argument-dependent variants, then the family icon. */
export function actionIcon(spec: ActionSpec): string {
  const dir = typeof spec.direction === "string" ? spec.direction : "";
  switch (spec.command) {
    case "split_pane":
      if (spec.type === "snippets") return "snippet";
      if (spec.type === "git") return "git";
      return spec.split === "down" || spec.split === "up" ? "split-down" : "split-right";
    case "toggle_sidebar":
      if (spec.view === "git") return "git";
      if (spec.view === "snippets") return "snippet";
      return "sidebar";
    case "move_focus":
      return ARROWS[dir] ?? "focus";
    case "resize_pane":
      return dir === "up" || dir === "down" ? "resize-v" : "resize-h";
    case "find_match":
      return dir === "prev" ? "up" : "down";
    case "move_tab":
      if (spec.window) return "window-out";
      return dir === "backward" ? "move-left" : "move-right";
    case "move_pane":
      if (spec.direction) return ARROWS[dir] ?? "swap";
      return spec.window ? "window-out" : "tab";
    case "adjust_font_size":
      return typeof spec.delta === "number" && spec.delta < 0 ? "font-minus" : "font-plus";
    case "color_selection":
      return spec.clear ? "eraser" : "highlight";
    case "open_settings":
      switch (spec.target) {
        case "settings_file":
        case "all_files":
        case "defaults_file":
          return "file";
        case "directory":
          return "folder";
      }
      return "gear";
    case "show_suggestions":
      return spec.source === "recent_commands" ? "history" : "bulb";
  }
  return ICON_BY_ACTION[spec.command] ?? "terminal";
}

for (const c of Object.values(COMMANDS)) c.icon = actionIcon(c.spec);

const iconBySpec = new Map(Object.values(COMMANDS).map((c) => [specKey(c.spec), c.icon!]));

/** Icon of a named command or an action spec. */
export function commandIcon(action: string | ActionSpec): string {
  if (typeof action === "string") {
    const c = COMMANDS[commandName(action) ?? ""];
    return c?.icon ?? actionIcon({ command: action });
  }
  return iconBySpec.get(specKey(action)) ?? actionIcon(action);
}

/** Pre-parity Terminux names still accepted in `[keys]`. */
export const LEGACY_NAMES: Record<string, string> = {
  split_right: "duplicate_pane_right",
  split_down: "duplicate_pane_down",
  zoom: "toggle_pane_zoom",
  equalize: "equalize_panes",
  search: "find",
  palette: "command_palette",
  font_bigger: "increase_font_size",
  font_smaller: "decrease_font_size",
  font_reset: "reset_font_size",
  open_config: "open_settings",
  open_config_external: "open_settings_file",
  open_snippets_pane: "toggle_snippets_sidebar",
  toggle_snippets_pane: "toggle_snippets_sidebar",
  toggle_git_pane: "toggle_git_sidebar",
  ...Object.fromEntries(DIRS.flatMap((d) => [[`focus_${d}`, `move_focus_${d}`], [`resize_${d}`, `resize_pane_${d}`]])),
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`tab_${i + 1}`, `switch_to_tab_${i + 1}`])),
  tab_9: "switch_to_last_tab",
};

/** Canonical name of a `[keys]` entry, or undefined when unknown. */
export function commandName(name: string): string | undefined {
  if (name in COMMANDS) return name;
  const legacy = LEGACY_NAMES[name];
  return legacy in COMMANDS ? legacy : undefined;
}

/** Stable identity of an action (argument order independent). */
export function specKey(spec: ActionSpec): string {
  return JSON.stringify(Object.keys(spec).sort().map((k) => [k, spec[k]]));
}

/** A `[[action]]` table as an action plus its metadata. */
export interface UserAction {
  id?: string;
  name: string;
  icon?: string;
  keys: string[];
  spec: ActionSpec;
}

const META = new Set(["id", "name", "icon", "keys"]);

export const toArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Normalize a table (`command = "x"` + args, WT-style `command = { action = "x", ... }`, or `commands = [...]`). */
export function parseAction(table: Record<string, unknown>): ActionSpec | null {
  if (Array.isArray(table.commands)) {
    const actions = table.commands
      .map((c) => (typeof c === "string" ? { command: c } : c && typeof c === "object" ? parseAction(c as Record<string, unknown>) : null))
      .filter((a): a is ActionSpec => !!a);
    return { command: "multiple_actions", actions };
  }
  const cmd = table.command ?? table.action;
  if (cmd && typeof cmd === "object") return parseAction(cmd as Record<string, unknown>);
  if (typeof cmd !== "string" || !cmd) return null;
  const spec: ActionSpec = { command: cmd };
  for (const [k, v] of Object.entries(table)) {
    if (k !== "command" && k !== "action" && !META.has(k)) spec[k] = v;
  }
  return spec;
}

export function parseUserActions(tables: Record<string, unknown>[]): UserAction[] {
  const out: UserAction[] = [];
  for (const t of tables) {
    const spec = parseAction(t);
    if (!spec) continue;
    out.push({
      id: typeof t.id === "string" ? t.id : undefined,
      name: typeof t.name === "string" && t.name ? t.name : describe(spec),
      icon: typeof t.icon === "string" ? t.icon : undefined,
      keys: toArray(t.keys as string | string[] | undefined).filter((k) => typeof k === "string" && k),
      spec,
    });
  }
  return out;
}

/** Human label of an arbitrary action. */
export function describe(spec: ActionSpec): string {
  const key = specKey(spec);
  for (const c of Object.values(COMMANDS)) if (specKey(c.spec) === key) return c.label;
  const args = Object.entries(spec)
    .filter(([k]) => k !== "command" && k !== "actions")
    .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  return cap(words(spec.command)) + (args.length ? ` (${args.join(", ")})` : "");
}
