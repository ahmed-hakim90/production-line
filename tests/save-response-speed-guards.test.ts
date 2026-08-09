import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

const store = readFileSync(join(root, 'store/useAppStore.ts'), 'utf8');
assert.match(store, /hasConflictingUniqueKey/);
assert.match(store, /upsertLoadedReportRow/);
assert.match(store, /const createdRow: ProductionReport = \{ \.\.\.reportData, id \}/);

const customers = readFileSync(join(root, 'modules/customers/services/customerService.ts'), 'utf8');
assert.match(customers, /counterSnap\.exists\(\)/);
assert.match(customers, /finishCreate/);

const repairJobs = readFileSync(join(root, 'modules/repair/services/repairJobService.ts'), 'utf8');
assert.match(repairJobs, /REPAIR_JOB_LIST_LIMIT/);
assert.match(repairJobs, /orderBy\('createdAt', 'desc'\)/);

const quickAction = readFileSync(join(root, 'modules/production/pages/QuickAction.tsx'), 'utf8');
assert.doesNotMatch(quickAction, /await reportService\.getById\(id\)/);

const stockForm = readFileSync(join(root, 'modules/inventory/pages/StockMovementForm.tsx'), 'utf8');
assert.match(stockForm, /applyWarehouseBalanceDeltas/);
assert.match(stockForm, /getBalances\(whId\)/);
assert.match(stockForm, /mapGroupedSequentialParallel/);

const quickTransfer = readFileSync(join(root, 'modules/inventory/pages/QuickWarehouseTransfer.tsx'), 'utf8');
assert.match(quickTransfer, /getBalances\(whId\)/);
assert.doesNotMatch(quickTransfer, /stockService\.getBalances\(\)/);

const reportsPage = readFileSync(join(root, 'modules/production/pages/Reports.tsx'), 'utf8');
assert.match(reportsPage, /hasConflictingUniqueKey/);

const routingQueries = readFileSync(join(root, 'modules/production/routing/hooks/routingQueries.ts'), 'utf8');
assert.doesNotMatch(
  routingQueries,
  /invalidateQueries\(\{ queryKey: \['productionRouting'\] \}\)/,
);

console.log('save-response-speed-guards.test.ts: ok');
