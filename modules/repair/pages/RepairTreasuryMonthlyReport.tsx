import React, { useEffect, useMemo, useState } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge as ErpStatusBadge } from '@/src/components/erp/StatusBadge';
import {
  repairMonthCloseChipType,
  repairOpenClosedChipType,
  repairTreasuryEntryTypeChip,
} from '../lib/repairSemanticStatus';
import { toast } from '../../../components/Toast';
import { usePermission } from '../../../utils/permissions';
import { useAppStore } from '../../../store/useAppStore';
import { repairBranchService } from '../services/repairBranchService';
import { repairTreasuryService } from '../services/repairTreasuryService';
import { exportTreasuryMonthlyExcel } from '../../../utils/treasuryExcelExport';
import {
  type FirestoreUserWithRepair,
  type RepairBranch,
  type RepairTreasuryEntry,
  type RepairTreasuryMonthlyReportData,
  type RepairTreasurySessionStatusFilter,
} from '../types';
import { resolveAccessibleRepairBranchIds } from '../lib/repairBranchAccess';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { isRepairTreasuryMonthClosedStatus } from '../lib/repairTreasuryMonthlyClose';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { RepairOpsPageShell } from '../components/RepairOpsPageShell';
import { RepairTreasuryMonthlyPrint } from '../components/RepairTreasuryMonthlyPrint';
import { usePrintEngine } from '../../../utils/printManager';
import { exportToPDF } from '../../../utils/reportExport';

const fmt = (n: number) => new Intl.NumberFormat('ar-EG').format(Number(n || 0));
const THIS_MONTH = new Date().toISOString().slice(0, 7);
const ALL_BRANCHES_VALUE = '__ALL_ALLOWED__';
const PAGE_SIZE = 20;

export const RepairTreasuryMonthlyReport: React.FC = () => {
  const { dir } = useAppDirection();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const canView = can('repair.treasury.view') || can('repair.treasury.manage');
  const canManage = can('repair.treasury.manage');
  const user = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const currentEmployee = useAppStore((s) => s.currentEmployee);
  const printTemplate = useAppStore((s) => s.systemSettings)?.printTemplate;
  const { printDocument } = usePrintEngine();
  const printRef = React.useRef<HTMLDivElement>(null);
  const handlePrint = () => {
    printDocument({
      documentTitle: 'تقرير-خزائن-شهري',
      printSettings: printTemplate,
      render: (ref) => (
        <RepairTreasuryMonthlyPrint
          ref={ref}
          report={report}
          branchLabel={
            branchFilter === ALL_BRANCHES_VALUE
              ? 'كل الفروع المصرح بها'
              : branchNameMap[branchFilter] || undefined
          }
          printSettings={printTemplate}
        />
      ),
    });
  };
  const [exportingPdf, setExportingPdf] = useState(false);
  const [branches, setBranches] = useState<RepairBranch[]>([]);
  const [month, setMonth] = useState(THIS_MONTH);
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<RepairTreasurySessionStatusFilter>('all');
  const [sessionSearch, setSessionSearch] = useState('');
  const [report, setReport] = useState<RepairTreasuryMonthlyReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [monthActionBusy, setMonthActionBusy] = useState(false);
  const [reopenTargetBranchId, setReopenTargetBranchId] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [expandedSessionId, setExpandedSessionId] = useState('');
  const [sessionEntriesMap, setSessionEntriesMap] = useState<Record<string, RepairTreasuryEntry[]>>({});
  const [sessionLoadingId, setSessionLoadingId] = useState('');
  const [dailyPage, setDailyPage] = useState(1);
  const [sessionsPage, setSessionsPage] = useState(1);

  const allowedBranches = useMemo(() => {
    const canViewAllBranches = can('repair.branches.manage');
    if (canViewAllBranches) return branches;
    const accessibleIds = new Set(
      resolveAccessibleRepairBranchIds({
        user,
        branches,
        currentEmployeeId: currentEmployee?.id,
        canViewAllBranches: false,
      }),
    );
    return branches.filter((branch) => accessibleIds.has(String(branch.id || '')));
  }, [branches, can, currentEmployee?.id, user]);

  const branchNameMap = useMemo(
    () => Object.fromEntries(allowedBranches.map((branch) => [String(branch.id || ''), branch.name || 'فرع غير معروف'])),
    [allowedBranches],
  );

  const treasuryReportCacheKey = `repair:treasuryMonthly:${month}:${branchFilter || 'all'}:${statusFilter}`;

  const loadReport = async (opts?: { silent?: boolean; force?: boolean }) => {
    const allowedBranchIds = allowedBranches.map((branch) => String(branch.id || '')).filter(Boolean);
    if (!allowedBranchIds.length) {
      setReport(null);
      setLoading(false);
      return;
    }
    const selectedIsAll = branchFilter === ALL_BRANCHES_VALUE;
    const selectedBranchId = selectedIsAll ? '' : branchFilter;
    const cached = peekPageDataCache<RepairTreasuryMonthlyReportData>(treasuryReportCacheKey);
    if (cached) {
      setReport(cached);
      setLoading(false);
    } else if (!opts?.silent) {
      setLoading(true);
    }
    try {
      const { data } = await fetchCachedPageData(
        treasuryReportCacheKey,
        () => repairTreasuryService.getMonthlyReport({
          month,
          allowedBranchIds,
          branchId: selectedBranchId,
          includeAllBranches: selectedIsAll,
          sessionStatus: statusFilter,
          branchNameMap,
        }),
        { force: opts?.force === true, maxAgeMs: 60_000 },
      );
      setReport(data);
      if (!opts?.silent) setExpandedSessionId('');
    } catch (e: any) {
      setReport(null);
      toast.error(e?.message || 'تعذر تحميل التقرير الشهري.');
    } finally {
      setLoading(false);
    }
  };

  const reloadReport = async () => {
    invalidatePageDataCache(treasuryReportCacheKey);
    await loadReport({ force: true });
  };

  const openSessionDetails = async (sessionId: string, branchId: string) => {
    if (!sessionId || !branchId) return;
    if (expandedSessionId === sessionId) {
      setExpandedSessionId('');
      return;
    }
    if (sessionEntriesMap[sessionId]) {
      setExpandedSessionId(sessionId);
      return;
    }
    try {
      setSessionLoadingId(sessionId);
      const branchEntries = await repairTreasuryService.listEntries(branchId);
      const details = branchEntries.filter((entry) => String(entry.sessionId || '') === sessionId);
      setSessionEntriesMap((prev) => ({ ...prev, [sessionId]: details }));
      setExpandedSessionId(sessionId);
    } catch (e: any) {
      toast.error(e?.message || 'تعذر تحميل تفاصيل الجلسة.');
    } finally {
      setSessionLoadingId('');
    }
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const rows = await repairBranchService.list();
        if (!mounted) return;
        setBranches(rows);
      } catch (e: any) {
        if (!mounted) return;
        setBranches([]);
        toast.error(e?.message || 'تعذر تحميل الفروع.');
      }
    };
    void run();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!allowedBranches.length) {
      setBranchFilter('');
      setReport(null);
      return;
    }
    const branchIds = allowedBranches.map((branch) => String(branch.id || '')).filter(Boolean);
    if (!branchFilter || (branchFilter !== ALL_BRANCHES_VALUE && !branchIds.includes(branchFilter))) {
      setBranchFilter(branchIds[0] || '');
    }
  }, [allowedBranches, branchFilter]);

  useEffect(() => {
    if (!branchFilter || !allowedBranches.length) return;
    void loadReport();
  }, [month, branchFilter, statusFilter, allowedBranches.length]);

  const branchScopeLabel = useMemo(() => {
    if (branchFilter === ALL_BRANCHES_VALUE) return 'كل-الفروع-المصرح-بها';
    return branchNameMap[branchFilter] || 'فرع';
  }, [branchFilter, branchNameMap]);

  const statusLabel = statusFilter === 'all' ? 'الكل' : statusFilter === 'open' ? 'مفتوحة' : 'مقفلة';
  const totals = useMemo(() => {
    const data = report?.summaries || [];
    const movements = data.reduce(
      (acc, row) => {
        acc.sessions += row.sessionsCount;
        acc.income += row.totalIncome;
        acc.expense += row.totalExpense;
        acc.net += row.netMovement;
        return acc;
      },
      { sessions: 0, opening: 0, income: 0, expense: 0, net: 0, closing: 0 },
    );
    const byBranch = new Map<string, NonNullable<typeof report>['sessions']>();
    for (const session of report?.sessions || []) {
      const rows = byBranch.get(session.branchId) || [];
      rows.push(session);
      byBranch.set(session.branchId, rows);
    }
    for (const sessions of byBranch.values()) {
      const sorted = [...sessions].sort((a, b) => String(a.openedAt).localeCompare(String(b.openedAt)));
      movements.opening += Number(sorted[0]?.openingBalance || 0);
      const last = sorted[sorted.length - 1];
      movements.closing += Number(last?.closingBalance ?? last?.openingBalance ?? 0);
    }
    return movements;
  }, [report]);

  const filteredSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    const rows = report?.sessions || [];
    if (!q) return rows;
    return rows.filter((session) => {
      const branch = String(session.branchName || '').toLowerCase();
      const day = String(session.openedAt || '').slice(0, 10);
      return branch.includes(q) || day.includes(q) || String(session.sessionId || '').toLowerCase().includes(q);
    });
  }, [report?.sessions, sessionSearch]);

  const dailyRows = report?.dailyBreakdown || [];
  const dailyTotalPages = Math.max(1, Math.ceil(dailyRows.length / PAGE_SIZE));
  const safeDailyPage = Math.min(dailyPage, dailyTotalPages);
  const pagedDaily = dailyRows.slice((safeDailyPage - 1) * PAGE_SIZE, safeDailyPage * PAGE_SIZE);

  const sessionsTotalPages = Math.max(1, Math.ceil(filteredSessions.length / PAGE_SIZE));
  const safeSessionsPage = Math.min(sessionsPage, sessionsTotalPages);
  const pagedSessions = filteredSessions.slice((safeSessionsPage - 1) * PAGE_SIZE, safeSessionsPage * PAGE_SIZE);

  useEffect(() => {
    setDailyPage(1);
    setSessionsPage(1);
    setSessionSearch('');
  }, [month, branchFilter, statusFilter]);

  useEffect(() => {
    setSessionsPage(1);
  }, [sessionSearch]);

  const handleExport = () => {
    if (!report) {
      toast.error('لا توجد بيانات للتصدير.');
      return;
    }
    exportTreasuryMonthlyExcel({
      month,
      branchScopeLabel,
      statusLabel,
      summaries: report.summaries,
      dailyBreakdown: report.dailyBreakdown,
      sessions: report.sessions,
      paymentMethodSummaries: report.paymentMethodSummaries,
      reconciliation: report.reconciliation,
    });
    toast.success('تم تصدير ملف Excel.');
  };

  const openSessionsCountByBranch = useMemo(() => {
    const map = new Map<string, number>();
    (report?.sessions || []).forEach((session) => {
      if (session.status !== 'open') return;
      const id = String(session.branchId || '');
      map.set(id, (map.get(id) || 0) + 1);
    });
    return map;
  }, [report?.sessions]);

  const branchIdsForMonthAction = useMemo(() => {
    if (branchFilter === ALL_BRANCHES_VALUE) {
      return allowedBranches.map((b) => String(b.id || '')).filter(Boolean);
    }
    return branchFilter ? [branchFilter] : [];
  }, [allowedBranches, branchFilter]);

  const closedBranchCount = useMemo(() => {
    const map = report?.monthCloseByBranchId || {};
    return branchIdsForMonthAction.filter((id) => isRepairTreasuryMonthClosedStatus(map[id]?.status)).length;
  }, [branchIdsForMonthAction, report?.monthCloseByBranchId]);

  const closeSingleBranchMonth = async (targetBranchId: string) => {
    const openCount = openSessionsCountByBranch.get(targetBranchId) || 0;
    if (openCount > 0) {
      throw new Error(`الفرع ${branchNameMap[targetBranchId] || targetBranchId}: توجد جلسات مفتوحة.`);
    }
    if (isRepairTreasuryMonthClosedStatus(report?.monthCloseByBranchId?.[targetBranchId]?.status)) {
      throw new Error(`الفرع ${branchNameMap[targetBranchId] || targetBranchId}: مقفول بالفعل.`);
    }
    await repairTreasuryService.closeMonth({
      branchId: targetBranchId,
      month,
      closedBy: user?.id || '',
      closedByName: user?.displayName || user?.email || 'system',
    });
  };

  const handleCloseMonth = async () => {
    if (!canManage || monthActionBusy || !branchIdsForMonthAction.length) return;
    setMonthActionBusy(true);
    try {
      let ok = 0;
      const failures: string[] = [];
      for (const id of branchIdsForMonthAction) {
        try {
          await closeSingleBranchMonth(id);
          ok += 1;
        } catch (e: any) {
          failures.push(e?.message || `تعذر إقفال ${id}`);
        }
      }
      if (ok > 0) toast.success(ok === 1 ? 'تم إقفال الشهر للفرع.' : `تم إقفال الشهر لـ ${ok} فرع.`);
      if (failures.length) toast.error(failures.slice(0, 3).join(' | '));
      await reloadReport();
    } finally {
      setMonthActionBusy(false);
    }
  };

  const handleReopenMonth = async () => {
    if (!canManage || monthActionBusy || !reopenTargetBranchId) return;
    setMonthActionBusy(true);
    try {
      await repairTreasuryService.reopenMonth({
        branchId: reopenTargetBranchId,
        month,
        reopenedBy: user?.id || '',
        reopenedByName: user?.displayName || user?.email || 'system',
        reopenReason,
      });
      toast.success('تم إعادة فتح الشهر.');
      setReopenTargetBranchId('');
      setReopenReason('');
      await reloadReport();
    } catch (e: any) {
      toast.error(e?.message || 'تعذر إعادة فتح الشهر.');
    } finally {
      setMonthActionBusy(false);
    }
  };

  if (!canView) {
    return (
      <RepairOpsPageShell eyebrow="تقرير الخزائن الشهري" dir={dir}>
        <OpsDashPanel title="الصلاحيات" accent="repair">
          <p className="text-sm text-muted-foreground">ليس لديك صلاحية عرض تقرير خزينة الصيانة.</p>
        </OpsDashPanel>
      </RepairOpsPageShell>
    );
  }

  return (
    <RepairOpsPageShell
      eyebrow="تقرير الخزائن الشهري"
      dir={dir}
      hero={[
        { key: 'sessions', label: 'عدد الجلسات', value: fmt(totals.sessions) },
        { key: 'opening', label: 'إجمالي الافتتاح', value: fmt(totals.opening), meta: 'ج.م' },
        {
          key: 'net',
          label: 'صافي الحركة',
          value: fmt(totals.net),
          meta: 'ج.م',
          toneClassName: totals.net < 0 ? 'ops-dash-kpi-card--tone-rose' : 'ops-dash-kpi-card--tone-emerald',
        },
        { key: 'closing', label: 'إجمالي الإقفال', value: fmt(totals.closing), meta: 'ج.م' },
      ]}
      onRefresh={() => { void reloadReport(); }}
      refreshing={loading}
      actions={(
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => navigate('/repair/treasury')}>
            العودة للخزينة
          </Button>
          {report ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleExport}>
                تصدير Excel
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => handlePrint()}>
                طباعة
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={exportingPdf}
                onClick={() => {
                  if (!printRef.current) return;
                  setExportingPdf(true);
                  void exportToPDF(printRef.current, `treasury-${month}`)
                    .then(() => toast.success('تم تصدير PDF بنجاح.'))
                    .catch(() => toast.error('تعذر تصدير PDF.'))
                    .finally(() => setExportingPdf(false));
                }}
              >
                {exportingPdf ? 'جارٍ التصدير...' : 'PDF'}
              </Button>
            </>
          ) : null}
        </div>
      )}
    >
      {canManage && (
        <OpsDashPanel title={`إقفال شهري — ${month}`} accent="repair">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {closedBranchCount}/{branchIdsForMonthAction.length || 0} فرع مقفول ضمن النطاق الحالي.
              الإقفال يمنع فتح جلسات أو تسجيل حركات داخل الشهر.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => { void handleCloseMonth(); }}
                disabled={monthActionBusy || loading || !branchIdsForMonthAction.length || closedBranchCount === branchIdsForMonthAction.length}
              >
                {monthActionBusy ? 'جارٍ التنفيذ...' : 'إقفال الشهر'}
              </Button>
              {branchFilter !== ALL_BRANCHES_VALUE
                && branchFilter
                && isRepairTreasuryMonthClosedStatus(report?.monthCloseByBranchId?.[branchFilter]?.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={monthActionBusy}
                  onClick={() => {
                    setReopenTargetBranchId(branchFilter);
                    setReopenReason('');
                  }}
                >
                  إعادة فتح الشهر
                </Button>
              )}
            </div>
          </div>
        </OpsDashPanel>
      )}

      <OpsDashPanel title="فلاتر التقرير" accent="repair" bodyClassName="p-0">
        <SmartFilterBar
          pageId="repair-treasury-monthly-report"
          searchPlaceholder="بحث في الجلسات بالفرع أو التاريخ..."
          searchValue={sessionSearch}
          onSearchChange={setSessionSearch}
          quickFilters={[
            {
              key: 'branch',
              placeholder: 'الفرع',
              options: [
                { value: ALL_BRANCHES_VALUE, label: 'كل الفروع المصرح بها' },
                ...allowedBranches.map((branch) => ({
                  value: String(branch.id || ''),
                  label: branch.name || 'فرع',
                })),
              ],
            },
            {
              key: 'status',
              placeholder: 'حالة الجلسة',
              options: [
                { value: 'open', label: 'مفتوحة' },
                { value: 'closed', label: 'مقفلة' },
              ],
            },
          ]}
          quickFilterValues={{
            branch: branchFilter || 'all',
            status: statusFilter,
          }}
          onQuickFilterChange={(key, value) => {
            if (key === 'branch' && value !== 'all') setBranchFilter(value);
            if (key === 'status') {
              setStatusFilter(value === 'open' || value === 'closed' ? value : 'all');
            }
          }}
          advancedFilters={[
            { key: 'month', label: 'الشهر', type: 'month', placeholder: 'الشهر' },
          ]}
          advancedFilterValues={{ month: month || 'all' }}
          onAdvancedFilterChange={(key, value) => {
            if (key === 'month' && value && value !== 'all') setMonth(value);
          }}
          className="mb-0 border-0 rounded-none"
        />
      </OpsDashPanel>

      <OpsDashPanel
        title="المطابقة ووسائل الدفع"
        accent="repair"
        bodyClassName="p-0"
        action={(
          <div className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
            report && report.reconciliation.missingPaymentMethod + report.reconciliation.missingCostCenter + report.reconciliation.missingJournalReference === 0
              ? 'bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]' : 'bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]'
          }`}>
            {report ? `الحركات ${fmt(report.reconciliation.entriesCount)} — نواقص الوسيلة ${fmt(report.reconciliation.missingPaymentMethod)} — المركز ${fmt(report.reconciliation.missingCostCenter)} — القيد ${fmt(report.reconciliation.missingJournalReference)}` : 'لا توجد بيانات'}
          </div>
        )}
      >
        <div className="erp-table-wrap overflow-x-auto erp-table-scroll">
          <table className="erp-table w-full min-w-[760px] text-right border-collapse">
            <thead className="erp-thead"><tr>
              <th className="erp-th">الفرع</th><th className="erp-th">مركز التكلفة</th><th className="erp-th">وسيلة الدفع</th>
              <th className="erp-th text-center">وارد</th><th className="erp-th text-center">منصرف</th><th className="erp-th text-center">الصافي</th><th className="erp-th text-center">حركات</th>
            </tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {(report?.paymentMethodSummaries || []).map((row) => (
                <tr key={`${row.branchId}-${row.costCenterId}-${row.paymentMethod}`}>
                  <td className="px-4 py-2.5 font-medium">{row.branchName}</td>
                  <td className="px-4 py-2.5 font-mono">{row.costCenterId || 'غير مربوط'}</td>
                  <td className="px-4 py-2.5">{{ cash: 'نقدي', card: 'بطاقة', bank_transfer: 'تحويل بنكي', unspecified: 'غير محدد' }[row.paymentMethod]}</td>
                  <td className="px-4 py-2.5 text-center text-[rgb(var(--color-success))] tabular-nums">{fmt(row.income)}</td>
                  <td className="px-4 py-2.5 text-center text-[rgb(var(--color-danger))] tabular-nums">{fmt(row.expense)}</td>
                  <td className="px-4 py-2.5 text-center font-semibold tabular-nums">{fmt(row.net)}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums">{fmt(row.entriesCount)}</td>
                </tr>
              ))}
              {!loading && (report?.paymentMethodSummaries || []).length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">لا توجد حركات مالية مطابقة للفلاتر.</td></tr>}
            </tbody>
          </table>
        </div>
      </OpsDashPanel>

      <OpsDashPanel
        title="ملخص الفروع"
        accent="repair"
        bodyClassName="p-0"
        action={<span className="text-xs text-muted-foreground">إيراد {fmt(totals.income)} — مصروف {fmt(totals.expense)}</span>}
      >
        <div className="erp-table-wrap overflow-x-auto erp-table-scroll">
          <table className="erp-table w-full min-w-[800px] text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الفرع</th>
                <th className="erp-th text-center">إقفال الشهر</th>
                <th className="erp-th text-center">جلسات</th>
                <th className="erp-th text-center">افتتاح</th>
                <th className="erp-th text-center">إيراد</th>
                <th className="erp-th text-center">مصروف</th>
                <th className="erp-th text-center">صافي</th>
                <th className="erp-th text-center">إقفال يومي</th>
                <th className="erp-th text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading && Array.from({ length: 4 }).map((_, i) => (
                <tr key={`sum-skel-${i}`}>
                  <td className="px-4 py-3" colSpan={9}><Skeleton className="h-5 w-full rounded-md" /></td>
                </tr>
              ))}
              {!loading && (report?.summaries || []).map((row) => {
                const monthClosed = isRepairTreasuryMonthClosedStatus(report?.monthCloseByBranchId?.[row.branchId]?.status);
                const openCount = openSessionsCountByBranch.get(row.branchId) || 0;
                return (
                  <tr key={row.branchId}>
                    <td className="px-4 py-2.5 font-medium">{row.branchName}</td>
                    <td className="px-4 py-2.5 text-center">
                      <ErpStatusBadge
                        label={monthClosed ? 'شهر مقفول' : 'شهر مفتوح'}
                        type={repairMonthCloseChipType(monthClosed)}
                      />
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums">{fmt(row.sessionsCount)}</td>
                    <td className="px-4 py-2.5 text-center font-mono tabular-nums">{fmt(row.totalOpening)}</td>
                    <td className="px-4 py-2.5 text-center font-mono tabular-nums text-[rgb(var(--color-success))]">{fmt(row.totalIncome)}</td>
                    <td className="px-4 py-2.5 text-center font-mono tabular-nums text-[rgb(var(--color-danger))]">{fmt(row.totalExpense)}</td>
                    <td className={`px-4 py-2.5 text-center font-mono tabular-nums ${row.netMovement >= 0 ? 'text-[rgb(var(--color-success))]' : 'text-[rgb(var(--color-danger))]'}`}>
                      {fmt(row.netMovement)}
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono font-semibold tabular-nums">{fmt(row.totalClosing)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {canManage && (
                        monthClosed ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={monthActionBusy}
                            onClick={() => {
                              setReopenTargetBranchId(row.branchId);
                              setReopenReason('');
                            }}
                          >
                            إعادة فتح
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            disabled={monthActionBusy || openCount > 0}
                            title={openCount > 0 ? 'أقفل الجلسات اليومية أولًا' : undefined}
                            onClick={() => {
                              void (async () => {
                                setMonthActionBusy(true);
                                try {
                                  await closeSingleBranchMonth(row.branchId);
                                  toast.success('تم إقفال الشهر للفرع.');
                                  await reloadReport();
                                } catch (e: any) {
                                  toast.error(e?.message || 'تعذر إقفال الشهر.');
                                } finally {
                                  setMonthActionBusy(false);
                                }
                              })();
                            }}
                          >
                            إقفال
                          </Button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && (report?.summaries || []).length === 0 && (
                <tr>
                  <td className="px-4 py-12 text-center text-muted-foreground" colSpan={9}>
                    لا توجد بيانات ملخص لهذا الشهر.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </OpsDashPanel>

      <OpsDashPanel title="التفصيل اليومي" accent="repair" bodyClassName="p-0">
        <div className="erp-table-wrap overflow-x-auto erp-table-scroll">
          <table className="erp-table w-full min-w-[800px] text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الفرع</th>
                <th className="erp-th">اليوم</th>
                <th className="erp-th text-center">جلسات</th>
                <th className="erp-th text-center">افتتاح</th>
                <th className="erp-th text-center">الصافي</th>
                <th className="erp-th text-center">إقفال</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={`day-skel-${i}`}>
                  <td className="px-4 py-3" colSpan={6}><Skeleton className="h-5 w-full rounded-md" /></td>
                </tr>
              ))}
              {!loading && pagedDaily.map((row) => (
                <tr key={`${row.branchId}-${row.day}`}>
                  <td className="px-4 py-2.5">{row.branchName}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{row.day}</td>
                  <td className="px-4 py-2.5 text-center tabular-nums">{fmt(row.sessionsCount)}</td>
                  <td className="px-4 py-2.5 text-center font-mono tabular-nums">{fmt(row.opening)}</td>
                  <td className={`px-4 py-2.5 text-center font-mono tabular-nums ${row.net >= 0 ? 'text-[rgb(var(--color-success))]' : 'text-[rgb(var(--color-danger))]'}`}>
                    {fmt(row.net)}
                  </td>
                  <td className="px-4 py-2.5 text-center font-mono font-semibold tabular-nums">{fmt(row.closing)}</td>
                </tr>
              ))}
              {!loading && dailyRows.length === 0 && (
                <tr>
                  <td className="px-4 py-12 text-center text-muted-foreground" colSpan={6}>
                    لا توجد بيانات يومية.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <DataPaginationFooter
          page={safeDailyPage}
          totalPages={dailyTotalPages}
          totalItems={dailyRows.length}
          onPageChange={setDailyPage}
          itemLabel="يوم"
        />
      </OpsDashPanel>

      <OpsDashPanel
        title="تفاصيل الجلسات"
        accent="repair"
        bodyClassName="p-0"
        action={<span className="text-xs text-muted-foreground">{filteredSessions.length} جلسة مطابقة</span>}
      >
        <div className="erp-table-wrap overflow-x-auto erp-table-scroll">
          <table className="erp-table w-full min-w-[900px] text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الفرع</th>
                <th className="erp-th">تاريخ الجلسة</th>
                <th className="erp-th text-center">الحالة</th>
                <th className="erp-th text-center">افتتاح</th>
                <th className="erp-th text-center">إقفال</th>
                <th className="erp-th text-center">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading && Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sess-skel-${i}`}>
                  <td className="px-4 py-3" colSpan={6}><Skeleton className="h-5 w-full rounded-md" /></td>
                </tr>
              ))}
              {!loading && pagedSessions.map((session) => {
                const isExpanded = expandedSessionId === session.sessionId;
                const isLoading = sessionLoadingId === session.sessionId;
                const entryRows = sessionEntriesMap[session.sessionId] || [];
                return (
                  <React.Fragment key={session.sessionId}>
                    <tr className={isExpanded ? 'bg-muted/20' : undefined}>
                      <td className="px-4 py-2.5 font-medium">{session.branchName}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{String(session.openedAt || '').slice(0, 10)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <ErpStatusBadge
                          label={session.status === 'closed' ? 'مقفلة' : 'مفتوحة'}
                          type={repairOpenClosedChipType(session.status !== 'closed')}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center font-mono tabular-nums">{fmt(session.openingBalance || 0)}</td>
                      <td className="px-4 py-2.5 text-center font-mono tabular-nums">
                        {session.status === 'closed' ? fmt(session.closingBalance || 0) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { void openSessionDetails(session.sessionId, session.branchId); }}
                        >
                          {isLoading ? '...' : isExpanded ? 'إخفاء' : 'تفاصيل'}
                        </Button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={6} className="bg-muted/10 px-4 py-3">
                          <div className="mb-2 text-xs font-semibold text-muted-foreground">
                            حركات الجلسة ({fmt(entryRows.length)})
                          </div>
                          <div className="space-y-1.5">
                            {entryRows.map((entry) => {
                              const entryChip = repairTreasuryEntryTypeChip(entry.entryType);
                              return (
                              <div
                                key={entry.id}
                                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2 rounded border bg-background px-2.5 py-2 text-sm"
                              >
                                <ErpStatusBadge label={entryChip.label} type={entryChip.type} />
                                <span className="truncate">{entry.note || '—'}</span>
                                <span className="font-mono font-semibold tabular-nums">{fmt(entry.amount)}</span>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">
                                  {entry.createdAt ? new Date(entry.createdAt).toLocaleString('ar-EG') : '—'}
                                </span>
                              </div>
                              );
                            })}
                            {entryRows.length === 0 && (
                              <div className="rounded border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                                لا توجد حركات داخل الجلسة.
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {!loading && filteredSessions.length === 0 && (
                <tr>
                  <td className="px-4 py-12 text-center text-muted-foreground" colSpan={6}>
                    لا توجد جلسات ضمن الفلاتر الحالية.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <DataPaginationFooter
          page={safeSessionsPage}
          totalPages={sessionsTotalPages}
          totalItems={filteredSessions.length}
          onPageChange={setSessionsPage}
          itemLabel="جلسة"
        />
      </OpsDashPanel>

      <Dialog
        open={Boolean(reopenTargetBranchId)}
        onOpenChange={(open) => {
          if (!open) {
            setReopenTargetBranchId('');
            setReopenReason('');
          }
        }}
      >
        <DialogContent dir={dir}>
          <DialogHeader>
            <DialogTitle>إعادة فتح الشهر</DialogTitle>
            <DialogDescription>
              سيتم السماح مجددًا بفتح جلسات وتسجيل حركات لشهر {month} — فرع {branchNameMap[reopenTargetBranchId] || reopenTargetBranchId}.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label>سبب إعادة الفتح (إلزامي)</Label>
            <Input
              className="mt-2"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="مثال: تصحيح حركة تحصيل"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenTargetBranchId('')} disabled={monthActionBusy}>إلغاء</Button>
            <Button onClick={() => { void handleReopenMonth(); }} disabled={monthActionBusy || !reopenReason.trim()}>
              {monthActionBusy ? 'جارٍ...' : 'تأكيد إعادة الفتح'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="fixed left-[-10000px] top-0" aria-hidden>
        <RepairTreasuryMonthlyPrint
          ref={printRef}
          report={report}
          branchLabel={
            branchFilter === ALL_BRANCHES_VALUE
              ? 'كل الفروع المصرح بها'
              : branchNameMap[branchFilter] || undefined
          }
          printSettings={printTemplate}
        />
      </div>
    </RepairOpsPageShell>
  );
};

export default RepairTreasuryMonthlyReport;
