import assert from 'node:assert/strict';
import { resolveRepairJobPrintProducts } from '../modules/repair/lib/repairJobPrint';
import type { RepairJob } from '../modules/repair/types';

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

console.log('repair-job-print.test.ts: ok');
