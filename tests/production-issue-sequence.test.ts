import assert from 'node:assert/strict';
import {
  formatPiReference,
  PI_REF_REGEX,
  piSeqFromReferenceNo,
} from '../modules/inventory/lib/productionIssueRef';

assert.equal(formatPiReference(1), 'PI-0001');
assert.equal(formatPiReference(12), 'PI-0012');
assert.equal(formatPiReference(0), 'PI-0001');
assert.equal(piSeqFromReferenceNo('PI-0001'), 1);
assert.equal(piSeqFromReferenceNo('PI-20260728-098624'), 0);
assert.ok(PI_REF_REGEX.test('PI-0001'));
assert.equal(PI_REF_REGEX.test('PI-20260728-098624'), false);

import { readFileSync } from 'node:fs';

const sequenceSource = readFileSync('modules/inventory/services/productionIssueSequence.ts', 'utf8');
assert.match(sequenceSource, /ensurePiCounter/);
assert.doesNotMatch(
  sequenceSource,
  /getDocs\([\s\S]*production_issue_orders|tenantQuery\([\s\S]*ORDERS_COLLECTION/,
  'PI counter must not list production_issue_orders (bound warehouse operators are denied unfiltered lists)',
);

console.log('production-issue-sequence.test.ts: OK');
