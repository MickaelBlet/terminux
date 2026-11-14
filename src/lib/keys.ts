import { COMMANDS, commandName, specKey, toArray, type ActionSpec, type UserAction } from "./commands";

interface Combo {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

const ALIASES: Record<string, string> = {
  left: "arrowleft",
  right: "arrowright",
  up: "arrowup",
  down: "arrowdown",
  plus: "=",
  minus: "-",
  period: ".",
  comma: ",",
  backquote: "`",
  grave: "`",
  esc: "escape",
  space: " ",
  pgup: "pageup",
  pgdn: "pagedown",
  ins: "insert",
  del: "delete",
  return: "enter",
  menu: "contextmenu",
  app: "contextmenu",
  numpad_add: "numpad_plus",
  numpad_subtract: "numpad_minus",
};

const MODIFIERS = new Set(["ctrl", "control", "shift", "alt", "meta", "super", "cmd", "win"]);

export function parseCombo(s: string): Combo | null {
  const parts = s.split("+").map((p) => p.trim().toLowerCase());
  // "Ctrl++" style
  if (s.trim().endsWith("++")) parts.splice(parts.length - 2, 2, "+");
  const key = parts.pop();
  if (!key || MODIFIERS.has(key)) return null;
  const mods = new Set(parts);
  return {
    ctrl: mods.has("ctrl") || mods.has("control"),
    shift: mods.has("shift"),
    alt: mods.has("alt"),
    meta: mods.has("meta") || mods.has("super") || mods.has("cmd") || mods.has("win"),
    key: ALIASES[key] ?? key,
  };
}

const CODE_KEYS: Record<string, string> = {
  Equal: "=",
  Minus: "-",
  Comma: ",",
  Period: ".",
  Backquote: "`",
  Semicolon: ";",
  Quote: "'",
  Slash: "/",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  NumpadAdd: "numpad_plus",
  NumpadSubtract: "numpad_minus",
  NumpadMultiply: "numpad_multiply",
  NumpadDivide: "numpad_divide",
  NumpadDecimal: "numpad_period",
  NumpadEnter: "enter",
  Space: " ",
};

/** Layout-independent key name for an event. */
export function eventKey(e: KeyboardEvent): string {
  if (e.code.startsWith("Key")) return e.code.slice(3).toLowerCase();
  if (e.code.startsWith("Digit")) return e.code.slice(5);
  if (/^Numpad\d$/.test(e.code)) return `numpad_${e.code.slice(6)}`;
  return CODE_KEYS[e.code] ?? e.key.toLowerCase();
}

/** Key names to try for an event: physical position first, then the produced character (AZERTY "-" …). */
export function eventKeys(e: KeyboardEvent): string[] {
  const byCode = eventKey(e);
  const char = e.key.length === 1 && !/[a-z0-9]/i.test(e.key) ? e.key : null;
  return char && char !== byCode ? [byCode, char] : [byCode];
}

const sig = (c: Combo) => `${+c.ctrl}${+c.shift}${+c.alt}${+c.meta}:${c.key}`;

export class Keymap {
  private map = new Map<string, ActionSpec>(); // signature -> action
  private hints = new Map<string, string>(); // action identity -> first combo
  private named = new Map<string, string[]>(); // command name -> effective combos

  constructor(user: Record<string, string | string[]> = {}, actions: UserAction[] = []) {
    const overrides = new Map<string, string[]>();
    for (const [k, v] of Object.entries(user)) {
      const name = commandName(k);
      if (name) overrides.set(name, toArray(v).filter(Boolean));
    }
    const bind = (combos: string[], spec: ActionSpec) => {
      for (const combo of combos) {
        const c = parseCombo(combo);
        if (c) this.map.set(sig(c), spec);
      }
    };
    // Defaults first so that user bindings win a shared combo.
    for (const [name, c] of Object.entries(COMMANDS)) {
      this.named.set(name, overrides.get(name) ?? c.keys);
      if (!overrides.has(name)) bind(c.keys, c.spec);
    }
    for (const [name, combos] of overrides) bind(combos, COMMANDS[name].spec);
    for (const a of actions) {
      bind(a.keys, a.spec);
      if (a.id && user[a.id] != null) bind(toArray(user[a.id]).filter(Boolean), a.spec);
    }
    const hint = (combos: string[], spec: ActionSpec) => {
      const key = specKey(spec);
      if (this.hints.has(key)) return;
      const live = combos.find((combo) => {
        const c = parseCombo(combo);
        return c && this.map.get(sig(c)) === spec;
      });
      if (live) this.hints.set(key, live);
    };
    for (const [name, combos] of this.named) hint(combos, COMMANDS[name].spec);
    for (const a of actions) hint([...a.keys, ...(a.id ? toArray(user[a.id]) : [])], a.spec);
  }

  match(e: KeyboardEvent): ActionSpec | null {
    for (const key of eventKeys(e)) {
      const spec = this.map.get(sig({ ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, key }));
      if (spec) return spec;
    }
    return null;
  }

  /** Key combo to display next to an action (named command or spec). */
  hint(action: string | ActionSpec): string | undefined {
    const spec = typeof action === "string" ? COMMANDS[commandName(action) ?? ""]?.spec : action;
    return spec ? this.hints.get(specKey(spec)) : undefined;
  }

  /** Effective combos of a named command (for OS-level shortcuts). */
  combos(name: string): string[] {
    return this.named.get(commandName(name) ?? "") ?? [];
  }
}
