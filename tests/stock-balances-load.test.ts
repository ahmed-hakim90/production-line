import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(
  new URL('../modules/inventory/pages/StockBalances.tsx', import.meta.url),
  'utf8',
);

const loaderStart = src.indexOf('useCachedPageLoad<StockBalancesPageData>');
assert.ok(loaderStart >= 0, 'balances cache loader missing');
const loader = src.slice(loaderStart, src.indexOf('{ maxAgeMs: 45_000', loaderStart));

assert.match(loader, /Promise\.allSettled/);
assert.match(loader, /stockService\.getBalances\(\)/);
assert.match(loader, /getWarehousesForReportingFilters\(\)/);
assert.match(loader, /if \(balsResult\.status === 'rejected'\)/);
assert.doesNotMatch(loader, /stockService\.getTransactions/);
assert.doesNotMatch(
  loader,
  /await Promise\.all\(\[\s*stockService\.getBalances/,
  'balances page must not fail closed when warehouse listing fails',
);

assert.match(src, /function rowLastMovementAt/);
assert.match(src, /row\.lastMovementAt/);
assert.doesNotMatch(src, /lastMovementByKey/);
assert.match(src, /loadError && \(/);
assert.match(src, /إعادة المحاولة/);

console.log('stock-balances-load tests passed');
