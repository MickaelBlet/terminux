// Scroll marks: user marks and shell-integration prompts, shown as a gutter bar and on the scrollbar.
import type { IDecoration, IMarker, Terminal } from "@xterm/xterm";

export type MarkKind = "user" | "prompt" | "success" | "error";

export const MARK_COLORS: Record<MarkKind, string> = {
  user: "#f0c674",
  prompt: "#8a909c",
  success: "#98c379",
  error: "#e06c75",
};

export interface Mark {
  marker: IMarker;
  decoration?: IDecoration;
  kind: MarkKind;
  color: string;
}

export type MarkDirection = "previous" | "next" | "first" | "last";

/** Line to scroll to among sorted mark lines, relative to the line at the top of the viewport. */
export function targetLine(lines: number[], current: number, direction: MarkDirection): number | null {
  if (!lines.length) return null;
  switch (direction) {
    case "first":
      return lines[0];
    case "last":
      return lines[lines.length - 1];
    case "previous": {
      const before = lines.filter((l) => l < current);
      return before.length ? before[before.length - 1] : null;
    }
    case "next":
      return lines.find((l) => l > current) ?? null;
  }
}

export interface NavState {
  /** Line last navigated to. */
  line: number;
  /** Viewport top right after that navigation. */
  viewportY: number;
}

/**
 * Line to navigate from: the last navigation target while the viewport has not moved since
 * (the target may sit in the last screen, where scrolling is clamped), the cursor line when
 * not scrolled back (so "previous" is the start of the last command), else the viewport top.
 */
export function referenceLine(p: { viewportY: number; baseY: number; cursorLine: number; nav?: NavState }): number {
  if (p.nav && p.nav.viewportY === p.viewportY) return p.nav.line;
  if (p.viewportY >= p.baseY) return p.cursorLine;
  return p.viewportY;
}

export class Marks {
  private marks: Mark[] = [];
  private nav?: NavState;

  constructor(
    private term: Terminal,
    private onScrollbar: () => boolean,
  ) {}

  /** Add a mark on the cursor line (or `offset` lines from it). */
  add(kind: MarkKind = "user", color?: string, offset = 0): Mark | undefined {
    const marker = this.term.registerMarker(offset);
    if (!marker) return undefined;
    // One mark per line: the newest wins.
    for (const m of this.marks.filter((m) => m.marker.line === marker.line)) this.remove(m);
    const mark: Mark = { marker, kind, color: color ?? MARK_COLORS[kind] };
    this.decorate(mark);
    marker.onDispose(() => {
      this.marks = this.marks.filter((m) => m !== mark);
    });
    this.marks.push(mark);
    return mark;
  }

  private decorate(mark: Mark) {
    mark.decoration?.dispose();
    mark.decoration = this.term.registerDecoration({
      marker: mark.marker,
      x: 0,
      width: 1,
      layer: "top",
      ...(this.onScrollbar() ? { overviewRulerOptions: { color: mark.color, position: "right" as const } } : {}),
    });
    mark.decoration?.onRender((el) => {
      el.classList.add("scroll-mark");
      el.style.setProperty("--mark-color", mark.color);
    });
  }

  /** Recolor a mark (command finished). */
  set(mark: Mark, kind: MarkKind) {
    if (mark.marker.isDisposed) return;
    mark.kind = kind;
    mark.color = MARK_COLORS[kind];
    this.decorate(mark);
  }

  private remove(mark: Mark) {
    mark.decoration?.dispose();
    mark.marker.dispose();
    this.marks = this.marks.filter((m) => m !== mark);
  }

  /** Remove the marks inside the selection, or on the cursor line. */
  clearCurrent() {
    const sel = this.term.getSelectionPosition();
    const buf = this.term.buffer.active;
    const cursor = buf.baseY + buf.cursorY;
    const [from, to] = sel ? [sel.start.y, sel.end.y] : [cursor, cursor];
    for (const m of this.marks.filter((m) => m.marker.line >= from && m.marker.line <= to)) this.remove(m);
  }

  clearAll() {
    this.nav = undefined;
    for (const m of [...this.marks]) this.remove(m);
  }

  /** Rebuild decorations (scrollbar visibility changed). */
  refresh() {
    for (const m of this.marks) this.decorate(m);
  }

  lines(): number[] {
    return this.marks
      .map((m) => m.marker.line)
      .filter((l) => l >= 0)
      .sort((a, b) => a - b);
  }

  /** Returns false when there is nothing to navigate (no marks, alternate screen) so the key reaches the app. */
  scrollTo(direction: MarkDirection): boolean {
    const buf = this.term.buffer.active;
    const lines = this.lines();
    if (buf.type === "alternate" || !lines.length) return false;
    const current = referenceLine({ viewportY: buf.viewportY, baseY: buf.baseY, cursorLine: buf.baseY + buf.cursorY, nav: this.nav });
    const line = targetLine(lines, current, direction);
    if (line == null) return true;
    this.term.scrollToLine(line);
    this.nav = { line, viewportY: this.term.buffer.active.viewportY };
    return true;
  }

  get count() {
    return this.marks.length;
  }
}
