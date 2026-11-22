// Wheel handling xterm.js skips: horizontal scrolling and Shift+wheel.

export const WHEEL_UP = 64;
export const WHEEL_DOWN = 65;
export const WHEEL_LEFT = 66;
export const WHEEL_RIGHT = 67;

export type WheelButton = typeof WHEEL_UP | typeof WHEEL_DOWN | typeof WHEEL_LEFT | typeof WHEEL_RIGHT;

export interface WheelMods {
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
}

export interface WheelInput {
  deltaX: number;
  deltaY: number;
  deltaMode: number; // 0 pixel, 1 line, 2 page
  shiftKey: boolean;
}

/**
 * Axis and signed delta of a wheel event, or null when xterm handles it itself.
 * Chromium turns Shift+wheel into a horizontal delta: keep it vertical.
 */
export function wheelAxis(e: WheelInput): { axis: "x" | "y"; delta: number } | null {
  if (e.shiftKey) {
    const delta = e.deltaY || e.deltaX;
    return delta ? { axis: "y", delta } : null;
  }
  if (e.deltaX !== 0 && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return { axis: "x", delta: e.deltaX };
  return null;
}

/** Whole steps for a delta; `partial` carries pixel remainders between events. */
export function wheelSteps(
  delta: number,
  mode: number,
  rowHeight: number,
  rows: number,
  sensitivity: number,
  partial: number,
): { steps: number; partial: number } {
  const d = delta * sensitivity;
  if (mode === 1) return { steps: Math.trunc(d) || Math.sign(d), partial: 0 };
  if (mode === 2) return { steps: Math.trunc(d * rows) || Math.sign(d), partial: 0 };
  const acc = partial + d / Math.max(rowHeight, 1);
  const steps = Math.trunc(acc);
  return { steps, partial: acc - steps };
}

/** Mouse report for a wheel button at a 1-based cell (SGR or legacy X10 encoding). */
export function encodeWheel(button: WheelButton, mods: WheelMods, col: number, row: number, sgr: boolean): string {
  const code = button | (mods.shift ? 4 : 0) | (mods.alt ? 8 : 0) | (mods.ctrl ? 16 : 0);
  if (sgr) return `\x1b[<${code};${col};${row}M`;
  if (code + 32 > 255 || col + 32 > 255 || row + 32 > 255) return "";
  return `\x1b[M${String.fromCharCode(code + 32, col + 32, row + 32)}`;
}

/** DECSET/DECRST params toggling SGR mouse encoding (1006, 1016 pixels treated as cells). */
export function sgrModeChange(params: (number | number[])[], set: boolean, current: boolean): boolean {
  const flat = params.flat();
  return flat.includes(1006) || flat.includes(1016) ? set : current;
}
