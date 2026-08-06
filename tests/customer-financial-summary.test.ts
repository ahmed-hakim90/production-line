import assert from 'node:assert/strict';
import { summarizeCustomerFinancialRows } from '../functions/src/customerFinancialSummary.ts';

const repairs = [
  { cancelled: false, warranty: false, grossAmount: 500, discountAmount: 50, warrantyAllowance: 0, balanceDue: 100,
    warrantyActualCost: 0, warrantyPartsActualCost: 0, warrantyServiceInternalCost: 0, legacyIncomplete: false },
  { cancelled: false, warranty: true, grossAmount: 300, discountAmount: 300, warrantyAllowance: 300, balanceDue: 0,
    warrantyActualCost: 90, warrantyPartsActualCost: 60, warrantyServiceInternalCost: 30, legacyIncomplete: false },
  { cancelled: true, warranty: false, grossAmount: 999, discountAmount: 0, warrantyAllowance: 0, balanceDue: 999,
    warrantyActualCost: 0, warrantyPartsActualCost: 0, warrantyServiceInternalCost: 0, legacyIncomplete: false },
];
const invoices = [
  { status: 'posted', grossAmount: 200, discountAmount: 200, netAmount: 0, quantity: 2, fullDiscount: true },
  { status: 'posted', grossAmount: 400, discountAmount: 40, netAmount: 360, quantity: 4, fullDiscount: false },
  { status: 'cancelled', grossAmount: 1000, discountAmount: 0, netAmount: 1000, quantity: 5, fullDiscount: false },
];
const payments = [{ status: 'posted', amount: 350 }, { status: 'reversed', amount: 50 }];
const result = summarizeCustomerFinancialRows(repairs, invoices, payments);
assert.equal(result.repairJobs, 2);
assert.equal(result.warrantyJobs, 1);
assert.equal(result.repairGross, 800);
assert.equal(result.repairDiscounts, 50);
assert.equal(result.warrantyAllowances, 300);
assert.equal(result.warrantyActualCost, 90);
assert.equal(result.salesGross, 600);
assert.equal(result.salesDiscounts, 240);
assert.equal(result.salesNetPaid, 360);
assert.equal(result.totalCustomerPaid, 710);
assert.equal(result.fullDiscountInvoices, 1);

console.log('customer-financial-summary.test.ts: ok');
