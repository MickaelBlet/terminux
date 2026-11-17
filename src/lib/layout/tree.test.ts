import { describe, expect, it } from "vitest";
import { equalize, neighbor, pane, paneIds, rects, remove, resize, split, type LayoutNode } from "./tree";

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("layout tree", () => {
  it("splits a single pane", () => {
    const t = split(pane("a"), "a", "row", "b");
    expect(t.kind).toBe("split");
    expect(paneIds(t)).toEqual(["a", "b"]);
  });

  it("flattens same-direction splits", () => {
    let t: LayoutNode = split(pane("a"), "a", "row", "b");
    t = split(t, "a", "row", "c");
    expect(t.kind === "split" && t.children.length).toBe(3);
    expect(paneIds(t)).toEqual(["a", "c", "b"]);
    expect(t.kind === "split" && sum(t.sizes)).toBeCloseTo(1);
  });

  it("nests opposite-direction splits", () => {
    let t: LayoutNode = split(pane("a"), "a", "row", "b");
    t = split(t, "b", "col", "c");
    const r = rects(t);
    expect(r.get("a")).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(r.get("c")).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });

  it("removes and collapses", () => {
    let t: LayoutNode = split(pane("a"), "a", "row", "b");
    t = split(t, "b", "col", "c");
    const r1 = remove(t, "c")!;
    expect(r1.kind === "split" && r1.children.every((c) => c.kind === "pane")).toBe(true);
    const r2 = remove(r1, "b")!;
    expect(r2).toEqual(pane("a"));
    expect(remove(r2, "a")).toBeNull();
  });

  it("renormalizes sizes after removal", () => {
    let t: LayoutNode = split(pane("a"), "a", "row", "b");
    t = split(t, "b", "row", "c");
    const r = remove(t, "a")!;
    expect(r.kind === "split" && sum(r.sizes)).toBeCloseTo(1);
  });

  it("finds neighbors", () => {
    let t: LayoutNode = split(pane("a"), "a", "row", "b");
    t = split(t, "b", "col", "c");
    expect(neighbor(t, "a", "right")).toBe("b");
    expect(neighbor(t, "c", "left")).toBe("a");
    expect(neighbor(t, "b", "down")).toBe("c");
    expect(neighbor(t, "c", "up")).toBe("b");
    expect(neighbor(t, "a", "left")).toBeNull();
  });

  it("resizes with clamping", () => {
    const t = split(pane("a"), "a", "row", "b");
    const r = resize(t, "a", "right", 0.1);
    expect(r.kind === "split" && r.sizes[0]).toBeCloseTo(0.6);
    const r2 = resize(t, "a", "right", 10);
    expect(r2.kind === "split" && r2.sizes[1]).toBeCloseTo(0.05);
    const r3 = resize(t, "a", "left", 0.1);
    expect(r3.kind === "split" && r3.sizes[0]).toBeCloseTo(0.4);
    const r4 = resize(t, "b", "right", 0.1);
    expect(r4.kind === "split" && r4.sizes[1]).toBeCloseTo(0.4);
    const v = split(pane("a"), "a", "col", "b");
    const r5 = resize(v, "b", "down", 0.1);
    expect(r5.kind === "split" && r5.sizes[1]).toBeCloseTo(0.4);
    const r6 = resize(v, "a", "up", 0.1);
    expect(r6.kind === "split" && r6.sizes[0]).toBeCloseTo(0.4);
    expect(resize(t, "a", "up", 0.1)).toEqual(t);
    expect(equalize(r).kind === "split" && (equalize(r) as any).sizes).toEqual([0.5, 0.5]);
  });
});

import { dock, find, insert, move, parentOf, swap, toggleOrientation } from "./tree";

describe("layout tree (pane operations)", () => {
  it("splits before and with a size", () => {
    const t = split(pane("a"), "a", "row", "b", { before: true, size: 0.3 });
    expect(paneIds(t)).toEqual(["b", "a"]);
    expect(t.kind === "split" && t.sizes[0]).toBeCloseTo(0.3);
  });
  it("swaps panes and subtrees", () => {
    let t: LayoutNode = split(pane("a"), "a", "row", "b");
    t = split(t, "b", "col", "c");
    expect(paneIds(swap(t, "a", "c"))).toEqual(["c", "b", "a"]);
    const sub = parentOf(t, "b")!;
    expect(paneIds(swap(t, "a", sub.id))).toEqual(["b", "c", "a"]);
    expect(swap(t, sub.id, "b")).toBe(t);
  });
  it("toggles orientation and inserts subtrees", () => {
    const t = split(pane("a"), "a", "row", "b");
    const r = toggleOrientation(t, "a");
    expect(r.kind === "split" && r.dir).toBe("col");
    const moved = split(pane("x"), "x", "col", "y");
    const ins = insert(t, "b", "row", moved);
    expect(paneIds(ins)).toEqual(["a", "b", "x", "y"]);
    expect(find(ins, moved.id)).toEqual(moved);
  });
  it("removes a subtree and finds neighbors of a split", () => {
    let t: LayoutNode = split(pane("a"), "a", "row", "b");
    t = split(t, "b", "col", "c");
    const sub = parentOf(t, "c")!;
    expect(neighbor(t, sub.id, "left")).toBe("a");
    expect(remove(t, sub.id)).toEqual(pane("a"));
  });
});

describe("moving panes", () => {
  const row = (...ids: string[]): LayoutNode => ({ kind: "split", id: "r", dir: "row", sizes: ids.map(() => 1 / ids.length), children: ids.map(pane) });
  const shape = (n: LayoutNode): unknown => (n.kind === "pane" ? n.id : { [n.dir]: n.children.map(shape) });

  it("moves a pane next to another", () => {
    expect(shape(move(row("a", "b"), "b", "a", "left"))).toEqual({ row: ["b", "a"] });
    expect(shape(move(row("a", "b", "c"), "c", "b", "left"))).toEqual({ row: ["a", "c", "b"] });
    expect(shape(move(row("a", "b"), "b", "a", "down"))).toEqual({ col: ["a", "b"] });
    expect(shape(move(row("a", "b", "c"), "a", "c", "up"))).toEqual({ row: ["b", { col: ["a", "c"] }] });
  });
  it("keeps sizes summing to 1", () => {
    const r = move(row("a", "b", "c"), "c", "a", "left");
    expect(r.kind === "split" && sum(r.sizes)).toBeCloseTo(1);
  });
  it("ignores no-op moves", () => {
    const t = row("a", "b");
    expect(move(t, "a", "a", "left")).toBe(t);
    expect(move(t, "a", "b", "left")).toBe(t);
    expect(move(t, "a", "x", "left")).toBe(t);
    const nested = split(t, "b", "col", "c");
    const sub = parentOf(nested, "c")!;
    expect(move(nested, sub.id, "c", "up")).toBe(nested);
  });
  it("docks a pane to an outer edge", () => {
    const t = split(row("a", "b"), "b", "col", "c");
    expect(shape(dock(t, "c", "left"))).toEqual({ row: ["c", "a", "b"] });
    expect(shape(dock(t, "c", "down"))).toEqual({ col: [{ row: ["a", "b"] }, "c"] });
    expect(shape(dock(row("a", "b"), "a", "down"))).toEqual({ col: ["b", "a"] });
    const d = dock(t, "c", "right");
    expect(d.kind === "split" && sum(d.sizes)).toBeCloseTo(1);
  });
  it("ignores docking where the pane already is", () => {
    const t = row("a", "b");
    expect(dock(t, "a", "left")).toBe(t);
    expect(dock(t, "b", "right")).toBe(t);
    expect(dock(pane("a"), "a", "left")).toEqual(pane("a"));
  });
});
