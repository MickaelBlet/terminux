// Browser-side mock of the Tauri IPC used by the Terminux frontend.
// Injected with Playwright `addInitScript` before the app loads; see shoot.mjs.
// Fake PTYs replay canned ANSI output per profile so screenshots are reproducible.
(() => {
  const E = "\x1b";
  const BEL = "\x07";
  const c = (code, s) => `${E}[${code}m${s}${E}[0m`;
  const osc = (s) => `${E}]${s}${BEL}`;
  const CWD = "/home/dev/src/terminux";

  const prompt = (dir = "~/src/terminux", branch = "main") =>
    osc("133;A") + c("1;32", "dev@workstation") + " " + c("1;34", dir) + " " + c("35", ` ${branch}`) + "\r\n" + c("1;36", "❯") + " " + osc("133;B");
  const cmd = (line, out, code = 0, dir, branch) =>
    prompt(dir, branch) + line + "\r\n" + osc("133;C") + out + osc(`133;D;${code}`) + osc(`7;file://workstation${CWD}`);

  const ls =
    [
      c("1;34", "docs") + "  " + c("1;34", "scripts") + "  " + c("1;34", "src") + "  " + c("1;34", "src-tauri") + "  " + c("1;34", "static"),
      "CLAUDE.md  README.md  package.json  package-lock.json  svelte.config.js  tsconfig.json  vite.config.js",
    ].join("\r\n") + "\r\n";
  const gitStatus =
    "On branch main\r\nChanges not staged for commit:\r\n" +
    c("31", "\tmodified:   src/lib/state.svelte.ts") + "\r\n" +
    c("31", "\tmodified:   src/lib/ui/TabBar.svelte") + "\r\n\r\nUntracked files:\r\n" +
    c("31", "\tdocs/") + "\r\n";
  const gitLog = [
    [c("33", "a3f9c12"), c("1;36", "(HEAD -> main)"), "Add vertical tabs collapse button"],
    [c("33", "7be01d4"), "", "Quake mode: animate from the top edge"],
    [c("33", "41c8e9a"), "", "Shell integration: recent command suggestions"],
    [c("33", "e02d77f"), "", "Palette: command-line mode without leading >"],
    [c("33", "9d1a3b0"), "", "Snippets pane"],
  ].map((r) => r.filter(Boolean).join(" ")).join("\r\n") + "\r\n";
  const tests =
    c("1;42;30", " RUN ") + " v4 " + c("2", CWD) + "\r\n\r\n" +
    [" ✓ src/lib/layout/tree.test.ts (14 tests)", " ✓ src/lib/commands.test.ts (9 tests)", " ✓ src/lib/config-schema.test.ts (12 tests)", " ✓ src/lib/helpers.test.ts (31 tests)", " ✓ src/lib/toolbar.test.ts (7 tests)"]
      .map((l) => c("32", l)).join("\r\n") +
    "\r\n\r\n " + c("2", "Test Files") + "  " + c("1;32", "7 passed") + " (7)\r\n      " + c("2", "Tests") + "  " + c("1;32", "80 passed") + " (80)\r\n";

  const bar = (label, pct, color) => {
    const n = Math.round(pct * 0.3);
    return c("1;36", label.padStart(3)) + "[" + c(color, "|".repeat(n)) + " ".repeat(30 - n) + c("2", `${pct.toFixed(1)}%`.padStart(6)) + "]";
  };
  const top =
    `${E}[?25l` +
    bar("0", 42.1, "32") + "   " + bar("1", 17.4, "32") + "\r\n" +
    bar("2", 63.0, "33") + "   " + bar("3", 8.9, "32") + "\r\n" +
    c("1;36", "Mem") + "[" + c("32", "||||||||||||||||") + c("34", "|||||") + c("33", "||||") + "         " + c("2", "7.84G/15.5G") + "]\r\n\r\n" +
    c("30;42", "    PID USER      PRI  NI  VIRT   RES   SHR S  CPU% MEM%   TIME+  Command                 ") + "\r\n" +
    [
      ["  41237", "dev", "20", "0", "1.2G", "312M", "98M", "S", "38.2", "2.0", "4:12.08", "terminux"],
      ["  41301", "dev", "20", "0", "742M", "188M", "61M", "S", "12.5", "1.2", "1:03.44", "node vite dev"],
      ["  40112", "dev", "20", "0", "98M", "22M", "9M", "S", "3.1", "0.1", "0:22.91", "zsh"],
      ["  39981", "dev", "20", "0", "2.1G", "640M", "120M", "S", "2.7", "4.1", "9:41.17", "rust-analyzer"],
      ["   1024", "root", "20", "0", "56M", "12M", "8M", "S", "0.3", "0.1", "0:04.02", "systemd-journald"],
    ].map((r, i) => {
      const line = `${r[0]} ${r[1].padEnd(8)} ${r[2].padStart(3)} ${r[3].padStart(3)} ${r[4].padStart(5)} ${r[5].padStart(5)} ${r[6].padStart(5)} ${r[7]} ${r[8].padStart(5)} ${r[9].padStart(4)} ${r[10].padStart(8)}  ${r[11]}`;
      return i === 0 ? c("1", line) : line;
    }).join("\r\n") + "\r\n";

  const agent = (name, color) =>
    c(color, "╭" + "─".repeat(58) + "╮") + "\r\n" +
    c(color, "│") + " " + c("1", `${name} session`) + " ".repeat(49 - name.length) + c(color, "│") + "\r\n" +
    c(color, "│") + c("2", `   cwd: ${CWD}`.padEnd(58)) + c(color, "│") + "\r\n" +
    c(color, "╰" + "─".repeat(58) + "╯") + "\r\n\r\n" +
    c("1", "> ") + "Add a screenshot section to the README\r\n\r\n" +
    c(color, "●") + " Reading " + c("1", "README.md") + c("2", " (93 lines)") + "\r\n" +
    c(color, "●") + " Reading " + c("1", "docs/user-guide/02-getting-started.md") + "\r\n" +
    c(color, "●") + " Editing " + c("1", "README.md") + "\r\n" +
    "  " + c("32", "+ ## Screenshots") + "\r\n" +
    "  " + c("32", "+ ![Terminux](docs/images/hero.png)") + "\r\n\r\n" +
    c(color, "●") + " Done. 1 file changed, 4 insertions.\r\n\r\n" +
    c("2", "─".repeat(60)) + "\r\n" + c("1", "> ") + c("2", "Type a message…  (Shift+Enter for a newline)") + "\r\n";

  const logs = [
    ["12:04:31", "INFO ", "32", "vite v8 dev server running at http://127.0.0.1:1420"],
    ["12:04:33", "INFO ", "32", "tauri: watching src-tauri for changes"],
    ["12:04:40", "WARN ", "33", "config: unknown key `tab_widht_mode` (line 12)"],
    ["12:04:41", "INFO ", "32", "config: reloaded ~/.config/terminux/config.toml"],
    ["12:05:02", "ERROR", "31", "pty 7: spawn failed: No such file or directory (cmd: opencode)"],
    ["12:05:05", "INFO ", "32", "pty 8: spawned zsh (pid 41544)"],
    ["12:05:09", "DEBUG", "36", "window 1: session saved (3 tabs, 6 panes)"],
  ].map(([t, l, col, m]) => c("2", t) + " " + c(`1;${col}`, l) + " " + m).join("\r\n") + "\r\n";

  // Long scrollback with several finished commands: used by find / marks screenshots.
  const history = () => {
    let s = cmd("ls", ls) + cmd("git status", gitStatus) + cmd("git log --oneline -5", gitLog);
    s += cmd("git log --oneline -5", gitLog);
    s += cmd("npm run check", c("32", "svelte-check found 0 errors and 0 warnings") + "\r\n");
    s += cmd("cargo build", c("1;31", "error[E0425]") + ": cannot find value `sessoin` in this scope\r\n" + c("1;34", "  --> ") + "src-tauri/src/pty.rs:212:17\r\n" + c("1;31", "error") + ": could not compile `terminux` due to 1 previous error\r\n", 101);
    s += cmd("cargo build", c("1;32", "   Compiling") + " terminux v0.1.0\r\n" + c("1;32", "    Finished") + " `dev` profile in 14.82s\r\n");
    s += cmd("npx vitest run", tests);
    s += cmd("git status", gitStatus);
    return s + prompt();
  };

  // Compiler and test output with file paths: used by the file link screenshots.
  const build = () =>
    cmd("cargo build", c("1;31", "error[E0425]") + c("1", ": cannot find value `sessoin` in this scope") + "\r\n" +
      c("1;34", "   --> ") + "src-tauri/src/pty.rs:212:17\r\n" +
      c("1;34", "    |") + "\r\n" +
      c("1;34", "212 |") + "         let s = sessoin.lock();\r\n" +
      c("1;34", "    |") + c("1;31", "                 ^^^^^^^ help: a local variable with a similar name exists: `session`") + "\r\n\r\n" +
      c("1;31", "error") + c("1", ": could not compile `terminux` (lib) due to 1 previous error") + "\r\n", 101) +
    cmd("npx vitest run src/lib/layout", c("1;41;37", " FAIL ") + " src/lib/layout/tree.test.ts > split > keeps the focused pane\r\n" +
      c("31", "AssertionError: expected 'p2' to be 'p1'") + "\r\n" +
      c("2", " ❯ ") + "src/lib/layout/tree.test.ts:48:31\r\n\r\n " +
      c("2", "Test Files") + "  " + c("1;31", "1 failed") + " (1)\r\n", 1) +
    prompt();

  // Source served by the mocked `file_read` (line 212 is the one in the compiler error).
  const ptySource = () => {
    const head = [
      "// PTY sessions: spawn, stream output over a channel, detach / re-attach.",
      "use std::collections::HashMap;",
      "use std::io::{Read, Write};",
      "use std::sync::{Arc, Mutex};",
      "",
      "use portable_pty::{native_pty_system, CommandBuilder, PtySize};",
      "use tauri::ipc::Channel;",
      "",
      "const BACKLOG_MAX: usize = 8 * 1024 * 1024;",
      "",
    ];
    const lines = [...head];
    let n = 0;
    while (lines.length + 5 <= 186) {
      n++;
      lines.push(`/// Helper ${n}: clamp a terminal dimension to a sane range.`);
      lines.push(`fn clamp_dim_${n}(v: u16) -> u16 {`);
      lines.push("    v.clamp(1, 1000)");
      lines.push("}");
      lines.push("");
    }
    while (lines.length < 186) lines.push("");
    lines.push(
      "struct Session {",
      "    writer: Box<dyn Write + Send>,",
      "    master: Box<dyn portable_pty::MasterPty + Send>,",
      "    channel: Option<Channel<Vec<u8>>>,",
      "    /// Output kept while detached (tab moving to another window).",
      "    backlog: Vec<u8>,",
      "    exit_code: Option<u32>,",
      "}",
      "",
      "",
    );
    lines.push(
      "pub struct PtyManager {",
      "    sessions: Mutex<HashMap<u32, Arc<Mutex<Session>>>>,",
      "    next_id: Mutex<u32>,",
      "}",
      "",
      "impl PtyManager {",
      "    /// Write user input to a session.",
      "    pub fn write(&self, id: u32, data: &[u8]) -> Result<(), String> {",
      "        let session = self",
      "            .sessions",
      "            .lock()",
      "            .unwrap()",
      "            .get(&id)",
      "            .cloned()",
      "            .ok_or(\"no such session\")?;",
      "        let s = sessoin.lock();",
      "        let mut s = s.map_err(|e| e.to_string())?;",
      "        s.writer.write_all(data).map_err(|e| e.to_string())?;",
      "        s.writer.flush().map_err(|e| e.to_string())",
      "    }",
      "",
      "    /// Resize the PTY of a session.",
      "    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> Result<(), String> {",
      "        let size = PtySize { cols, rows, pixel_width: 0, pixel_height: 0 };",
      "        self.with(id, |s| s.master.resize(size).map_err(|e| e.to_string()))",
      "    }",
      "}",
      "",
    );
    return lines.join("\n");
  };

  const OUTPUT = {
    shell: () => cmd("ls", ls) + cmd("git status", gitStatus) + prompt(),
    history,
    git: () => cmd("git log --oneline -5", gitLog) + prompt(),
    tests: () => cmd("npx vitest run", tests) + prompt(),
    build,
    top: () => top,
    logs: () => cmd("tail -f /tmp/terminux-dev.log", logs, 0),
    claude: () => agent("claude", "38;5;173"),
    opencode: () => agent("opencode", "36"),
    agent: () => agent("docker agent", "34"),
    ssh: () => c("2", "Last login: Fri Nov 13 18:22:41 2026 from 10.0.0.12") + "\r\n" + prompt("~", "") .replace("dev@workstation", "deploy@prod-01") + "",
    colors: (name) => {
      let s = name ? c("1", name) + "\r\n" : "";
      for (const [label, base] of [["normal", 30], ["bright", 90]]) {
        s += label.padEnd(7);
        for (let i = 0; i < 8; i++) s += `${E}[${base + i}m██${E}[0m `;
        s += "\r\n";
      }
      return s + cmd("ls", ls) + prompt();
    },
  };
  window.__mockOutput = OUTPUT;
  // Write raw output to the pty of the active pane (falls back to the last spawned one).
  window.__mockEmit = (text) => window.__mockLast && send(window.__mockLast, text);
  window.__mockNext = []; // queue of output keys consumed by the next spawns (overrides profile id)

  // --- IPC internals ---
  const callbacks = new Map();
  let nextCb = 1;
  let nextPty = 1;
  let nextListen = 1;
  const ptys = new Map(); // id -> { ch, index, line }
  const send = (p, text) => {
    const cb = callbacks.get(p.ch);
    if (!cb) return;
    cb({ index: p.index++, message: Array.from(new TextEncoder().encode(text)) });
  };
  const chanId = (v) => (typeof v === "string" ? Number(v.split(":")[1]) : v?.id);

  const cfg = () => window.__mockConfig;
  const winState = { width: 1280, height: 800 };

  async function invoke(cmdName, args = {}) {
    if (window.__mockLog) console.log("[ipc]", cmdName, JSON.stringify(args).slice(0, 200));
    switch (cmdName) {
      case "window_init":
        return { id: 1, name: null, transparent: false, payload: null, grid: null, launch_mode: "default", center: false };
      case "get_config":
        return structuredClone(cfg());
      case "read_config":
        return window.__mockConfigText ?? "";
      case "validate_config":
        return null;
      case "config_path":
        return "/home/dev/.config/terminux/config.toml";
      case "write_config":
      case "session_save":
      case "set_global_shortcuts":
      case "frontend_log":
      case "pty_resize":
      case "pty_kill":
        return null;
      case "pty_cwd":
        return CWD;
      case "file_read":
        return { path: args.path, text: ptySource() };
      case "cli_parse":
        return { window: null, actions: [] };
      case "pty_spawn": {
        const id = nextPty++;
        const p = { ch: chanId(args.onData), index: 0, line: "" };
        ptys.set(id, p);
        const [key, arg] = (window.__mockNext.shift() ?? args.opts?.profileId ?? "shell").split(":");
        const out = (OUTPUT[key] ?? OUTPUT.shell)(arg);
        window.__mockLast = p;
        setTimeout(() => send(p, out), 30);
        return id;
      }
      case "pty_write": {
        const p = ptys.get(args.id);
        if (!p) return null;
        const data = typeof args.data === "string" ? args.data : new TextDecoder().decode(new Uint8Array(args.data));
        for (const ch of data) {
          if (ch === "\r") {
            send(p, "\r\n" + osc("133;C") + osc("133;D;0") + prompt());
            p.line = "";
          } else if (ch === "\x7f") {
            if (p.line) send(p, "\b \b");
            p.line = p.line.slice(0, -1);
          } else if (ch >= " ") {
            p.line += ch;
            send(p, ch);
          }
        }
        return null;
      }
      case "plugin:event|listen":
        return nextListen++;
      case "plugin:window|is_always_on_top":
      case "plugin:window|is_fullscreen":
      case "plugin:window|is_maximized":
      case "plugin:window|is_minimized":
        return false;
      case "plugin:window|is_focused":
      case "plugin:window|is_visible":
        return true;
      case "plugin:window|scale_factor":
        return 1;
      case "plugin:window|inner_size":
      case "plugin:window|outer_size":
        return { width: winState.width, height: winState.height };
      case "plugin:window|inner_position":
      case "plugin:window|outer_position":
        return { x: 0, y: 0 };
      case "plugin:window|title":
        return "Terminux";
      case "plugin:clipboard-manager|read_text":
        return "";
      default:
        return null;
    }
  }

  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    transformCallback(cb, once) {
      const id = nextCb++;
      callbacks.set(id, (m) => {
        if (once) callbacks.delete(id);
        return cb && cb(m);
      });
      return id;
    },
    unregisterCallback(id) {
      callbacks.delete(id);
    },
    runCallback(id, data) {
      callbacks.get(id)?.(data);
    },
    callbacks,
    invoke,
    convertFileSrc: (p) => p,
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
})();
