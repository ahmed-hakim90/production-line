import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const issueSrc = readFileSync(
  new URL('../modules/production/pages/ProductionIssueRequests.tsx', import.meta.url),
  'utf8',
);
assert.match(issueSrc, /ISSUE_REQUESTS_CACHE_KEY/);
assert.match(issueSrc, /ISSUE_CAPACITY_CACHE_KEY/);
assert.match(issueSrc, /ISSUE_COMPENSATIONS_CACHE_KEY/);
assert.match(issueSrc, /loading=\{listLoading \|\| listRefreshing\}/);
assert.match(issueSrc, /loading=\{capacityLoading \|\| capacityRefreshing\}/);
assert.doesNotMatch(issueSrc, /PageContentSkeleton/);
assert.doesNotMatch(
  issueSrc,
  /await Promise\.all\(\[\s*fetchProductionPlans\(\),\s*fetchWorkOrders\(\),\s*fetchProducts\(\),\s*fetchLines\(\)\s*\]\)/,
);
assert.match(issueSrc, /productionIssueService\.getAll\(\)/);
assert.ok(
  issueSrc.indexOf('productionIssueService.getAll()')
    < issueSrc.indexOf('assemblableCapacityService.getForWarehouse')
    || !issueSrc.includes('await Promise.all([fetchProductionPlans'),
  'issue list must not wait on catalog fetch before getAll',
);

const packagingSrc = readFileSync(
  new URL('../modules/production/pages/PackagingControl.tsx', import.meta.url),
  'utf8',
);
assert.doesNotMatch(packagingSrc, /PageContentSkeleton/);
assert.match(packagingSrc, /getTransactionsPaged\(\{ warehouseId: txWarehouseId, limit: 20 \}\)/);
assert.doesNotMatch(packagingSrc, /stockService\.getTransactions\(/);
assert.match(packagingSrc, /QUEUE_CACHE_KEY/);
assert.match(packagingSrc, /DETAILS_CACHE_KEY/);
assert.match(packagingSrc, /loading=\{queueLoading \|\| queueRefreshing\}/);
assert.match(packagingSrc, /loading=\{detailsLoading \|\| detailsRefreshing\}/);
assert.ok(
  packagingSrc.includes('productionHandoverService.listPending()')
    && packagingSrc.includes('stockService.getBalances'),
  'queue and details loads must both exist',
);
const queueLoaderStart = packagingSrc.indexOf('QUEUE_CACHE_KEY');
const detailsLoaderStart = packagingSrc.indexOf('DETAILS_CACHE_KEY');
const balancesInQueue = packagingSrc
  .slice(queueLoaderStart, detailsLoaderStart)
  .includes('stockService.getBalances');
assert.equal(balancesInQueue, false, 'queue loader must not call getBalances');

const plansSrc = readFileSync(
  new URL('../modules/production/pages/ProductionPlans.tsx', import.meta.url),
  'utf8',
);
assert.doesNotMatch(plansSrc, /PageContentSkeleton/);
assert.doesNotMatch(plansSrc, /if \(loading \|\| initialDataLoading\)/);
assert.match(plansSrc, /loading=\{initialDataLoading\}/);
assert.match(plansSrc, /loadingLabel="جاري تحميل الخطط…"/);

const reportsSrc = readFileSync(
  new URL('../modules/production/pages/Reports.tsx', import.meta.url),
  'utf8',
);
assert.doesNotMatch(reportsSrc, /PageContentSkeleton/);
assert.doesNotMatch(reportsSrc, /if \(referenceDataLoading\)/);
assert.match(reportsSrc, /useEnsureStoreData\(\[\s*'products',\s*'lines',\s*'employees',\s*\]\)/);
assert.match(reportsSrc, /loading=\{rangeLoading\}/);
assert.match(reportsSrc, /loading=\{referenceDataLoading\}/);
assert.doesNotMatch(
  reportsSrc,
  /void Promise\.all\(\[fetchProducts\(\), fetchLines\(\), fetchEmployees\(\)\]\)/,
);

console.log('production-section-loading tests passed');
