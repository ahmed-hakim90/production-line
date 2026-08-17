import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const controlSrc = readFileSync(
  new URL('../modules/inventory/pages/RawMaterialWarehouseControl.tsx', import.meta.url),
  'utf8',
);
const alertsSrc = readFileSync(
  new URL('../modules/inventory/pages/RawMaterialWarehouseAlerts.tsx', import.meta.url),
  'utf8',
);
const alertsServiceSrc = readFileSync(
  new URL('../modules/inventory/services/rawMaterialWarehouseAlertsService.ts', import.meta.url),
  'utf8',
);

const loaderStart = controlSrc.indexOf('useCachedPageLoad<RawMaterialControlPageData>');
assert.ok(loaderStart >= 0, 'control cache loader missing');
const loader = controlSrc.slice(loaderStart, controlSrc.indexOf('{ maxAgeMs: 45_000', loaderStart));

assert.match(loader, /Promise\.allSettled/);
assert.match(loader, /stockService\.getBalances\(warehouseId\)/);
assert.match(loader, /getTransactionsPaged\(\{ warehouseId, limit: 8 \}\)/);
assert.doesNotMatch(loader, /stockService\.getTransactions\(warehouseId\)/);
assert.match(loader, /transferApprovalService\.getPendingForWarehouse\(warehouseId\)/);
assert.match(loader, /productionIssueService\.listOpenForSourceWarehouse\(warehouseId\)/);
assert.doesNotMatch(loader, /transferApprovalService\.getByStatus\('pending'\)/);
assert.doesNotMatch(loader, /productionIssueService\.getAll\(\)/);
assert.match(loader, /if \(balsResult\.status === 'rejected'\)/);
assert.doesNotMatch(
  loader,
  /await Promise\.all\(\[\s*stockService\.getBalances/,
  'control board must not fail closed when transfers or issues fail',
);

assert.match(controlSrc, /controlLoadError && \(/);
assert.match(controlSrc, /يمكنك متابعة خطوات التشغيل ثم إعادة المحاولة/);
assert.match(controlSrc, /WarehouseItemSearchPanel/);
assert.doesNotMatch(
  controlSrc,
  /if \(controlLoadError && balances\.length === 0\) \{\s*return \(/,
  'load error must not replace the daily operations board',
);

assert.match(alertsSrc, /Promise\.allSettled/);
assert.match(alertsSrc, /if \(balancesResult\.status === 'rejected'\)/);
assert.match(alertsSrc, /getPendingForWarehouse\(warehouseId\)/);
assert.match(alertsSrc, /listOpenForSourceWarehouse\(warehouseId\)/);
assert.doesNotMatch(alertsSrc, /await Promise\.all\(\[\s*stockService\.getBalances/);

assert.match(alertsServiceSrc, /Promise\.allSettled/);
assert.match(alertsServiceSrc, /getPendingForWarehouse\(warehouseId\)/);
assert.match(alertsServiceSrc, /listOpenForSourceWarehouse\(warehouseId\)/);
assert.doesNotMatch(alertsServiceSrc, /await Promise\.all\(\[\s*stockService\.getBalances/);

const issueSrc = readFileSync(
  new URL('../modules/inventory/services/productionIssueService.ts', import.meta.url),
  'utf8',
);
assert.match(issueSrc, /async listIssuedForTargetWarehouse\(warehouseId: string\)/);
assert.match(issueSrc, /limit\(200\)/);
assert.match(issueSrc, /async listOpenForSourceWarehouse\(warehouseId: string\)/);
assert.match(issueSrc, /limit\(100\)/);

const transferSrc = readFileSync(
  new URL('../modules/inventory/services/transferApprovalService.ts', import.meta.url),
  'utf8',
);
assert.match(transferSrc, /async getPendingForWarehouse\(warehouseId: string\)/);

const rulesFragment = readFileSync(
  new URL('../firestore/production-line.rules.fragment', import.meta.url),
  'utf8',
);
assert.match(
  rulesFragment,
  /function pl_canReadWarehouseIdField\(\) \{[\s\S]*!pl_isInventoryWarehouseBound\(\)/,
);
assert.match(
  rulesFragment,
  /function pl_canReadIssueWarehouses\(\) \{[\s\S]*!pl_isInventoryWarehouseBound\(\)/,
);
assert.match(
  rulesFragment,
  /function pl_canReadTransferWarehouses\(\) \{[\s\S]*!pl_isInventoryWarehouseBound\(\)/,
);

console.log('raw-material-warehouse-control-load tests passed');
