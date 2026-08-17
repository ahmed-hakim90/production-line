import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isWorkOrderRealtimeIndexError,
  resolveWorkOrderRealtimeSearchKey,
} from '../modules/production/pages/WorkOrders/hooks/workOrderRealtimeQuery.ts';

assert.equal(resolveWorkOrderRealtimeSearchKey(''), '');
assert.equal(resolveWorkOrderRealtimeSearchKey('1'), '');
assert.equal(resolveWorkOrderRealtimeSearchKey('16'), '16');
assert.equal(resolveWorkOrderRealtimeSearchKey('166'), '166');
assert.equal(resolveWorkOrderRealtimeSearchKey('WO-166'), 'wo-166');
assert.equal(resolveWorkOrderRealtimeSearchKey('wo 166'), '166');
assert.equal(resolveWorkOrderRealtimeSearchKey('١٦٦'), '166');

assert.equal(isWorkOrderRealtimeIndexError({ code: 'failed-precondition' }), true);
assert.equal(isWorkOrderRealtimeIndexError({ code: 'permission-denied' }), false);
assert.equal(isWorkOrderRealtimeIndexError(null), false);

const indexesPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.indexes.json');
const indexes = JSON.parse(readFileSync(indexesPath, 'utf8')) as {
  indexes: Array<{
    collectionGroup: string;
    fields: Array<{ fieldPath: string; arrayConfig?: string; order?: string }>;
  }>;
};

const workOrderSearchIndexes = indexes.indexes.filter((index) => (
  index.collectionGroup === 'work_orders'
  && index.fields.some((field) => field.fieldPath === 'searchPrefixes' && field.arrayConfig === 'CONTAINS')
));

assert(workOrderSearchIndexes.length >= 1, 'work_orders must have searchPrefixes composite indexes');

const hasDefaultSearchIndex = workOrderSearchIndexes.some((index) => {
  const paths = index.fields.map((field) => field.fieldPath);
  return paths.join('|') === 'tenantId|searchPrefixes|createdAt|__name__';
});
assert(hasDefaultSearchIndex, 'missing tenantId + searchPrefixes + createdAt work_orders index');

console.log('work-orders-realtime-search.test.ts passed');
