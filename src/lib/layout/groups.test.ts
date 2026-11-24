import { describe, expect, it } from "vitest";
import { cycleIn, groupIds, insertIndex, neighborGroup, nthIn, removeGroup, restoreGroups, shownTab, splitGroup, tabsOf } from "./groups";
import { pane, type LayoutNode } from "./tree";

const tabs = [
  { id: "a", groupId: "g1" },
  { id: "b", groupId: "g2" },
  { id: "c", groupId: "g1" },
  { id: "d", groupId: "g2" },
];

describe("tab groups", () => {
  it("lists a group's tabs in row order", () => {
    expect(tabsOf(tabs, "g1").map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("shows the remembered tab, else the first one", () => {
    expect(shownTab(tabs, "g2", "d")?.id).toBe("d");
    expect(shownTab(tabs, "g2", "a")?.id).toBe("b");
    expect(shownTab(tabs, "g3", undefined)).toBeUndefined();
  });

  it("inserts after the given tab or at the group's end", () => {
    expect(insertIndex(tabs, "g1", "a")).toBe(1);
    expect(insertIndex(tabs, "g1", "b")).toBe(3);
    expect(insertIndex(tabs, "g1")).toBe(3);
    expect(insertIndex(tabs, "g3")).toBe(4);
  });

  it("cycles and indexes within a group", () => {
    expect(cycleIn(tabs, "a", 1)?.id).toBe("c");
    expect(cycleIn(tabs, "c", 1)?.id).toBe("a");
    expect(cycleIn(tabs, "b", -1)?.id).toBe("d");
    expect(nthIn(tabs, "g2", 0)?.id).toBe("b");
    expect(nthIn(tabs, "g2", -1)?.id).toBe("d");
    expect(nthIn(tabs, "g2", 5)).toBeUndefined();
  });

  it("splits, finds neighbors and removes groups", () => {
    let l: LayoutNode = splitGroup(pane("g1"), "g1", "right", "g2");
    l = splitGroup(l, "g2", "down", "g3");
    expect(groupIds(l)).toEqual(["g1", "g2", "g3"]);
    expect(neighborGroup(l, "g1")).toBe("g2");
    expect(neighborGroup(l, "g3")).toBe("g1");
    l = removeGroup(l, "g2");
    expect(groupIds(l)).toEqual(["g1", "g3"]);
    expect(removeGroup(pane("g1"), "g1")).toEqual(pane("g1"));
    expect(groupIds(splitGroup(pane("g1"), "g1", "left", "g0"))).toEqual(["g0", "g1"]);
  });

  it("restores a persisted layout, dropping empty and unknown groups", () => {
    const layout = splitGroup(splitGroup(pane("g1"), "g1", "right", "g2"), "g2", "right", "g3");
    const r = restoreGroups({ layout, of: ["g1", "g2", "zz"], active: { g2: 1, g1: 2 } }, 3)!;
    expect(groupIds(r.layout)).toEqual(["g1", "g2"]);
    expect(r.of).toEqual(["g1", "g2", "g1"]);
    expect(r.active).toEqual({ g2: 1, g1: 2 });
  });

  it("restores nothing for one group or bad data", () => {
    expect(restoreGroups(undefined, 2)).toBeNull();
    expect(restoreGroups({ layout: pane("g1"), of: ["g1"], active: {} }, 1)).toBeNull();
    const layout = splitGroup(pane("g1"), "g1", "right", "g2");
    expect(restoreGroups({ layout, of: ["g1", "g1"], active: {} }, 2)).toBeNull();
    expect(restoreGroups({ layout: { kind: "split" } as unknown as LayoutNode, of: [], active: {} }, 1)).toBeNull();
  });
});
