import assert from 'node:assert/strict';
import { buildLedger, buildTrialBalance, postedEntries } from '../modules/accounting/lib/accountingReports.ts';
import type { AccountingAccount, AccountingJournalEntry } from '../modules/accounting/types.ts';

const accounts: AccountingAccount[] = [
  { tenantId: 't1', code: '111001', name: 'الخزينة', type: 'asset', allowPosting: true, isActive: true },
  { tenantId: 't1', code: '411001', name: 'الإيراد', type: 'revenue', allowPosting: true, isActive: true },
];
const entries: AccountingJournalEntry[] = [
  {
    id: 'j1', tenantId: 't1', referenceNo: 'JV-1', source: 'manual_journal', status: 'posted', date: '2026-08-01',
    totalDebit: 100, totalCredit: 100,
    lines: [
      { accountCode: '111001', accountName: 'الخزينة', debit: 100, credit: 0 },
      { accountCode: '411001', accountName: 'الإيراد', debit: 0, credit: 100 },
    ],
  },
  {
    id: 'j2', tenantId: 't1', referenceNo: 'JV-2', source: 'manual_journal', status: 'reversed', date: '2026-08-02',
    totalDebit: 20, totalCredit: 20,
    lines: [
      { accountCode: '111001', accountName: 'الخزينة', debit: 20, credit: 0 },
      { accountCode: '411001', accountName: 'الإيراد', debit: 0, credit: 20 },
    ],
  },
];

const posted = postedEntries(entries, '2026-08-01', '2026-08-31');
assert.equal(posted.length, 1, 'reversed journals must not enter live reports');
const trial = buildTrialBalance(accounts, posted);
assert.equal(trial.reduce((sum, row) => sum + row.debit, 0), 100);
assert.equal(trial.reduce((sum, row) => sum + row.credit, 0), 100);
assert.equal(trial.find((row) => row.code === '111001')?.balance, 100);
assert.equal(trial.find((row) => row.code === '411001')?.balance, -100);
const ledger = buildLedger(posted, '111001');
assert.equal(ledger.length, 1);
assert.equal(ledger[0].balance, 100);

console.log('accounting-reports.test.ts: ok');
