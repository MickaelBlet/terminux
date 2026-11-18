// File path detection in terminal output (Ctrl+click opens an editor).

export interface FileLink {
  /** Offsets in the scanned text, `end` exclusive (covers the `:line:col` suffix). */
  start: number;
  end: number;
  path: string;
  line?: number;
  col?: number;
}

const URL_RE = /[a-z][a-z0-9+.-]*:\/\/\S+/gi;
// Optional prefix (C:\  ~/  ./  ../  /), path segments, then an optional location suffix:
// `:12`, `:12:5`, `(12)`, `(12,5)`, `", line 12` (Python tracebacks).
const PATH_RE =
  /(^|[^\w.@+\-\\/~:])((?:[A-Za-z]:[\\/]|~[\\/]|\.{1,2}[\\/]|[\\/])?(?:[\w.@+\-]+[\\/])*[\w.@+\-]+)(?::(\d+)(?::(\d+))?|\((\d+)(?:,\s*(\d+))?\)|"?, line (\d+))?/g;

const hasSep = (p: string) => /[\\/]/.test(p);
const hasExt = (p: string) => /[^.\\/][^\\/]*\.[A-Za-z][\w-]*$/.test(p);

/** Path-like tokens of one (unwrapped) terminal line. URLs are skipped. */
export function findFileLinks(text: string): FileLink[] {
  const masked = text.replace(URL_RE, (m) => " ".repeat(m.length));
  const out: FileLink[] = [];
  for (const m of masked.matchAll(PATH_RE)) {
    let path = m[2];
    const start = m.index! + m[1].length;
    let end = start + m[0].length - m[1].length;
    const num = (s?: string) => (s ? Number(s) : undefined);
    let line = num(m[3] ?? m[5] ?? m[7]);
    const col = num(m[4] ?? m[6]);
    if (line === undefined) {
      // Trailing sentence punctuation is not part of the path.
      const trimmed = path.replace(/[.\-]+$/, "");
      end -= path.length - trimmed.length;
      path = trimmed;
    }
    if (!path || /^[.\\/~]+$/.test(path)) continue;
    if (!hasSep(path) && !hasExt(path)) continue;
    // A bare drive or a lone separator segment like "a/" is not a file.
    if (/[\\/]$/.test(path)) continue;
    if (line === 0) line = undefined;
    out.push({ start, end, path, ...(line !== undefined && { line }), ...(col !== undefined && { col }) });
  }
  return out;
}

const isAbsolute = (p: string) => /^(?:[A-Za-z]:[\\/]|[\\/]|~(?:[\\/]|$))/.test(p);

/** Resolve `path` against the pane directory; `~` is left for the backend to expand. */
export function resolveFilePath(path: string, cwd: string | null): string | null {
  if (isAbsolute(path)) return path;
  if (!cwd) return null;
  const sep = cwd.includes("\\") && !cwd.includes("/") ? "\\" : "/";
  const rel = path.replace(/^\.[\\/]/, "");
  return cwd.replace(/[\\/]+$/, "") + sep + rel;
}

/** Typed path (open_file prompt): surrounding quotes dropped, `:line[:col]` suffix split off. */
export function parseFileArg(text: string): Omit<FileLink, "start" | "end"> | null {
  let s = text.trim();
  if (/^(["']).*\1$/.test(s) && s.length >= 2) s = s.slice(1, -1).trim();
  const m = /^(.*?)(?::(\d+)(?::(\d+))?)?$/.exec(s)!;
  const path = m[1];
  if (!path) return null;
  const line = m[2] ? Number(m[2]) : undefined;
  const col = m[3] ? Number(m[3]) : undefined;
  return { path, ...(line && { line }), ...(line && col && { col }) };
}

/** Parent directory of a resolved path (starting directory of a fallback editor tab). */
export function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i <= 0 ? path.slice(0, i + 1) || "/" : path.slice(0, i);
}
