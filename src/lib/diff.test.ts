import { describe, expect, it } from "vitest";
import { buildPatch, changeStarts, diffFlags, diffOptions, DIFF_DEFAULTS, fileLabel, findAll, hunkSides, pairLines, parseDiffFiles, segments, splitRows, stepTo, wordDiff } from "./diff";

const SIMPLE = "diff --git a/x b/x\nindex 1..2 100644\n--- a/x\n+++ b/x\n@@ -1,4 +1,4 @@ f()\n a\n-b\n+c\n d\n-e\n\\ No newline at end of file\n+e\n";

describe("options", () => {
  it("resolves config then overrides, rejecting invalid values", () => {
    expect(diffOptions({})).toEqual(DIFF_DEFAULTS);
    const o = diffOptions({ diff_view_mode: "split", diff_context_lines: 500, diff_algorithm: "nope", diff_word_wrap: true }, { context: 7, mode: "bad" as never });
    expect(o.mode).toBe("split");
    expect(o.context).toBe(7);
    expect(o.algorithm).toBe("default");
    expect(o.wrap).toBe(true);
    expect(diffOptions({ diff_context_lines: 500 }).context).toBe(100);
  });

  it("builds git flags", () => {
    expect(diffFlags(DIFF_DEFAULTS)).toEqual(["--unified=3", "--find-renames"]);
    expect(diffFlags({ ...DIFF_DEFAULTS, ignoreWhitespace: "all", ignoreBlankLines: true, fullFile: true, algorithm: "histogram", renames: false })).toEqual(["--ignore-all-space", "--ignore-blank-lines", "--unified=1000000", "--diff-algorithm=histogram", "--no-renames"]);
    expect(diffFlags({ ...DIFF_DEFAULTS, ignoreWhitespace: "change", context: 0 })).toContain("--ignore-space-change");
  });
});

describe("parsing", () => {
  it("parses files, hunks and line numbers", () => {
    const p = parseDiffFiles(SIMPLE);
    expect(p.preamble).toEqual([]);
    expect(p.files).toHaveLength(1);
    const f = p.files[0];
    expect(f).toMatchObject({ oldPath: "x", newPath: "x", status: "modified", binary: false, added: 2, removed: 2 });
    expect(f.header).toEqual(["diff --git a/x b/x", "index 1..2 100644", "--- a/x", "+++ b/x"]);
    expect(f.hunks[0]).toMatchObject({ oldStart: 1, newStart: 1, section: "f()" });
    expect(f.hunks[0].lines).toEqual([
      { kind: "ctx", text: "a", old: 1, new: 1 },
      { kind: "del", text: "b", old: 2 },
      { kind: "add", text: "c", new: 2 },
      { kind: "ctx", text: "d", old: 3, new: 3 },
      { kind: "del", text: "e", old: 4 },
      { kind: "nonl", text: "No newline at end of file" },
      { kind: "add", text: "e", new: 4 },
    ]);
    expect(parseDiffFiles("").files).toEqual([]);
  });

  it("parses commit preamble, renames, new/deleted and binary files", () => {
    const out = [
      "commit abc",
      "Author: A <a@b>",
      "",
      "    msg",
      "",
      " x | 2 +-",
      "diff --git a/old name b/new name",
      "similarity index 90%",
      "rename from old name",
      "rename to new name",
      "--- a/old name",
      "+++ b/new name",
      "@@ -1 +1 @@",
      "-a",
      "+b",
      "diff --git a/n b/n",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/n",
      "@@ -0,0 +1,2 @@",
      "+1",
      "+2",
      "diff --git a/d b/d",
      "deleted file mode 100644",
      "diff --git a/img.png b/img.png",
      "Binary files a/img.png and b/img.png differ",
      "",
    ].join("\n");
    const p = parseDiffFiles(out);
    expect(p.preamble).toEqual(["commit abc", "Author: A <a@b>", "", "    msg", "", " x | 2 +-"]);
    expect(p.files.map((f) => [f.status, f.oldPath, f.newPath, f.binary])).toEqual([
      ["renamed", "old name", "new name", false],
      ["added", "n", "n", false],
      ["deleted", "d", "d", false],
      ["modified", "img.png", "img.png", true],
    ]);
    expect(fileLabel(p.files[0])).toBe("old name → new name");
    expect(p.files[1].hunks[0].lines.map((l) => l.new)).toEqual([1, 2]);
  });

  it("keeps content lines that look like headers", () => {
    const out = "diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n-diff --git a b\n+@@ -1 +1 @@\n \n";
    const lines = parseDiffFiles(out).files[0].hunks[0].lines;
    expect(lines.map((l) => [l.kind, l.text])).toEqual([
      ["del", "diff --git a b"],
      ["add", "@@ -1 +1 @@"],
      ["ctx", ""],
    ]);
  });
});

describe("rows", () => {
  it("aligns deletions with following additions", () => {
    const h = parseDiffFiles("diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,4 +1,3 @@\n a\n-b\n-c\n+B\n d\n").files[0].hunks[0];
    const rows = splitRows(h);
    expect(rows.map((r) => [r.left?.text, r.right?.text])).toEqual([
      ["a", "a"],
      ["b", "B"],
      ["c", undefined],
      ["d", "d"],
    ]);
    expect([...pairLines(h).entries()]).toEqual([
      [1, 3],
      [3, 1],
    ]);
  });

  it("splits hunk sides with indexes", () => {
    const h = parseDiffFiles(SIMPLE).files[0].hunks[0];
    const s = hunkSides(h);
    expect(s.old.text).toBe("a\nb\nd\ne");
    expect(s.new.idx).toEqual([0, 2, 3, 6]);
  });
});

describe("word diff", () => {
  it("finds changed words", () => {
    expect(wordDiff("let a = 1;", "let b = 1;")).toEqual({ a: [{ from: 4, to: 5 }], b: [{ from: 4, to: 5 }] });
    expect(wordDiff("foo(x)", "foo(x, y)")).toEqual({ a: [], b: [{ from: 5, to: 8 }] });
  });

  it("gives up on unrelated or long lines", () => {
    expect(wordDiff("alpha beta gamma", "one two three")).toBeNull();
    expect(wordDiff("x".repeat(600), "y")).toBeNull();
  });

  it("merges syntax spans and changes into segments", () => {
    expect(segments("let a = 1", [{ from: 0, to: 3, cls: "kw" }], [{ from: 4, to: 5 }])).toEqual([
      { text: "let", cls: "kw" },
      { text: " " },
      { text: "a", changed: true },
      { text: " = 1" },
    ]);
    expect(segments("abc")).toEqual([{ text: "abc" }]);
  });
});

describe("patches", () => {
  const f = () => parseDiffFiles("diff --git a/x b/x\nindex 1..2 100644\n--- a/x\n+++ b/x\n@@ -10,3 +10,3 @@ s\n a\n-b\n+c\n d\n").files[0];

  it("builds a whole-hunk patch", () => {
    const file = f();
    expect(buildPatch(file, file.hunks[0])).toBe("diff --git a/x b/x\nindex 1..2 100644\n--- a/x\n+++ b/x\n@@ -10,3 +10,3 @@ s\n a\n-b\n+c\n d\n");
  });

  it("builds forward partial patches", () => {
    const file = f();
    // Only the addition: the deletion stays as context.
    expect(buildPatch(file, file.hunks[0], new Set([2]))).toContain("@@ -10,3 +10,4 @@ s\n a\n b\n+c\n d\n");
    // Only the deletion: the addition is dropped.
    expect(buildPatch(file, file.hunks[0], new Set([1]))).toContain("@@ -10,3 +10,2 @@ s\n a\n-b\n d\n");
    expect(buildPatch(file, file.hunks[0], new Set([0]))).toBeNull();
  });

  it("builds reverse partial patches", () => {
    const file = f();
    // Undo only the deletion: the addition stays (as context), the deleted line comes back.
    expect(buildPatch(file, file.hunks[0], new Set([1]), true)).toContain("@@ -10,4 +10,3 @@ s\n a\n-b\n c\n d\n");
    expect(buildPatch(file, file.hunks[0], new Set([2]), true)).toContain("@@ -10,2 +10,3 @@ s\n a\n+c\n d\n");
  });
});

describe("navigation and search", () => {
  it("finds change blocks and steps with wrap", () => {
    const starts = changeStarts(["ctx", "add", "del", "ctx", "del", "hunk", "add"]);
    expect(starts).toEqual([1, 4, 6]);
    expect(stepTo(starts, 1, 1)).toBe(4);
    expect(stepTo(starts, 6, 1)).toBe(1);
    expect(stepTo(starts, 1, -1)).toBe(6);
    expect(stepTo([], 0, 1)).toBeUndefined();
  });

  it("finds matches", () => {
    expect(findAll("Foo foo", "foo", false)).toEqual([
      { from: 0, to: 3 },
      { from: 4, to: 7 },
    ]);
    expect(findAll("Foo foo", "foo", true)).toEqual([{ from: 4, to: 7 }]);
    expect(findAll("x", "", false)).toEqual([]);
  });
});
