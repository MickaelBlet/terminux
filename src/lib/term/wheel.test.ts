import { describe, expect, it } from "vitest";
import { WHEEL_LEFT, WHEEL_UP, encodeWheel, sgrModeChange, wheelAxis, wheelSteps } from "./wheel";

const none = { shift: false, alt: false, ctrl: false };

describe("wheelAxis", () => {
  it("leaves plain vertical scrolling to xterm", () => {
    expect(wheelAxis({ deltaX: 0, deltaY: 100, deltaMode: 0, shiftKey: false })).toBeNull();
  });
  it("detects horizontal scrolling", () => {
    expect(wheelAxis({ deltaX: -30, deltaY: 2, deltaMode: 0, shiftKey: false })).toEqual({ axis: "x", delta: -30 });
  });
  it("keeps Shift+wheel vertical even when Chromium swaps axes", () => {
    expect(wheelAxis({ deltaX: 100, deltaY: 0, deltaMode: 0, shiftKey: true })).toEqual({ axis: "y", delta: 100 });
    expect(wheelAxis({ deltaX: 0, deltaY: -100, deltaMode: 0, shiftKey: true })).toEqual({ axis: "y", delta: -100 });
  });
});

describe("wheelSteps", () => {
  it("accumulates pixel deltas", () => {
    let r = wheelSteps(10, 0, 20, 24, 1, 0);
    expect(r.steps).toBe(0);
    r = wheelSteps(30, 0, 20, 24, 1, r.partial);
    expect(r).toEqual({ steps: 2, partial: 0 });
  });
  it("handles line and page modes", () => {
    expect(wheelSteps(-3, 1, 20, 24, 1, 0).steps).toBe(-3);
    expect(wheelSteps(1, 2, 20, 24, 1, 0).steps).toBe(24);
  });
});

describe("encodeWheel", () => {
  it("encodes SGR", () => {
    expect(encodeWheel(WHEEL_LEFT, none, 5, 7, true)).toBe("\x1b[<66;5;7M");
    expect(encodeWheel(WHEEL_UP, { ...none, shift: true }, 1, 1, true)).toBe("\x1b[<68;1;1M");
  });
  it("encodes legacy and drops out-of-range cells", () => {
    expect(encodeWheel(WHEEL_UP, none, 1, 1, false)).toBe("\x1b[M\x60\x21\x21");
    expect(encodeWheel(WHEEL_UP, none, 300, 1, false)).toBe("");
  });
});

describe("sgrModeChange", () => {
  it("tracks 1006 only", () => {
    expect(sgrModeChange([1000, 1006], true, false)).toBe(true);
    expect(sgrModeChange([1006], false, true)).toBe(false);
    expect(sgrModeChange([25], false, true)).toBe(true);
  });
});
