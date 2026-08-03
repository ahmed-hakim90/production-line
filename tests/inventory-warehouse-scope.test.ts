import assert from 'node:assert/strict';
import { resolveInventoryWarehouseScopeIds } from '../modules/inventory/lib/inventoryWarehouseScope.ts';

function testUserBoundWarehouseWins() {
  const result = resolveInventoryWarehouseScopeIds({
    inventoryWarehouseId: 'wh-bound',
    isMaterialsWarehouseRole: true,
    materialsRoutingWarehouseIds: ['wh-dec', 'wh-raw'],
  });
  assert.equal(result.scoped, true);
  assert.deepEqual(result.warehouseIds, ['wh-bound']);
}

function testMaterialsRoleUsesRouting() {
  const result = resolveInventoryWarehouseScopeIds({
    inventoryWarehouseId: null,
    isMaterialsWarehouseRole: true,
    materialsRoutingWarehouseIds: ['wh-dec', '', 'wh-raw', 'wh-dec'],
  });
  assert.equal(result.scoped, true);
  assert.deepEqual(result.warehouseIds, ['wh-dec', 'wh-raw']);
}

function testUnscopedWhenNoBindAndNotMaterials() {
  const result = resolveInventoryWarehouseScopeIds({
    inventoryWarehouseId: '  ',
    isMaterialsWarehouseRole: false,
    materialsRoutingWarehouseIds: ['wh-dec'],
  });
  assert.equal(result.scoped, false);
  assert.deepEqual(result.warehouseIds, []);
}

function testBoundTrims() {
  const result = resolveInventoryWarehouseScopeIds({
    inventoryWarehouseId: '  wh-1  ',
    isMaterialsWarehouseRole: false,
    materialsRoutingWarehouseIds: [],
  });
  assert.equal(result.scoped, true);
  assert.deepEqual(result.warehouseIds, ['wh-1']);
}

testUserBoundWarehouseWins();
testMaterialsRoleUsesRouting();
testUnscopedWhenNoBindAndNotMaterials();
testBoundTrims();

console.log('inventory-warehouse-scope.test.ts: ok');
