// Targeted edits of config.toml text: set or remove one root key, keeping comments and layout.

const SECTION_RE = /^\s*\[/;
const blankOrComment = (l: string) => /^\s*(#.*)?$/.test(l);

/** TOML literal of a string array. JSON string escapes are valid TOML basic strings. */
export const tomlStringArray = (items: string[]) => `[${items.map((s) => JSON.stringify(s)).join(", ")}]`;

/** Index (in `text`) just past the value starting at `from`: brackets, strings and comments aware. */
function valueEnd(text: string, from: number): number {
  let depth = 0;
  let i = from;
  while (i < text.length && (text[i] === " " || text[i] === "\t")) i++;
  if (text[i] !== "[" && text[i] !== "{") {
    // Scalar: up to a comment or end of line.
    const nl = text.indexOf("\n", i);
    const end = nl < 0 ? text.length : nl;
    const line = text.slice(i, end);
    const hash = scalarComment(line);
    return i + (hash < 0 ? line.length : hash);
  }
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === "#") {
      const nl = text.indexOf("\n", i);
      if (nl < 0) return text.length;
      i = nl;
    } else if (c === '"' || c === "'") {
      const triple = text.startsWith(c.repeat(3), i);
      const q = triple ? c.repeat(3) : c;
      i += q.length;
      while (i < text.length && !text.startsWith(q, i)) {
        if (c === '"' && text[i] === "\\") i++;
        i++;
      }
      i += q.length - 1;
    } else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
}

/** Position of a `#` comment in a scalar value line (outside strings), or -1. */
function scalarComment(line: string): number {
  let q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === "\\" && q === '"') i++;
      else if (c === q) q = null;
    } else if (c === '"' || c === "'") q = c;
    else if (c === "#") return i;
  }
  return -1;
}

/** Set (`value` = TOML literal) or remove (`null`) a root-level key. */
export function setRootKey(src: string, key: string, value: string | null): string {
  const lines = src.split("\n");
  const header = lines.findIndex((l) => SECTION_RE.test(l));
  const rootEnd = header < 0 ? lines.length : header;
  const keyRe = new RegExp(`^\\s*${key}\\s*=`);
  const start = lines.slice(0, rootEnd).findIndex((l) => keyRe.test(l));

  if (start >= 0) {
    const offset = lines.slice(0, start).reduce((n, l) => n + l.length + 1, 0);
    const eq = src.indexOf("=", offset) + 1;
    const end = valueEnd(src, eq);
    const before = src.slice(0, offset);
    const after = src.slice(end);
    if (value !== null) return `${before}${key} = ${value}${after}`;
    // Remove the whole entry, including the rest of its last line.
    const rest = after.replace(/^[^\n]*\n?/, "");
    return before + rest;
  }
  if (value === null) return src;

  const line = `${key} = ${value}`;
  // After its commented example, else after the last root setting, else before the first section.
  const commented = lines.slice(0, rootEnd).findIndex((l) => new RegExp(`^\\s*#\\s*${key}\\s*=`).test(l));
  let at: number;
  if (commented >= 0) at = commented + 1;
  else {
    let last = -1;
    for (let i = 0; i < rootEnd; i++) if (!blankOrComment(lines[i])) last = i;
    if (last >= 0) at = last + 1;
    else if (header >= 0) {
      lines.splice(header, 0, line, "");
      return lines.join("\n");
    } else {
      const sep = src === "" || src.endsWith("\n") ? "" : "\n";
      return `${src}${sep}${line}\n`;
    }
  }
  lines.splice(at, 0, line);
  return lines.join("\n");
}
