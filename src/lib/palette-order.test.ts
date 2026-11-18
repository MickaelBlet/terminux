import { describe, expect, it } from "vitest";
import { asRecent, orderItems, pushRecent, sortByLabel } from "./palette-order";

describe("pushRecent", () => {
  it("moves to front, dedupes and caps", () => {
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(pushRecent(["a", "b"], "c", 2)).toEqual(["c", "a"]);
    expect(pushRecent([], "x")).toEqual(["x"]);
  });
});

describe("asRecent", () => {
  it("keeps strings only", () => {
    expect(asRecent(["a", 1, null, "b"])).toEqual(["a", "b"]);
    expect(asRecent("nope")).toEqual([]);
    expect(asRecent(null)).toEqual([]);
  });
});

describe("sortByLabel", () => {
  it("is case-insensitive and numeric", () => {
    expect(sortByLabel(["b", "A", "item 10", "item 2", "a"], (s) => s)).toEqual(["A", "a", "b", "item 2", "item 10"]);
  });
});

describe("orderItems", () => {
  const items = [
    { id: "z", label: "Zoom" },
    { id: "c", label: "Copy" },
    { id: "n", label: "New tab" },
    { id: "a", label: "About" },
  ];
  const key = (it: { id: string }) => it.id;
  const label = (it: { label: string }) => it.label;

  it("puts recent first in recency order, skips unknown keys", () => {
    const r = orderItems(items, key, label, ["n", "gone", "z"], false);
    expect(r.recent.map(key)).toEqual(["n", "z"]);
    expect(r.rest.map(key)).toEqual(["c", "a"]);
  });

  it("sorts the rest alphabetically when asked", () => {
    const r = orderItems(items, key, label, ["c"], true);
    expect(r.recent.map(key)).toEqual(["c"]);
    expect(r.rest.map(label)).toEqual(["About", "New tab", "Zoom"]);
  });

  it("no recent: rest is everything", () => {
    expect(orderItems(items, key, label, [], false).rest).toEqual(items);
  });
});
