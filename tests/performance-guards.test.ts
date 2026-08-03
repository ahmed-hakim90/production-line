import assert from 'node:assert/strict';
import { REPORT_LIST_MAX_PAGES } from '../modules/production/lib/reportListLimits.ts';
import {
  OPERATIONAL_DECISION_SNAPSHOT_MAX_AGE_MS,
  resolveOperationalDecisionSnapshotCacheKey,
} from '../modules/dashboards/lib/operationalDecisionSnapshotCache.ts';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  isPageDataCacheFresh,
  setPageDataCache,
} from '../modules/shared/lib/pageDataCache.ts';

// Expected caps documented for Phase 4 performance guards.
assert.equal(REPORT_LIST_MAX_PAGES, 10, 'report list helpers must cap at 10 pages');
assert.ok(
  OPERATIONAL_DECISION_SNAPSHOT_MAX_AGE_MS >= 30_000
    && OPERATIONAL_DECISION_SNAPSHOT_MAX_AGE_MS <= 120_000,
  'decision snapshot TTL should stay in a short operational window',
);

assert.equal(
  resolveOperationalDecisionSnapshotCacheKey('tenant-a'),
  'dashboard:operational-decision-snapshot:v5:tenant-a',
);
assert.equal(
  resolveOperationalDecisionSnapshotCacheKey(null),
  'dashboard:operational-decision-snapshot:v5:none',
);
assert.notEqual(
  resolveOperationalDecisionSnapshotCacheKey('a'),
  resolveOperationalDecisionSnapshotCacheKey('b'),
  'snapshot cache keys must not collide across tenants',
);

// pageDataCache: fresh peek + in-flight dedupe (shared by dashboard mounts).
invalidatePageDataCache('perf-guard:');
const dedupeKey = 'perf-guard:inflight';
let loaderCalls = 0;
const slow = () =>
  new Promise<number>((resolve) => {
    loaderCalls += 1;
    setTimeout(() => resolve(42), 20);
  });

const [a, b] = await Promise.all([
  fetchCachedPageData(dedupeKey, slow, { maxAgeMs: 60_000 }),
  fetchCachedPageData(dedupeKey, slow, { maxAgeMs: 60_000 }),
]);
assert.equal(a.data, 42);
assert.equal(b.data, 42);
assert.equal(loaderCalls, 1, 'concurrent mounts must share one in-flight snapshot loader');

setPageDataCache('perf-guard:fresh', { ok: true });
assert.equal(isPageDataCacheFresh('perf-guard:fresh', 60_000), true);
const cached = await fetchCachedPageData(
  'perf-guard:fresh',
  async () => {
    loaderCalls += 1;
    return { ok: false };
  },
  { maxAgeMs: 60_000 },
);
assert.equal(cached.fromCache, true);
assert.deepEqual(cached.data, { ok: true });
assert.equal(loaderCalls, 1, 'fresh TTL must not re-run the heavy loader');

invalidatePageDataCache('perf-guard:');
console.log('performance-guards.test.ts: ok');
