import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(rel: string): string {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

const workspaceSrc = read('../modules/inventory/pages/WarehouseWorkspace.tsx');
const locationsSrc = read('../modules/inventory/pages/WarehouseLocations.tsx');
const itemCardSrc = read('../modules/inventory/pages/ItemCard.tsx');
const consumablesSrc = read('../modules/inventory/pages/DepartmentConsumables.tsx');
const repairReplenishSrc = read('../modules/repair/pages/RepairPartsReplenishment.tsx');
const movementSrc = read('../modules/inventory/pages/StockMovementForm.tsx');
const cacheSrc = read('../modules/shared/lib/pageDataCache.ts');

assert.match(cacheSrc, /Session page-data cache/);
assert.match(cacheSrc, /does not blank the UI while refreshing/);

assert.match(workspaceSrc, /inventory:warehouse-workspace/);
assert.match(workspaceSrc, /peekPageDataCache<WarehouseWorkspacePageData>/);
assert.match(workspaceSrc, /isPageDataCacheFresh\(pageCacheKey, WORKSPACE_CACHE_MAX_AGE_MS\)/);
assert.match(workspaceSrc, /setPageDataCache\(pageCacheKey, payload\)/);
assert.match(workspaceSrc, /if \(cached\) \{/);
assert.match(workspaceSrc, /else if \(switching\) \{/);

assert.match(locationsSrc, /inventory:warehouse-locations/);
assert.match(locationsSrc, /peekPageDataCache<WarehouseLocationsPageData>/);
assert.match(locationsSrc, /reloadLocations/);

assert.match(itemCardSrc, /inventory:item-card/);
assert.match(itemCardSrc, /peekPageDataCache<ItemCardPageData>/);
assert.match(itemCardSrc, /isPageDataCacheFresh\(cacheKey, ITEM_CARD_CACHE_MAX_AGE_MS\)/);

assert.match(consumablesSrc, /inventory:department-consumables/);
assert.match(consumablesSrc, /reloadConsumables/);
assert.match(consumablesSrc, /isPageDataCacheFresh\(cacheKey, CONSUMABLES_CACHE_MAX_AGE_MS\)/);

assert.match(repairReplenishSrc, /repair:parts-replenishment/);
assert.match(repairReplenishSrc, /reloadReplenishment/);
assert.match(repairReplenishSrc, /isPageDataCacheFresh\(cacheKey, REPAIR_REPLENISH_CACHE_MAX_AGE_MS\)/);

assert.match(movementSrc, /invalidatePageDataCache\('inventory:warehouse-workspace'\)/);
assert.match(movementSrc, /invalidatePageDataCache\('inventory:stock-balances'\)/);
assert.match(movementSrc, /invalidatePageDataCache\('inventory:item-card'\)/);

console.log('page-revisit-cache tests passed');
