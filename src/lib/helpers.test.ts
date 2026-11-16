import { describe, expect, it } from "vitest";
import { droppedPaths, quotePath, translatePath } from "./paths";
import { hasVisibleText, parse133, parse633, parseCwd7, parseCwd99, parseOsc52, OSC52_MAX, parseProgress } from "./osc";
import { isMultiLine, pasteWarning, sanitizePaste } from "./paste";
import { insertBlock, setRootKey, snippetToml } from "./snippets";
import { sanitizeTab } from "./snapshot";
import { findScheme, schemeName, toTheme, parseHex, withAlpha } from "./schemes";
import { FALLBACK_CONFIG, fontFamilyOf } from "./config";
import { fontWeightOf, parsePadding, resolve } from "./term/appearance";
import { move, wordAt } from "./term/markmode";
import { targetLine } from "./term/marks";
import { recent } from "./term/shell-integration";

describe("paths", () => {
  it("quotes", () => {
    expect(quotePath("/a/b", false)).toBe("/a/b");
    expect(quotePath("/a b/it's", false)).toBe(`'/a b/it'\\''s'`);
    expect(quotePath("C:\\a b", true)).toBe('"C:\\a b"');
  });
  it("translates", () => {
    expect(translatePath("C:\\Users\\me", "wsl")).toBe("/mnt/c/Users/me");
    expect(translatePath("D:\\x", "cygwin")).toBe("/cygdrive/d/x");
    expect(translatePath("D:\\x", "msys2")).toBe("/d/x");
    expect(translatePath("D:\\x\\y", "mingw")).toBe("D:/x/y");
    expect(translatePath("\\\\wsl.localhost\\Ubuntu\\home\\me", "wsl")).toBe("/home/me");
    expect(translatePath("C:\\x", "none")).toBe("C:\\x");
    expect(droppedPaths(["C:\\a b"], "wsl", true)).toBe("'/mnt/c/a b'");
  });
});

describe("osc", () => {
  it("progress", () => {
    expect(parseProgress("4;1;42")).toEqual({ state: 1, value: 42 });
    expect(parseProgress("4;3")).toEqual({ state: 3, value: 0 });
    expect(parseProgress("4;0")).toBeNull();
    expect(parseProgress("hello")).toBeUndefined();
  });
  it("cwd", () => {
    expect(parseCwd7("file://host/home/me/a%20b")).toBe("/home/me/a b");
    expect(parseCwd7("file:///C:/x")).toBe("C:/x");
    expect(parseCwd99('9;"C:\\x y"')).toBe("C:\\x y");
  });
  it("shell integration", () => {
    expect(parse133("A")).toEqual({ kind: "prompt" });
    expect(parse133("D;1")).toEqual({ kind: "command_end", exitCode: 1 });
    expect(parse133("D")).toEqual({ kind: "command_end" });
    expect(parse633("E;ls\\x3b -la;nonce")).toEqual({ kind: "commandline", text: "ls; -la" });
    expect(parse633("P;Cwd=/tmp")).toEqual({ kind: "cwd", path: "/tmp" });
    // Decoded control characters must not reach a command typed back into the shell.
    expect(parse633("E;ls\\x0drm -rf ~\\x03;n")).toEqual({ kind: "commandline", text: "lsrm -rf ~" });
    expect(parse633("P;Cwd=/tmp\\x0a/x")).toEqual({ kind: "cwd", path: "/tmp/x" });
  });
  it("clipboard", () => {
    expect(parseOsc52("c;" + btoa("héllo".replace(/é/, "\u00c3\u00a9")))?.text).toBe("héllo");
    expect(parseOsc52("c;?")).toEqual({ text: null });
    expect(parseOsc52("c;" + "A".repeat(OSC52_MAX + 4))).toBeUndefined();
    expect(parseOsc52("c;not base64!")).toBeUndefined();
  });
});

describe("paste", () => {
  it("sanitizes", () => {
    expect(sanitizePaste("a\x1b[31mb\tc\r\n  \n", true)).toBe("a[31mb\tc");
    expect(sanitizePaste("x \n", false)).toBe("x \n");
  });
  it("warns", () => {
    expect(isMultiLine("a\n")).toBe(false);
    expect(pasteWarning("a\nb", { bracketed: false })).toBe("multiline");
    expect(pasteWarning("a\nb", { bracketed: true })).toBeNull();
    expect(pasteWarning("a\nb", { bracketed: true, multiLine: "always" })).toBe("multiline");
    expect(pasteWarning("x".repeat(6000), { bracketed: false })).toBe("large");
    expect(pasteWarning("x".repeat(6000), { bracketed: false, large: false })).toBeNull();
  });
});

describe("snippets", () => {
  it("inserts before [keys]", () => {
    const src = 'a = 1\n\n[keys]\nx = "y"\n';
    const out = insertBlock(src, snippetToml("ls", "ls -la\r"));
    expect(out.indexOf("[[action]]")).toBeLessThan(out.indexOf("[keys]"));
    expect(out).toContain('input = "ls -la\\r"');
  });
});

describe("snapshot", () => {
  it("sanitizes", () => {
    const t = { root: { kind: "pane" as const, id: "a" }, active: "zz", name: null, color: null, panes: [{ id: "a", kind: "term" as const, spec: { profileId: "s" }, title: "", cwd: null, readOnly: false, restore: { buffer: "x", ptyId: 3 } }] };
    const s = sanitizeTab(t)!;
    expect(s.active).toBe("a");
    expect(s.panes[0].restore).toEqual({ buffer: "x" });
    expect(sanitizeTab({ ...t, root: { kind: "pane", id: "b" } })).toBeNull();
  });
});

describe("schemes and appearance", () => {
  it("finds schemes", () => {
    expect(findScheme(FALLBACK_CONFIG, "campbell")?.background).toBe("#0c0c0c");
    expect(toTheme({ name: "x", bright_purple: "#123", cursor_color: "#fff" })).toEqual({ brightMagenta: "#123", cursor: "#fff" });
    expect(schemeName({ light: "L", dark: "D" }, false)).toBe("L");
    expect(parseHex("#abc")).toEqual([170, 187, 204, 1]);
    expect(withAlpha("#000000", 0.5)).toBe("rgba(0, 0, 0, 0.500)");
  });
  it("parses padding and weights", () => {
    expect(parsePadding("8", [0, 0, 0, 0])).toEqual([8, 8, 8, 8]);
    expect(parsePadding("8, 4", [0, 0, 0, 0])).toEqual([8, 4, 8, 4]);
    expect(parsePadding("x", [1, 2, 3, 4])).toEqual([1, 2, 3, 4]);
    expect(fontWeightOf("semi-bold")).toBe(600);
    expect(fontWeightOf(350)).toBe(350);
  });
  it("resolves defaults, profile and overrides", () => {
    const cfg = {
      ...FALLBACK_CONFIG,
      defaults: { color_scheme: "Campbell", opacity: 80, font: { size: 12 }, unfocused_appearance: { opacity: 50 } },
      profiles: [{ id: "a", name: "A", cmd: "x", args: [], env: {}, cursor_shape: "bar", font: { face: "Fira Code" } }],
      schemes: [{ name: "Mine", background: "#101010" }],
    };
    const env = { focused: true, dark: true, fontDelta: 2 };
    const r = resolve(cfg, { profileId: "a" }, env);
    expect(r.schemeName).toBe("Campbell");
    expect(r.background).toBe("#0c0c0c");
    expect(r.opacity).toBe(0.8);
    expect(r.transparent).toBe(true);
    expect(r.fontSize).toBe(14);
    expect(r.fontFamily.startsWith("'Fira Code'")).toBe(true);
    expect(r.cursorStyle).toBe("bar");
    expect(resolve(cfg, { profileId: "a" }, { ...env, focused: false }).opacity).toBe(0.5);
    expect(resolve(cfg, { profileId: "a", colorScheme: "Mine", opacity: 100 }, env).background).toBe("#101010");
  });
});

describe("fontFamilyOf", () => {
  it("puts the emoji font after the Nerd Font and before Twemoji", () => {
    expect(fontFamilyOf({})).toBe(
      "'JetBrains Mono', 'Symbols Nerd Font Mono', 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', " +
        "'Twemoji Mozilla', 'Noto Sans Symbols 2', 'Noto Sans Symbols', 'Noto Sans Math', monospace",
    );
    expect(fontFamilyOf({ emoji_font: "Noto Color Emoji" }, "Fira Code")).toMatch(
      /^'Fira Code', 'Symbols Nerd Font Mono', 'Noto Color Emoji', 'Twemoji Mozilla',/,
    );
    expect(fontFamilyOf({ font_family: "x", emoji_font: "y" })).toBe("x");
  });
});

describe("mark mode and marks", () => {
  const lines = ["hello world foo", "second line", ""];
  const b = { cols: 20, rows: 2, length: 3 };
  const line = (y: number) => lines[y] ?? "";
  it("moves", () => {
    expect(move({ x: 0, y: 0 }, "word_right", b, line, "")).toEqual({ x: 6, y: 0 });
    expect(move({ x: 8, y: 0 }, "word_left", b, line, "")).toEqual({ x: 6, y: 0 });
    expect(move({ x: 0, y: 1 }, "left", b, line, "")).toEqual({ x: 19, y: 0 });
    expect(move({ x: 3, y: 0 }, "line_end", b, line, "")).toEqual({ x: 14, y: 0 });
    expect(move({ x: 3, y: 0 }, "page_down", b, line, "")).toEqual({ x: 3, y: 2 });
    expect(wordAt("foo-bar baz", 1, "-")).toEqual([0, 2]);
  });
  it("targets marks", () => {
    expect(targetLine([2, 10, 30], 10, "previous")).toBe(2);
    expect(targetLine([2, 10, 30], 10, "next")).toBe(30);
    expect(targetLine([2, 10, 30], 0, "last")).toBe(30);
    expect(targetLine([], 0, "first")).toBeNull();
  });
  it("lists recent commands", () => {
    expect(recent(["a", "b", undefined, "a", " "])).toEqual(["a", "b"]);
  });
});

describe("hasVisibleText", () => {
  const b = (s: string) => new TextEncoder().encode(s);
  it("ignores terminal-only sequences", () => {
    expect(hasVisibleText(b("\x1b[?9001h\x1b[?1004h"))).toBe(false);
    expect(hasVisibleText(b("\x1b[H\x1b[2J\x1b[?25l \r\n"))).toBe(false);
    expect(hasVisibleText(b("\x1b]0;wsl.exe\x07\x1b]9;9;C:\\\x1b\\"))).toBe(false);
    expect(hasVisibleText(b("\x1b(B\x1b=\x1b[0m"))).toBe(false);
  });
  it("detects printable output", () => {
    expect(hasVisibleText(b("\x1b[?9001huser@host:~$ "))).toBe(true);
    expect(hasVisibleText(b("é"))).toBe(true);
  });
});

describe("setRootKey", () => {
  it("uncomments a commented-out key", () => {
    expect(setRootKey("a = 1\n# k = true\n\n[keys]\n", "k", "false")).toBe("a = 1\nk = false\n\n[keys]\n");
  });
  it("replaces an existing key", () => {
    expect(setRootKey("k = true\n", "k", "false")).toBe("k = false\n");
  });
  it("ignores keys inside tables and inserts before the first table", () => {
    expect(setRootKey("a = 1\n\n[t]\nk = true\n", "k", "false")).toBe("a = 1\nk = false\n\n[t]\nk = true\n");
  });
});
