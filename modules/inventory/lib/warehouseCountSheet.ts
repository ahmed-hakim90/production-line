import type {
  DefaultItemLocation,
  InventoryItemType,
  StockItemBalance,
  StockLocationBalance,
  WarehouseLocation,
  WarehouseRack,
} from '../types';
import { balanceKey } from './stockLabels';
import { defaultItemLocationService } from '../services/defaultItemLocationService';
import { stockService } from '../services/stockService';
import { warehouseLocationService } from '../services/warehouseLocationService';
import { warehouseRackService } from '../services/warehouseRackService';

export type WarehouseCountSheetRow = {
  id: string;
  code: string;
  name: string;
  quantity: number;
  location: string;
  rack?: string;
  shelf?: string;
};

export type WarehouseCountSheetScope = 'warehouse' | 'rack' | 'shelf';

function normalizeCountKey(value: string | undefined | null): string {
  return String(value || '').trim().toLowerCase();
}

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

export function locationBelongsToRack(
  loc: Pick<WarehouseLocation, 'rackId' | 'rackCode' | 'rackName' | 'rack'> | Pick<
    StockLocationBalance,
    'rackId' | 'rackCode' | 'rackName' | 'rack'
  >,
  rack: Pick<WarehouseRack, 'id' | 'code' | 'name'>,
): boolean {
  const rackId = String(rack.id || '').trim();
  if (rackId && String(loc.rackId || '').trim() === rackId) return true;
  const rackCode = normalizeCountKey(rack.code);
  const locCode = normalizeCountKey(loc.rackCode || loc.rack);
  if (rackCode && locCode && locCode === rackCode) return true;
  const rackName = normalizeCountKey(rack.name);
  const locName = normalizeCountKey(loc.rackName);
  return Boolean(rackName && locName && locName === rackName);
}

export function locationMatchesShelf(
  loc: Pick<WarehouseLocation, 'id' | 'code'> | Pick<StockLocationBalance, 'locationId' | 'locationCode'>,
  shelf: Pick<WarehouseLocation, 'id' | 'code'>,
): boolean {
  const shelfId = String(shelf.id || '').trim();
  const locId = String(('locationId' in loc ? loc.locationId : loc.id) || '').trim();
  if (shelfId && locId && locId === shelfId) return true;
  const shelfCode = normalizeCountKey(shelf.code);
  const locCode = normalizeCountKey(('locationCode' in loc ? loc.locationCode : loc.code) || '');
  return Boolean(shelfCode && locCode && locCode === shelfCode);
}

function locationSortKey(loc: WarehouseLocation): string {
  return [
    loc.rackCode || loc.rackName || loc.rack || '',
    loc.shelfCode || loc.shelfName || loc.shelf || '',
    loc.code || '',
  ].join('\u0000');
}

type ShelfLike = {
  id?: string;
  code?: string;
  rack?: string;
  rackName?: string;
  shelf?: string;
  shelfName?: string;
};

function emptyShelfRow(loc: ShelfLike): WarehouseCountSheetRow {
  const location = String(loc.code || '').trim() || '—';
  return {
    id: `empty:${loc.id || location}`,
    code: '—',
    name: '—',
    quantity: 0,
    location,
    rack: String(loc.rackName || loc.rack || '').trim() || undefined,
    shelf: String(loc.shelfName || loc.shelf || loc.code || '').trim() || undefined,
  };
}

function shelfCoveredByCatalog(
  row: StockLocationBalance,
  shelves: WarehouseLocation[],
): boolean {
  return shelves.some((shelf) => locationMatchesShelf(row, shelf));
}

export function locationBalancesToCountSheetRows(
  balances: StockLocationBalance[],
): WarehouseCountSheetRow[] {
  return [...balances]
    .filter((row) => String(row.itemId || '').trim())
    .map((row) => {
      const location = String(row.locationCode || '').trim() || '—';
      return {
        id: row.id || `${row.locationId || location}__${row.itemType}__${row.itemId}`,
        code: String(row.itemCode || '').trim() || '—',
        name: String(row.itemName || '').trim() || '—',
        quantity: Number(row.quantity || 0),
        location,
        rack: String(row.rackName || row.rack || '').trim() || undefined,
        shelf: String(row.shelfName || row.shelf || '').trim() || undefined,
      };
    })
    .sort((a, b) => {
      const loc = a.location.localeCompare(b.location, 'ar');
      if (loc !== 0) return loc;
      return a.name.localeCompare(b.name, 'ar');
    });
}

export function buildCountSheetRowsForScope(input: {
  scope: WarehouseCountSheetScope;
  itemBalances: StockItemBalance[];
  locationLabelMap?: Map<string, string> | ReadonlyMap<string, string>;
  locationBalances?: StockLocationBalance[];
  locations?: WarehouseLocation[];
  rack?: Pick<WarehouseRack, 'id' | 'code' | 'name'> | null;
  shelf?: Pick<WarehouseLocation, 'id' | 'code' | 'rackName' | 'rack' | 'shelfName' | 'shelf'> | null;
}): { rows: WarehouseCountSheetRow[]; scopeLabel: string } {
  const scope = input.scope || 'warehouse';
  if (scope === 'warehouse') {
    return {
      rows: balancesToCountSheetRows(input.itemBalances, input.locationLabelMap || new Map()),
      scopeLabel: 'المخزن كله',
    };
  }

  const locations = [...(input.locations || [])]
    .filter((loc) => loc.isActive !== false)
    .sort((a, b) => locationSortKey(a).localeCompare(locationSortKey(b), 'ar'));
  const locationBalances = input.locationBalances || [];

  if (scope === 'rack') {
    const rack = input.rack;
    const rackLabel = String(rack?.name || rack?.code || '').trim();
    const scopeLabel = `راك ${rackLabel} — كل الأرفف`.trim();
    if (!rack) return { rows: [], scopeLabel: 'راك' };
    const shelves = locations.filter((loc) => locationBelongsToRack(loc, rack));
    const rows: WarehouseCountSheetRow[] = [];
    for (const shelf of shelves) {
      const onShelf = locationBalances.filter((row) => locationMatchesShelf(row, shelf));
      if (onShelf.length > 0) {
        rows.push(...locationBalancesToCountSheetRows(onShelf));
      } else {
        rows.push(emptyShelfRow(shelf));
      }
    }
    const extras = locationBalances.filter(
      (row) => locationBelongsToRack(row, rack) && !shelfCoveredByCatalog(row, shelves),
    );
    if (extras.length > 0) {
      rows.push(...locationBalancesToCountSheetRows(extras));
    }
    return { rows, scopeLabel };
  }

  const shelf = input.shelf;
  const shelfLabel = String(shelf?.code || shelf?.shelf || '').trim();
  if (!shelf) return { rows: [], scopeLabel: 'رف' };
  const onShelf = locationBalances.filter((row) => locationMatchesShelf(row, shelf));
  const rows = onShelf.length > 0
    ? locationBalancesToCountSheetRows(onShelf)
    : [emptyShelfRow({
      id: shelf.id,
      code: String(shelf.code || ''),
      rack: String(shelf.rack || ''),
      rackName: shelf.rackName,
      shelf: String(shelf.shelf || shelf.code || ''),
      shelfName: shelf.shelfName,
    })];
  return {
    rows,
    scopeLabel: `رف ${shelfLabel}`.trim(),
  };
}

export async function loadWarehouseCountSheetSource(warehouseId: string): Promise<{
  locationLabelMap: Map<string, string>;
  locationBalances: StockLocationBalance[];
  locations: WarehouseLocation[];
  racks: WarehouseRack[];
}> {
  const id = String(warehouseId || '').trim();
  if (!id) {
    return { locationLabelMap: new Map(), locationBalances: [], locations: [], racks: [] };
  }
  const [defaults, locationBalances, locations, racks] = await Promise.all([
    defaultItemLocationService.getAll(id).catch(() => []),
    stockService.getLocationBalances({ warehouseId: id }).catch(() => []),
    warehouseLocationService.getAll(id).catch(() => []),
    warehouseRackService.getAll(id).catch(() => []),
  ]);
  return {
    locationLabelMap: buildWarehouseLocationLabelMap({
      warehouseId: id,
      defaults,
      locationBalances,
    }),
    locationBalances,
    locations,
    racks,
  };
}
