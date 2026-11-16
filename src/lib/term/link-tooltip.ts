// Small hover hint over terminal links ("Ctrl+click to open"), shared by all panes.
const MOD = /Mac|iPhone|iPad/.test(navigator.userAgent) ? "Cmd" : "Ctrl";
const DELAY = 300;

let tip: HTMLDivElement | null = null;
let timer = 0;

export function showLinkTooltip(e: MouseEvent, what: string) {
  hideLinkTooltip();
  const x = e.clientX;
  const y = e.clientY;
  timer = window.setTimeout(() => {
    tip ??= Object.assign(document.createElement("div"), { className: "link-tooltip" });
    tip.textContent = `${MOD}+click to open ${what}`;
    document.body.appendChild(tip);
    const r = tip.getBoundingClientRect();
    const left = Math.min(x + 12, window.innerWidth - r.width - 4);
    const top = y + 20 + r.height > window.innerHeight ? y - r.height - 8 : y + 20;
    tip.style.left = `${Math.max(4, left)}px`;
    tip.style.top = `${Math.max(4, top)}px`;
  }, DELAY);
}

export function hideLinkTooltip() {
  clearTimeout(timer);
  tip?.remove();
}
