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
import {
  effectiveSparePartUnitCost,
  repairSparePartSalePrice,
  resolveRepairSalePrice,
} from '../modules/repair/utils/sparePartPricing';

/** Mirrors repairSpareIssues aliases in utils/permissions.ts (no inventory fallbacks). */
function repairSpareIssuePermissionAlias(
  permissions: Record<string, boolean>,
  permission:
    | 'repairSpareIssues.view'
    | 'repairSpareIssues.create'
    | 'repairSpareIssues.approve'
    | 'repairSpareIssues.issue',
): boolean {
  const explicit = permissions[permission];
  if (explicit !== undefined) return explicit === true;
  if (permission === 'repairSpareIssues.view') {
    return permissions['repair.parts.view'] === true || permissions['repair.view'] === true;
  }
  if (permission === 'repairSpareIssues.create') {
    return permissions['repair.parts.manage'] === true;
  }
  if (permission === 'repairSpareIssues.approve') {
    return permissions['repair.parts.manage'] === true;
  }
  if (permission === 'repairSpareIssues.issue') {
    return permissions['repair.parts.manage'] === true;
  }
  return false;
}

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

// Permission aliases: repair spare issues map from repair.parts / repair.view only — not inventory keys.
assert.equal(
  repairSpareIssuePermissionAlias({ 'repairSpareIssues.view': true }, 'repairSpareIssues.view'),
  true,
);
assert.equal(
  repairSpareIssuePermissionAlias({ 'repair.parts.view': true }, 'repairSpareIssues.view'),
  true,
);
assert.equal(
  repairSpareIssuePermissionAlias({ 'repair.parts.manage': true }, 'repairSpareIssues.create'),
  true,
);
assert.equal(
  repairSpareIssuePermissionAlias({ 'inventory.transactions.create': true }, 'repairSpareIssues.create'),
  false,
);
assert.equal(
  repairSpareIssuePermissionAlias({ 'inventory.transfers.approve': true }, 'repairSpareIssues.approve'),
  false,
);
assert.equal(
  repairSpareIssuePermissionAlias({ 'inventory.transactions.create': true }, 'repairSpareIssues.issue'),
  false,
);

// Repair UI sale/usage price: Material company price wins over branch catalog.
{
  const part = {
    id: 'p1',
    name: 'محرك',
    code: 'MOT',
    materialId: 'm1',
    unit: 'piece',
    defaultSalePrice: 120,
    purchaseUnitCost: 40,
  };
  const option = {
    value: String(part.materialId),
    label: part.name,
    salePrice: resolveRepairSalePrice({
      materialSalePrice: 150,
      partSalePrice: part.defaultSalePrice,
    }),
  };
  assert.equal(option.salePrice, 150);
  assert.equal('unitCost' in option, false);
  assert.equal('purchaseCost' in option, false);
}

{
  const part = { defaultSalePrice: 90, purchaseUnitCost: 40, warehouseDiscountPercent: 10 };
  assert.equal(repairSparePartSalePrice(part), 90);
  assert.equal(effectiveSparePartUnitCost(part as any), 36);
  assert.notEqual(repairSparePartSalePrice(part), effectiveSparePartUnitCost(part as any));
}

{
  // Materials master only — branch catalog partSalePrice is ignored.
  assert.equal(resolveRepairSalePrice({ materialSalePrice: 200, partSalePrice: 90 }), 200);
  assert.equal(resolveRepairSalePrice({ materialSalePrice: 0, partSalePrice: 90 }), 0);
  assert.equal(resolveRepairSalePrice({ materialSalePrice: null, partSalePrice: 40 }), 0);
  assert.equal(resolveRepairSalePrice({ materialSalePrice: -1, partSalePrice: 40 }), 0);
  assert.equal(resolveRepairSalePrice({}), 0);
  // Trader prefers traderSalePrice when set; otherwise falls back to consumer.
  assert.equal(
    resolveRepairSalePrice({
      customerType: 'trader',
      materialSalePrice: 200,
      materialTraderSalePrice: 150,
      partSalePrice: 90,
    }),
    150,
  );
  assert.equal(
    resolveRepairSalePrice({
      customerType: 'trader',
      materialSalePrice: 200,
      materialTraderSalePrice: 0,
      partSalePrice: 90,
    }),
    200,
  );
  assert.equal(
    resolveRepairSalePrice({
      customerType: 'consumer',
      materialSalePrice: 200,
      materialTraderSalePrice: 150,
    }),
    200,
  );
  assert.equal(
    resolveRepairSalePrice({
      customerType: 'trader',
      materialSalePrice: 0,
      materialTraderSalePrice: 0,
      partSalePrice: 90,
    }),
    0,
  );
}

console.log('repair-spare-issue.test.ts: ok');
