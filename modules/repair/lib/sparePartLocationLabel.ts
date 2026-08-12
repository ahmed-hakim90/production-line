/**
 * Resolve warehouse shelf location labels for spare-parts inventory / count print.
 * Primary: default_item_locations. Fallback: stock_location_balances with qty > 0.
 */

export type SparePartLocationDefaultInput = {
  itemId: string;
  locationCode?: string;
};

export type SparePartLocationBalanceInput = {
  itemId: string;
  locationCode?: string;
  quantity?: number;
};

/** Build itemId → display label map (defaults override balance-derived labels). */
export function buildSparePartLocationLabelMap(input: {
  defaults?: SparePartLocationDefaultInput[];
  balances?: SparePartLocationBalanceInput[];
}): Map<string, string> {
  const map = new Map<string, string>();

  const codesByItem = new Map<string, string[]>();
  for (const row of input.balances || []) {
    const itemId = String(row.itemId || '').trim();
    const code = String(row.locationCode || '').trim();
    const qty = Number(row.quantity || 0);
    if (!itemId || !code || !(qty > 0)) continue;
    const list = codesByItem.get(itemId) || [];
    if (!list.includes(code)) list.push(code);
    codesByItem.set(itemId, list);
  }
  for (const [itemId, codes] of codesByItem) {
    map.set(itemId, codes.join('، '));
  }

  for (const row of input.defaults || []) {
    const itemId = String(row.itemId || '').trim();
    const code = String(row.locationCode || '').trim();
    if (!itemId || !code) continue;
    map.set(itemId, code);
  }

  return map;
}

export function resolveSparePartCatalogItemId(part: {
  materialId?: string;
  rawMaterialId?: string;
}): string {
  return String(part.materialId || part.rawMaterialId || '').trim();
}

/** Label for a spare part, or "—" when unlinked / no shelf location. */
export function resolveSparePartLocationLabel(input: {
  materialId?: string;
  rawMaterialId?: string;
  locationByItemId: Map<string, string> | ReadonlyMap<string, string>;
}): string {
  const itemId = resolveSparePartCatalogItemId(input);
  if (!itemId) return '—';
  const label = String(input.locationByItemId.get(itemId) || '').trim();
  return label || '—';
}
