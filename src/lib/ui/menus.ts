// Context menus: pane, tab, new-tab dropdown (`new_tab_menu`).
import { commandIcon, type ActionSpec } from "../commands";
import { findProfile, visibleProfiles, type MenuEntry, type Profile } from "../config";
import type { App, TabPosition } from "../state.svelte";
import { sessions } from "../term/session";
import * as tree from "../layout/tree";
import type { MenuItem, MenuRequest } from "./types";

const act = (app: App, label: string, spec: ActionSpec | string, extra: Partial<MenuItem> = {}): MenuItem => ({
  label,
  icon: commandIcon(spec),
  hint: app.keymap.hint(spec),
  run: () => void app.run(spec),
  ...extra,
});

export function paneMenu(app: App, paneId: string, x: number, y: number): MenuRequest {
  const t = app.tab;
  const s = sessions.get(paneId);
  const p = app.panes[paneId];
  const multi = t?.root.kind === "split";
  const hasSel = s?.term.hasSelection() ?? false;
  const groups: MenuItem[][] = [
    [act(app, "Copy", "copy", { disabled: !hasSel }), act(app, "Paste", "paste")],
  ];
  if (hasSel) {
    groups.push([
      act(app, "Search the web", "search_web"),
      act(app, "Highlight selection", "color_selection"),
      act(app, "Save as snippet", "save_snippet"),
    ]);
  }
  if (s?.shell.hasCommands()) {
    groups.push([
      act(app, "Select previous command", "select_previous_command"),
      act(app, "Select previous output", "select_previous_output"),
    ]);
  }
  groups.push([
    {
      label: "Split pane",
      children: [
        [
          act(app, "Duplicate right", "duplicate_pane_right"),
          act(app, "Duplicate down", "duplicate_pane_down"),
          act(app, "Split left", "split_pane_left"),
          act(app, "Split up", "split_pane_up"),
        ],
        visibleProfiles(app.config).map((pr) => ({ label: pr.name, icon: pr.icon, run: () => void app.splitPane({ profile: pr.id, split: "auto" }) })),
      ],
    },
    act(app, t?.zoom ? "Unzoom pane" : "Zoom pane", "toggle_pane_zoom", { disabled: !multi }),
    act(app, "Rename pane…", "open_pane_renamer"),
    act(app, "Swap with previous pane", "swap_pane_previous", { disabled: !multi }),
    act(app, "Toggle split orientation", "toggle_split_orientation", { disabled: !multi }),
    act(app, "Equalize panes", "equalize_panes", { disabled: !multi || !!t?.zoom }),
  ]);
  groups.push([
    act(app, "Find…", "find"),
    act(app, "Add scroll mark", "add_mark"),
    act(app, "Clear buffer", "clear_buffer"),
    act(app, "Export text…", "export_buffer"),
  ]);
  groups.push([
    act(app, "Focus mode", "toggle_focus_mode", { checked: app.focusMode }),
    act(app, "Read-only", "toggle_read_only_mode", { checked: !!p?.readOnly }),
    act(app, "Broadcast input to all panes", "toggle_broadcast_input", { checked: !!t?.broadcast, disabled: !multi }),
    act(app, "Restart connection", "restart_connection"),
  ]);
  groups.push([act(app, "Close other panes", "close_other_panes", { disabled: !multi }), act(app, "Close pane", "close_pane")]);
  return { x, y, groups };
}

/** Tab color presets, grouped by the UI theme they suit best; each group ordered by hue. */
export const TAB_COLORS_DARK = [
  "#c50f1f", "#e74856", "#d13438", "#ca5010", "#f7630c", "#ffb900", "#c19c00", "#8cbd18",
  "#13a10e", "#107c10", "#00b294", "#038387", "#0099bc", "#0078d4", "#4f6bed", "#5c2d91",
  "#8764b8", "#881798", "#b4009e", "#e3008c", "#bf0077", "#7a7574", "#5d5a58", "#486860",
];
export const TAB_COLORS_LIGHT = [
  "#f4abba", "#f1707b", "#f9a07d", "#fdcfb4", "#fde68a", "#fff1a8", "#d9f99d", "#bbf7d0",
  "#86efac", "#99e2b4", "#a7f3d0", "#99f6e4", "#a5f3fc", "#bae6fd", "#93c5fd", "#c7d2fe",
  "#a5b4fc", "#d8b4fe", "#e9d5ff", "#f5d0fe", "#fbcfe8", "#e7e5e4", "#d6d3d1", "#cbd5e1",
];

export function tabMenu(app: App, index: number, x: number, y: number): MenuRequest {
  const t = app.tabs[index];
  const term = t?.kind === "term";
  // Tab-scoped commands act on the active tab: focus this one first.
  const on = (spec: ActionSpec | string) => () => {
    app.gotoTab(app.tabs.indexOf(t));
    void app.run(spec);
  };
  const item = (label: string, spec: ActionSpec | string, extra: Partial<MenuItem> = {}): MenuItem => ({ label, hint: app.keymap.hint(spec), run: on(spec), ...extra });
  const groups: MenuItem[][] = [];
  if (term) {
    groups.push([
      { label: "Color…", run: () => (app.colorPicker = { tabId: t.id, x, y }) },
      { label: "Rename tab", hint: app.keymap.hint("open_tab_renamer"), run: () => (app.renaming = t.id) },
      item("Duplicate tab", "duplicate_tab"),
      item("Split tab", { command: "split_pane", split: "auto", split_mode: "duplicate" }),
      item("Move tab to new window", "move_tab_to_new_window"),
    ]);
    groups.push([item("Export text…", "export_buffer"), item("Find…", "find")]);
  } else if (t) {
    groups.push([item("Move tab to new window", "move_tab_to_new_window")]);
  }
  groups.push([
    { label: "Close tabs to the right", disabled: index >= app.tabs.length - 1, run: () => void app.closeTabs((_x, i) => i <= index) },
    { label: "Close other tabs", disabled: app.tabs.length < 2, run: () => void app.closeTabs((_x, i) => i === index) },
    { label: "Close tab", run: () => void app.closeTab(app.tabs.indexOf(t)) },
  ]);
  groups.push(tabLayoutGroup(app));
  return { x, y, groups };
}

const POSITIONS: [TabPosition, string][] = [["top", "Top"], ["left", "Left"], ["right", "Right"]];

/** Reopen closed tab + tab position: shared by the tab menu and the tab bar menu. */
function tabLayoutGroup(app: App): MenuItem[] {
  const pos = app.tabPosition;
  return [
    act(app, "Reopen closed tab", "restore_last_closed", { disabled: !app.canRestoreClosed }),
    {
      label: "Tab position",
      children: [POSITIONS.map(([p, label]) => ({ label, checked: pos === p, run: () => app.setTabPosition(p) }))],
    },
    act(app, "Collapse vertical tabs", "toggle_vertical_tabs_collapsed", { checked: pos !== "top" && app.verticalCollapsed, disabled: pos === "top" }),
  ];
}

/** Right-click on the empty part of the tab bar / vertical tab panel. */
export function tabBarMenu(app: App, x: number, y: number): MenuRequest {
  const entries = app.config.new_tab_menu?.length ? app.config.new_tab_menu : [{ type: "remaining_profiles" as const }];
  const profiles = expandMenu(app, entries);
  return {
    x,
    y,
    groups: [
      [
        act(app, "New tab", "new_tab", { icon: "plus" }),
        { label: "New tab with profile", children: profiles.length ? profiles : [[{ label: "(empty)", disabled: true }]] },
      ],
      tabLayoutGroup(app),
      [
        act(app, "Focus mode", "toggle_focus_mode", { checked: app.focusMode }),
        act(app, "Always on top", "toggle_always_on_top", { checked: app.alwaysOnTop }),
        act(app, "Fullscreen", "toggle_fullscreen", { checked: app.fullscreen }),
      ],
      [
        act(app, "Customize toolbar…", "customize_toolbar"),
        act(app, "Settings", "open_settings", { icon: "gear" }),
        act(app, "Command palette", "command_palette", { icon: "search" }),
      ],
    ],
  };
}

/** Right-click on the toolbar; `index` is the raw entry under the pointer, if any. */
export function toolbarMenu(app: App, index: number | null, x: number, y: number): MenuRequest {
  const items = app.toolbarItems;
  const pos = items.findIndex((it) => it.index === index);
  const groups: MenuItem[][] = [[act(app, "Customize toolbar…", "customize_toolbar")]];
  if (pos >= 0) {
    const prev = items[pos - 1];
    const next = items[pos + 1];
    groups.push([
      { label: "Move left", icon: "move-left", disabled: !prev, run: () => app.moveToolbarItem(items[pos].index, -1) },
      { label: "Move right", icon: "move-right", disabled: !next, run: () => app.moveToolbarItem(items[pos].index, 1) },
      { label: "Remove from toolbar", icon: "close", run: () => app.removeFromToolbar(items[pos].index) },
    ]);
  }
  groups.push([
    { label: "Add separator", icon: "menu", run: () => app.addToToolbar("separator", pos >= 0 ? items[pos].index + 1 : undefined) },
  ]);
  groups.push([{ label: "Reset toolbar", icon: "undo", disabled: !app.toolbarCustomized, run: () => app.resetToolbar() }]);
  return { x, y, groups };
}

function profileItem(app: App, p: Profile, icon?: string): MenuItem {
  const i = visibleProfiles(app.config).indexOf(p);
  return {
    label: p.name,
    icon: icon ?? p.icon ?? "terminal",
    hint: i >= 0 && i < 9 ? app.keymap.hint(`new_tab_profile_${i + 1}`) : undefined,
    run: () => app.newTab({ profile: p.id }),
  };
}

/** Expand `new_tab_menu` entries (Windows Terminal semantics). */
export function expandMenu(app: App, entries: MenuEntry[]): MenuItem[][] {
  const profiles = visibleProfiles(app.config);
  const used = new Set<string>();
  const collect = (list: MenuEntry[]) => {
    for (const e of list) {
      if (e.type === "profile") {
        const p = findProfile(app.config, e.profile);
        if (p) used.add(p.id);
      } else if (e.type === "folder") collect(e.entries ?? []);
    }
  };
  collect(entries);
  const matches = (e: MenuEntry, p: Profile) =>
    (!e.name || p.name === e.name) &&
    (!e.source || (p.source ?? "") === e.source) &&
    (!e.commandline || [p.cmd, ...p.args].join(" ") === e.commandline);

  const build = (list: MenuEntry[]): MenuItem[][] => {
    const groups: MenuItem[][] = [[]];
    const push = (it: MenuItem) => groups[groups.length - 1].push(it);
    for (const e of list) {
      switch (e.type) {
        case "separator":
          groups.push([]);
          break;
        case "profile": {
          const p = findProfile(app.config, e.profile);
          if (p) push(profileItem(app, p, e.icon));
          break;
        }
        case "remaining_profiles":
          for (const p of profiles) if (!used.has(p.id)) push(profileItem(app, p));
          break;
        case "match_profiles":
          for (const p of profiles) if (matches(e, p)) {
            used.add(p.id);
            push(profileItem(app, p));
          }
          break;
        case "action": {
          const a = e.id ? app.userAction(e.id) : undefined;
          if (a) push({ label: a.name, icon: e.icon ?? a.icon, hint: app.keymap.hint(a.spec), run: () => void app.run(a.spec) });
          break;
        }
        case "folder": {
          const children = build(e.entries ?? []).filter((g) => g.length);
          const count = children.flat().length;
          if (!count && e.allow_empty === false) break;
          if (e.inline && count === 1) push(children[0][0]);
          else push({ label: e.name ?? "Folder", icon: e.icon ?? "folder", children: count ? children : [[{ label: "(empty)", disabled: true }]] });
          break;
        }
      }
    }
    return groups.filter((g) => g.length);
  };
  return build(entries);
}

export function newTabMenu(app: App, x: number, y: number): MenuRequest {
  const entries = app.config.new_tab_menu?.length ? app.config.new_tab_menu : [{ type: "remaining_profiles" as const }];
  const groups = expandMenu(app, entries);
  groups.push([
    { label: "Settings", icon: "gear", hint: app.keymap.hint("open_settings"), run: () => app.openEditor("config") },
    { label: "Command palette", icon: "search", hint: app.keymap.hint("command_palette"), run: () => void app.run("command_palette") },
    { label: "About", icon: "info", run: () => (app.about = true) },
  ]);
  return { x, y, groups };
}

/** Panes of a tab, for badges. */
export const paneCount = (app: App, i: number) => tree.paneIds(app.tabs[i].root).length;

/** Context menu of the settings editors (config.toml / read-only defaults). */
export function editorMenu(
  app: App,
  x: number,
  y: number,
  ed: { readonly: boolean; hasSel: boolean; copy: () => void; cut: () => void; paste: () => void; selectAll: () => void; find: () => void; save: () => void },
): MenuRequest {
  const groups: MenuItem[][] = [
    ed.readonly
      ? [{ label: "Copy", disabled: !ed.hasSel, run: ed.copy }]
      : [
          { label: "Cut", disabled: !ed.hasSel, run: ed.cut },
          { label: "Copy", disabled: !ed.hasSel, run: ed.copy },
          { label: "Paste", run: ed.paste },
        ],
    [
      { label: "Select all", hint: "Ctrl+A", run: ed.selectAll },
      { label: "Find…", hint: "Ctrl+F", run: ed.find },
    ],
  ];
  if (!ed.readonly) groups.push([{ label: "Save", hint: "Ctrl+S", disabled: !app.configDirty, run: ed.save }]);
  groups.push([act(app, "Focus mode", "toggle_focus_mode", { checked: app.focusMode })]);
  return { x, y, groups };
}
