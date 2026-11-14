// Snippets: `send_input` actions from the config ("tasks"), saved from the terminal.
import { invoke } from "@tauri-apps/api/core";
import type { App } from "./state.svelte";
import type { UserAction } from "./commands";

export const tasks = (app: App): UserAction[] => app.userActions.filter((a) => a.spec.command === "send_input" && typeof a.spec.input === "string");

/** TOML block for a new snippet (JSON string escapes are valid TOML basic strings). */
export function snippetToml(name: string, input: string): string {
  return `\n[[action]]\nname = ${JSON.stringify(name)}\ncommand = "send_input"\ninput = ${JSON.stringify(input)}\n`;
}

/** Insert a block before the first `[keys]` / `[theme]` table so it is not swallowed by them. */
export function insertBlock(src: string, block: string): string {
  const m = /^\[(keys|theme)\]\s*$/m.exec(src);
  if (!m) return src.replace(/\s*$/, "\n") + block;
  return src.slice(0, m.index) + block.replace(/^\n/, "") + "\n" + src.slice(m.index);
}

/**
 * Set a root-level `key = value` (value already TOML-encoded): replaces an existing or commented-out
 * line before the first table, else inserts before the first table.
 */
export function setRootKey(src: string, key: string, value: string): string {
  const table = /^[ \t]*\[/m.exec(src);
  const head = table ? src.slice(0, table.index) : src;
  const tail = table ? src.slice(table.index) : "";
  const line = `${key} = ${value}`;
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const re of [new RegExp(`^${esc}\\s*=.*$`, "m"), new RegExp(`^#\\s*${esc}\\s*=.*$`, "m")]) {
    if (re.test(head)) return head.replace(re, line) + tail;
  }
  return head.replace(/\s*$/, "\n") + line + "\n" + (tail ? "\n" + tail : "");
}

/** Save the selection (or the command being typed) as a snippet in config.toml. */
export async function saveSnippet(app: App) {
  const s = app.session;
  const text = (s?.term.getSelection() || s?.shell.currentCommandLine() || "").trim();
  if (!s || !text) {
    app.toast("Select text or type a command to save it as a snippet.", "warn");
    return false;
  }
  const name = await app.promptText("Save snippet", text.split("\n")[0].slice(0, 40), "Snippet name");
  s.focus();
  if (!name) return;
  try {
    const src = await invoke<string>("read_config");
    await invoke("write_config", { src: insertBlock(src, snippetToml(name, text)) });
    app.toast(`Snippet "${name}" saved`);
  } catch (e) {
    app.toast(`Cannot save snippet: ${e}`, "error");
  }
}
