import assert from 'node:assert/strict';
import {
  resolveWarehouseOperatorHomePath,
  resolveWarehouseRolePrimaryPath,
} from '../modules/inventory/lib/warehouseOperatorHome.ts';

assert.equal(
  resolveWarehouseOperatorHomePath({ boundWarehouseId: 'wh-sp' }),
  '/inventory/warehouses/wh-sp',
);
assert.equal(
  resolveWarehouseOperatorHomePath({
    boundWarehouseId: 'wh-central-sp',
    boundWarehouseRole: 'spare_parts_central',
  }),
  '/inventory/warehouses/wh-central-sp',
);
assert.equal(
  resolveWarehouseOperatorHomePath({
    boundWarehouseId: 'wh-center',
    boundWarehouseRole: 'maintenance_center',
  }),
  '/repair/warehouses/wh-center',
);
assert.equal(
  resolveWarehouseOperatorHomePath({ isMaterialsWarehouseRole: true }),
  '/inventory/raw-materials/control',
);
assert.equal(resolveWarehouseOperatorHomePath({}), '/inventory');

assert.equal(
  resolveWarehouseRolePrimaryPath('wh-1', 'spare_parts_central'),
  '/inventory/warehouses/wh-1',
);
assert.equal(
  resolveWarehouseRolePrimaryPath('wh-1', 'maintenance_center'),
  '/repair/parts-replenishment',
);
assert.equal(
  resolveWarehouseRolePrimaryPath('wh-1', 'final_product'),
  '/inventory/transfer-approvals',
);
assert.equal(
  resolveWarehouseRolePrimaryPath('wh-1', 'general'),
  '/inventory/warehouses/wh-1',
);
assert.equal(
  resolveWarehouseRolePrimaryPath('wh-1', 'production_floor'),
  '/production/floor',
);

console.log('warehouse-operator-home tests passed');
