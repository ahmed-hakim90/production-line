import React, { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { KPICard } from "@/src/components/erp/KPICard";
import { AccountingPeriodToolbar } from "../components/AccountingPeriodToolbar";
import { useAccountingBaseData } from "../hooks/useAccountingBaseData";
import { buildRepairPnl } from "../lib/repairPnl";
import {
  accountingMonthStart,
  accountingToday,
  exportAccountingCsv,
  formatAccountingMoney,
} from "../lib/accountingUi";

export const AccountingRepairPnl: React.FC = () => {
  const { accounts, journals, readiness, loading, reload } =
    useAccountingBaseData();
  const [from, setFrom] = useState(accountingMonthStart());
  const [to, setTo] = useState(accountingToday());
  const [costCenterId, setCostCenterId] = useState("all");

  const repairCostCenters = useMemo(() => {
    const fromBranches = (readiness?.repairBranches || [])
      .filter((branch) => branch.costCenterId)
      .map((branch) => ({
        id: branch.costCenterId,
        label: `${branch.name}`,
      }));
    const fromCenters = (readiness?.costCenters || [])
      .filter(
        (center) =>
          center.isActive !== false &&
          (center.accountingCategory === "repair" ||
            fromBranches.some((row) => row.id === center.id)),
      )
      .map((center) => ({
        id: center.id,
        label: `${center.name}${center.code ? ` — ${center.code}` : ""}`,
      }));
    const map = new Map<string, string>();
    for (const row of [...fromCenters, ...fromBranches]) {
      if (!map.has(row.id)) map.set(row.id, row.label);
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [readiness]);

  const pnl = useMemo(
    () =>
      buildRepairPnl(accounts, journals, {
        from,
        to,
        costCenterId: costCenterId === "all" ? undefined : costCenterId,
      }),
    [accounts, journals, from, to, costCenterId],
  );

  return (
    <div className="erp-ds-clean space-y-5" dir="rtl">
      <PageHeader
        title="ربحية الصيانة"
        subtitle="إيراد التسليم وتكلفة القطع ومصروفات الخزينة المرحّلة — من القيود المحاسبية فقط"
        icon="monitoring"
        backAction={false}
        primaryAction={{
          label: "تحديث",
          icon: "refresh",
          onClick: () => {
            void reload();
          },
        }}
        moreActions={[
          {
            label: "تصدير CSV",
            icon: "download",
            onClick: () =>
              exportAccountingCsv(
                "repair-pnl.csv",
                ["البند", "المبلغ"],
                [
                  ["إيراد خدمات", pnl.serviceRevenue],
                  ["إيراد قطع", pnl.partsRevenue],
                  ["إيرادات متنوعة", pnl.miscIncome],
                  ["خصومات", pnl.discounts],
                  ["صافي الإيراد", pnl.netRevenue],
                  ["تكلفة قطع الغيار", pnl.partsCogs],
                  ["مصروفات تشغيل", pnl.operatingExpenses],
                  ["ربح التشغيل", pnl.operatingProfit],
                  ...pnl.expensesByType.map(
                    (row) =>
                      [`مصروف: ${row.label}`, row.amount] as [string, number],
                  ),
                ],
              ),
            group: "تصدير",
          },
        ]}
      />

      <Card className="!p-0 overflow-hidden shadow-none">
        <CardContent className="border-b p-4 space-y-3">
          <AccountingPeriodToolbar
            from={from}
            to={to}
            onFromChange={setFrom}
            onToChange={setTo}
            onRefresh={() => {
              void reload();
            }}
            refreshing={loading}
          />
          <div className="max-w-sm">
            <Label>مركز التكلفة / الفرع</Label>
            <Select value={costCenterId} onValueChange={setCostCenterId}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل فروع الصيانة</SelectItem>
                {repairCostCenters.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))
        ) : (
          <>
            <KPICard
              label="صافي الإيراد"
              value={formatAccountingMoney(pnl.netRevenue)}
            />
            <KPICard
              label="تكلفة القطع"
              value={formatAccountingMoney(pnl.partsCogs)}
            />
            <KPICard
              label="مصروفات التشغيل"
              value={formatAccountingMoney(pnl.operatingExpenses)}
            />
            <KPICard
              label="ربح التشغيل"
              value={formatAccountingMoney(pnl.operatingProfit)}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="!p-0 overflow-hidden shadow-none">
          <div className="border-b px-4 py-3">
            <h2 className="text-base font-semibold">تفصيل الإيراد والتكلفة</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {loading ? "…" : `${pnl.journalCount} قيد مرحّل في الفترة`}
            </p>
          </div>
          
          <div className="erp-mobile-card-list p-2">
            {loading ? (
              <div className="rounded-xl border p-3"><Skeleton className="h-5 w-full" /></div>
            ) : (
              [
                { label: "إيراد خدمات الصيانة", value: pnl.serviceRevenue, tone: "text-emerald-700" },
                { label: "إيراد قطع الغيار", value: pnl.partsRevenue, tone: "text-emerald-700" },
                ...(pnl.miscIncome > 0
                  ? [{ label: "إيرادات متنوعة", value: pnl.miscIncome, tone: "text-emerald-700" }]
                  : []),
                { label: "خصومات", value: pnl.discounts, tone: "text-rose-700" },
                { label: "صافي الإيراد", value: pnl.netRevenue, tone: "font-semibold" },
                { label: "تكلفة قطع الغيار", value: pnl.partsCogs, tone: "text-rose-700" },
                { label: "مصروفات تشغيل الخزينة", value: pnl.operatingExpenses, tone: "text-rose-700" },
                {
                  label: "ربح تشغيل الصيانة",
                  value: pnl.operatingProfit,
                  tone: pnl.operatingProfit >= 0 ? "font-bold text-emerald-700" : "font-bold text-rose-700",
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2.5 shadow-sm"
                >
                  <span className="text-sm">{row.label}</span>
                  <span className={`tabular-nums ${row.tone}`}>{formatAccountingMoney(row.value)}</span>
                </div>
              ))
            )}
          </div>
<div className="erp-desktop-table overflow-x-auto">
            <table className="erp-table w-full text-right border-collapse">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">البند</th>
                  <th className="erp-th text-center">المبلغ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {loading ? (
                  <tr>
                    <td className="px-4 py-3" colSpan={2}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ) : (
                  <>
                    <tr>
                      <td className="px-4 py-2.5">إيراد خدمات الصيانة</td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-emerald-700">
                        {formatAccountingMoney(pnl.serviceRevenue)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5">إيراد قطع الغيار</td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-emerald-700">
                        {formatAccountingMoney(pnl.partsRevenue)}
                      </td>
                    </tr>
                    {pnl.miscIncome > 0 ? (
                      <tr>
                        <td className="px-4 py-2.5">إيرادات متنوعة</td>
                        <td className="px-4 py-2.5 text-center tabular-nums text-emerald-700">
                          {formatAccountingMoney(pnl.miscIncome)}
                        </td>
                      </tr>
                    ) : null}
                    <tr>
                      <td className="px-4 py-2.5">خصومات</td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-rose-700">
                        {formatAccountingMoney(pnl.discounts)}
                      </td>
                    </tr>
                    <tr className="bg-muted/30 font-semibold">
                      <td className="px-4 py-2.5">صافي الإيراد</td>
                      <td className="px-4 py-2.5 text-center tabular-nums">
                        {formatAccountingMoney(pnl.netRevenue)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5">تكلفة قطع الغيار</td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-rose-700">
                        {formatAccountingMoney(pnl.partsCogs)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2.5">مصروفات تشغيل الخزينة</td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-rose-700">
                        {formatAccountingMoney(pnl.operatingExpenses)}
                      </td>
                    </tr>
                    <tr className="bg-muted/40 font-bold">
                      <td className="px-4 py-2.5">ربح تشغيل الصيانة</td>
                      <td
                        className={`px-4 py-2.5 text-center tabular-nums ${
                          pnl.operatingProfit >= 0
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }`}
                      >
                        {formatAccountingMoney(pnl.operatingProfit)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="!p-0 overflow-hidden shadow-none">
          <div className="border-b px-4 py-3">
            <h2 className="text-base font-semibold">المصروفات حسب النوع</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              مرتبات، كهرباء، تعبئة… من حركات الخزينة المرحّلة
            </p>
          </div>
          
          <div className="erp-mobile-card-list p-2">
            {loading ? (
              <div className="rounded-xl border p-3"><Skeleton className="h-5 w-full" /></div>
            ) : pnl.expensesByType.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">لا توجد مصروفات خزينة مرحّلة في هذه الفترة.</p>
            ) : (
              pnl.expensesByType.map((row) => (
                <div
                  key={`m-${row.key}`}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{row.label}</p>
                      <p className="font-mono text-xs text-muted-foreground">{row.accountCode || "—"}</p>
                    </div>
                    <p className="font-semibold tabular-nums text-rose-700">
                      {formatAccountingMoney(row.amount)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
<div className="erp-desktop-table overflow-x-auto">
            <table className="erp-table w-full text-right border-collapse">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">النوع</th>
                  <th className="erp-th">الحساب</th>
                  <th className="erp-th text-center">المبلغ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {loading ? (
                  <tr>
                    <td className="px-4 py-3" colSpan={3}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ) : pnl.expensesByType.length === 0 ? (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-sm text-muted-foreground"
                      colSpan={3}
                    >
                      لا توجد مصروفات خزينة مرحّلة في هذه الفترة.
                    </td>
                  </tr>
                ) : (
                  pnl.expensesByType.map((row) => (
                    <tr key={row.key}>
                      <td className="px-4 py-2.5">{row.label}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {row.accountCode || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-center tabular-nums text-rose-700">
                        {formatAccountingMoney(row.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
};
