import { describe, expect, it } from "vitest";
import { shiftFor, slotAt } from "./tab-shift";

describe("slotAt", () => {
  const mids = [50, 150, 250];
  it("finds the slot before the first midpoint past the pointer", () => {
    expect(slotAt(mids, 0)).toBe(0);
    expect(slotAt(mids, 100)).toBe(1);
    expect(slotAt(mids, 249)).toBe(2);
  });
  it("clamps to the last slot", () => {
    expect(slotAt(mids, 999)).toBe(2);
    expect(slotAt([], 10)).toBe(0);
  });
});

describe("shiftFor", () => {
  it("slides tabs between from and to toward the gap (forward)", () => {
    expect([0, 1, 2, 3, 4].map((i) => shiftFor(i, 1, 3, 100))).toEqual([0, 0, -100, -100, 0]);
  });
  it("slides tabs between to and from toward the gap (backward)", () => {
    expect([0, 1, 2, 3, 4].map((i) => shiftFor(i, 3, 1, 100))).toEqual([0, 100, 100, 0, 0]);
  });
  it("leaves everything in place when not moved", () => {
    expect([0, 1, 2].map((i) => shiftFor(i, 1, 1, 100))).toEqual([0, 0, 0]);
  });
});
