// Regenerate the documentation screenshots in docs/images/.
//
//   npm run dev -- --port 1420 &          # Vite dev server (frontend only, no Tauri)
//   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core node scripts/screenshots/shoot.mjs [name...]
//
// The Tauri IPC is mocked in the page (mock.js), so the real frontend renders with fake PTYs.
import { createRequire } from "node:module";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const out = path.join(root, "docs/images");
const URL = process.env.TERMINUX_URL ?? "http://127.0.0.1:1420/";
mkdirSync(out, { recursive: true });

const MOCK = readFileSync(path.join(here, "mock.js"), "utf8");
const CONFIG_TEXT = readFileSync(path.join(here, "config.toml"), "utf8");

const profile = (id, name, extra = {}) => ({ id, name, cmd: "zsh", args: [], env: {}, hidden: false, ...extra });
const baseConfig = () => ({
  default_profile: "shell",
  font_size: 14,
  scrollback: 100000,
  notifications: true,
  copy_on_select: false,
  middle_click_paste: true,
  right_click_paste: true,
  show_zoom_badge: true,
  defaults: {},
  profiles: [
    profile("shell", "Shell", { icon: "terminal" }),
    profile("claude", "Claude", { icon: "sparkle", tab_color: "#d97757" }),
    profile("opencode", "OpenCode", { icon: "command", tab_color: "#22d3ee" }),
    profile("agent", "Docker Agent", { icon: "window", tab_color: "#3b82f6" }),
    profile("ssh", "ssh prod-01", { icon: "globe", source: "ssh" }),
    profile("top", "htop", { icon: "sliders" }),
  ],
  schemes: [],
  ui_themes: [],
  actions: [
    { id: "user.git_status", name: "Git status", command: "send_input", input: "git status\r", icon: "history" },
    { name: "Run tests", command: "send_input", input: "npx vitest run\r" },
    { name: "Rust tests", command: "send_input", input: "cargo test --manifest-path src-tauri/Cargo.toml\r" },
    { name: "Dev server", command: "send_input", input: "npm run tauri dev\r" },
    { name: "Docker build (Linux)", command: "send_input", input: "scripts/build-linux.sh\r" },
    { name: "Follow logs", command: "send_input", input: "journalctl --user -f\r" },
  ],
  keys: {},
  theme: {},
  disabled_profile_sources: [],
});

/** Each scene builds UI state through the real App (`app.run(...)`), then returns the clip. */
const SCENES = {
  async hero(p) {
    await queue(p, ["claude", "shell", "opencode"]);
    await run(p, { command: "new_tab", profile: "claude" });
    await run(p, { command: "split_pane", split: "right", size: 0.45, profile: "shell" });
    await run(p, { command: "split_pane", split: "down", profile: "opencode" });
    await extraTabs(p);
    await focusFirst(p);
  },
  async tabs(p) {
    await extraTabs(p);
    await p.evaluate(() => window.__mockEmit("\x1b]9;4;1;60\x07"));
    await evalApp(p, (app) => {
      app.renameTab(1, "build");
      app.setTabColor(2, "#a855f7");
    });
    await run(p, { command: "switch_to_tab", index: 1 });
    return { height: 72 };
  },
  async "tab-context-menu"(p) {
    await extraTabs(p);
    const tab = p.locator("header .tabs .tab").nth(1);
    await tab.click({ button: "right" });
    return { height: 520, width: 700 };
  },
  async "vertical-tabs"(p) {
    await extraTabs(p, 5);
    await evalApp(p, (app) => app.setTabPosition("left"));
  },
  async panes(p) {
    await queue(p, ["git", "top", "tests", "logs"]);
    await run(p, { command: "new_tab" });
    await run(p, { command: "split_pane", split: "right", profile: "top" });
    await run(p, { command: "move_focus", direction: "left" });
    await run(p, { command: "split_pane", split: "down" });
    await run(p, { command: "move_focus", direction: "right" });
    await run(p, { command: "split_pane", split: "down" });
  },
  async palette(p) {
    await run(p, { command: "command_palette" });
    await p.keyboard.type("split", { delay: 20 });
  },
  async "palette-command-line"(p) {
    await run(p, { command: "command_palette" });
    await p.keyboard.press("Backspace");
    await p.keyboard.type("nt -p claude ; sp -V -s .4 -p shell", { delay: 10 });
  },
  async "new-tab-menu"(p) {
    const btn = p.locator("[title*='ew tab' i], .new-tab, button.dropdown").first();
    await run(p, { command: "open_new_tab_dropdown" }).catch(() => {});
    if (!(await p.locator(".menu").count())) await btn.click({ button: "right" }).catch(() => {});
    return { height: 520, width: 720 };
  },
  async find(p) {
    await queue(p, ["history"]);
    await run(p, { command: "new_tab" });
    await run(p, { command: "find" });
    await p.keyboard.type("cargo", { delay: 20 });
  },
  async "shell-integration"(p) {
    await setConfig(p, { defaults: { show_marks_on_scrollbar: true, scrollbar_state: "visible" } });
    await queue(p, ["history"]);
    await run(p, { command: "new_tab" });
    await run(p, { command: "scroll_to_mark", direction: "previous" });
    await run(p, { command: "scroll_to_mark", direction: "previous" });
    await run(p, { command: "select_output", direction: "prev" }).catch(() => {});
  },
  async suggestions(p) {
    await queue(p, ["history"]);
    await run(p, { command: "new_tab" });
    await run(p, { command: "show_suggestions" });
  },
  async "mark-mode"(p) {
    await queue(p, ["history"]);
    await run(p, { command: "new_tab" });
    await p.waitForTimeout(800);
    await run(p, { command: "mark_mode" });
    for (let i = 0; i < 7; i++) await p.keyboard.press("Shift+ArrowUp");
    await p.keyboard.press("Shift+Home");
  },
  async snippets(p) {
    await run(p, { command: "split_pane", type: "snippets", split: "right", size: 0.3 });
  },
  async "tab-switcher"(p) {
    await extraTabs(p, 4);
    await evalApp(p, (app) => (app.config.tab_switcher_mode = "mru"));
    await p.keyboard.down("Control");
    await p.keyboard.press("Tab");
    await p.waitForTimeout(150);
    await shotNow(p, "tab-switcher");
    await p.keyboard.up("Control");
    return "done";
  },
  async "config-editor"(p) {
    await run(p, { command: "open_settings" });
    await p.waitForTimeout(1500);
    const editor = p.locator(".cm-content").first();
    await editor.click();
    await p.keyboard.press("Control+End");
    await p.keyboard.type("\ntab_", { delay: 30 });
    await p.keyboard.press("Control+Space");
  },
  async "toolbar-menu"(p) {
    const tb = p.locator("header .actions").first();
    await tb.locator("button").first().click({ button: "right" });
    return { x: 700, width: 580, height: 260 };
  },
  async broadcast(p) {
    await queue(p, ["shell", "shell", "shell"]);
    await run(p, { command: "new_tab", profile: "ssh" });
    await run(p, { command: "split_pane", split: "right", profile: "ssh" });
    await run(p, { command: "split_pane", split: "down", profile: "ssh" });
    await run(p, { command: "toggle_broadcast_input" });
    await p.keyboard.type("uptime", { delay: 20 });
  },
  async zoom(p) {
    await queue(p, ["git", "tests"]);
    await run(p, { command: "new_tab" });
    await run(p, { command: "split_pane", split: "right" });
    await run(p, { command: "toggle_pane_zoom" });
  },
  async "light-theme"(p) {
    await setConfig(p, { app_theme: "light", defaults: { color_scheme: "One Half Light" } });
    await queue(p, ["colors", "git"]);
    await run(p, { command: "new_tab" });
    await run(p, { command: "split_pane", split: "right" });
  },
  async schemes(p) {
    const names = ["Campbell", "One Half Dark", "Solarized Dark", "Tango Dark", "Vintage", "One Half Light"];
    await queue(p, names.map((n) => `colors:${n}`));
    await run(p, { command: "new_tab", color_scheme: names[0] });
    await run(p, { command: "split_pane", split: "right", color_scheme: names[1] });
    await run(p, { command: "split_pane", split: "right", color_scheme: names[2] });
    await run(p, { command: "move_focus", direction: "first" }).catch(() => {});
    const panes = await evalApp(p, (app) => Object.keys(app.panes));
    // second row
    await evalApp(p, (app, ids) => app.focusPane(ids[0]), panes);
    await run(p, { command: "split_pane", split: "down", color_scheme: names[3] });
    await evalApp(p, (app, ids) => app.focusPane(ids[1]), panes);
    await run(p, { command: "split_pane", split: "down", color_scheme: names[4] });
    await evalApp(p, (app, ids) => app.focusPane(ids[2]), panes);
    await run(p, { command: "split_pane", split: "down", color_scheme: names[5] });
  },
  async "file-links"(p) {
    await queue(p, ["build"]);
    await run(p, { command: "new_tab" });
    await p.waitForTimeout(400);
    await closeFirst(p);
    const pos = await cellOf(p, "src/lib/layout/tree.test.ts:48:31");
    await p.mouse.move(pos.x + 60, pos.y);
    await p.keyboard.down("Control");
    await p.waitForTimeout(700);
    await shotNow(p, "file-links", { width: 1280, height: 380 });
    await p.keyboard.up("Control");
    return "done";
  },
  async "file-editor"(p) {
    await queue(p, ["build"]);
    await run(p, { command: "new_tab" });
    await evalApp(p, (app) => app.openFileBuiltin("/home/dev/src/terminux/src-tauri/src/pty.rs", 212, 17));
    await p.waitForTimeout(1500);
  },
  async "copy-toast"(p) {
    await queue(p, ["shell"]);
    await run(p, { command: "new_tab" });
    await p.waitForTimeout(400);
    await evalApp(p, (app) => {
      const t = app.session.term;
      const buf = t.buffer.active;
      for (let y = 0; y < buf.length; y++) {
        const x = buf.getLine(y)?.translateToString().indexOf("modified:   src/lib/state.svelte.ts") ?? -1;
        if (x >= 0) return t.select(x + 12, y, 23);
      }
    });
    await run(p, { command: "copy", dismiss_selection: false });
    await p.waitForTimeout(300);
  },
  async "icon-completion"(p) {
    await run(p, { command: "open_settings" });
    await p.waitForTimeout(1500);
    await p.locator(".cm-content").first().click();
    // After the [defaults] table (line 13), so the completion list has room below.
    await p.keyboard.press("Control+Home");
    for (let i = 0; i < 12; i++) await p.keyboard.press("ArrowDown");
    await p.keyboard.press("End");
    await p.keyboard.type('\n\n[[profile]]\nid = "wsl"\nname = "Ubuntu"\nicon = "pengu', { delay: 30 });
    await p.keyboard.press("Control+Space");
    await p.waitForTimeout(400);
    return { height: 440 };
  },
  async "focus-mode"(p) {
    await queue(p, ["git", "tests"]);
    await run(p, { command: "new_tab" });
    await run(p, { command: "split_pane", split: "right" });
    await run(p, { command: "toggle_focus_mode" });
  },
};

// --- helpers ---
const evalApp = (p, fn, arg) =>
  p.evaluate(
    async ([src, a]) => {
      // Import the instance the page actually loaded (HMR may have added a ?t= query).
      const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.includes("/src/lib/state.svelte.ts"));
      const { app } = await import(urls.at(-1) ?? "/src/lib/state.svelte.ts");
      return new Function("app", "a", `return (${src})(app, a)`)(app, a);
    },
    [fn.toString(), arg],
  );
async function run(p, spec) {
  const r = await evalApp(p, (app, s) => app.run(s), spec);
  await p.waitForTimeout(200);
  return r;
}
const queue = (p, keys) => p.evaluate((k) => window.__mockNext.push(...k), keys);
async function setConfig(p, patch) {
  await p.evaluate((pt) => Object.assign(window.__mockConfig, pt), patch);
  await evalApp(p, (app) => app.setConfig(structuredClone(window.__mockConfig)));
  await p.waitForTimeout(300);
}
async function extraTabs(p, n = 4) {
  const order = ["claude", "opencode", "shell", "top", "ssh"];
  const list = order.slice(0, n);
  await queue(p, list);
  for (const id of list) await run(p, { command: "new_tab", profile: id });
  await evalApp(p, (app) => {
    const t = app.tabs[0];
    if (t && app.tabs.length > 1 && !t.renamed) app.closeTab(0, { force: true, record: false });
  });
}
/** Viewport center of the first cell of `text` in the active terminal. */
const cellOf = (p, text) =>
  evalApp(p, (app, s) => {
    const t = app.session.term;
    const buf = t.buffer.active;
    const cell = t._core._renderService.dimensions.css.cell;
    const r = t.element.querySelector(".xterm-screen").getBoundingClientRect();
    for (let y = buf.viewportY; y < buf.viewportY + t.rows; y++) {
      const x = buf.getLine(y)?.translateToString().indexOf(s) ?? -1;
      if (x >= 0) return { x: r.left + (x + 0.5) * cell.width, y: r.top + (y - buf.viewportY + 0.5) * cell.height };
    }
    throw new Error(`text not on screen: ${s}`);
  }, text);
async function closeFirst(p) {
  await evalApp(p, (app) => app.tabs.length > 1 && app.closeTab(0, { force: true, record: false }));
  await p.waitForTimeout(300);
}
async function focusFirst(p) {
  await evalApp(p, (app) => app.gotoTab(0));
}
async function shotNow(p, name, clip) {
  await p.screenshot({ path: path.join(out, `${name}.png`), clip: clip ? { x: 0, y: 0, ...clip, width: Math.min(clip.width, 1280 - (clip.x ?? 0)) } : undefined });
  console.log("wrote", `docs/images/${name}.png`);
}

const browser = await chromium.launch();
const only = process.argv.slice(2);
for (const [name, scene] of Object.entries(SCENES)) {
  if (only.length && !only.includes(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.warn(`[${name}] pageerror:`, e.message));
  await page.addInitScript(
    ([mock, cfg, text]) => {
      window.__mockConfig = cfg;
      window.__mockConfigText = text;
      new Function(mock)();
    },
    [MOCK, baseConfig(), CONFIG_TEXT],
  );
  await page.goto(URL);
  await page.waitForSelector(".xterm-screen");
  await page.waitForTimeout(600);
  try {
    const first = await evalApp(page, (app) => app.tabs[0]?.id);
    const r = await scene(page, first);
    if (r !== "done") await evalApp(page, (app, id) => {
      const i = app.tabs.findIndex((t) => t.id === id);
      if (i >= 0 && app.tabs.length > 1 && app.activeTab !== i) app.closeTab(i, { force: true, record: false });
    }, first);
    if (r !== "done") {
      await page.waitForTimeout(500);
      await shotNow(page, name, r && typeof r === "object" ? { width: 1280, height: 800, ...r } : undefined);
    }
  } catch (e) {
    console.warn(`[${name}] failed:`, e.message);
  }
  await ctx.close();
}
await browser.close();
