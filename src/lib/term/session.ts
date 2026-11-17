import { Channel, invoke } from "@tauri-apps/api/core";
import { Terminal, type IDecoration } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { CanvasAddon } from "@xterm/addon-canvas";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { ImageAddon } from "@xterm/addon-image";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { FONT_FAMILIES, wordSeparatorOf, type Config } from "../config";
import { hasVisibleText, parse133, parse633, parseCwd7, parseCwd99, parseOsc52, parseProgress, type Progress } from "../osc";
import { mergedSettings, resolve, wantsTransparency, xtermOptions, type PaneSpec, type Resolved } from "./appearance";
import { Marks } from "./marks";
import { MarkMode, isBlockSelection } from "./markmode";
import { ShellIntegration } from "./shell-integration";
import { fileLinkProvider } from "./file-link-provider";
import { hideLinkTooltip, showLinkTooltip } from "./link-tooltip";
import { resolveFilePath, type FileLink } from "../file-links";

export interface SessionHooks {
  /** Window-level inputs of the appearance resolution. */
  env(): { dark: boolean; fontDelta: number };
  onTitle(paneId: string, title: string): void;
  onBell(paneId: string): void;
  onOutput(paneId: string): void;
  onNotify(paneId: string, title: string, body: string): void;
  onFocus(paneId: string): void;
  /** User input about to reach the process. Return false to drop it (read-only pane). */
  onInput(paneId: string, data: string): boolean;
  /** Key pressed in a pane whose process exited. */
  onExitedKey(paneId: string, data: string): void;
  onExit(paneId: string, code: number | null): void;
  onContextMenu(paneId: string, x: number, y: number): void;
  onProgress(paneId: string, progress: Progress | null): void;
  onCwd(paneId: string, cwd: string): void;
  /** Resolved appearance changed (pane chrome follows it). */
  onLook(paneId: string, look: Resolved): void;
  onWheel(paneId: string, kind: "zoom" | "opacity", delta: number): void;
  onMarkMode(paneId: string, active: boolean, block: boolean): void;
  /** Mouse paste (middle / right click): the app reads, filters and confirms. */
  requestPaste(paneId: string): void;
  /** The selection was copied to the clipboard (copy_on_select, right click). */
  onCopy(paneId: string): void;
  openLink(uri: string): void;
  /** Ctrl+click on a file path; `path` is absolute or `~`-relative. `remote`: on the pane's ssh host. */
  openFile(paneId: string, path: string, line?: number, col?: number, remote?: boolean): void;
}

/** Buffer (and optionally a live pty) a session starts from: restored session, moved tab. */
export interface Restore {
  buffer: string;
  ptyId?: number | null;
  /** The process had already exited when the pane was captured. */
  exited?: boolean;
}

let fontsReady: Promise<unknown> | null = null;
// Load every face up front (bold/italic included): xterm measures glyphs once,
// and a face that loads later would be measured with a fallback font.
const FONT_FACES = [
  ...["normal", "bold", "italic", "italic bold"].map((v) => `${v} 14px "${FONT_FAMILIES[0]}"`),
  ...FONT_FAMILIES.slice(1).map((f) => `14px "${f}"`),
];
export const loadFonts = () =>
  (fontsReady ??= Promise.race([
    Promise.all(FONT_FACES.map((f) => document.fonts.load(f))).catch((e) => console.warn("font load", e)),
    new Promise((r) => setTimeout(r, 2000)),
  ]));

type Renderer = "webgl" | "canvas" | "dom";
// WebKitGTK (Linux) WebGL is unreliable (blank canvas on WSLg / some drivers): use canvas there.
// The DOM renderer does not draw custom box/powerline glyphs, so it is opt-in only.
const IS_LINUX = navigator.userAgent.includes("Linux") && !navigator.userAgent.includes("Android");
const rendererOf = (cfg: Config): Renderer =>
  cfg.renderer === "webgl" || cfg.renderer === "canvas" || cfg.renderer === "dom"
    ? cfg.renderer
    : IS_LINUX ? "canvas" : "webgl";

// Sequences drawn as one run so the font can substitute its ligature glyphs.
const LIGATURES = /<!--|-->|<->|<=>|===|!==|>>=|<<=|\.\.\.|::|->|=>|<-|<=|>=|==|!=|&&|\|\||\+\+|--|\/\/|\/\*|\*\/|<\/|\/>|\?\?|\|>|<\||>>|<</g;

/** Scrollback lines kept when a pane is captured (restore, undo close, move to window). */
const SNAPSHOT_SCROLLBACK = 5000;

export const sessions = new Map<string, TermSession>();
const byPty = new Map<number, TermSession>();
export const sessionByPty = (id: number) => byPty.get(id);

export class TermSession {
  readonly el = document.createElement("div");
  term!: Terminal;
  fit!: FitAddon;
  search!: SearchAddon;
  marks!: Marks;
  shell!: ShellIntegration;
  markMode!: MarkMode;
  private serializer!: SerializeAddon;
  private links: WebLinksAddon | null = null;
  private fileLinks: { dispose(): void } | null = null;
  private ligatureJoiner: number | null = null;
  /** Appearance currently applied. */
  look: Resolved;
  ptyId: number | null = null;
  exited = false;
  /** Directory reported by the shell (OSC 7 / 9;9 / 633). */
  reportedCwd: string | null = null;
  /**
   * Pane spawned with `ssh`: commandline reconnecting in the last remote directory (kept up to
   * date while connected, used once the process is gone: restart, session restore).
   */
  sshResume: string | null = null;
  private focused = true;
  private hasUnfocusedLook = false;
  private transparentCanvas = false;
  private opened = false;
  private pendingFocus = false;
  private disposed = false;
  private fitTimer = 0;
  /** Fires when a freshly spawned process stays silent too long. */
  private startupTimer = 0;
  /** Bumped on every connect from scratch: stale retries check it and give up. */
  private connectGen = 0;
  /** Between open and pty connect: replacing the xterm would drop the pending restore write. */
  private attaching = false;
  /** Bytes received from the pty channel (drained before a hand-off). */
  private received = 0;
  private skipViewportPush = false;
  private highlights: IDecoration[] = [];
  private renderer: { kind: Renderer; addon: WebglAddon | CanvasAddon | null } = { kind: "dom", addon: null };

  constructor(
    readonly paneId: string,
    readonly spec: PaneSpec,
    private config: Config,
    private hooks: SessionHooks,
    private restore: Restore | null = null,
  ) {
    this.el.className = "term-host";
    this.look = this.resolveLook();
    this.createTerminal(wantsTransparency(config, spec));
    this.bindMouse();
  }

  get profileId() {
    return this.spec.profileId;
  }

  private resolveLook(): Resolved {
    const r = resolve(this.config, this.spec, { focused: this.focused, ...this.hooks.env() });
    this.hasUnfocusedLook = Object.keys(mergedSettings(this.config, r.profile).unfocused_appearance ?? {}).length > 0;
    return r;
  }

  private createTerminal(transparent: boolean) {
    this.transparentCanvas = transparent;
    const t = new Terminal({
      allowProposedApi: true,
      allowTransparency: transparent,
      ...xtermOptions(this.config, this.look),
      cursorBlink: true,
      customGlyphs: true,
      rescaleOverlappingGlyphs: true,
      macOptionIsMeta: true,
      linkHandler: {
        activate: (e, uri) => this.openWebLink(e, uri),
        hover: (e) => showLinkTooltip(e, "link"),
        leave: hideLinkTooltip,
      },
    });
    this.term = t;
    this.fit = new FitAddon();
    this.search = new SearchAddon();
    this.serializer = new SerializeAddon();
    t.loadAddon(this.fit);
    t.loadAddon(this.search);
    t.loadAddon(this.serializer);
    t.loadAddon(new Unicode11Addon());
    t.unicode.activeVersion = "11";
    this.links = null;
    this.fileLinks = null;
    this.ligatureJoiner = null;
    this.setLinks(this.config.detect_urls !== false);
    this.setFileLinks(this.config.detect_file_paths !== false);
    try {
      t.loadAddon(new ImageAddon());
    } catch (e) {
      console.warn("image addon unavailable", e);
    }
    this.marks = new Marks(t, () => this.look.showMarksOnScrollbar);
    this.shell = new ShellIntegration(t, this.marks);
    this.markMode = new MarkMode(
      t,
      () => wordSeparatorOf(this.config),
      () => this.hooks.onMarkMode(this.paneId, this.markMode.active, this.markMode.block),
    );

    const { paneId, hooks } = this;
    t.onTitleChange((title) => {
      if (!this.look.suppressTitle) hooks.onTitle(paneId, title);
    });
    t.onBell(() => hooks.onBell(paneId));
    t.onData((d) => this.input(d));
    t.onBinary((d) => this.input(d));
    t.onResize(({ cols, rows }) => {
      if (this.ptyId != null) invoke("pty_resize", { id: this.ptyId, cols, rows }).catch(() => {});
    });
    // OSC 9: ConEmu progress (9;4), current directory (9;9), else an iTerm2 notification.
    t.parser.registerOscHandler(9, (data) => {
      const progress = parseProgress(data);
      if (progress !== undefined) {
        hooks.onProgress(paneId, progress);
        return true;
      }
      const cwd = parseCwd99(data);
      if (cwd) this.setCwd(cwd);
      else if (!/^\d+;/.test(data)) hooks.onNotify(paneId, "", data);
      return true;
    });
    // OSC 777 (urxvt) desktop notifications.
    t.parser.registerOscHandler(777, (data) => {
      const [kind, title = "", ...body] = data.split(";");
      if (kind === "notify") hooks.onNotify(paneId, title, body.join(";"));
      return true;
    });
    t.parser.registerOscHandler(7, (data) => {
      const cwd = parseCwd7(data);
      if (cwd) this.setCwd(cwd);
      return true;
    });
    t.parser.registerOscHandler(133, (data) => {
      const m = parse133(data);
      if (m) this.shell.handle(m);
      return true;
    });
    t.parser.registerOscHandler(633, (data) => {
      const m = parse633(data);
      if (m?.kind === "cwd") this.setCwd(m.path);
      else if (m) this.shell.handle(m);
      return true;
    });
    // OSC 52: applications may set the clipboard when allowed (never read it).
    t.parser.registerOscHandler(52, (data) => {
      if (!this.config.osc52_clipboard) return true;
      const text = parseOsc52(data)?.text;
      if (text) writeText(text).catch(console.error);
      return true;
    });
    // ED2 (Ctrl+L / clear): push the visible content into scrollback before erasing, like VTE.
    t.parser.registerCsiHandler({ final: "J" }, (params) => {
      if (params[0] !== 2 || t.buffer.active.type !== "normal" || this.skipViewportPush) return false;
      this.pushViewportToScrollback();
      return false; // fall through to the default erase
    });
    t.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      // Shift+Enter: ESC CR, a newline instead of submit in programs that support it.
      if (e.key === "Enter" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        this.input("\x1b\r");
        return false;
      }
      return true;
    });
  }

  // Ctrl/Cmd+click opens links; a plain click stays a terminal click/selection.
  private openWebLink(e: MouseEvent, uri: string) {
    hideLinkTooltip();
    if (e.ctrlKey || e.metaKey) this.hooks.openLink(uri);
  }

  private setLinks(on: boolean) {
    if (on === !!this.links) return;
    if (on) {
      this.links = new WebLinksAddon((e, uri) => this.openWebLink(e, uri), {
        hover: (e) => showLinkTooltip(e, "link"),
        leave: hideLinkTooltip,
      });
      this.term.loadAddon(this.links);
    } else {
      this.links?.dispose();
      this.links = null;
    }
  }

  private setFileLinks(on: boolean) {
    if (on === !!this.fileLinks) return;
    if (on) {
      this.fileLinks = this.term.registerLinkProvider(fileLinkProvider(this.term, (l) => void this.openFile(l)));
    } else {
      this.fileLinks?.dispose();
      this.fileLinks = null;
    }
  }

  private async openFile(l: FileLink) {
    if (await this.isSsh()) {
      // Relative to the remote directory reported by the shell, else to the remote home.
      const path = resolveFilePath(l.path, this.reportedCwd) ?? l.path;
      this.hooks.openFile(this.paneId, path, l.line, l.col, true);
      return;
    }
    const path = resolveFilePath(l.path, await this.cwdNow());
    if (path) this.hooks.openFile(this.paneId, path, l.line, l.col);
  }

  private setCwd(cwd: string) {
    this.reportedCwd = cwd;
    this.hooks.onCwd(this.paneId, cwd);
    const id = this.ptyId;
    if (id != null) {
      void invoke<string | null>("pty_ssh_resume", { id, dir: cwd })
        .then((line) => {
          if (line && this.ptyId === id) this.sshResume = line;
        })
        .catch(() => {});
    }
  }

  private pushViewportToScrollback() {
    const t = this.term;
    const buf = t.buffer.active;
    let used = 0;
    for (let y = t.rows - 1; y >= 0; y--) {
      if (buf.getLine(buf.baseY + y)?.translateToString(true)) {
        used = y + 1;
        break;
      }
    }
    if (!used) return;
    // xterm 5.5 has no public API for this (6.0 adds `scrollOnEraseInDisplay`).
    const core = (t as any)._core;
    const scroll = core?._bufferService?.scroll?.bind(core._bufferService);
    const attr = core?._inputHandler?._eraseAttrData?.();
    if (!scroll || !attr) return;
    for (let i = 0; i < used; i++) scroll(attr);
  }

  // ---------- input ----------

  /** User input: read-only / broadcast aware. */
  input(data: string) {
    if (this.exited) {
      this.hooks.onExitedKey(this.paneId, data);
      return;
    }
    if (!this.hooks.onInput(this.paneId, data)) return;
    this.autoMark(data);
    this.write(data);
  }

  /** Mark the prompt line on Enter when the shell does not report its prompts itself. */
  autoMark(data: string) {
    if (data === "\r" && this.look.autoMarkPrompts && !this.shell.active && this.term.buffer.active.type === "normal") {
      this.marks.add("prompt");
    }
  }

  /** Raw write to the process. */
  write(data: string) {
    if (this.ptyId != null) invoke("pty_write", { id: this.ptyId, data }).catch(() => {});
  }

  /** Paste through xterm (bracketed paste, newline conversion). */
  paste(text: string) {
    this.term.paste(text);
  }

  get bracketedPaste(): boolean {
    return this.term.modes.bracketedPasteMode;
  }

  // ---------- lifecycle ----------

  async attach(container: HTMLElement) {
    container.appendChild(this.el);
    if (this.opened) {
      this.scheduleFit();
      return;
    }
    this.opened = true;
    await loadFonts();
    if (this.disposed) return;
    document.fonts.addEventListener("loadingdone", this.onFontsLoaded);
    this.openTerminal();
    const restore = this.restore;
    if (restore?.buffer) {
      this.attaching = true;
      await new Promise<void>((done) => this.term.write(restore.buffer, done));
      this.attaching = false;
      // A fresh process starts below the restored content.
      if (restore.ptyId == null && !restore.exited) this.term.write("\x1b[0m\r\n");
    }
    this.restore = null;
    if (this.disposed) return;
    this.update(); // apply a look change deferred while attaching
    if (this.pendingFocus) this.focus();
    console.info(`pane ${this.paneId} opened renderer=${this.renderer.kind} ${this.term.cols}x${this.term.rows} host=${this.el.clientWidth}x${this.el.clientHeight}`);
    if (restore?.exited) this.markExited(null);
    else await this.connect(restore?.ptyId ?? null);
    console.info(`pane ${this.paneId} pty=${this.ptyId}`);
  }

  private openTerminal() {
    this.term.open(this.el);
    this.term.textarea?.addEventListener("focus", () => this.hooks.onFocus(this.paneId));
    this.renderer = { kind: "dom", addon: null };
    this.setRenderer(rendererOf(this.config));
    this.applyLook();
    this.fitNow();
  }

  /** Replace the xterm instance (allowTransparency is fixed at creation), keeping the content. */
  private rebuild() {
    const data = this.opened ? this.serializer.serialize() : "";
    const hadFocus = this.el.contains(document.activeElement);
    this.renderer.addon?.dispose();
    this.term.dispose();
    this.createTerminal(true);
    if (!this.opened) return;
    this.openTerminal();
    this.term.write(data);
    if (hadFocus) this.focus();
  }

  private copySelection() {
    writeText(this.selectionText()).then(() => this.hooks.onCopy(this.paneId)).catch(console.error);
  }

  // Capture phase: runs before xterm's own handlers.
  private bindMouse() {
    const el = this.el;
    // Apps with mouse tracking (vim, htop, ...) get the click unless Shift is held.
    const appGrabs = (e: MouseEvent) => this.term.modes.mouseTrackingMode !== "none" && !e.shiftKey;
    const middle = (e: MouseEvent) => e.button === 1 && this.config.middle_click_paste && !appGrabs(e);
    el.addEventListener("mouseup", (e) => {
      if (e.button !== 0) return;
      if (this.term.hasSelection()) {
        if (this.config.copy_on_select) this.copySelection();
      } else if (this.look.repositionCursorWithMouse && !appGrabs(e)) {
        this.moveCursorTo(e);
      }
    });
    el.addEventListener("mousedown", (e) => {
      if (e.button === 0 && this.markMode.active) this.markMode.exit(false);
      if (!middle(e)) return;
      // Also blocks the X11 primary-selection paste and Windows autoscroll.
      e.preventDefault();
      e.stopPropagation();
      this.pasteClipboard();
    }, { capture: true });
    for (const type of ["mouseup", "auxclick"]) {
      el.addEventListener(type, (e) => {
        if (middle(e as MouseEvent)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }, { capture: true });
    }
    el.addEventListener("contextmenu", (e) => {
      // Ctrl/Shift+right-click always opens the pane menu, even over mouse-tracking apps.
      if (e.ctrlKey || e.shiftKey || (this.look.rightClickContextMenu && !appGrabs(e))) {
        e.preventDefault();
        e.stopPropagation();
        this.hooks.onContextMenu(this.paneId, e.clientX, e.clientY);
        return;
      }
      if (!this.config.right_click_paste) return;
      e.preventDefault();
      e.stopPropagation();
      if (appGrabs(e)) return;
      // Like Windows Terminal: copy the selection if there is one, else paste.
      if (this.term.hasSelection() && !this.config.copy_on_select) {
        this.copySelection();
        this.term.clearSelection();
      } else {
        this.pasteClipboard();
      }
    }, { capture: true });
    el.addEventListener("wheel", (e) => {
      if (!e.ctrlKey || e.altKey || e.deltaY === 0) return;
      const kind = e.shiftKey ? "opacity" : "zoom";
      if (kind === "zoom" ? this.config.scroll_to_zoom === false : this.config.scroll_to_change_opacity === false) return;
      e.preventDefault();
      e.stopPropagation();
      this.hooks.onWheel(this.paneId, kind, e.deltaY < 0 ? 1 : -1);
    }, { capture: true, passive: false });
  }

  /** Buffer cell under a mouse event. */
  private cellAt(e: MouseEvent): { x: number; y: number } | null {
    const screen = this.el.querySelector<HTMLElement>(".xterm-screen");
    if (!screen) return null;
    const r = screen.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return null;
    const x = Math.floor(((e.clientX - r.left) / r.width) * this.term.cols);
    const y = Math.floor(((e.clientY - r.top) / r.height) * this.term.rows);
    if (x < 0 || y < 0 || x >= this.term.cols || y >= this.term.rows) return null;
    return { x, y: this.term.buffer.active.viewportY + y };
  }

  /** Click on the command line being edited: move the shell cursor there with arrow keys. */
  private moveCursorTo(e: MouseEvent) {
    const start = this.shell.promptStart();
    const cell = this.cellAt(e);
    if (!start || !cell) return;
    const buf = this.term.buffer.active;
    const cols = this.term.cols;
    const cursor = (buf.baseY + buf.cursorY) * cols + buf.cursorX;
    const target = Math.max(cell.y * cols + cell.x, start.y * cols + start.x);
    const delta = target - cursor;
    if (delta === 0 || Math.abs(delta) > cols * this.term.rows) return;
    const key = this.term.modes.applicationCursorKeysMode ? (delta > 0 ? "\x1bOC" : "\x1bOD") : delta > 0 ? "\x1b[C" : "\x1b[D";
    this.input(key.repeat(Math.abs(delta)));
  }

  private pasteClipboard() {
    this.hooks.requestPaste(this.paneId);
  }

  private setRenderer(kind: Renderer) {
    if (this.renderer.kind === kind) return;
    this.renderer.addon?.dispose();
    this.renderer = { kind: "dom", addon: null };
    if (kind === "dom") return;
    try {
      const addon = kind === "webgl" ? new WebglAddon() : new CanvasAddon();
      if (addon instanceof WebglAddon) {
        addon.onContextLoss(() => {
          addon.dispose();
          this.renderer = { kind: "dom", addon: null };
          this.setRenderer("canvas");
        });
      }
      this.term.loadAddon(addon);
      this.renderer = { kind, addon };
    } catch (e) {
      console.warn(`${kind} renderer unavailable`, e);
      if (kind === "webgl") this.setRenderer("canvas");
    }
  }

  /** Spawn the process, or take over a live pty handed by another window. */
  private async connect(adopt: number | null, attempt = 0): Promise<void> {
    const gen = attempt === 0 ? ++this.connectGen : this.connectGen;
    // Printable output seen: terminal-only sequences (ConPTY init) don't prove the process is alive.
    let alive = false;
    const onData = new Channel<ArrayBuffer | number[]>();
    onData.onmessage = (buf) => {
      const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : Uint8Array.from(buf);
      if (!alive) alive = hasVisibleText(bytes);
      this.received += bytes.length;
      this.term.write(bytes);
      this.hooks.onOutput(this.paneId);
    };
    this.received = 0;
    const spawned = { cols: this.term.cols, rows: this.term.rows };
    try {
      let id: number;
      if (adopt != null) {
        const res = await invoke<{ exited: boolean; code: number | null }>("pty_attach", { id: adopt, onData });
        if (res.exited) {
          this.hooks.onExit(this.paneId, res.code);
          return;
        }
        id = adopt;
      } else {
        id = await invoke<number>("pty_spawn", {
          opts: {
            profileId: this.spec.profileId,
            cwd: this.spec.cwd ?? null,
            inheritCwd: this.spec.inheritCwd ?? null,
            commandline: this.sshResume ?? this.spec.commandline ?? null,
            env: this.spec.env ?? {},
            cols: this.term.cols,
            rows: this.term.rows,
          },
          onData,
        });
      }
      if (this.disposed) {
        invoke("pty_kill", { id });
        return;
      }
      this.ptyId = id;
      this.exited = false;
      byPty.set(id, this);
      // Resizes during the spawn/attach await were dropped (no pty yet): resync now.
      if (this.term.cols !== spawned.cols || this.term.rows !== spawned.rows || adopt != null) {
        invoke("pty_resize", { id, cols: this.term.cols, rows: this.term.rows }).catch(() => {});
      }
      if (adopt == null) this.watchStartup(id, gen, attempt, () => alive);
    } catch (e) {
      if (adopt == null && attempt < this.look.startupRetries) {
        this.exited = true;
        this.notice(`\x1b[31m${String(e)}\x1b[0m\r\n\x1b[2m[retrying ${attempt + 1}/${this.look.startupRetries}...]\x1b[0m`);
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        if (this.disposed || gen !== this.connectGen || this.ptyId != null) return;
        return this.connect(null, attempt + 1);
      }
      this.exited = true;
      this.term.write(`\r\n\x1b[31m${String(e)}\x1b[0m\r\n\x1b[2mPress Enter to retry, Ctrl+D to close.\x1b[0m`);
    }
  }

  /** Restart a fresh process that produced no output within `startup_timeout` (hung shell). */
  private watchStartup(id: number, gen: number, attempt: number, alive: () => boolean) {
    const secs = this.look.startupTimeout;
    clearTimeout(this.startupTimer);
    if (secs <= 0) return;
    this.startupTimer = window.setTimeout(() => {
      if (this.disposed || this.ptyId !== id || gen !== this.connectGen || alive()) return;
      const max = this.look.startupRetries;
      if (attempt >= max) {
        this.notice(`\x1b[2m[no output after ${secs}s]\x1b[0m`);
        return;
      }
      this.notice(`\x1b[2m[no output after ${secs}s, restarting ${attempt + 1}/${max}...]\x1b[0m`);
      this.dropPty(true);
      this.connect(null, attempt + 1);
    }, secs * 1000);
  }

  private notice(text: string) {
    this.term.write(`\x1b[0m\r\n${text}\r\n`);
  }

  private dropPty(kill: boolean) {
    clearTimeout(this.startupTimer);
    if (this.ptyId == null) return;
    byPty.delete(this.ptyId);
    if (kill) invoke("pty_kill", { id: this.ptyId }).catch(() => {});
    this.ptyId = null;
  }

  /** Kill the process (if any) and start it again in the same pane. */
  async restart() {
    if (!this.opened || this.disposed) return;
    this.dropPty(true);
    this.exited = false;
    this.term.write("\x1b[0m\r\n");
    await this.connect(null);
  }

  markExited(code: number | null) {
    this.dropPty(false);
    this.exited = true;
    const what = code == null ? "process exited" : `process exited with code ${code}`;
    this.term.write(`\r\n\x1b[2m[${what}]\x1b[0m\r\n\x1b[2mPress Enter to restart, Ctrl+D to close.\x1b[0m`);
  }

  /** Content written back by a restored / adopted session. */
  serialize(live: boolean): string {
    // Not opened yet (still loading): its restored content is still pending.
    if (!this.opened || this.restore) return this.restore?.buffer ?? "";
    try {
      return this.serializer.serialize(
        live ? { scrollback: SNAPSHOT_SCROLLBACK } : { scrollback: SNAPSHOT_SCROLLBACK, excludeAltBuffer: true, excludeModes: true },
      );
    } catch (e) {
      console.warn("serialize", e);
      return "";
    }
  }

  /** Hand the live pty over (move to another window): stop output, drain, capture. */
  async release(): Promise<Restore> {
    const ptyId = this.ptyId;
    clearTimeout(this.startupTimer);
    if (ptyId != null) {
      const sent = await invoke<number>("pty_detach", { id: ptyId }).catch(() => 0);
      const deadline = Date.now() + 500;
      while (this.received < sent && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
      await new Promise<void>((done) => this.term.write("", done));
      byPty.delete(ptyId);
      this.ptyId = null;
    }
    return { buffer: this.serialize(true), ptyId, exited: this.exited };
  }

  private onFontsLoaded = () => {
    if (this.disposed) return;
    this.term.clearTextureAtlas();
    const size = this.term.options.fontSize;
    this.term.options.fontSize = size! + 1; // force char re-measure
    this.term.options.fontSize = size;
    this.term.refresh(0, this.term.rows - 1);
    this.scheduleFit();
  };

  fitNow() {
    if (!this.opened || this.el.clientWidth < 10 || this.el.clientHeight < 10) return;
    try {
      this.fit.fit();
    } catch {
      /* not rendered yet */
    }
  }

  scheduleFit() {
    clearTimeout(this.fitTimer);
    this.fitTimer = window.setTimeout(() => this.fitNow(), 16);
  }

  focus() {
    // term.open() may not have run yet (fonts loading); focus once it does.
    this.pendingFocus = !this.term.element;
    this.term.focus();
  }

  /** Size of one cell in CSS px (window sizing from columns / rows). */
  cellSize(): { width: number; height: number } | null {
    const screen = this.el.querySelector<HTMLElement>(".xterm-screen");
    if (!screen || !screen.clientWidth || !screen.clientHeight) return null;
    return { width: screen.clientWidth / this.term.cols, height: screen.clientHeight / this.term.rows };
  }

  /** The pane runs an interactive `ssh` session (foreground process on Linux). */
  async isSsh(): Promise<boolean> {
    if (this.ptyId == null) return false;
    return invoke<boolean>("pty_is_ssh", { id: this.ptyId }).catch(() => false);
  }

  /**
   * Commandline reopening the pane's ssh session in its remote directory (as reported by the
   * remote shell via OSC 7), or null when the pane is not in ssh.
   */
  async sshFollow(): Promise<string | null> {
    if (this.ptyId == null) return null;
    return invoke<string | null>("pty_ssh_follow", { id: this.ptyId, dir: this.reportedCwd }).catch(() => null);
  }

  /** Copy a file from the pane's ssh host to a local cache file. */
  fetchRemoteFile(path: string): Promise<{ local: string; label: string }> {
    if (this.ptyId == null) return Promise.reject(new Error("no process"));
    return invoke("remote_file_fetch", { id: this.ptyId, path });
  }

  async cwdNow(): Promise<string | null> {
    const live = this.ptyId == null ? null : await invoke<string | null>("pty_cwd", { id: this.ptyId }).catch(() => null);
    return live ?? this.reportedCwd ?? this.spec.cwd ?? this.spec.inheritCwd ?? null;
  }

  // ---------- appearance ----------

  applyConfig(cfg: Config) {
    this.config = cfg;
    this.setLinks(cfg.detect_urls !== false);
    this.setFileLinks(cfg.detect_file_paths !== false);
    this.update();
    if (this.opened) this.setRenderer(rendererOf(cfg));
  }

  /** Re-resolve and apply the appearance (config, focus, zoom or override changed). */
  update() {
    const r = (this.look = this.resolveLook());
    if (r.transparent && !this.transparentCanvas) {
      if (this.attaching) return;
      this.rebuild();
      return;
    }
    const o = this.term.options as Record<string, unknown>;
    for (const [k, v] of Object.entries(xtermOptions(this.config, r))) o[k] = v;
    this.applyLook();
    this.scheduleFit();
  }

  setFocused(focused: boolean) {
    if (this.focused === focused) return;
    this.focused = focused;
    if (this.hasUnfocusedLook) this.update();
  }

  private applyLook() {
    const r = this.look;
    this.el.classList.toggle("no-scrollbar", r.scrollbar === "hidden");
    // Effective with the DOM renderer only: canvas text ignores CSS font features.
    this.el.style.fontFeatureSettings = r.fontFeatures;
    this.el.style.fontVariationSettings = r.fontVariations;
    if (r.scrollbar === "hidden") {
      // FitAddon otherwise reserves the fallback scrollbar width.
      const viewport = (this.term as any)._core?.viewport;
      if (viewport && "scrollBarWidth" in viewport) viewport.scrollBarWidth = 0;
    }
    if (r.ligatures && this.ligatureJoiner == null) {
      this.ligatureJoiner = this.term.registerCharacterJoiner((text) =>
        [...text.matchAll(LIGATURES)].map((m) => [m.index!, m.index! + m[0].length] as [number, number]),
      );
    } else if (!r.ligatures && this.ligatureJoiner != null) {
      this.term.deregisterCharacterJoiner(this.ligatureJoiner);
      this.ligatureJoiner = null;
    }
    this.marks.refresh();
    this.hooks.onLook(this.paneId, r);
  }

  // ---------- selection / buffer ----------

  /** Selected text; block selections are padded to a rectangle when requested. */
  selectionText(): string {
    const text = this.term.getSelection();
    if (this.config.trim_block_selection !== false || !isBlockSelection(this.term)) return text;
    const pos = this.term.getSelectionPosition();
    if (!pos) return text;
    const width = Math.abs(pos.end.x - pos.start.x);
    return text
      .split("\n")
      .map((l) => l.padEnd(width))
      .join("\n");
  }

  /** Selection as HTML (colors and styles). */
  selectionHtml(): string {
    try {
      return this.serializer.serializeAsHTML({ onlySelection: true, includeGlobalBackground: true });
    } catch {
      return "";
    }
  }

  /** Selected rows with their ANSI control sequences. */
  selectionAnsi(): string {
    const pos = this.term.getSelectionPosition();
    if (!pos) return "";
    try {
      return this.serializer.serialize({ range: { start: pos.start.y, end: pos.end.y }, excludeModes: true });
    } catch {
      return this.term.getSelection();
    }
  }

  /** Plain text of the whole buffer (wrapped lines joined). */
  exportText(): string {
    const buf = this.term.buffer.active;
    const out: string[] = [];
    for (let y = 0; y < buf.length; y++) {
      const line = buf.getLine(y);
      if (!line) continue;
      const text = line.translateToString(true);
      if (line.isWrapped && out.length) out[out.length - 1] += text;
      else out.push(text);
    }
    while (out.length && !out[out.length - 1]) out.pop();
    return out.join("\n") + "\n";
  }

  /** Highlight the selection (or every occurrence of it) with a background color. */
  highlight(color: string, all: boolean) {
    const t = this.term;
    const pos = t.getSelectionPosition();
    if (!pos) return;
    const buf = t.buffer.active;
    const cursor = buf.baseY + buf.cursorY;
    const paint = (y: number, x: number, width: number) => {
      if (width <= 0) return;
      const marker = t.registerMarker(y - cursor);
      if (!marker) return;
      const d = t.registerDecoration({ marker, x, width, backgroundColor: color, layer: "bottom" });
      if (d) this.highlights.push(d);
      else marker.dispose();
    };
    const needle = t.getSelection();
    if (all && needle && !needle.includes("\n")) {
      for (let y = 0; y < buf.length; y++) {
        const text = buf.getLine(y)?.translateToString(true) ?? "";
        for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + needle.length)) paint(y, i, needle.length);
      }
    } else {
      for (let y = pos.start.y; y <= pos.end.y; y++) {
        const from = y === pos.start.y ? pos.start.x : 0;
        const to = y === pos.end.y ? pos.end.x : t.cols;
        paint(y, from, to - from);
      }
    }
    t.clearSelection();
  }

  clearHighlights() {
    for (const d of this.highlights) {
      d.marker.dispose();
      d.dispose();
    }
    this.highlights = [];
  }

  clearBuffer(what: string) {
    const t = this.term;
    if (what === "scrollback") {
      t.write("\x1b[3J");
    } else if (what === "screen") {
      // Keep the cursor row (the prompt) as the first row, leave the scrollback untouched.
      const { cursorX, cursorY } = t.buffer.active;
      this.skipViewportPush = true;
      t.write(`\x1b[H${cursorY > 0 ? `\x1b[${cursorY}M` : ""}\x1b[2;1H\x1b[J\x1b[1;${cursorX + 1}H`, () => (this.skipViewportPush = false));
    } else {
      t.clear();
    }
  }

  dispose(kill = true) {
    this.disposed = true;
    hideLinkTooltip();
    clearTimeout(this.fitTimer);
    document.fonts.removeEventListener("loadingdone", this.onFontsLoaded);
    this.dropPty(kill);
    sessions.delete(this.paneId);
    this.term.dispose();
    this.el.remove();
  }
}
