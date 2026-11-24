// Diff model for the diff tab: options → git flags, structured parsing, side-by-side rows,
// word-level changes and partial patches (hunk / line staging). Pure: no DOM or Tauri imports.

export type DiffMode = "unified" | "split";
export type DiffWhitespace = "none" | "change" | "all";
export type DiffAlgorithm = "default" | "minimal" | "patience" | "histogram";

export interface DiffOptions {
  mode: DiffMode;
  ignoreWhitespace: DiffWhitespace;
  ignoreBlankLines: boolean;
  /** Context lines around changes. */
  context: number;
  /** Show the whole file (overrides `context`). */
  fullFile: boolean;
  algorithm: DiffAlgorithm;
  renames: boolean;
  wordHighlight: boolean;
  syntax: boolean;
  wrap: boolean;
  lineNumbers: boolean;
}

export const DIFF_DEFAULTS: DiffOptions = {
  mode: "unified",
  ignoreWhitespace: "none",
  ignoreBlankLines: false,
  context: 3,
  fullFile: false,
  algorithm: "default",
  renames: true,
  wordHighlight: true,
  syntax: true,
  wrap: false,
  lineNumbers: true,
};

export const MAX_CONTEXT = 100;

/** Config keys (`diff_*`) giving the defaults. */
export interface DiffConfig {
  diff_view_mode?: unknown;
  diff_ignore_whitespace?: unknown;
  diff_ignore_blank_lines?: unknown;
  diff_context_lines?: unknown;
  diff_algorithm?: unknown;
  diff_detect_renames?: unknown;
  diff_word_highlight?: unknown;
  diff_syntax_highlight?: unknown;
  diff_word_wrap?: unknown;
  diff_line_numbers?: unknown;
}

const oneOf = <T extends string>(v: unknown, values: readonly T[], def: T): T => (values.includes(v as T) ? (v as T) : def);
const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
const ctx = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(MAX_CONTEXT, Math.max(0, Math.round(v))) : def);

/** Defaults from the config, then the tab's overrides; invalid values fall back. */
export function diffOptions(cfg: DiffConfig, override: Partial<DiffOptions> = {}): DiffOptions {
  const d = DIFF_DEFAULTS;
  const base: DiffOptions = {
    mode: oneOf(cfg.diff_view_mode, ["unified", "split"], d.mode),
    ignoreWhitespace: oneOf(cfg.diff_ignore_whitespace, ["none", "change", "all"], d.ignoreWhitespace),
    ignoreBlankLines: bool(cfg.diff_ignore_blank_lines, d.ignoreBlankLines),
    context: ctx(cfg.diff_context_lines, d.context),
    fullFile: false,
    algorithm: oneOf(cfg.diff_algorithm, ["default", "minimal", "patience", "histogram"], d.algorithm),
    renames: bool(cfg.diff_detect_renames, d.renames),
    wordHighlight: bool(cfg.diff_word_highlight, d.wordHighlight),
    syntax: bool(cfg.diff_syntax_highlight, d.syntax),
    wrap: bool(cfg.diff_word_wrap, d.wrap),
    lineNumbers: bool(cfg.diff_line_numbers, d.lineNumbers),
  };
  const o = override;
  return {
    mode: oneOf(o.mode, ["unified", "split"], base.mode),
    ignoreWhitespace: oneOf(o.ignoreWhitespace, ["none", "change", "all"], base.ignoreWhitespace),
    ignoreBlankLines: bool(o.ignoreBlankLines, base.ignoreBlankLines),
    context: ctx(o.context, base.context),
    fullFile: bool(o.fullFile, base.fullFile),
    algorithm: oneOf(o.algorithm, ["default", "minimal", "patience", "histogram"], base.algorithm),
    renames: bool(o.renames, base.renames),
    wordHighlight: bool(o.wordHighlight, base.wordHighlight),
    syntax: bool(o.syntax, base.syntax),
    wrap: bool(o.wrap, base.wrap),
    lineNumbers: bool(o.lineNumbers, base.lineNumbers),
  };
}

/** Git flags for the options that change git's output. */
export function diffFlags(o: DiffOptions): string[] {
  const f: string[] = [];
  // Long forms only: the backend allow-lists options (src-tauri/src/git.rs).
  if (o.ignoreWhitespace === "all") f.push("--ignore-all-space");
  else if (o.ignoreWhitespace === "change") f.push("--ignore-space-change");
  if (o.ignoreBlankLines) f.push("--ignore-blank-lines");
  f.push(`--unified=${o.fullFile ? 1000000 : o.context}`);
  if (o.algorithm !== "default") f.push(`--diff-algorithm=${o.algorithm}`);
  f.push(o.renames ? "--find-renames" : "--no-renames");
  return f;
}

// ---------- parsing ----------

export type DiffLineKind = "add" | "del" | "ctx" | "nonl";

export interface DiffLine {
  kind: DiffLineKind;
  /** Content without the +/-/space prefix. */
  text: string;
  old?: number;
  new?: number;
}

export interface Hunk {
  header: string;
  /** Text after the second `@@` (enclosing function). */
  section: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

export type FileStatus = "modified" | "added" | "deleted" | "renamed" | "copied";

export interface DiffFile {
  /** Header lines from `diff --git` up to (excluding) the first hunk. */
  header: string[];
  oldPath: string;
  newPath: string;
  status: FileStatus;
  binary: boolean;
  hunks: Hunk[];
  added: number;
  removed: number;
}

export interface ParsedDiff {
  /** Text before the first file (commit message, `--stat`). */
  preamble: string[];
  files: DiffFile[];
}

const unquote = (p: string) => {
  if (!p.startsWith('"')) return p;
  try {
    return JSON.parse(p) as string;
  } catch {
    return p.slice(1, -1);
  }
};
const stripAB = (p: string) => unquote(p).replace(/^[ab]\//, "");

function pathsOfGitLine(line: string): [string, string] {
  const rest = line.slice("diff --git ".length);
  const q = /^("(?:[^"\\]|\\.)*"|\S+) ("(?:[^"\\]|\\.)*"|\S+)$/.exec(rest);
  if (q) return [stripAB(q[1]), stripAB(q[2])];
  // Unquoted paths with spaces: split in the middle (`a/x y b/x y`).
  const half = rest.length >> 1;
  return [stripAB(rest.slice(0, half)), stripAB(rest.slice(half + 1))];
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/;

/** Unified diff (`git diff`, `git show`, `git stash show -p`) → files and hunks. */
export function parseDiffFiles(out: string): ParsedDiff {
  const res: ParsedDiff = { preamble: [], files: [] };
  const src = out.endsWith("\n") ? out.slice(0, -1) : out;
  if (!src) return res;
  let file: DiffFile | null = null;
  let hunk: Hunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  let oldLeft = 0;
  let newLeft = 0;
  for (const text of src.split("\n")) {
    if (text.startsWith("diff --git ")) {
      const [a, b] = pathsOfGitLine(text);
      file = { header: [text], oldPath: a, newPath: b, status: "modified", binary: false, hunks: [], added: 0, removed: 0 };
      res.files.push(file);
      hunk = null;
      continue;
    }
    if (!file) {
      res.preamble.push(text);
      continue;
    }
    const h = HUNK_RE.exec(text);
    if (h && (!hunk || (oldLeft <= 0 && newLeft <= 0))) {
      const m = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(text)!;
      oldNo = Number(h[1]);
      newNo = Number(h[2]);
      oldLeft = m[1] === undefined ? 1 : Number(m[1]);
      newLeft = m[2] === undefined ? 1 : Number(m[2]);
      hunk = { header: text, section: h[3], oldStart: oldNo, newStart: newNo, lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (hunk) {
      const c = text[0];
      if (c === "+" && newLeft > 0) {
        hunk.lines.push({ kind: "add", text: text.slice(1), new: newNo++ });
        newLeft--;
        file.added++;
        continue;
      }
      if (c === "-" && oldLeft > 0) {
        hunk.lines.push({ kind: "del", text: text.slice(1), old: oldNo++ });
        oldLeft--;
        file.removed++;
        continue;
      }
      if ((c === " " || text === "") && (oldLeft > 0 || newLeft > 0)) {
        hunk.lines.push({ kind: "ctx", text: text.slice(1), old: oldNo++, new: newNo++ });
        oldLeft--;
        newLeft--;
        continue;
      }
      if (c === "\\") {
        hunk.lines.push({ kind: "nonl", text: text.slice(2) });
        continue;
      }
      // Hunk finished: anything else ends this file's content (e.g. the next commit in a log).
      hunk = null;
      file = null;
      res.preamble.push(text);
      continue;
    }
    file.header.push(text);
    if (text.startsWith("new file mode")) file.status = "added";
    else if (text.startsWith("deleted file mode")) file.status = "deleted";
    else if (text.startsWith("rename from ")) {
      file.status = "renamed";
      file.oldPath = unquote(text.slice(12));
    } else if (text.startsWith("rename to ")) file.newPath = unquote(text.slice(10));
    else if (text.startsWith("copy from ")) {
      file.status = "copied";
      file.oldPath = unquote(text.slice(10));
    } else if (text.startsWith("copy to ")) file.newPath = unquote(text.slice(8));
    else if (text.startsWith("Binary files ") || text === "GIT binary patch") file.binary = true;
  }
  return res;
}

/** Display path of a file (`old → new` for renames). */
export const filePath = (f: DiffFile) => (f.status === "deleted" ? f.oldPath : f.newPath);
export const fileLabel = (f: DiffFile) => (f.oldPath !== f.newPath && (f.status === "renamed" || f.status === "copied") ? `${f.oldPath} → ${f.newPath}` : filePath(f));

// ---------- side by side ----------

export interface SplitRow {
  left?: DiffLine;
  right?: DiffLine;
  /** Index of the line in `hunk.lines` for each side. */
  li?: number;
  ri?: number;
}

/** Side-by-side rows: context on both sides, each `-` run aligned with the `+` run after it. */
export function splitRows(h: Hunk): SplitRow[] {
  const rows: SplitRow[] = [];
  const ls = h.lines;
  let i = 0;
  while (i < ls.length) {
    const l = ls[i];
    if (l.kind === "ctx") {
      rows.push({ left: l, right: l, li: i, ri: i });
      i++;
      continue;
    }
    if (l.kind === "nonl") {
      // Attach to the side of the previous line.
      const prev = ls[i - 1];
      if (prev?.kind === "add") rows.push({ right: l, ri: i });
      else if (prev?.kind === "del") rows.push({ left: l, li: i });
      else rows.push({ left: l, right: l, li: i, ri: i });
      i++;
      continue;
    }
    const dels: number[] = [];
    const adds: number[] = [];
    while (i < ls.length && (ls[i].kind === "del" || (ls[i].kind === "nonl" && ls[i - 1]?.kind === "del"))) {
      if (ls[i].kind === "del") dels.push(i);
      i++;
    }
    while (i < ls.length && (ls[i].kind === "add" || (ls[i].kind === "nonl" && ls[i - 1]?.kind === "add"))) {
      if (ls[i].kind === "add") adds.push(i);
      i++;
    }
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
      const li = dels[k];
      const ri = adds[k];
      rows.push({ left: li !== undefined ? ls[li] : undefined, right: ri !== undefined ? ls[ri] : undefined, li, ri });
    }
  }
  return rows;
}

/** Pairs (del index → add index) of modified lines, for word highlighting. */
export function pairLines(h: Hunk): Map<number, number> {
  const pairs = new Map<number, number>();
  for (const r of splitRows(h)) {
    if (r.li !== undefined && r.ri !== undefined && r.left?.kind === "del" && r.right?.kind === "add") {
      pairs.set(r.li, r.ri);
      pairs.set(r.ri, r.li);
    }
  }
  return pairs;
}

// ---------- word diff ----------

export interface Range {
  from: number;
  to: number;
}

const TOKEN_RE = /\w+|\s+|[^\w\s]/gu;
const tokenize = (s: string) => s.match(TOKEN_RE) ?? [];

/** Longest line compared word by word; longer ones are highlighted whole. */
export const WORD_DIFF_MAX = 500;

/** Changed ranges in `a` and `b` (token LCS). `null` when too long or too different to be useful. */
export function wordDiff(a: string, b: string): { a: Range[]; b: Range[] } | null {
  if (a.length > WORD_DIFF_MAX || b.length > WORD_DIFF_MAX) return null;
  const ta = tokenize(a);
  const tb = tokenize(b);
  const n = ta.length;
  const m = tb.length;
  // LCS table (lengths are bounded by WORD_DIFF_MAX).
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = ta[i] === tb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ra: Range[] = [];
  const rb: Range[] = [];
  const push = (rs: Range[], from: number, to: number) => {
    if (from === to) return;
    const last = rs[rs.length - 1];
    if (last && last.to === from) last.to = to;
    else rs.push({ from, to });
  };
  let i = 0;
  let j = 0;
  let pa = 0;
  let pb = 0;
  let common = 0;
  while (i < n || j < m) {
    if (i < n && j < m && ta[i] === tb[j]) {
      common += ta[i].trim() ? ta[i].length : 0;
      pa += ta[i++].length;
      pb += tb[j++].length;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      push(rb, pb, pb + tb[j].length);
      pb += tb[j++].length;
    } else {
      push(ra, pa, pa + ta[i].length);
      pa += ta[i++].length;
    }
  }
  const sig = Math.max(a.replace(/\s/g, "").length, b.replace(/\s/g, "").length);
  if (sig > 0 && common / sig < 0.3) return null;
  return { a: ra, b: rb };
}

// ---------- segments (syntax + word highlight) ----------

export interface Span {
  from: number;
  to: number;
  cls: string;
}

export interface Segment {
  text: string;
  /** Syntax class (highlighter output). */
  cls?: string;
  /** Inside a word-level change. */
  changed?: boolean;
}

/** Cut `text` at every span/range boundary. */
export function segments(text: string, syntax: Span[] = [], changed: Range[] = []): Segment[] {
  if (!syntax.length && !changed.length) return [{ text }];
  const cuts = new Set<number>([0, text.length]);
  for (const s of syntax) cuts.add(Math.max(0, Math.min(text.length, s.from))).add(Math.max(0, Math.min(text.length, s.to)));
  for (const r of changed) cuts.add(r.from).add(r.to);
  const pts = [...cuts].filter((p) => p >= 0 && p <= text.length).sort((x, y) => x - y);
  const out: Segment[] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const from = pts[k];
    const to = pts[k + 1];
    if (from === to) continue;
    const cls = syntax.filter((s) => s.from <= from && s.to >= to).map((s) => s.cls).join(" ") || undefined;
    const ch = changed.some((r) => r.from <= from && r.to >= to);
    const prev = out[out.length - 1];
    if (prev && prev.cls === cls && !!prev.changed === ch) prev.text += text.slice(from, to);
    else out.push({ text: text.slice(from, to), ...(cls ? { cls } : {}), ...(ch ? { changed: true } : {}) });
  }
  return out;
}

/** Old and new text of a hunk (for syntax highlighting), with each line's index in `hunk.lines`. */
export function hunkSides(h: Hunk): { old: { text: string; idx: number[] }; new: { text: string; idx: number[] } } {
  const o: string[] = [];
  const n: string[] = [];
  const oi: number[] = [];
  const ni: number[] = [];
  h.lines.forEach((l, i) => {
    if (l.kind === "ctx" || l.kind === "del") {
      o.push(l.text);
      oi.push(i);
    }
    if (l.kind === "ctx" || l.kind === "add") {
      n.push(l.text);
      ni.push(i);
    }
  });
  return { old: { text: o.join("\n"), idx: oi }, new: { text: n.join("\n"), idx: ni } };
}

// ---------- partial patches ----------

export type HunkAction = "stage" | "unstage" | "discard";

/**
 * Patch for `hunk` of `file`, limited to `selected` line indexes (all changes when omitted),
 * to feed `git apply [--cached] [--reverse] --recount`. When applying forward, unselected
 * additions are dropped and unselected deletions become context; `reverse` swaps the rules
 * (the patch is then the diff that, reversed, undoes only the selected lines).
 * Returns null when the selection holds no change.
 */
export function buildPatch(file: DiffFile, hunk: Hunk, selected?: Set<number>, reverse = false): string | null {
  const out: string[] = [];
  let oldCount = 0;
  let newCount = 0;
  let changes = 0;
  let lastKept: DiffLine | null = null;
  hunk.lines.forEach((l, i) => {
    const sel = !selected || selected.has(i);
    if (l.kind === "nonl") {
      if (lastKept) out.push(`\\ ${l.text}`);
      return;
    }
    if (l.kind === "ctx") {
      out.push(` ${l.text}`);
      oldCount++;
      newCount++;
      lastKept = l;
      return;
    }
    if (sel) {
      out.push(`${l.kind === "add" ? "+" : "-"}${l.text}`);
      if (l.kind === "add") newCount++;
      else oldCount++;
      changes++;
      lastKept = l;
      return;
    }
    // Unselected change: the line that exists on the side the patch applies to becomes context.
    const keep = reverse ? l.kind === "add" : l.kind === "del";
    if (keep) {
      out.push(` ${l.text}`);
      oldCount++;
      newCount++;
      lastKept = l;
    } else lastKept = null;
  });
  if (!changes) return null;
  const header = file.header.filter((h) => h.startsWith("diff --git") || h.startsWith("--- ") || h.startsWith("+++ ") || /^(new|deleted) file mode|^index /.test(h));
  // A partial selection of a new/deleted file can't keep the creation/deletion semantics.
  const partial = !!selected && hunk.lines.some((l, i) => (l.kind === "add" || l.kind === "del") && !selected.has(i));
  const hdr = partial ? header.filter((h) => !/^(new|deleted) file mode/.test(h)).map((h) => (h === "--- /dev/null" ? `--- a/${file.newPath}` : h === "+++ /dev/null" ? `+++ b/${file.oldPath}` : h)) : header;
  if (!hdr.some((h) => h.startsWith("--- "))) hdr.push(`--- a/${file.oldPath}`, `+++ b/${file.newPath}`);
  const start = (n: number, count: number) => (count === 0 ? Math.max(0, n - 1) : n);
  const at = `@@ -${start(hunk.oldStart, oldCount)},${oldCount} +${start(hunk.newStart, newCount)},${newCount} @@${hunk.section ? " " + hunk.section : ""}`;
  return [...hdr, at, ...out].join("\n") + "\n";
}

// ---------- navigation ----------

/** Indexes of the first line of each change block (consecutive add/del) in a flat line list. */
export function changeStarts(kinds: readonly string[]): number[] {
  const res: number[] = [];
  let prev = false;
  kinds.forEach((k, i) => {
    const ch = k === "add" || k === "del";
    if (ch && !prev) res.push(i);
    prev = ch;
  });
  return res;
}

/** Next (dir 1) or previous (dir -1) element of sorted `list` strictly after/before `pos`, wrapping. */
export function stepTo(list: readonly number[], pos: number, dir: 1 | -1): number | undefined {
  if (!list.length) return undefined;
  if (dir === 1) return list.find((x) => x > pos) ?? list[0];
  for (let k = list.length - 1; k >= 0; k--) if (list[k] < pos) return list[k];
  return list[list.length - 1];
}

// ---------- search ----------

/** Match ranges of `query` in `text`. */
export function findAll(text: string, query: string, caseSensitive: boolean): Range[] {
  if (!query) return [];
  const h = caseSensitive ? text : text.toLowerCase();
  const q = caseSensitive ? query : query.toLowerCase();
  const res: Range[] = [];
  for (let i = h.indexOf(q); i >= 0; i = h.indexOf(q, i + q.length)) res.push({ from: i, to: i + q.length });
  return res;
}
