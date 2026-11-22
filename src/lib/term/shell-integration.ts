// Shell integration: OSC 133 / 633 command tracking (prompt, command, output, exit code).
import type { IMarker, Terminal } from "@xterm/xterm";
import type { ShellMark } from "../osc";
import type { Mark, Marks } from "./marks";
import { selectLinear } from "./markmode";

interface Command {
  prompt: IMarker;
  mark?: Mark;
  /** Where the typed command starts (end of the prompt). */
  start?: { marker: IMarker; x: number };
  output?: IMarker;
  end?: IMarker;
  exitCode?: number;
  text?: string;
  /** Date.now() when output started (the command ran). */
  startedAt?: number;
}

export type CommandFinished = (exitCode: number | undefined, durationMs: number, text: string | undefined) => void;

const MAX_COMMANDS = 500;

/** Most recent first, without duplicates or blanks. */
export function recent(texts: (string | undefined)[], limit = 100): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (let i = texts.length - 1; i >= 0 && out.length < limit; i--) {
    const t = texts[i]?.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export class ShellIntegration {
  private commands: Command[] = [];
  /** Index of the command last selected by select_command / select_output. */
  private cursor = -1;
  /** True once the shell emitted any mark. */
  active = false;

  constructor(
    private term: Terminal,
    private marks: Marks,
    private onFinished?: CommandFinished,
  ) {}

  private get current(): Command | undefined {
    return this.commands[this.commands.length - 1];
  }

  handle(m: ShellMark) {
    if (m.kind === "cwd") return;
    this.active = true;
    const buf = this.term.buffer.active;
    switch (m.kind) {
      case "prompt": {
        const marker = this.term.registerMarker(0);
        if (!marker) return;
        const cmd: Command = { prompt: marker, mark: this.marks.add("prompt") };
        marker.onDispose(() => {
          this.commands = this.commands.filter((c) => c !== cmd);
        });
        this.commands.push(cmd);
        if (this.commands.length > MAX_COMMANDS) this.commands.shift();
        this.cursor = -1;
        break;
      }
      case "command_start": {
        const marker = this.term.registerMarker(0);
        if (marker && this.current) this.current.start = { marker, x: buf.cursorX };
        break;
      }
      case "output_start": {
        const cmd = this.current;
        const marker = this.term.registerMarker(0);
        if (!cmd || !marker) return;
        cmd.output = marker;
        cmd.startedAt = Date.now();
        cmd.text ??= this.readCommand(cmd, marker.line);
        break;
      }
      case "command_end": {
        const cmd = this.current;
        if (!cmd || cmd.end) return;
        cmd.end = this.term.registerMarker(0);
        cmd.exitCode = m.exitCode;
        // No output mark (empty command line): keep the neutral prompt color.
        if (cmd.mark && cmd.output && m.exitCode !== undefined) this.marks.set(cmd.mark, m.exitCode === 0 ? "success" : "error");
        if (cmd.startedAt !== undefined) this.onFinished?.(m.exitCode, Date.now() - cmd.startedAt, cmd.text);
        break;
      }
      case "commandline":
        if (this.current) this.current.text = m.text;
        break;
    }
  }

  /** Text typed between the end of the prompt and `untilLine` (exclusive unless it is the start line). */
  private readCommand(cmd: Command, untilLine: number): string | undefined {
    const start = cmd.start;
    if (!start || start.marker.line < 0) return undefined;
    const buf = this.term.buffer.active;
    const last = Math.max(start.marker.line, untilLine - 1);
    let text = "";
    for (let y = start.marker.line; y <= last; y++) {
      const line = buf.getLine(y);
      if (!line) break;
      const part = line.translateToString(true, y === start.marker.line ? start.x : 0);
      text += (y > start.marker.line && !line.isWrapped ? "\n" : "") + part;
    }
    return text.trim() || undefined;
  }

  /** True while the user is editing a command line (prompt drawn, not yet executed). */
  get atPrompt(): boolean {
    const cmd = this.current;
    return !!cmd?.start && !cmd.output && !cmd.end && cmd.start.marker.line >= 0;
  }

  /** The command line being typed, or "" when not at a prompt. */
  currentCommandLine(): string {
    const cmd = this.current;
    if (!cmd || !this.atPrompt) return "";
    const buf = this.term.buffer.active;
    return this.readCommand(cmd, buf.baseY + buf.cursorY + 1) ?? "";
  }

  /** Start of the command line being edited (buffer coordinates), for click-to-move-cursor. */
  promptStart(): { x: number; y: number } | undefined {
    const cmd = this.current;
    return cmd?.start && this.atPrompt ? { x: cmd.start.x, y: cmd.start.marker.line } : undefined;
  }

  recentCommands(): string[] {
    return recent(this.commands.map((c) => c.text));
  }

  private step(direction: "prev" | "next", ok: (c: Command) => boolean): Command | undefined {
    const d = direction === "next" ? 1 : -1;
    let i = this.cursor < 0 ? (d < 0 ? this.commands.length : -1) : this.cursor;
    for (i += d; i >= 0 && i < this.commands.length; i += d) {
      if (ok(this.commands[i])) {
        this.cursor = i;
        return this.commands[i];
      }
    }
    return undefined;
  }

  selectCommand(direction: "prev" | "next"): boolean {
    const cmd = this.step(direction, (c) => !!c.start && c.start.marker.line >= 0 && !!c.output && c.output.line >= 0);
    if (!cmd?.start || !cmd.output) return false;
    const cols = this.term.cols;
    const row = cmd.start.marker.line;
    const lastRow = Math.max(row, cmd.output.line - 1);
    const lastLen = this.term.buffer.active.getLine(lastRow)?.translateToString(true).length ?? 0;
    const length = (lastRow - row) * cols + lastLen - cmd.start.x;
    if (length <= 0) return false;
    selectLinear(this.term, cmd.start.x, row, length);
    this.term.scrollToLine(Math.max(0, cmd.prompt.line));
    return true;
  }

  selectOutput(direction: "prev" | "next"): boolean {
    const cmd = this.step(direction, (c) => !!c.output && c.output.line >= 0 && !!c.end && c.end.line > c.output.line);
    if (!cmd?.output || !cmd.end) return false;
    this.term.selectLines(cmd.output.line, cmd.end.line - 1);
    this.term.scrollToLine(Math.max(0, cmd.prompt.line));
    return true;
  }

  /** Command whose rows include `line` (context menu on a command). */
  hasCommands(): boolean {
    return this.commands.some((c) => !!c.output);
  }
}
