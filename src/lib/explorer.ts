// Explorer sidebar: pure path and tree helpers (the view is ui/ExplorerPane.svelte).

export interface DirEntry {
  name: string;
  dir: boolean;
}

/** One visible line of the tree. */
export interface Row {
  path: string;
  name: string;
  dir: boolean;
  depth: number;
  /** Directory expanded but its entries not loaded yet. */
  loading?: boolean;
  /** Directory expanded and listing failed. */
  error?: string;
}

/** Path separator used by `dir`: `\` for Windows paths, else `/`. */
export function sepOf(dir: string): "/" | "\\" {
  return /^[A-Za-z]:[\\/]?/.test(dir) || (dir.includes("\\") && !dir.includes("/")) ? "\\" : "/";
}

const trimEnd = (p: string) => (/^([A-Za-z]:)?[\\/]+$/.test(p) ? p : p.replace(/[\\/]+$/, ""));

export function joinPath(dir: string, name: string): string {
  const d = trimEnd(dir);
  const sep = sepOf(d);
  return (/[\\/]$/.test(d) ? d : d + sep) + name;
}

/** Last component (the directory itself for a root like `/` or `C:\`). */
export function baseName(p: string): string {
  const t = trimEnd(p);
  return t.split(/[\\/]/).filter(Boolean).pop() || t;
}

function same(a: string, b: string, ci: boolean) {
  return ci ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** `path` relative to `root` (with `/`), `null` when outside it, `""` when equal. */
export function relPath(root: string, path: string): string | null {
  const r = trimEnd(root);
  const p = trimEnd(path);
  const ci = sepOf(r) === "\\";
  if (same(r, p, ci)) return "";
  const prefix = /[\\/]$/.test(r) ? r : r + sepOf(r);
  if (p.length <= prefix.length || !same(p.slice(0, prefix.length), prefix, ci)) return null;
  return p.slice(prefix.length).replace(/\\/g, "/");
}

/** Directories from `root` (excluded) down to `path` (included) when `path` is inside `root`. */
export function ancestors(root: string, path: string): string[] {
  const rel = relPath(root, path);
  if (!rel) return [];
  const out: string[] = [];
  let cur = trimEnd(root);
  for (const part of rel.split("/").filter(Boolean)) {
    cur = joinPath(cur, part);
    out.push(cur);
  }
  return out;
}

/** Entries shown: never `.git`; other dotfiles only with `hidden`; directories first. */
export function visibleEntries(list: DirEntry[], hidden: boolean): DirEntry[] {
  return list
    .filter((e) => e.name !== ".git" && (hidden || !e.name.startsWith(".")))
    .sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.name.localeCompare(b.name));
}

/** Flatten the tree under `root`: children of expanded directories, listed from `entries`. */
export function flatten(
  root: string,
  entries: ReadonlyMap<string, DirEntry[] | { error: string }>,
  expanded: ReadonlySet<string>,
  hidden: boolean,
): Row[] {
  const rows: Row[] = [];
  const walk = (dir: string, depth: number) => {
    const list = entries.get(dir);
    if (!list || "error" in list) return;
    for (const e of visibleEntries(list, hidden)) {
      const path = joinPath(dir, e.name);
      const open = e.dir && expanded.has(path);
      const sub = open ? entries.get(path) : undefined;
      rows.push({
        path, name: e.name, dir: e.dir, depth,
        ...(open && !sub ? { loading: true } : {}),
        ...(sub && "error" in sub ? { error: sub.error } : {}),
      });
      if (open) walk(path, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

/** POSIX shell single-quoting (for `cd` sent to the terminal). */
export function shQuote(s: string): string {
  return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Path as a shell argument: POSIX quoting, double quotes for Windows paths (cmd, PowerShell). */
export function quotePath(p: string): string {
  return sepOf(p) === "\\" ? (/[\s&()^%;,'"]/.test(p) ? `"${p}"` : p) : shQuote(p);
}

/** `cd` commandline for `dir`. */
export function cdLine(dir: string): string {
  return `cd ${quotePath(dir)}`;
}
