import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panelSrc = readFileSync(
  new URL('../modules/dashboards/components/OperationsDashboardBoard.tsx', import.meta.url),
  'utf8',
);
assert.match(panelSrc, /loading\?: boolean/);
assert.match(panelSrc, /loadingLabel/);
assert.match(panelSrc, /role="status"/);

const replenishmentSrc = readFileSync(
  new URL('../modules/inventory/pages/SparePartsReplenishment.tsx', import.meta.url),
  'utf8',
);
assert.match(replenishmentSrc, /MATERIALS_CATALOG_CACHE/);
assert.match(replenishmentSrc, /REPLENISHMENT_LIST_CACHE/);
assert.match(replenishmentSrc, /loading=\{catalogLoading\}/);
assert.match(replenishmentSrc, /loading=\{listLoading \|\| listRefreshing\}/);
assert.doesNotMatch(replenishmentSrc, /materialService\.getAll\(\),\s*\n\s*sparePartsReplenishmentService/);

const countsSrc = readFileSync(
  new URL('../modules/inventory/pages/StockCounts.tsx', import.meta.url),
  'utf8',
);
assert.match(countsSrc, /STOCK_COUNTS_BALANCES_CACHE/);
assert.match(countsSrc, /loading=\{balancesLoading\}/);
assert.match(countsSrc, /loading=\{listLoading \|\| listRefreshing\}/);
assert.match(countsSrc, /لوكيشن محدد/);
assert.match(countsSrc, /راك كامل/);
assert.match(countsSrc, /warehouseRackService\.getAll\(warehouseId\)/);
assert.match(countsSrc, /stockService\.getLocationBalances\(\{ warehouseId \}\)/);
assert.match(countsSrc, /countScope === 'location' && !locationId/);
assert.match(countsSrc, /countScope === 'rack' && !rackId/);
assert.match(countsSrc, /locationBelongsToRack/);

const countServiceSrc = readFileSync(
  new URL('../modules/inventory/services/stockService.ts', import.meta.url),
  'utf8',
);
assert.match(countServiceSrc, /locationId: line\.locationId \|\| \(session\.countScope === 'location' \? session\.locationId : undefined\)/);
// A location/rack count's countedQty is one shelf's balance, not the warehouse total —
// it must never overwrite the maintenance-center's absolute stock sync (see ADR-012).
assert.match(countServiceSrc, /session\.countScope !== 'location' && session\.countScope !== 'rack'/);

const countFunctionSrc = readFileSync(
  new URL('../functions/src/inventoryStockCountOps.ts', import.meta.url),
  'utf8',
);
assert.match(countFunctionSrc, /countScope === 'warehouse' \? 'stock_items' : 'stock_location_balances'/);
assert.match(countFunctionSrc, /String\(balance\?\.locationId \|\| ''\) !== requestedLine\.locationId/);
assert.match(countFunctionSrc, /String\(balance\?\.rackId \|\| ''\) !== rackId/);

const countModalSrc = readFileSync(
  new URL('../components/modal-manager/modals/GlobalStockCountSessionModal.tsx', import.meta.url),
  'utf8',
);
// Rack sessions have one row per item per shelf — rows must be keyed by item+location
// (not item alone) or same-item rows from different shelves collide as React keys.
assert.match(countModalSrc, /\$\{line\.itemType\}_\$\{line\.itemId\}_\$\{line\.locationId \|\| idx\}/);
assert.match(countModalSrc, /session\.countScope === 'rack' && <th/);

const invoiceSrc = readFileSync(
  new URL('../modules/inventory/pages/SparePartsPurchaseInvoice.tsx', import.meta.url),
  'utf8',
);
assert.match(invoiceSrc, /catalogLoading/);
assert.match(invoiceSrc, /invoicesLoading/);
assert.doesNotMatch(invoiceSrc, /materialService\.getAll\(\),\s*\n\s*sparePartsPurchaseInvoiceService/);

console.log('inventory-section-loading tests passed');
