import assert from 'node:assert/strict';
import { buildRepairPnl } from '../modules/accounting/lib/repairPnl.ts';
import type { AccountingAccount, AccountingJournalEntry } from '../modules/accounting/types.ts';
import {
  REPAIR_TREASURY_EXPENSE_TYPES,
  getRepairTreasuryExpenseType,
} from '../modules/repair/lib/repairTreasuryExpenseTypes.ts';

const accounts: AccountingAccount[] = [
  { tenantId: 't1', code: '111001', name: 'نقدية', type: 'asset', allowPosting: true, isActive: true },
  { tenantId: 't1', code: '411001', name: 'إيراد خدمات', type: 'revenue', allowPosting: true, isActive: true },
  { tenantId: 't1', code: '412001', name: 'إيراد قطع', type: 'revenue', allowPosting: true, isActive: true },
  { tenantId: 't1', code: '419001', name: 'خصومات', type: 'contra_revenue', allowPosting: true, isActive: true },
  { tenantId: 't1', code: '511001', name: 'تكلفة قطع', type: 'expense', allowPosting: true, isActive: true },
  { tenantId: 't1', code: '611001', name: 'مرتبات', type: 'expense', allowPosting: true, isActive: true },
  { tenantId: 't1', code: '612002', name: 'كهرباء', type: 'expense', allowPosting: true, isActive: true },
];

const entries: AccountingJournalEntry[] = [
  {
    id: 'd1',
    tenantId: 't1',
    costCenterId: 'cc-main',
    referenceNo: 'DEL-1',
    source: 'repair_delivery',
    status: 'posted',
    date: '2026-08-02',
    totalDebit: 1000,
    totalCredit: 1000,
    lines: [
      { accountCode: '211001', accountName: 'دفعات', debit: 900, credit: 0, costCenterId: 'cc-main' },
      { accountCode: '419001', accountName: 'خصومات', debit: 100, credit: 0, costCenterId: 'cc-main' },
      { accountCode: '411001', accountName: 'إيراد خدمات', debit: 0, credit: 700, costCenterId: 'cc-main' },
      { accountCode: '412001', accountName: 'إيراد قطع', debit: 0, credit: 300, costCenterId: 'cc-main' },
    ],
  },
  {
    id: 'cogs1',
    tenantId: 't1',
    costCenterId: 'cc-main',
    referenceNo: 'COGS-1',
    source: 'repair_parts_cogs',
    status: 'posted',
    date: '2026-08-02',
    totalDebit: 120,
    totalCredit: 120,
    lines: [
      { accountCode: '511001', accountName: 'تكلفة قطع', debit: 120, credit: 0, costCenterId: 'cc-main' },
      { accountCode: '131001', accountName: 'مخزون', debit: 0, credit: 120, costCenterId: 'cc-main' },
    ],
  },
  {
    id: 'exp1',
    tenantId: 't1',
    costCenterId: 'cc-main',
    referenceNo: 'TR-1',
    source: 'repair_treasury_manual',
    expenseType: 'salaries',
    status: 'posted',
    date: '2026-08-03',
    totalDebit: 200,
    totalCredit: 200,
    lines: [
      { accountCode: '611001', accountName: 'مرتبات', debit: 200, credit: 0, costCenterId: 'cc-main' },
      { accountCode: '111001', accountName: 'نقدية', debit: 0, credit: 200, costCenterId: 'cc-main' },
    ],
  },
  {
    id: 'exp2',
    tenantId: 't1',
    costCenterId: 'cc-other',
    referenceNo: 'TR-2',
    source: 'repair_treasury_manual',
    expenseType: 'electricity',
    status: 'posted',
    date: '2026-08-03',
    totalDebit: 50,
    totalCredit: 50,
    lines: [
      { accountCode: '612002', accountName: 'كهرباء', debit: 50, credit: 0, costCenterId: 'cc-other' },
      { accountCode: '111001', accountName: 'نقدية', debit: 0, credit: 50, costCenterId: 'cc-other' },
    ],
  },
  {
    id: 'ignored',
    tenantId: 't1',
    referenceNo: 'JV-1',
    source: 'manual_journal',
    status: 'posted',
    date: '2026-08-03',
    totalDebit: 10,
    totalCredit: 10,
    lines: [
      { accountCode: '611001', accountName: 'مرتبات', debit: 10, credit: 0 },
      { accountCode: '111001', accountName: 'نقدية', debit: 0, credit: 10 },
    ],
  },
];

const all = buildRepairPnl(accounts, entries, { from: '2026-08-01', to: '2026-08-31' });
assert.equal(all.serviceRevenue, 700);
assert.equal(all.partsRevenue, 300);
assert.equal(all.discounts, 100);
assert.equal(all.netRevenue, 900);
assert.equal(all.partsCogs, 120);
assert.equal(all.operatingExpenses, 250);
assert.equal(all.operatingProfit, 530);
assert.equal(all.expensesByType.find((row) => row.key === 'salaries')?.amount, 200);
assert.equal(all.expensesByType.find((row) => row.key === 'electricity')?.amount, 50);

const mainOnly = buildRepairPnl(accounts, entries, {
  from: '2026-08-01',
  to: '2026-08-31',
  costCenterId: 'cc-main',
});
assert.equal(mainOnly.operatingExpenses, 200);
assert.equal(mainOnly.operatingProfit, 580);
assert.ok(!mainOnly.expensesByType.some((row) => row.key === 'electricity'));

assert.equal(getRepairTreasuryExpenseType('salaries')?.accountCode, '611001');
assert.equal(REPAIR_TREASURY_EXPENSE_TYPES.length, 8);

console.log('repair-pnl.test.ts: ok');
