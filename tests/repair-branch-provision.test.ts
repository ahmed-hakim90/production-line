import assert from 'node:assert/strict';
import {
  canCreateProvisionedRepairBranch,
  CREATE_REPAIR_BRANCH_PERMISSION,
  isValidRepairCostCenterCode,
  maxRepairWarehouseSequence,
  normalizeRepairBranchCreateInput,
  parseRepairWarehouseSequence,
  repairCenterWarehouseCode,
  repairCenterWarehouseId,
  repairCostCenterCode,
  repairMaintenanceWarehouseName,
  repairWarehouseCode,
} from '../modules/repair/lib/repairBranchProvision';

assert.equal(repairMaintenanceWarehouseName('المنصورة'), 'مخزن صيانة - المنصورة');
assert.equal(repairMaintenanceWarehouseName('مركز اكتوبر'), 'مخزن صيانة - مركز اكتوبر');

const branchId = 'AbC12xyZ99';
assert.equal(repairCenterWarehouseId(branchId), 'repair-center-AbC12xyZ99');
assert.equal(repairWarehouseCode('MCW', 1), 'MCW-001');
assert.equal(repairWarehouseCode('RCW', 1), 'RCW-001');
assert.equal(repairWarehouseCode('RUW', 1), 'RUW-001');
assert.equal(repairWarehouseCode('MCW', 12), 'MCW-012');
assert.equal(repairCenterWarehouseCode(4), 'MCW-004');
assert.equal(parseRepairWarehouseSequence('MCW-001'), 1);
assert.equal(parseRepairWarehouseSequence('RCW-012'), 12);
assert.equal(parseRepairWarehouseSequence('RWH-003'), 3);
assert.equal(parseRepairWarehouseSequence('MCW-NLXLRVG4L30M'), null);
assert.equal(parseRepairWarehouseSequence('RCW-MCW-NLXLRVG4L30M'), null);
assert.equal(maxRepairWarehouseSequence(['MCW-001', 'RCW-001', 'RUW-004', 'WH-9']), 4);

assert.equal(repairCostCenterCode(1), 'REP-0001');
assert.equal(repairCostCenterCode(12), 'REP-0012');
assert.equal(repairCostCenterCode(0), 'REP-0001');
assert.ok(isValidRepairCostCenterCode(repairCostCenterCode(1)));
assert.ok(isValidRepairCostCenterCode(repairCostCenterCode(9999)));
assert.equal(repairCostCenterCode(9999).length <= 20, true);
assert.equal(isValidRepairCostCenterCode('rep-1'), false);
assert.equal(isValidRepairCostCenterCode('R'), false);

const created = normalizeRepairBranchCreateInput({
  name: '  مركز اكتوبر  ',
  phone: '0100000000',
  address: 'اكتوبر',
  managerEmployeeId: 'emp-1',
  managerEmployeeName: 'شيماء',
});
assert.equal(created.name, 'مركز اكتوبر');
assert.equal(created.managerEmployeeId, 'emp-1');
assert.equal(created.allowCreditDelivery, true);
assert.equal(created.allowCreditSalesInvoices, false);
assert.equal(created.salesInvoicesLocked, false);
assert.equal('warehouseId' in created, false);
assert.equal('costCenterId' in created, false);

assert.throws(
  () => normalizeRepairBranchCreateInput({ name: '  ', managerEmployeeId: 'emp-1' }),
  /اسم الفرع مطلوب/,
);
assert.throws(
  () => normalizeRepairBranchCreateInput({ name: 'فرع', managerEmployeeId: '' }),
  /اختر المسؤول عن الفرع/,
);

assert.equal(CREATE_REPAIR_BRANCH_PERMISSION, 'repair.branches.manage');
assert.equal(canCreateProvisionedRepairBranch({ 'repair.branches.manage': true }), true);
assert.equal(canCreateProvisionedRepairBranch({}, true), true);
assert.equal(canCreateProvisionedRepairBranch({ 'accounting.settings.manage': true }), false);
assert.equal(canCreateProvisionedRepairBranch({}), false);

console.log('repair-branch-provision.test.ts: ok');
