// Find / replace panel for the CodeMirror editors, styled like the terminal SearchBar.
import type { Extension } from "@codemirror/state";
import { EditorView, keymap, type Panel, type ViewUpdate } from "@codemirror/view";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  openSearchPanel,
  replaceAll,
  replaceNext,
  search,
  setSearchQuery,
} from "@codemirror/search";
import { ICONS } from "./icons";

/** Stop counting past this many matches. */
const COUNT_LIMIT = 9999;

function icon(name: string, size = 13): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 1.4,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
  }))
    svg.setAttribute(k, String(v));
  const path = svg.appendChild(document.createElementNS(ns, "path"));
  path.setAttribute("d", ICONS[name] ?? "");
  return svg;
}

function button(name: string, title: string, run: () => void, size?: number): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.title = title;
  b.append(icon(name, size));
  b.onmousedown = (e) => e.preventDefault(); // keep focus in the input
  b.onclick = run;
  return b;
}

/** "i/n" for the match at the main selection, or "No results". */
function countText(view: EditorView, q: SearchQuery): string {
  if (!q.search) return "";
  if (!q.valid) return "Invalid";
  const sel = view.state.selection.main;
  let n = 0;
  let index = 0;
  const cur = q.getCursor(view.state);
  for (let r = cur.next(); !r.done; r = cur.next()) {
    n++;
    if (r.value.from === sel.from && r.value.to === sel.to) index = n;
    if (n >= COUNT_LIMIT) return index ? `${index}/${n}+` : `${n}+`;
  }
  if (!n) return "No results";
  return index ? `${index}/${n}` : `${n}`;
}

class SearchPanel implements Panel {
  dom: HTMLElement;
  top = true;
  private find: HTMLInputElement;
  private replace: HTMLInputElement;
  private replaceRow: HTMLElement;
  private expand: HTMLButtonElement;
  private count: HTMLElement;
  private toggles: Record<"caseSensitive" | "wholeWord" | "regexp", HTMLButtonElement>;
  private query: SearchQuery;

  constructor(private view: EditorView) {
    this.query = getSearchQuery(view.state);
    const readOnly = view.state.readOnly;

    this.find = this.input("Find", this.query.search);
    this.find.setAttribute("main-field", "true");
    this.replace = this.input("Replace", this.query.replace);
    this.count = document.createElement("span");
    this.count.className = "cm-tx-count";

    this.toggles = {
      caseSensitive: button("case", "Match case (Alt+C)", () => this.toggle("caseSensitive")),
      wholeWord: button("word", "Whole word (Alt+W)", () => this.toggle("wholeWord")),
      regexp: button("regex", "Regular expression (Alt+R)", () => this.toggle("regexp")),
    };
    this.expand = button("right", "Toggle replace (Ctrl+H)", () => this.showReplace(!this.replaceShown(), true), 12);
    this.expand.classList.add("cm-tx-expand");

    const findRow = row(
      icon("search"),
      this.find,
      this.count,
      this.toggles.caseSensitive,
      this.toggles.wholeWord,
      this.toggles.regexp,
      button("up", "Previous (Shift+Enter)", () => findPrevious(view)),
      button("down", "Next (Enter)", () => findNext(view)),
      button("close", "Close (Esc)", () => closeSearchPanel(view), 12),
    );
    this.replaceRow = row(
      icon("swap"),
      this.replace,
      button("check", "Replace (Enter)", () => replaceNext(view)),
      button("select-all", "Replace all (Ctrl+Alt+Enter)", () => replaceAll(view)),
    );
    this.replaceRow.classList.add("cm-tx-replace");

    const rows = document.createElement("div");
    rows.className = "cm-tx-rows";
    rows.append(findRow, this.replaceRow);

    this.dom = document.createElement("div");
    this.dom.className = "cm-tx-search";
    if (!readOnly) this.dom.append(this.expand);
    this.dom.append(rows);
    this.dom.addEventListener("keydown", (e) => this.keydown(e));
    this.showReplace(false);
    this.sync();
  }

  private input(placeholder: string, value: string): HTMLInputElement {
    const i = document.createElement("input");
    i.placeholder = placeholder;
    i.value = value;
    i.spellcheck = false;
    i.className = "cm-tx-input";
    i.addEventListener("input", () => this.commit());
    return i;
  }

  private replaceShown() {
    return !this.replaceRow.hidden;
  }

  showReplace(show: boolean, focus = false) {
    if (this.view.state.readOnly) show = false;
    this.replaceRow.hidden = !show;
    this.expand.replaceChildren(icon(show ? "chevron" : "right", 12));
    if (focus) (show ? this.replace : this.find).focus();
  }

  private toggle(k: "caseSensitive" | "wholeWord" | "regexp") {
    this.commit({ [k]: !this.query[k] });
  }

  private commit(patch: Partial<Record<"caseSensitive" | "wholeWord" | "regexp", boolean>> = {}) {
    const q = new SearchQuery({
      search: this.find.value,
      replace: this.replace.value,
      caseSensitive: patch.caseSensitive ?? this.query.caseSensitive,
      wholeWord: patch.wholeWord ?? this.query.wholeWord,
      regexp: patch.regexp ?? this.query.regexp,
      literal: this.query.literal,
    });
    if (!q.eq(this.query)) this.view.dispatch({ effects: setSearchQuery.of(q) });
  }

  private keydown(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (e.key === "Enter" && e.target === this.find) {
      (e.shiftKey ? findPrevious : findNext)(this.view);
    } else if (e.key === "Enter" && e.target === this.replace) {
      (e.ctrlKey && e.altKey ? replaceAll : replaceNext)(this.view);
    } else if (e.altKey && !e.ctrlKey && (k === "c" || k === "w" || k === "r")) {
      this.toggle(k === "c" ? "caseSensitive" : k === "w" ? "wholeWord" : "regexp");
    } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && k === "h") {
      this.showReplace(true, true);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }

  /** Reflect the query and match count in the DOM. */
  private sync() {
    if (this.find.value !== this.query.search) this.find.value = this.query.search;
    if (this.replace.value !== this.query.replace) this.replace.value = this.query.replace;
    for (const [k, b] of Object.entries(this.toggles)) b.classList.toggle("on", this.query[k as keyof typeof this.toggles]);
    this.find.classList.toggle("invalid", !!this.query.search && !this.query.valid);
    this.count.textContent = countText(this.view, this.query);
  }

  update(u: ViewUpdate) {
    const q = getSearchQuery(u.state);
    const changed = !q.eq(this.query);
    this.query = q;
    if (changed || u.docChanged || u.selectionSet) this.sync();
  }
}

function row(...children: Node[]): HTMLElement {
  const r = document.createElement("div");
  r.className = "cm-tx-row";
  r.append(...children);
  return r;
}

/** Open the panel with the replace row visible (Ctrl+H). */
function openReplace(view: EditorView): boolean {
  if (view.state.readOnly) return false;
  openSearchPanel(view);
  const panel = view.dom.querySelector(".cm-tx-search");
  if (panel) panels.get(panel)?.showReplace(true, true);
  return true;
}

const panels = new WeakMap<Element, SearchPanel>();

const theme = EditorView.theme({
  ".cm-panels.cm-panels-top": { backgroundColor: "transparent", borderBottom: "none" },
  ".cm-tx-search": {
    position: "absolute",
    top: "6px",
    right: "18px",
    zIndex: "10",
    display: "flex",
    alignItems: "flex-start",
    gap: "3px",
    padding: "4px 6px",
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    color: "var(--muted)",
    boxShadow: "0 4px 16px var(--shadow)",
    fontFamily: "inherit",
    fontSize: "13px",
  },
  ".cm-tx-rows": { display: "flex", flexDirection: "column", gap: "3px" },
  ".cm-tx-row": { display: "flex", alignItems: "center", gap: "3px" },
  ".cm-tx-row[hidden]": { display: "none" },
  ".cm-tx-row > svg": { flex: "none" },
  ".cm-tx-input": { width: "180px", background: "transparent", border: "none", outline: "none", color: "var(--fg)", font: "inherit" },
  ".cm-tx-input.invalid": { color: "var(--danger)" },
  ".cm-tx-count": { minWidth: "56px", fontSize: "11px", textAlign: "right", paddingRight: "4px" },
  ".cm-tx-search button": {
    display: "grid",
    placeItems: "center",
    padding: "3px",
    background: "none",
    border: "none",
    borderRadius: "4px",
    color: "var(--muted)",
    cursor: "pointer",
  },
  ".cm-tx-search button:hover": { background: "var(--hover)", color: "var(--fg)" },
  ".cm-tx-search button.on": { color: "var(--accent)", background: "var(--hover)" },
  ".cm-tx-expand": { alignSelf: "stretch" },
});

/** Search extension (panel, theme, Ctrl+H); combine with `searchKeymap`. */
export const editorSearch: Extension = [
  search({
    top: true,
    createPanel: (view) => {
      const p = new SearchPanel(view);
      panels.set(p.dom, p);
      return p;
    },
  }),
  theme,
  keymap.of([{ key: "Mod-h", run: openReplace, scope: "editor search-panel" }]),
];
