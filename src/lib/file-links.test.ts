import { describe, expect, it } from "vitest";
import { dirOf, findFileLinks, parseFileArg, resolveFilePath } from "./file-links";

const paths = (s: string) => findFileLinks(s).map((l) => [l.path, l.line, l.col]);

describe("findFileLinks", () => {
  it("finds paths with location suffixes", () => {
    expect(findFileLinks("  --> src/main.rs:12:5")).toEqual([{ start: 6, end: 22, path: "src/main.rs", line: 12, col: 5 }]);
    expect(paths("a.c:3: error")).toEqual([["a.c", 3, undefined]]);
    expect(paths("Foo.cs(10,4): warning")).toEqual([["Foo.cs", 10, 4]]);
    expect(paths('File "/x/y.py", line 7, in f')).toEqual([["/x/y.py", 7, undefined]]);
  });
  it("handles prefixes and Windows paths", () => {
    expect(paths("./a/b ../c.ts ~/d/e /etc/hosts")).toEqual([
      ["./a/b", undefined, undefined],
      ["../c.ts", undefined, undefined],
      ["~/d/e", undefined, undefined],
      ["/etc/hosts", undefined, undefined],
    ]);
    expect(paths("at C:\\work\\app.ts:4")).toEqual([["C:\\work\\app.ts", 4, undefined]]);
  });
  it("trims trailing punctuation", () => {
    const [l] = findFileLinks("see config.toml.");
    expect(l).toEqual({ start: 4, end: 15, path: "config.toml" });
  });
  it("skips URLs, plain words and versions", () => {
    expect(paths("https://example.com/a/b.html ok")).toEqual([]);
    expect(paths("hello world 1.2.3 v0.1")).toEqual([]);
    expect(paths("a/ / .. ~")).toEqual([]);
  });
  it("accepts bare file names with an extension", () => {
    expect(paths("README.md Cargo.toml")).toEqual([
      ["README.md", undefined, undefined],
      ["Cargo.toml", undefined, undefined],
    ]);
  });
  it("accepts dotfiles", () => {
    expect(paths(".bashrc .gitignore:3 .config/nvim/init.lua ~/.zshrc ./.env")).toEqual([
      [".bashrc", undefined, undefined],
      [".gitignore", 3, undefined],
      [".config/nvim/init.lua", undefined, undefined],
      ["~/.zshrc", undefined, undefined],
      ["./.env", undefined, undefined],
    ]);
    expect(paths("wait... . .5")).toEqual([]);
  });
});

describe("resolveFilePath", () => {
  it("joins relative paths with the cwd", () => {
    expect(resolveFilePath("./src/a.ts", "/home/u/p/")).toBe("/home/u/p/src/a.ts");
    expect(resolveFilePath("a.rs", "C:\\work")).toBe("C:\\work\\a.rs");
    expect(resolveFilePath("a.rs", null)).toBeNull();
  });
  it("keeps absolute and home paths", () => {
    expect(resolveFilePath("/x", "/y")).toBe("/x");
    expect(resolveFilePath("~/x", null)).toBe("~/x");
    expect(resolveFilePath("D:/x", "/y")).toBe("D:/x");
  });
});

describe("dirOf", () => {
  it("returns the parent directory", () => {
    expect(dirOf("/a/b.ts")).toBe("/a");
    expect(dirOf("/b.ts")).toBe("/");
    expect(dirOf("C:\\a\\b.ts")).toBe("C:\\a");
  });
});

describe("parseFileArg", () => {
  it("splits the location suffix and drops quotes", () => {
    expect(parseFileArg(" src/a.ts:12:5 ")).toEqual({ path: "src/a.ts", line: 12, col: 5 });
    expect(parseFileArg('"/a b/c.rs:3"')).toEqual({ path: "/a b/c.rs", line: 3 });
    expect(parseFileArg("C:\\x\\y.txt")).toEqual({ path: "C:\\x\\y.txt" });
    expect(parseFileArg("~/notes")).toEqual({ path: "~/notes" });
    expect(parseFileArg("  ")).toBeNull();
  });
});
