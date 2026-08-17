import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateRepairBalance,
  calculateRepairPaymentTotals,
} from '../modules/repair/lib/repairPaymentMath';
import { REPAIR_TECHNICIAN_PERMISSIONS } from '../modules/repair/lib/repairBuiltinRoles';

const byAmount = calculateRepairPaymentTotals({ grossAmount: 1000, discountType: 'amount', discountValue: 100 });
const byPercent = calculateRepairPaymentTotals({ grossAmount: 1000, discountType: 'percent', discountValue: 10 });
assert.equal(byAmount.discountAmount, byPercent.discountAmount);
assert.equal(byAmount.netAmount, 900);
assert.equal(calculateRepairPaymentTotals({ grossAmount: 10.005, discountType: 'none', discountValue: 0 }).grossAmount, 10.01);
assert.throws(() => calculateRepairPaymentTotals({ grossAmount: 100, discountType: 'percent', discountValue: 101 }));
assert.throws(() => calculateRepairPaymentTotals({ grossAmount: 100, discountType: 'amount', discountValue: 101 }));

assert.deepEqual(calculateRepairBalance(900, 300), { paidAmount: 300, balanceDue: 600, paymentStatus: 'partial' });
assert.deepEqual(calculateRepairBalance(900, 900), { paidAmount: 900, balanceDue: 0, paymentStatus: 'paid' });
assert.throws(() => calculateRepairBalance(900, 901));

const forbiddenFragments = ['finance', 'payment', 'discount', 'credit', 'treasury', 'accounting', 'repair.jobs.edit'];
for (const permission of REPAIR_TECHNICIAN_PERMISSIONS) {
  assert.equal(forbiddenFragments.some((fragment) => permission.includes(fragment)), false, `technician leaked permission: ${permission}`);
}

const serverSource = readFileSync(new URL('../functions/src/repairPaymentOps.ts', import.meta.url), 'utf8');
assert.match(serverSource, /requestedBy[^\n]+actor\.uid/);
assert.match(serverSource, /لا يمكن لمقدم الطلب اعتماد طلبه/);
assert.match(serverSource, /paymentSnap\.exists/);
assert.match(serverSource, /defaultSalePrice/);
assert.doesNotMatch(serverSource, /unitPrice\s*=.*usage\.unitCost/);
assert.match(serverSource, /!warrantyJob && breakdown\.grossAmount\s*<=\s*0/);
assert.match(serverSource, /لا يمكن إنشاء إذن دفع بقيمة صفر/);
assert.match(serverSource, /!warrantySettlement && gross <= 0/);
assert.match(serverSource, /إذن الدفع الحالي قيمته صفر وغير صالح للتسليم/);
assert.match(serverSource, /settlementType:\s*warrantyJob \? WARRANTY_SETTLEMENT/);
assert.match(serverSource, /WAR-\$\{receiptNo\}/);
assert.match(serverSource, /طلب ضمان المصنّع لا يُرسل لموافقة تسعير العميل/);
assert.match(serverSource, /job\.delivered_warranty/);
assert.match(serverSource, /warranty_settled/);
assert.match(serverSource, /assertAccountingMapReady/);
assert.match(serverSource, /loadLiveBranchAccounting/);
assert.match(serverSource, /Refresh stale account snapshots/);

const accountingSource = readFileSync(new URL('../functions/src/accountingOps.ts', import.meta.url), 'utf8');
assert.match(accountingSource, /postingAccountsByCode/);
assert.match(accountingSource, /REPAIR_ACCOUNT_TYPES/);
assert.match(accountingSource, /missingAccountKeys/);

const paymentsUiSource = readFileSync(new URL('../modules/repair/pages/RepairPayments.tsx', import.meta.url), 'utf8');
assert.match(paymentsUiSource, /غير صالح — بدون تسعير/);
assert.match(paymentsUiSource, /!isZeroValueAuthorization\(auth\)/);
assert.match(paymentsUiSource, /isWarrantySettlementAuth/);
assert.match(paymentsUiSource, /تجهيز إقفال الضمان/);

const spareIssueSource = readFileSync(new URL('../functions/src/repairSpareIssues.ts', import.meta.url), 'utf8');
assert.match(spareIssueSource, /unitCostSnapshot:\s*toNumber\(line\.unitCostSnapshot\)/);
assert.match(spareIssueSource, /totalCostSnapshot:\s*toNumber\(line\.totalCostSnapshot\)/);

const technicianSource = readFileSync(new URL('../functions/src/repairTechnicianOps.ts', import.meta.url), 'utf8');
for (const field of ['customerPhone', 'finalCost', 'paidAmount', 'balanceDue', 'paymentStatus']) {
  assert.match(technicianSource, new RegExp(`['\"]${field}['\"]`));
}
assert.match(technicianSource, /warrantyScope/);

console.log('repair-payment-workflow.test.ts: all tests passed');
