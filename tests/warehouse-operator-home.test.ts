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
  resolveWarehouseOperatorHomePath({ isMaterialsWarehouseRole: true }),
  '/inventory/raw-materials/control',
);
assert.equal(resolveWarehouseOperatorHomePath({}), '/inventory');

assert.equal(
  resolveWarehouseRolePrimaryPath('wh-1', 'spare_parts_central'),
  '/inventory/spare-parts-replenishment',
);
assert.equal(
  resolveWarehouseRolePrimaryPath('wh-1', 'final_product'),
  '/inventory/transfer-approvals',
);
assert.equal(
  resolveWarehouseRolePrimaryPath('wh-1', 'general'),
  '/inventory/warehouses/wh-1',
);

console.log('warehouse-operator-home tests passed');
