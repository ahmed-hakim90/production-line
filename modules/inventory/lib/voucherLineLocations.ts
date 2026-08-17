import type { InventoryItemType, StockLocationBalance } from '../types';

export type VoucherLocationSelectOption = {
  value: string;
  label: string;
  quantity: number;
};

export type ActiveWarehouseLocation = {
  id?: string;
  warehouseId: string;
  code: string;
  rackId?: string;
  rackName?: string;
  rack?: string;
  shelfName?: string;
  shelf?: string;
  isActive?: boolean;
};

function formatLocationBaseLabel(loc: ActiveWarehouseLocation): string {
  const rack = loc.rackName || loc.rack || '—';
  const shelf = loc.shelfName || loc.shelf || '—';
  return `${loc.code} (راك ${rack} / رف ${shelf})`;
}

function formatQty(value: number): string {
  return Number(value || 0).toLocaleString('ar-EG');
}

/**
 * Build shelf options for a voucher line from location balances.
 * OUT: only shelves with qty > 0.
 * IN: shelves that already hold the item; if none, fall back to all active shelves.
 */
export function buildVoucherLineLocationOptions(params: {
  locations: ActiveWarehouseLocation[];
  locationBalances: StockLocationBalance[];
  warehouseId: string;
  itemId: string;
  itemType?: InventoryItemType;
  movementType: 'IN' | 'OUT';
  inactiveRackIds?: Set<string>;
}): VoucherLocationSelectOption[] {
  const warehouseId = String(params.warehouseId || '').trim();
  const itemId = String(params.itemId || '').trim();
  const inactiveRackIds = params.inactiveRackIds || new Set<string>();

  const activeLocations = params.locations.filter(
    (loc) =>
      loc.id
      && loc.warehouseId === warehouseId
      && loc.isActive !== false
      && (!loc.rackId || !inactiveRackIds.has(loc.rackId)),
  );

  if (!itemId || activeLocations.length === 0) {
    return activeLocations.map((loc) => ({
      value: String(loc.id),
      label: formatLocationBaseLabel(loc),
      quantity: 0,
    }));
  }

  const qtyByLocationId = new Map<string, number>();
  for (const row of params.locationBalances) {
    if (String(row.warehouseId) !== warehouseId) continue;
    if (String(row.itemId) !== itemId) continue;
    if (params.itemType && row.itemType !== params.itemType) continue;
    const locationId = String(row.locationId || '').trim();
    if (!locationId) continue;
    qtyByLocationId.set(locationId, Number(row.quantity || 0) + (qtyByLocationId.get(locationId) || 0));
  }

  const withStock = activeLocations
    .map((loc) => {
      const locationId = String(loc.id);
      const quantity = qtyByLocationId.get(locationId) || 0;
      return {
        value: locationId,
        label: `${formatLocationBaseLabel(loc)} — متاح: ${formatQty(quantity)}`,
        quantity,
      };
    })
    .filter((opt) => opt.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity || a.label.localeCompare(b.label, 'ar'));

  if (params.movementType === 'OUT') {
    return withStock;
  }

  // IN: prefer shelves that already hold the item; otherwise all active shelves.
  if (withStock.length > 0) return withStock;

  return activeLocations.map((loc) => ({
    value: String(loc.id),
    label: formatLocationBaseLabel(loc),
    quantity: 0,
  }));
}

/** Prefer default location when present in options; otherwise highest qty. */
export function pickPreferredVoucherLocationId(params: {
  options: VoucherLocationSelectOption[];
  preferredLocationId?: string;
}): string {
  const preferred = String(params.preferredLocationId || '').trim();
  if (preferred && params.options.some((opt) => opt.value === preferred)) {
    return preferred;
  }
  return params.options[0]?.value || '';
}

export function getLocationBalanceQty(params: {
  locationBalances: StockLocationBalance[];
  warehouseId: string;
  locationId: string;
  itemId: string;
  itemType?: InventoryItemType;
}): number {
  const warehouseId = String(params.warehouseId || '').trim();
  const locationId = String(params.locationId || '').trim();
  const itemId = String(params.itemId || '').trim();
  if (!warehouseId || !locationId || !itemId) return 0;
  let total = 0;
  for (const row of params.locationBalances) {
    if (String(row.warehouseId) !== warehouseId) continue;
    if (String(row.locationId) !== locationId) continue;
    if (String(row.itemId) !== itemId) continue;
    if (params.itemType && row.itemType !== params.itemType) continue;
    total += Number(row.quantity || 0);
  }
  return total;
}
