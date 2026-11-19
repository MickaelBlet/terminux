import { describe, expect, it } from "vitest";
import { applyCompletion, commonPrefix, completionQuery, filterEntries, separatorOf } from "./path-complete";

describe("completionQuery", () => {
  it("resolves the directory to list", () => {
    expect(completionQuery("src/li", "/p")).toEqual({ head: "src/", prefix: "li", dir: "/p/src/" });
    expect(completionQuery("ma", "/p")).toEqual({ head: "", prefix: "ma", dir: "/p" });
    expect(completionQuery("/etc/ho", null)).toEqual({ head: "/etc/", prefix: "ho", dir: "/etc/" });
    expect(completionQuery("~/d", null)).toEqual({ head: "~/", prefix: "d", dir: "~/" });
    expect(completionQuery("x/y", null).dir).toBeNull();
    expect(completionQuery('"C:\\Us', null)).toEqual({ head: '"C:\\', prefix: "Us", dir: "C:\\" });
  });
});

describe("filterEntries", () => {
  const es = [
    { name: ".git", dir: true },
    { name: "Src", dir: true },
    { name: "src.ts", dir: false },
  ];
  it("matches the prefix and hides dotfiles", () => {
    expect(filterEntries(es, "").map((e) => e.name)).toEqual(["Src", "src.ts"]);
    expect(filterEntries(es, ".").map((e) => e.name)).toEqual([".git"]);
    expect(filterEntries(es, "s").map((e) => e.name)).toEqual(["src.ts"]);
    expect(filterEntries(es, "s", true).map((e) => e.name)).toEqual(["Src", "src.ts"]);
  });
});

describe("completion text", () => {
  it("computes common prefixes", () => {
    expect(commonPrefix(["main.rs", "mainx", "main"])).toBe("main");
    expect(commonPrefix(["Abc", "abd"], true)).toBe("Ab");
    expect(commonPrefix([])).toBe("");
  });
  it("applies a completion", () => {
    const q = completionQuery("src/li", "/p");
    expect(applyCompletion(q, "lib", true, "/")).toBe("src/lib/");
    expect(applyCompletion(q, "lim.ts", false, "/")).toBe("src/lim.ts");
    expect(separatorOf("a", "C:\\x")).toBe("\\");
    expect(separatorOf("a/b", "C:\\x")).toBe("/");
    expect(separatorOf("a", null)).toBe("/");
  });
});
