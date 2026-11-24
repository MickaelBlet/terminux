import { describe, expect, test } from "vitest";
import { ancestors, baseName, cdLine, flatten, joinPath, relPath, sepOf, shQuote, visibleEntries, type DirEntry } from "./explorer";

describe("paths", () => {
  test("separators and join", () => {
    expect(sepOf("/home/u")).toBe("/");
    expect(sepOf("C:\\Users")).toBe("\\");
    expect(sepOf("C:")).toBe("\\");
    expect(joinPath("/home/u/", "a")).toBe("/home/u/a");
    expect(joinPath("/", "etc")).toBe("/etc");
    expect(joinPath("C:\\", "x")).toBe("C:\\x");
    expect(joinPath("C:\\Users", "x")).toBe("C:\\Users\\x");
  });
  test("baseName", () => {
    expect(baseName("/home/u/proj/")).toBe("proj");
    expect(baseName("/")).toBe("/");
    expect(baseName("C:\\Users\\me")).toBe("me");
  });
  test("relPath and ancestors", () => {
    expect(relPath("/r", "/r")).toBe("");
    expect(relPath("/r", "/r/a/b")).toBe("a/b");
    expect(relPath("/r", "/rx/a")).toBeNull();
    expect(relPath("/", "/etc")).toBe("etc");
    expect(relPath("C:\\R", "c:\\r\\A")).toBe("A");
    expect(ancestors("/r", "/r/a/b")).toEqual(["/r/a", "/r/a/b"]);
    expect(ancestors("/r", "/r")).toEqual([]);
    expect(ancestors("/r", "/x")).toEqual([]);
  });
  test("quoting", () => {
    expect(shQuote("/a/b")).toBe("/a/b");
    expect(shQuote("/a b/it's")).toBe("'/a b/it'\\''s'");
    expect(cdLine("/a b")).toBe("cd '/a b'");
    expect(cdLine("C:\\My Dir")).toBe('cd "C:\\My Dir"');
  });
});

describe("tree", () => {
  const e = (name: string, dir = false): DirEntry => ({ name, dir });
  test("visibleEntries", () => {
    const list = [e("b"), e(".git", true), e("A", true), e(".env"), e("a")];
    expect(visibleEntries(list, true).map((x) => x.name)).toEqual(["A", ".env", "a", "b"]);
    expect(visibleEntries(list, false).map((x) => x.name)).toEqual(["A", "a", "b"]);
  });
  test("flatten", () => {
    const entries = new Map<string, DirEntry[] | { error: string }>([
      ["/r", [e("src", true), e("x", true), e("lock", true), e("f")]],
      ["/r/src", [e("main.ts")]],
      ["/r/lock", { error: "denied" }],
    ]);
    const rows = flatten("/r", entries, new Set(["/r/src", "/r/x", "/r/lock"]), true);
    expect(rows).toEqual([
      { path: "/r/lock", name: "lock", dir: true, depth: 0, error: "denied" },
      { path: "/r/src", name: "src", dir: true, depth: 0 },
      { path: "/r/src/main.ts", name: "main.ts", dir: false, depth: 1 },
      { path: "/r/x", name: "x", dir: true, depth: 0, loading: true },
      { path: "/r/f", name: "f", dir: false, depth: 0 },
    ]);
  });
});
