const MOTION_EVENT = "tabmotion";
/** Covers the longest tab transition/animation. */
const MOTION_MS = 250;

/** Tell the baseline tracker of `list` that tabs are moving without layout changes. */
export function notifyTabMotion(list: HTMLElement) {
  list.dispatchEvent(new Event(MOTION_EVENT));
}

/**
 * Baseline under/beside the tab strip: publishes the active tab's edges on `host` as
 * `--a0` / `--a1` (px, host coordinates along `axis`) and, for a colored tab, its outline
 * `--tab-bg` as `--tab-ind`. Returns a cleanup function.
 */
export function trackActiveTab(host: HTMLElement, list: HTMLElement, axis: "x" | "y", selector = ".tab.active"): () => void {
  const clear = () => {
    for (const p of ["--a0", "--a1", "--tab-ind"]) host.style.removeProperty(p);
  };
  const sync = () => {
    const act = list.querySelector<HTMLElement>(selector);
    if (!act) return clear();
    const h = host.getBoundingClientRect();
    const r = act.getBoundingClientRect();
    const [a0, a1] = axis === "x" ? [r.left - h.left, r.right - h.left] : [r.top - h.top, r.bottom - h.top];
    host.style.setProperty("--a0", `${a0}px`);
    host.style.setProperty("--a1", `${a1}px`);
    // Colored tab: match its outline color. Read the inline target, not the computed
    // background, which lags behind during its transition.
    const bg = act.classList.contains("colored") && act.style.getPropertyValue("--tab-bg");
    if (bg) host.style.setProperty("--tab-ind", bg);
    else host.style.removeProperty("--tab-ind");
  };
  sync();
  const ro = new ResizeObserver(sync);
  ro.observe(host);
  for (const el of list.querySelectorAll(".tab")) ro.observe(el);
  list.addEventListener("scroll", sync, { passive: true });
  // Tabs moving via transforms (drag, reorder glide) don't trigger the observer: follow them per frame.
  let until = 0;
  let raf = 0;
  const tick = () => {
    sync();
    raf = performance.now() < until ? requestAnimationFrame(tick) : 0;
  };
  const onMotion = () => {
    until = performance.now() + MOTION_MS;
    if (!raf) raf = requestAnimationFrame(tick);
  };
  list.addEventListener(MOTION_EVENT, onMotion);
  return () => {
    ro.disconnect();
    cancelAnimationFrame(raf);
    list.removeEventListener("scroll", sync);
    list.removeEventListener(MOTION_EVENT, onMotion);
    clear();
  };
}
