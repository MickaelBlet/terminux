import { describe, expect, it } from "vitest";
import { ROOT_FIELDS, SETTINGS_FIELDS } from "../config-schema";
import { bindings, dropIndex, moveItem, comboSig, comboText, conflicts, controlFor, exampleDefaults, fromSelect, getIn, keysValue, labelOf, locate, parseLiteral, set } from "./value";

describe("settings values", () => {
  it("paths and ops", () => {
    expect(getIn({ a: [{ b: 1 }] }, ["a", 0, "b"])).toBe(1);
    expect(getIn({ a: 1 }, ["a", "b"])).toBeUndefined();
    expect(set(["x"], undefined)).toEqual({ op: "remove", path: ["x"] });
    expect(set(["x"], 0)).toEqual({ op: "set", path: ["x"], value: 0 });
    expect(labelOf("font_size")).toBe("Font size");
  });

  it("moves list items", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
    const rows = [{ top: 0, bottom: 10 }, { top: 10, bottom: 20 }];
    expect(dropIndex(rows, 2)).toBe(0);
    expect(dropIndex(rows, 12)).toBe(1);
    expect(dropIndex(rows, 18)).toBe(2);
  });

  it("controls", () => {
    expect(controlFor("", "copy_on_select", ROOT_FIELDS.copy_on_select).kind).toBe("toggle");
    expect(controlFor("", "tab_position", ROOT_FIELDS.tab_position)).toEqual({ kind: "select", options: ["top", "left", "right"] });
    expect(controlFor("defaults", "cursor_color", SETTINGS_FIELDS.cursor_color).kind).toBe("color");
    expect(controlFor("scheme", "red", { type: "string", doc: "" }).kind).toBe("color");
    expect(controlFor("defaults", "env", SETTINGS_FIELDS.env).kind).toBe("map");
    expect(controlFor("", "new_tab_menu", ROOT_FIELDS.new_tab_menu).kind).toBe("toml");
    expect(controlFor("defaults", "bell_style", SETTINGS_FIELDS.bell_style).kind).toBe("text");
    expect(fromSelect("true")).toBe(true);
    expect(fromSelect("")).toBeUndefined();
  });

  it("parses literals", () => {
    expect(parseLiteral('"a\\"b"   # c')).toBe('a"b');
    expect(parseLiteral("1.5")).toBe(1.5);
    expect(parseLiteral("[1, 'x', true]")).toEqual([1, "x", true]);
    expect(parseLiteral('{ face = "Mono", size = 14, features = { ss01 = 1 } }')).toEqual({ face: "Mono", size: 14, features: { ss01: 1 } });
    expect(parseLiteral("nope")).toBeUndefined();
  });

  it("reads defaults from the commented examples", () => {
    const d = exampleDefaults(`font_size = 14
# tab_position = "top"   # "top" | "left"
# Some prose = not a key
[defaults]
# font = { size = 14 }
# cursor_shape = "filled_box"
# [[profile]]
# cursor_shape = "bar"
[keys]
# new_tab = "Ctrl+T"
`);
    expect(d.root).toEqual({ font_size: 14, tab_position: "top" });
    expect(d.defaults).toEqual({ font: { size: 14 }, cursor_shape: "filled_box" });
  });

  it("key bindings", () => {
    const ev = { ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, key: "T" };
    expect(comboText(ev, "t")).toBe("Ctrl+Shift+T");
    expect(comboText({ ...ev, key: "Shift" }, "shift")).toBeNull();
    expect(comboText({ ...ev, key: "ArrowUp" }, "arrowup")).toBe("Ctrl+Shift+Up");
    expect(comboSig("ctrl+shift+t")).toBe(comboSig("Shift+Ctrl+T"));
    const list = bindings({ new_tab: "Ctrl+Shift+W" }, [{ name: "Git", keys: "ctrl+shift+w", command: "send_input" }], () => "?");
    expect(list.find((b) => b.id === "new_tab")).toMatchObject({ keys: ["Ctrl+Shift+W"], custom: true });
    const c = conflicts(list);
    expect(c.get(comboSig("Ctrl+Shift+W")!)).toEqual(expect.arrayContaining(["new_tab", "action:0"]));
    expect(keysValue([])).toBe("");
    expect(keysValue(["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("locate", () => {
  const text = 'a = 1\n[[profile]]\nid = "x"\n[[profile]]\nid = "y"\n[profile.font]\nsize = 3\n';
  it("finds keys in the n-th table", () => {
    expect(text.slice(locate(text, ["a"])).startsWith("a = 1")).toBe(true);
    expect(text.slice(locate(text, ["profile", 1, "id"])).startsWith('id = "y"')).toBe(true);
    expect(text.slice(locate(text, ["profile", 1, "font", "size"])).startsWith("size = 3")).toBe(true);
    expect(locate(text, ["profile", 2, "id"])).toBe(-1);
  });
});
