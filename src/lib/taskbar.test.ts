import { describe, expect, it } from "vitest";
import { aggregateProgress, attentionType, formatDuration, shouldAlertCommand } from "./taskbar";

describe("aggregateProgress", () => {
  it("returns null without progress", () => {
    expect(aggregateProgress([null, undefined])).toBeNull();
  });
  it("error wins over everything", () => {
    expect(aggregateProgress([{ state: 1, value: 10 }, { state: 2, value: 80 }, { state: 4, value: 5 }])).toEqual({ state: 2, value: 80 });
  });
  it("paused wins over normal and indeterminate", () => {
    expect(aggregateProgress([{ state: 3, value: 0 }, { state: 4, value: 50 }, { state: 1, value: 10 }])).toEqual({ state: 4, value: 50 });
  });
  it("normal wins over indeterminate, lowest value", () => {
    expect(aggregateProgress([{ state: 3, value: 0 }, { state: 1, value: 70 }, { state: 1, value: 30 }])).toEqual({ state: 1, value: 30 });
  });
});

describe("shouldAlertCommand", () => {
  it("is off with threshold 0 or unset", () => {
    expect(shouldAlertCommand(60_000, 0, false, false)).toBe(false);
    expect(shouldAlertCommand(60_000, undefined, false, false)).toBe(false);
  });
  it("needs the duration", () => {
    expect(shouldAlertCommand(9_000, 10, false, false)).toBe(false);
    expect(shouldAlertCommand(10_000, 10, false, false)).toBe(true);
  });
  it("only when not seen", () => {
    expect(shouldAlertCommand(20_000, 10, true, true)).toBe(false);
    expect(shouldAlertCommand(20_000, 10, true, false)).toBe(true);
    expect(shouldAlertCommand(20_000, 10, false, true)).toBe(true);
  });
});

it("attentionType", () => {
  expect(attentionType("Critical")).toBe("critical");
  expect(attentionType("x")).toBe("informational");
  expect(attentionType(undefined)).toBe("informational");
});

it("formatDuration", () => {
  expect(formatDuration(12_400)).toBe("12s");
  expect(formatDuration(65_000)).toBe("1m 05s");
  expect(formatDuration(3_720_000)).toBe("1h 02m");
});
