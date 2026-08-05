import type { AccountingAccount, AccountingJournalEntry } from "../types";

export const accountingMoney = (value: unknown) =>
  Math.round(Number(value || 0) * 100) / 100;

export function postedEntries(
  entries: AccountingJournalEntry[],
  from?: string,
  to?: string,
) {
  return entries.filter((entry) => {
    if (entry.status !== "posted") return false;
    const date = String(
      entry.date || entry.postedAt || entry.createdAt || "",
    ).slice(0, 10);
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  });
}

export function buildTrialBalance(
  accounts: AccountingAccount[],
  entries: AccountingJournalEntry[],
) {
  const map = new Map(
    accounts.map((account) => [
      account.code,
      {
        code: account.code,
        name: account.name,
        type: account.type,
        debit: 0,
        credit: 0,
        balance: 0,
      },
    ]),
  );
  for (const entry of entries) {
    for (const line of entry.lines || []) {
      const row = map.get(line.accountCode) || {
        code: line.accountCode,
        name: line.accountName || line.accountCode,
        type: "asset" as const,
        debit: 0,
        credit: 0,
        balance: 0,
      };
      row.debit = accountingMoney(row.debit + Number(line.debit || 0));
      row.credit = accountingMoney(row.credit + Number(line.credit || 0));
      row.balance = accountingMoney(row.debit - row.credit);
      map.set(line.accountCode, row);
    }
  }
  return Array.from(map.values())
    .filter((row) => row.debit || row.credit)
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function buildLedger(
  entries: AccountingJournalEntry[],
  accountCode: string,
) {
  let runningBalance = 0;
  return entries
    .flatMap((entry) =>
      (entry.lines || [])
        .filter((line) => line.accountCode === accountCode)
        .map((line) => ({
          entryId: entry.id || "",
          date: String(
            entry.date || entry.postedAt || entry.createdAt || "",
          ).slice(0, 10),
          referenceNo: entry.referenceNo,
          description: line.description || entry.description || entry.source,
          debit: accountingMoney(line.debit),
          credit: accountingMoney(line.credit),
          source: entry.source,
        })),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.referenceNo.localeCompare(b.referenceNo),
    )
    .map((row) => {
      runningBalance = accountingMoney(runningBalance + row.debit - row.credit);
      return { ...row, balance: runningBalance };
    });
}
