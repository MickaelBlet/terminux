/** Pure helpers for the config editor's inline color swatches. */

export interface HexColor {
  /** Offset of the `#`. */
  from: number;
  /** Offset just after the last hex digit. */
  to: number;
  hex: string;
}

/** Quoted `"#rgb"`, `"#rgba"`, `"#rrggbb"` or `"#rrggbbaa"` strings in `text`. */
export function findHexColors(text: string, offset = 0): HexColor[] {
  const out: HexColor[] = [];
  const re = /(["'])(#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4}))\1/g;
  for (let m; (m = re.exec(text)); ) {
    const from = offset + m.index + 1;
    out.push({ from, to: from + m[2].length, hex: m[2] });
  }
  return out;
}

/** `#rrggbb` for `<input type="color">` (alpha dropped). */
export function toPickerHex(hex: string): string {
  let h = hex.replace(/^#/, "");
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  return `#${h.slice(0, 6).toLowerCase()}`;
}

/** Picked `#rrggbb` written back in the original's style: keeps alpha and letter case. */
export function fromPickerHex(picked: string, original: string): string {
  const o = original.replace(/^#/, "");
  let rgb = picked.replace(/^#/, "").toLowerCase();
  let alpha = "";
  if (o.length === 4) alpha = o[3] + o[3];
  else if (o.length === 8) alpha = o.slice(6);
  if (o.length <= 4 && [0, 2, 4].every((i) => rgb[i] === rgb[i + 1])) {
    rgb = rgb[0] + rgb[2] + rgb[4];
    alpha = alpha ? alpha[0] : "";
  }
  const upper = /[A-F]/.test(o) && !/[a-f]/.test(o);
  const out = rgb + alpha;
  return `#${upper ? out.toUpperCase() : out}`;
}
