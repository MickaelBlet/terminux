import { describe, expect, it } from "vitest";
import { COMMANDS, commandName, describe as label, parseAction, parseUserActions, specKey } from "./commands";
import { Keymap, parseCombo } from "./keys";

const key = (k: string, code: string, mods: Partial<KeyboardEvent> = {}) =>
  ({ key: k, code, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods }) as KeyboardEvent;

describe("commands", () => {
  it("maps legacy names", () => {
    expect(commandName("zoom")).toBe("toggle_pane_zoom");
    expect(commandName("tab_3")).toBe("switch_to_tab_3");
    expect(commandName("nope")).toBeUndefined();
  });
  it("parses action tables", () => {
    expect(parseAction({ command: "send_input", input: "ls\r", name: "x", keys: "F5" })).toEqual({ command: "send_input", input: "ls\r" });
    expect(parseAction({ command: { action: "new_tab", profile: "a" } })).toEqual({ command: "new_tab", profile: "a" });
    expect(parseAction({ commands: ["find", { command: "split_pane", split: "up" }] })).toEqual({
      command: "multiple_actions",
      actions: [{ command: "find" }, { command: "split_pane", split: "up" }],
    });
    expect(parseAction({ name: "x" })).toBeNull();
  });
  it("labels actions", () => {
    expect(label({ command: "find" })).toBe("Find");
    expect(label({ command: "send_input", input: "x" })).toBe('Send input (input: x)');
    expect(specKey({ a: 1, command: "x" } as never)).toBe(specKey({ command: "x", a: 1 } as never));
  });
});

describe("keymap", () => {
  it("parses combos", () => {
    expect(parseCombo("Alt+Shift+Plus")?.key).toBe("=");
    expect(parseCombo("Ctrl+Shift+PgUp")?.key).toBe("pageup");
    expect(parseCombo("Win+`")).toMatchObject({ meta: true, key: "`" });
    expect(parseCombo("Ctrl++")?.key).toBe("+");
    expect(parseCombo("Ctrl")).toBeNull();
  });
  it("uses Windows Terminal defaults", () => {
    const k = new Keymap();
    expect(k.match(key("D", "KeyD", { ctrlKey: true, shiftKey: true }))?.command).toBe("duplicate_tab");
    expect(k.match(key("3", "Digit3", { ctrlKey: true, altKey: true }))).toEqual({ command: "switch_to_tab", index: 2 });
    expect(k.match(key("+", "Equal", { altKey: true, shiftKey: true }))).toMatchObject({ command: "split_pane", split: "right" });
    expect(k.match(key("v", "KeyV", { ctrlKey: true }))?.command).toBe("paste");
    expect(k.match(key("ArrowLeft", "ArrowLeft", { altKey: true }))).toEqual({ command: "move_focus", direction: "left" });
    expect(k.hint("find")).toBe("Ctrl+Shift+F");
  });
  it("applies overrides, unbinding and legacy names", () => {
    const k = new Keymap({ paste: "", zoom: "Ctrl+Shift+Z", find: ["F3", "Ctrl+Shift+F"] });
    expect(k.match(key("v", "KeyV", { ctrlKey: true }))).toBeNull();
    expect(k.match(key("Z", "KeyZ", { ctrlKey: true, shiftKey: true }))?.command).toBe("toggle_pane_zoom");
    expect(k.match(key("F3", "F3"))?.command).toBe("find");
    expect(k.hint("find")).toBe("F3");
    expect(k.hint("paste")).toBeUndefined();
  });
  it("binds user actions, also by id in [keys]", () => {
    const actions = parseUserActions([
      { name: "Hi", command: "send_input", input: "hi", keys: "Ctrl+Shift+H" },
      { id: "u.ls", command: "send_input", input: "ls" },
    ]);
    const k = new Keymap({ "u.ls": "F6" }, actions);
    expect(k.match(key("H", "KeyH", { ctrlKey: true, shiftKey: true }))).toEqual({ command: "send_input", input: "hi" });
    expect(k.match(key("F6", "F6"))).toEqual({ command: "send_input", input: "ls" });
  });
  it("every named command has a label", () => {
    for (const c of Object.values(COMMANDS)) expect(c.label.length).toBeGreaterThan(0);
  });
});
