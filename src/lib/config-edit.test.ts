import { describe, expect, it } from "vitest";
import { setRootKey, tomlStringArray } from "./config-edit";

const V = tomlStringArray(["find", "separator"]);

describe("setRootKey", () => {
  it("formats string arrays", () => {
    expect(V).toBe('["find", "separator"]');
    expect(tomlStringArray(['a"b'])).toBe('["a\\"b"]');
  });
  it("replaces a single-line value and keeps its comment", () => {
    const src = 'font_size = 14\ntoolbar = ["copy"]  # mine\n[keys]\n';
    expect(setRootKey(src, "toolbar", V)).toBe(`font_size = 14\ntoolbar = ${V}  # mine\n[keys]\n`);
  });
  it("replaces a multi-line array with comments and brackets in strings", () => {
    const src = 'toolbar = [\n  "find", # ]\n  "a]b",\n]\nx = 1\n';
    expect(setRootKey(src, "toolbar", V)).toBe(`toolbar = ${V}\nx = 1\n`);
  });
  it("ignores keys of sections", () => {
    const src = 'a = 1\n[profile]\ntoolbar = ["x"]\n';
    expect(setRootKey(src, "toolbar", V)).toBe(`a = 1\ntoolbar = ${V}\n[profile]\ntoolbar = ["x"]\n`);
  });
  it("inserts after the commented example", () => {
    const src = 'a = 1\n# toolbar = ["find"]\nb = 2\n[keys]\n';
    expect(setRootKey(src, "toolbar", V)).toBe(`a = 1\n# toolbar = ["find"]\ntoolbar = ${V}\nb = 2\n[keys]\n`);
  });
  it("inserts after the last root setting, before section comments", () => {
    const src = "a = 1\n\n# Keys\n[keys]\n";
    expect(setRootKey(src, "toolbar", V)).toBe(`a = 1\ntoolbar = ${V}\n\n# Keys\n[keys]\n`);
  });
  it("inserts before the first section or appends", () => {
    expect(setRootKey("# hi\n[keys]\n", "toolbar", V)).toBe(`# hi\ntoolbar = ${V}\n\n[keys]\n`);
    expect(setRootKey("", "toolbar", V)).toBe(`toolbar = ${V}\n`);
  });
  it("removes the key", () => {
    expect(setRootKey('a = 1\ntoolbar = [\n "x",\n] # c\nb = 2\n', "toolbar", null)).toBe("a = 1\nb = 2\n");
    expect(setRootKey("a = 1\n", "toolbar", null)).toBe("a = 1\n");
  });
});
