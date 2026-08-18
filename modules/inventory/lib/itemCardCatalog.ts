import type { InventoryItemType } from '../types';

/** Item card UI only distinguishes finished goods vs manufacturing materials. */
export function itemCardQueryItemType(itemType: string | null | undefined): InventoryItemType {
  return itemType === 'finished_good' ? 'finished_good' : 'material';
}

export function buildItemCardPath(params: {
  itemType: string | null | undefined;
  itemId: string;
  warehouseId?: string;
}): string {
  const query = new URLSearchParams();
  query.set('itemType', itemCardQueryItemType(params.itemType));
  query.set('itemId', params.itemId);
  if (params.warehouseId) query.set('warehouseId', params.warehouseId);
  return `/inventory/item-card?${query.toString()}`;
}

export function isItemCardCatalogReady(params: {
  itemType: string;
  materialsCatalogLoaded: boolean;
  productsLoading: boolean;
}): boolean {
  if (params.itemType === 'finished_good') return !params.productsLoading;
  return params.materialsCatalogLoaded;
}

export function shouldWarnItemMissingFromCatalog(params: {
  itemId: string;
  catalogReady: boolean;
  foundInCatalog: boolean;
}): boolean {
  if (!String(params.itemId || '').trim()) return false;
  if (!params.catalogReady) return false;
  return !params.foundInCatalog;
}

export function findItemCardCatalogOption<T extends { id: string }>(
  options: T[],
  itemId: string,
  aliases: Array<{ id: string; aliasIds?: string[] }> = [],
): T | undefined {
  const wanted = String(itemId || '').trim();
  if (!wanted) return undefined;
  const direct = options.find((opt) => opt.id === wanted);
  if (direct) return direct;
  const alias = aliases.find(
    (row) => row.id === wanted || (row.aliasIds || []).includes(wanted),
  );
  if (!alias) return undefined;
  return options.find((opt) => opt.id === alias.id);
}
