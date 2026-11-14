import { describe, expect, it } from "vitest";
import { completions, contextAt, keyInfoAt, profileIds, unknownKeys } from "./config-schema";

/** Split "a|b" into text and cursor position. */
const at = (s: string) => ({ text: s.replace("|", ""), pos: s.indexOf("|") });
const labels = (s: string) => {
  const { text, pos } = at(s);
  return completions(text, pos)?.options.map((o) => o.label) ?? [];
};

describe("contextAt", () => {
  it("detects root key", () => {
    const { text, pos } = at("font_s|");
    expect(contextAt(text, pos)).toEqual({ section: "", mode: "key", from: 0 });
  });
  it("detects section and value", () => {
    const { text, pos } = at('[keys]\n\nnew_tab = "Ct|');
    expect(contextAt(text, pos)).toMatchObject({ section: "keys", mode: "value", key: "new_tab" });
  });
  it("handles empty leading lines", () => {
    const { text, pos } = at("\n\n|");
    expect(contextAt(text, pos)?.section).toBe("");
  });
  it("detects header", () => {
    const { text, pos } = at("x = 1\n  [ke|");
    expect(contextAt(text, pos)).toEqual({ section: "", mode: "header", from: 8 });
  });
  it("ignores comments", () => {
    const { text, pos } = at("# font|");
    expect(contextAt(text, pos)).toBeNull();
  });
});

describe("completions", () => {
  it("root keys skip already-set ones", () => {
    const l = labels("font_size = 12\n|\n[keys]\nfont_family = 1");
    expect(l).toContain("renderer");
    expect(l).toContain("font_family");
    expect(l).not.toContain("font_size");
  });
  it("profile keys are per block", () => {
    const l = labels('[[profile]]\nid = "a"\n[[profile]]\n|');
    expect(l).toContain("id");
    expect(l).toContain("cmd");
  });
  it("key actions and theme colors", () => {
    expect(labels("[keys]\n|")).toContain("duplicate_pane_right");
    expect(labels("[keys]\n|")).toContain("close_tab");
    expect(labels("[theme]\n|")).toContain("bright_blue");
  });
  it("enum, bool and default values", () => {
    expect(labels("renderer = |")).toEqual(['"webgl"', '"canvas"', '"dom"']);
    expect(labels("notifications = t|")).toEqual(["true", "false"]);
    expect(labels("[[profile]]\nos = |")).toContain('"windows"');
    expect(labels("[keys]\nfind = |")).toEqual(['"Ctrl+Shift+F"', '""']);
    expect(labels("[keys]\npaste = |")).toContain('["Ctrl+V", "Ctrl+Shift+V", "Shift+Insert"]');
    expect(labels("[theme]\nred = |")).toEqual(['"#e06c75"']);
    expect(labels("[[scheme]]\nbright_purple = |")).toEqual(['"#d899ea"']);
  });
  it("default_profile lists profile ids", () => {
    expect(labels('default_profile = |\n[[profile]]\nid = "python"')).toEqual(['"shell"', '"python"']);
  });
  it("headers", () => {
    expect(labels("[|")).toContain("[keys]");
    expect(labels("[|")).toContain("[[scheme]]");
  });
  it("new sections", () => {
    expect(labels("[defaults]\n|")).toContain("color_scheme");
    expect(labels("[defaults.font]\n|")).toContain("ligatures");
    expect(labels("[[profile]]\ncolor_scheme = |")).toContain('"One Half Dark"');
    expect(labels('[[scheme]]\nname = "Mine"\n[defaults]\ncolor_scheme = |')).toContain('"Mine"');
    expect(labels("[[action]]\ncommand = |")).toContain('"send_input"');
    expect(labels("app_theme = |")).toContain('"light"');
    expect(labels("[ui_theme.tab]\nshow_close_button = |")).toContain('"hover"');
  });
  it("value from covers the quote", () => {
    const { text, pos } = at('renderer = "we|');
    expect(completions(text, pos)?.from).toBe(11);
  });
});

describe("profileIds / unknownKeys", () => {
  it("collects ids", () => {
    expect(profileIds('[[profile]]\nid = "x"\n[keys]\nid = "y"')).toEqual(["shell", "x"]);
  });
  it("flags unknown keys and sections", () => {
    const text = 'font_sise = 1\n[keys]\nnope = "x"\n[profile.env]\nFOO = "1"\n[bad]\n';
    const p = unknownKeys(text);
    expect(p.map((x) => x.message)).toEqual(['Unknown key "font_sise"', 'Unknown key "nope"', "Unknown section [bad]"]);
    expect(text.slice(p[1].from, p[1].to)).toBe("nope");
  });
  it("accepts legacy key names, free sections and xterm color names", () => {
    const text = '[keys]\nsplit_right = "x"\nzoom = "y"\n[profile.env]\nANY = "1"\n[theme]\nbrightBlue = "#fff"\n[[action]]\ncommand = "send_input"\ninput = "x"\n';
    expect(unknownKeys(text)).toEqual([]);
  });
  it("accepts multi-line arrays", () => {
    expect(unknownKeys('[[profile]]\nargs = [\n  "a",\n]\n')).toEqual([]);
  });
});

describe("keyInfoAt", () => {
  it("documents the key under the cursor", () => {
    const text = "font_size = 12\n";
    const i = keyInfoAt(text, text.indexOf("font_size") + 2);
    expect(i?.key).toBe("font_size");
    expect(i?.doc).toBeTruthy();
    expect(keyInfoAt(text, text.indexOf("12"))).toBeNull();
  });
  it("shows default bindings in [keys]", () => {
    const text = "[keys]\nclose_pane = \"\"\n";
    const i = keyInfoAt(text, text.indexOf("close_pane"));
    expect(i?.default).toBeDefined();
  });
  it("ignores unknown keys and free sections", () => {
    expect(keyInfoAt("[defaults]\nnope = 1", 12)).toBeNull();
    expect(keyInfoAt("[defaults.env]\nFOO = \"x\"", 16)).toBeNull();
  });
});
