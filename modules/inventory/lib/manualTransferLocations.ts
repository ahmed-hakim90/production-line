import type { DefaultItemLocation, InventoryItemType, StockLocationBalance } from '../types';
import { allocateProductionIssueFromLocations } from './productionIssueAllocation';

export function defaultItemLocationKey(itemType: string, itemId: string): string {
  return `${itemType}__${itemId}`;
}

export function indexDefaultItemLocations(
  rows: Array<Pick<DefaultItemLocation, 'itemType' | 'itemId' | 'locationId' | 'locationCode'>>,
): Map<string, Pick<DefaultItemLocation, 'locationId' | 'locationCode'>> {
  const map = new Map<string, Pick<DefaultItemLocation, 'locationId' | 'locationCode'>>();
  for (const row of rows) {
    const itemId = String(row.itemId || '').trim();
    if (!itemId || !row.locationId) continue;
    map.set(defaultItemLocationKey(row.itemType, itemId), {
      locationId: row.locationId,
      locationCode: row.locationCode,
    });
  }
  return map;
}

export type ResolvedTransferSourceSlice = {
  locationId?: string;
  locationCode?: string;
  quantity: number;
};

export type ResolveManualTransferSourceResult =
  | { ok: true; slices: ResolvedTransferSourceSlice[] }
  | { ok: false; error: string };

/**
 * Source location for manual warehouse transfer:
 * - prefer item default location when it covers the qty
 * - otherwise allocate from location balances (default preferred)
 * - if the warehouse has no locations, omit location fields
 */
export function resolveManualTransferSourceLocations(input: {
  itemName: string;
  itemType: InventoryItemType;
  itemId: string;
  quantity: number;
  warehouseHasLocations: boolean;
  defaultLocation?: Pick<DefaultItemLocation, 'locationId' | 'locationCode'> | null;
  locationBalances: StockLocationBalance[];
}): ResolveManualTransferSourceResult {
  const qty = Number(input.quantity || 0);
  if (!(qty > 0)) {
    return { ok: false, error: `كمية الصنف "${input.itemName}" غير صالحة.` };
  }
  if (!input.warehouseHasLocations) {
    return { ok: true, slices: [{ quantity: qty }] };
  }

  const preferredId = String(input.defaultLocation?.locationId || '').trim() || undefined;
  const itemBalances = input.locationBalances.filter(
    (row) =>
      row.itemType === input.itemType &&
      row.itemId === input.itemId &&
      Number(row.quantity || 0) > 0,
  );

  if (preferredId) {
    const preferred = itemBalances.find((row) => row.locationId === preferredId);
    const preferredQty = Number(preferred?.quantity || 0);
    if (preferredQty >= qty) {
      return {
        ok: true,
        slices: [{
          locationId: preferredId,
          locationCode: input.defaultLocation?.locationCode || preferred?.locationCode,
          quantity: qty,
        }],
      };
    }
  }

  const allocated = allocateProductionIssueFromLocations(itemBalances, qty, preferredId);
  if (allocated.shortageQty > 0 || allocated.allocations.length === 0) {
    if (preferredId && allocated.availableQty <= 0) {
      return {
        ok: false,
        error: `لا يوجد رصيد لوكيشن للصنف "${input.itemName}" (المربوط: ${input.defaultLocation?.locationCode || preferredId}).`,
      };
    }
    if (!preferredId && allocated.availableQty <= 0) {
      return {
        ok: false,
        error: `الصنف "${input.itemName}" غير مربوط برف في المخزن المصدر ولا يوجد رصيد لوكيشن متاح.`,
      };
    }
    return {
      ok: false,
      error: `رصيد اللوكيشن غير كافٍ للصنف "${input.itemName}" (المتاح ${allocated.availableQty}).`,
    };
  }

  return {
    ok: true,
    slices: allocated.allocations.map((row) => ({
      locationId: row.locationId,
      locationCode: row.locationCode,
      quantity: row.quantity,
    })),
  };
}

/** Destination location is optional — only set when the item is linked there. */
export function resolveManualTransferDestinationLocation(input: {
  itemType: InventoryItemType;
  itemId: string;
  defaultsByKey: Map<string, Pick<DefaultItemLocation, 'locationId' | 'locationCode'>>;
}): { toLocationId?: string; toLocationCode?: string } {
  const linked = input.defaultsByKey.get(defaultItemLocationKey(input.itemType, input.itemId));
  const toLocationId = String(linked?.locationId || '').trim();
  if (!toLocationId) return {};
  const toLocationCode = String(linked?.locationCode || '').trim();
  return toLocationCode
    ? { toLocationId, toLocationCode }
    : { toLocationId };
}
