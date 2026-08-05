import assert from 'node:assert/strict';
import {
  isRepairCenterWarehouse,
  otherMainBranchIds,
  repairMaintenanceWarehouseName,
} from '../modules/repair/lib/repairBranchMain';

assert.deepEqual(
  otherMainBranchIds([
    { id: 'a', isMain: true },
    { id: 'b', isMain: false },
    { id: 'c', isMain: true },
  ]),
  ['a', 'c'],
);

assert.deepEqual(
  otherMainBranchIds([
    { id: 'a', isMain: true },
    { id: 'b', isMain: true },
  ], 'a'),
  ['b'],
);

assert.deepEqual(otherMainBranchIds([{ id: 'a', isMain: false }], null), []);
assert.equal(repairMaintenanceWarehouseName('المنصورة'), 'مخزن صيانة - المنصورة');
assert.equal(repairMaintenanceWarehouseName('  '), 'مخزن صيانة - فرع');

assert.equal(isRepairCenterWarehouse({ warehouseRole: 'maintenance_center' }), true);
assert.equal(isRepairCenterWarehouse({ warehouseRole: 'general', code: 'RWH-012' }), true);
assert.equal(isRepairCenterWarehouse({ warehouseRole: 'general', code: 'WH-001' }), false);

console.log('repair-branch-main.test.ts: ok');
