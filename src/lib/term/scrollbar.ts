// Terminal scrollbar look: visibility, width and thumb colors.
import { withAlpha } from "../schemes";

export type ScrollbarState = "visible" | "hidden" | "auto";

export interface ScrollbarLook {
  state: ScrollbarState;
  /** Width in px (0 when hidden). */
  width: number;
  /** CSS colors of the thumb, idle and hovered. */
  thumb: string;
  thumbHover: string;
}

export const DEFAULT_SCROLLBAR_WIDTH = 8;

export function scrollbarState(v: string | undefined): ScrollbarState {
  const s = (v ?? "").trim().toLowerCase();
  return s === "hidden" ? "hidden" : s === "auto" ? "auto" : "visible";
}

export function scrollbarLook(
  state: string | undefined,
  width: number | undefined,
  color: string | undefined,
  foreground: string,
): ScrollbarLook {
  const st = scrollbarState(state);
  const w = Number.isFinite(width) ? Math.round(Math.max(2, Math.min(32, width!))) : DEFAULT_SCROLLBAR_WIDTH;
  const c = color?.trim();
  return {
    state: st,
    width: st === "hidden" ? 0 : w,
    thumb: c || withAlpha(foreground, 0.3),
    thumbHover: c ? `color-mix(in srgb, ${c} 70%, ${foreground})` : withAlpha(foreground, 0.55),
  };
}

/** Auto mode shows the bar on scroll, except output scrolling while pinned to the bottom. */
export function revealsOnScroll(viewportY: number, baseY: number, wasScrolledUp: boolean): boolean {
  return viewportY < baseY || wasScrolledUp;
}
