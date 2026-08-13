import assert from 'node:assert/strict';
import {
  isLegacyRepairWarehouseName,
  isRepairCenterWarehouse,
  otherMainBranchIds,
  plannedRepairCenterWarehouseRename,
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
assert.equal(isLegacyRepairWarehouseName('مخزن فرع اسكندريه'), true);
assert.equal(isLegacyRepairWarehouseName('مخزن فرع'), true);
assert.equal(isLegacyRepairWarehouseName('مخزن صيانة - مركز اكتوبر'), false);
assert.equal(isLegacyRepairWarehouseName('مخزن فرعى خاص'), false);
assert.equal(
  plannedRepairCenterWarehouseRename({
    warehouseName: 'مخزن فرع اسكندريه',
    branchName: 'مركز اسكندريه',
  }),
  'مخزن صيانة - مركز اسكندريه',
);
assert.equal(
  plannedRepairCenterWarehouseRename({
    warehouseName: 'مخزن صيانة - مركز اكتوبر',
    branchName: 'مركز اكتوبر',
  }),
  null,
);
assert.equal(
  plannedRepairCenterWarehouseRename({
    warehouseName: 'مخزن قطع خاص',
    branchName: 'طنطا',
  }),
  null,
);

assert.equal(isRepairCenterWarehouse({ warehouseRole: 'maintenance_center' }), true);
assert.equal(isRepairCenterWarehouse({ warehouseRole: 'general', code: 'RWH-012' }), true);
assert.equal(isRepairCenterWarehouse({ warehouseRole: 'general', code: 'WH-001' }), false);

console.log('repair-branch-main.test.ts: ok');
