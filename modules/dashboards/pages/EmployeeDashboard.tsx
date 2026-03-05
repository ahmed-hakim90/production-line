import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Badge, LoadingSkeleton } from '../components/UI';
import { WorkOrderPrint } from '../../production/components/ProductionReportPrint';
import type { WorkOrderPrintData } from '../../production/components/ProductionReportPrint';
import { useAppStore, useShallowStore } from '../../../store/useAppStore';
import { useManagedPrint } from '@/utils/printManager';
import {
  formatNumber,
  formatCurrency,
  calculateWasteRatio,
  calculatePlanProgress,
  getTodayDateString,
  countUniqueDays,
} from '../../../utils/calculations';
import { reportService } from '@/modules/production/services/reportService';
import { usePermission } from '../../../utils/permissions';
import type { ProductionReport, WorkOrder } from '../../../types';
import type { InventoryTransferRequest } from '../../inventory/types';
import { transferApprovalService } from '../../inventory/services/transferApprovalService';

type Period = 'daily' | 'yesterday' | 'weekly' | 'monthly';

function getDateRange(period: Period): { start: string; end: string } {
  const now = new Date();
  const end = getTodayDateString();

  if (period === 'daily') {
    return { start: end, end };
  }

  if (period === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const y = yesterday.getFullYear();
    const m = String(yesterday.getMonth() + 1).padStart(2, '0');
    const d = String(yesterday.getDate()).padStart(2, '0');
    const date = `${y}-${m}-${d}`;
    return { start: date, end: date };
  }

  if (period === 'weekly') {
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const y = weekAgo.getFullYear();
    const m = String(weekAgo.getMonth() + 1).padStart(2, '0');
    const d = String(weekAgo.getDate()).padStart(2, '0');
    return { start: `${y}-${m}-${d}`, end };
  }

  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return { start: `${y}-${m}-01`, end };
}

// ─── Period Filter ──────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'daily', label: 'يومي' },
  { value: 'yesterday', label: 'أمس' },
  { value: 'weekly', label: 'أسبوعي' },
  { value: 'monthly', label: 'شهري' },
];

const DashboardPeriodFilter: React.FC<{
  period: Period;
  onChange: (p: Period) => void;
}> = ({ period, onChange }) => (
  <div className="erp-date-seg w-full sm:w-auto">
    {PERIOD_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`erp-date-seg-btn${
          period === opt.value
            ? ' active' : ''}`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

// ─── Employee Dashboard ────────────────────────────────────────────────────

export const EmployeeDashboard: React.FC = () => {
  const navigate = useNavigate();
  const {
    uid,
    _rawEmployees,
    _rawProducts,
    _rawLines,
    productionPlans,
    planReports,
    todayReports,
    monthlyReports,
    workOrders,
    updateWorkOrder,
    loading,
  } = useShallowStore((s) => ({
    uid: s.uid,
    _rawEmployees: s._rawEmployees,
    _rawProducts: s._rawProducts,
    _rawLines: s._rawLines,
    productionPlans: s.productionPlans,
    planReports: s.planReports,
    todayReports: s.todayReports,
    monthlyReports: s.monthlyReports,
    workOrders: s.workOrders,
    updateWorkOrder: s.updateWorkOrder,
    loading: s.loading,
  }));

  const { can } = usePermission();
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const transferApprovalPermission = useAppStore(
    (s) => s.systemSettings.planSettings?.transferApprovalPermission || 'inventory.transfers.approve',
  );

  const [period, setPeriod] = useState<Period>('daily');
  const [periodReports, setPeriodReports] = useState<ProductionReport[]>([]);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [pendingProductionEntries, setPendingProductionEntries] = useState<InventoryTransferRequest[]>([]);

  const [woPrintData, setWoPrintData] = useState<WorkOrderPrintData | null>(null);
  const woPrintRef = useRef<HTMLDivElement>(null);
  const handleWoPrint = useManagedPrint({ contentRef: woPrintRef, printSettings: printTemplate });

  const STATUS_LABELS: Record<string, string> = { pending: 'قيد الانتظار', in_progress: 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغي' };

  const triggerWOPrint = useCallback(async (wo: WorkOrder) => {
    const product = _rawProducts.find((p) => p.id === wo.productId);
    const line = _rawLines.find((l) => l.id === wo.lineId);
    const supervisor = _rawEmployees.find((e) => e.id === wo.supervisorId);
    setWoPrintData({
      workOrderNumber: wo.workOrderNumber,
      productName: product?.name ?? '—',
      lineName: line?.name ?? '—',
      supervisorName: supervisor?.name ?? '—',
      quantity: wo.quantity,
      producedQuantity: wo.producedQuantity,
      maxWorkers: wo.maxWorkers,
      targetDate: wo.targetDate,
      status: wo.status,
      statusLabel: STATUS_LABELS[wo.status] || wo.status,
      estimatedCost: wo.estimatedCost,
      actualCost: wo.actualCost,
      notes: wo.notes,
      showCosts: can('workOrders.viewCost'),
    });
    await new Promise((r) => setTimeout(r, 300));
    handleWoPrint();
    setTimeout(() => setWoPrintData(null), 1000);
  }, [_rawProducts, _rawLines, _rawEmployees, can, handleWoPrint]);

  const employee = useMemo(
    () => _rawEmployees.find((s) => s.userId === uid),
    [_rawEmployees, uid]
  );

  useEffect(() => {
    if (!employee?.id) return;

    if (period === 'daily') {
      setPeriodReports(todayReports.filter((r) => r.employeeId === employee.id));
      return;
    }

    if (period === 'monthly') {
      setPeriodReports(monthlyReports.filter((r) => r.employeeId === employee.id));
      return;
    }

    let cancelled = false;
    setPeriodLoading(true);
    const { start, end } = getDateRange(period);
    reportService.getByDateRange(start, end).then((reports) => {
      if (!cancelled) {
        setPeriodReports(reports.filter((r) => r.employeeId === employee.id));
        setPeriodLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setPeriodLoading(false);
    });
    return () => { cancelled = true; };
  }, [period, employee?.id, todayReports, monthlyReports]);

  useEffect(() => {
    let cancelled = false;
    if (!can(transferApprovalPermission as any)) {
      setPendingProductionEntries([]);
      return;
    }
    transferApprovalService.getByStatus('pending').then((rows) => {
      if (cancelled) return;
      const pending = rows.filter((row) => (row.requestType || 'transfer') === 'production_entry');
      setPendingProductionEntries(pending);
    }).catch(() => {
      if (!cancelled) setPendingProductionEntries([]);
    });
    return () => { cancelled = true; };
  }, [can, transferApprovalPermission, todayReports, monthlyReports]);

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalProduction = periodReports.reduce(
      (sum, r) => sum + (r.quantityProduced || 0), 0
    );
    const totalWaste = periodReports.reduce(
      (sum, r) => sum + (r.quantityWaste || 0), 0
    );
    const wasteRatio = calculateWasteRatio(totalWaste, totalProduction + totalWaste);

    const employeeLineIds = [...new Set(periodReports.map((r) => r.lineId))];
    const activePlans = productionPlans.filter(
      (p) =>
        (p.status === 'in_progress' || p.status === 'planned') &&
        employeeLineIds.includes(p.lineId)
    );

    let totalPlannedQty = 0;
    let totalActualProduced = 0;
    activePlans.forEach((plan) => {
      totalPlannedQty += plan.plannedQuantity;
      const key = `${plan.lineId}_${plan.productId}`;
      const historical = planReports[key] || [];
      const todayForPlan = todayReports.filter(
        (r) => r.lineId === plan.lineId && r.productId === plan.productId
      );
      const historicalIds = new Set(historical.map((r) => r.id));
      const merged = [
        ...historical,
        ...todayForPlan.filter((r) => !historicalIds.has(r.id)),
      ];
      totalActualProduced += merged.reduce(
        (sum, r) => sum + (r.quantityProduced || 0), 0
      );
    });

    const planAchievement = totalPlannedQty > 0
      ? Math.min(Math.round((totalActualProduced / totalPlannedQty) * 100), 100)
      : 0;
    const remaining = Math.max(totalPlannedQty - totalActualProduced, 0);

    const uniqueDays = countUniqueDays(periodReports);
    const avgPerDay = uniqueDays > 0 ? Math.round(totalProduction / uniqueDays) : totalProduction;

    return {
      totalProduction,
      totalWaste,
      wasteRatio,
      planAchievement,
      remaining,
      avgPerDay,
      uniqueDays,
    };
  }, [periodReports, productionPlans, planReports, todayReports]);

  // ── Active Plan Card ──────────────────────────────────────────────────────

  const activePlan = useMemo(() => {
    if (!employee?.id) return null;

    const employeeLineIds = [...new Set(
      [...todayReports, ...monthlyReports]
        .filter((r) => r.employeeId === employee.id)
        .map((r) => r.lineId)
    )];

    const plan = productionPlans.find(
      (p) =>
        (p.status === 'in_progress' || p.status === 'planned') &&
        employeeLineIds.includes(p.lineId)
    );

    if (!plan) return null;

    const product = _rawProducts.find((p) => p.id === plan.productId);
    const line = _rawLines.find((l) => l.id === plan.lineId);

    const key = `${plan.lineId}_${plan.productId}`;
    const historical = planReports[key] || [];
    const todayForPlan = todayReports.filter(
      (r) => r.lineId === plan.lineId && r.productId === plan.productId
    );
    const historicalIds = new Set(historical.map((r) => r.id));
    const mergedAll = [
      ...historical,
      ...todayForPlan.filter((r) => !historicalIds.has(r.id)),
    ];
    const globalProduced = mergedAll.reduce(
      (sum, r) => sum + (r.quantityProduced || 0), 0
    );

    const periodProduced = periodReports
      .filter((r) => r.productId === plan.productId && r.lineId === plan.lineId)
      .reduce((sum, r) => sum + (r.quantityProduced || 0), 0);

    const globalRemaining = Math.max(plan.plannedQuantity - globalProduced, 0);
    const progress = calculatePlanProgress(globalProduced, plan.plannedQuantity);

    return {
      productName: product?.name ?? '—',
      lineName: line?.name ?? '—',
      plannedQuantity: plan.plannedQuantity,
      periodProduced,
      globalProduced,
      globalRemaining,
      progress,
      status: plan.status,
    };
  }, [employee?.id, productionPlans, planReports, todayReports, monthlyReports, periodReports, _rawProducts, _rawLines]);

  // ── Personal Performance ──────────────────────────────────────────────────

  const performance = useMemo(() => {
    const totalHours = periodReports.reduce(
      (sum, r) => sum + (r.workHours || 0), 0
    );
    const totalProduced = periodReports.reduce(
      (sum, r) => sum + (r.quantityProduced || 0), 0
    );
    const avgPerHour = totalHours > 0 ? Number((totalProduced / totalHours).toFixed(1)) : 0;

    return {
      reportsCount: periodReports.length,
      avgPerHour,
      totalHours,
    };
  }, [periodReports]);

  const todayProductionHours = useMemo(() => {
    if (!employee?.id) return 0;
    return todayReports
      .filter((r) => r.employeeId === employee.id)
      .reduce((sum, r) => sum + (r.workHours || 0), 0);
  }, [employee?.id, todayReports]);

  // ── Alerts ────────────────────────────────────────────────────────────────

  const alerts = useMemo(() => {
    const result: { type: 'warning' | 'danger'; message: string; icon: string }[] = [];

    if (activePlan && activePlan.progress < 50 && activePlan.globalRemaining > 0) {
      result.push({
        type: 'warning',
        message: `الخطة متأخرة — تم إنجاز ${activePlan.progress}% فقط. المتبقي: ${formatNumber(activePlan.globalRemaining)} وحدة`,
        icon: 'schedule',
      });
    }

    if (kpis.wasteRatio > 5) {
      result.push({
        type: 'danger',
        message: `نسبة الهالك مرتفعة: ${kpis.wasteRatio}% — يرجى مراجعة جودة الإنتاج`,
        icon: 'warning',
      });
    }

    return result;
  }, [activePlan, kpis]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-8">
        {/* <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text)]">لوحة الموظف</h2> */}
        <LoadingSkeleton type="card" rows={6} />
      </div>
    );
  }

  const periodLabel =
    period === 'daily'
      ? 'اليوم'
      : period === 'yesterday'
        ? 'أمس'
        : period === 'weekly'
          ? 'هذا الأسبوع'
          : 'هذا الشهر';

  return (
    <div className="space-y-5">

      {/* ── ROW 1: Header — greeting + period filter ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">
            {employee?.name ? `مرحباً، ${employee.name} 👋` : 'لوحة الموظف'}
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] font-medium mt-0.5">متابعة الأداء التشغيلي — {periodLabel}</p>
        </div>
        <DashboardPeriodFilter period={period} onChange={setPeriod} />
      </div>

      {/* ── ROW 2: Quick Actions ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0 sm:flex-wrap">
        {can('quickAction.view') && (
          <button
            type="button"
            onClick={() => navigate('/quick-action')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--border-radius-base)] text-sm font-bold bg-primary text-white hover:bg-primary/90 shadow-primary/20 transition-all shrink-0"
          >
            <span className="material-icons-round text-base">bolt</span>
            الإدخال السريع
          </button>
        )}
        {can('inventory.transactions.create') && (
          <button
            type="button"
            onClick={() => navigate('/inventory/movements')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--border-radius-base)] text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20 transition-all shrink-0"
          >
            <span className="material-icons-round text-base">warehouse</span>
            حركة المخزون
          </button>
        )}
        {can('lineWorkers.view') && (
          <button
            type="button"
            onClick={() => navigate('/line-workers')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--border-radius-base)] text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/20 transition-all shrink-0"
          >
            <span className="material-icons-round text-base">group_work</span>
            ربط العمالة بالخط
          </button>
        )}
        {can(transferApprovalPermission as any) && (
          <button
            type="button"
            onClick={() => navigate('/inventory/transfer-approvals')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--border-radius-base)] text-sm font-bold bg-amber-600 text-white hover:bg-amber-700 shadow-amber-600/20 transition-all shrink-0"
          >
            <span className="material-icons-round text-base">verified_user</span>
            اعتماد التحويلات
          </button>
        )}
      </div>

      {/* ── Alerts ── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-3 rounded-[var(--border-radius-lg)] border text-sm font-medium ${
                alert.type === 'danger'
                  ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 text-rose-700'
                  : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 text-amber-700'
              }`}
            >
              <span className="material-icons-round text-lg">{alert.icon}</span>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {can(transferApprovalPermission as any) && pendingProductionEntries.length > 0 && (
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-amber-500">approval</span>
              <h3 className="text-sm font-bold text-[var(--color-text)]">طلبات اعتماد دخول تم الصنع</h3>
              <Badge variant="warning">{pendingProductionEntries.length}</Badge>
            </div>
            <button
              type="button"
              onClick={() => navigate('/inventory/transfer-approvals')}
              className="sm:mr-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--border-radius-base)] text-xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
            >
              <span className="material-icons-round text-sm">inventory</span>
              فتح شاشة الاعتماد
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {pendingProductionEntries.slice(0, 4).map((req) => {
              const totalQty = req.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
              const topItem = req.lines[0]?.itemName || '—';
              return (
                <div key={req.id} className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2.5 bg-[#f8f9fa]/50">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold text-[var(--color-text)]">{req.referenceNo}</p>
                    <span className="text-xs font-black text-emerald-600">{formatNumber(totalQty)} وحدة</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                    {topItem}
                    {req.lines.length > 1 ? ` + ${req.lines.length - 1} أصناف` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {periodLoading ? (
        <LoadingSkeleton type="card" rows={4} />
      ) : (
        <>
          {/* ── ROW 3: KPI Strip — all KPIs in one unified row ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">

            {/* ساعات الإنتاج */}
            <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-7 h-7 rounded-[var(--border-radius-base)] bg-emerald-50 flex items-center justify-center">
                  <span className="material-icons-round text-emerald-600 text-[15px]">schedule</span>
                </span>
                <p className="text-[11px] font-bold text-[var(--color-text-muted)] leading-tight">ساعات الإنتاج</p>
              </div>
              <h3 className="text-2xl font-bold text-emerald-600 leading-none">{todayProductionHours}</h3>
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium">ساعة</span>
            </div>

            {/* متوسط/ساعة */}
            <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-7 h-7 rounded-[var(--border-radius-base)] bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                  <span className="material-icons-round text-blue-600 text-[15px]">speed</span>
                </span>
                <p className="text-[11px] font-bold text-[var(--color-text-muted)] leading-tight">متوسط/ساعة</p>
              </div>
              <h3 className="text-2xl font-bold text-blue-600 leading-none">{formatNumber(performance.avgPerHour)}</h3>
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium">وحدة/ساعة</span>
            </div>

            {/* عدد التقارير */}
            <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-7 h-7 rounded-[var(--border-radius-base)] bg-primary/10 flex items-center justify-center">
                  <span className="material-icons-round text-primary text-[15px]">assignment</span>
                </span>
                <p className="text-[11px] font-bold text-[var(--color-text-muted)] leading-tight">عدد التقارير</p>
              </div>
              <h3 className="text-2xl font-bold text-primary leading-none">{performance.reportsCount}</h3>
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium">تقرير</span>
            </div>

            {/* إجمالي الإنتاج */}
            <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-7 h-7 rounded-[var(--border-radius-base)] bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center">
                  <span className="material-icons-round text-indigo-600 dark:text-indigo-400 text-[15px]">inventory</span>
                </span>
                <p className="text-[11px] font-bold text-[var(--color-text-muted)] leading-tight">إجمالي الإنتاج</p>
              </div>
              <h3 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 leading-none">{formatNumber(kpis.totalProduction)}</h3>
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium">وحدة</span>
            </div>

            {/* تحقيق الخطة */}
            <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-4 flex flex-col gap-1 col-span-2 sm:col-span-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-7 h-7 rounded-[var(--border-radius-base)] flex items-center justify-center ${
                  kpis.planAchievement >= 80 ? 'bg-emerald-50'
                    : kpis.planAchievement >= 50 ? 'bg-amber-50'
                    : 'bg-rose-50'
                }`}>
                  <span className={`material-icons-round text-[15px] ${
                    kpis.planAchievement >= 80 ? 'text-emerald-600'
                      : kpis.planAchievement >= 50 ? 'text-amber-600'
                      : 'text-rose-600'
                  }`}>flag</span>
                </span>
                <p className="text-[11px] font-bold text-[var(--color-text-muted)] leading-tight">تحقيق الخطة</p>
              </div>
              <h3 className={`text-2xl font-bold leading-none ${
                kpis.planAchievement >= 80 ? 'text-emerald-600' : kpis.planAchievement >= 50 ? 'text-amber-600' : 'text-rose-600'
              }`}>
                {kpis.planAchievement > 0 ? `${kpis.planAchievement}%` : '—'}
              </h3>
              <span className="text-[10px] text-[var(--color-text-muted)] font-medium">متبقي: {formatNumber(kpis.remaining)} وحدة</span>
            </div>
          </div>

          {/* متوسط يومي - أسبوع/شهر فقط */}
          {period !== 'daily' && (
            <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-4 flex items-center gap-4">
              <span className="w-10 h-10 rounded-[var(--border-radius-lg)] bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center shrink-0">
                <span className="material-icons-round text-violet-600 dark:text-violet-400">bar_chart</span>
              </span>
              <div>
                <p className="text-xs font-bold text-slate-400">متوسط الإنتاج اليومي ({kpis.uniqueDays} يوم عمل)</p>
                <p className="text-xl font-bold text-violet-600 dark:text-violet-400">{formatNumber(kpis.avgPerDay)} <span className="text-xs font-medium text-slate-400">وحدة/يوم</span></p>
              </div>
            </div>
          )}

          {/* ── ROW 4: Main Content — Active Plan + Work Orders ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">

            {/* الخطة النشطة — RIGHT column (col 1 in RTL) */}
            {activePlan ? (
              <Card>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 bg-primary/10 rounded-[var(--border-radius-lg)] flex items-center justify-center">
                    <span className="material-icons-round text-primary">event_note</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-[var(--color-text)]">الخطة النشطة الحالية</h3>
                    <p className="text-[11px] text-slate-400">{activePlan.productName} — {activePlan.lineName ?? ''}</p>
                  </div>
                  <Badge variant={activePlan.status === 'in_progress' ? 'warning' : 'info'}>
                    {activePlan.status === 'in_progress' ? 'قيد التنفيذ' : 'مخطط'}
                  </Badge>
                </div>

                {/* Progress bar — prominent */}
                <div className="mb-5">
                  <div className="flex justify-between text-sm font-bold mb-2">
                    <span className="text-[var(--color-text-muted)]">التقدم الإجمالي</span>
                    <span className={activePlan.progress >= 80 ? 'text-emerald-600' : activePlan.progress >= 50 ? 'text-blue-600' : 'text-amber-600'}>
                      {activePlan.progress}%
                    </span>
                  </div>
                  <div className="w-full h-4 bg-[#f0f2f5] rounded-full overflow-hidden shadow-inner">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${
                        activePlan.progress >= 80 ? 'bg-emerald-500' : activePlan.progress >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(activePlan.progress, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)] font-medium text-center mt-1">
                    {formatNumber(activePlan.globalProduced)} من {formatNumber(activePlan.plannedQuantity)} وحدة
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'المخطط', value: formatNumber(activePlan.plannedQuantity), color: 'text-[var(--color-text)]' },
                    { label: `منتَج (${periodLabel})`, value: formatNumber(activePlan.periodProduced), color: 'text-blue-600' },
                    { label: 'إجمالي منتَج', value: formatNumber(activePlan.globalProduced), color: 'text-emerald-600' },
                    { label: 'المتبقي', value: formatNumber(activePlan.globalRemaining), color: 'text-amber-600' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-[#f8f9fa]/60 rounded-[var(--border-radius-lg)] p-3 text-center">
                      <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">{stat.label}</p>
                      <p className={`text-base font-bold ${stat.color}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <Card>
                <div className="text-center py-8 text-slate-400">
                  <span className="material-icons-round text-5xl mb-3 block opacity-20">event_note</span>
                  <p className="font-bold text-sm">لا توجد خطة إنتاج نشطة حالياً</p>
                  <p className="text-xs mt-1 opacity-70">تواصل مع موظف الصالة لإنشاء خطة جديدة</p>
                </div>
              </Card>
            )}

            {/* أوامر الشغل — LEFT column */}
            {employee && can('workOrders.view') && (() => {
              const employeeName = (employee.name || '').trim().toLowerCase();
              const myWOs = workOrders.filter((w) => {
                if (w.status !== 'pending' && w.status !== 'in_progress') return false;
                if (w.supervisorId === employee.id) return true;
                return (w.supervisorId || '').trim().toLowerCase() === employeeName;
              });
              if (myWOs.length === 0) return null;
              return (
                <Card className="!p-0 overflow-hidden">
                  <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center gap-2">
                    <span className="material-icons-round text-amber-500">assignment</span>
                    <h3 className="text-base font-bold text-[var(--color-text)]">أوامر الشغل الخاصة بك</h3>
                    <Badge variant="warning">{myWOs.length}</Badge>
                  </div>
                    <div className="divide-y divide-[var(--color-border)]">
                      {myWOs.map((wo) => {
                        const product = _rawProducts.find((p) => p.id === wo.productId);
                        const line = _rawLines.find((l) => l.id === wo.lineId);
                        const prog = wo.quantity > 0 ? Math.min((wo.producedQuantity / wo.quantity) * 100, 100) : 0;
                        const isSupervisor = wo.supervisorId === employee.id;
                        return (
                          <div key={wo.id} className="px-6 py-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-amber-600">#{wo.workOrderNumber}</span>
                                <Badge variant={wo.status === 'in_progress' ? 'warning' : 'info'}>
                                  {wo.status === 'in_progress' ? 'قيد التنفيذ' : 'قيد الانتظار'}
                                </Badge>
                                {isSupervisor && (
                                  <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full">مشرف</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {can('print') && (
                                  <button
                                    onClick={() => triggerWOPrint(wo)}
                                    className="p-2 rounded-[var(--border-radius-base)] bg-[#f8f9fa] text-[var(--color-text-muted)] hover:text-primary hover:bg-[#f0f2f5] transition-colors"
                                    title="طباعة"
                                  >
                                    <span className="material-icons-round text-base">print</span>
                                  </button>
                                )}
                                {isSupervisor && can('workOrders.edit') && wo.status === 'pending' && (
                                  <button
                                    onClick={() => updateWorkOrder(wo.id!, { status: 'in_progress' })}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-[var(--border-radius-base)] bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs font-bold transition-colors"
                                  >
                                    <span className="material-icons-round text-sm">play_arrow</span>
                                    بدء
                                  </button>
                                )}
                                {isSupervisor && can('workOrders.edit') && wo.status === 'in_progress' && (
                                  <button
                                    onClick={() => updateWorkOrder(wo.id!, { status: 'completed', completedAt: new Date().toISOString() })}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-[var(--border-radius-base)] bg-blue-50 dark:bg-blue-900/20 text-blue-600 hover:bg-blue-100 text-xs font-bold transition-colors"
                                  >
                                    <span className="material-icons-round text-sm">check_circle</span>
                                    اكتمل
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="material-icons-round text-[var(--color-text-muted)] text-base">inventory_2</span>
                              <p className="text-sm font-bold text-[var(--color-text)]">{product?.name ?? '—'}</p>
                              <span className="text-[var(--color-text-muted)] dark:text-slate-600">·</span>
                              <span className="material-icons-round text-[var(--color-text-muted)] text-sm">precision_manufacturing</span>
                              <span className="text-xs font-bold text-slate-500">{line?.name ?? '—'}</span>
                            </div>

                            <div className="grid grid-cols-3 gap-3 text-center">
                              <div className="bg-[#f8f9fa] rounded-[var(--border-radius-base)] p-2.5">
                                <p className="text-[10px] text-[var(--color-text-muted)] font-medium mb-0.5">المطلوب</p>
                                <p className="text-sm font-bold text-[var(--color-text)]">{formatNumber(wo.quantity)}</p>
                              </div>
                              <div className="bg-[#f8f9fa] rounded-[var(--border-radius-base)] p-2.5">
                                <p className="text-[10px] text-[var(--color-text-muted)] font-medium mb-0.5">تم إنتاجه</p>
                                <p className="text-sm font-bold text-emerald-600">{formatNumber(wo.producedQuantity)}</p>
                              </div>
                              <div className="bg-[#f8f9fa] rounded-[var(--border-radius-base)] p-2.5">
                                <p className="text-[10px] text-[var(--color-text-muted)] font-medium mb-0.5">المتبقي</p>
                                <p className="text-sm font-bold text-rose-500">{formatNumber(wo.quantity - wo.producedQuantity)}</p>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex justify-between text-xs font-bold">
                                <span className="text-[var(--color-text-muted)]">التقدم</span>
                                <span className={prog >= 80 ? 'text-emerald-600' : prog >= 50 ? 'text-amber-600' : 'text-slate-500'}>{prog.toFixed(0)}%</span>
                              </div>
                              <div className="h-2 bg-[#f0f2f5] rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-1000 ${prog >= 80 ? 'bg-emerald-500' : prog >= 50 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${Math.min(prog, 100)}%` }} />
                              </div>
                            </div>

                            <div className="flex items-center gap-4 text-xs text-slate-400">
                              <div className="flex items-center gap-1">
                                <span className="material-icons-round text-sm">groups</span>
                                <span className="font-bold">{wo.maxWorkers} عامل</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="material-icons-round text-sm">event</span>
                                <span className="font-bold">{wo.targetDate}</span>
                              </div>
                              {can('workOrders.viewCost') && wo.estimatedCost > 0 && (
                                <div className="flex items-center gap-1 mr-auto">
                                  <span className="material-icons-round text-sm text-emerald-500">payments</span>
                                  <span className="font-bold text-emerald-600">{formatCurrency(wo.estimatedCost)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                </Card>
              );
            })()}
          </div>
        </>
      )}


      {/* Hidden print component */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <WorkOrderPrint ref={woPrintRef} data={woPrintData} printSettings={printTemplate} />
      </div>
    </div>
  );
};
