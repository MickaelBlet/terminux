import { describe, expect, it } from "vitest";
import { classifyError, cmd, errorMessage, joinRepo, parseBranches, parseLog, parseTags, parseStashes, parseStatus, remotesOf, shellLine, splitPath } from "./git";

const H = "0123456789abcdef0123456789abcdef01234567";

describe("parseStatus", () => {
  it("parses branch, changes, renames, untracked and conflicts", () => {
    const out = [
      `# branch.oid ${H}`,
      "# branch.head main",
      "# branch.upstream origin/main",
      "# branch.ab +2 -1",
      `1 .M N... 100644 100644 100644 ${H} ${H} b c.txt`,
      `2 R. N... 100644 100644 100644 ${H} ${H} R100 dir/r.txt`,
      "a.txt",
      `1 MM N... 100644 100644 100644 ${H} ${H} s.txt`,
      `u UU N... 100644 100644 100644 100644 ${H} ${H} ${H} conf.txt`,
      "? new file.txt",
      "",
    ].join("\0");
    const s = parseStatus(out);
    expect(s).toMatchObject({ branch: "main", oid: H, upstream: "origin/main", ahead: 2, behind: 1 });
    expect(s.staged).toEqual([
      { path: "dir/r.txt", orig: "a.txt", code: "R", kind: "staged" },
      { path: "s.txt", code: "M", kind: "staged" },
    ]);
    expect(s.changes).toEqual([
      { path: "b c.txt", code: "M", kind: "changed" },
      { path: "new file.txt", code: "U", kind: "untracked" },
      { path: "s.txt", code: "M", kind: "changed" },
    ]);
    expect(s.conflicts).toEqual([{ path: "conf.txt", code: "!", kind: "conflict" }]);
  });

  it("handles detached HEAD, initial commit and no upstream", () => {
    expect(parseStatus("# branch.oid (initial)\0# branch.head (detached)\0")).toMatchObject({ branch: null, oid: null, upstream: null, ahead: 0, behind: 0 });
  });
});

it("parses log", () => {
  const out = `${H}\x1f0123456\x1fMe\x1f1 second ago\x1fHEAD -> main, origin/main, tag: v1\x1finit: a\x1fb\x1e\n${H}\x1f0123456\x1fMe\x1f2 days ago\x1f\x1fsecond\x1e\n`;
  expect(parseLog(out)).toEqual([
    { sha: H, short: "0123456", author: "Me", date: "1 second ago", refs: ["main", "origin/main", "tag: v1"], subject: "init: a\x1fb" },
    { sha: H, short: "0123456", author: "Me", date: "2 days ago", refs: [], subject: "second" },
  ]);
});

it("parses branches and remotes", () => {
  const out = [
    "refs/heads/main\x1fmain\x1f*\x1forigin/main\x1f1 second ago",
    "refs/heads/dev\x1fdev\x1f \x1f\x1f2 days ago",
    "refs/remotes/origin/HEAD\x1forigin\x1f \x1f\x1f1 day ago",
    "refs/remotes/upstream/x\x1fupstream/x\x1f \x1f\x1f1 day ago",
    "refs/remotes/origin/main\x1forigin/main\x1f \x1f\x1f1 day ago",
    "",
  ].join("\n");
  const b = parseBranches(out);
  expect(b.map((x) => [x.name, x.remote, x.current, x.upstream])).toEqual([
    ["main", false, true, "origin/main"],
    ["dev", false, false, null],
    ["upstream/x", true, false, null],
    ["origin/main", true, false, null],
  ]);
  expect(remotesOf(b)).toEqual(["origin", "upstream"]);
});

it("parses tags", () => {
  expect(parseTags("v1.0\x1f2 days ago\x1fRelease 1.0\nv0.9\x1f3 weeks ago\x1f\n")).toEqual([
    { name: "v1.0", date: "2 days ago", subject: "Release 1.0" },
    { name: "v0.9", date: "3 weeks ago", subject: "" },
  ]);
});

it("parses stashes", () => {
  expect(parseStashes("stash@{0}\x1fOn main: wip\x1f5 minutes ago\n")).toEqual([{ ref: "stash@{0}", message: "On main: wip", date: "5 minutes ago" }]);
});

it("classifies errors", () => {
  expect(classifyError("fatal: not a git repository (or any of the parent directories): .git")).toBe("not-repo");
  expect(classifyError("fatal: could not read Username for 'https://github.com': terminal prompts disabled")).toBe("auth");
  expect(classifyError("fatal: The current branch dev has no upstream branch.")).toBe("no-upstream");
  expect(classifyError("CONFLICT (content): Merge conflict in a")).toBe("conflict");
  expect(classifyError("fatal: your current branch 'main' does not have any commits yet")).toBe("no-commits");
  expect(classifyError("boom")).toBe("other");
  expect(errorMessage("hint: x\nerror: failed to push\n")).toBe("x failed to push");
});

it("builds command lines", () => {
  expect(cmd.stage(["-a b"])).toEqual(["add", "-A", "--", "-a b"]);
  expect(cmd.commit({ amend: true })).toEqual(["commit", "-F", "-", "--amend"]);
  expect(cmd.stashPush("my msg", true)).toEqual(["stash", "push", "--include-untracked", "--message=my msg"]);
  expect(shellLine(cmd.publish("origin", "feat/x"))).toBe("git push -u origin feat/x");
  expect(shellLine(["commit", "-m", "it's"])).toBe(`git commit -m 'it'\\''s'`);
});

it("splits and joins paths", () => {
  expect(splitPath("a/b/c.txt")).toEqual({ name: "c.txt", dir: "a/b" });
  expect(splitPath("c.txt")).toEqual({ name: "c.txt", dir: "" });
  expect(joinRepo("/home/me/r/", "a/b")).toBe("/home/me/r/a/b");
  expect(joinRepo("C:\\r", "a/b")).toBe("C:\\r\\a\\b");
});
