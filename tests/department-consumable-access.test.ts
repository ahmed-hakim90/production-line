import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  actorHasDepartmentConsumableAccess,
  resolveConsumableActorRoleKey,
} from '../functions/src/departmentConsumableAccess.ts';
import {
  allocateConsumableIssueFromStock,
  resolveConsumableAddLocation,
} from '../functions/src/departmentConsumableLocation.ts';

function testRoleKeyFromName() {
  assert.equal(
    resolveConsumableActorRoleKey({ name: 'مسؤول مخزن المستلزمات' }),
    'materials_warehouse',
  );
  assert.equal(
    resolveConsumableActorRoleKey({ roleKey: 'factory_manager', name: 'مسؤول مخزن المستلزمات' }),
    'factory_manager',
  );
}

function testMaterialsWarehouseCanIssueWithoutExactKeys() {
  assert.equal(
    actorHasDepartmentConsumableAccess(
      { roleKey: 'materials_warehouse', permissions: { 'inventory.view': true } },
      ['departmentConsumables.create', 'inventory.transactions.create'],
    ),
    true,
  );
  assert.equal(
    actorHasDepartmentConsumableAccess(
      { roleKey: 'inventory_viewer', permissions: { 'inventory.view': true } },
      ['departmentConsumables.create', 'inventory.transactions.create'],
    ),
    false,
  );
}

function testCreateAliasFromInventoryTransactions() {
  assert.equal(
    actorHasDepartmentConsumableAccess(
      { roleKey: null, permissions: { 'inventory.transactions.create': true } },
      ['departmentConsumables.create'],
    ),
    true,
  );
}

function testAddStockUsesCreatePermission() {
  assert.equal(
    actorHasDepartmentConsumableAccess(
      { roleKey: 'materials_warehouse', permissions: {} },
      ['departmentConsumables.create', 'inventory.transactions.create'],
    ),
    true,
  );
}

function testIssueAllocatesShelfWithStock() {
  const allocated = allocateConsumableIssueFromStock({
    requiredQty: 4,
    warehouseQty: 10,
    locationBalances: [
      { locationId: 'empty', locationCode: 'A-01', quantity: 0 },
      { locationId: 'full', locationCode: 'B-02', quantity: 9 },
    ],
  });
  assert.equal(allocated.error, undefined);
  assert.equal(allocated.slices.length, 1);
  assert.equal(allocated.slices[0].locationId, 'full');
  assert.equal(allocated.slices[0].quantity, 4);
}

function testIssueAllowsWarehouseOnlyWhenShelvesEmpty() {
  const allocated = allocateConsumableIssueFromStock({
    requiredQty: 3,
    warehouseQty: 5,
    locationBalances: [{ locationId: 'empty', locationCode: 'A-01', quantity: 0 }],
  });
  assert.equal(allocated.error, undefined);
  assert.deepEqual(allocated.slices, [{ quantity: 3 }]);
}

function testAddStockPicksDefaultThenStockedShelf() {
  const dest = resolveConsumableAddLocation({
    locations: [
      { id: 'loc-a', code: '20-01-01' },
      { id: 'loc-b', code: '20-01-02' },
    ],
    defaultLocationId: 'loc-b',
    locationBalances: [{ locationId: 'loc-a', locationCode: '20-01-01', quantity: 8 }],
  });
  assert.equal(dest?.locationId, 'loc-b');
}

testRoleKeyFromName();
testMaterialsWarehouseCanIssueWithoutExactKeys();
testCreateAliasFromInventoryTransactions();
testAddStockUsesCreatePermission();
testIssueAllocatesShelfWithStock();
testIssueAllowsWarehouseOnlyWhenShelvesEmpty();
testAddStockPicksDefaultThenStockedShelf();

const modal = readFileSync(
  new URL('../modules/inventory/components/departmentConsumables/AddConsumableStockModal.tsx', import.meta.url),
  'utf8',
);
assert.match(modal, /departmentConsumableIssueService\.addStock/);
assert.equal(modal.includes('stockService.createMovement'), false);

const functionsIndex = readFileSync(
  new URL('../functions/src/index.ts', import.meta.url),
  'utf8',
);
assert.match(functionsIndex, /export const addDepartmentConsumableStock/);

const invSeq = readFileSync(
  new URL('../modules/inventory/services/inventoryInvSequence.ts', import.meta.url),
  'utf8',
);
assert.equal(invSeq.includes('inventory_transfer_requests'), false);

console.log('department-consumable-access.test.ts: ok');
