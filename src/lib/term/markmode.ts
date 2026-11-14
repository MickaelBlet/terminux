// Keyboard selection ("mark mode"): arrows move, Shift extends, Ctrl jumps by word.
import type { Terminal } from "@xterm/xterm";

export interface Pos {
  x: number;
  /** Absolute buffer line. */
  y: number;
}

export type Motion =
  | "left" | "right" | "up" | "down" | "word_left" | "word_right" | "line_start" | "line_end"
  | "page_up" | "page_down" | "buffer_start" | "buffer_end";

export interface Bounds {
  cols: number;
  rows: number;
  /** Number of lines in the buffer. */
  length: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Move a position; `line(y)` gives a line's text for word motions. Pure. */
export function move(p: Pos, m: Motion, b: Bounds, line: (y: number) => string, separators: string): Pos {
  const last = b.length - 1;
  const isSep = (c: string | undefined) => c === undefined || c === " " || separators.includes(c);
  switch (m) {
    case "left":
      return p.x > 0 ? { x: p.x - 1, y: p.y } : p.y > 0 ? { x: b.cols - 1, y: p.y - 1 } : p;
    case "right":
      return p.x < b.cols - 1 ? { x: p.x + 1, y: p.y } : p.y < last ? { x: 0, y: p.y + 1 } : p;
    case "up":
      return { x: p.x, y: clamp(p.y - 1, 0, last) };
    case "down":
      return { x: p.x, y: clamp(p.y + 1, 0, last) };
    case "page_up":
      return { x: p.x, y: clamp(p.y - b.rows, 0, last) };
    case "page_down":
      return { x: p.x, y: clamp(p.y + b.rows, 0, last) };
    case "line_start":
      return { x: 0, y: p.y };
    case "line_end":
      return { x: clamp(line(p.y).trimEnd().length - 1, 0, b.cols - 1), y: p.y };
    case "buffer_start":
      return { x: 0, y: 0 };
    case "buffer_end":
      return { x: clamp(line(last).trimEnd().length - 1, 0, b.cols - 1), y: last };
    case "word_left": {
      const text = line(p.y);
      let x = p.x - 1;
      while (x > 0 && isSep(text[x])) x--;
      while (x > 0 && !isSep(text[x - 1])) x--;
      return x < 0 ? (p.y > 0 ? { x: clamp(line(p.y - 1).trimEnd().length - 1, 0, b.cols - 1), y: p.y - 1 } : p) : { x, y: p.y };
    }
    case "word_right": {
      const text = line(p.y);
      const end = text.trimEnd().length;
      let x = p.x;
      while (x < end && !isSep(text[x])) x++;
      while (x < end && isSep(text[x])) x++;
      return x >= end ? (p.y < last && p.x >= end - 1 ? { x: 0, y: p.y + 1 } : { x: clamp(end - 1, 0, b.cols - 1), y: p.y }) : { x, y: p.y };
    }
  }
}

/** Word range around `x` in a line (inclusive). Pure. */
export function wordAt(text: string, x: number, separators: string): [number, number] {
  const isSep = (c: string | undefined) => c === undefined || c === " " || separators.includes(c);
  if (isSep(text[x])) return [x, x];
  let a = x;
  let b = x;
  while (a > 0 && !isSep(text[a - 1])) a--;
  while (b < text.length - 1 && !isSep(text[b + 1])) b++;
  return [a, b];
}

const before = (a: Pos, b: Pos) => a.y < b.y || (a.y === b.y && a.x <= b.x);

const MOTIONS: Record<string, [plain: Motion, ctrl: Motion]> = {
  ArrowLeft: ["left", "word_left"],
  ArrowRight: ["right", "word_right"],
  ArrowUp: ["up", "up"],
  ArrowDown: ["down", "down"],
  Home: ["line_start", "buffer_start"],
  End: ["line_end", "buffer_end"],
  PageUp: ["page_up", "page_up"],
  PageDown: ["page_down", "page_down"],
};

export class MarkMode {
  active = false;
  block = false;
  private anchor: Pos = { x: 0, y: 0 };
  private head: Pos = { x: 0, y: 0 };

  constructor(
    private term: Terminal,
    private separators: () => string,
    private onChange: () => void,
  ) {}

  private get bounds(): Bounds {
    return { cols: this.term.cols, rows: this.term.rows, length: this.term.buffer.active.length };
  }

  private line = (y: number) => this.term.buffer.active.getLine(y)?.translateToString(false) ?? "";

  /** Enter (from the current selection, or the cursor) or leave. */
  toggle() {
    if (this.active) return this.exit(true);
    const sel = this.term.getSelectionPosition();
    const buf = this.term.buffer.active;
    if (sel) {
      this.anchor = { x: sel.start.x, y: sel.start.y };
      // xterm's end is exclusive.
      this.head = sel.end.x > 0 ? { x: sel.end.x - 1, y: sel.end.y } : { x: this.term.cols - 1, y: Math.max(sel.start.y, sel.end.y - 1) };
    } else {
      this.anchor = this.head = { x: buf.cursorX, y: buf.baseY + buf.cursorY };
    }
    this.active = true;
    this.block = false;
    this.render();
  }

  exit(clear: boolean) {
    if (!this.active) return;
    this.active = false;
    this.block = false;
    if (clear) this.term.clearSelection();
    this.onChange();
  }

  toggleBlock() {
    if (!this.active) this.toggle();
    this.block = !this.block;
    this.render();
  }

  switchEndpoint() {
    if (!this.active) return;
    [this.anchor, this.head] = [this.head, this.anchor];
    this.render();
  }

  expandToWord() {
    if (!this.active) this.toggle();
    const [from, to] = before(this.anchor, this.head) ? [this.anchor, this.head] : [this.head, this.anchor];
    const start = { x: wordAt(this.line(from.y), from.x, this.separators())[0], y: from.y };
    const end = { x: wordAt(this.line(to.y), to.x, this.separators())[1], y: to.y };
    [this.anchor, this.head] = before(this.anchor, this.head) ? [start, end] : [end, start];
    this.render();
  }

  /** Handle a key while active. Returns true when consumed. */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.active) return false;
    if (e.key === "Escape") {
      this.exit(true);
      return true;
    }
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") {
      const b = this.bounds;
      this.anchor = { x: 0, y: 0 };
      this.head = move(this.anchor, "buffer_end", b, this.line, "");
      this.render();
      return true;
    }
    const motion = MOTIONS[e.key];
    if (!motion || e.altKey || e.metaKey) return false;
    this.head = move(this.head, motion[e.ctrlKey ? 1 : 0], this.bounds, this.line, this.separators());
    if (!e.shiftKey) this.anchor = this.head;
    this.render();
    return true;
  }

  private render() {
    const [from, to] = before(this.anchor, this.head) ? [this.anchor, this.head] : [this.head, this.anchor];
    if (this.block && this.renderBlock()) {
      /* drawn through the selection service */
    } else {
      selectLinear(this.term, from.x, from.y, (to.y - from.y) * this.term.cols + to.x - from.x + 1);
    }
    // Keep the moving end in view.
    const buf = this.term.buffer.active;
    if (this.head.y < buf.viewportY) this.term.scrollToLine(this.head.y);
    else if (this.head.y >= buf.viewportY + this.term.rows) this.term.scrollToLine(this.head.y - this.term.rows + 1);
    this.onChange();
  }

  /** Column selection: no public API, drive xterm's selection service directly. */
  private renderBlock(): boolean {
    try {
      const svc = (this.term as any)._core?._selectionService;
      const model = svc?._model;
      if (!model) return false;
      const x1 = Math.min(this.anchor.x, this.head.x);
      const x2 = Math.max(this.anchor.x, this.head.x);
      const y1 = Math.min(this.anchor.y, this.head.y);
      const y2 = Math.max(this.anchor.y, this.head.y);
      model.selectionStart = [x1, y1];
      model.selectionStartLength = 0;
      model.selectionEnd = [x2 + 1, y2];
      svc._activeSelectionMode = 3; // SelectionMode.COLUMN
      svc.refresh();
      svc._fireEventIfSelectionChanged?.();
      return true;
    } catch {
      return false;
    }
  }
}

/** `term.select` that also leaves column mode (xterm keeps the mode of the previous selection). */
export function selectLinear(term: Terminal, x: number, y: number, length: number) {
  try {
    const svc = (term as any)._core?._selectionService;
    if (svc && svc._activeSelectionMode === 3) svc._activeSelectionMode = 0;
  } catch {
    /* private API moved: plain select still works */
  }
  term.select(x, y, length);
}

/** True when the terminal's current selection is rectangular (Alt+drag or block mark mode). */
export function isBlockSelection(term: Terminal): boolean {
  try {
    return (term as any)._core?._selectionService?._activeSelectionMode === 3;
  } catch {
    return false;
  }
}
