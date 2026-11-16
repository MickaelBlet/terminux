<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { Compartment, EditorState } from "@codemirror/state";
  import {
    EditorView,
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
  import { DEFAULT_THEME, fontFamilyOf } from "../config";
  import { completions, keyInfoAt, unknownKeys } from "../config-schema";

  interface ConfigError {
    message: string;
    from: number;
    to: number;
  }

  let { readonly = false }: { readonly?: boolean } = $props();
  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let saved = "";
  let status = $state("");
  let statusError = $state(false);
  let changedOnDisk = $state(false);
  let path = $state("config.toml");
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
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--hover)", color: "var(--fg)" },
      ".cm-completionDetail": { color: "var(--muted)", marginLeft: "1em" },
      ".cm-key-doc": { padding: "4px 8px", maxWidth: "480px", fontSize: "12px", lineHeight: "1.5" },
      ".cm-key-doc-head": { color: "var(--accent)" },
      ".cm-key-doc-meta": { color: "var(--muted)" },
      ".cm-completionInfo": { backgroundColor: "var(--panel)", border: "1px solid var(--border)" },
      ".cm-panels": { backgroundColor: "var(--panel)", color: "var(--fg)" },
      ".cm-searchMatch": { backgroundColor: "#34d39933" },
    },
    { dark: true },
  );

  const fontTheme = () =>
    EditorView.theme({
      "&": { fontSize: `${app.editorFontSize}px` },
      ".cm-scroller": { fontFamily: fontFamilyOf(app.config) },
    });

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
  });

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

  function setStatus(msg: string, error = false) {
    status = msg;
    statusError = error;
  }

  async function save() {
    if (!view || readonly) return true;
    const src = view.state.doc.toString();
    try {
      await invoke("write_config", { src });
      saved = src;
      app.configDirty = false;
      changedOnDisk = false;
      setStatus("Saved");
    } catch (e) {
      setStatus(`Not saved: ${e}`, true);
    }
    return true;
  }

  function setDoc(text: string) {
    if (!view) return;
    saved = text;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    app.configDirty = false;
    changedOnDisk = false;
  }

  async function reload() {
    setDoc(await invoke<string>("read_config"));
    setStatus("Reloaded from disk");
  }

  async function onDiskChange() {
    if (!view || readonly) return;
    const text = await invoke<string>("read_config").catch(() => null);
    if (text === null || text === view.state.doc.toString()) {
      if (text !== null) saved = text;
      return;
    }
    if (app.configDirty) changedOnDisk = true;
    else setDoc(text);
  }

  onMount(() => {
    let disposed = false;
    const unlisten = listen("config-changed", onDiskChange);
    if (!readonly) invoke<string>("config_path").then((p) => (path = p)).catch(() => {});
    invoke<string>(readonly ? "default_config" : "read_config")
      .then((doc) => {
        if (disposed) return;
        saved = doc;
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
                if (u.docChanged && !readonly) app.configDirty = u.state.doc.toString() !== saved;
              }),
            ],
          }),
        });
        app.editors.set(readonly ? "defaults" : "config", () => view?.focus());
        if (app.tab?.kind === (readonly ? "defaults" : "config")) view.focus();
      })
      .catch((e) => setStatus(`Cannot read config: ${e}`, true));

    return () => {
      disposed = true;
      app.editors.delete(readonly ? "defaults" : "config");
      view?.destroy();
      unlisten.then((f) => f());
    };
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
    <span class="file" title={readonly ? undefined : path}>{readonly ? "Default settings (read-only) — copy what you need into config.toml" : `${path}${app.configDirty ? " ●" : ""}`}</span>
    {#if readonly}
      <span class="hint">Ctrl+F find</span>
    {:else if changedOnDisk}
      <span class="err">Changed on disk</span>
      <button onclick={reload}>Reload</button>
    {:else if status}
      <span class:err={statusError}>{status}</span>
    {/if}
    {#if !readonly}
      <span class="hint">Ctrl+S save · Ctrl+Space complete · Ctrl+F find</span>
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
