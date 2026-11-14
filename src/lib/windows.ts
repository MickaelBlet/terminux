// Window-level behavior: launch sizing, multiple windows, moving tabs, session persistence, title, progress.
import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { ProgressBarStatus } from "@tauri-apps/api/window";
import type { ActionSpec } from "./commands";
import * as tree from "./layout/tree";
import { sanitizeTab, type TabSnapshot, type WindowSnapshot } from "./snapshot";
import type { App, NewPaneArgs } from "./state.svelte";
import { setRootKey } from "./snippets";
import { sessions } from "./term/session";

/** What a window starts with, or receives later. */
export interface Payload {
  actions?: ActionSpec[];
  snapshot?: WindowSnapshot;
  /** Screen position (tear-out). */
  position?: { x: number; y: number };
}

interface InitInfo {
  id: number;
  name: string | null;
  transparent: boolean;
  payload: Payload | null;
  /** Size the window to this grid once a terminal is measured (first window of a launch). */
  grid: { cols: number; rows: number } | null;
  launch_mode: string;
  center: boolean;
}

interface ParsedCommandLine {
  window: string | null;
  actions: ActionSpec[];
}

const win = getCurrentWebviewWindow();
const norm = (s: unknown) => (typeof s === "string" ? s : "").toLowerCase().replace(/[_-]/g, "");
const SAVE_INTERVAL = 30_000;

let transparent = false;
let warnedTransparency = false;
let lastShortcuts = "";
let saveTimer = 0;
let closing = false;

const persisting = (app: App) => norm(app.config.first_window_preference ?? "persisted_window_layout") === "persistedwindowlayout";

export async function init(app: App) {
  let info: InitInfo | null = null;
  try {
    info = await invoke<InitInfo>("window_init");
  } catch (e) {
    console.error("window_init", e);
  }
  app.windowId = info?.id ?? 1;
  app.windowName = info?.name ?? null;
  transparent = info?.transparent ?? false;
  document.documentElement.classList.toggle("transparent", transparent);
  app.alwaysOnTop = await win.isAlwaysOnTop().catch(() => false);

  await win.listen<Payload>("window-payload", (e) => void applyPayload(app, e.payload));
  await win.listen<string>("identify", (e) => showIdentify(app, e.payload));
  await win.listen("persist", () => void saveSession(app));
  await win.onCloseRequested((e) => {
    e.preventDefault();
    void closeWindow(app);
  });
  await win.onResized(async () => {
    if (app.config.minimize_to_tray && (await win.isMinimized().catch(() => false))) invoke("minimize_to_tray").catch(console.error);
    app.fullscreen = await win.isFullscreen().catch(() => app.fullscreen);
  });

  const mode = norm(info?.launch_mode);
  if (mode === "focus" || mode === "maximizedfocus") app.focusMode = true;
  if (info?.payload) await applyPayload(app, info.payload);
  if (app.tabs.length === 0) app.newTab();
  await showWindow(app, info, mode);
  saveTimer = window.setInterval(() => void saveSession(app), SAVE_INTERVAL);
}

/** Size to the configured grid, apply the launch mode, then reveal the (hidden) window. */
async function showWindow(app: App, info: InitInfo | null, mode: string) {
  // Hidden webviews have no layout size (WebKitGTK): show first, then size.
  await win.show().catch(() => {});
  try {
    if (mode === "maximized" || mode === "maximizedfocus") await win.maximize();
    else if (mode === "fullscreen") {
      await win.setFullscreen(true);
      app.fullscreen = true;
    } else if (info?.grid) {
      await sizeToGrid(info.grid.cols, info.grid.rows);
      if (info.center) await win.center();
    }
  } catch (e) {
    console.warn("launch sizing", e);
  }
  await win.setFocus().catch(() => {});
  app.focusCurrent();
}

async function sizeToGrid(cols: number, rows: number) {
  const deadline = Date.now() + 1500;
  for (;;) {
    const s = [...sessions.values()][0];
    const cell = s?.cellSize();
    const screen = s?.el.querySelector<HTMLElement>(".xterm-screen");
    if (s && cell && screen) {
      const extraW = window.innerWidth - screen.clientWidth;
      const extraH = window.innerHeight - screen.clientHeight;
      const w = Math.ceil(cols * cell.width + extraW);
      const h = Math.ceil(rows * cell.height + extraH);
      await win.setSize(new LogicalSize(Math.max(400, w), Math.max(240, h)));
      return;
    }
    if (Date.now() > deadline) return;
    await new Promise((r) => setTimeout(r, 30));
  }
}

async function applyPayload(app: App, p: Payload) {
  if (p.snapshot) {
    const snap = p.snapshot;
    if (snap.name && !app.windowName) renameWindow(app, snap.name);
    const before = app.tabs.length;
    for (const t of snap.tabs) {
      const clean = t.panes.some((x) => x.restore.ptyId != null) ? t : sanitizeTab(t);
      if (clean) app.adoptTab(clean, app.tabs.length, false);
    }
    const target = app.tabs[Math.min(before + (snap.activeTab ?? 0), app.tabs.length - 1)];
    const editors = Array.isArray(snap.editors) ? [...snap.editors].sort((a, b) => a.index - b.index) : [];
    for (const e of editors) {
      if (e.kind === "config" || e.kind === "defaults") app.openEditor(e.kind, before + e.index, false);
    }
    const active = snap.activeEditor ? app.tabs.findIndex((t) => t.kind === snap.activeEditor) : -1;
    app.gotoTab(active >= 0 ? active : target ? app.tabs.indexOf(target) : app.tabs.length - 1);
  }
  if (p.actions?.length) {
    for (const a of p.actions) await app.run(a);
  }
  await win.unminimize().catch(() => {});
  await win.show().catch(() => {});
  await win.setFocus().catch(() => {});
}

export function configChanged(app: App) {
  // Global (OS-level) shortcuts: quake mode and global_summon actions.
  const shortcuts: { keys: string; action: ActionSpec }[] = [];
  for (const keys of app.keymap.combos("quake_mode")) shortcuts.push({ keys, action: { command: "quake_mode" } });
  for (const a of app.userActions) {
    if (a.spec.command === "global_summon" || a.spec.command === "quake_mode") for (const keys of a.keys) shortcuts.push({ keys, action: a.spec });
  }
  const sig = JSON.stringify(shortcuts);
  if (sig !== lastShortcuts) {
    lastShortcuts = sig;
    invoke("set_global_shortcuts", { shortcuts }).catch((e) => console.warn("global shortcuts", e));
  }
  syncTitle(app);
}

export function focusChanged(app: App, focused: boolean) {
  if (!focused && app.config.auto_hide_window && !app.dialog) win.hide().catch(() => {});
}

export function syncTitle(app: App) {
  const t = app.tab;
  const title = app.config.show_terminal_title_in_titlebar !== false && t ? app.tabTitle(t) : "";
  win.setTitle(title ? `${title} - Terminux` : "Terminux").catch(() => {});
}

const STATUS = [ProgressBarStatus.None, ProgressBarStatus.Normal, ProgressBarStatus.Error, ProgressBarStatus.Indeterminate, ProgressBarStatus.Paused];

/** Taskbar progress follows the active tab (OSC 9;4). */
export function syncProgress(app: App) {
  const t = app.tab;
  const ids = t?.kind === "term" ? [t.active, ...tree.paneIds(t.root)] : [];
  const p = ids.map((id) => app.panes[id]?.progress).find((x) => !!x);
  win.setProgressBar(p ? { status: STATUS[p.state], progress: p.value } : { status: ProgressBarStatus.None }).catch(() => {});
}

export function transparencyHint(app: App, opacity: number) {
  if (opacity < 100 && !transparent && !warnedTransparency) {
    warnedTransparency = true;
    app.toast("Restart Terminux to see through the window (transparency is enabled at window creation).", "warn");
  }
}

// ---------- session ----------

async function bounds(): Promise<WindowSnapshot["bounds"]> {
  try {
    const scale = await win.scaleFactor();
    const pos = (await win.outerPosition()).toLogical(scale);
    const size = (await win.innerSize()).toLogical(scale);
    return { x: pos.x, y: pos.y, width: size.width, height: size.height, maximized: await win.isMaximized() };
  } catch {
    return undefined;
  }
}

export async function snapshotWindow(app: App): Promise<WindowSnapshot> {
  const tabs: TabSnapshot[] = [];
  for (const t of app.tabs) if (t.kind === "term") tabs.push(await app.captureTab(t, false));
  const termTabs = app.tabs.filter((t) => t.kind === "term");
  const editors: NonNullable<WindowSnapshot["editors"]> = [];
  app.tabs.forEach((t, index) => {
    if (t.kind === "config" || t.kind === "defaults") editors.push({ kind: t.kind, index });
  });
  const cur = app.tab?.kind;
  return {
    name: app.windowName,
    tabs,
    activeTab: Math.max(0, termTabs.indexOf(app.tab!)),
    editors,
    activeEditor: cur === "config" || cur === "defaults" ? cur : undefined,
    bounds: await bounds(),
  };
}

export async function saveSession(app: App, empty = false) {
  if (!persisting(app) || closing) return;
  try {
    const snap = empty ? { name: app.windowName, tabs: [], activeTab: 0 } : await snapshotWindow(app);
    await invoke("session_save", { snapshot: snap });
  } catch (e) {
    console.warn("session save", e);
  }
}

// ---------- closing ----------

export async function closeWindow(app: App, force = false) {
  if (closing) return;
  const terms = app.tabs.filter((t) => t.kind === "term").length;
  if (!force && terms > 1 && app.config.confirm_close_all_tabs !== false) {
    const checkbox = { label: "Don't ask again", checked: false };
    const ok = await app.confirm("Close all tabs?", `This window has ${terms} tabs open.`, { ok: "Close all", danger: true, checkbox });
    if (!ok) return app.focusCurrent();
    if (checkbox.checked) {
      try {
        const src = await invoke<string>("read_config");
        await invoke("write_config", { src: setRootKey(src, "confirm_close_all_tabs", "false") });
      } catch (e) {
        console.warn("confirm_close_all_tabs", e);
      }
    }
  }
  if (!force && app.configDirty && !(await app.confirm("Discard unsaved changes?", "config.toml has unsaved changes.", { ok: "Discard", danger: true }))) return;
  await saveSession(app);
  closing = true;
  clearInterval(saveTimer);
  await win.destroy();
}

/** The last tab went away: the window closes (Windows Terminal behavior). */
export function lastTabClosed(app: App) {
  void (async () => {
    await saveSession(app, true);
    closing = true;
    clearInterval(saveTimer);
    await win.destroy();
  })();
}

export async function quit(app: App) {
  const ok = await app.confirm("Quit Terminux?", "All windows and their tabs will be closed.", { ok: "Quit", danger: true });
  if (!ok) return app.focusCurrent();
  await invoke("quit_app");
}

// ---------- window state ----------

export async function toggleFullscreen(app: App) {
  const next = !(await win.isFullscreen().catch(() => app.fullscreen));
  await win.setFullscreen(next);
  app.fullscreen = next;
}

export async function toggleAlwaysOnTop(app: App) {
  app.alwaysOnTop = !app.alwaysOnTop;
  await win.setAlwaysOnTop(app.alwaysOnTop);
}

export function renameWindow(app: App, name: string | null) {
  app.windowName = name?.trim() || null;
  invoke("window_rename", { name: app.windowName }).catch(console.error);
}

function showIdentify(app: App, text: string) {
  app.identify = text;
  setTimeout(() => {
    if (app.identify === text) app.identify = null;
  }, 2000);
}

export function identify(app: App, all: boolean) {
  if (all) invoke("identify_windows").catch(console.error);
  else showIdentify(app, `${app.windowId}${app.windowName ? `: ${app.windowName}` : ""}`);
}

// ---------- multiple windows ----------

export async function newWindow(_app: App, args: NewPaneArgs = {}, payload: Payload = {}) {
  const actions = payload.snapshot ? [] : [{ command: "new_tab", ...args }];
  await invoke("window_new", { payload: { actions, ...payload } });
}

/** Whether `target` names this window. */
function isSelf(app: App, target: string): boolean {
  const t = target.trim();
  return t === String(app.windowId) || (!!app.windowName && t === app.windowName);
}

/** Send to a window by id / name ("new" or "-1" creates one, "last" / "0" the most recent other). */
async function send(app: App, target: string, payload: Payload): Promise<boolean> {
  if (isSelf(app, target)) return false;
  const t = target.trim();
  if (t === "new" || t === "-1") await invoke("window_new", { payload });
  else await invoke("window_send", { target: t, payload });
  return true;
}

/** Hand a captured tab to another window; on failure it comes back here (its ptys re-attach). */
async function handOff(app: App, target: string, snap: TabSnapshot, at: number, position?: { x: number; y: number }) {
  try {
    await send(app, target, { snapshot: { name: null, tabs: [snap], activeTab: 0 }, position });
    return true;
  } catch (e) {
    console.error(e);
    app.adoptTab(snap, at);
    app.toast(`Move failed: ${e}`, "error");
    return false;
  }
}

export async function moveTabToWindow(app: App, index: number, target: string, position?: { x: number; y: number }) {
  const t = app.tabs[index];
  if (!t || t.kind !== "term" || isSelf(app, target)) return false;
  const snap = await app.captureTab(t, true);
  const at = app.tabs.indexOf(t);
  app.detachTab(at);
  return handOff(app, target, snap, at, position);
}

export async function movePaneToWindow(app: App, target: string) {
  const t = app.tab;
  if (!t || t.kind !== "term" || isSelf(app, target)) return false;
  const id = t.group ?? t.active;
  if (tree.find(t.root, id) === t.root) return moveTabToWindow(app, app.activeTab, target);
  const snap = await app.captureNode(t, id);
  if (!snap) return false;
  return handOff(app, target, snap, app.activeTab + 1);
}

/** Window under a screen point, other than this one (tab drag & drop). */
export async function windowAt(x: number, y: number): Promise<string | null> {
  return invoke<string | null>("window_at", { x, y }).catch(() => null);
}

/** Run a `wt`-style command line (`new-tab -p x ; split-pane -H`). */
export async function runCommandLine(app: App, line: string) {
  let parsed: ParsedCommandLine;
  try {
    parsed = await invoke<ParsedCommandLine>("cli_parse", { line });
  } catch (e) {
    app.toast(String(e), "error");
    return;
  }
  if (parsed.window && (await send(app, parsed.window, { actions: parsed.actions }))) return;
  for (const a of parsed.actions) await app.run(a);
}

