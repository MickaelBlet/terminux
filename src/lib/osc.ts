// Pure parsers for the OSC sequences Terminux understands.

/** ConEmu / Windows Terminal progress: state 0 none, 1 normal, 2 error, 3 indeterminate, 4 paused. */
export interface Progress {
  state: 1 | 2 | 3 | 4;
  value: number;
}

/** OSC 9 payload `4;<state>;<progress>`. `null` clears; `undefined` = not a progress sequence. */
export function parseProgress(data: string): Progress | null | undefined {
  const m = /^4;(\d)(?:;(\d{1,3}))?/.exec(data);
  if (!m) return undefined;
  const state = Number(m[1]);
  if (state < 1 || state > 4) return null;
  const value = Math.min(100, Number(m[2] ?? 0));
  return { state: state as Progress["state"], value };
}

const unquote = (s: string) => (s.length >= 2 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s);

/** OSC 9 payload `9;<path>` (ConEmu current directory). */
export function parseCwd99(data: string): string | undefined {
  if (!data.startsWith("9;")) return undefined;
  return unquote(data.slice(2).trim()) || undefined;
}

/** OSC 7 payload `file://host/path`. */
export function parseCwd7(data: string): string | undefined {
  const m = /^file:\/\/[^/]*(\/.*)$/.exec(data.trim());
  if (!m) return undefined;
  let path: string;
  try {
    path = decodeURIComponent(m[1]);
  } catch {
    path = m[1];
  }
  // file:///C:/dir → C:/dir
  return /^\/[a-zA-Z]:/.test(path) ? path.slice(1) : path;
}

export type ShellMark =
  | { kind: "prompt" }
  | { kind: "command_start" }
  | { kind: "output_start" }
  | { kind: "command_end"; exitCode?: number }
  | { kind: "commandline"; text: string }
  | { kind: "cwd"; path: string };

function ftcs(data: string): ShellMark | undefined {
  const [code, arg] = data.split(";");
  switch (code) {
    case "A":
      return { kind: "prompt" };
    case "B":
      return { kind: "command_start" };
    case "C":
      return { kind: "output_start" };
    case "D": {
      const n = arg === undefined || arg === "" ? NaN : Number(arg);
      return { kind: "command_end", ...(Number.isFinite(n) ? { exitCode: n } : {}) };
    }
  }
  return undefined;
}

/** OSC 133 (FinalTerm / FTCS) shell integration marks. */
export const parse133 = (data: string): ShellMark | undefined => ftcs(data);

/** Strip C0 controls and DEL: decoded text may be typed back into a shell. */
const stripControls = (s: string) => s.replace(/[\x00-\x1f\x7f]/g, "");

const unescape633 = (s: string) =>
  stripControls(s.replace(/\\(\\|x([0-9a-fA-F]{2}))/g, (_, all: string, hex?: string) => (hex ? String.fromCharCode(parseInt(hex, 16)) : all)));

/** OSC 633 (VS Code) shell integration marks. */
export function parse633(data: string): ShellMark | undefined {
  const code = data.split(";", 1)[0];
  const rest = data.slice(code.length + 1);
  if (code === "E") return { kind: "commandline", text: unescape633(rest.split(";", 1)[0]) };
  if (code === "P") {
    const m = /^Cwd=(.*)$/.exec(rest);
    return m ? { kind: "cwd", path: unescape633(m[1]) } : undefined;
  }
  return ftcs(data);
}

/** Largest accepted OSC 52 payload (base64 characters, ~768 KB of text). */
export const OSC52_MAX = 1024 * 1024;

/** OSC 52 clipboard write: `<targets>;<base64>`. `null` text = query (ignored). */
export function parseOsc52(data: string): { text: string | null } | undefined {
  const i = data.indexOf(";");
  if (i < 0) return undefined;
  const payload = data.slice(i + 1);
  if (payload === "?") return { text: null };
  if (payload.length > OSC52_MAX) return undefined;
  try {
    const bin = atob(payload);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return { text: new TextDecoder().decode(bytes) };
  } catch {
    return undefined;
  }
}

/**
 * Whether pty output contains printable text once control sequences are skipped.
 * ConPTY writes mode/clear sequences on its own at spawn, even when the process hangs.
 */
export function hasVisibleText(bytes: Uint8Array): boolean {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b === 0x1b) {
      const next = bytes[i + 1];
      if (next === 0x5b) {
        // CSI: parameters/intermediates until a final byte 0x40-0x7e.
        i += 2;
        while (i < bytes.length && (bytes[i] < 0x40 || bytes[i] > 0x7e)) i++;
        i++;
      } else if (next === 0x5d || next === 0x50 || next === 0x5f || next === 0x5e) {
        // OSC / DCS / APC / PM: until BEL or ST.
        i += 2;
        while (i < bytes.length && bytes[i] !== 0x07 && !(bytes[i] === 0x1b && bytes[i + 1] === 0x5c)) i++;
        i += bytes[i] === 0x07 ? 1 : 2;
      } else {
        // Other escapes: intermediates (0x20-0x2f, e.g. charset `ESC ( B`) then one final byte.
        i += 1;
        while (i < bytes.length && bytes[i] >= 0x20 && bytes[i] <= 0x2f) i++;
        i++;
      }
      continue;
    }
    if (b > 0x20 && b !== 0x7f) return true;
    i++;
  }
  return false;
}
