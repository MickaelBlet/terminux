// Git sidebar: command lines and output parsers (pure: run through the `git_run` IPC command).

export type ChangeKind = "staged" | "changed" | "untracked" | "conflict";

export interface FileChange {
  /** Path relative to the repository root. */
  path: string;
  /** Original path of a rename/copy. */
  orig?: string;
  /** Status letter shown in the list: M A D R C T U (untracked/unmerged). */
  code: string;
  kind: ChangeKind;
}

export interface Status {
  /** Branch name, null when detached. */
  branch: string | null;
  /** Commit sha, null before the first commit. */
  oid: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: FileChange[];
  changes: FileChange[];
  conflicts: FileChange[];
}

export interface Commit {
  sha: string;
  short: string;
  author: string;
  date: string;
  refs: string[];
  subject: string;
}

export interface Branch {
  /** Full ref (`refs/heads/main`, `refs/remotes/origin/main`). */
  ref: string;
  /** Short name (`main`, `origin/main`). */
  name: string;
  remote: boolean;
  current: boolean;
  upstream: string | null;
  date: string;
}

export interface Stash {
  ref: string;
  message: string;
  date: string;
}

export type DiffLineKind = "file" | "meta" | "hunk" | "add" | "del" | "ctx";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
  /** Line numbers in the old/new file (context and changed lines). */
  old?: number;
  new?: number;
}

const US = "\x1f";
const RS = "\x1e";

// ---------- config ----------

/** `git_pane_refresh_interval` in ms (0: no polling), 5 s by default. */
export function gitRefreshMs(v: unknown): number {
  return typeof v === "number" && v >= 0 ? (v === 0 ? 0 : Math.max(1, v) * 1000) : 5000;
}

// ---------- command lines ----------

const paths = (p: string[]) => ["--", ...p];

export const cmd = {
  root: () => ["rev-parse", "--show-toplevel"],
  status: (untracked = true) => ["status", "--porcelain=v2", "--branch", "-z", untracked ? "--untracked-files=all" : "--untracked-files=no"],
  stage: (p: string[]) => ["add", "-A", ...paths(p)],
  stageAll: () => ["add", "-A"],
  unstage: (p: string[]) => ["reset", "-q", ...paths(p)],
  unstageAll: () => ["reset", "-q"],
  discard: (p: string[]) => ["restore", "--worktree", ...paths(p)],
  /** Delete untracked files. */
  clean: (p: string[]) => ["clean", "-f", "-q", ...paths(p)],
  /** Message on stdin. */
  commit: (o: { amend?: boolean; all?: boolean } = {}) => ["commit", "-F", "-", ...(o.amend ? ["--amend"] : []), ...(o.all ? ["-a"] : [])],
  lastMessage: () => ["log", "-n", "1", "--format=%B"],
  undoCommit: () => ["reset", "--soft", "HEAD~1"],
  diff: (path: string, staged: boolean) => ["diff", "--no-ext-diff", "--no-color", ...(staged ? ["--cached"] : []), ...paths([path])],
  show: (sha: string) => ["show", "--no-ext-diff", "--no-color", "--patch", "--stat", "--format=commit %H%nAuthor: %an <%ae>%nDate:   %ad%n%n%w(0,4,4)%B", sha],
  stashShow: (ref: string) => ["stash", "show", "--patch", "--stat", ref],
  log: (n = 100) => ["log", "-n", String(n), `--format=%H%x1f%h%x1f%an%x1f%ar%x1f%D%x1f%s%x1e`],
  branches: () => ["for-each-ref", "--sort=-committerdate", "--format=%(refname)%1f%(refname:short)%1f%(HEAD)%1f%(upstream:short)%1f%(committerdate:relative)", "refs/heads", "refs/remotes"],
  switch: (name: string) => ["switch", name],
  /** Local branch tracking a remote one (`origin/x` → `x`). */
  track: (remoteRef: string) => ["switch", "--track", remoteRef],
  create: (name: string, from?: string) => ["switch", "-c", name, ...(from ? [from] : [])],
  detach: (sha: string) => ["switch", "--detach", sha],
  deleteBranch: (name: string, force = false) => ["branch", force ? "-D" : "-d", name],
  fetch: () => ["fetch", "--all", "--prune"],
  pull: (rebase = false) => ["pull", rebase ? "--rebase" : "--no-rebase"],
  push: (force = false) => ["push", ...(force ? ["--force-with-lease"] : [])],
  publish: (remote: string, branch: string) => ["push", "-u", remote, branch],
  stashList: () => ["stash", "list", "--format=%gd%x1f%gs%x1f%cr"],
  stashPush: (message: string, untracked: boolean) => ["stash", "push", ...(untracked ? ["--include-untracked"] : []), ...(message ? [`--message=${message}`] : [])],
  stashApply: (ref: string) => ["stash", "apply", ref],
  stashPop: (ref: string) => ["stash", "pop", ref],
  stashDrop: (ref: string) => ["stash", "drop", ref],
  revert: (sha: string) => ["revert", "--no-edit", sha],
  init: () => ["init", "-q"],
};

/** Shell command line equivalent (for "Run in terminal"). */
export function shellLine(args: string[]): string {
  const q = (a: string) => (/^[\w@%+=:,./~^{}-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`);
  return ["git", ...args].map(q).join(" ");
}

// ---------- parsers ----------

/** `git status --porcelain=v2 --branch -z`. */
export function parseStatus(out: string): Status {
  const s: Status = { branch: null, oid: null, upstream: null, ahead: 0, behind: 0, staged: [], changes: [], conflicts: [] };
  const parts = out.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (!e) continue;
    if (e.startsWith("# ")) {
      const [key, ...rest] = e.slice(2).split(" ");
      const val = rest.join(" ");
      if (key === "branch.oid") s.oid = val === "(initial)" ? null : val;
      else if (key === "branch.head") s.branch = val === "(detached)" ? null : val;
      else if (key === "branch.upstream") s.upstream = val;
      else if (key === "branch.ab") {
        const m = /^\+(\d+) -(\d+)$/.exec(val);
        if (m) [s.ahead, s.behind] = [Number(m[1]), Number(m[2])];
      }
      continue;
    }
    const type = e[0];
    if (type === "?") {
      s.changes.push({ path: e.slice(2), code: "U", kind: "untracked" });
    } else if (type === "1" || type === "2") {
      // 1 XY sub mH mI mW hH hI path / 2 XY sub mH mI mW hH hI Xscore path \0 orig
      const fields = type === "1" ? 8 : 9;
      const f = splitN(e, fields);
      const xy = f[1];
      const path = f[fields];
      const orig = type === "2" ? parts[++i] : undefined;
      if (xy[0] !== ".") s.staged.push(clean({ path, orig, code: xy[0], kind: "staged" as const }));
      if (xy[1] !== ".") s.changes.push(clean({ path, orig: xy[0] === "." ? orig : undefined, code: xy[1], kind: "changed" as const }));
    } else if (type === "u") {
      const f = splitN(e, 10);
      s.conflicts.push({ path: f[10], code: "!", kind: "conflict" });
    }
  }
  const byPath = (a: FileChange, b: FileChange) => a.path.localeCompare(b.path);
  s.staged.sort(byPath);
  s.changes.sort(byPath);
  s.conflicts.sort(byPath);
  return s;
}

/** Split off the first `n` space-separated fields; the rest (a path, may contain spaces) is element `n`. */
function splitN(s: string, n: number): string[] {
  const out: string[] = [];
  let pos = 0;
  for (let k = 0; k < n; k++) {
    const sp = s.indexOf(" ", pos);
    if (sp < 0) break;
    out.push(s.slice(pos, sp));
    pos = sp + 1;
  }
  out.push(s.slice(pos));
  return out;
}

function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

export function parseLog(out: string): Commit[] {
  return out
    .split(RS)
    .map((r) => r.replace(/^\n/, ""))
    .filter((r) => r.includes(US))
    .map((r) => {
      const [sha, short, author, date, refs, ...subject] = r.split(US);
      return {
        sha, short, author, date,
        refs: refs ? refs.split(", ").map((x) => x.replace(/^HEAD -> /, "")).filter((x) => x && x !== "HEAD") : [],
        subject: subject.join(US).replace(/\n$/, ""),
      };
    });
}

export function parseBranches(out: string): Branch[] {
  return out
    .split("\n")
    .filter((l) => l.includes(US))
    .map((l) => {
      const [ref, name, head, upstream, date] = l.split(US);
      return { ref, name, remote: ref.startsWith("refs/remotes/"), current: head === "*", upstream: upstream || null, date: date ?? "" };
    })
    .filter((b) => !(b.remote && b.ref.endsWith("/HEAD")));
}

export function parseStashes(out: string): Stash[] {
  return out
    .split("\n")
    .filter((l) => l.includes(US))
    .map((l) => {
      const [ref, message, date] = l.split(US);
      return { ref, message, date: date ?? "" };
    });
}

/** Remote names seen in remote branches (`origin/main` → `origin`), `origin` first. */
export function remotesOf(branches: Branch[]): string[] {
  const set = new Set(branches.filter((b) => b.remote).map((b) => b.ref.slice("refs/remotes/".length).split("/")[0]));
  return [...set].sort((a, b) => (a === "origin" ? -1 : b === "origin" ? 1 : a.localeCompare(b)));
}

/** Unified diff (one or several files) → classified lines with old/new line numbers. */
export function parseDiff(out: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldNo = 0;
  let newNo = 0;
  let inHunk = false;
  const src = out.endsWith("\n") ? out.slice(0, -1) : out;
  if (!src) return lines;
  for (const text of src.split("\n")) {
    if (text.startsWith("diff --git ") || text.startsWith("commit ")) {
      inHunk = false;
      lines.push({ kind: "file", text });
      continue;
    }
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (h) {
      inHunk = true;
      oldNo = Number(h[1]);
      newNo = Number(h[2]);
      lines.push({ kind: "hunk", text });
      continue;
    }
    if (inHunk && text.startsWith("+")) lines.push({ kind: "add", text, new: newNo++ });
    else if (inHunk && text.startsWith("-")) lines.push({ kind: "del", text, old: oldNo++ });
    else if (inHunk && (text.startsWith(" ") || text === "")) lines.push({ kind: "ctx", text, old: oldNo++, new: newNo++ });
    else lines.push({ kind: "meta", text });
  }
  return lines;
}

// ---------- errors ----------

export type GitErrorKind = "not-repo" | "no-git" | "auth" | "no-upstream" | "conflict" | "identity" | "no-commits" | "other";

export function classifyError(stderr: string): GitErrorKind {
  const s = stderr;
  if (/not a git repository/i.test(s)) return "not-repo";
  if (/git is not installed|git: not found|command not found|No such file or directory.*git/i.test(s)) return "no-git";
  if (/terminal prompts disabled|could not read (Username|Password)|Authentication failed|Permission denied \(publickey|Host key verification failed|could not read from remote repository|passphrase/i.test(s)) return "auth";
  if (/has no upstream branch|no upstream configured|no tracking information/i.test(s)) return "no-upstream";
  if (/CONFLICT|fix conflicts|unmerged files|Merge conflict/i.test(s)) return "conflict";
  if (/Please tell me who you are|unable to auto-detect email/i.test(s)) return "identity";
  if (/does not have any commits yet|unknown revision or path not in the working tree|bad default revision 'HEAD'/i.test(s)) return "no-commits";
  return "other";
}

/** Short message of a failed git command: last meaningful lines of stderr. */
export function errorMessage(stderr: string, stdout = ""): string {
  const lines = (stderr.trim() || stdout.trim())
    .split("\n")
    .map((l) => l.replace(/^(error|fatal|hint): ?/, "").trim())
    .filter((l) => l && !/^\(use "git/.test(l));
  return lines.slice(-3).join(" ") || "git failed";
}

/** Split a repo-relative path into name and directory (for the file list). */
export function splitPath(p: string): { name: string; dir: string } {
  const i = p.lastIndexOf("/");
  return i < 0 ? { name: p, dir: "" } : { name: p.slice(i + 1), dir: p.slice(0, i) };
}

/** Join the repository root and a repo-relative path. */
export function joinRepo(root: string, rel: string): string {
  const sep = /^[A-Za-z]:\\/.test(root) || (root.includes("\\") && !root.includes("/")) ? "\\" : "/";
  return root.replace(/[\\/]+$/, "") + sep + (sep === "\\" ? rel.replace(/\//g, "\\") : rel);
}

/** Last path component (repository name). */
export function repoName(root: string): string {
  return root.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || root;
}
