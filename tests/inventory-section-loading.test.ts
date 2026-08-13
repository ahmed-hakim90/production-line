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

const invoiceSrc = readFileSync(
  new URL('../modules/inventory/pages/SparePartsPurchaseInvoice.tsx', import.meta.url),
  'utf8',
);
assert.match(invoiceSrc, /catalogLoading/);
assert.match(invoiceSrc, /invoicesLoading/);
assert.doesNotMatch(invoiceSrc, /materialService\.getAll\(\),\s*\n\s*sparePartsPurchaseInvoiceService/);

console.log('inventory-section-loading tests passed');
