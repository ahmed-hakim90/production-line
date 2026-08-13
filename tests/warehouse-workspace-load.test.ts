import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspaceSrc = readFileSync(
  new URL('../modules/inventory/pages/WarehouseWorkspace.tsx', import.meta.url),
  'utf8',
);
const stockSrc = readFileSync(
  new URL('../modules/inventory/services/stockService.ts', import.meta.url),
  'utf8',
);

const loadStart = workspaceSrc.indexOf('const load = useCallback');
assert.ok(loadStart >= 0, 'load callback missing');
const loadFn = workspaceSrc.slice(loadStart, workspaceSrc.indexOf('useEffect', loadStart));

assert.match(loadFn, /setLoading\(false\)/);
assert.match(loadFn, /void requestCatalogMaterials/);
assert.match(loadFn, /getTransactionsPaged\(\{ warehouseId: id, limit: 20 \}/);
assert.match(loadFn, /needTransfers/);
assert.match(loadFn, /transferApprovalService\.getByStatus\('pending'\)/);
assert.match(loadFn, /buildWarehouseLocationLabelMap/);
assert.match(loadFn, /if \(isCenter\) \{[\s\S]*repairBranchService\.list\(\)/);
assert.doesNotMatch(loadFn, /materialService\.getAll/);
assert.doesNotMatch(loadFn, /loadWarehouseCountLocationLabels/);
assert.doesNotMatch(loadFn, /transferApprovalService\.getAll/);
assert.doesNotMatch(workspaceSrc, /loadWarehouseCountLocationLabels/);

assert.match(workspaceSrc, /detailsLoading/);
assert.match(workspaceSrc, /loading=\{detailsLoading\}/);
assert.match(stockSrc, /BULK_PAGE_SIZE = 500/);
assert.match(stockSrc, /warehouseId \? BULK_PAGE_SIZE : MAX_PAGE_SIZE/);

console.log('warehouse-workspace-load tests passed');
