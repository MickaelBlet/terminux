import { describe, expect, it } from "vitest";
import { COMMANDS, commandIcon, parseUserActions } from "./commands";
import { canonicalEntry, DEFAULT_TOOLBAR, moveEntry, resolveToolbar, toolbarEntries } from "./toolbar";
import { ICONS } from "./ui/icons";

const actions = parseUserActions([{ id: "ls", name: "List", command: "send_input", input: "ls\r" }]);
const userAction = (id: string) => actions.find((a) => a.id === id);

describe("command icons", () => {
  it("every command has a built-in icon", () => {
    for (const [name, c] of Object.entries(COMMANDS)) expect(c.icon && c.icon in ICONS, name).toBe(true);
  });
  it("resolves icons by name, legacy name and spec", () => {
    expect(commandIcon("duplicate_pane_down")).toBe("split-down");
    expect(commandIcon("zoom")).toBe("zoom");
    expect(commandIcon({ command: "adjust_font_size", delta: -2 })).toBe("font-minus");
    expect(commandIcon({ command: "send_input", input: "x" })).toBe("terminal");
  });
});

describe("toolbar", () => {
  it("default matches the previous fixed buttons", () => {
    expect(resolveToolbar(DEFAULT_TOOLBAR, userAction).map((i) => i.id)).toEqual(DEFAULT_TOOLBAR);
  });
  it("resolves legacy names, action ids and drops unknown entries", () => {
    const items = resolveToolbar(["zoom", "nope", "ls"], userAction);
    expect(items.map((i) => [i.index, i.id])).toEqual([
      [0, "toggle_pane_zoom"],
      [2, "ls"],
    ]);
    expect(items[1]).toMatchObject({ label: "List", icon: "terminal", spec: { command: "send_input" } });
  });
  it("collapses doubled separators", () => {
    const ids = resolveToolbar(["find", "separator", "nope", "separator", "copy", "separator"], userAction).map((i) => i.id);
    expect(ids).toEqual(["find", "separator", "copy", "separator"]);
  });
  it("validates entries", () => {
    expect(toolbarEntries(["find", 1, ""])).toEqual(["find"]);
    expect(toolbarEntries("find")).toBeNull();
    expect(canonicalEntry("search", userAction)).toBe("find");
    expect(canonicalEntry("ls", userAction)).toBe("ls");
    expect(canonicalEntry("nope", userAction)).toBeUndefined();
  });
  it("moves entries by display position, keeping unknown ones", () => {
    const raw = ["find", "nope", "copy", "paste"];
    const items = resolveToolbar(raw, userAction);
    expect(moveEntry(raw, items, 0, 2)).toEqual(["nope", "copy", "paste", "find"]);
    expect(moveEntry(raw, items, 2, 0)).toEqual(["paste", "find", "nope", "copy"]);
    expect(moveEntry(raw, items, 1, 1)).toBeNull();
  });
});
