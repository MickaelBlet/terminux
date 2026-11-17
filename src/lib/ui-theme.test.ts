import { describe, expect, it } from "vitest";
import { UI_THEME_VARS, tabIndicator, uiThemeVars } from "./ui-theme";

describe("ui theme variables", () => {
  it("maps a theme to CSS variables", () => {
    const v = uiThemeVars({
      name: "t",
      tab: { radius: 0, height: 40, indicator: "Underline" },
      tab_row: { background: "terminalBackground" },
      window: { frame: "accent", font: "Inter", font_size: 14 },
      colors: { accent: "#ff0000", border: "#222" },
      pane: { divider: "#333", divider_width: 2 },
    });
    expect(v["--tab-radius"]).toBe("0px");
    expect(v["--tab-height"]).toBe("40px");
    expect(v["--chrome-custom"]).toBeUndefined();
    expect(v["--frame-focus-custom"]).toBe("var(--accent)");
    expect(v["--accent"]).toBe("#ff0000");
    expect(v["--accent-dim"]).toContain("#ff0000");
    expect(v["--border"]).toBe("#222");
    expect(v["--pane-divider-width"]).toBe("2px");
    expect(v["--ui-font"]).toBe("Inter");
    expect(v["--ui-font-size"]).toBe("14px");
    for (const k of Object.keys(v)) expect(UI_THEME_VARS).toContain(k);
  });

  it("ignores invalid values", () => {
    const v = uiThemeVars({ name: "t", colors: { accent: "accent" }, tab: { radius: -1 } });
    expect(v).toEqual({});
    expect(tabIndicator({ name: "t", tab: { indicator: "bogus" } })).toBe("outline");
    expect(tabIndicator({ name: "t", tab: { indicator: "underline" } })).toBe("underline");
  });
});
