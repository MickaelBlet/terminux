import { describe, expect, it } from "vitest";
import { dropZone, zoneBox } from "./pane-drag";

const r = { left: 100, top: 50, width: 400, height: 200 };

describe("pane drop zones", () => {
  it("picks the closest edge within the band", () => {
    expect(dropZone(r, 110, 150)).toBe("left");
    expect(dropZone(r, 490, 150)).toBe("right");
    expect(dropZone(r, 300, 60)).toBe("up");
    expect(dropZone(r, 300, 240)).toBe("down");
    expect(dropZone(r, 105, 55)).toBe("left");
  });
  it("uses the center otherwise", () => {
    expect(dropZone(r, 300, 150)).toBe("center");
  });
  it("highlights half the pane for an edge", () => {
    expect(zoneBox(400, 200, "right")).toEqual({ left: 200, top: 0, width: 200, height: 200 });
    expect(zoneBox(400, 200, "center")).toEqual({ left: 0, top: 0, width: 400, height: 200 });
  });
});
