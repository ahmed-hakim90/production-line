import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const searchBackfill = readFileSync('functions/src/scripts/backfillSearchPrefixes.ts', 'utf8');
const statsBackfill = readFileSync('functions/src/scripts/backfillDashboardStats.ts', 'utf8');

assert.match(searchBackfill, /--tenant/);
assert.match(searchBackfill, /--apply/);
assert.match(searchBackfill, /--start-after/);
assert.match(searchBackfill, /\.limit\(400\)/);
assert.match(searchBackfill, /where\('tenantId', '==', tenantId\)/);
assert.match(searchBackfill, /JSON\.stringify\(current\) === JSON\.stringify\(next\)/);

assert.match(statsBackfill, /--tenant/);
assert.match(statsBackfill, /args\.apply/);
assert.match(statsBackfill, /where\('tenantId', '==', args\.tenantId\)/);
assert.match(statsBackfill, /productMonthlyAgg/);

console.log('firestore-backfill-contract.test.ts passed');
