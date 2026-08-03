import assert from 'node:assert/strict';
import {
  isBomEligibleMaterialType,
  movementFateLabel,
  movementPathLabel,
  suggestConsumableCode,
} from '../modules/inventory/lib/itemMovementTrace';

assert.equal(isBomEligibleMaterialType('raw_material'), true);
assert.equal(isBomEligibleMaterialType('semi_finished'), true);
assert.equal(isBomEligibleMaterialType('packaging'), true);
assert.equal(isBomEligibleMaterialType('consumable'), false);

assert.match(suggestConsumableCode('Glass Cloth'), /^[A-Z0-9]+-[A-Z0-9]+$/);
assert.match(suggestConsumableCode('جلانس'), /^CNS-/);

assert.equal(
  movementPathLabel({
    movementType: 'IN',
    warehouseName: 'مخزن المستلزمات',
    warehouseId: 'w1',
  }),
  'وارد إلى مخزن المستلزمات',
);

assert.equal(
  movementPathLabel({
    movementType: 'OUT',
    warehouseName: 'مخزن المستلزمات',
    warehouseId: 'w1',
    departmentName: 'صيانة',
  }),
  'من مخزن المستلزمات → قسم صيانة',
);

assert.equal(
  movementFateLabel({
    movementType: 'OUT',
    sourceModule: 'department_consumable_issue',
  }),
  'مصروف لقسم',
);

assert.equal(
  movementFateLabel({
    movementType: 'IN',
    sourceModule: 'supplies_receipt',
  }),
  'وارد استلام',
);

assert.equal(
  movementFateLabel({
    movementType: 'IN',
    sourceModule: 'department_consumable_return',
  }),
  'مرتجع من قسم',
);

console.log('item-movement-trace.test.ts: ok');
