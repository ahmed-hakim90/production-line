import assert from 'node:assert/strict';
import {
  buildRepairProductCardFields,
  resolveRepairJobPrintProducts,
} from '../modules/repair/lib/repairJobPrint';
import {
  shouldShowRepairPrintCosts,
  stripRepairProductsToIntake,
} from '../modules/repair/lib/repairJobIntake';
import type { RepairJob, RepairJobProduct } from '../modules/repair/types';

const baseJob = {
  tenantId: 't1',
  receiptNo: 'REP-0001',
  branchId: 'b1',
  customerName: 'أحمد',
  customerPhone: '0100',
  deviceType: 'منتج',
  deviceBrand: 'Sokany',
  deviceModel: 'SK-1',
  problemDescription: 'عطل',
  status: 'received',
  warranty: 'none',
  partsUsed: [],
  estimatedCost: 0,
  finalCost: 0,
  createdAt: '2026-08-04T00:00:00.000Z',
  updatedAt: '2026-08-04T00:00:00.000Z',
} as RepairJob;

const fromLegacy = resolveRepairJobPrintProducts(baseJob);
assert.equal(fromLegacy.length, 1);
assert.equal(fromLegacy[0].productName, 'Sokany');

const withProducts = resolveRepairJobPrintProducts(baseJob, [
  { itemId: 'p1', productName: 'منتج أ', finalCost: 100 },
  { itemId: 'p2', productName: 'منتج ب', finalCost: 50, inWarranty: true },
]);
assert.equal(withProducts.length, 2);
assert.equal(withProducts[1].inWarranty, true);

const fromJobProducts = resolveRepairJobPrintProducts({
  ...baseJob,
  jobProducts: [{ itemId: 'jp1', productName: 'من jobProducts' }],
});
assert.equal(fromJobProducts[0].productName, 'من jobProducts');

// Intake create must strip client-trusted services and prices.
const stripped = stripRepairProductsToIntake([
  {
    itemId: 'x1',
    productName: 'خلاط',
    quantity: 2,
    serviceIds: ['screen', 'diagnosis'],
    estimatedCost: 999,
    finalCost: 500,
  },
] as RepairJobProduct[]);
assert.deepEqual(stripped[0].serviceIds, []);
assert.equal(stripped[0].estimatedCost, 0);
assert.equal(stripped[0].finalCost, 0);
assert.equal(stripped[0].quantity, 2);

// Empty optional serial must be omitted — Firestore rejects undefined nested fields.
const withoutSerial = stripRepairProductsToIntake([
  {
    itemId: 'x2',
    productName: 'كبه',
    serialNo: undefined,
    accessoryIds: undefined,
  },
] as RepairJobProduct[]);
assert.equal(Object.prototype.hasOwnProperty.call(withoutSerial[0], 'serialNo'), false);
assert.equal(Object.prototype.hasOwnProperty.call(withoutSerial[0], 'accessoryIds'), false);

const withSerial = stripRepairProductsToIntake([
  {
    itemId: 'x3',
    productName: 'كبه',
    serialNo: '  SN-9  ',
    accessoryIds: ['acc-1'],
  },
] as RepairJobProduct[]);
assert.equal(withSerial[0].serialNo, 'SN-9');
assert.deepEqual(withSerial[0].accessoryIds, ['acc-1']);

// Intake slip: hide cost columns until workshop pricing exists.
assert.equal(shouldShowRepairPrintCosts(baseJob), false);
assert.equal(
  shouldShowRepairPrintCosts({
    ...baseJob,
    jobProducts: [{ itemId: 'a', productName: 'جهاز', serviceIds: ['diagnosis'], finalCost: 50 }],
  }),
  true,
);
assert.equal(shouldShowRepairPrintCosts({ ...baseJob, finalCost: 200 }), true);
assert.equal(shouldShowRepairPrintCosts({ ...baseJob, laborCost: 30 }), true);

// Product card must expose Arabic status for intake print.
const card = buildRepairProductCardFields(
  baseJob,
  { itemId: 'p1', productName: 'خلاط' },
  'فرع الرئيسي',
);
assert.equal(card.statusLabel, 'وارد');
assert.equal(card.branchName, 'فرع الرئيسي');

const cardFromSettings = buildRepairProductCardFields(
  { ...baseJob, status: 'repairing' },
  { itemId: 'p1', productName: 'خلاط' },
  undefined,
  { repairing: { label: 'قيد الإصلاح', color: '#112233' } },
);
assert.equal(cardFromSettings.statusLabel, 'قيد الإصلاح');
assert.equal(cardFromSettings.statusColor, '#112233');

console.log('repair-job-print.test.ts: ok');
