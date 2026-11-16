import { describe, expect, it } from "vitest";
import { findHexColors, fromPickerHex, toPickerHex } from "./color-swatch";

describe("findHexColors", () => {
  it("finds quoted hex colors with offsets", () => {
    const text = `cursor_color = "#34d399"\ntab_color = '#FFF'\nx = "#12345" y = "#11223344"`;
    expect(findHexColors(text, 10)).toEqual([
      { from: 10 + 16, to: 10 + 23, hex: "#34d399" },
      { from: 10 + 38, to: 10 + 42, hex: "#FFF" },
      { from: 10 + 62, to: 10 + 71, hex: "#11223344" },
    ]);
  });
  it("ignores unquoted and mismatched quotes", () => {
    expect(findHexColors(`# comment #fff\nx = "#fff'`)).toEqual([]);
  });
});

describe("toPickerHex", () => {
  it("expands and drops alpha", () => {
    expect(toPickerHex("#ABC")).toBe("#aabbcc");
    expect(toPickerHex("#abcd")).toBe("#aabbcc");
    expect(toPickerHex("#112233ff")).toBe("#112233");
  });
});

describe("fromPickerHex", () => {
  it("keeps alpha and case", () => {
    expect(fromPickerHex("#a1b2c3", "#000000")).toBe("#a1b2c3");
    expect(fromPickerHex("#a1b2c3", "#ABCDEF")).toBe("#A1B2C3");
    expect(fromPickerHex("#a1b2c3", "#00000080")).toBe("#a1b2c380");
  });
  it("keeps short form when possible", () => {
    expect(fromPickerHex("#aabbcc", "#fff")).toBe("#abc");
    expect(fromPickerHex("#aabbcc", "#fff8")).toBe("#abc8");
    expect(fromPickerHex("#a1b2c3", "#fff8")).toBe("#a1b2c388");
  });
});
