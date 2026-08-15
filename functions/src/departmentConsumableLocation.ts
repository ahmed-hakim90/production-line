export type ConsumableLocationBalance = {
  locationId: string;
  locationCode?: string;
  quantity: number;
  lastMovementAt?: string;
  updatedAt?: string;
};

export type ConsumableLocationSlice = {
  locationId?: string;
  locationCode?: string;
  quantity: number;
};

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Oldest movement first; preferred shelf wins when it has stock. */
export function allocateConsumableIssueFromStock(input: {
  requiredQty: number;
  warehouseQty: number;
  locationBalances: ConsumableLocationBalance[];
  preferredLocationId?: string;
}): { slices: ConsumableLocationSlice[]; availableQty: number; error?: string } {
  const requiredQty = toNumber(input.requiredQty);
  const warehouseQty = Math.max(0, toNumber(input.warehouseQty));
  const preferredId = String(input.preferredLocationId || '').trim();
  const sorted = [...input.locationBalances]
    .filter((row) => String(row.locationId || '').trim() && toNumber(row.quantity) > 0)
    .sort((a, b) => {
      if (preferredId) {
        if (a.locationId === preferredId && b.locationId !== preferredId) return -1;
        if (b.locationId === preferredId && a.locationId !== preferredId) return 1;
      }
      return String(a.lastMovementAt || a.updatedAt || '').localeCompare(
        String(b.lastMovementAt || b.updatedAt || ''),
      );
    });
  const locationQty = sorted.reduce((sum, row) => sum + toNumber(row.quantity), 0);
  const availableQty = Math.max(warehouseQty, locationQty);
  if (!(requiredQty > 0)) {
    return { slices: [], availableQty, error: 'كمية غير صالحة.' };
  }
  if (availableQty + 0.000001 < requiredQty) {
    return {
      slices: [],
      availableQty,
      error: `الرصيد غير كافٍ (المتاح ${availableQty}).`,
    };
  }

  const slices: ConsumableLocationSlice[] = [];
  let remaining = requiredQty;
  for (const row of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, toNumber(row.quantity));
    if (!(take > 0)) continue;
    slices.push({
      locationId: row.locationId,
      locationCode: row.locationCode || row.locationId,
      quantity: take,
    });
    remaining -= take;
  }
  if (remaining > 0) {
    slices.push({ quantity: remaining });
  }
  return { slices, availableQty };
}

/** Destination shelf for inbound consumable stock: default → existing qty → first active. */
export function resolveConsumableAddLocation(input: {
  locations: Array<{ id: string; code?: string }>;
  defaultLocationId?: string;
  locationBalances: ConsumableLocationBalance[];
}): { locationId: string; locationCode: string } | null {
  const active = input.locations
    .map((loc) => ({
      id: String(loc.id || '').trim(),
      code: String(loc.code || loc.id || '').trim(),
    }))
    .filter((loc) => loc.id);
  if (active.length === 0) return null;

  const byId = new Map(active.map((loc) => [loc.id, loc]));
  const preferred = String(input.defaultLocationId || '').trim();
  if (preferred && byId.has(preferred)) {
    const loc = byId.get(preferred)!;
    return { locationId: loc.id, locationCode: loc.code || loc.id };
  }

  const withStock = [...input.locationBalances]
    .filter((row) => byId.has(String(row.locationId || '').trim()) && toNumber(row.quantity) > 0)
    .sort((a, b) => toNumber(b.quantity) - toNumber(a.quantity));
  if (withStock[0]) {
    const loc = byId.get(String(withStock[0].locationId).trim())!;
    return {
      locationId: loc.id,
      locationCode: withStock[0].locationCode || loc.code || loc.id,
    };
  }

  const first = [...active].sort((a, b) => a.code.localeCompare(b.code, 'ar'))[0];
  return { locationId: first.id, locationCode: first.code || first.id };
}
