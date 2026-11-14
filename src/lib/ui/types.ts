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
  /** Stable identity, keeps the selection across `PaletteView.refresh`. */
  id?: string;
  /** Run without closing the palette; the list is rebuilt with `PaletteView.refresh`. */
  keepOpen?: boolean;
  /** Reorderable item (Alt+Up / Alt+Down, arrow buttons). */
  move?: (delta: -1 | 1) => void;
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
  /** Rebuild the top-level items (after a `keepOpen` run or a move). */
  refresh?: () => PaletteItem[];
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

export interface DialogRequest {
  title: string;
  message?: string;
  /** Present for a text prompt. */
  input?: { value: string; placeholder?: string };
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
}
