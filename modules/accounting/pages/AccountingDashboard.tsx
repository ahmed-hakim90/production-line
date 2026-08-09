import React, { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BookOpen,
  FileSpreadsheet,
  Receipt,
  Scale,
  Settings2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { withTenantPath } from "@/lib/tenantPaths";
import { DomainHomeShell } from "@/modules/dashboards/components/DomainHomeShell";
import { OpsDashPanel } from "@/modules/dashboards/components/OperationsDashboardBoard";
import { usePermission } from "@/utils/permissions";
import { AccountingPeriodToolbar } from "../components/AccountingPeriodToolbar";
import { useAccountingBaseData } from "../hooks/useAccountingBaseData";
import {
  accountingMoney,
  buildTrialBalance,
  postedEntries,
} from "../lib/accountingReports";
import {
  accountingMonthStart,
  accountingToday,
  formatAccountingMoney,
} from "../lib/accountingUi";
import { accountingService } from "../services/accountingService";

const QUICK_LINKS = [
  {
    path: "/accounting/journals",
    label: "القيود اليومية",
    icon: Receipt,
    desc: "عرض وترحيل القيود",
  },
  {
    path: "/accounting/ledger",
    label: "دفتر الأستاذ",
    icon: BookOpen,
    desc: "حركة حساب محدد",
  },
  {
    path: "/accounting/trial-balance",
    label: "ميزان المراجعة",
    icon: Scale,
    desc: "مدين / دائن / رصيد",
  },
  {
    path: "/accounting/repair-pnl",
    label: "ربحية الصيانة",
    icon: Scale,
    desc: "إيراد − قطع − مصروفات",
  },
  {
    path: "/accounting/inventory-valuation",
    label: "قيمة المخزون",
    icon: FileSpreadsheet,
    desc: "تقييم الأرصدة",
    permission: "accounting.inventory.view" as const,
  },
  {
    path: "/accounting/settings",
    label: "الإعدادات",
    icon: Settings2,
    desc: "سياسات وربط الفروع",
  },
];

export const AccountingDashboard: React.FC = () => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const {
    accounts,
    journals,
    periods,
    readiness,
    loading,
    busy,
    reload,
    run,
  } = useAccountingBaseData();
  const [from, setFrom] = useState(accountingMonthStart());
  const [to, setTo] = useState(accountingToday());

  const filteredEntries = useMemo(
    () => postedEntries(journals, from, to),
    [journals, from, to],
  );
  const trial = useMemo(
    () => buildTrialBalance(accounts, filteredEntries),
    [accounts, filteredEntries],
  );
  const totals = useMemo(
    () => ({
      debit: accountingMoney(trial.reduce((sum, row) => sum + row.debit, 0)),
      credit: accountingMoney(trial.reduce((sum, row) => sum + row.credit, 0)),
      assets: accountingMoney(
        trial
          .filter((row) => row.type === "asset")
          .reduce((sum, row) => sum + row.balance, 0),
      ),
      liabilities: accountingMoney(
        -trial
          .filter((row) => row.type === "liability")
          .reduce((sum, row) => sum + row.balance, 0),
      ),
      revenue: accountingMoney(
        -trial
          .filter(
            (row) => row.type === "revenue" || row.type === "contra_revenue",
          )
          .reduce((sum, row) => sum + row.balance, 0),
      ),
      expenses: accountingMoney(
        trial
          .filter((row) => row.type === "expense")
          .reduce((sum, row) => sum + row.balance, 0),
      ),
    }),
    [trial],
  );

  const net = accountingMoney(totals.revenue - totals.expenses);
  const balanceDiff = Math.abs(totals.debit - totals.credit);
  const branchesReady =
    readiness?.repairBranches.filter((branch) => branch.ready).length || 0;
  const branchesTotal = readiness?.repairBranches.length || 0;

  const hero = [
    {
      key: "assets",
      label: "إجمالي الأصول",
      value: loading ? "…" : formatAccountingMoney(totals.assets),
      accent: true as const,
    },
    {
      key: "liabilities",
      label: "الالتزامات",
      value: loading ? "…" : formatAccountingMoney(totals.liabilities),
    },
    {
      key: "revenue",
      label: "الإيرادات",
      value: loading ? "…" : formatAccountingMoney(totals.revenue),
    },
    {
      key: "expenses",
      label: "المصروفات",
      value: loading ? "…" : formatAccountingMoney(totals.expenses),
    },
    {
      key: "net",
      label: "صافي الحركة",
      value: loading ? "…" : formatAccountingMoney(net),
      meta: `${from} → ${to}`,
    },
  ];

  return (
    <DomainHomeShell
      denseHero
      eyebrow="لوحة الحسابات"
      hero={hero}
      onRefresh={() => {
        void reload();
      }}
      refreshing={loading}
      periodExtra={(
        <AccountingPeriodToolbar
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
        />
      )}
      secondarySummary="اختصارات التشغيل"
      secondary={(
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {QUICK_LINKS.filter(
            (item) => !item.permission || can(item.permission),
          ).map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={withTenantPath(tenantSlug, item.path)}
                className="flex items-center justify-between rounded-xl border p-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
      dir="rtl"
    >
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <OpsDashPanel title="سلامة الدفتر">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">إجمالي المدين</span>
              <strong className="tabular-nums">
                {formatAccountingMoney(totals.debit)}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">إجمالي الدائن</span>
              <strong className="tabular-nums">
                {formatAccountingMoney(totals.credit)}
              </strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">فرق الميزان</span>
              <Badge variant={balanceDiff < 0.01 ? "default" : "destructive"}>
                {formatAccountingMoney(totals.debit - totals.credit)}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">عدد القيود المرحّلة</span>
              <strong>{filteredEntries.length}</strong>
            </div>
          </div>
        </OpsDashPanel>

        <OpsDashPanel title="جاهزية الحسابات">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">الحسابات النشطة</span>
              <strong>
                {accounts.filter((row) => row.isActive).length}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">حسابات قابلة للترحيل</span>
              <strong>
                {
                  accounts.filter((row) => row.isActive && row.allowPosting)
                    .length
                }
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">الفترات المقفلة</span>
              <strong>
                {periods.filter((row) => row.status === "closed").length}
              </strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">فروع الصيانة الجاهزة</span>
              <Badge
                variant={
                  branchesTotal > 0 && branchesReady === branchesTotal
                    ? "default"
                    : "destructive"
                }
              >
                {branchesReady}/{branchesTotal}
              </Badge>
            </div>
            {accounts.length === 0 && can("accounting.accounts.manage") ? (
              <Button
                disabled={busy}
                onClick={() =>
                  void run(
                    accountingService.seedDefaults,
                    "تم إنشاء شجرة الحسابات الافتراضية.",
                  )
                }
              >
                إنشاء الشجرة الافتراضية
              </Button>
            ) : null}
          </div>
        </OpsDashPanel>
      </div>
    </DomainHomeShell>
  );
};
