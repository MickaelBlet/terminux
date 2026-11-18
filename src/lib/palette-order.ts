// Command palette ordering: recently used entries and alphabetical sort.

export const RECENT_MAX = 8;

/** Moves `key` to the front of the recent list, dropping duplicates and the overflow. */
export function pushRecent(list: readonly string[], key: string, max = RECENT_MAX): string[] {
  return [key, ...list.filter((k) => k !== key)].slice(0, max);
}

/** Validates a stored recent list. */
export function asRecent(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((k): k is string => typeof k === "string").slice(0, RECENT_MAX) : [];
}

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** Case-insensitive natural order on labels; stable for equal labels. */
export function sortByLabel<T>(items: readonly T[], label: (it: T) => string): T[] {
  return [...items].sort((a, b) => collator.compare(label(a), label(b)));
}

/**
 * Splits an unfiltered list into recently used entries (most recent first) and the rest
 * (original order, or alphabetical when `alpha`). Recent keys absent from `items` are skipped.
 */
export function orderItems<T>(
  items: readonly T[],
  key: (it: T) => string,
  label: (it: T) => string,
  recent: readonly string[],
  alpha: boolean,
): { recent: T[]; rest: T[] } {
  const byKey = new Map<string, T>();
  for (const it of items) if (!byKey.has(key(it))) byKey.set(key(it), it);
  const top = recent.map((k) => byKey.get(k)).filter((it): it is T => it !== undefined);
  const used = new Set(top);
  const rest = items.filter((it) => !used.has(it));
  return { recent: top, rest: alpha ? sortByLabel(rest, label) : rest };
}
