// The config.toml draft shared by the settings views (TOML editor and settings UI).
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { app } from "../state.svelte";
import type { PatchOp } from "./value";

export type SettingsView = "ui" | "toml";
const VIEW_KEY = "terminux.settingsView";
const AUTOSAVE_KEY = "terminux.settingsAutoSave";
/** Delay grouping quick successive edits (color picker drag, typing in a number field). */
const AUTOSAVE_MS = 400;

function storedView(): SettingsView {
  try {
    return localStorage.getItem(VIEW_KEY) === "toml" ? "toml" : "ui";
  } catch {
    return "ui";
  }
}

function storedAutoSave(): boolean {
  try {
    return localStorage.getItem(AUTOSAVE_KEY) !== "false";
  } catch {
    return true;
  }
}

class SettingsDoc {
  /** Draft text; null until first loaded. */
  text = $state<string | null>(null);
  /** Text on disk as last read or written. */
  saved = $state("");
  /** Parsed draft (raw config.toml, no fragments); null while the draft is not valid TOML. */
  json = $state<Record<string, unknown> | null>(null);
  parseError = $state<string | null>(null);
  path = $state("config.toml");
  status = $state("");
  statusError = $state(false);
  changedOnDisk = $state(false);
  view = $state<SettingsView>(storedView());
  /** Current settings UI page (nav id). */
  page = $state("root:general");
  /** Settings UI edits are written to disk right away (the TOML view always saves manually). */
  autoSave = $state(storedAutoSave());
  /** Key path to reveal when the TOML view mounts (from "Edit in TOML" links). */
  reveal: (string | number)[] | null = null;

  private loading: Promise<void> | null = null;
  private listening = false;
  private parseSeq = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  setAutoSave(on: boolean) {
    this.autoSave = on;
    try {
      localStorage.setItem(AUTOSAVE_KEY, String(on));
    } catch {
      /* private mode */
    }
    if (on && app.configDirty && this.json) this.scheduleSave();
  }

  private scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (app.configDirty) void this.save();
    }, AUTOSAVE_MS);
  }

  setView(v: SettingsView, reveal?: (string | number)[]) {
    this.reveal = reveal ?? null;
    this.view = v;
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* private mode */
    }
  }

  /** Load the file unless an unsaved draft is kept (a discarded draft is reloaded). */
  load(): Promise<void> {
    if (!this.listening) {
      this.listening = true;
      listen("config-changed", () => void this.onDiskChange()).catch(console.error);
      invoke<string>("config_path").then((p) => (this.path = p)).catch(() => {});
    }
    if (this.text !== null && app.configDirty) return Promise.resolve();
    this.loading ??= invoke<string>("read_config")
      .then((t) => this.reset(t))
      .catch((e) => this.setStatus(`Cannot read config: ${e}`, true))
      .finally(() => (this.loading = null));
    return this.loading;
  }

  setStatus(msg: string, error = false) {
    this.status = msg;
    this.statusError = error;
  }

  /** Replace the draft (`parse`: refresh `json` too; skipped while typing in the TOML view). */
  setText(t: string, parse = true): Promise<void> {
    if (t === this.text) return Promise.resolve();
    this.text = t;
    app.configDirty = t !== this.saved;
    if (parse) return this.reparse();
    this.json = null;
    return Promise.resolve();
  }

  private reset(t: string) {
    this.saved = t;
    this.changedOnDisk = false;
    this.text = t;
    app.configDirty = false;
    void this.reparse();
  }

  async reparse() {
    const src = this.text;
    if (src === null) return;
    const seq = ++this.parseSeq;
    try {
      const json = await invoke<Record<string, unknown>>("config_parse", { src });
      if (seq !== this.parseSeq) return;
      this.json = json;
      this.parseError = null;
    } catch (e) {
      if (seq !== this.parseSeq) return;
      this.json = null;
      this.parseError = String(e);
    }
  }

  /** Apply settings UI edits to the draft. */
  async patch(ops: PatchOp[]) {
    if (this.text === null || !ops.length) return;
    try {
      await this.setText(await invoke<string>("config_patch", { src: this.text, ops }));
      if (this.autoSave) this.scheduleSave();
    } catch (e) {
      this.setStatus(`Cannot apply change: ${e}`, true);
    }
  }

  async save() {
    if (this.text === null) return;
    const src = this.text;
    try {
      await invoke("write_config", { src });
      this.saved = src;
      app.configDirty = this.text !== src;
      this.changedOnDisk = false;
      this.setStatus("Saved");
    } catch (e) {
      this.setStatus(`Not saved: ${e}`, true);
    }
  }

  discard() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.reset(this.saved);
    this.setStatus("Changes discarded");
  }

  async reload() {
    this.reset(await invoke<string>("read_config"));
    this.setStatus("Reloaded from disk");
  }

  private async onDiskChange() {
    const t = await invoke<string>("read_config").catch(() => null);
    if (t === null || t === this.saved) return;
    if (t === this.text) {
      this.saved = t;
      app.configDirty = false;
    } else if (app.configDirty) this.changedOnDisk = true;
    else this.reset(t);
  }
}

export const settingsDoc = new SettingsDoc();
