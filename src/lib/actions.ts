// Action handlers: `spec.command` → behavior. Return `false` when not handled so the key reaches the terminal.
import { invoke } from "@tauri-apps/api/core";
import type { ActionSpec } from "./commands";
import type { App, NewPaneArgs, SplitArgs } from "./state.svelte";
import type { Direction } from "./layout/tree";
import type { MarkDirection } from "./term/marks";
import { commandPalette, colorSchemePalette, suggestionsPalette, tabSearchPalette } from "./ui/palettes";
import { newTabMenu } from "./ui/menus";
import { saveSnippet } from "./snippets";
import * as windows from "./windows";
import { settingsDoc } from "./settings/doc.svelte";

export interface ActionContext {
  event?: KeyboardEvent;
}

type Handler = (app: App, spec: ActionSpec, ctx: ActionContext) => unknown;

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const norm = (s: unknown) => (str(s) ?? "").toLowerCase().replace(/[_-]/g, "");

/** Commands that stay global while text is being edited (settings tab, palette, inputs). */
export const GLOBAL_COMMANDS = new Set([
  "new_tab", "new_window", "close_tab", "close_pane", "close_window", "next_tab", "prev_tab", "switch_to_tab",
  "command_palette", "open_settings", "toggle_fullscreen", "toggle_focus_mode", "toggle_vertical_tabs", "toggle_always_on_top",
  "adjust_font_size", "reset_font_size", "quit", "open_new_tab_dropdown", "tab_search", "restore_last_closed",
  "quake_mode", "global_summon", "minimize_to_tray", "identify_window", "identify_windows", "customize_toolbar",
]);

const term = (app: App) => (app.tab?.kind === "term" ? app.session : undefined);

/** Run with the active terminal, or report "not handled". */
const withTerm = (f: (s: NonNullable<ReturnType<typeof term>>, app: App, spec: ActionSpec) => unknown): Handler => (app, spec) => {
  const s = term(app);
  if (!s) return false;
  const r = f(s, app, spec);
  return r === false ? false : true;
};

const paneArgs = (spec: ActionSpec): NewPaneArgs => spec as unknown as NewPaneArgs;

export async function runAll(app: App, specs: ActionSpec[]) {
  for (const s of specs) await app.run(s);
}

const SCROLL: Record<string, (s: NonNullable<ReturnType<typeof term>>, spec: ActionSpec) => void> = {
  scroll_up: (s, spec) => s.term.scrollLines(-(num(spec.rows_to_scroll) ?? 1)),
  scroll_down: (s, spec) => s.term.scrollLines(num(spec.rows_to_scroll) ?? 1),
  scroll_up_page: (s) => s.term.scrollPages(-1),
  scroll_down_page: (s) => s.term.scrollPages(1),
  scroll_to_top: (s) => s.term.scrollToTop(),
  scroll_to_bottom: (s) => s.term.scrollToBottom(),
};

export const ACTIONS: Record<string, Handler> = {
  unbound: () => false,

  // ---------- application ----------
  close_window: (app) => windows.closeWindow(app),
  toggle_fullscreen: (app) => windows.toggleFullscreen(app),
  toggle_focus_mode: (app) => {
    app.focusMode = !app.focusMode;
  },
  toggle_vertical_tabs: (app) => app.toggleVerticalTabs(),
  toggle_vertical_tabs_collapsed: (app) => {
    if (app.tabPosition === "top") return false;
    app.setVerticalCollapsed(!app.verticalCollapsed);
  },
  toggle_always_on_top: (app) => windows.toggleAlwaysOnTop(app),
  open_new_tab_dropdown: (app) => {
    const at = app.dropdownAnchor?.() ?? { x: 40, y: 34 };
    app.menu = newTabMenu(app, at.x, at.y);
  },
  open_settings: (app, spec) => {
    switch (norm(spec.target)) {
      case "settingsfile":
      case "allfiles":
        invoke("open_config").catch(console.error);
        break;
      case "defaultsfile":
        app.openEditor("defaults");
        break;
      case "settingspane":
        app.openEditorPane("config");
        break;
      case "defaultspane":
        app.openEditorPane("defaults");
        break;
      case "directory":
        invoke("open_path", { path: "." }).catch(console.error);
        break;
      default: {
        // settings_ui / settings_toml pick the view; no target: the last one used.
        const t = norm(spec.target);
        const view = t === "settingstoml" ? "toml" : t === "settingsui" ? "ui" : settingsDoc.view;
        if (app.tab?.kind === "config" && settingsDoc.view === view) app.closeTab();
        else if (app.activePane && app.activePane === app.editorPane("config")) {
          if (settingsDoc.view === view) app.closePane(app.activePane);
          else settingsDoc.setView(view);
        }
        else {
          settingsDoc.setView(view);
          app.openEditor("config");
        }
      }
    }
  },
  find: (app) => {
    if (app.tab?.kind !== "term") return false;
    app.toggleSearch();
  },
  find_match: (app, spec) => app.findMatch(str(spec.direction) ?? "next"),
  toggle_shader_effects: (app) => app.toggleRetro(),
  command_palette: (app) => {
    app.palette = app.palette ? null : commandPalette(app);
    if (!app.palette) app.focusCurrent();
  },
  customize_toolbar: (app) => {
    // Settings UI, Toolbar page.
    settingsDoc.page = "toolbar";
    settingsDoc.setView("ui");
    if (app.tab?.kind !== "config") app.openEditor("config");
  },
  identify_window: (app) => windows.identify(app, false),
  identify_windows: (app) => windows.identify(app, true),
  open_window_renamer: async (app) => {
    const name = await app.promptText("Rename window", app.windowName ?? "", "Window name");
    if (name !== null) windows.renameWindow(app, name);
    app.focusCurrent();
  },
  rename_window: (app, spec) => windows.renameWindow(app, str(spec.name) ?? null),
  quake_mode: () => invoke("summon", { args: { name: "_quake" } }).catch(console.error),
  global_summon: (_app, spec) => invoke("summon", { args: spec }).catch(console.error),
  minimize_to_tray: () => invoke("minimize_to_tray").catch(console.error),
  quit: (app) => windows.quit(app),
  restore_last_closed: (app) => app.restoreLastClosed(),
  open_about: (app) => {
    app.about = true;
  },
  show_suggestions: withTerm((s, app, spec) => {
    app.palette = suggestionsPalette(app, s, spec.source, spec.use_commandline === true);
  }),
  save_snippet: (app) => saveSnippet(app),
  open_cwd: withTerm(async (s) => {
    const cwd = await s.cwdNow();
    if (cwd) await invoke("open_path", { path: cwd }).catch(console.error);
  }),
  send_input: withTerm((s, _app, spec) => {
    const input = str(spec.input);
    if (!input) return false;
    s.input(input);
  }),
  multiple_actions: (app, spec) => runAll(app, Array.isArray(spec.actions) ? (spec.actions as ActionSpec[]) : []),
  wt: async (app, spec) => {
    const line = str(spec.commandline);
    if (!line) return false;
    await windows.runCommandLine(app, line);
  },

  // ---------- tabs ----------
  new_tab: (app, spec) => app.newTab(paneArgs(spec)),
  new_window: (app, spec) => windows.newWindow(app, paneArgs(spec)),
  duplicate_tab: (app) => {
    if (app.tab?.kind !== "term") return false;
    app.duplicateTab();
  },
  close_tab: (app, spec) => app.closeTab(num(spec.index) ?? app.activeTab),
  close_other_tabs: (app, spec) => {
    const keep = num(spec.index) ?? app.activeTab;
    return app.closeTabs((_t, i) => i === keep);
  },
  close_tabs_after: (app, spec) => {
    const keep = num(spec.index) ?? app.activeTab;
    return app.closeTabs((_t, i) => i <= keep);
  },
  next_tab: (app, spec) => app.cycleTab(1, spec.tab_switcher_mode),
  prev_tab: (app, spec) => app.cycleTab(-1, spec.tab_switcher_mode),
  switch_to_tab: (app, spec) => app.gotoTab(num(spec.index) ?? 0),
  move_tab: (app, spec) => {
    const target = spec.window;
    if (target !== undefined && target !== null) return windows.moveTabToWindow(app, app.activeTab, String(target));
    const d = norm(spec.direction) === "backward" ? -1 : 1;
    return app.moveTab(app.activeTab, app.activeTab + d);
  },
  tab_search: (app) => {
    app.palette = app.palette ? null : tabSearchPalette(app);
  },
  open_tab_renamer: (app) => {
    if (app.tab) app.renaming = app.tab.id;
  },
  open_pane_renamer: (app) => {
    if (app.activePane) app.renamingPane = app.activePane;
  },
  rename_pane: (app, spec) => app.renamePane(app.activePane, str(spec.title) ?? null),
  rename_tab: (app, spec) => app.renameTab(app.activeTab, str(spec.title) ?? null),
  open_tab_color_picker: (app) => {
    const t = app.tab;
    if (!t) return false;
    const el = document.querySelector<HTMLElement>(`[data-tab-id="${t.id}"]`);
    const r = el?.getBoundingClientRect();
    app.colorPicker = { tabId: t.id, x: r ? r.left : 40, y: r ? r.bottom + 4 : 40 };
  },
  set_tab_color: (app, spec) => app.setTabColor(app.activeTab, str(spec.color) ?? null),

  // ---------- panes ----------
  close_pane: (app) => (app.tab?.kind === "term" ? app.closePane() : app.closeTab()),
  close_other_panes: (app) => app.closeOtherPanes(),
  split_pane: (app, spec) => app.splitPane(spec as unknown as SplitArgs),
  toggle_pane_zoom: (app) => app.toggleZoom(),
  toggle_split_orientation: (app) => app.toggleSplitOrientation(),
  toggle_broadcast_input: (app) => app.toggleBroadcast(),
  toggle_read_only_mode: (app) => app.setReadOnly(),
  enable_read_only_mode: (app) => app.setReadOnly(true),
  disable_read_only_mode: (app) => app.setReadOnly(false),
  move_pane: (app, spec) => {
    if (str(spec.direction)) return app.movePaneDir(str(spec.direction)!);
    if (spec.window !== undefined && spec.window !== null) return windows.movePaneToWindow(app, String(spec.window));
    return app.movePane(num(spec.index) ?? -1);
  },
  restart_connection: withTerm((s) => s.restart()),
  equalize_panes: (app) => app.equalize(),
  move_focus: (app, spec) => app.moveFocus(str(spec.direction) ?? "left"),
  swap_pane: (app, spec) => app.swapPane(str(spec.direction) ?? "left"),
  resize_pane: (app, spec) => {
    const t = app.tab;
    if (!t || t.root.kind === "pane") return false;
    app.resizePane((str(spec.direction) ?? "right") as Direction);
  },

  // ---------- clipboard / selection ----------
  copy: (app, spec) => app.copy(spec as Parameters<App["copy"]>[0]),
  paste: (app, _spec, ctx) => {
    if (app.tab?.kind !== "term") return false;
    app.paste(ctx);
  },
  select_all: withTerm((s) => s.term.selectAll()),
  mark_mode: withTerm((s) => s.markMode.toggle()),
  toggle_block_selection: withTerm((s) => s.markMode.toggleBlock()),
  switch_selection_endpoint: withTerm((s) => (s.markMode.active ? s.markMode.switchEndpoint() : false)),
  expand_selection_to_word: withTerm((s) => s.markMode.expandToWord()),
  show_context_menu: (app) => {
    const s = term(app);
    if (!s || !app.activePane) return false;
    const r = s.el.getBoundingClientRect();
    s.el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, ctrlKey: true, clientX: r.left + 40, clientY: r.top + 40 }));
  },
  search_web: (app, spec) => app.searchWeb(str(spec.query_url)),
  color_selection: withTerm((s, _app, spec) => {
    if (spec.clear) return s.clearHighlights();
    if (!s.term.hasSelection()) return false;
    const fg = str(spec.foreground);
    s.highlight(str(spec.background) ?? fg ?? "#7a6420aa", spec.match_mode === "all" || norm(spec.match_mode) === "all");
  }),

  // ---------- scrollback ----------
  ...Object.fromEntries(Object.entries(SCROLL).map(([k, f]) => [k, withTerm((s, _a, spec) => f(s, spec))])),
  clear_buffer: withTerm((s, _app, spec) => s.clearBuffer(norm(spec.clear) || "all")),
  export_buffer: withTerm(async (s, app, spec) => {
    const path = str(spec.path) || null;
    const defaultName = `${app.tabTitle(app.tab!).replace(/[\\/:*?"<>|]/g, "_") || "terminal"}.txt`;
    try {
      const written = await invoke<string | null>("save_text", { path, defaultName, text: s.exportText() });
      if (written) app.toast(`Exported to ${written}`);
    } catch (e) {
      app.toast(`Export failed: ${e}`, "error");
    }
  }),
  add_mark: withTerm((s, _app, spec) => {
    s.marks.add("user", str(spec.color));
  }),
  clear_mark: withTerm((s) => s.marks.clearCurrent()),
  clear_all_marks: withTerm((s) => s.marks.clearAll()),
  scroll_to_mark: withTerm((s, _app, spec) => s.marks.scrollTo((norm(spec.direction) || "previous") as MarkDirection)),
  select_command: withTerm((s, _app, spec) => s.shell.selectCommand(norm(spec.direction) === "next" ? "next" : "prev")),
  select_output: withTerm((s, _app, spec) => s.shell.selectOutput(norm(spec.direction) === "next" ? "next" : "prev")),

  // ---------- visual ----------
  adjust_font_size: (app, spec) => app.adjustFont(num(spec.delta) ?? 1),
  reset_font_size: (app) => app.resetFont(),
  adjust_opacity: (app, spec) => {
    if (!term(app)) return false;
    app.adjustOpacity(num(spec.opacity) ?? 0, spec.relative !== false);
  },
  set_color_scheme: (app, spec) => {
    if (!term(app)) return false;
    const name = str(spec.color_scheme);
    if (name) app.setColorScheme(name);
    else app.palette = colorSchemePalette(app);
  },
};
