import type { InventoryItemType, StockItemBalance, StockLocationBalance, DefaultItemLocation } from '../types';
import { balanceKey } from './stockLabels';
import { defaultItemLocationService } from '../services/defaultItemLocationService';
import { stockService } from '../services/stockService';

export type WarehouseCountSheetRow = {
  id: string;
  code: string;
  name: string;
  quantity: number;
  location: string;
};

type LocationSourceRow = {
  warehouseId?: string;
  itemType?: string;
  itemId?: string;
  locationCode?: string;
  quantity?: number;
};

function pushCode(map: Map<string, string[]>, key: string, code: string) {
  const list = map.get(key) || [];
  if (!list.includes(code)) list.push(code);
  map.set(key, list);
}

function flattenCodes(map: Map<string, string[]>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, codes] of map) {
    if (codes.length) out.set(key, codes.join('، '));
  }
  return out;
}

/**
 * Defaults override location-balance labels.
 * Keys: balanceKey(warehouse, itemType, itemId) and itemId (fallback).
 */
export function buildWarehouseLocationLabelMap(input: {
  warehouseId: string;
  defaults?: Array<Pick<DefaultItemLocation, 'warehouseId' | 'itemType' | 'itemId' | 'locationCode'>>;
  locationBalances?: Array<Pick<StockLocationBalance, 'warehouseId' | 'itemType' | 'itemId' | 'locationCode' | 'quantity'>>;
}): Map<string, string> {
  const warehouseId = String(input.warehouseId || '').trim();
  const codes = new Map<string, string[]>();

  const indexRow = (row: LocationSourceRow, requirePositiveQty: boolean) => {
    const itemId = String(row.itemId || '').trim();
    const code = String(row.locationCode || '').trim();
    if (!itemId || !code) return;
    if (requirePositiveQty && !(Number(row.quantity || 0) > 0)) return;
    const wh = String(row.warehouseId || warehouseId).trim() || warehouseId;
    const itemType = String(row.itemType || '').trim();
    if (wh && itemType) pushCode(codes, balanceKey(wh, itemType as InventoryItemType, itemId), code);
    pushCode(codes, itemId, code);
  };

  for (const row of input.locationBalances || []) indexRow(row, true);
  const merged = flattenCodes(codes);

  for (const row of input.defaults || []) {
    const itemId = String(row.itemId || '').trim();
    const code = String(row.locationCode || '').trim();
    if (!itemId || !code) continue;
    const wh = String(row.warehouseId || warehouseId).trim() || warehouseId;
    const itemType = String(row.itemType || '').trim();
    if (wh && itemType) merged.set(balanceKey(wh, itemType as InventoryItemType, itemId), code);
    merged.set(itemId, code);
  }

  return merged;
}

export function resolveWarehouseItemLocation(
  locationByKey: Map<string, string> | ReadonlyMap<string, string>,
  row: Pick<StockItemBalance, 'warehouseId' | 'itemType' | 'itemId'>,
): string {
  const itemId = String(row.itemId || '').trim();
  if (!itemId) return '—';
  const key = balanceKey(row.warehouseId, row.itemType, itemId);
  const altMaterial = balanceKey(row.warehouseId, 'material', itemId);
  const altRaw = balanceKey(row.warehouseId, 'raw_material', itemId);
  const label = locationByKey.get(key)
    || locationByKey.get(altMaterial)
    || locationByKey.get(altRaw)
    || locationByKey.get(itemId)
    || '';
  return String(label).trim() || '—';
}

export function balancesToCountSheetRows(
  balances: StockItemBalance[],
  locationByKey: Map<string, string> | ReadonlyMap<string, string> = new Map(),
): WarehouseCountSheetRow[] {
  return [...balances]
    .map((row) => {
      const key = balanceKey(row.warehouseId, row.itemType, row.itemId);
      return {
        id: row.id || key,
        code: String(row.itemCode || '').trim() || '—',
        name: String(row.itemName || '').trim() || '—',
        quantity: Number(row.quantity || 0),
        location: resolveWarehouseItemLocation(locationByKey, row),
      };
    })
    .sort((a, b) => {
      const loc = a.location.localeCompare(b.location, 'ar');
      if (loc !== 0) return loc;
      return a.name.localeCompare(b.name, 'ar');
    });
}

export async function loadWarehouseCountLocationLabels(
  warehouseId: string,
): Promise<Map<string, string>> {
  const id = String(warehouseId || '').trim();
  if (!id) return new Map();
  const [defaults, locationBalances] = await Promise.all([
    defaultItemLocationService.getAll(id).catch(() => []),
    stockService.getLocationBalances({ warehouseId: id }).catch(() => []),
  ]);
  return buildWarehouseLocationLabelMap({
    warehouseId: id,
    defaults,
    locationBalances,
  });
}
