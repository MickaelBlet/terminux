// Syntax highlighting of diff lines: each hunk's old and new sides are parsed with the file
// editor's language modes and highlighted with the editor's code style.
import { highlightTree } from "@lezer/highlight";
import { StyleModule } from "style-mod";
import { hunkSides, type DiffFile, type Span } from "../diff";
import { langOf } from "../file-langs";
import { loadLanguage } from "./editor-langs";
import { codeHighlight } from "./editor-theme";

/** Files with more changed/context lines than this are not highlighted. */
const MAX_LINES = 5000;

let mounted = false;
function mountStyle() {
  if (mounted || !codeHighlight.module) return;
  StyleModule.mount(document, codeHighlight.module);
  mounted = true;
}

/** Spans of `text` split per line. */
function spansPerLine(text: string, spans: Span[]): Span[][] {
  const starts = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) starts.push(i + 1);
  const res: Span[][] = starts.map(() => []);
  let line = 0;
  for (const s of spans) {
    while (line + 1 < starts.length && starts[line + 1] <= s.from) line++;
    // A span may cross lines (block comments, strings): cut it.
    let from = s.from;
    let l = line;
    while (l < starts.length && from < s.to) {
      const end = l + 1 < starts.length ? starts[l + 1] - 1 : text.length;
      const to = Math.min(s.to, end);
      if (to > from) res[l].push({ from: from - starts[l], to: to - starts[l], cls: s.cls });
      l++;
      from = l < starts.length ? starts[l] : s.to;
    }
  }
  return res;
}

/**
 * Per hunk, per line index: syntax spans. Deleted lines take the old side, others the new one.
 * Resolves to null when the file type is unknown or the file is too big.
 */
export async function highlightFile(file: DiffFile): Promise<Span[][][] | null> {
  if (file.binary) return null;
  const id = langOf(file.newPath) ?? langOf(file.oldPath);
  if (!id) return null;
  const total = file.hunks.reduce((n, h) => n + h.lines.length, 0);
  if (!total || total > MAX_LINES) return null;
  let parser;
  try {
    parser = (await loadLanguage(id)).language.parser;
  } catch {
    return null;
  }
  mountStyle();
  const run = (text: string) => {
    const spans: Span[] = [];
    highlightTree(parser.parse(text), codeHighlight, (from, to, cls) => spans.push({ from, to, cls }));
    return spansPerLine(text, spans);
  };
  return file.hunks.map((h) => {
    const sides = hunkSides(h);
    const res: Span[][] = h.lines.map(() => []);
    const oldSpans = run(sides.old.text);
    const newSpans = run(sides.new.text);
    sides.old.idx.forEach((li, k) => {
      if (h.lines[li].kind === "del") res[li] = oldSpans[k] ?? [];
    });
    sides.new.idx.forEach((li, k) => (res[li] = newSpans[k] ?? []));
    return res;
  });
}
