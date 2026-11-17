import { describe, expect, it } from "vitest";
import { paneTitleBarMode, showPaneTitleBar } from "./pane-title";

describe("pane title bar", () => {
  it("parses the mode", () => {
    expect(paneTitleBarMode(undefined)).toBe("never");
    expect(paneTitleBarMode(false)).toBe("never");
    expect(paneTitleBarMode(true)).toBe("always");
    expect(paneTitleBarMode("always")).toBe("always");
    expect(paneTitleBarMode("multiple")).toBe("multiple");
    expect(paneTitleBarMode("bogus")).toBe("never");
  });
  it("decides visibility", () => {
    expect(showPaneTitleBar("never", 3, false)).toBe(false);
    expect(showPaneTitleBar("always", 1, true)).toBe(true);
    expect(showPaneTitleBar("multiple", 1, false)).toBe(false);
    expect(showPaneTitleBar("multiple", 2, false)).toBe(true);
    expect(showPaneTitleBar("multiple", 2, true)).toBe(false);
  });
});
