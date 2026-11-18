<script lang="ts" module>
  /** Unsaved state of an editor whose pane moved (tab <-> pane): the component remounts. */
  const drafts = new Map<string, { text: string; saved: string; path: string; head: number }>();
</script>

<script lang="ts">
  // Built-in file editor (Ctrl+click on a file path, file_link_open = "builtin" / "builtin_pane").
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { Compartment, EditorSelection, EditorState } from "@codemirror/state";
  import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
  import { bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
  import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
  import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
  import { app } from "../state.svelte";
  import { langOf } from "../file-langs";
  import { loadLanguage } from "./editor-langs";
  import { BASE_RULES, codeHighlight, fontTheme } from "./editor-theme";
  import { editorSearch } from "./editor-search";

  let { paneId }: { paneId: string } = $props();
  const info = $derived(app.panes[paneId]);

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let saved = "";
  let path = $state("");
  let status = $state("");
  let statusError = $state(false);
  const font = new Compartment();
  const language = new Compartment();

  const theme = EditorView.theme(BASE_RULES, { dark: true });

  function setStatus(msg: string, error = false) {
    status = msg;
    statusError = error;
    if (!error) setTimeout(() => status === msg && (status = ""), 2500);
  }

  function setDirty(dirty: boolean) {
    if (app.panes[paneId]) app.panes[paneId].dirty = dirty;
  }

  /** Move the cursor to a 1-based line / column and center it. */
  function goto(line?: number, col?: number) {
    if (!view || !line) return;
    const l = view.state.doc.line(Math.min(Math.max(line, 1), view.state.doc.lines));
    const pos = Math.min(l.from + Math.max((col ?? 1) - 1, 0), l.to);
    view.dispatch({ selection: EditorSelection.cursor(pos), effects: EditorView.scrollIntoView(pos, { y: "center" }) });
  }

  async function save() {
    if (!view) return;
    const text = view.state.doc.toString();
    try {
      await invoke("file_write", { path, text });
      saved = text;
      setDirty(false);
      setStatus("Saved");
    } catch (e) {
      setStatus(String(e), true);
    }
  }

  async function load(): Promise<string | null> {
    try {
      const doc = await invoke<{ path: string; text: string }>("file_read", { path: info?.spec.file ?? "" });
      path = doc.path;
      return doc.text;
    } catch (e) {
      setStatus(String(e), true);
      return null;
    }
  }

  async function reload() {
    if (app.panes[paneId]?.dirty && !(await app.confirm("Discard unsaved changes?", path, { ok: "Discard", danger: true }))) return;
    const text = await load();
    if (text === null || !view) return;
    saved = text;
    const head = Math.min(view.state.selection.main.head, text.length);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: EditorSelection.cursor(head) });
    setDirty(false);
  }

  onMount(() => {
    let disposed = false;
    const draft = drafts.get(paneId);
    drafts.delete(paneId);
    const initial = draft ? Promise.resolve((path = draft.path, draft.text)) : load();
    initial.then(async (text) => {
      if (disposed || text === null) return;
      saved = draft?.saved ?? text;
      view = new EditorView({
        parent: host,
        state: EditorState.create({
          doc: text,
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
            editorSearch,
            language.of([]),
            syntaxHighlighting(codeHighlight),
            theme,
            font.of(fontTheme(app.config, app.editorFontSize)),
            keymap.of([
              { key: "Mod-s", run: () => (save(), true) },
              ...closeBracketsKeymap,
              ...defaultKeymap,
              ...searchKeymap,
              ...historyKeymap,
              indentWithTab,
            ]),
            EditorView.updateListener.of((u) => {
              if (u.docChanged) setDirty(u.state.doc.toString() !== saved);
              if (u.focusChanged && u.view.hasFocus) app.focusPane(paneId);
            }),
          ],
        }),
      });
      app.paneEditors.set(paneId, { focus: () => view?.focus(), goto });
      if (draft) {
        const head = Math.min(draft.head, text.length);
        view.dispatch({ selection: EditorSelection.cursor(head), effects: EditorView.scrollIntoView(head, { y: "center" }) });
      }
      else goto(info?.spec.line, info?.spec.col);
      if (app.tab?.active === paneId) view.focus();
      const lang = langOf(path);
      if (lang) {
        const support = await loadLanguage(lang).catch(() => null);
        if (support && !disposed) view.dispatch({ effects: language.reconfigure(support) });
      }
    });
    return () => {
      disposed = true;
      // Still a pane: it is being moved, keep the edits for the next mount.
      if (view && app.panes[paneId]?.dirty) drafts.set(paneId, { text: view.state.doc.toString(), saved, path, head: view.state.selection.main.head });
      app.paneEditors.delete(paneId);
      view?.destroy();
    };
  });

  $effect(() => {
    const theme = fontTheme(app.config, app.editorFontSize);
    view?.dispatch({ effects: font.reconfigure(theme) });
  });
</script>

<div class="file-pane">
  <div class="host" bind:this={host}></div>
  <footer>
    <span class="file" title={info?.spec.remoteLabel ?? path}>{info?.spec.remoteLabel || path || info?.spec.file}{info?.dirty ? " ●" : ""}</span>
    {#if status}<span class:err={statusError}>{status}</span>{/if}
    <span class="hint">Ctrl+S save · Ctrl+F find</span>
    <button title="Reload from disk" onclick={reload}>Reload</button>
  </footer>
</div>

<style>
  .file-pane {
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
    white-space: nowrap;
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
