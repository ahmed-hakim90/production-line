import React, { useEffect, useMemo, useState } from "react";
import { ModuleOpsPageShell } from "@/modules/dashboards/components/ModuleOpsPageShell";
import { OpsDashPanel } from "@/modules/dashboards/components/OperationsDashboardBoard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataPaginationFooter } from "@/src/components/erp/DataPaginationFooter";
import { SmartFilterBar } from "@/src/components/erp/SmartFilterBar";
import { AccountingPeriodToolbar } from "../components/AccountingPeriodToolbar";
import { useAccountingBaseData } from "../hooks/useAccountingBaseData";
import {
  accountingMoney,
  buildTrialBalance,
  postedEntries,
} from "../lib/accountingReports";
import {
  PAGE_SIZE,
  accountingMonthStart,
  accountingToday,
  exportAccountingCsv,
  formatAccountingMoney,
} from "../lib/accountingUi";

export const AccountingTrialBalance: React.FC = () => {
  const { accounts, journals, loading, reload } = useAccountingBaseData();
  const [from, setFrom] = useState(accountingMonthStart());
  const [to, setTo] = useState(accountingToday());
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filteredEntries = useMemo(
    () => postedEntries(journals, from, to),
    [journals, from, to],
  );
  const trial = useMemo(
    () => buildTrialBalance(accounts, filteredEntries),
    [accounts, filteredEntries],
  );
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trial;
    return trial.filter((row) =>
      `${row.code} ${row.name}`.toLowerCase().includes(q),
    );
  }, [trial, search]);

  useEffect(() => setPage(1), [from, to, search]);

  const totals = useMemo(
    () => ({
      debit: accountingMoney(trial.reduce((sum, row) => sum + row.debit, 0)),
      credit: accountingMoney(trial.reduce((sum, row) => sum + row.credit, 0)),
    }),
    [trial],
  );

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = visible.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  return (
    <ModuleOpsPageShell
      eyebrow="ميزان المراجعة"
      rangeLabel="إجمالي المدين والدائن ورصيد كل حساب"
      dir="rtl"
      onRefresh={() => void reload()}
      refreshing={loading}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            طباعة
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              exportAccountingCsv(
                "trial-balance.csv",
                ["الكود", "الحساب", "مدين", "دائن", "الرصيد"],
                visible.map((row) => [
                  row.code,
                  row.name,
                  row.debit,
                  row.credit,
                  row.balance,
                ]),
              )
            }
          >
            تصدير CSV
          </Button>
        </div>
      }
    >
      <OpsDashPanel title="ميزان المراجعة" bodyClassName="p-0">
        <div className="border-b p-4">
          <AccountingPeriodToolbar
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            onRefresh={() => void reload()}
            refreshing={loading}
            onPrint={() => window.print()}
            onExport={() =>
              exportAccountingCsv(
                "trial-balance.csv",
                ["الكود", "الحساب", "مدين", "دائن", "الرصيد"],
                visible.map((row) => [
                  row.code,
                  row.name,
                  row.debit,
                  row.credit,
                  row.balance,
                ]),
              )
            }
          />
        </div>
        <SmartFilterBar
          pageId="accounting-trial"
          searchPlaceholder="بحث بالكود أو اسم الحساب"
          searchValue={search}
          onSearchChange={setSearch}
        />
        <div className="erp-mobile-card-list p-2">
          {loading
            ? Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-xl border p-3">
                  <Skeleton className="h-8 w-full" />
                </div>
              ))
            : null}
          {!loading &&
            paged.map((row) => (
              <div
                key={`m-${row.code}`}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
              >
                <p className="font-mono text-sm font-semibold tabular-nums">{row.code}</p>
                <p className="mt-0.5 text-sm font-medium">{row.name}</p>
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
          {!loading && visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">لا توجد حركة في الفترة.</p>
          ) : null}
        </div>
        <div className="erp-desktop-table erp-table-scroll">
          <table className="erp-table min-w-[640px]">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th text-start">الكود</th>
                <th className="erp-th text-start">الحساب</th>
                <th className="erp-th">مدين</th>
                <th className="erp-th">دائن</th>
                <th className="erp-th">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <tr key={index}>
                      <td colSpan={5} className="p-3">
                        <Skeleton className="h-8 w-full" />
                      </td>
                    </tr>
                  ))
                : null}
              {!loading &&
                paged.map((row) => (
                  <tr key={row.code}>
                    <td className="font-mono tabular-nums">{row.code}</td>
                    <td>{row.name}</td>
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
              {!loading && visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="p-10 text-center text-muted-foreground"
                  >
                    لا توجد حركة في الفترة.
                  </td>
                </tr>
              ) : null}
            </tbody>
            {!loading && trial.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 font-bold">
                  <td colSpan={2} className="p-3">
                    الإجمالي
                  </td>
                  <td className="p-3 text-center tabular-nums">
                    {formatAccountingMoney(totals.debit)}
                  </td>
                  <td className="p-3 text-center tabular-nums">
                    {formatAccountingMoney(totals.credit)}
                  </td>
                  <td className="p-3 text-center tabular-nums">
                    {formatAccountingMoney(totals.debit - totals.credit)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
        <DataPaginationFooter
          page={safePage}
          totalPages={totalPages}
          totalItems={visible.length}
          onPageChange={setPage}
          itemLabel="حساب"
        />
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
