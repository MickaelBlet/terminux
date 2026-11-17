<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { Compartment, EditorState, RangeSetBuilder } from "@codemirror/state";
  import {
    Decoration,
    EditorView,
    ViewPlugin,
    WidgetType,
    type DecorationSet,
    type ViewUpdate,
    drawSelection,
    highlightActiveLine,
    highlightActiveLineGutter,
    closeHoverTooltips,
    hoverTooltip,
    keymap,
    lineNumbers,
  } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { HighlightStyle, StreamLanguage, bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
  import { toml } from "@codemirror/legacy-modes/mode/toml";
  import { highlightSelectionMatches, openSearchPanel, searchKeymap } from "@codemirror/search";
  import {
    autocompletion,
    closeBrackets,
    closeBracketsKeymap,
    completionKeymap,
    insertCompletionText,
    startCompletion,
    type Completion,
    type CompletionContext,
    type CompletionResult,
  } from "@codemirror/autocomplete";
  import { linter, lintGutter, lintKeymap, type Diagnostic } from "@codemirror/lint";
  import { tags as t } from "@lezer/highlight";
  import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
  import { app } from "../state.svelte";
  import { editorMenu } from "./menus";
  import { DEFAULT_THEME } from "../config";
  import { BASE_RULES, fontTheme as sharedFontTheme } from "./editor-theme";
  import { completions, keyInfoAt, unknownKeys } from "../config-schema";
  import { findHexColors, fromPickerHex, toPickerHex } from "../color-swatch";
  import { settingsDoc } from "../settings/doc.svelte";
  import { locate } from "../settings/value";

  interface ConfigError {
    message: string;
    from: number;
    to: number;
  }

  /** `paneId`: shown as a pane (else as the settings tab). */
  let { readonly = false, paneId }: { readonly?: boolean; paneId?: string } = $props();
  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let readError = $state("");
  const font = new Compartment();

  const c = DEFAULT_THEME;
  const highlight = HighlightStyle.define([
    { tag: t.comment, color: c.brightBlack, fontStyle: "italic" },
    { tag: t.propertyName, color: c.blue },
    { tag: t.string, color: c.green },
    { tag: t.number, color: c.yellow },
    { tag: t.atom, color: c.magenta },
    { tag: t.bracket, color: c.cyan },
  ]);

  const editorTheme = EditorView.theme(
    {
      ...BASE_RULES,
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--hover)", color: "var(--fg)" },
      ".cm-completionDetail": { color: "var(--muted)", marginLeft: "1em" },
      ".cm-key-doc": { padding: "4px 8px", maxWidth: "480px", fontSize: "12px", lineHeight: "1.5" },
      ".cm-key-doc-head": { color: "var(--accent)" },
      ".cm-key-doc-meta": { color: "var(--muted)" },
      ".cm-completionInfo": { backgroundColor: "var(--panel)", border: "1px solid var(--border)" },
      ".cm-swatch": {
        position: "relative",
        display: "inline-block",
        width: "0.8em",
        height: "0.8em",
        marginRight: "3px",
        verticalAlign: "-0.05em",
        border: "1px solid var(--border)",
        borderRadius: "2px",
        cursor: "pointer",
      },
      ".cm-swatch input": { position: "absolute", inset: "0", width: "100%", height: "100%", opacity: "0", cursor: "pointer", padding: "0", border: "none" },
    },
    { dark: true },
  );

  const fontTheme = () => sharedFontTheme(app.config, app.editorFontSize);

  /** Apply a key completion, then open value completion. */
  const applyAndContinue = (view: EditorView, comp: Completion, from: number, to: number) => {
    view.dispatch(insertCompletionText(view.state, String(comp.apply ?? comp.label), from, to));
    setTimeout(() => startCompletion(view));
  };

  /** Insert a quoted value, swallowing a closing quote already after the cursor. */
  const applyValue = (text: string) => (view: EditorView, _c: Completion, from: number, to: number) => {
    const end = text.endsWith('"') && view.state.sliceDoc(to, to + 1) === '"' ? to + 1 : to;
    view.dispatch(insertCompletionText(view.state, text, from, end));
  };

  function source(ctx: CompletionContext): CompletionResult | null {
    const r = completions(ctx.state.doc.toString(), ctx.pos);
    if (!r) return null;
    return {
      from: r.from,
      options: r.options.map((o) =>
        o.type === "property" ? { ...o, apply: (v, comp, f, to) => applyAndContinue(v, { ...comp, apply: o.apply }, f, to) } : { ...o, apply: applyValue(String(o.apply ?? o.label)) },
      ),
      validFor: /^["\w#$.+\-[\]]*$/,
    };
  }

  /** Range of the key whose tooltip is shown. */
  let shownKey: { from: number; to: number } | null = null;

  /** CodeMirror keeps hover tooltips open while the pointer is over them; close as soon as it leaves the key. */
  const hideKeyDocs = EditorView.domEventHandlers({
    mousemove(e, v) {
      if (!shownKey) return;
      const a = v.coordsAtPos(shownKey.from);
      const b = v.coordsAtPos(shownKey.to);
      const over = a && b && e.clientX >= a.left && e.clientX <= b.right && e.clientY >= a.top && e.clientY <= a.bottom;
      if (!over) v.dispatch({ effects: closeHoverTooltips });
    },
    mouseleave(_e, v) {
      if (shownKey) v.dispatch({ effects: closeHoverTooltips });
    },
  });

  const keyDocs = hoverTooltip((v, pos) => {
    const info = keyInfoAt(v.state.doc.toString(), pos);
    if (!info) return null;
    return {
      pos: info.from,
      end: info.to,
      above: true,
      create() {
        const range = { from: info.from, to: info.to };
        const dom = document.createElement("div");
        dom.className = "cm-key-doc";
        const head = dom.appendChild(document.createElement("div"));
        head.className = "cm-key-doc-head";
        head.append(Object.assign(document.createElement("b"), { textContent: info.key }), ` : ${info.type}`);
        dom.appendChild(document.createElement("div")).textContent = info.doc;
        const line = (label: string, text: string) => {
          const el = dom.appendChild(document.createElement("div"));
          el.className = "cm-key-doc-meta";
          el.textContent = `${label}: ${text}`;
        };
        if (info.values) line("Values", info.values.join(" | "));
        if (info.default) line("Default", info.default);
        // Let clicks reach the text under the tooltip (:has() is unsupported on older WebKitGTK).
        return {
          dom,
          mount: () => {
            shownKey = range;
            dom.closest<HTMLElement>(".cm-tooltip")?.style.setProperty("pointer-events", "none");
          },
          destroy: () => {
            if (shownKey === range) shownKey = null;
          },
        };
      },
    };
  }, { hideOnChange: true });

  /** Clickable swatch before a quoted hex color; opens the native color picker. */
  class SwatchWidget extends WidgetType {
    hex: string;
    constructor(hex: string) {
      super();
      this.hex = hex;
    }
    eq(o: SwatchWidget) {
      return o.hex === this.hex;
    }
    toDOM(v: EditorView) {
      const dom = document.createElement("span");
      dom.className = "cm-swatch";
      if (!readonly) {
        const input = dom.appendChild(document.createElement("input"));
        input.type = "color";
        input.tabIndex = -1;
        // `input` fires while dragging; the position is looked up each time since the doc may have moved.
        input.addEventListener("input", () => {
          const at = v.posAtDOM(dom);
          const line = v.state.doc.lineAt(at);
          const c = findHexColors(line.text, line.from).find((c) => c.from - 1 >= at);
          if (!c) return;
          const hex = fromPickerHex(input.value, c.hex);
          if (hex !== c.hex) v.dispatch({ changes: { from: c.from, to: c.to, insert: hex }, userEvent: "input.color" });
        });
      }
      this.updateDOM(dom);
      return dom;
    }
    /** Reuse the DOM so an open picker survives the rebuild caused by its own edits. */
    updateDOM(dom: HTMLElement) {
      dom.style.background = this.hex;
      dom.title = readonly ? this.hex : `${this.hex} — click to pick`;
      const input = dom.querySelector("input");
      if (input && document.activeElement !== input) input.value = toPickerHex(this.hex);
      return true;
    }
  }

  function swatches(v: EditorView): DecorationSet {
    const b = new RangeSetBuilder<Decoration>();
    for (const { from, to } of v.visibleRanges) {
      for (const c of findHexColors(v.state.sliceDoc(from, to), from)) {
        b.add(c.from - 1, c.from - 1, Decoration.widget({ widget: new SwatchWidget(c.hex), side: -1 }));
      }
    }
    return b.finish();
  }

  const colorSwatches = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(v: EditorView) {
        this.decorations = swatches(v);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = swatches(u.view);
      }
    },
    { decorations: (p) => p.decorations },
  );

  const lint = linter(
    async (v) => {
      const src = v.state.doc.toString();
      const len = v.state.doc.length;
      const out: Diagnostic[] = unknownKeys(src).map((p) => ({ ...p, severity: "warning" }));
      const e = await invoke<ConfigError | null>("validate_config", { src }).catch(() => null);
      if (e) {
        const from = Math.min(e.from, len);
        out.push({ from, to: Math.min(Math.max(e.to, from), len), severity: "error", message: e.message });
      }
      return out;
    },
    { delay: 300 },
  );

  async function save() {
    if (!readonly) await settingsDoc.save();
    return true;
  }

  /** The draft (shared with the settings UI), or the default settings. */
  const loadDoc = (): Promise<string> =>
    readonly ? invoke<string>("default_config") : settingsDoc.load().then(() => settingsDoc.text ?? Promise.reject(settingsDoc.status));

  onMount(() => {
    let disposed = false;
    loadDoc()
      .then((doc) => {
        if (disposed) return;
        view = new EditorView({
          parent: host,
          state: EditorState.create({
            doc,
            extensions: [
              lineNumbers(),
              highlightActiveLineGutter(),
              highlightActiveLine(),
              drawSelection(),
              history(),
              indentOnInput(),
              bracketMatching(),
              closeBrackets(),
              highlightSelectionMatches(),
              StreamLanguage.define(toml),
              syntaxHighlighting(highlight),
              autocompletion({ override: [source] }),
              keyDocs,
              hideKeyDocs,
              colorSwatches,
              ...(readonly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : [lint, lintGutter()]),
              editorTheme,
              font.of(fontTheme()),
              keymap.of([
                { key: "Mod-s", run: () => (save(), true) },
                // Handled here so no native cut event follows: on WebKitGTK the empty-selection
                // line cut otherwise ran twice and removed two lines.
                { key: "Mod-x", run: cut },
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...searchKeymap,
                ...historyKeymap,
                ...completionKeymap,
                ...lintKeymap,
                indentWithTab,
              ]),
              EditorView.updateListener.of((u) => {
                if (u.docChanged && !readonly) settingsDoc.setText(u.state.doc.toString(), false);
              }),
            ],
          }),
        });
        if (paneId) {
          app.paneEditors.set(paneId, { focus: () => view?.focus(), goto: () => {} });
          if (app.activePane === paneId) view.focus();
        } else {
          app.editors.set(readonly ? "defaults" : "config", () => view?.focus());
          if (app.tab?.kind === (readonly ? "defaults" : "config")) view.focus();
        }
        const at = settingsDoc.reveal && !readonly ? locate(doc, settingsDoc.reveal) : -1;
        settingsDoc.reveal = null;
        if (at >= 0) {
          const line = view.state.doc.lineAt(at);
          view.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true });
          view.focus();
        }
      })
      .catch((e) => (readError = `Cannot read config: ${e}`));

    return () => {
      disposed = true;
      if (paneId) app.paneEditors.delete(paneId);
      else app.editors.delete(readonly ? "defaults" : "config");
      view?.destroy();
    };
  });

  // Draft replaced from elsewhere (settings UI, reload, discard): show it.
  $effect(() => {
    const text = settingsDoc.text;
    if (readonly || !view || text === null || text === view.state.doc.toString()) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  });

  function selectedText(v: EditorView): string {
    return v.state.selection.ranges.map((r) => v.state.sliceDoc(r.from, r.to)).join("\n");
  }

  /** Cut the selection, or the current line(s) when nothing is selected (like CodeMirror). */
  function cut(v: EditorView): boolean {
    const st = v.state;
    if (st.readOnly) return false;
    const changes: { from: number; to: number }[] = [];
    let text: string;
    if (st.selection.ranges.every((r) => r.empty)) {
      const lines: string[] = [];
      let last = 0;
      for (const r of st.selection.ranges) {
        const line = st.doc.lineAt(r.head);
        if (line.number <= last) continue;
        last = line.number;
        lines.push(line.text);
        // Take the line break after the line, or before it on the last line.
        if (line.to < st.doc.length) changes.push({ from: line.from, to: line.to + 1 });
        else changes.push({ from: Math.max(0, line.from - 1), to: line.to });
      }
      text = lines.map((l) => l + "\n").join("");
    } else {
      text = selectedText(v);
      for (const r of st.selection.ranges) if (!r.empty) changes.push({ from: r.from, to: r.to });
    }
    writeText(text).catch(console.error);
    v.dispatch({ changes, scrollIntoView: true, userEvent: "delete.cut" });
    return true;
  }

  function onContextMenu(e: MouseEvent) {
    const v = view;
    if (!v) return;
    e.preventDefault();
    const copy = () => void writeText(selectedText(v)).catch(console.error);
    app.menu = editorMenu(app, e.clientX, e.clientY, {
      readonly,
      hasSel: v.state.selection.ranges.some((r) => !r.empty),
      copy,
      cut: () => {
        copy();
        v.dispatch(v.state.replaceSelection(""));
        v.focus();
      },
      paste: () =>
        void readText()
          .then((text) => {
            if (text) v.dispatch(v.state.replaceSelection(text));
            v.focus();
          })
          .catch(console.error),
      selectAll: () => {
        v.dispatch({ selection: { anchor: 0, head: v.state.doc.length } });
        v.focus();
      },
      find: () => openSearchPanel(v),
      save: () => void save(),
    });
  }

  $effect(() => {
    app.editorFontSize;
    app.config.font_family;
    view?.dispatch({ effects: font.reconfigure(fontTheme()) });
  });
</script>

<div class="editor">
  <div class="host" role="presentation" bind:this={host} oncontextmenu={onContextMenu}></div>
  <footer>
    <span class="file" title={readonly ? undefined : settingsDoc.path}>{readonly ? "Default settings (read-only) — copy what you need into config.toml" : `${settingsDoc.path}${app.configDirty ? " ●" : ""}`}</span>
    {#if readError}
      <span class="err">{readError}</span>
    {:else if readonly}
      <span class="hint">Ctrl+F find</span>
    {:else if settingsDoc.changedOnDisk}
      <span class="err">Changed on disk</span>
      <button onclick={() => settingsDoc.reload()}>Reload</button>
    {:else if settingsDoc.status}
      <span class:err={settingsDoc.statusError}>{settingsDoc.status}</span>
    {/if}
    {#if !readonly}
      <span class="hint">Ctrl+S save · Ctrl+Space complete · Ctrl+F find</span>
      {#if !paneId}<button title="Edit with forms" onclick={() => settingsDoc.setView("ui")}>Settings UI</button>{/if}
      <button title="Open in external editor" onclick={() => app.run("open_settings_file")}>External…</button>
    {/if}
  </footer>
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--term-bg);
  }
  .host {
    flex: 1;
    min-height: 0;
  }
  .host :global(.cm-editor) {
    height: 100%;
  }
  .host :global(.cm-editor.cm-focused) {
    outline: none;
  }
  footer {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 3px 10px;
    border-top: 1px solid var(--border);
    background: var(--chrome);
    color: var(--muted);
    font-size: 12px;
  }
  .file {
    color: var(--fg);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .err {
    color: #ffb4bb;
  }
  .hint {
    margin-left: auto;
  }
  button {
    background: none;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--fg);
    font: inherit;
    padding: 1px 8px;
    cursor: pointer;
  }
  button:hover {
    background: var(--hover);
  }
</style>
