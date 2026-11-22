import { describe, expect, it } from "vitest";
import { DEFAULT_SCROLLBAR_WIDTH, revealsOnScroll, scrollbarLook, scrollbarState } from "./scrollbar";

describe("scrollbarState", () => {
  it("maps values", () => {
    expect(scrollbarState(undefined)).toBe("visible");
    expect(scrollbarState("always")).toBe("visible");
    expect(scrollbarState(" Hidden ")).toBe("hidden");
    expect(scrollbarState("auto")).toBe("auto");
    expect(scrollbarState("bogus")).toBe("visible");
  });
});

describe("scrollbarLook", () => {
  it("derives colors from the foreground by default", () => {
    const l = scrollbarLook(undefined, undefined, undefined, "#ffffff");
    expect(l.width).toBe(DEFAULT_SCROLLBAR_WIDTH);
    expect(l.thumb).toBe("rgba(255, 255, 255, 0.300)");
    expect(l.thumbHover).toBe("rgba(255, 255, 255, 0.550)");
  });

  it("uses a custom color", () => {
    const l = scrollbarLook("visible", 12, "#ff0000", "#ffffff");
    expect(l.width).toBe(12);
    expect(l.thumb).toBe("#ff0000");
    expect(l.thumbHover).toContain("#ff0000");
  });

  it("clamps the width and zeroes it when hidden", () => {
    expect(scrollbarLook(undefined, 100, undefined, "#fff").width).toBe(32);
    expect(scrollbarLook(undefined, 0, undefined, "#fff").width).toBe(2);
    expect(scrollbarLook(undefined, NaN, undefined, "#fff").width).toBe(DEFAULT_SCROLLBAR_WIDTH);
    expect(scrollbarLook("hidden", 12, undefined, "#fff").width).toBe(0);
  });
});

describe("revealsOnScroll", () => {
  it("ignores output scrolling at the bottom", () => {
    expect(revealsOnScroll(100, 100, false)).toBe(false);
    expect(revealsOnScroll(90, 100, false)).toBe(true);
    expect(revealsOnScroll(100, 100, true)).toBe(true);
  });
});
