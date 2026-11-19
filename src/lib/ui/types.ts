// Shapes of the transient UI (palette, menus, dialogs) driven by the app state.

export interface PaletteItem {
  label: string;
  /** Key binding or secondary text shown on the right. */
  hint?: string;
  /** Dimmed text after the label. */
  detail?: string;
  icon?: string;
  run?: () => void;
  /** Opens a nested list instead of running. */
  children?: () => PaletteItem[];
  /** Called when the item is highlighted (live preview). */
  preview?: () => void;
  /** Stable identity (list key). */
  id?: string;
}

export interface PaletteView {
  placeholder: string;
  items: PaletteItem[];
  /** Undo previews when dismissed without choosing. */
  onCancel?: () => void;
  /** Command palette: a query not starting with ">" is run as a command line. */
  commandline?: (text: string) => void;
  /** Initial query. */
  query?: string;
  /** localStorage key: remember picked top-level entries, show them first, allow A→Z sort. */
  recentKey?: string;
}

export interface MenuItem {
  label: string;
  hint?: string;
  icon?: string;
  disabled?: boolean;
  checked?: boolean;
  run?: () => void;
  /** Submenu. */
  children?: MenuItem[][];
}

export interface MenuRequest {
  x: number;
  y: number;
  groups: MenuItem[][];
}

export interface CompletionItem {
  label: string;
  /** A directory: accepting it keeps the prompt open to continue typing. */
  dir: boolean;
  /** Input text once accepted. */
  text: string;
}

export interface Completion {
  items: CompletionItem[];
  /** Input text extended to the items' common prefix, null when it adds nothing. */
  common: string | null;
}

export interface DialogRequest {
  title: string;
  message?: string;
  /** Present for a text prompt; `complete` suggests values while typing. */
  input?: { value: string; placeholder?: string; complete?: (text: string) => Promise<Completion | null> };
  /** Optional checkbox; `checked` is updated in place before `resolve`. */
  checkbox?: { label: string; checked: boolean };
  ok: string;
  cancel?: string;
  danger?: boolean;
  resolve: (value: string | boolean | null) => void;
}

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "warn" | "error";
  /** Button on the toast; clicking it runs `run` and dismisses the toast. */
  action?: { label: string; run: () => void };
  key?: string;
}
