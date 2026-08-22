import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync('modules/production/services/reportService.ts', 'utf8');

assert.match(service, /const normalizedLineId = String\(lineId \|\| ''\)\.trim\(\)/);
assert.match(service, /const normalizedProductId = String\(productId \|\| ''\)\.trim\(\)/);
assert.match(service, /if \(!normalizedLineId \|\| !normalizedProductId\) return \[\]/);
assert.match(service, /where\('lineId', '==', normalizedLineId\)/);
assert.match(service, /where\('productId', '==', normalizedProductId\)/);

console.log('report-query-guards.test.ts passed');
