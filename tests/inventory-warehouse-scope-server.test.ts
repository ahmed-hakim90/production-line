import assert from 'node:assert/strict';
import {
  assertActorWarehouseInvolved,
  assertActorWarehousesAllowed,
  resolveBoundInventoryWarehouseId,
} from '../functions/src/inventoryWarehouseScope.ts';

function testResolveBound() {
  assert.equal(resolveBoundInventoryWarehouseId({ inventoryWarehouseId: 'wh-1' }), 'wh-1');
  assert.equal(resolveBoundInventoryWarehouseId({ inventoryWarehouseId: '  wh-1  ' }), 'wh-1');
  assert.equal(resolveBoundInventoryWarehouseId({ inventoryWarehouseId: '' }), null);
  assert.equal(resolveBoundInventoryWarehouseId({ inventoryWarehouseId: null }), null);
  assert.equal(
    resolveBoundInventoryWarehouseId({ inventoryWarehouseId: 'wh-1', isSuperAdmin: true }),
    null,
  );
}

function testAssertAllowed() {
  assert.doesNotThrow(() => assertActorWarehousesAllowed(null, ['wh-a', 'wh-b']));
  assert.doesNotThrow(() => assertActorWarehousesAllowed('wh-a', ['wh-a', 'wh-a', '']));
  assert.throws(
    () => assertActorWarehousesAllowed('wh-a', ['wh-a', 'wh-b']),
    (err: { code?: string }) => err?.code === 'permission-denied',
  );
}

function testAssertInvolved() {
  assert.doesNotThrow(() => assertActorWarehouseInvolved(null, ['wh-a', 'wh-b']));
  assert.doesNotThrow(() => assertActorWarehouseInvolved('wh-a', ['wh-b', 'wh-a']));
  assert.throws(
    () => assertActorWarehouseInvolved('wh-a', ['wh-b', 'wh-c']),
    (err: { code?: string }) => err?.code === 'permission-denied',
  );
}

testResolveBound();
testAssertAllowed();
testAssertInvolved();
console.log('inventory-warehouse-scope-server.test.ts: ok');
