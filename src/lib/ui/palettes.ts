// Palette contents: command palette, tab search, color schemes, suggestions.
import { COMMANDS, commandIcon, describe } from "../commands";
import { visibleProfiles } from "../config";
import { schemeNames } from "../schemes";
import { tasks } from "../snippets";
import type { App } from "../state.svelte";
import type { TermSession } from "../term/session";
import type { PaletteItem, PaletteView } from "./types";

const SPLITS = ["auto", "right", "down", "left", "up"] as const;

export function colorSchemeItems(app: App): PaletteItem[] {
  const s = app.session;
  const id = app.activePane;
  const current = s?.look.schemeName;
  return schemeNames(app.config).map((name) => ({
    label: name,
    detail: name === current ? "current" : undefined,
    run: () => app.setColorScheme(name, id),
    preview: () => app.setColorScheme(name, id),
  }));
}

/** Scheme picker with live preview; Escape restores the previous scheme. */
export function colorSchemePalette(app: App): PaletteView {
  const id = app.activePane;
  const before = id ? app.panes[id]?.spec.colorScheme : undefined;
  return { placeholder: "Select a color scheme…", items: colorSchemeItems(app), onCancel: () => app.setColorScheme(before, id) };
}

export function commandPalette(app: App): PaletteView {
  const hint = (name: string) => app.keymap.hint(name);
  const items: PaletteItem[] = [];
  const profiles = visibleProfiles(app.config);
  items.push({
    label: "New tab…",
    children: () => profiles.map((p, i) => ({ label: p.name, icon: p.icon, hint: i < 9 ? hint(`new_tab_profile_${i + 1}`) : undefined, run: () => app.newTab({ profile: p.id }) })),
  });
  items.push({
    label: "Split pane…",
    children: () =>
      profiles.map((p) => ({
        label: `${p.name}…`,
        icon: p.icon,
        children: () => SPLITS.map((split) => ({ label: `Split ${split === "auto" ? "(auto)" : split}`, run: () => app.splitPane({ profile: p.id, split }) })),
      })),
  });
  const term = app.tab?.kind === "term";
  if (term) {
    items.push({ label: "Select color scheme…", children: () => colorSchemeItems(app) });
    items.push({
      label: "Set background opacity…",
      children: () => [0, 25, 50, 75, 100].map((o) => ({ label: `${o}%`, run: () => app.adjustOpacity(o, false) })),
    });
    items.push({
      label: "Move pane to tab…",
      children: () => [
        ...app.tabs.map((t, i) => ({ label: `${i + 1}. ${app.tabTitle(t)}`, run: () => app.movePane(i) })),
        { label: "New tab", run: () => app.movePane(-1) },
      ],
    });
  }
  items.push({
    label: "Switch to tab…",
    children: () => tabItems(app),
  });
  for (const [name, c] of Object.entries(COMMANDS)) {
    if (c.hidden) continue;
    items.push({ id: name, label: c.label, icon: c.icon, hint: hint(name), run: () => app.run(c.spec) });
  }
  for (const a of app.userActions) items.push({ id: `action:${a.name}`, label: a.name, icon: a.icon ?? commandIcon(a.spec), hint: app.keymap.hint(a.spec), run: () => app.run(a.spec) });
  return {
    placeholder: "Type a command, or delete \">\" to run a command line (new-tab -p python ; split-pane -H)…",
    query: ">",
    items,
    commandline: (text) => void app.run({ command: "wt", commandline: text }),
    recentKey: "terminux.paletteRecent",
  };
}

function tabItems(app: App): PaletteItem[] {
  return app.tabs.map((t, i) => ({
    label: app.tabTitle(t) || "Terminal",
    detail: i === app.activeTab ? "current" : undefined,
    hint: String(i + 1),
    run: () => app.gotoTab(i),
  }));
}

export function tabSearchPalette(app: App): PaletteView {
  return { placeholder: "Search open tabs…", items: tabItems(app) };
}

/** Replace the command line being typed with `text` (no Enter). */
function typeCommand(s: TermSession, text: string, replace: boolean) {
  const current = replace ? s.shell.currentCommandLine() : "";
  s.input("\x7f".repeat([...current].length) + text);
}

export function suggestionsPalette(app: App, s: TermSession, source: unknown, useCommandline: boolean): PaletteView {
  const sources = new Set((Array.isArray(source) ? source : [source ?? "all"]).map((x) => String(x).toLowerCase().replace(/[_-]/g, "")));
  const all = sources.has("all");
  const items: PaletteItem[] = [];
  if (all || sources.has("recentcommands")) {
    for (const cmd of s.shell.recentCommands()) items.push({ label: cmd, detail: "recent", run: () => typeCommand(s, cmd, true) });
  }
  if (all || sources.has("tasks")) {
    for (const t of tasks(app)) items.push({ label: t.name, detail: describe(t.spec) === t.name ? "task" : String(t.spec.input).trim(), run: () => s.input(String(t.spec.input)) });
  }
  return {
    placeholder: s.shell.active || items.length ? "Suggestions…" : "No suggestions: enable shell integration or add send_input actions",
    items,
    query: useCommandline ? s.shell.currentCommandLine() : "",
  };
}
