import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow, UserAttentionType } from "@tauri-apps/api/window";
import { readText, writeHtml, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ACTIONS, GLOBAL_COMMANDS, type ActionContext } from "./actions";
import { playBell } from "./audio";
import { COMMANDS, commandName, parseUserActions, type ActionSpec, type UserAction } from "./commands";
import { DEFAULT_SEARCH_URL, FALLBACK_CONFIG, findProfile, visibleProfiles, type Config } from "./config";
import { eventKey, Keymap } from "./keys";
import * as tree from "./layout/tree";
import type { Dir, Direction, LayoutNode } from "./layout/tree";
import type { Progress } from "./osc";
import { pasteWarning, sanitizePaste } from "./paste";
import { droppedPaths } from "./paths";
import { dirOf } from "./file-links";
import { baseName } from "./file-langs";
import type { PaneSnapshot, TabSnapshot } from "./snapshot";
import type { PaneSpec, Resolved } from "./term/appearance";
import { sessionByPty, sessions, TermSession, type Restore, type SessionHooks } from "./term/session";
import { applyUiTheme, isDarkTheme, type UiLook } from "./ui-theme";
import type { DialogRequest, MenuRequest, PaletteView, Toast } from "./ui/types";
import { paneMenu } from "./ui/menus";
import { canonicalEntry, DEFAULT_TOOLBAR, moveEntry, resolveToolbar, toolbarEntries, type ToolbarItem } from "./toolbar";
import { setRootKey, tomlStringArray } from "./config-edit";
import * as windows from "./windows";

export interface PaneInfo {
  id: string;
  kind: "term" | "snippets" | "file";
  spec: PaneSpec;
  /** File pane with unsaved changes. */
  dirty?: boolean;
  /** Title set by the application (OSC 0/2). */
  title: string;
  bell: boolean;
  activity: boolean;
  readOnly: boolean;
  progress: Progress | null;
  /** Directory reported by the shell. */
  cwd: string | null;
  look: Resolved | null;
  /** Incremented on a visual bell. */
  flash: number;
  markMode: "linear" | "block" | null;
  /** Creation order. */
  seq: number;
}

export interface Tab {
  id: string;
  kind: "term" | "config" | "defaults";
  root: LayoutNode;
  active: string;
  /** Node (pane or split) shown alone. */
  zoom: string | null;
  name: string | null;
  color: string | null;
  broadcast: boolean;
  /** Pane ids, most recently focused first. */
  mru: string[];
  /** Split selected by "move focus to parent": pane commands apply to the whole subtree. */
  group: string | null;
}

/** Arguments shared by new_tab / split_pane / new_window (and the CLI). */
export interface NewPaneArgs {
  profile?: string;
  index?: number;
  commandline?: string;
  starting_directory?: string;
  tab_title?: string;
  tab_color?: string;
  color_scheme?: string;
  suppress_application_title?: boolean;
}

export interface SplitArgs extends NewPaneArgs {
  split?: string;
  split_mode?: string;
  size?: number;
  type?: string;
}

type Closed =
  | { kind: "tab"; snap: TabSnapshot; index: number }
  | { kind: "pane"; snap: PaneSnapshot; tabId: string; neighbor: string | null; dir: Dir; before: boolean };

const norm = (s: unknown) => (typeof s === "string" ? s : "").toLowerCase().replace(/[_-]/g, "");
const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as T;
const DIRECTIONS: Direction[] = ["left", "right", "up", "down"];
const EDITOR_PANES = { config: "config", defaults: "defaults" } as const;
const MAX_CLOSED = 20;

export type TabPosition = "top" | "left" | "right";

export const VERTICAL_TAB_MIN = 120;
export const VERTICAL_TAB_MAX = 480;
const clampWidth = (px: number) =>
  Math.round(Math.min(VERTICAL_TAB_MAX, Math.max(VERTICAL_TAB_MIN, Number.isFinite(px) ? px : 200)));

function lsGet<T extends "number" | "boolean" | "string">(key: string, type: T): (T extends "number" ? number : T extends "string" ? string : boolean) | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return typeof v === type ? v : null;
  } catch {
    return null;
  }
}

function lsSet(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}

/** Pre-sync storage of UI toolbar edits; migrated into config.toml once. */
const LEGACY_TOOLBAR_KEY = "terminux.toolbar";

const asTabPosition = (v: string | null): TabPosition | null => (v === "top" || v === "left" || v === "right" ? v : null);

export class App {
  config = $state<Config>(FALLBACK_CONFIG);
  tabs = $state<Tab[]>([]);
  activeTab = $state(0);
  panes = $state<Record<string, PaneInfo>>({});
  palette = $state.raw<PaletteView | null>(null);
  menu = $state.raw<MenuRequest | null>(null);
  dialog = $state.raw<DialogRequest | null>(null);
  toasts = $state<Toast[]>([]);
  /** Ctrl+Tab overlay: tab ids in display order and the highlighted one. */
  tabSwitcher = $state<{ order: string[]; sel: number } | null>(null);
  colorPicker = $state<{ tabId: string; x: number; y: number } | null>(null);
  /** Id of the tab whose title is being edited. */
  renaming = $state<string | null>(null);
  about = $state(false);
  configDirty = $state(false);
  searchPane = $state<string | null>(null);
  search = $state({ query: "", regex: false, caseSensitive: false, wholeWord: false });
  /** Global font zoom in px, added to every profile's font size. */
  fontDelta = $state(0);
  /** Effective UI brightness. */
  dark = $state(true);
  ui = $state.raw<UiLook | null>(null);
  fullscreen = $state(false);
  focusMode = $state(false);
  /** Tab position set by toggle_vertical_tabs / the tab bar menu (null: follow config). Persisted per machine. */
  private tabPositionOverride = $state<TabPosition | null>(asTabPosition(lsGet("terminux.tabPosition", "string")));
  /** Vertical panel width / collapsed state set by the user (null: follow config). Persisted per machine. */
  private verticalWidthOverride = $state<number | null>(lsGet("terminux.verticalTabWidth", "number"));
  private verticalCollapsedOverride = $state<boolean | null>(lsGet("terminux.verticalTabsCollapsed", "boolean"));
  /** Toolbar written to config.toml but not reloaded yet (optimistic UI). */
  private toolbarPending = $state<string[] | null>(null);
  private toolbarWrites = 0;
  private toolbarQueue: Promise<void> = Promise.resolve();
  alwaysOnTop = $state(false);
  windowFocused = $state(true);
  windowName = $state<string | null>(null);
  windowId = $state(1);
  /** Text of the "identify window" overlay. */
  identify = $state<string | null>(null);
  keymap = $state.raw(new Keymap());
  userActions: UserAction[] = [];
  /** Focus callbacks of the mounted editors, by tab kind. */
  editors = new Map<string, () => void>();
  /** Mounted file editor panes, by pane id. */
  paneEditors = new Map<string, { focus(): void; goto(line?: number, col?: number): void }>();
  /** Set by TabBar: where the new-tab dropdown opens. */
  dropdownAnchor: (() => { x: number; y: number }) | null = null;
  private closed: Closed[] = [];
  private tabMru: string[] = [];
  private paneSeq = 0;
  private toastSeq = 0;

  get tab(): Tab | undefined {
    return this.tabs[this.activeTab];
  }

  get activePane(): string | undefined {
    return this.tab?.active;
  }

  get session(): TermSession | undefined {
    const id = this.activePane;
    return id ? sessions.get(id) : undefined;
  }

  get tabPosition(): TabPosition {
    if (this.tabPositionOverride) return this.tabPositionOverride;
    const p = (this.config.tab_position ?? "top").toLowerCase();
    return p === "left" || p === "right" ? p : "top";
  }

  /** top ↔ vertical (configured side, else left). */
  toggleVerticalTabs() {
    const cfg = (this.config.tab_position ?? "").toLowerCase();
    const side: TabPosition = cfg === "right" ? "right" : "left";
    this.setTabPosition(this.tabPosition === "top" ? side : "top");
  }

  setTabPosition(p: TabPosition) {
    this.tabPositionOverride = p;
    lsSet("terminux.tabPosition", p);
  }

  // ---------- toolbar ----------

  /** Raw toolbar entries: `toolbar` in config.toml (UI edits are written there), else the default. */
  get toolbar(): string[] {
    return this.toolbarPending ?? toolbarEntries(this.config.toolbar) ?? DEFAULT_TOOLBAR;
  }

  get toolbarCustomized(): boolean {
    return (this.toolbarPending ?? toolbarEntries(this.config.toolbar)) !== null;
  }

  get toolbarItems(): ToolbarItem[] {
    void this.config; // user actions change with the config
    return resolveToolbar(this.toolbar, (id) => this.userAction(id));
  }

  /** Whether a command name / action id is on the toolbar. */
  onToolbar(id: string): boolean {
    const key = canonicalEntry(id, (x) => this.userAction(x)) ?? id;
    return this.toolbar.some((e) => (canonicalEntry(e, (x) => this.userAction(x)) ?? e) === key);
  }

  setToolbar(entries: string[]) {
    this.toolbarPending = [...entries];
    this.writeToolbar(tomlStringArray(entries));
  }

  /** Rewrite (or remove) `toolbar = [...]` in config.toml; writes are serialized, each on the current file. */
  private writeToolbar(value: string | null) {
    this.toolbarWrites++;
    this.toolbarQueue = this.toolbarQueue
      .then(async () => {
        const src = await invoke<string>("read_config");
        const next = setRootKey(src, "toolbar", value);
        if (next !== src) await invoke("write_config", { src: next });
      })
      .catch((e) => {
        this.toolbarPending = null;
        this.toast(`Could not save the toolbar to config.toml: ${e}`, "error");
      })
      .finally(() => {
        // No reload follows an unchanged file: drop the optimistic state once every write is done.
        if (--this.toolbarWrites === 0) setTimeout(() => this.toolbarWrites === 0 && (this.toolbarPending = null), 3000);
      });
  }

  /** Insert at raw position `at` (default: end). */
  addToToolbar(id: string, at?: number) {
    const list = [...this.toolbar];
    list.splice(at ?? list.length, 0, id);
    this.setToolbar(list);
  }

  removeFromToolbar(index: number) {
    this.setToolbar(this.toolbar.filter((_, i) => i !== index));
  }

  /** Remove every entry naming `id`. */
  removeIdFromToolbar(id: string) {
    const key = canonicalEntry(id, (x) => this.userAction(x)) ?? id;
    this.setToolbar(this.toolbar.filter((e) => (canonicalEntry(e, (x) => this.userAction(x)) ?? e) !== key));
  }

  /** Swap two raw entries. */
  swapToolbarItems(a: number, b: number) {
    const list = [...this.toolbar];
    if (!(a in list) || !(b in list)) return;
    [list[a], list[b]] = [list[b], list[a]];
    this.setToolbar(list);
  }

  /** Move the entry at raw `index` past its visible neighbor. */
  moveToolbarItem(index: number, delta: -1 | 1) {
    const items = this.toolbarItems;
    const pos = items.findIndex((it) => it.index === index);
    const other = items[pos + delta];
    if (pos >= 0 && other) this.swapToolbarItems(index, other.index);
  }

  /** Drag & drop: move the item at display position `from` to display position `to` (raw entries are kept). */
  moveToolbarItemTo(from: number, to: number) {
    const list = moveEntry(this.toolbar, this.toolbarItems, from, to);
    if (list) this.setToolbar(list);
  }

  /** Remove `toolbar` from config.toml (back to the default buttons). */
  resetToolbar() {
    this.toolbarPending = [...DEFAULT_TOOLBAR];
    this.writeToolbar(null);
  }

  /** Toolbar edits stored by older versions move into config.toml. */
  private migrateToolbar() {
    try {
      const raw = localStorage.getItem(LEGACY_TOOLBAR_KEY);
      if (raw === null) return;
      localStorage.removeItem(LEGACY_TOOLBAR_KEY);
      const list = toolbarEntries(JSON.parse(raw));
      if (list) this.setToolbar(list);
    } catch {
      /* storage unavailable or invalid */
    }
  }

  get canRestoreClosed(): boolean {
    return this.closed.length > 0;
  }

  get verticalWidth(): number {
    return clampWidth(this.verticalWidthOverride ?? this.config.vertical_tab_width ?? 200);
  }

  setVerticalWidth(px: number) {
    this.verticalWidthOverride = clampWidth(px);
    lsSet("terminux.verticalTabWidth", this.verticalWidthOverride);
  }

  get verticalCollapsed(): boolean {
    return this.verticalCollapsedOverride ?? !!this.config.vertical_tabs_collapsed;
  }

  setVerticalCollapsed(v: boolean) {
    this.verticalCollapsedOverride = v;
    lsSet("terminux.verticalTabsCollapsed", v);
  }

  get tabBarVisible(): boolean {
    return !this.focusMode && !(this.fullscreen && !this.config.show_tabs_fullscreen);
  }

  profileName(id: string) {
    return this.config.profiles.find((p) => p.id === id)?.name ?? id;
  }

  tabTitle(t: Tab): string {
    if (t.kind === "config") return "config.toml" + (this.configDirty ? " ●" : "");
    if (t.kind === "defaults") return "Default settings";
    if (t.name) return t.name;
    const p = this.panes[t.active];
    if (!p) return "";
    if (p.kind === "snippets") return "Snippets";
    if (p.kind === "file") return baseName(p.spec.file ?? "") + (p.dirty ? " ●" : "");
    return p.title || p.look?.tabTitle || this.profileName(p.spec.profileId);
  }

  tabColor(t: Tab): string | null {
    return t.color ?? this.panes[t.active]?.look?.tabColor ?? null;
  }

  tabOf(paneId: string): Tab | undefined {
    return this.tabs.find((t) => tree.contains(t.root, paneId));
  }

  // ---------- lifecycle ----------

  async init() {
    try {
      this.setConfig(await invoke<Config>("get_config"));
    } catch (e) {
      console.error(e);
    }
    await listen<Config>("config-changed", (e) => this.setConfig(e.payload));
    await listen<{ id: number; code: number | null }>("pty-exit", (e) => {
      const s = sessionByPty(e.payload.id);
      if (s) this.onPaneExit(s.paneId, e.payload.code);
    });
    await getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "drop" && e.payload.paths.length) {
        const s = this.session;
        s?.paste(droppedPaths(e.payload.paths, s.look.pathTranslation, IS_WINDOWS));
        s?.focus();
      }
    });
    window.addEventListener("keydown", (e) => this.onKeyDown(e), { capture: true });
    window.addEventListener("keyup", (e) => this.onKeyUp(e), { capture: true });
    window.addEventListener("focus", () => this.onWindowFocus(true));
    window.addEventListener("blur", () => this.onWindowFocus(false));
    this.migrateToolbar();
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.refreshTheme());
    await windows.init(this);
    if (this.tabs.length === 0) this.newTab();
  }

  private setConfig(cfg: Config) {
    this.config = cfg;
    if (this.toolbarWrites === 0) this.toolbarPending = null;
    this.userActions = parseUserActions(cfg.actions ?? []);
    this.keymap = new Keymap(cfg.keys ?? {}, this.userActions);
    this.refreshTheme();
    for (const s of sessions.values()) s.applyConfig(cfg);
    windows.configChanged(this);
  }

  private refreshTheme() {
    const dark = isDarkTheme(this.config);
    const changed = dark !== this.dark;
    this.dark = dark;
    this.ui = applyUiTheme(this.config, dark);
    if (changed) this.updateSessions();
  }

  private updateSessions() {
    for (const s of sessions.values()) s.update();
  }

  private onWindowFocus(focused: boolean) {
    this.windowFocused = focused;
    const t = this.tab;
    if (t?.kind === "term") sessions.get(t.active)?.setFocused(focused);
    if (focused) this.focusCurrent();
    else if (this.tabSwitcher) this.commitTabSwitcher();
    windows.focusChanged(this, focused);
  }

  private hooks: SessionHooks = {
    env: () => ({ dark: this.dark, fontDelta: this.fontDelta }),
    onTitle: (id, title) => {
      if (this.panes[id]) this.panes[id].title = title;
    },
    onBell: (id) => this.bell(id),
    onOutput: (id) => {
      const p = this.panes[id];
      if (p && !p.activity && !this.isVisible(id)) p.activity = true;
    },
    onNotify: (id, title, body) => {
      if (document.hasFocus() && id === this.activePane) return;
      const p = this.panes[id];
      this.notify(title || p?.title || "Terminux", body);
      if (p && id !== this.activePane) p.bell = true;
    },
    onFocus: (id) => this.focusPane(id),
    onInput: (id, data) => this.onInput(id, data),
    onExitedKey: (id, data) => {
      if (data === "\r") sessions.get(id)?.restart();
      else if (data === "\x04") this.closePane(id, { force: true });
    },
    onExit: (id, code) => this.onPaneExit(id, code),
    onContextMenu: (id, x, y) => {
      this.focusPane(id);
      this.menu = paneMenu(this, id, x, y);
    },
    onProgress: (id, progress) => {
      if (this.panes[id]) this.panes[id].progress = progress;
      windows.syncProgress(this);
    },
    onCwd: (id, cwd) => {
      if (this.panes[id]) this.panes[id].cwd = cwd;
    },
    onLook: (id, look) => {
      const p = this.panes[id];
      if (!p) return;
      p.look = look;
      if (look.suppressTitle) p.title = "";
    },
    onWheel: (id, kind, delta) => {
      if (kind === "zoom") this.adjustFont(delta);
      else this.adjustOpacity(delta * 5, true, id);
    },
    onMarkMode: (id, active, block) => {
      if (this.panes[id]) this.panes[id].markMode = active ? (block ? "block" : "linear") : null;
    },
    requestPaste: (id) => this.paste({}, id),
    onCopy: () => this.copied(),
    openLink: (uri) => void openUrl(uri).catch(console.error),
    openFile: (id, path, line, col) => void this.openFile(id, path, line, col),
  };

  /** Ctrl+click on a file path, per `file_link_open`. */
  private async openFile(from: string, path: string, line?: number, col?: number) {
    const mode = norm(this.config.file_link_open) || "builtin";
    try {
      if (mode === "builtin") return this.openFileBuiltin(path, line, col);
      const terminal = mode === "tab" || mode === "pane";
      const commandline = await invoke<string | null>("open_in_editor", { path, line, col, terminal });
      if (!commandline) return;
      const args = { commandline, starting_directory: dirOf(path) };
      if (mode === "pane" && this.tabOf(from)) {
        this.focusPane(from);
        await this.splitPane({ ...args, split: "auto" });
      } else this.newTab(args);
    } catch (e) {
      this.toast(String(e), "error");
    }
  }

  /** Built-in editor in its own tab; a file already open is focused at the line. */
  private openFileBuiltin(file: string, line?: number, col?: number) {
    const same = Object.values(this.panes).find((p) => p.kind === "file" && p.spec.file === file && this.tabOf(p.id));
    if (same) {
      this.focusPane(same.id);
      this.paneEditors.get(same.id)?.goto(line, col);
      return;
    }
    const id = this.addPaneInfo("file", clean({ profileId: this.config.default_profile, file, line, col })).id;
    this.insertTab({
      id: tree.newId("t"), kind: "term", root: tree.pane(id), active: id, zoom: null,
      name: null, color: null, broadcast: false, mru: [id], group: null,
    });
  }

  /** Ask before dropping unsaved file editor changes. */
  private async confirmUnsaved(ids: string[]): Promise<boolean> {
    const dirty = ids.map((id) => this.panes[id]).filter((p) => p?.kind === "file" && p.dirty);
    if (!dirty.length) return true;
    const names = dirty.map((p) => baseName(p.spec.file ?? "")).join(", ");
    return this.confirm("Discard unsaved changes?", names, { ok: "Discard", danger: true });
  }

  private async notify(title: string, body: string) {
    if (!this.config.notifications) return;
    let ok = await isPermissionGranted();
    if (!ok) ok = (await requestPermission()) === "granted";
    if (ok) sendNotification({ title, body });
  }

  private bell(id: string) {
    const p = this.panes[id];
    if (!p) return;
    if (id !== this.activePane) p.bell = true;
    const bell = sessions.get(id)?.look.bell;
    if (bell?.audible) playBell(bell.sounds);
    if (bell?.window) p.flash++;
    if (!document.hasFocus()) {
      if (bell?.taskbar) getCurrentWindow().requestUserAttention(UserAttentionType.Informational).catch(() => {});
      this.notify(p.title || this.profileName(p.spec.profileId), "Bell");
    }
  }

  /** Read-only panes drop input; broadcast tabs mirror it to their other panes. */
  private onInput(id: string, data: string): boolean {
    if (this.panes[id]?.readOnly) {
      this.toast("This pane is read-only. Disable read-only mode to type in it.", "warn");
      return false;
    }
    const t = this.tabOf(id);
    if (t?.broadcast) {
      for (const other of tree.paneIds(t.root)) {
        const s = other === id || this.panes[other]?.readOnly ? undefined : sessions.get(other);
        if (s && !s.exited) {
          s.autoMark(data);
          s.write(data);
        }
      }
    }
    return true;
  }

  private onPaneExit(id: string, code: number | null) {
    const s = sessions.get(id);
    if (!s) return;
    const mode = s.look.closeOnExit;
    if (mode === "always" || (mode !== "never" && code === 0)) this.closePane(id, { force: true });
    else s.markExited(code);
  }

  private isVisible(paneId: string) {
    const t = this.tab;
    if (!t) return false;
    const shown = t.zoom ? tree.find(t.root, t.zoom) : t.root;
    return !!shown && tree.contains(shown, paneId);
  }

  // ---------- dialogs ----------

  /** `opts.checkbox.checked` reflects the user's choice once resolved. */
  confirm(title: string, message = "", opts: { ok?: string; danger?: boolean; checkbox?: { label: string; checked: boolean } } = {}): Promise<boolean> {
    return new Promise((resolve) => {
      this.dialog = { title, message, checkbox: opts.checkbox, ok: opts.ok ?? "OK", cancel: "Cancel", danger: opts.danger, resolve: (v) => resolve(v === true) };
    });
  }

  promptText(title: string, value = "", placeholder = ""): Promise<string | null> {
    return new Promise((resolve) => {
      this.dialog = { title, input: { value, placeholder }, ok: "OK", cancel: "Cancel", resolve: (v) => resolve(typeof v === "string" ? v : null) };
    });
  }

  toast(message: string, kind: Toast["kind"] = "info") {
    if (this.toasts.some((t) => t.message === message)) return;
    const id = ++this.toastSeq;
    this.toasts.push({ id, message, kind });
    setTimeout(() => (this.toasts = this.toasts.filter((t) => t.id !== id)), kind === "info" ? 2500 : 4500);
  }

  // ---------- panes: creation ----------

  /** Pane spec from action arguments. `null` when `index` names no profile. */
  specFrom(a: NewPaneArgs, base?: PaneSpec): PaneSpec | null {
    const list = visibleProfiles(this.config);
    if (typeof a.index === "number" && !list[a.index] && !a.profile) return null;
    const profile = findProfile(this.config, a.profile) ?? (typeof a.index === "number" ? list[a.index] : undefined);
    return clean({
      ...base,
      profileId: profile?.id ?? base?.profileId ?? this.config.default_profile,
      commandline: a.commandline || base?.commandline,
      cwd: a.starting_directory || undefined,
      tabTitle: a.tab_title ?? base?.tabTitle,
      tabColor: a.tab_color ?? base?.tabColor,
      colorScheme: a.color_scheme ?? base?.colorScheme,
      suppressApplicationTitle: a.suppress_application_title ?? base?.suppressApplicationTitle,
    });
  }

  private addPaneInfo(kind: PaneInfo["kind"], spec: PaneSpec): PaneInfo {
    const id = tree.newId("p");
    this.panes[id] = {
      id, kind, spec, title: "", bell: false, activity: false, readOnly: false, progress: null, cwd: null,
      look: null, flash: 0, markMode: null, seq: ++this.paneSeq,
    };
    return this.panes[id];
  }

  private createPane(spec: PaneSpec, restore: Restore | null = null): string {
    const info = this.addPaneInfo("term", spec);
    const s = new TermSession(info.id, info.spec, this.config, this.hooks, restore);
    info.look = s.look;
    sessions.set(info.id, s);
    return info.id;
  }

  // ---------- snapshots (undo close, session restore, move between windows) ----------

  /** Capture a pane. `live` hands its pty over (the pane must then be dropped without killing). */
  async capturePane(id: string, live: boolean): Promise<PaneSnapshot | null> {
    const p = this.panes[id];
    if (!p) return null;
    const s = sessions.get(id);
    const cwd = (await s?.cwdNow()) ?? p.cwd;
    const restore: Restore = !s ? { buffer: "" } : live ? await s.release() : { buffer: s.serialize(false) };
    return { id, kind: p.kind, spec: $state.snapshot(p.spec), title: p.title, cwd, readOnly: p.readOnly, restore };
  }

  async captureTab(t: Tab, live: boolean): Promise<TabSnapshot> {
    const panes = (await Promise.all(tree.paneIds(t.root).map((id) => this.capturePane(id, live)))).filter((p) => !!p);
    return { root: $state.snapshot(t.root), active: t.active, name: t.name, color: t.color, panes };
  }

  /** Recreate a captured pane; returns its new id. */
  adoptPane(snap: PaneSnapshot): string {
    if (snap.kind !== "term") return this.addPaneInfo(snap.kind, snap.spec).id;
    const live = snap.restore.ptyId != null || snap.restore.exited;
    // A fresh process starts where the old one was.
    const spec = live ? snap.spec : clean({ ...snap.spec, cwd: snap.cwd ?? snap.spec.cwd, inheritCwd: undefined });
    const id = this.createPane(spec, snap.restore);
    const p = this.panes[id];
    p.title = snap.title;
    p.cwd = snap.cwd;
    p.readOnly = snap.readOnly;
    return id;
  }

  adoptTab(snap: TabSnapshot, at = this.tabs.length, focus = true): Tab | null {
    if (!snap.panes.length) return null;
    const ids = new Map(snap.panes.map((p) => [p.id, this.adoptPane(p)]));
    const active = ids.get(snap.active) ?? [...ids.values()][0];
    const tab: Tab = {
      id: tree.newId("t"), kind: "term", root: tree.remap(snap.root, ids), active, zoom: null,
      name: snap.name, color: snap.color, broadcast: false, mru: [active], group: null,
    };
    const i = Math.max(0, Math.min(at, this.tabs.length));
    const current = this.tab;
    this.tabs.splice(i, 0, tab);
    if (focus) this.gotoTab(i);
    else if (current) this.activeTab = this.tabs.indexOf(current);
    return tab;
  }

  private remember(entry: Closed) {
    this.closed.push(entry);
    if (this.closed.length > MAX_CLOSED) this.closed.shift();
  }

  restoreLastClosed(): boolean {
    const entry = this.closed.pop();
    if (!entry) return false;
    if (entry.kind === "tab") {
      this.adoptTab(entry.snap, entry.index);
      return true;
    }
    const t = this.tabs.find((x) => x.id === entry.tabId);
    if (!t || !entry.neighbor || !tree.contains(t.root, entry.neighbor)) {
      this.adoptTab({ root: tree.pane(entry.snap.id), active: entry.snap.id, name: null, color: null, panes: [entry.snap] });
      return true;
    }
    const id = this.adoptPane(entry.snap);
    t.zoom = null;
    t.root = tree.split(t.root, entry.neighbor, entry.dir, id, { before: entry.before });
    this.focusPane(id);
    return true;
  }

  // ---------- tabs ----------

  newTab(args: NewPaneArgs = {}): boolean {
    const spec = this.specFrom(args);
    if (!spec) return false;
    const paneId = this.createPane(spec);
    this.insertTab({
      id: tree.newId("t"), kind: "term", root: tree.pane(paneId), active: paneId, zoom: null,
      name: null, color: null, broadcast: false, mru: [paneId], group: null,
    });
    return true;
  }

  private insertTab(tab: Tab) {
    const after = norm(this.config.new_tab_position) === "aftercurrenttab" && this.tabs.length > 0;
    const at = after ? this.activeTab + 1 : this.tabs.length;
    this.tabs.splice(at, 0, tab);
    this.gotoTab(at);
  }

  /** Open (or focus) the settings editor, or the read-only default settings. */
  openEditor(kind: "config" | "defaults" = "config", at = this.tabs.length, focus = true) {
    let i = this.tabs.findIndex((t) => t.kind === kind);
    if (i < 0) {
      const pane = EDITOR_PANES[kind];
      i = Math.max(0, Math.min(at, this.tabs.length));
      this.tabs.splice(i, 0, {
        id: tree.newId("t"), kind, root: tree.pane(pane), active: pane, zoom: null,
        name: null, color: null, broadcast: false, mru: [], group: null,
      });
    }
    if (focus) this.gotoTab(i);
  }

  gotoTab(i: number): boolean {
    if (i < 0) i = this.tabs.length - 1;
    const t = this.tabs[i];
    if (!t) return false;
    this.activeTab = i;
    this.tabMru = [t.id, ...this.tabMru.filter((id) => id !== t.id)];
    if (t.kind === "term") this.focusPane(t.active);
    else queueMicrotask(() => this.focusEditor());
    windows.syncTitle(this);
    return true;
  }

  focusEditor() {
    const k = this.tab?.kind;
    if (k) this.editors.get(k)?.();
  }

  /** Focus the active terminal or the config editor. */
  focusCurrent() {
    if (this.tab && this.tab.kind !== "term") this.focusEditor();
    else this.session?.focus();
  }

  /** next_tab / prev_tab: direct in tab-bar order, or through the MRU switcher overlay. */
  cycleTab(delta: number, mode?: unknown) {
    const n = this.tabs.length;
    if (!n) return;
    const m = mode ?? this.config.tab_switcher_mode;
    if (!(m === true || norm(m) === "mru") || n < 2) {
      this.gotoTab((this.activeTab + delta + n) % n);
      return;
    }
    if (!this.tabSwitcher) {
      const live = new Set(this.tabs.map((t) => t.id));
      const order = [...this.tabMru.filter((id) => live.has(id))];
      for (const t of this.tabs) if (!order.includes(t.id)) order.push(t.id);
      this.tabSwitcher = { order, sel: 0 };
    }
    const sw = this.tabSwitcher;
    sw.sel = (sw.sel + delta + sw.order.length) % sw.order.length;
  }

  commitTabSwitcher(cancel = false) {
    const sw = this.tabSwitcher;
    if (!sw) return;
    this.tabSwitcher = null;
    const i = cancel ? -1 : this.tabs.findIndex((t) => t.id === sw.order[sw.sel]);
    if (i >= 0) this.gotoTab(i);
    else this.focusCurrent();
  }

  async closeTab(i = this.activeTab, opts: { force?: boolean; record?: boolean } = {}): Promise<boolean> {
    const t = this.tabs[i];
    if (!t) return false;
    if (!opts.force) {
      if (t.kind === "config" && this.configDirty && !(await this.confirm("Discard unsaved changes?", "config.toml has unsaved changes.", { ok: "Discard", danger: true }))) return false;
      if (tree.paneIds(t.root).some((id) => this.panes[id]?.readOnly) && !(await this.confirm("Close read-only pane?", "This tab contains a read-only pane.", { ok: "Close", danger: true }))) return false;
      if (!(await this.confirmUnsaved(tree.paneIds(t.root)))) return false;
    }
    if (t.kind === "config") this.configDirty = false;
    if (t.kind === "term" && opts.record !== false) {
      const snap = await this.captureTab(t, false);
      this.remember({ kind: "tab", snap, index: this.tabs.indexOf(t) });
    }
    i = this.tabs.indexOf(t);
    if (i < 0) return false;
    for (const id of tree.paneIds(t.root)) this.disposePane(id);
    this.dropTab(i);
    return true;
  }

  /** Remove a tab whose panes are already disposed or moved away. */
  private dropTab(i: number) {
    const active = this.tab;
    const [gone] = this.tabs.splice(i, 1);
    this.tabMru = this.tabMru.filter((id) => id !== gone.id);
    if (this.colorPicker?.tabId === gone.id) this.colorPicker = null;
    if (this.tabs.length === 0) {
      windows.lastTabClosed(this);
      return;
    }
    if (active && active !== gone) {
      this.activeTab = this.tabs.indexOf(active);
      return;
    }
    // The active tab was closed: go back to the most recently used one.
    const next = this.tabs.findIndex((t) => t.id === this.tabMru[0]);
    this.gotoTab(next >= 0 ? next : Math.min(i, this.tabs.length - 1));
  }

  async closeTabs(keep: (t: Tab, i: number) => boolean) {
    for (const t of this.tabs.filter((t, i) => !keep(t, i))) await this.closeTab(this.tabs.indexOf(t));
  }

  moveTab(from: number, to: number): boolean {
    if (from === to || from < 0 || to < 0 || from >= this.tabs.length || to >= this.tabs.length) return false;
    const active = this.tabs[this.activeTab];
    const [t] = this.tabs.splice(from, 1);
    this.tabs.splice(to, 0, t);
    this.activeTab = this.tabs.indexOf(active);
    return true;
  }

  renameTab(i: number, name: string | null | undefined) {
    if (this.tabs[i]) this.tabs[i].name = name?.trim() || null;
    windows.syncTitle(this);
  }

  setTabColor(i: number, color: string | null | undefined) {
    if (this.tabs[i]) this.tabs[i].color = color || null;
  }

  async duplicateTab(i = this.activeTab) {
    const t = this.tabs[i];
    if (!t || t.kind !== "term") return;
    const snap = await this.captureTab(t, false);
    // Same layout and profiles, fresh processes, no copied output.
    for (const p of snap.panes) p.restore = { buffer: "" };
    const tab = this.adoptTab(snap, this.tabs.length, false);
    if (!tab) return;
    tab.color = t.color;
    this.tabs.splice(this.tabs.indexOf(tab), 1);
    this.insertTab(tab);
  }

  // ---------- panes ----------

  focusPane(id: string) {
    const ti = this.tabs.findIndex((t) => tree.contains(t.root, id));
    if (ti < 0) return;
    const t = this.tabs[ti];
    if (t.zoom && !tree.contains(tree.find(t.root, t.zoom) ?? t.root, id)) t.zoom = null;
    const previous = t.active;
    t.active = id;
    t.group = null;
    t.mru = [id, ...t.mru.filter((p) => p !== id)];
    if (this.activeTab !== ti) {
      this.activeTab = ti;
      this.tabMru = [t.id, ...this.tabMru.filter((x) => x !== t.id)];
    }
    const p = this.panes[id];
    if (p) {
      p.bell = false;
      p.activity = false;
    }
    for (const pid of tree.paneIds(t.zoom ? (tree.find(t.root, t.zoom) ?? t.root) : t.root)) {
      const q = this.panes[pid];
      if (q) q.activity = false;
    }
    if (previous !== id) sessions.get(previous)?.setFocused(false);
    sessions.get(id)?.setFocused(this.windowFocused);
    queueMicrotask(() => (sessions.get(id)?.focus(), this.paneEditors.get(id)?.focus()));
    windows.syncTitle(this);
  }

  /** Direction and side of a `split` argument for the active pane. */
  private splitSide(split: string | undefined, paneId: string): { dir: Dir; before: boolean } {
    switch (norm(split)) {
      case "left":
        return { dir: "row", before: true };
      case "up":
        return { dir: "col", before: true };
      case "down":
      case "horizontal":
        return { dir: "col", before: false };
      case "right":
      case "vertical":
        return { dir: "row", before: false };
    }
    // auto: the direction leaving the most room.
    const el = sessions.get(paneId)?.el;
    return { dir: !el || el.clientWidth >= el.clientHeight ? "row" : "col", before: false };
  }

  async splitPane(a: SplitArgs = {}): Promise<boolean> {
    const t = this.tab;
    if (!t || t.kind !== "term") return false;
    const source = this.panes[t.active];
    const side = this.splitSide(a.split, t.active);
    let id: string;
    if (norm(a.type) === "snippets") {
      id = this.addPaneInfo("snippets", { profileId: this.config.default_profile }).id;
    } else {
      const inheritCwd = (await sessions.get(t.active)?.cwdNow()) ?? null;
      // Without an explicit profile a split continues the pane it comes from.
      const duplicate = norm(a.split_mode) === "duplicate" || (!a.profile && a.index === undefined);
      const base = duplicate && source?.kind === "term" ? { ...$state.snapshot(source.spec), cwd: undefined, opacity: undefined, retro: undefined } : undefined;
      const spec = this.specFrom(a, base);
      if (!spec || !this.tabs.includes(t)) return false;
      // A duplicate follows the source pane's directory, even over the profile's own.
      id = this.createPane(duplicate ? { ...spec, cwd: spec.cwd ?? inheritCwd } : { ...spec, inheritCwd });
    }
    t.zoom = null;
    t.root = tree.split(t.root, t.active, side.dir, id, { before: side.before, size: typeof a.size === "number" ? a.size : undefined });
    this.focusPane(id);
    return true;
  }

  /** Legacy helper (palette, toolbar): duplicate split, optionally with another profile. */
  split(dir: Dir, profileId?: string) {
    return this.splitPane({ split: dir === "row" ? "right" : "down", ...(profileId ? { profile: profileId } : { split_mode: "duplicate" }) });
  }

  private disposePane(id: string, kill = true) {
    sessions.get(id)?.dispose(kill);
    delete this.panes[id];
    if (this.searchPane === id) this.searchPane = null;
    windows.syncProgress(this);
  }

  /** Close a pane, or the subtree selected with "move focus to parent". */
  async closePane(id = this.tab?.group ?? this.activePane, opts: { force?: boolean; record?: boolean } = {}): Promise<boolean> {
    if (!id) return false;
    let t = this.tabs.find((t) => tree.contains(t.root, id));
    const node = t && tree.find(t.root, id);
    if (!t || !node) return false;
    const ids = tree.paneIds(node);
    if (!tree.remove(t.root, id)) return this.closeTab(this.tabs.indexOf(t), opts);
    if (!opts.force && ids.some((p) => this.panes[p]?.readOnly) && !(await this.confirm("Close read-only pane?", "", { ok: "Close", danger: true }))) return false;
    if (!opts.force && !(await this.confirmUnsaved(ids))) return false;
    if (opts.record !== false && node.kind === "pane" && this.panes[id]?.kind === "term") {
      const parent = tree.parentOf(t.root, id);
      const idx = parent?.children.findIndex((c) => c.id === id) ?? -1;
      const sibling = parent?.children[idx > 0 ? idx - 1 : 1];
      const snap = await this.capturePane(id, false);
      if (snap) this.remember({ kind: "pane", snap, tabId: t.id, neighbor: sibling ? tree.firstPane(sibling) : null, dir: parent?.dir ?? "row", before: idx === 0 });
    }
    // The awaits above may have changed the layout.
    t = this.tabs.find((x) => x.id === t!.id);
    if (!t || !tree.contains(t.root, id)) return false;
    this.removeNode(t, id, "kill");
    return true;
  }

  /**
   * Take a node out of a tab's layout. `kill`: end its panes; `detach`: drop the panes but keep their
   * processes (handed to another window); `keep`: layout only (moved within this window).
   */
  private removeNode(t: Tab, id: string, mode: "kill" | "detach" | "keep") {
    const node = tree.find(t.root, id);
    if (!node) return;
    const ids = tree.paneIds(node);
    const next = DIRECTIONS.map((d) => tree.neighbor(t.root, id, d)).find((n) => !!n);
    const root = tree.remove(t.root, id);
    if (mode !== "keep") for (const p of ids) this.disposePane(p, mode === "kill");
    if (!root) {
      this.dropTab(this.tabs.indexOf(t));
      return;
    }
    t.root = root;
    t.mru = t.mru.filter((p) => !ids.includes(p));
    if (t.zoom && !tree.find(root, t.zoom)) t.zoom = null;
    if (t.group && !tree.find(root, t.group)) t.group = null;
    if (ids.includes(t.active)) t.active = t.mru[0] ?? next ?? tree.firstPane(root);
    if (this.tabs.indexOf(t) === this.activeTab) this.focusPane(t.active);
  }

  /** Remove a tab whose processes were handed to another window. */
  detachTab(i: number) {
    const t = this.tabs[i];
    if (!t) return;
    for (const id of tree.paneIds(t.root)) this.disposePane(id, false);
    this.dropTab(i);
  }

  /** Capture a subtree with live processes and remove it from its tab. */
  async captureNode(t: Tab, id: string): Promise<TabSnapshot | null> {
    const node = tree.find(t.root, id);
    if (!node) return null;
    const root = $state.snapshot(node) as LayoutNode;
    const ids = tree.paneIds(node);
    const panes = (await Promise.all(ids.map((p) => this.capturePane(p, true)))).filter((p) => !!p);
    const active = ids.includes(t.active) ? t.active : ids[0];
    this.removeNode(t, id, "detach");
    return { root, active, name: null, color: null, panes };
  }

  async closeOtherPanes() {
    const t = this.tab;
    if (!t || t.kind !== "term") return;
    const keep = new Set(tree.paneIds(tree.find(t.root, t.group ?? t.active) ?? t.root));
    for (const id of tree.paneIds(t.root)) if (!keep.has(id)) await this.closePane(id);
  }

  /** Pane designated by a move_focus / swap_pane direction. */
  private paneToward(t: Tab, direction: string): string | null {
    const from = t.group ?? t.active;
    const d = norm(direction);
    if ((DIRECTIONS as string[]).includes(d)) return tree.neighbor(t.root, from, d as Direction);
    const ordered = tree.paneIds(t.root).sort((a, b) => (this.panes[a]?.seq ?? 0) - (this.panes[b]?.seq ?? 0));
    const i = ordered.indexOf(t.active);
    switch (d) {
      case "previous":
        return t.mru.find((p) => p !== t.active && tree.contains(t.root, p)) ?? null;
      case "nextinorder":
        return ordered[(i + 1) % ordered.length] ?? null;
      case "previousinorder":
        return ordered[(i - 1 + ordered.length) % ordered.length] ?? null;
      case "first":
        return tree.firstPane(t.root);
    }
    return null;
  }

  /** Returns false when there is nowhere to go (the key then reaches the terminal). */
  moveFocus(direction: string): boolean {
    const t = this.tab;
    if (!t || t.kind !== "term") return false;
    const d = norm(direction);
    if (d === "parent") {
      const parent = tree.parentOf(t.root, t.group ?? t.active);
      if (!parent) return false;
      t.group = parent.id;
      return true;
    }
    if (d === "child") {
      const node = t.group ? tree.find(t.root, t.group) : null;
      if (node?.kind !== "split") return false;
      const child = node.children.find((c) => tree.contains(c, t.active)) ?? node.children[0];
      if (child.kind === "pane") this.focusPane(child.id);
      else t.group = child.id;
      return true;
    }
    if (t.zoom) return false;
    const target = this.paneToward(t, d);
    if (!target || target === t.active) return false;
    this.focusPane(target);
    return true;
  }

  swapPane(direction: string): boolean {
    const t = this.tab;
    if (!t || t.kind !== "term" || t.zoom) return false;
    const target = this.paneToward(t, direction);
    if (!target) return false;
    const root = tree.swap(t.root, t.group ?? t.active, target);
    if (root === t.root) return false;
    t.root = root;
    return true;
  }

  /** Move the active pane (or selected subtree) to another tab; `index` past the end makes a new tab. */
  movePane(index: number): boolean {
    const from = this.tab;
    if (!from || from.kind !== "term") return false;
    const id = from.group ?? from.active;
    const node = tree.find(from.root, id);
    if (!node) return false;
    const target = index >= 0 ? this.tabs[index] : undefined;
    if (target === from || (target && target.kind !== "term")) return false;
    if (!target && node === from.root) return false; // already alone in its tab
    const moved = $state.snapshot(node) as LayoutNode;
    const active = tree.contains(node, from.active) ? from.active : tree.firstPane(node);
    this.removeNode(from, id, "keep");
    if (target) {
      target.zoom = null;
      target.root = tree.insert(target.root, target.active, this.splitSide("auto", target.active).dir, moved);
      this.focusPane(active);
    } else {
      this.tabs.push({
        id: tree.newId("t"), kind: "term", root: moved, active, zoom: null, name: null, color: null, broadcast: false, mru: [active], group: null,
      });
      this.gotoTab(this.tabs.length - 1);
    }
    return true;
  }

  resizePane(d: Direction) {
    const t = this.tab;
    if (t) t.root = tree.resize(t.root, t.group ?? t.active, d, 0.05);
  }

  setSizes(tabId: string, splitId: string, sizes: number[]) {
    const t = this.tabs.find((x) => x.id === tabId);
    if (t) t.root = tree.setSizes(t.root, splitId, sizes);
  }

  equalize() {
    const t = this.tab;
    if (t) t.root = tree.equalize(t.root);
  }

  toggleZoom() {
    const t = this.tab;
    if (!t || t.root.kind === "pane") return;
    t.zoom = t.zoom ? null : (t.group ?? t.active);
    this.focusPane(t.active);
  }

  toggleSplitOrientation() {
    const t = this.tab;
    if (t) t.root = tree.toggleOrientation(t.root, t.group ?? t.active);
  }

  /** `mode`: true / false, or undefined to toggle. */
  setReadOnly(mode?: boolean, id = this.activePane) {
    const p = id ? this.panes[id] : undefined;
    if (p?.kind === "term") p.readOnly = mode ?? !p.readOnly;
  }

  toggleBroadcast() {
    const t = this.tab;
    if (t?.kind === "term") t.broadcast = !t.broadcast;
  }

  // ---------- appearance ----------

  adjustFont(delta: number) {
    this.fontDelta = Math.max(-8, Math.min(40, this.fontDelta + delta));
    this.updateSessions();
  }

  resetFont() {
    this.fontDelta = 0;
    this.updateSessions();
  }

  /** Editor font size (settings tab) following the global zoom. */
  get editorFontSize() {
    return Math.max(6, (this.config.defaults?.font?.size ?? this.config.font_size ?? 14) + this.fontDelta);
  }

  adjustOpacity(value: number, relative: boolean, id = this.activePane) {
    const p = id ? this.panes[id] : undefined;
    const s = id ? sessions.get(id) : undefined;
    if (!p || !s) return;
    const current = Math.round(s.look.opacity * 100);
    p.spec.opacity = Math.max(0, Math.min(100, relative ? current + value : value));
    s.update();
    windows.transparencyHint(this, p.spec.opacity);
  }

  /** `name` undefined restores the profile's scheme. */
  setColorScheme(name: string | undefined, id = this.activePane) {
    const p = id ? this.panes[id] : undefined;
    if (!p) return;
    if (name) p.spec.colorScheme = name;
    else delete p.spec.colorScheme;
    sessions.get(p.id)?.update();
  }

  toggleRetro(id = this.activePane) {
    const p = id ? this.panes[id] : undefined;
    const s = id ? sessions.get(id) : undefined;
    if (!p || !s) return;
    p.spec.retro = !s.look.retro;
    s.update();
  }

  // ---------- clipboard ----------

  private copied() {
    if (this.config.copy_feedback !== false) this.toast("Copied to clipboard");
  }

  /** Returns false when there is nothing selected (the key then reaches the terminal). */
  copy(a: { single_line?: boolean; with_control_sequences?: boolean; copy_formatting?: boolean | string; dismiss_selection?: boolean } = {}): boolean {
    const s = this.session;
    if (!s || !s.term.hasSelection()) return false;
    let text = a.with_control_sequences ? s.selectionAnsi() : s.selectionText();
    if (a.single_line) text = text.replace(/\r?\n/g, "");
    const fmt = a.copy_formatting ?? this.config.copy_formatting;
    const html = fmt === true || fmt === "all" || fmt === "html" ? s.selectionHtml() : "";
    (html ? writeHtml(html, text) : writeText(text)).then(() => this.copied()).catch(console.error);
    if (a.dismiss_selection !== false) {
      s.markMode.exit(false);
      s.term.clearSelection();
    }
    return true;
  }

  async paste(ctx: ActionContext = {}, id = this.activePane) {
    const s = id ? sessions.get(id) : undefined;
    if (!s || !id) return;
    if (this.panes[id]?.readOnly) {
      this.toast("This pane is read-only. Disable read-only mode to paste in it.", "warn");
      return;
    }
    const raw = await readText().catch(() => "");
    if (!raw) {
      // No text (an image, or nothing): let the application handle a literal Ctrl+V itself.
      const e = ctx.event;
      if (e?.ctrlKey && !e.shiftKey && !e.altKey && eventKey(e) === "v") s.input("\x16");
      return;
    }
    const text = sanitizePaste(raw, this.config.trim_paste !== false);
    if (!text) return;
    const warn = pasteWarning(text, {
      large: this.config.large_paste_warning,
      multiLine: this.config.multi_line_paste_warning,
      bracketed: s.bracketedPaste,
    });
    if (warn) {
      const [title, body] =
        warn === "large"
          ? ["Paste a large amount of text?", `The clipboard holds ${text.length.toLocaleString()} characters.`]
          : ["Paste multiple lines?", "Each line may run as a command:\n\n" + preview(text)];
      const ok = await this.confirm(title, body, { ok: "Paste anyway" });
      if (!ok) {
        s.focus();
        return;
      }
    }
    s.paste(text);
    s.focus();
  }

  searchWeb(queryUrl?: string): boolean {
    const text = this.session?.term.getSelection().trim();
    if (!text) return false;
    const url = (queryUrl || this.config.search_web_url || DEFAULT_SEARCH_URL).replace("%s", encodeURIComponent(text));
    openUrl(url).catch(console.error);
    return true;
  }

  // ---------- search ----------

  toggleSearch() {
    this.searchPane = this.searchPane ? null : (this.activePane ?? null);
    if (!this.searchPane) this.focusCurrent();
  }

  /** Jump to the next / previous match of the current query. */
  findMatch(direction: string): boolean {
    const s = this.session;
    if (!s || !this.search.query) return false;
    const opts = { regex: this.search.regex, caseSensitive: this.search.caseSensitive, wholeWord: this.search.wholeWord, decorations: SEARCH_DECORATIONS };
    if (norm(direction).startsWith("prev")) s.search.findPrevious(this.search.query, opts);
    else s.search.findNext(this.search.query, opts);
    return true;
  }

  // ---------- actions ----------

  /** User action by id (`[[action]] id = "..."`). */
  userAction(id: string): UserAction | undefined {
    return this.userActions.find((a) => a.id === id);
  }

  /** Run an action: a spec, a named command, or a user action id. `false` = not handled. */
  run(action: string | ActionSpec, ctx: ActionContext = {}): unknown {
    const spec = typeof action === "string" ? (COMMANDS[commandName(action) ?? ""]?.spec ?? this.userAction(action)?.spec ?? { command: action }) : action;
    const handler = ACTIONS[spec.command];
    if (!handler) {
      console.warn("unknown action", spec.command);
      return false;
    }
    return handler(this, spec, ctx);
  }

  private overlayOpen() {
    return !!(this.palette || this.dialog || this.menu || this.colorPicker || this.about);
  }

  private onKeyDown(e: KeyboardEvent) {
    if (this.tabSwitcher) {
      if (e.key === "Escape") this.commitTabSwitcher(true);
      else if (e.key === "Enter") this.commitTabSwitcher();
      else if (e.key === "ArrowDown") this.cycleTab(1, "mru");
      else if (e.key === "ArrowUp") this.cycleTab(-1, "mru");
      else if (e.key === "Tab") this.cycleTab(e.shiftKey ? -1 : 1, "mru");
      else return;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (this.dialog) return;
    const text = this.tab?.kind !== "term" || this.overlayOpen() || isTextInput(e.target);
    const s = this.session;
    if (!text && s?.markMode.active && s.markMode.handleKey(e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const spec = this.keymap.match(e);
    if (!spec) return;
    // Where text is being edited only window-level commands stay global.
    if (text && !GLOBAL_COMMANDS.has(spec.command)) return;
    if (this.run(spec, { event: e }) !== false) {
      this.menu = null;
      e.preventDefault();
      e.stopPropagation();
    }
  }

  private onKeyUp(e: KeyboardEvent) {
    // The switcher stays open while a modifier of the chord is held.
    if (this.tabSwitcher && !e.ctrlKey && !e.altKey && !e.metaKey) this.commitTabSwitcher();
  }
}

const SEARCH_DECORATIONS = {
  matchOverviewRuler: "#e5c07b",
  activeMatchColorOverviewRuler: "#f0c674",
  matchBackground: "#4b4226",
  activeMatchBackground: "#7a6420",
};
export { SEARCH_DECORATIONS };

const IS_WINDOWS = navigator.userAgent.includes("Windows");

function isTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.tagName === "INPUT" || target.isContentEditable) return true;
  return target.tagName === "TEXTAREA" && !target.classList.contains("xterm-helper-textarea");
}

/** First lines of a paste for the confirmation dialog. */
function preview(text: string): string {
  const lines = text.split(/\r?\n|\r/);
  const head = lines.slice(0, 8).map((l) => (l.length > 100 ? l.slice(0, 100) + "…" : l));
  return head.join("\n") + (lines.length > 8 ? `\n… (${lines.length} lines)` : "");
}

export const app = new App();
