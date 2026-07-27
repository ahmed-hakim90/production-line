/**
 * Project-wide binary search helpers for sorted string keys / UI search indexes.
 * Prefer these over linear `.filter(...includes)` for large sorted lists and global search.
 */

export type CompareFn<T> = (a: T, b: T) => number;

export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** First index where sorted[i] >= target (lower bound). */
export function binarySearchLowerBound<T>(
  sorted: readonly T[],
  target: string,
  getKey: (item: T) => string,
): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareStrings(getKey(sorted[mid]), target) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index where sorted[i] > target (upper bound). */
export function binarySearchUpperBound<T>(
  sorted: readonly T[],
  target: string,
  getKey: (item: T) => string,
): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareStrings(getKey(sorted[mid]), target) <= 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Exact match index, or -1. Assumes `sorted` is ascending by getKey. */
export function binarySearchExact<T>(
  sorted: readonly T[],
  target: string,
  getKey: (item: T) => string,
): number {
  const lo = binarySearchLowerBound(sorted, target, getKey);
  if (lo < sorted.length && getKey(sorted[lo]) === target) return lo;
  return -1;
}

/**
 * All items whose key starts with `prefix` (case-sensitive on the key you pass).
 * Assumes `sorted` is ascending by getKey.
 */
export function binarySearchPrefixRange<T>(
  sorted: readonly T[],
  prefix: string,
  getKey: (item: T) => string,
): T[] {
  if (!prefix) return sorted.slice() as T[];
  const lo = binarySearchLowerBound(sorted, prefix, getKey);
  // Upper bound for prefix: next string after all keys starting with prefix
  // Scan from lo while startsWith — O(k) for k matches, still O(log n) to locate.
  const out: T[] = [];
  for (let i = lo; i < sorted.length; i++) {
    const key = getKey(sorted[i]);
    if (!key.startsWith(prefix)) break;
    out.push(sorted[i]);
  }
  return out;
}

export interface SearchIndexEntry {
  /** Normalized lowercase search key (full field or token). */
  key: string;
  /** Index into the original items array. */
  itemIndex: number;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Build a sorted token index for binary prefix search.
 * Indexes each field and each whitespace-separated token so mid-phrase words match.
 * Also indexes Arabic tokens without a leading ال for friendlier prefix queries.
 */
export function buildBinarySearchIndex<T>(
  items: readonly T[],
  getFields: (item: T) => readonly string[],
): SearchIndexEntry[] {
  const entries: SearchIndexEntry[] = [];

  const pushKey = (key: string, itemIndex: number) => {
    if (!key) return;
    entries.push({ key, itemIndex });
  };

  items.forEach((item, itemIndex) => {
    for (const field of getFields(item)) {
      const normalized = normalizeSearchText(String(field ?? ''));
      if (!normalized) continue;
      pushKey(normalized, itemIndex);
      for (const token of normalized.split(/\s+/)) {
        if (!token || token === normalized) continue;
        pushKey(token, itemIndex);
        if (token.startsWith('ال') && token.length > 2) {
          pushKey(token.slice(2), itemIndex);
        }
      }
      if (normalized.startsWith('ال') && normalized.length > 2 && !normalized.includes(' ')) {
        pushKey(normalized.slice(2), itemIndex);
      }
    }
  });
  entries.sort((a, b) => {
    const byKey = compareStrings(a.key, b.key);
    return byKey !== 0 ? byKey : a.itemIndex - b.itemIndex;
  });
  return entries;
}

/**
 * Filter items using binary prefix search over a prebuilt (or ad-hoc) index.
 * Empty query returns all items (caller may slice).
 */
export function binaryFilterItems<T>(
  items: readonly T[],
  query: string,
  getFields: (item: T) => readonly string[],
  options?: { index?: readonly SearchIndexEntry[]; limit?: number },
): T[] {
  const q = normalizeSearchText(query);
  if (!q) {
    return options?.limit != null ? (items.slice(0, options.limit) as T[]) : (items.slice() as T[]);
  }

  const index = options?.index ?? buildBinarySearchIndex(items, getFields);
  const matches = binarySearchPrefixRange(index, q, (e) => e.key);
  const seen = new Set<number>();
  const out: T[] = [];
  for (const entry of matches) {
    if (seen.has(entry.itemIndex)) continue;
    seen.add(entry.itemIndex);
    out.push(items[entry.itemIndex]);
    if (options?.limit != null && out.length >= options.limit) break;
  }
  return out;
}
