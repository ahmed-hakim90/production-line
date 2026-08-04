import assert from 'node:assert/strict';
import { resolveRepairWarehouseScopeIds, isSparePartsWarehouseRole } from '../modules/repair/lib/repairWarehouseScope.ts';

function testInventoryBindWins() {
  const result = resolveRepairWarehouseScopeIds({
    inventoryWarehouseId: 'wh-bound',
    repairBranchIds: ['br-1', 'br-2'],
    branchWarehouseById: { 'br-1': 'wh-a', 'br-2': 'wh-b' },
  });
  assert.equal(result.scoped, true);
  assert.deepEqual(result.warehouseIds, ['wh-bound']);
  assert.deepEqual(result.branchIds, ['br-1', 'br-2']);
}

function testBranchWarehousesWhenNoInventoryBind() {
  const result = resolveRepairWarehouseScopeIds({
    inventoryWarehouseId: null,
    repairBranchIds: ['br-1', 'br-2', 'br-1'],
    branchWarehouseById: { 'br-1': 'wh-a', 'br-2': 'wh-b' },
  });
  assert.equal(result.scoped, true);
  assert.deepEqual(result.warehouseIds, ['wh-a', 'wh-b']);
  assert.deepEqual(result.branchIds, ['br-1', 'br-2']);
}

function testScopedWithBranchesButMissingWarehouseIds() {
  const result = resolveRepairWarehouseScopeIds({
    inventoryWarehouseId: '  ',
    repairBranchIds: ['br-1'],
    branchWarehouseById: { 'br-1': '' },
  });
  assert.equal(result.scoped, true);
  assert.deepEqual(result.warehouseIds, []);
  assert.deepEqual(result.branchIds, ['br-1']);
}

function testUnscopedWhenNoBind() {
  const result = resolveRepairWarehouseScopeIds({
    inventoryWarehouseId: null,
    repairBranchIds: [],
    branchWarehouseById: { 'br-1': 'wh-a' },
  });
  assert.equal(result.scoped, false);
  assert.deepEqual(result.warehouseIds, []);
  assert.deepEqual(result.branchIds, []);
}

function testSparePartsRoleHelper() {
  assert.equal(isSparePartsWarehouseRole('spare_parts'), true);
  assert.equal(isSparePartsWarehouseRole('general'), false);
  assert.equal(isSparePartsWarehouseRole(null), false);
}

testInventoryBindWins();
testBranchWarehousesWhenNoInventoryBind();
testScopedWithBranchesButMissingWarehouseIds();
testUnscopedWhenNoBind();
testSparePartsRoleHelper();

console.log('repair-warehouse-scope.test.ts: ok');
