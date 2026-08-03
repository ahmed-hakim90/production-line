import assert from 'node:assert/strict';
import {
  aggregateDepartmentConsumableMonthly,
  applyReturnQuantities,
  canApprove,
  canIssue,
  canReject,
  canReturn,
  canSubmit,
  departmentConsumableLineId,
  formatDepartmentConsumableReference,
  materialPurchaseCostPerBaseUnit,
  monthRangeIso,
  normalizeApprovalMode,
  validateDraftLines,
  validateReturnLines,
} from '../modules/inventory/lib/departmentConsumableIssue';
import type { DepartmentConsumableIssue, StockTransaction } from '../modules/inventory/types';

assert.equal(normalizeApprovalMode('required'), 'required');
assert.equal(normalizeApprovalMode('direct'), 'direct');
assert.equal(normalizeApprovalMode(undefined), 'direct');
assert.equal(formatDepartmentConsumableReference(7), 'DCI-0007');
assert.equal(materialPurchaseCostPerBaseUnit({ purchaseCost: 100, conversionRate: 10 }), 10);
assert.equal(materialPurchaseCostPerBaseUnit({ purchaseCost: 50 }), 50);

assert.equal(canSubmit('draft', 'required'), true);
assert.equal(canSubmit('draft', 'direct'), false);
assert.equal(canApprove('submitted', 'required'), true);
assert.equal(canReject('approved', 'required'), true);
assert.equal(canIssue('draft', 'direct'), true);
assert.equal(canIssue('approved', 'required'), true);
assert.equal(canIssue('draft', 'required'), false);
assert.equal(canReturn('issued'), true);
assert.equal(canReturn('draft'), false);

validateDraftLines([{ itemId: 'm1', quantity: 2 }]);
assert.throws(() => validateDraftLines([]), /أضف/);
assert.throws(() => validateDraftLines([{ itemId: 'm1', quantity: 0 }]), /أكبر من صفر/);
assert.throws(
  () => validateDraftLines([{ itemId: 'm1', quantity: 1 }], { locationsRequired: true }),
  /رف المصدر/,
);
assert.throws(
  () => validateDraftLines([
    { itemId: 'm1', quantity: 1, locationId: 'l1' },
    { itemId: 'm1', quantity: 2, locationId: 'l1' },
  ]),
  /تكرار/,
);

const issue: DepartmentConsumableIssue = {
  referenceNo: 'DCI-0001',
  status: 'issued',
  approvalMode: 'direct',
  warehouseId: 'wh1',
  warehouseName: 'مخزن',
  departmentId: 'dep1',
  departmentName: 'صيانة',
  lines: [
    {
      itemType: 'material',
      itemId: 'm1',
      itemName: 'قفاز',
      itemCode: 'G1',
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

validateReturnLines(issue, [{ itemId: 'm1', quantity: 3 }]);
assert.throws(() => validateReturnLines(issue, [{ itemId: 'm1', quantity: 9 }]), /تتجاوز/);
const afterReturn = applyReturnQuantities(issue.lines, [{ itemId: 'm1', quantity: 3 }]);
assert.equal(afterReturn[0].returnedQty, 5);

const multiLocationIssue: DepartmentConsumableIssue = {
  ...issue,
  lines: [
    {
      ...issue.lines[0],
      lineId: departmentConsumableLineId('m1', 'loc-a'),
      locationId: 'loc-a',
      locationCode: 'A-01',
      quantity: 6,
      returnedQty: 0,
    },
    {
      ...issue.lines[0],
      lineId: departmentConsumableLineId('m1', 'loc-b'),
      locationId: 'loc-b',
      locationCode: 'B-01',
      quantity: 4,
      returnedQty: 1,
    },
  ],
};
validateReturnLines(multiLocationIssue, [
  { itemId: 'm1', locationId: 'loc-a', quantity: 2 },
  { itemId: 'm1', locationId: 'loc-b', quantity: 3 },
]);
assert.throws(
  () => validateReturnLines(multiLocationIssue, [{ itemId: 'm1', quantity: 1 }]),
  /الصنف والرف/,
);
const multiLocationAfterReturn = applyReturnQuantities(multiLocationIssue.lines, [
  { itemId: 'm1', locationId: 'loc-a', quantity: 2 },
  {
    lineId: departmentConsumableLineId('m1', 'loc-b'),
    itemId: 'm1',
    locationId: 'loc-b',
    quantity: 3,
  },
]);
assert.equal(multiLocationAfterReturn[0].returnedQty, 2);
assert.equal(multiLocationAfterReturn[1].returnedQty, 4);

const { startIso, endExclusiveIso } = monthRangeIso('2026-08');
assert.ok(startIso.startsWith('2026-08-01'));
assert.ok(endExclusiveIso.startsWith('2026-09-01'));
assert.throws(() => monthRangeIso('2026-8'), /YYYY-MM/);

const txs: StockTransaction[] = [
  {
    warehouseId: 'wh1',
    itemType: 'material',
    itemId: 'm1',
    itemName: 'قفاز',
    itemCode: 'G1',
    movementType: 'OUT',
    quantity: 10,
    unit: 'piece',
    sourceModule: 'department_consumable_issue',
    sourceId: 'iss1',
    departmentId: 'dep1',
    departmentName: 'صيانة',
    totalCostSnapshot: 50,
    createdAt: '2026-08-10T10:00:00.000Z',
    createdBy: 'u',
  },
  {
    warehouseId: 'wh1',
    itemType: 'material',
    itemId: 'm1',
    itemName: 'قفاز',
    itemCode: 'G1',
    movementType: 'IN',
    quantity: 2,
    unit: 'piece',
    sourceModule: 'department_consumable_return',
    sourceId: 'iss1',
    departmentId: 'dep1',
    departmentName: 'صيانة',
    totalCostSnapshot: 10,
    createdAt: '2026-08-12T10:00:00.000Z',
    createdBy: 'u',
  },
  {
    warehouseId: 'wh1',
    itemType: 'material',
    itemId: 'm2',
    itemName: 'كمامة',
    itemCode: 'M2',
    movementType: 'OUT',
    quantity: 5,
    unit: 'box',
    sourceModule: 'department_consumable_issue',
    sourceId: 'iss2',
    departmentId: 'dep2',
    departmentName: 'إنتاج',
    totalCostSnapshot: 20,
    createdAt: '2026-08-11T10:00:00.000Z',
    createdBy: 'u',
  },
];

const report = aggregateDepartmentConsumableMonthly({
  month: '2026-08',
  transactions: txs,
});
assert.equal(report.issueCount, 2);
assert.equal(report.totalIssuedCost, 70);
assert.equal(report.totalReturnedCost, 10);
assert.equal(report.totalNetCost, 60);
assert.equal(report.rows.length, 2);

const gloves = report.rows.find((row) => row.itemId === 'm1');
assert.ok(gloves);
assert.equal(gloves!.issuedQty, 10);
assert.equal(gloves!.returnedQty, 2);
assert.equal(gloves!.netQty, 8);
assert.equal(gloves!.netCost, 40);

const filtered = aggregateDepartmentConsumableMonthly({
  month: '2026-08',
  transactions: txs,
  departmentId: 'dep1',
});
assert.equal(filtered.rows.length, 1);
assert.equal(filtered.issueCount, 1);

console.log('department-consumable-issue.test.ts: ok');
