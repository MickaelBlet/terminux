// Paste filtering and warnings (pure).

export const LARGE_PASTE = 5 * 1024;

/** Strip control characters a paste must never inject (keeps tab, CR, LF); optionally trim the tail. */
export function sanitizePaste(text: string, trim: boolean): string {
  // eslint-disable-next-line no-control-regex
  let out = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  if (trim) out = out.replace(/[ \t\r\n]+$/, "");
  return out;
}

export const isMultiLine = (text: string) => /[\r\n]/.test(text.replace(/[\r\n]+$/, ""));

export type PasteWarning = "large" | "multiline" | null;

type Setting = boolean | string | undefined;

/** true / "automatic" (default): warn unless the application enabled bracketed paste; "always"; false / "never". */
const applies = (setting: Setting, bracketed: boolean) =>
  setting === false || setting === "never" ? false : setting === "always" ? true : !bracketed;

/** Which confirmation a paste needs. */
export function pasteWarning(text: string, opts: { large?: Setting; multiLine?: Setting; bracketed: boolean }): PasteWarning {
  if (text.length > LARGE_PASTE && applies(opts.large, opts.bracketed)) return "large";
  if (isMultiLine(text) && applies(opts.multiLine, opts.bracketed)) return "multiline";
  return null;
}
