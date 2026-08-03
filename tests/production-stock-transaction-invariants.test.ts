import assert from 'node:assert/strict';
import {
  buildProductionHandoverIdempotencyKey as buildServerKey,
  PRODUCTION_QUANTITY_TOLERANCE,
  quantitiesMatch,
} from '../functions/src/productionStockInvariants.ts';
import {
  buildProductionHandoverIdempotencyKey as buildClientKey,
} from '../modules/inventory/lib/productionHandoverIdempotency.ts';

function testAllocationTotalsRequireEquality() {
  const required = 10;
  assert.equal(quantitiesMatch(required, 10), true);
  assert.equal(quantitiesMatch(required, 10 + (PRODUCTION_QUANTITY_TOLERANCE / 2)), true);
  assert.equal(quantitiesMatch(required, 9.99), false);
  assert.equal(quantitiesMatch(required, 10.01), false);
}

function testStableHandoverOperationKeys() {
  const first = buildServerKey('handover-1', 0, 25);
  const retry = buildServerKey('handover-1', 0, 25);
  assert.equal(first, retry);
  assert.equal(first, buildClientKey('handover-1', 0, 25));
  assert.equal(first.includes(String(Date.now())), false);

  // A later partial receipt with a new pre-receipt total is a different operation.
  assert.notEqual(first, buildServerKey('handover-1', 25, 25));
  assert.notEqual(first, buildServerKey('handover-1', 0, 20));
}

function testCanonicalFloatingPointKeys() {
  assert.equal(
    buildServerKey('handover-2', 0.1 + 0.2, 1),
    buildServerKey('handover-2', 0.3, 1),
  );
}

testAllocationTotalsRequireEquality();
testStableHandoverOperationKeys();
testCanonicalFloatingPointKeys();
console.log('production-stock-transaction-invariants.test.ts: ok');
