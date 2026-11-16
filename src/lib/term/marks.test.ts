import { describe, expect, it } from "vitest";
import { referenceLine, targetLine } from "./marks";

describe("referenceLine", () => {
  it("uses the cursor line when not scrolled back", () => {
    expect(referenceLine({ viewportY: 100, baseY: 100, cursorLine: 130 })).toBe(130);
  });
  it("uses the viewport top when scrolled back", () => {
    expect(referenceLine({ viewportY: 40, baseY: 100, cursorLine: 130 })).toBe(40);
  });
  it("keeps the last target while the viewport has not moved", () => {
    expect(referenceLine({ viewportY: 100, baseY: 100, cursorLine: 130, nav: { line: 120, viewportY: 100 } })).toBe(120);
  });
  it("ignores the last target once the viewport moved", () => {
    expect(referenceLine({ viewportY: 50, baseY: 100, cursorLine: 130, nav: { line: 120, viewportY: 100 } })).toBe(50);
  });
});

describe("targetLine", () => {
  const prompts = [10, 60, 115, 125, 130];
  it("goes to the last command from the current prompt, even on the bottom screen", () => {
    expect(targetLine(prompts, 130, "previous")).toBe(125);
    expect(targetLine(prompts, 125, "previous")).toBe(115);
  });
  it("handles next / first / last and empty lists", () => {
    expect(targetLine(prompts, 60, "next")).toBe(115);
    expect(targetLine(prompts, 130, "next")).toBeNull();
    expect(targetLine(prompts, 0, "first")).toBe(10);
    expect(targetLine(prompts, 0, "last")).toBe(130);
    expect(targetLine([], 0, "previous")).toBeNull();
  });
});
