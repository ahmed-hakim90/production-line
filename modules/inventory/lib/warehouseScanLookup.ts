import type { InventoryItemType, StockItemBalance, StockLocationBalance, WarehouseLocation } from '../types';

export type WarehouseScanCatalogItem = {
  id: string;
  code: string;
  name: string;
  barcode?: string;
  itemType?: InventoryItemType;
};

export type WarehouseScanItemLocationQty = {
  locationId: string;
  locationCode: string;
  rackName?: string;
  quantity: number;
  unit?: string;
};

export type WarehouseScanItemHit = {
  kind: 'item';
  itemId: string;
  itemType: InventoryItemType;
  itemCode: string;
  itemName: string;
  barcode?: string;
  quantity: number;
  availableQty?: number;
  reservedQty?: number;
  minStock: number;
  unit?: string;
  locations: WarehouseScanItemLocationQty[];
  /** Present in catalog but no balance row in this warehouse. */
  catalogOnly?: boolean;
};

export type WarehouseScanLocationHit = {
  kind: 'location';
  locationId: string;
  locationCode: string;
  rackName?: string;
  shelf?: string;
  isActive: boolean;
  contents: Array<{
    itemId: string;
    itemType: InventoryItemType;
    itemCode: string;
    itemName: string;
    quantity: number;
    unit?: string;
  }>;
};

export type WarehouseScanLookupResult =
  | { status: 'empty' }
  | { status: 'location'; hit: WarehouseScanLocationHit }
  | { status: 'item'; hit: WarehouseScanItemHit }
  | { status: 'matches'; items: WarehouseScanItemHit[] }
  | { status: 'catalog_only'; items: WarehouseScanItemHit[] }
  | { status: 'not_found' };

export type WarehouseScanLookupInput = {
  query: string;
  /** Exact scan (Enter / barcode gun) — prefer exact location then exact item. */
  exact?: boolean;
  balances: StockItemBalance[];
  locationBalances: StockLocationBalance[];
  locations: WarehouseLocation[];
  catalogItems?: WarehouseScanCatalogItem[];
};

function norm(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function itemTypesCompatible(a?: InventoryItemType, b?: InventoryItemType): boolean {
  if (!a || !b) return true;
  if (a === b) return true;
  const soft = new Set(['material', 'raw_material']);
  return soft.has(a) && soft.has(b);
}

function buildLocationsForItem(
  locationBalances: StockLocationBalance[],
  itemId: string,
  itemType?: InventoryItemType,
): WarehouseScanItemLocationQty[] {
  const id = String(itemId || '').trim();
  if (!id) return [];
  return locationBalances
    .filter((row) => {
      if (String(row.itemId || '').trim() !== id) return false;
      return itemTypesCompatible(itemType, row.itemType);
    })
    .map((row) => ({
      locationId: String(row.locationId || ''),
      locationCode: String(row.locationCode || ''),
      rackName: row.rackName || row.rack,
      quantity: Number(row.quantity || 0),
      unit: row.unit,
    }))
    .filter((row) => row.locationId || row.locationCode)
    .sort((a, b) => b.quantity - a.quantity || a.locationCode.localeCompare(b.locationCode, 'ar'));
}

function balanceToHit(
  row: StockItemBalance,
  locationBalances: StockLocationBalance[],
): WarehouseScanItemHit {
  return {
    kind: 'item',
    itemId: String(row.itemId || ''),
    itemType: row.itemType,
    itemCode: String(row.itemCode || ''),
    itemName: String(row.itemName || ''),
    quantity: Number(row.quantity || 0),
    availableQty: row.availableQty,
    reservedQty: row.reservedQty,
    minStock: Number(row.minStock || 0),
    unit: row.unit,
    locations: buildLocationsForItem(locationBalances, row.itemId, row.itemType),
  };
}

function catalogToHit(
  row: WarehouseScanCatalogItem,
  locationBalances: StockLocationBalance[],
): WarehouseScanItemHit {
  const itemType = row.itemType || 'material';
  return {
    kind: 'item',
    itemId: String(row.id || ''),
    itemType,
    itemCode: String(row.code || ''),
    itemName: String(row.name || ''),
    barcode: row.barcode ? String(row.barcode) : undefined,
    quantity: 0,
    minStock: 0,
    locations: buildLocationsForItem(locationBalances, row.id, itemType),
    catalogOnly: true,
  };
}

function findExactLocation(
  locations: WarehouseLocation[],
  locationBalances: StockLocationBalance[],
  code: string,
): WarehouseScanLocationHit | null {
  const needle = norm(code);
  if (!needle) return null;
  const loc = locations.find((row) => norm(row.code) === needle);
  if (!loc?.id) return null;
  const contents = locationBalances
    .filter((row) => String(row.locationId || '') === loc.id)
    .map((row) => ({
      itemId: String(row.itemId || ''),
      itemType: row.itemType,
      itemCode: String(row.itemCode || ''),
      itemName: String(row.itemName || ''),
      quantity: Number(row.quantity || 0),
      unit: row.unit,
    }))
    .filter((row) => row.itemId)
    .sort((a, b) => b.quantity - a.quantity || a.itemName.localeCompare(b.itemName, 'ar'));

  return {
    kind: 'location',
    locationId: String(loc.id),
    locationCode: String(loc.code || ''),
    rackName: loc.rackName || loc.rack,
    shelf: loc.shelfName || loc.shelf,
    isActive: loc.isActive !== false,
    contents,
  };
}

function findExactBalance(
  balances: StockItemBalance[],
  catalogItems: WarehouseScanCatalogItem[],
  code: string,
): StockItemBalance | WarehouseScanCatalogItem | null {
  const needle = norm(code);
  if (!needle) return null;
  const fromBalance = balances.find((row) => norm(row.itemCode) === needle);
  if (fromBalance) return fromBalance;

  const fromCatalog = catalogItems.find((row) => {
    if (norm(row.code) === needle) return true;
    return Boolean(row.barcode) && norm(row.barcode) === needle;
  });
  if (!fromCatalog) return null;

  const balanceForCatalog = balances.find((row) => String(row.itemId || '') === String(fromCatalog.id || ''));
  if (balanceForCatalog) return balanceForCatalog;
  return fromCatalog;
}

/**
 * Resolve warehouse scan/search query.
 * Exact mode (scanner Enter): location code → item code/barcode → not_found.
 * Search mode: partial name/code matches (min 2 chars), with catalog-only fallback.
 */
export function resolveWarehouseScanLookup(input: WarehouseScanLookupInput): WarehouseScanLookupResult {
  const raw = String(input.query || '').trim();
  if (!raw) return { status: 'empty' };

  const balances = input.balances || [];
  const locationBalances = input.locationBalances || [];
  const locations = input.locations || [];
  const catalogItems = input.catalogItems || [];
  const exact = Boolean(input.exact);

  if (exact) {
    const locationHit = findExactLocation(locations, locationBalances, raw);
    if (locationHit) return { status: 'location', hit: locationHit };

    const itemHit = findExactBalance(balances, catalogItems, raw);
    if (itemHit && 'itemId' in itemHit && 'quantity' in itemHit) {
      const hit = balanceToHit(itemHit as StockItemBalance, locationBalances);
      // Attach barcode from catalog when available
      const cat = catalogItems.find((c) => c.id === hit.itemId);
      if (cat?.barcode) hit.barcode = String(cat.barcode);
      return { status: 'item', hit };
    }
    if (itemHit && 'id' in itemHit) {
      return { status: 'item', hit: catalogToHit(itemHit as WarehouseScanCatalogItem, locationBalances) };
    }
    return { status: 'not_found' };
  }

  // Non-exact: also try exact location first when full code typed
  const locationHit = findExactLocation(locations, locationBalances, raw);
  if (locationHit) return { status: 'location', hit: locationHit };

  const exactItem = findExactBalance(balances, catalogItems, raw);
  if (exactItem && 'itemId' in exactItem && 'quantity' in exactItem) {
    const hit = balanceToHit(exactItem as StockItemBalance, locationBalances);
    const cat = catalogItems.find((c) => c.id === hit.itemId);
    if (cat?.barcode) hit.barcode = String(cat.barcode);
    return { status: 'item', hit };
  }
  if (exactItem && 'id' in exactItem) {
    return { status: 'item', hit: catalogToHit(exactItem as WarehouseScanCatalogItem, locationBalances) };
  }

  const needle = norm(raw);
  if (needle.length < 2) return { status: 'empty' };

  const matches = balances
    .filter((row) => {
      const hay = `${row.itemName} ${row.itemCode}`.toLowerCase();
      return hay.includes(needle);
    })
    .slice(0, 12)
    .map((row) => {
      const hit = balanceToHit(row, locationBalances);
      const cat = catalogItems.find((c) => c.id === hit.itemId);
      if (cat?.barcode) hit.barcode = String(cat.barcode);
      return hit;
    });

  if (matches.length > 0) return { status: 'matches', items: matches };

  const inStock = new Set(balances.map((row) => row.itemId));
  const catalogOnly = catalogItems
    .filter((row) => {
      if (inStock.has(row.id)) return false;
      const hay = `${row.name} ${row.code} ${row.barcode || ''}`.toLowerCase();
      return hay.includes(needle);
    })
    .slice(0, 8)
    .map((row) => catalogToHit(row, locationBalances));

  if (catalogOnly.length > 0) return { status: 'catalog_only', items: catalogOnly };
  return { status: 'not_found' };
}

/** Preferred printable code for an item label: barcode if set, else item code. */
export function resolveItemLabelCode(item: { itemCode?: string; barcode?: string; code?: string }): string {
  const barcode = String(item.barcode || '').trim();
  if (barcode) return barcode;
  return String(item.itemCode || item.code || '').trim();
}
