// Title-bar toolbar: entries are command names (legacy names accepted), `[[action]]` ids or "separator".
import { COMMANDS, commandIcon, commandName, type ActionSpec, type UserAction } from "./commands";

export const SEPARATOR = "separator";

export const DEFAULT_TOOLBAR = ["duplicate_pane_right", "duplicate_pane_down", "toggle_pane_zoom", "find", SEPARATOR, "open_settings"];

export interface ToolbarItem {
  /** Position in the raw entry list (unknown entries are skipped, not removed). */
  index: number;
  /** Canonical entry: command name, action id or "separator". */
  id: string;
  separator?: boolean;
  label: string;
  icon: string;
  spec: ActionSpec;
}

/** Valid entry list from config / storage, or null. */
export function toolbarEntries(v: unknown): string[] | null {
  return Array.isArray(v) ? v.filter((e): e is string => typeof e === "string" && !!e) : null;
}

/** Canonical form of an entry, or undefined when it names nothing. */
export function canonicalEntry(entry: string, userAction: (id: string) => UserAction | undefined): string | undefined {
  if (entry === SEPARATOR) return entry;
  return commandName(entry) ?? (userAction(entry) ? entry : undefined);
}

export function resolveToolbar(entries: string[], userAction: (id: string) => UserAction | undefined): ToolbarItem[] {
  const out: ToolbarItem[] = [];
  entries.forEach((entry, index) => {
    if (entry === SEPARATOR) {
      // Doubled separators collapse (leading / trailing ones stay visible so they can be moved).
      if (!out[out.length - 1]?.separator) out.push({ index, id: entry, separator: true, label: "", icon: "", spec: { command: "unbound" } });
      return;
    }
    const name = commandName(entry);
    if (name) {
      const c = COMMANDS[name];
      out.push({ index, id: name, label: c.label, icon: c.icon ?? "terminal", spec: c.spec });
      return;
    }
    const a = userAction(entry);
    if (a) out.push({ index, id: entry, label: a.name, icon: a.icon ?? commandIcon(a.spec), spec: a.spec });
  });
  return out;
}

/** Raw entries with the item at display position `from` moved to display position `to`; null when nothing moves. */
export function moveEntry(entries: string[], items: ToolbarItem[], from: number, to: number): string[] | null {
  if (from === to || !items[from] || !items[to]) return null;
  const list = [...entries];
  const [entry] = list.splice(items[from].index, 1);
  // Moving right lands after the target (its raw index shifted by the removal), moving left before it.
  list.splice(items[to].index, 0, entry);
  return list;
}
