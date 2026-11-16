// xterm link provider underlining file paths; Ctrl/Cmd+click activates.
import type { IBufferCellPosition, ILink, ILinkProvider, Terminal } from "@xterm/xterm";
import { findFileLinks, type FileLink } from "../file-links";
import { hideLinkTooltip, showLinkTooltip } from "./link-tooltip";

const MAX_ROWS = 32;

export function fileLinkProvider(term: Terminal, open: (link: FileLink) => void): ILinkProvider {
  return {
    provideLinks(y, callback) {
      const buf = term.buffer.active;
      // Join the wrapped rows around `y` (1-based) and map each char back to its cell.
      let first = y - 1;
      while (first > 0 && buf.getLine(first)?.isWrapped && y - 1 - first < MAX_ROWS) first--;
      let text = "";
      const cells: IBufferCellPosition[] = [];
      for (let row = first; row < first + MAX_ROWS; row++) {
        const line = buf.getLine(row);
        if (!line || (row > first && !line.isWrapped)) break;
        for (let x = 0; x < line.length; x++) {
          const cell = line.getCell(x);
          if (!cell || cell.getWidth() === 0) continue;
          const ch = cell.getChars() || " ";
          for (let i = 0; i < ch.length; i++) cells.push({ x: x + 1, y: row + 1 });
          text += ch;
        }
      }
      const links: ILink[] = [];
      for (const l of findFileLinks(text)) {
        const start = cells[l.start];
        const end = cells[l.end - 1];
        if (!start || !end || (start.y > y || end.y < y)) continue;
        links.push({
          range: { start, end },
          text: text.slice(l.start, l.end),
          decorations: { pointerCursor: true, underline: true },
          hover: (e) => showLinkTooltip(e, "file"),
          leave: hideLinkTooltip,
          activate: (e) => {
            hideLinkTooltip();
            if (e.ctrlKey || e.metaKey) open(l);
          },
        });
      }
      callback(links.length ? links : undefined);
    },
  };
}
