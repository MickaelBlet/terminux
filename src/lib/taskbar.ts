// Pure helpers for the window's taskbar state: aggregated progress and attention requests.
import type { Progress } from "./osc";

/** Most significant first: error, paused, normal, indeterminate. */
const RANK: Record<Progress["state"], number> = { 2: 0, 4: 1, 1: 2, 3: 3 };

/** One taskbar progress for all panes: worst state wins, lowest value among equals. */
export function aggregateProgress(list: (Progress | null | undefined)[]): Progress | null {
  let best: Progress | null = null;
  for (const p of list) {
    if (!p) continue;
    if (!best || RANK[p.state] < RANK[best.state] || (p.state === best.state && p.value < best.value)) best = p;
  }
  return best;
}

/** A finished command alerts when it ran at least `thresholdSec` (0: off) and the user could not see it end. */
export function shouldAlertCommand(durationMs: number, thresholdSec: number | undefined, visible: boolean, focused: boolean): boolean {
  const t = Number(thresholdSec ?? 0);
  if (!(t > 0) || durationMs < t * 1000) return false;
  return !focused || !visible;
}

export type AttentionKind = "informational" | "critical";

export function attentionType(v: unknown): AttentionKind {
  return typeof v === "string" && v.toLowerCase() === "critical" ? "critical" : "informational";
}

/** "1m 05s" / "12s". */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
