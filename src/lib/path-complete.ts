// Path completion for the open_file prompt (pure: listing is done by the backend).

import { resolveFilePath } from "./file-links";

export interface PathEntry {
  name: string;
  dir: boolean;
}

export interface CompletionQuery {
  /** Typed text up to and including the last separator (kept as is when completing). */
  head: string;
  /** Last path segment being typed. */
  prefix: string;
  /** Directory to list (resolved against the base directory), null if it cannot be resolved. */
  dir: string | null;
}

const lastSep = (s: string) => Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));

/** Split the typed text; `base` is the directory relative paths start from. */
export function completionQuery(text: string, base: string | null): CompletionQuery {
  const s = text.replace(/^\s*["']?/, "");
  const lead = text.length - s.length;
  const i = lastSep(s);
  const head = text.slice(0, lead + i + 1);
  const prefix = s.slice(i + 1);
  const dirPart = s.slice(0, i + 1);
  return { head, prefix, dir: dirPart ? resolveFilePath(dirPart, base) : base };
}

/** Entries matching `prefix`: dotfiles only when the prefix starts with a dot. */
export function filterEntries(entries: PathEntry[], prefix: string, ignoreCase = false): PathEntry[] {
  const p = ignoreCase ? prefix.toLowerCase() : prefix;
  return entries.filter((e) => {
    if (e.name.startsWith(".") && !prefix.startsWith(".")) return false;
    return (ignoreCase ? e.name.toLowerCase() : e.name).startsWith(p);
  });
}

/** Longest common prefix of the names. */
export function commonPrefix(names: string[], ignoreCase = false): string {
  if (!names.length) return "";
  let out = names[0];
  for (const n of names.slice(1)) {
    let i = 0;
    while (i < out.length && i < n.length && (ignoreCase ? out[i].toLowerCase() === n[i].toLowerCase() : out[i] === n[i])) i++;
    out = out.slice(0, i);
  }
  return out;
}

/** Separator to append after a completed directory: the one already typed, else the base's style. */
export function separatorOf(text: string, base: string | null): string {
  if (text.includes("/")) return "/";
  if (text.includes("\\")) return "\\";
  return base && base.includes("\\") && !base.includes("/") ? "\\" : "/";
}

/** Text after accepting `name` (a directory gets a trailing separator to keep completing). */
export function applyCompletion(q: CompletionQuery, name: string, dir: boolean, sep: string): string {
  return q.head + name + (dir ? sep : "");
}
