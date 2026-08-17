/** Minimum characters before a lookup panel lists warehouse items. */
export const ITEM_SEARCH_MIN_CHARS = 2;

export function itemSearchQuery(query: string): string {
  return String(query || '').trim();
}

export function hasActiveItemSearch(query: string): boolean {
  return itemSearchQuery(query).length >= ITEM_SEARCH_MIN_CHARS;
}

/** Client-side item lookup on a warehouse-scoped list (name / code / barcode). */
export function matchesItemSearch(
  row: { itemName?: string; itemCode?: string; barcode?: string },
  query: string,
): boolean {
  const q = itemSearchQuery(query).toLowerCase();
  if (!q) return true;
  return [row.itemName, row.itemCode, row.barcode].some((value) =>
    String(value || '').toLowerCase().includes(q),
  );
}
