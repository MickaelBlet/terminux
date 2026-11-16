import { describe, expect, it } from "vitest";
import { eventKey } from "./keys";

const ev = (code: string, key: string) => ({ code, key }) as KeyboardEvent;

describe("eventKey", () => {
  it("uses the physical position for letters and digits", () => {
    expect(eventKey(ev("KeyQ", "a"))).toBe("q");
    expect(eventKey(ev("Digit1", "&"))).toBe("1");
  });
  it("keeps numpad digits even with NumLock off", () => {
    expect(eventKey(ev("Numpad2", "ArrowDown"))).toBe("numpad_2");
  });
  it("trusts the keysym for named keys (legacy XFree86 keycodes, e.g. Citrix)", () => {
    expect(eventKey(ev("NumpadEnter", "ArrowDown"))).toBe("arrowdown");
    expect(eventKey(ev("NumpadDivide", "ArrowUp"))).toBe("arrowup");
    expect(eventKey(ev("AltRight", "ArrowLeft"))).toBe("arrowleft");
  });
  it("maps NumpadEnter to enter", () => {
    expect(eventKey(ev("NumpadEnter", "Enter"))).toBe("enter");
  });
});
