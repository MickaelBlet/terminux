import { expect, it } from "vitest";
import { dropPanes, type PaneSnapshot, type TabSnapshot } from "./snapshot";

const pane = (id: string, kind: PaneSnapshot["kind"]): PaneSnapshot => ({ id, kind, spec: { profileId: "x" }, title: "", cwd: null, readOnly: false, restore: { buffer: "" } });

it("drops side panes of older versions", () => {
  const t: TabSnapshot = {
    root: { kind: "split", id: "s", dir: "row", sizes: [0.8, 0.2], children: [{ kind: "pane", id: "a" }, { kind: "pane", id: "g" }] },
    active: "g", name: null, color: null,
    panes: [pane("a", "term"), pane("g", "git")],
  };
  expect(dropPanes(t, ["git", "snippets"])).toEqual({ ...t, root: { kind: "pane", id: "a" }, panes: [t.panes[0]], active: "a" });
  expect(dropPanes({ ...t, panes: [pane("a", "snippets"), pane("g", "git")] }, ["git", "snippets"])).toBeNull();
  expect(dropPanes(t, ["snippets"])).toBe(t);
});
