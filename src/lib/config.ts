import type { ITheme } from "@xterm/xterm";

export type SchemeRef = string | { light?: string; dark?: string };

export interface FontConfig {
  face?: string;
  size?: number;
  weight?: string | number;
  /** Line height multiplier. */
  cell_height?: number;
  /** Extra letter spacing in px. */
  cell_width?: number;
  ligatures?: boolean;
  features?: Record<string, number>;
  axes?: Record<string, number>;
}

/** Settings also accepted in `unfocused_appearance`. */
export interface Appearance {
  color_scheme?: SchemeRef;
  foreground?: string;
  background?: string;
  selection_background?: string;
  cursor_color?: string;
  cursor_shape?: string;
  cursor_height?: number;
  opacity?: number;
  use_acrylic?: boolean;
  background_image?: string;
  background_image_stretch_mode?: string;
  background_image_alignment?: string;
  background_image_opacity?: number;
  retro_terminal_effect?: boolean;
}

/** Settings of `[defaults]`, overridable per profile. */
export interface ProfileSettings extends Appearance {
  font?: FontConfig;
  intense_text_style?: string;
  adjust_indistinguishable_colors?: string;
  padding?: string | number;
  scrollbar_state?: string;
  unfocused_appearance?: Appearance;
  tab_title?: string;
  suppress_application_title?: boolean;
  tab_color?: string;
  icon?: string;
  history_size?: number;
  snap_on_input?: boolean;
  close_on_exit?: string | boolean;
  startup_timeout?: number;
  startup_retries?: number;
  bell_style?: string | string[];
  bell_sound?: string | string[];
  auto_mark_prompts?: boolean;
  show_marks_on_scrollbar?: boolean;
  right_click_context_menu?: boolean;
  reposition_cursor_with_mouse?: boolean;
  path_translation_style?: string;
}

export interface Profile extends ProfileSettings {
  id: string;
  name: string;
  cmd: string;
  args: string[];
  cwd?: string | null;
  env: Record<string, string>;
  os?: string | null;
  login_shell?: boolean | null;
  hidden?: boolean;
  /** Generator of a dynamic profile ("wsl", "ssh", ...). */
  source?: string | null;
}

export interface UiTheme {
  name: string;
  tab?: {
    background?: string;
    unfocused_background?: string;
    icon_style?: string;
    show_close_button?: string;
    /** Active tab text color. */
    foreground?: string;
    /** Inactive tabs text color. */
    unfocused_foreground?: string;
    /** Active tab marker: "outline" (default) | "underline" | "filled" | "none". */
    indicator?: string;
    /** Corner radius in px. */
    radius?: number;
    /** Tab row height in px (vertical tabs: item height + 2). */
    height?: number;
  };
  tab_row?: { background?: string; unfocused_background?: string };
  window?: {
    application_theme?: string;
    frame?: string;
    unfocused_frame?: string;
    use_mica?: boolean;
    rainbow_frame?: boolean;
    /** Interface font family (tabs, menus, settings; not terminals). */
    font?: string;
    /** Interface font size in px. */
    font_size?: number;
  };
  /** Interface colors replacing the dark / light defaults. */
  colors?: {
    accent?: string;
    background?: string;
    foreground?: string;
    muted?: string;
    panel?: string;
    border?: string;
    hover?: string;
    warning?: string;
    danger?: string;
  };
  pane?: {
    /** Split divider color. */
    divider?: string;
    /** Split divider thickness in px. */
    divider_width?: number;
    /** Outline of the active pane when the tab shows several panes. */
    active_border?: string;
  };
}

export interface MenuEntry {
  type: "profile" | "folder" | "separator" | "match_profiles" | "remaining_profiles" | "action";
  profile?: string;
  icon?: string;
  name?: string;
  entries?: MenuEntry[];
  allow_empty?: boolean;
  inline?: boolean;
  source?: string;
  commandline?: string;
  id?: string;
}

export interface Config {
  default_profile: string;
  font_size: number;
  font_family?: string | null;
  emoji_font?: string | null;
  scrollback: number;
  notifications: boolean;
  copy_on_select: boolean;
  copy_feedback: boolean;
  osc52_clipboard: boolean;
  middle_click_paste: boolean;
  right_click_paste: boolean;
  word_separators?: string | null;
  renderer?: string | null;
  defaults: ProfileSettings;
  profiles: Profile[];
  schemes: Record<string, string>[];
  ui_themes: UiTheme[];
  actions: Record<string, unknown>[];
  keys: Record<string, string | string[]>;
  theme: Record<string, string>;
  disabled_profile_sources?: string[];
  error?: string | null;

  // Appearance
  app_theme?: string;
  tab_width_mode?: string;
  /** Where a truncated tab title is cut: "end" (default) | "start" (keeps the right part). */
  tab_title_ellipsis?: string;
  tab_position?: string;
  vertical_tab_width?: number;
  vertical_tabs_collapsed?: boolean;
  new_tab_position?: string;
  tab_switcher_mode?: string | boolean;
  show_tabs_fullscreen?: boolean;
  show_zoom_badge?: boolean;
  /** "never" | "multiple" | "always" (booleans accepted). */
  show_pane_title_bar?: string | boolean;
  show_terminal_title_in_titlebar?: boolean;
  always_on_top?: boolean;
  disable_animations?: boolean;
  confirm_close_all_tabs?: boolean;
  use_background_image_for_window?: boolean;
  new_tab_menu?: MenuEntry[];
  /** Title-bar buttons: command names, `[[action]]` ids or "separator". */
  toolbar?: string[];
  // Startup
  launch_mode?: string;
  initial_cols?: number;
  initial_rows?: number;
  initial_position?: string;
  center_on_launch?: boolean;
  first_window_preference?: string;
  windowing_behavior?: string;
  startup_actions?: string;
  start_on_user_login?: boolean;
  allow_headless?: boolean;
  // Interaction
  copy_formatting?: boolean | string;
  trim_block_selection?: boolean;
  trim_paste?: boolean;
  right_click_context_menu?: boolean;
  focus_follow_mouse?: boolean;
  scroll_to_zoom?: boolean;
  scroll_to_change_opacity?: boolean;
  detect_urls?: boolean;
  detect_file_paths?: boolean;
  file_link_editor?: string;
  /** "external" | "tab" | "pane" | "builtin". */
  file_link_open?: string;
  /** Splits / duplicates of a pane running ssh reconnect in the remote directory. */
  ssh_follow_directory?: boolean;
  large_paste_warning?: boolean | string;
  multi_line_paste_warning?: boolean | string;
  search_web_url?: string;
  minimize_to_tray?: boolean;
  always_show_tray_icon?: boolean;
  auto_hide_window?: boolean;
  screen_reader?: boolean;
}

/** Bundled fonts (loaded up front by the terminal). */
export const FONT_FAMILIES = [
  "JetBrains Mono",
  "Symbols Nerd Font Mono",
  // Color emoji (COLRv0: rendered by WebKitGTK and WebView2) before the monochrome symbol fonts.
  "Twemoji Mozilla",
  "Noto Sans Symbols 2",
  "Noto Sans Symbols",
  "Noto Sans Math",
];
/** Platform color emoji fonts, tried before the bundled Twemoji. */
export const SYSTEM_EMOJI_FONTS = ["Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"];

const quote = (f: string) => `'${f}'`;
/** A single family name is quoted; a CSS list is kept as is. */
const fontList = (face: string) => (/[,'"]/.test(face) ? face : quote(face));

/** Symbol / emoji fallbacks appended to any user font. `emoji` replaces the system emoji fonts. */
export function fallbackFontFamily(emoji?: string | null): string {
  const e = emoji?.trim();
  return [
    quote(FONT_FAMILIES[1]),
    e ? fontList(e) : SYSTEM_EMOJI_FONTS.map(quote).join(", "),
    ...FONT_FAMILIES.slice(2).map(quote),
    "monospace",
  ].join(", ");
}

/** Terminal font stack: `face` (profile font.face) ⊕ fallbacks, else root font_family, else the default. */
export function fontFamilyOf(cfg: Pick<Config, "font_family" | "emoji_font">, face?: string): string {
  if (face) return `${fontList(face)}, ${fallbackFontFamily(cfg.emoji_font)}`;
  return cfg.font_family || `${quote(FONT_FAMILIES[0])}, ${fallbackFontFamily(cfg.emoji_font)}`;
}

/** The "Terminux" color scheme. */
export const DEFAULT_THEME: ITheme = {
  background: "#14161b",
  foreground: "#d6d9e0",
  cursor: "#34d399",
  cursorAccent: "#14161b",
  selectionBackground: "#3a4256",
  black: "#1d2027",
  red: "#e06c75",
  green: "#98c379",
  yellow: "#e5c07b",
  blue: "#61afef",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#d6d9e0",
  brightBlack: "#5c6370",
  brightRed: "#ef8891",
  brightGreen: "#b5e08f",
  brightYellow: "#f4d398",
  brightBlue: "#82c1f5",
  brightMagenta: "#d899ea",
  brightCyan: "#7fd0db",
  brightWhite: "#ffffff",
};

export const FALLBACK_CONFIG: Config = {
  default_profile: "shell",
  font_size: 14,
  scrollback: 10000,
  notifications: true,
  copy_on_select: false,
  copy_feedback: true,
  osc52_clipboard: false,
  middle_click_paste: true,
  right_click_paste: true,
  defaults: {},
  profiles: [{ id: "shell", name: "Shell", cmd: "$SHELL", args: [], env: {} }],
  schemes: [],
  ui_themes: [],
  actions: [],
  keys: {},
  theme: {},
};

export const DEFAULT_WORD_SEPARATORS = " ()[]{}',\"`";
export const wordSeparatorOf = (cfg: Config) => cfg.word_separators ?? DEFAULT_WORD_SEPARATORS;
export const DEFAULT_SEARCH_URL = "https://www.bing.com/search?q=%s";

/** Profiles shown in menus. */
export const visibleProfiles = (cfg: Config) => cfg.profiles.filter((p) => !p.hidden);

/** Profile by id, then by display name. */
export function findProfile(cfg: Config, key: string | undefined | null): Profile | undefined {
  if (!key) return undefined;
  return cfg.profiles.find((p) => p.id === key) ?? cfg.profiles.find((p) => p.name.toLowerCase() === key.toLowerCase());
}
