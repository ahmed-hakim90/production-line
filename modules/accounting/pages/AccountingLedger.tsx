import React, { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataPaginationFooter } from "@/src/components/erp/DataPaginationFooter";
import { AccountingPeriodToolbar } from "../components/AccountingPeriodToolbar";
import { useAccountingBaseData } from "../hooks/useAccountingBaseData";
import { buildLedger, postedEntries } from "../lib/accountingReports";
import {
  PAGE_SIZE,
  accountingMonthStart,
  accountingToday,
  exportAccountingCsv,
  formatAccountingMoney,
} from "../lib/accountingUi";

export const AccountingLedger: React.FC = () => {
  const { accounts, journals, loading, reload } = useAccountingBaseData();
  const [from, setFrom] = useState(accountingMonthStart());
  const [to, setTo] = useState(accountingToday());
  const [ledgerAccount, setLedgerAccount] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (ledgerAccount) return;
    const first = accounts.find((row) => row.allowPosting && row.isActive);
    if (first) setLedgerAccount(first.code);
  }, [accounts, ledgerAccount]);

  const filteredEntries = useMemo(
    () => postedEntries(journals, from, to),
    [journals, from, to],
  );
  const ledger = useMemo(
    () => buildLedger(filteredEntries, ledgerAccount),
    [filteredEntries, ledgerAccount],
  );

  useEffect(() => setPage(1), [from, to, ledgerAccount]);

  const totalPages = Math.max(1, Math.ceil(ledger.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = ledger.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const selected = accounts.find((row) => row.code === ledgerAccount);

  return (
    <div className="erp-ds-clean space-y-5" dir="rtl">
      <PageHeader
        title="دفتر الأستاذ"
        subtitle="حركة ورصيد كل حساب بالتسلسل الزمني"
        icon="menu_book"
        backAction={false}
        moreActions={[
          {
            label: "طباعة",
            icon: "print",
            onClick: () => window.print(),
            group: "تصدير",
          },
          {
            label: "تصدير CSV",
            icon: "download",
            onClick: () =>
              exportAccountingCsv(
                "general-ledger.csv",
                ["التاريخ", "المرجع", "البيان", "مدين", "دائن", "الرصيد"],
                ledger.map((row) => [
                  row.date,
                  row.referenceNo,
                  row.description,
                  row.debit,
                  row.credit,
                  row.balance,
                ]),
              ),
            group: "تصدير",
          },
        ]}
      />

      <Card className="!p-0 overflow-hidden shadow-none">
        <CardContent className="border-b p-4">
          <AccountingPeriodToolbar
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            onRefresh={() => void reload()}
            refreshing={loading}
            accountCode={ledgerAccount}
            onAccountChange={setLedgerAccount}
            accounts={accounts
              .filter((row) => row.allowPosting)
              .map((row) => ({ code: row.code, name: row.name }))}
            onPrint={() => window.print()}
            onExport={() =>
              exportAccountingCsv(
                "general-ledger.csv",
                ["التاريخ", "المرجع", "البيان", "مدين", "دائن", "الرصيد"],
                ledger.map((row) => [
                  row.date,
                  row.referenceNo,
                  row.description,
                  row.debit,
                  row.credit,
                  row.balance,
                ]),
              )
            }
          />
          {selected ? (
            <p className="mt-3 text-sm text-muted-foreground">
              الحساب:{" "}
              <strong className="text-foreground">
                {selected.code} — {selected.name}
              </strong>
            </p>
          ) : null}
        </CardContent>
        <div className="erp-mobile-card-list p-2">
          {loading
            ? Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-xl border p-3">
                  <Skeleton className="h-8 w-full" />
                </div>
              ))
            : null}
          {!loading &&
            paged.map((row, index) => (
              <div
                key={`m-${row.entryId}_${index}`}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-mono text-sm font-semibold">{row.referenceNo}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">{row.date}</p>
                </div>
                <p className="mt-1 text-sm">{row.description}</p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-[10px] text-muted-foreground">مدين</dt>
                    <dd className="tabular-nums">{formatAccountingMoney(row.debit)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted-foreground">دائن</dt>
                    <dd className="tabular-nums">{formatAccountingMoney(row.credit)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted-foreground">الرصيد</dt>
                    <dd className="font-semibold tabular-nums">{formatAccountingMoney(row.balance)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          {!loading && ledger.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">لا توجد حركة لهذا الحساب في الفترة.</p>
          ) : null}
        </div>
        <div className="erp-desktop-table erp-table-scroll">
          <table className="erp-table min-w-[720px]">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">التاريخ</th>
                <th className="erp-th text-start">المرجع</th>
                <th className="erp-th text-start">البيان</th>
                <th className="erp-th">مدين</th>
                <th className="erp-th">دائن</th>
                <th className="erp-th">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={6} className="p-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : null}
              {!loading &&
                paged.map((row, index) => (
                  <tr key={`${row.entryId}_${index}`}>
                    <td className="text-center tabular-nums">{row.date}</td>
                    <td className="font-mono">{row.referenceNo}</td>
                    <td>{row.description}</td>
                    <td className="text-center tabular-nums">
                      {formatAccountingMoney(row.debit)}
                    </td>
                    <td className="text-center tabular-nums">
                      {formatAccountingMoney(row.credit)}
                    </td>
                    <td className="text-center font-semibold tabular-nums">
                      {formatAccountingMoney(row.balance)}
                    </td>
                  </tr>
                ))}
              {!loading && ledger.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="p-10 text-center text-muted-foreground"
                  >
                    لا توجد حركة لهذا الحساب في الفترة.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <DataPaginationFooter
          page={safePage}
          totalPages={totalPages}
          totalItems={ledger.length}
          onPageChange={setPage}
          itemLabel="حركة"
        />
      </Card>
    </div>
  );
};
