// Vector screenshots: serialize the live DOM to SVG (dom-to-svg), then embed subsets of the
// bundled fonts so text renders the same everywhere (GitHub loads SVG in <img>: no external fetches).
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * dom-to-svg draws every box as a <rect> with the top-left radius on all four corners, a uniform
 * border as a stroke centered on the edge (half of it outside the box) and other borders as
 * straight lines without radius. Replace that with paths: per-corner (elliptical) radii, the
 * background clipped like `background-clip`, borders as filled rings with per-side widths.
 */
const BOX_HELPERS = String.raw`
const __corners = (styles, bounds) => {
  const f = calculateOverlappingCurvesFactor(styles, bounds);
  return ["top-left", "top-right", "bottom-right", "bottom-left"].map((c) => {
    const [h, v = h] = styles.getPropertyValue("border-" + c + "-radius").split(" ");
    return [(parseCSSLength(h, bounds.width) || 0) * f, (parseCSSLength(v, bounds.height) || 0) * f];
  });
};
const __widths = (styles) => ["top", "right", "bottom", "left"].map((s) => {
  const style = styles.getPropertyValue("border-" + s + "-style");
  return style === "none" || style === "hidden" ? 0 : parseFloat(styles.getPropertyValue("border-" + s + "-width")) || 0;
});
// Rounded rectangle; radii [[rx, ry] x tl, tr, br, bl].
const __rrect = (x, y, w, h, r) => {
  if (w <= 0 || h <= 0) return "";
  const [tl, tr, br, bl] = r.map(([rx, ry]) => [Math.max(0, Math.min(rx, w)), Math.max(0, Math.min(ry, h))]);
  const a = ([rx, ry], ex, ey) => (rx && ry ? "A" + rx + " " + ry + " 0 0 1 " + ex + " " + ey : "L" + ex + " " + ey);
  return "M" + (x + tl[0]) + " " + y + "H" + (x + w - tr[0]) + a(tr, x + w, y + tr[1]) + "V" + (y + h - br[1]) +
    a(br, x + w - br[0], y + h) + "H" + (x + bl[0]) + a(bl, x, y + h - bl[1]) + "V" + (y + tl[1]) + a(tl, x + tl[0], y) + "Z";
};
// Contour inset by [top, right, bottom, left] (CSS inner border radius: outer radius - adjacent width).
const __inset = (bounds, r, [t, rt, b, l]) => __rrect(bounds.x + l, bounds.y + t, bounds.width - l - rt, bounds.height - t - b, [
  [r[0][0] - l, r[0][1] - t], [r[1][0] - rt, r[1][1] - t], [r[2][0] - rt, r[2][1] - b], [r[3][0] - l, r[3][1] - b],
]);
function createBackgroundAndBorderBox(bounds, styles, context) {
  const box = context.svgDocument.createElementNS(svgNamespace, "path");
  const r = __corners(styles, bounds);
  const w = __widths(styles);
  const clip = styles.backgroundClip;
  const d = clip === "padding-box" ? __inset(bounds, r, w)
    : clip === "content-box" ? __inset(bounds, r, w.map((v, i) => v + parseFloat(styles.getPropertyValue("padding-" + ["top", "right", "bottom", "left"][i]))))
    : __rrect(bounds.x, bounds.y, bounds.width, bounds.height, r);
  box.setAttribute("d", d || "M0 0");
  box.setAttribute("fill", isTransparent(styles.backgroundColor) ? "none" : styles.backgroundColor);
  return box;
}
function __borderRings(bounds, styles, context) {
  const r = __corners(styles, bounds);
  const w = __widths(styles);
  const sides = ["top", "right", "bottom", "left"];
  const byColor = new Map();
  sides.forEach((s, i) => {
    const color = styles.getPropertyValue("border-" + s + "-color");
    if (!w[i] || !color || isTransparent(color)) return;
    byColor.set(color, (byColor.get(color) || [0, 0, 0, 0]).map((v, j) => (j === i ? w[i] : v)));
  });
  return [...byColor].map(([color, ws]) => {
    const ring = context.svgDocument.createElementNS(svgNamespace, "path");
    ring.setAttribute("d", __rrect(bounds.x, bounds.y, bounds.width, bounds.height, r) + __inset(bounds, r, ws));
    ring.setAttribute("fill", color);
    ring.setAttribute("fill-rule", "evenodd");
    return ring;
  });
}
`;

const patchDomToSvg = {
  name: "dom-to-svg-boxes",
  setup(build) {
    build.onLoad({ filter: /dom-to-svg[\\/]lib[\\/]element\.js$/ }, (args) => {
      let src = readFileSync(args.path, "utf8");
      const swap = (from, to) => {
        if (!src.includes(from)) throw new Error(`dom-to-svg patch: pattern not found: ${from.slice(0, 60)}`);
        src = src.replace(from, to);
      };
      // Our versions replace the original box function; borders are drawn for any border, after backgrounds.
      swap("function createBackgroundAndBorderBox(", "function __unusedBackgroundAndBorderBox(");
      swap("|| hasUniformBorder(styles) ||", "|| __widths(styles).some(Boolean) ||");
      swap(
        /if \(!hasUniformBorder\(styles\)\) \{\s*\/\/ Draw lines for each border\s*for \(const borderLine of createBorders\(styles, bounds, context\)\) \{\s*backgroundAndBordersContainer\.append\(borderLine\);\s*\}\s*\}/.exec(src)?.[0] ?? "<missing border block>",
        "if (bounds.width > 0 && bounds.height > 0) for (const ring of __borderRings(bounds, styles, context)) backgroundAndBordersContainer.append(ring);",
      );
      // Input values: centered between the padding edges (it added the bottom padding instead of
      // subtracting it, and ignored borders).
      swap("const top = bounds.top + (", "const top = bounds.top + parseFloat(styles.borderTopWidth) + (");
      swap("const bottom = bounds.bottom + (", "const bottom = bounds.bottom - parseFloat(styles.borderBottomWidth) - (");
      swap("(bounds.x + ((_e = parseCSSLength(styles.paddingLeft", "(bounds.x + parseFloat(styles.borderLeftWidth) + ((_e = parseCSSLength(styles.paddingLeft");
      return { contents: src + BOX_HELPERS, loader: "js" };
    });
    // Gradients: no direction (computed values drop the default "to bottom") gave a zero-length
    // vector, which paints the last stop only; and stops were always spread evenly.
    build.onLoad({ filter: /dom-to-svg[\\/]lib[\\/]gradients\.js$/ }, (args) => {
      let src = readFileSync(args.path, "utf8");
      const swap = (from, to) => {
        if (!src.includes(from)) throw new Error(`dom-to-svg patch: pattern not found: ${from.slice(0, 60)}`);
        src = src.replace(from, to);
      };
      swap("    return positions;\n};", "    if (!orientation) positions.y2 = '100%';\n    return positions;\n};");
      swap(
        "const offset = `${(index / (colorStops.length - 1)) * 100}%`;",
        "const offset = colorStop.length && colorStop.length.type === '%' ? `${colorStop.length.value}%` : `${(index / (colorStops.length - 1)) * 100}%`;",
      );
      return { contents: src, loader: "js" };
    });
  },
};

/** Tool modules, resolved from SHOT_DEPS (a folder with node_modules/) — not project dependencies. */
export async function loadTools(require) {
  const esbuild = require("esbuild");
  const subsetFont = require("subset-font");
  const { optimize } = require("svgo");
  const fontkit = require("fontkit");
  const domToSvgDir = path.dirname(require.resolve("dom-to-svg/package.json"));
  const result = await esbuild.build({
    stdin: { contents: "export { elementToSVG, inlineResources } from 'dom-to-svg';", resolveDir: domToSvgDir },
    bundle: true,
    format: "iife",
    globalName: "DomToSvg",
    write: false,
    plugins: [patchDomToSvg],
  });
  return { bundle: result.outputFiles[0].text, subsetFont, optimize, fontkit };
}

/** `@font-face` rules of src/app.css → [{ family, weight, style, file }]. */
export function fontFaces(root) {
  const css = readFileSync(path.join(root, "src/app.css"), "utf8");
  return [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => ({
    family: /font-family:\s*"([^"]+)"/.exec(body)[1],
    weight: Number(/font-weight:\s*(\d+)/.exec(body)?.[1] ?? 400),
    style: /font-style:\s*(\w+)/.exec(body)?.[1] ?? "normal",
    file: path.join(root, "static", /url\("([^"]+)"\)/.exec(body)[1]),
  }));
}

/** Serialize the area `clip` of the page to an SVG string (fonts not embedded yet). */
export async function domSvg(page, bundle, clip) {
  if (!(await page.evaluate(() => !!window.DomToSvg))) await page.addScriptTag({ content: bundle });
  return page.evaluate(async (c) => {
    // Hidden text inputs/caret helpers would leak as stray text.
    for (const el of document.querySelectorAll(".xterm-helper-textarea, .xterm-accessibility, .xterm-char-measure-element"))
      el.style.display = "none";
    // CSS that dom-to-svg can't express, rewritten as plain boxes: no blink/animations,
    // outline cursors as borders, 1px-line gradient separators as a centered child.
    if (!document.getElementById("svg-fixups")) {
      const st = document.createElement("style");
      st.id = "svg-fixups";
      st.textContent = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
        .xterm-cursor-outline{outline:none!important;box-shadow:inset 0 0 0 1px currentColor}
        [data-svg-baseline]::after{display:none!important}`;
      document.head.append(st);
    }
    // Outline rings drawn as a pseudo-element whose background is masked to its padding area
    // (mask-composite: exclude), e.g. the active tab / settings nav item: unsupported, so turn
    // each into a border with the padding's per-side widths (0 = the open side).
    const rings = [];
    let ringId = 0;
    for (const el of document.querySelectorAll("body *:not(.xterm-rows *)")) {
      for (const pseudo of ["::before", "::after"]) {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content === "none" || ps.display === "none") continue;
        const composite = ps.maskComposite || ps.webkitMaskComposite || "";
        if (!/exclude|xor/.test(composite) || !ps.maskImage.includes("gradient")) continue;
        const id = el.dataset.svgRing || String(++ringId);
        el.dataset.svgRing = id;
        // Whole pixels: Chromium paints the 1.5px masked ring as a solid 2px line.
        const w = [ps.paddingTop, ps.paddingRight, ps.paddingBottom, ps.paddingLeft].map((v) => `${Math.ceil(parseFloat(v))}px`).join(" ");
        rings.push(`[data-svg-ring="${id}"]${pseudo}{-webkit-mask:none!important;mask:none!important;background:transparent!important;
          padding:0!important;box-sizing:border-box;border-style:solid;border-width:${w};border-color:${ps.backgroundColor}}`);
      }
    }
    let ringStyle = document.getElementById("svg-rings");
    if (!ringStyle) {
      ringStyle = document.createElement("style");
      ringStyle.id = "svg-rings";
      document.head.append(ringStyle);
    }
    ringStyle.textContent = rings.join("\n");
    // Tab baseline (.bar / .vtabs ::after): an accent line from each end to the active tab, as a
    // gradient with px stops. dom-to-svg spreads stops evenly, so draw it as two 2-stop segments.
    for (const el of document.querySelectorAll("[data-svg-segment]")) el.remove();
    // Hosts: tab bar, vertical tabs, settings navigation and side tabs (see tab-baseline.ts).
    for (const host of document.querySelectorAll('[style*="--a0"]')) {
      host.removeAttribute("data-svg-baseline");
      const ps = getComputedStyle(host, "::after");
      if (ps.display === "none" || !ps.backgroundImage.startsWith("linear-gradient")) continue;
      // The computed gradient omits the default "to bottom": tell the axis by the line's shape.
      const vertical = parseFloat(ps.height) > parseFloat(ps.width);
      // --a0/--a1 lag when a scene closes a tab right before capture: measure the active tab now.
      const act = host.querySelector(".tab.active") ?? host.querySelector(".active");
      if (!act) continue;
      const h = host.getBoundingClientRect();
      const r = act.getBoundingClientRect();
      const [a0, a1] = vertical ? [r.top - h.top, r.bottom - h.top] : [r.left - h.left, r.right - h.left];
      const hs = getComputedStyle(host);
      const bg = hs.getPropertyValue("--ind-bg").trim() || ps.backgroundImage.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i)[0];
      const ind = (act.classList.contains("colored") && act.style.getPropertyValue("--tab-bg")) || hs.getPropertyValue("--ind").trim();
      const edge = vertical
        ? `top:0;bottom:0;${ps.left !== "auto" ? `left:${ps.left};` : ""}${ps.right !== "auto" ? `right:${ps.right};` : ""}width:${ps.width}`
        : `left:0;right:0;${ps.top !== "auto" ? `top:${ps.top};` : ""}${ps.bottom !== "auto" ? `bottom:${ps.bottom};` : ""}height:${ps.height}`;
      const seg = (from, to, start, end) => {
        const d = document.createElement("div");
        d.dataset.svgSegment = "1";
        const dir = vertical ? "to bottom" : "to right";
        const span = vertical ? `top:${start}px;${end == null ? "bottom:0" : `height:${end - start}px`}` : `left:${start}px;${end == null ? "right:0" : `width:${end - start}px`}`;
        d.style.cssText = `position:absolute;${edge};${span};z-index:2;pointer-events:none;background:linear-gradient(${dir},${from},${to})`;
        host.append(d);
      };
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      seg(bg, ind, 0, a0);
      seg(ind, bg, a1, null);
      host.setAttribute("data-svg-baseline", "1");
    }
    // dom-to-svg paints the terminal viewport over absolutely positioned overlays (find bar,
    // toasts): move its background to the .xterm element below it.
    for (const vp of document.querySelectorAll(".xterm-viewport")) {
      const bg = getComputedStyle(vp).backgroundColor;
      if (bg === "rgba(0, 0, 0, 0)") continue;
      vp.closest(".xterm").style.backgroundColor = bg;
      vp.style.setProperty("background-color", "transparent", "important");
    }
    // dom-to-svg draws input values but not placeholders: add those as a fixed span on top.
    for (const el of document.querySelectorAll("[data-svg-value]")) el.remove();
    for (const inp of document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), textarea")) {
      const r = inp.getBoundingClientRect();
      const text = inp.placeholder;
      if (inp.value || !text || !r.width || !r.height || getComputedStyle(inp).visibility === "hidden") continue;
      const cs = getComputedStyle(inp);
      const ph = getComputedStyle(inp, "::placeholder");
      const span = document.createElement("span");
      span.dataset.svgValue = "1";
      span.textContent = text;
      span.style.cssText = `position:fixed;left:${r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)}px;top:${r.top}px;
        height:${r.height}px;display:flex;align-items:center;max-width:${r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px;
        overflow:hidden;white-space:pre;z-index:2147483647;font:${cs.font};letter-spacing:${cs.letterSpacing};
        color:${ph.color};opacity:${ph.opacity}`;
      document.body.append(span);
    }
    // Native checkboxes/radios aren't drawn (only their value, "on"): draw a box instead.
    for (const inp of document.querySelectorAll("input[type=checkbox], input[type=radio]")) {
      const r = inp.getBoundingClientRect();
      inp.value = "";
      if (!r.width || inp.dataset.svgBox) continue;
      inp.dataset.svgBox = "1";
      const cs = getComputedStyle(inp);
      const accent = cs.accentColor === "auto" ? getComputedStyle(document.body).getPropertyValue("--accent") || "#34d399" : cs.accentColor;
      const box = document.createElement("span");
      box.textContent = inp.checked && inp.type === "checkbox" ? "✓" : inp.checked ? "●" : "";
      box.style.cssText = `display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;
        width:${r.width}px;height:${r.height}px;margin:${cs.margin};vertical-align:middle;flex:none;
        border:1px solid ${inp.checked ? accent : getComputedStyle(document.body).getPropertyValue("--border") || "#555"};
        border-radius:${inp.type === "radio" ? "50%" : "3px"};background:${inp.checked && inp.type === "checkbox" ? accent : "transparent"};
        color:${inp.type === "checkbox" ? "#111" : accent};font:bold ${Math.round(r.height * 0.8)}px "JetBrains Mono";line-height:1`;
      inp.style.display = "none";
      inp.after(box);
    }
    // Closed <select>: draw the selected option's text on top.
    for (const sel of document.querySelectorAll("select")) {
      const r = sel.getBoundingClientRect();
      const text = sel.selectedOptions[0]?.text;
      if (!text || !r.width) continue;
      const cs = getComputedStyle(sel);
      const span = document.createElement("span");
      span.dataset.svgValue = "1";
      span.textContent = text;
      // +4px: Chromium's internal padding of the select's text.
      span.style.cssText = `position:fixed;left:${r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft) + 4}px;top:${r.top}px;
        height:${r.height}px;display:flex;align-items:center;max-width:${r.width - 24}px;overflow:hidden;white-space:pre;
        z-index:2147483647;font:${cs.font};color:${cs.color}`;
      document.body.append(span);
    }
    for (const el of document.querySelectorAll(".xterm-cursor-outline")) {
      const cs = getComputedStyle(el);
      el.style.boxShadow = "none";
      el.style.border = `1px solid ${cs.outlineColor}`;
      el.style.boxSizing = "border-box";
      el.style.display = "inline-block";
      el.style.height = getComputedStyle(el.parentElement).lineHeight;
    }
    for (const el of document.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (!cs.backgroundImage.startsWith("linear-gradient") || cs.backgroundSize === "auto" || el.dataset.svgLine) continue;
      const [w, h] = cs.backgroundSize.split(" ").map(parseFloat);
      const color = /rgba?\([^)]*\)|#[0-9a-f]+/i.exec(cs.backgroundImage)?.[0];
      el.dataset.svgLine = "1";
      el.style.backgroundImage = "none";
      el.style.display = "flex";
      el.style.alignItems = el.style.justifyContent = "center";
      const line = document.createElement("span");
      line.style.cssText = `width:${w || 1}px;height:${h || 1}px;background:${color};flex:none`;
      el.append(line);
    }
    const area = new DOMRect(c.x, c.y, c.width, c.height);
    const doc = window.DomToSvg.elementToSVG(document.documentElement, { captureArea: area });
    // dom-to-svg sometimes appends children after a context's positive z-index layer, which
    // then paints under them (find bar, toasts, palette): keep those layers last.
    for (const layer of doc.querySelectorAll('[data-stacking-layer="childStackingContextsWithPositiveStackLevels"]'))
      if (!layer.parentNode.closest(".xterm")) layer.parentNode.append(layer); // xterm layers are fine
    await window.DomToSvg.inlineResources(doc.documentElement);
    return new XMLSerializer().serializeToString(doc);
  }, clip);
}

const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e.toLowerCase()],
  );

/** Characters drawn with each (weight, style) of the SVG's <text> elements. */
function usedText(svg) {
  const groups = new Map(); // "700 italic" -> Set(chars)
  for (const m of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const attrs = m[1];
    const bold = /font-weight[:=]\s*"?(bold|[6-9]00)/.test(attrs);
    const italic = /font-style[:=]\s*"?italic/.test(attrs);
    const key = `${bold ? 700 : 400} ${italic ? "italic" : "normal"}`;
    const set = groups.get(key) ?? new Set();
    for (const ch of decode(m[2].replace(/<[^>]+>/g, ""))) set.add(ch);
    groups.set(key, set);
  }
  return groups;
}

const opened = new Map();
const openFont = (fontkit, file) => opened.get(file) ?? opened.set(file, fontkit.openSync(file)).get(file);

/** Embed font subsets, then minify. */
export async function finishSvg(svg, faces, { subsetFont, optimize, fontkit }) {
  if (process.env.SVG_RAW) return svg; // debugging: dom-to-svg output as is
  const groups = usedText(svg);
  // Fallback fonts (app.css order = the terminal's fallback order) get only what the fonts
  // before them lack.
  const primary = faces.find((f) => f.family === "JetBrains Mono");
  let missing = [...new Set([...groups.values()].flatMap((s) => [...s]))].filter(
    (ch) => ch.trim() && !openFont(fontkit, primary.file).hasGlyphForCodePoint(ch.codePointAt(0)),
  );
  const rules = [];
  for (const f of faces) {
    let chars;
    if (f.family === "JetBrains Mono") chars = [...(groups.get(`${f.weight} ${f.style}`) ?? [])];
    else {
      const font = openFont(fontkit, f.file);
      chars = missing.filter((ch) => font.hasGlyphForCodePoint(ch.codePointAt(0)));
      missing = missing.filter((ch) => !chars.includes(ch));
    }
    if (!chars.length) continue;
    const sub = await subsetFont(readFileSync(f.file), chars.join(""), { targetFormat: "woff2" });
    rules.push(
      `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:${f.style};src:url(data:font/woff2;base64,${sub.toString("base64")}) format("woff2")}`,
    );
  }
  if (missing.length) console.warn("  no bundled font for:", missing.join(" "));
  const style = `<style>${rules.join("")}</style>`;
  const out = svg
    .replace(/(<svg\b[^>]*>)/, `$1${style}`)
    // Default objectBoundingBox masks hide zero-height shapes (e.g. the minimize icon's line);
    // an explicit region, since userSpaceOnUse percentages would follow the (cropped) viewport.
    .replace(/<mask\b(?![^>]*maskUnits)/g, '<mask maskUnits="userSpaceOnUse" x="-1e5" y="-1e5" width="2e5" height="2e5"')
    // dom-to-svg bookkeeping and DOM leftovers: no meaning in the image.
    .replace(/ data-[\w-]+="[^"]*"/g, "")
    .replace(/ (class|aria-owns|aria-hidden|tabindex|role)="[^"]*"/g, "")
    .replace(/<title>[^<]*<\/title>/g, "")
    // Default text properties repeated on every <text>.
    .replace(/ (font-stretch="100%"|word-spacing="0"|letter-spacing="normal"|writing-mode="horizontal-tb"|font-style="normal"|font-weight="400")/g, "");
  return optimize(out, {
    multipass: true,
    plugins: [{ name: "preset-default", params: { overrides: { inlineStyles: false, minifyStyles: false } } }],
  }).data;
}
