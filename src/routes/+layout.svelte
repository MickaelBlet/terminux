<script lang="ts">
  import "@xterm/xterm/css/xterm.css";
  import "../app.css";
  import { invoke } from "@tauri-apps/api/core";
  let { children } = $props();

  // Mirror frontend logs/errors to the backend stderr (visible in `tauri dev`).
  const send = (level: string, args: unknown[]) =>
    invoke("frontend_log", { level, msg: args.map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" ") }).catch(() => {});
  for (const level of ["info", "warn", "error"] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => (orig(...args), send(level, args));
  }
  window.addEventListener("error", (e) => send("error", [e.error ?? e.message]));
  window.addEventListener("unhandledrejection", (e) => send("error", [e.reason]));
</script>

{@render children()}
