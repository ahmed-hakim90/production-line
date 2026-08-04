import assert from 'node:assert/strict';
import {
  applyRepairSpareReturnQuantities,
  canApproveRepairSpareIssue,
  canCancelRepairSpareIssue,
  canIssueRepairSpareIssue,
  canRejectRepairSpareIssue,
  canReturnRepairSpareIssue,
  canSubmitRepairSpareIssue,
  formatRepairSpareReference,
  normalizeRepairSpareApprovalMode,
  repairSpareLineId,
  validateRepairSpareDraftLines,
  validateRepairSpareReturnLines,
} from '../modules/repair/lib/repairSpareIssue';
import type { RepairSpareIssue } from '../modules/repair/types';

assert.equal(normalizeRepairSpareApprovalMode('required'), 'required');
assert.equal(normalizeRepairSpareApprovalMode('direct'), 'direct');
assert.equal(normalizeRepairSpareApprovalMode(undefined), 'direct');
assert.equal(formatRepairSpareReference(7), 'RSI-0007');
assert.equal(repairSpareLineId('m1', 'loc-a'), JSON.stringify(['m1', 'loc-a']));

assert.equal(canSubmitRepairSpareIssue('draft', 'required'), true);
assert.equal(canSubmitRepairSpareIssue('draft', 'direct'), false);
assert.equal(canApproveRepairSpareIssue('submitted', 'required'), true);
assert.equal(canRejectRepairSpareIssue('approved', 'required'), true);
assert.equal(canIssueRepairSpareIssue('draft', 'direct'), true);
assert.equal(canIssueRepairSpareIssue('approved', 'required'), true);
assert.equal(canIssueRepairSpareIssue('draft', 'required'), false);
assert.equal(canReturnRepairSpareIssue('issued'), true);
assert.equal(canReturnRepairSpareIssue('draft'), false);
assert.equal(canCancelRepairSpareIssue('draft'), true);
assert.equal(canCancelRepairSpareIssue('issued'), false);

validateRepairSpareDraftLines([{ itemId: 'm1', quantity: 2 }]);
assert.throws(() => validateRepairSpareDraftLines([]), /أضف/);
assert.throws(() => validateRepairSpareDraftLines([{ itemId: 'm1', quantity: 0 }]), /أكبر من صفر/);
assert.throws(
  () => validateRepairSpareDraftLines([{ itemId: 'm1', quantity: 1 }], { locationsRequired: true }),
  /رف المصدر/,
);
assert.throws(
  () => validateRepairSpareDraftLines([
    { itemId: 'm1', quantity: 1, locationId: 'l1' },
    { itemId: 'm1', quantity: 2, locationId: 'l1' },
  ]),
  /تكرار/,
);

const issue: RepairSpareIssue = {
  referenceNo: 'RSI-0001',
  status: 'issued',
  approvalMode: 'direct',
  warehouseId: 'wh1',
  warehouseName: 'مخزن مركز صيانة',
  branchId: 'br1',
  branchName: 'فرع 1',
  jobId: 'job1',
  lines: [
    {
      itemType: 'material',
      itemId: 'm1',
      itemName: 'محرك',
      itemCode: 'MOT-1',
      unit: 'piece',
      quantity: 10,
      returnedQty: 2,
      unitCostSnapshot: 5,
      totalCostSnapshot: 50,
    },
  ],
  createdBy: 'user',
  createdAt: new Date().toISOString(),
};

validateRepairSpareReturnLines(issue, [{ itemId: 'm1', quantity: 3 }]);
assert.throws(() => validateRepairSpareReturnLines(issue, [{ itemId: 'm1', quantity: 9 }]), /تتجاوز/);
const afterReturn = applyRepairSpareReturnQuantities(issue.lines, [{ itemId: 'm1', quantity: 3 }]);
assert.equal(afterReturn[0].returnedQty, 5);

console.log('repair-spare-issue.test.ts: ok');
