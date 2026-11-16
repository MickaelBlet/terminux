// CodeMirror styling shared by the config editor and the file editor pane.
import { EditorView } from "@codemirror/view";
import { HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { DEFAULT_THEME, fontFamilyOf, type Config } from "../config";

const c = DEFAULT_THEME;

/** Base rules (chrome colors, selection, gutters, tooltips, search). */
export const BASE_RULES: Record<string, Record<string, string>> = {
  "&": { height: "100%", color: "var(--fg)", backgroundColor: "var(--term-bg)" },
  ".cm-content": { caretColor: "var(--accent)" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: `${c.selectionBackground} !important`,
  },
  ".cm-gutters": { backgroundColor: "var(--chrome)", color: "var(--muted)", border: "none" },
  ".cm-activeLine": { backgroundColor: "#ffffff08" },
  ".cm-activeLineGutter": { backgroundColor: "#ffffff0d", color: "var(--fg)" },
  ".cm-matchingBracket": { backgroundColor: "#ffffff1a", outline: "none" },
  ".cm-tooltip": { backgroundColor: "var(--panel)", border: "1px solid var(--border)", color: "var(--fg)" },
  ".cm-panels": { backgroundColor: "var(--panel)", color: "var(--fg)" },
  ".cm-searchMatch": { backgroundColor: "#34d39933" },
};

export const fontTheme = (cfg: Config, size: number) =>
  EditorView.theme({
    "&": { fontSize: `${size}px` },
    // Tooltips sit outside the scroller and the completion list forces `monospace`:
    // give them the same stack so emoji fall back to the bundled Twemoji.
    ".cm-scroller, .cm-tooltip, .cm-tooltip.cm-tooltip-autocomplete > ul": { fontFamily: fontFamilyOf(cfg) },
  });

/** Highlighting for general source code (legacy stream modes). */
export const codeHighlight = HighlightStyle.define([
  { tag: t.comment, color: c.brightBlack, fontStyle: "italic" },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: c.magenta },
  { tag: [t.string, t.special(t.string), t.regexp], color: c.green },
  { tag: [t.number, t.bool, t.null, t.atom], color: c.yellow },
  { tag: [t.typeName, t.className, t.namespace], color: c.cyan },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: c.blue },
  { tag: [t.propertyName, t.attributeName], color: c.blue },
  { tag: [t.definition(t.variableName), t.labelName], color: c.foreground },
  { tag: [t.meta, t.processingInstruction], color: c.brightYellow },
  { tag: [t.tagName, t.heading], color: c.red, fontWeight: "bold" },
  { tag: [t.inserted], color: c.green },
  { tag: [t.deleted], color: c.red },
  { tag: t.invalid, color: c.brightRed },
]);
