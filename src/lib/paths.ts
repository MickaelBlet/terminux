// Quoting and translation of dropped file paths.

/** Quote a path for pasting into a shell. */
export function quotePath(p: string, windows: boolean): string {
  if (windows) return /\s/.test(p) ? `"${p}"` : p;
  return /^[\w@%+=:,./-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`;
}

/** Translate a Windows path for a POSIX environment (`path_translation_style`). */
export function translatePath(p: string, style: string): string {
  if (style === "none" || !style) return p;
  const wsl = /^\\\\(?:wsl\$|wsl\.localhost)\\[^\\]+(\\.*)?$/i.exec(p);
  if (wsl && style === "wsl") return (wsl[1] ?? "\\").replace(/\\/g, "/");
  const m = /^([a-zA-Z]):[\\/]?(.*)$/.exec(p);
  if (!m) return p;
  const drive = m[1].toLowerCase();
  const rest = m[2].replace(/\\/g, "/");
  switch (style) {
    case "wsl":
      return `/mnt/${drive}/${rest}`;
    case "cygwin":
      return `/cygdrive/${drive}/${rest}`;
    case "msys2":
      return `/${drive}/${rest}`;
    case "mingw":
      return `${m[1]}:/${rest}`;
    default:
      return p;
  }
}

/** Text pasted for dropped files. */
export function droppedPaths(paths: string[], style: string, windows: boolean): string {
  const translate = style !== "none" && !!style;
  return paths.map((p) => quotePath(translatePath(p, style), windows && !translate)).join(" ");
}
