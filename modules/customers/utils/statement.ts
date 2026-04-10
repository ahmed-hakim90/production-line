import type {
  CustomerDepositAdjustment,
  CustomerDepositEntry,
  CustomerDepositStatementRow,
} from '../types';

export function buildCustomerStatementRows(
  entries: CustomerDepositEntry[],
  adjustments: CustomerDepositAdjustment[],
): CustomerDepositStatementRow[] {
  const rows: CustomerDepositStatementRow[] = [];
  for (const e of entries) {
    const serialPart =
      typeof e.depositSerial === 'number' && e.depositSerial >= 1 ? `رقم ${e.depositSerial} — ` : '';
    rows.push({
      kind: 'deposit',
      id: e.id,
      date: e.depositDate,
      amount: Number(e.amount) || 0,
      status: e.status,
      label: `${serialPart}إيداع — ${e.depositorName}`,
    });
  }
  for (const a of adjustments) {
    rows.push({
      kind: 'adjustment',
      id: a.id,
      date: a.effectiveDate,
      amount: Number(a.signedAmount) || 0,
      label: a.note || 'تسوية',
    });
  }
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return rows;
}

export function runningBalancesForStatement(
  rows: CustomerDepositStatementRow[],
  openingBalance: number,
): { row: CustomerDepositStatementRow; balance: number }[] {
  /** رصيد مستحق على العميل بعد كل سطر: opening - confirmed_deposits + adjustments */
  const out: { row: CustomerDepositStatementRow; balance: number }[] = [];
  let bal = Number(openingBalance) || 0;
  const chronological = [...rows].sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
  for (const row of chronological) {
    if (row.kind === 'deposit') {
      if (row.status === 'confirmed') {
        bal -= row.amount;
      }
    } else {
      bal += row.amount;
    }
    out.push({ row, balance: bal });
  }
  return out;
}
