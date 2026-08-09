import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GhostButton, PrimaryButton } from '@/src/components/erp/ActionButton';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { withTenantPath } from '@/lib/tenantPaths';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { DomainHomeShell } from '@/modules/dashboards/components/DomainHomeShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { useOperationalDecisionSnapshot } from '@/modules/dashboards/hooks/useOperationalDecisionSnapshot';
import { SUPERVISOR_PORTAL_PATHS } from '@/modules/dashboards/lib/portalHome';
import { supervisorLineAssignmentService } from '@/modules/production/services/supervisorLineAssignmentService';
import { useAppStore, useShallowStore, getProductionReportsRangeCacheKey } from '@/store/useAppStore';
import type { ProductionPlan, ProductionReport, WorkOrder } from '@/types';
import {
  calculatePlanProgress,
  calculateWasteRatio,
  countUniqueDays,
  formatNumber,
  getReportWaste,
  getTodayDateString,
} from '@/utils/calculations';

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

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'daily', label: 'يومي' },
  { value: 'yesterday', label: 'أمس' },
  { value: 'weekly', label: 'أسبوعي' },
  { value: 'monthly', label: 'شهري' },
];

const STATUS_LABELS: Record<string, string> = {
  pending: 'قيد الانتظار',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};

const CHART_TICK = { fontSize: 10, fill: 'var(--color-text-muted)' };
const GRID_STROKE = 'color-mix(in srgb, var(--color-border) 80%, transparent)';

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 10,
        padding: '8px 10px',
        boxShadow: '0 8px 20px rgba(15, 23, 42, 0.1)',
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--color-text)',
        direction: 'rtl',
      }}
    >
      {label != null ? <div style={{ marginBottom: 4, color: 'var(--color-text-muted)' }}>{label}</div> : null}
      {payload.map((row) => (
        <div key={String(row.name)} style={{ color: row.color || 'var(--color-text)' }}>
          {row.name}: {typeof row.value === 'number' ? formatNumber(row.value) : row.value}
        </div>
      ))}
    </div>
  );
}

export const SupervisorDashboard: React.FC = () => {
  const navigate = useTenantNavigate();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const tenantPath = useCallback(
    (path: string) => withTenantPath(tenantSlug, path),
    [tenantSlug],
  );

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
    loading: s.loading,
  }));

  const ensureProductionReportsForRange = useAppStore((s) => s.ensureProductionReportsForRange);
  const { snapshot: decisionSnapshot, loading: decisionLoading, refresh: refreshDecision } =
    useOperationalDecisionSnapshot();

  const [period, setPeriod] = useState<Period>('daily');
  const [periodReports, setPeriodReports] = useState<ProductionReport[]>([]);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [assignedLineIds, setAssignedLineIds] = useState<Set<string>>(new Set());
  const today = getTodayDateString();

  const employee = useMemo(
    () => _rawEmployees.find((s) => s.userId === uid),
    [_rawEmployees, uid],
  );

  useEffect(() => {
    let cancelled = false;
    if (!employee?.id) {
      setAssignedLineIds(new Set());
      return;
    }

    supervisorLineAssignmentService
      .getActiveByDate(today)
      .then((rows) => {
        if (cancelled) return;
        setAssignedLineIds(
          new Set(
            rows
              .filter((row) => row.supervisorId === employee.id)
              .map((row) => row.lineId)
              .filter(Boolean),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setAssignedLineIds(new Set());
      });

    return () => {
      cancelled = true;
    };
  }, [employee?.id, today]);

  useEffect(() => {
    if (!employee?.id) {
      setPeriodReports([]);
      setPeriodLoading(false);
      return;
    }

    let cancelled = false;
    const { start, end } = getDateRange(period);
    const maxAgeMs = 5 * 60 * 1000;
    const cacheKey = getProductionReportsRangeCacheKey(start, end);
    const cached = useAppStore.getState().productionReportsRangeCache[cacheKey];
    if (cached) {
      setPeriodReports(cached.rows.filter((r) => r.employeeId === employee.id));
      setPeriodLoading(false);
    } else {
      setPeriodLoading(true);
    }

    ensureProductionReportsForRange(start, end, { maxAgeMs })
      .then((reports) => {
        if (!cancelled) {
          setPeriodReports(reports.filter((r) => r.employeeId === employee.id));
          setPeriodLoading(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (period === 'daily') {
          setPeriodReports(todayReports.filter((r) => r.employeeId === employee.id));
        } else if (period === 'monthly') {
          setPeriodReports(monthlyReports.filter((r) => r.employeeId === employee.id));
        }
        setPeriodLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period, employee?.id, todayReports, monthlyReports, ensureProductionReportsForRange]);

  const refreshPeriodReports = useCallback(async () => {
    if (!employee?.id) return;
    const { start, end } = getDateRange(period);
    setPeriodLoading(true);
    try {
      const reports = await ensureProductionReportsForRange(start, end, { force: true });
      setPeriodReports(reports.filter((r) => r.employeeId === employee.id));
    } catch {
      // keep previous periodReports on refresh failure
    } finally {
      setPeriodLoading(false);
    }
  }, [employee?.id, period, ensureProductionReportsForRange]);

  const myActiveWorkOrders = useMemo(() => {
    if (!employee) return [] as WorkOrder[];
    const employeeName = (employee.name || '').trim().toLowerCase();
    return workOrders.filter((wo) => {
      if (wo.status !== 'pending' && wo.status !== 'in_progress') return false;
      if (wo.supervisorId === employee.id) return true;
      return (wo.supervisorId || '').trim().toLowerCase() === employeeName;
    });
  }, [employee, workOrders]);

  const kpis = useMemo(() => {
    const totalProduction = periodReports.reduce(
      (sum, r) => sum + (r.quantityProduced || 0),
      0,
    );
    const totalWaste = periodReports.reduce((sum, r) => sum + getReportWaste(r), 0);
    const wasteRatio = calculateWasteRatio(totalWaste, totalProduction + totalWaste);

    const employeeLineIds = [...new Set(periodReports.map((r) => r.lineId))];
    const visibleLineIds = [...new Set([...employeeLineIds, ...assignedLineIds])];
    const activePlans = productionPlans.filter(
      (p) =>
        (p.status === 'in_progress' || p.status === 'planned') &&
        visibleLineIds.includes(p.lineId),
    );

    let totalPlannedQty = 0;
    let totalActualProduced = 0;
    activePlans.forEach((plan) => {
      totalPlannedQty += plan.plannedQuantity;
      const key = `${plan.lineId}_${plan.productId}`;
      const historical = planReports[key] || [];
      const todayForPlan = todayReports.filter(
        (r) => r.lineId === plan.lineId && r.productId === plan.productId,
      );
      const historicalIds = new Set(historical.map((r) => r.id));
      const merged = [
        ...historical,
        ...todayForPlan.filter((r) => !historicalIds.has(r.id)),
      ];
      totalActualProduced += merged.reduce(
        (sum, r) => sum + (r.quantityProduced || 0),
        0,
      );
    });

    const planAchievement =
      totalPlannedQty > 0
        ? Math.min(Math.round((totalActualProduced / totalPlannedQty) * 100), 100)
        : 0;

    const uniqueDays = countUniqueDays(periodReports);
    const avgPerDay =
      uniqueDays > 0 ? Math.round(totalProduction / uniqueDays) : totalProduction;

    return {
      totalProduction,
      wasteRatio,
      planAchievement,
      avgPerDay,
      uniqueDays,
      assignedLinesCount: assignedLineIds.size,
      activeWorkOrdersCount: myActiveWorkOrders.length,
    };
  }, [
    periodReports,
    productionPlans,
    planReports,
    todayReports,
    assignedLineIds,
    myActiveWorkOrders.length,
  ]);

  const activePlan = useMemo((): {
    plan: ProductionPlan;
    productName: string;
    lineName: string;
    plannedQuantity: number;
    periodProduced: number;
    globalProduced: number;
    globalRemaining: number;
    progress: number;
    status: ProductionPlan['status'];
  } | null => {
    if (!employee?.id) return null;

    const employeeLineIds = [
      ...new Set(
        [...todayReports, ...monthlyReports]
          .filter((r) => r.employeeId === employee.id)
          .map((r) => r.lineId),
      ),
    ];
    const visibleLineIds = [...new Set([...employeeLineIds, ...assignedLineIds])];

    const plan = productionPlans.find(
      (p) =>
        (p.status === 'in_progress' || p.status === 'planned') &&
        visibleLineIds.includes(p.lineId),
    );
    if (!plan) return null;

    const product = _rawProducts.find((p) => p.id === plan.productId);
    const line = _rawLines.find((l) => l.id === plan.lineId);
    const key = `${plan.lineId}_${plan.productId}`;
    const historical = planReports[key] || [];
    const todayForPlan = todayReports.filter(
      (r) => r.lineId === plan.lineId && r.productId === plan.productId,
    );
    const historicalIds = new Set(historical.map((r) => r.id));
    const mergedAll = [
      ...historical,
      ...todayForPlan.filter((r) => !historicalIds.has(r.id)),
    ];
    const globalProduced = mergedAll.reduce(
      (sum, r) => sum + (r.quantityProduced || 0),
      0,
    );
    const periodProduced = periodReports
      .filter((r) => r.productId === plan.productId && r.lineId === plan.lineId)
      .reduce((sum, r) => sum + (r.quantityProduced || 0), 0);
    const globalRemaining = Math.max(plan.plannedQuantity - globalProduced, 0);
    const progress = calculatePlanProgress(globalProduced, plan.plannedQuantity);

    return {
      plan,
      productName: product?.name ?? '—',
      lineName: line?.name ?? '—',
      plannedQuantity: plan.plannedQuantity,
      periodProduced,
      globalProduced,
      globalRemaining,
      progress,
      status: plan.status,
    };
  }, [
    employee?.id,
    productionPlans,
    planReports,
    todayReports,
    monthlyReports,
    periodReports,
    _rawProducts,
    _rawLines,
    assignedLineIds,
  ]);

  const dailyChartData = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const report of periodReports) {
      const date = String(report.date || '').slice(0, 10);
      if (!date) continue;
      byDate.set(date, (byDate.get(date) || 0) + (report.quantityProduced || 0));
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, value]) => ({
        date: date.slice(5),
        value,
      }));
  }, [periodReports]);

  const periodLabel =
    PERIOD_OPTIONS.find((opt) => opt.value === period)?.label ?? 'اليوم';
  const dateRange = getDateRange(period);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refreshPeriodReports(), refreshDecision()]);
    } finally {
      setRefreshing(false);
    }
  };

  const storeBooting = Boolean(loading);
  if (storeBooting && !employee) {
    return <PageContentSkeleton variant="dashboard" kpiCount={6} />;
  }

  if (!employee) {
    return (
      <div className="erp-ds-clean p-6 text-center text-[var(--color-text-muted)]" dir="rtl">
        <p className="font-bold">لم يتم ربط حسابك بسجل موظف</p>
        <p className="text-sm mt-1">تواصل مع الإدارة لربط المستخدم بموظف مشرف.</p>
      </div>
    );
  }

  const hero = [
    {
      key: 'period-prod',
      label: 'إنتاج الفترة',
      value: periodLoading ? '…' : formatNumber(kpis.totalProduction),
      meta: `متوسط/يوم ${formatNumber(kpis.avgPerDay)}`,
      accent: true as const,
    },
    {
      key: 'waste',
      label: 'هالك %',
      value: periodLoading ? '…' : `${kpis.wasteRatio}%`,
      meta: `${kpis.uniqueDays} يوم عمل`,
    },
    {
      key: 'plan',
      label: 'تحقيق الخطة %',
      value: periodLoading ? '…' : kpis.planAchievement > 0 ? `${kpis.planAchievement}%` : '—',
      meta: activePlan ? activePlan.productName : 'لا خطة نشطة',
    },
    {
      key: 'work-orders',
      label: 'أوامر شغل نشطة',
      value: formatNumber(kpis.activeWorkOrdersCount),
      meta: 'مسندة لك',
    },
    {
      key: 'lines',
      label: 'خطوط مسندة',
      value: formatNumber(kpis.assignedLinesCount),
      meta: today,
    },
    {
      key: 'materials',
      label: 'جاهزية مواد',
      value: decisionLoading ? '…' : `${decisionSnapshot.materials.readinessPercent}%`,
      meta: `صرف مفتوح ${formatNumber(decisionSnapshot.issues.openCount)}`,
    },
  ];

  const workOrdersPreview = myActiveWorkOrders.slice(0, 6);

  return (
    <DomainHomeShell
      denseHero
      eyebrow="لوحة المشرف"
      hero={hero}
      periods={PERIOD_OPTIONS}
      activePeriod={period}
      onPeriodChange={(value) => setPeriod(value as Period)}
      onRefresh={() => {
        void handleRefresh();
      }}
      refreshing={refreshing || periodLoading || decisionLoading}
      rangeLabel={`${dateRange.start} → ${dateRange.end} · ${periodLabel}`}
      secondarySummary="روابط المشرف"
      secondary={(
        <div className="flex flex-wrap gap-2">
          <Link to={tenantPath(SUPERVISOR_PORTAL_PATHS.dashboard)}>
            <GhostButton iconName="monitoring" tone="view">لوحة المشرف</GhostButton>
          </Link>
          <Link to={tenantPath(SUPERVISOR_PORTAL_PATHS.myWorkers)}>
            <GhostButton iconName="supervisor_account" tone="view">عمالي</GhostButton>
          </Link>
          <Link to={tenantPath(SUPERVISOR_PORTAL_PATHS.workerEvaluation)}>
            <GhostButton iconName="assignment_ind" tone="edit">تقييم العمالة</GhostButton>
          </Link>
          <Link to={tenantPath(SUPERVISOR_PORTAL_PATHS.teamActions)}>
            <GhostButton iconName="assignment" tone="share">طلبات الإنتاج</GhostButton>
          </Link>
          <Link to={tenantPath(SUPERVISOR_PORTAL_PATHS.quickAction)}>
            <PrimaryButton iconName="bolt" tone="execute">إدخال سريع</PrimaryButton>
          </Link>
          <Link to={tenantPath(SUPERVISOR_PORTAL_PATHS.productionIssueRequests)}>
            <GhostButton iconName="fact_check" tone="approve">طلبات الصرف</GhostButton>
          </Link>
          <Link to={tenantPath(SUPERVISOR_PORTAL_PATHS.reports)}>
            <GhostButton iconName="bar_chart" tone="view">التقارير</GhostButton>
          </Link>
        </div>
      )}
    >
      <div className="ops-module-charts__qty-row ops-module-charts__qty-row--4">
        <button
          type="button"
          className="ops-module-charts__qty text-start"
          onClick={() => navigate(SUPERVISOR_PORTAL_PATHS.productionIssueRequests)}
        >
          <p className="ops-module-charts__qty-label">صرف مفتوح</p>
          <p className="ops-module-charts__qty-value">
            {decisionLoading ? '…' : formatNumber(decisionSnapshot.issues.openCount)}
          </p>
        </button>
        <button
          type="button"
          className="ops-module-charts__qty text-start"
          onClick={() => navigate('/production/packaging/control')}
        >
          <p className="ops-module-charts__qty-label">تغليف بانتظار</p>
          <p className="ops-module-charts__qty-value">
            {decisionLoading ? '…' : formatNumber(decisionSnapshot.packaging.awaitingUnits)}
          </p>
        </button>
        <button
          type="button"
          className="ops-module-charts__qty text-start"
          onClick={() => navigate('/production-plans')}
        >
          <p className="ops-module-charts__qty-label">متأخر جدول</p>
          <p className="ops-module-charts__qty-value">
            {decisionLoading ? '…' : formatNumber(decisionSnapshot.behindScheduleCount)}
          </p>
        </button>
        <button
          type="button"
          className="ops-module-charts__qty text-start"
          onClick={() => navigate('/inventory/production-floor')}
        >
          <p className="ops-module-charts__qty-label">WIP</p>
          <p className="ops-module-charts__qty-value">
            {decisionLoading ? '…' : formatNumber(decisionSnapshot.inventory.wipQty)}
          </p>
        </button>
      </div>

      <OpsDashPanel
        title="الإنتاج اليومي"
        accent="production"
        action={(
          <button
            type="button"
            className="ops-dash-panel__action"
            onClick={() => navigate(SUPERVISOR_PORTAL_PATHS.reports)}
          >
            التقارير
          </button>
        )}
      >
        {periodLoading && dailyChartData.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-8 text-center">جاري التحميل…</p>
        ) : dailyChartData.length > 0 ? (
          <div className="ops-module-charts__chart ops-module-charts__chart--compact" dir="ltr">
            <ResponsiveContainer>
              <BarChart data={dailyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={CHART_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="value"
                  name="الإنتاج"
                  fill="var(--color-primary, #2563eb)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="ops-module-charts__empty">
            <span className="ops-module-charts__empty-mark" aria-hidden />
            <p className="ops-module-charts__empty-label">لا توجد تقارير إنتاج في الفترة</p>
          </div>
        )}
      </OpsDashPanel>

      {activePlan ? (
        <OpsDashPanel
          title="الخطة النشطة"
          accent="plans"
          action={(
            <button
              type="button"
              className="ops-dash-panel__action"
              onClick={() => navigate('/production-plans')}
            >
              الخطط
            </button>
          )}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="font-bold text-[var(--color-text)] truncate">{activePlan.productName}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{activePlan.lineName}</p>
            </div>
            <StatusBadge
              label={activePlan.status === 'in_progress' ? 'قيد التنفيذ' : 'مخطط'}
            />
          </div>
          <div className="flex justify-between text-sm font-bold mb-2">
            <span className="text-[var(--color-text-muted)]">التقدم</span>
            <span
              className={
                activePlan.progress >= 80
                  ? 'text-emerald-600'
                  : activePlan.progress >= 50
                    ? 'text-blue-600'
                    : 'text-amber-600'
              }
            >
              {activePlan.progress}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-[var(--color-border)]/40 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full rounded-full ${
                activePlan.progress >= 80
                  ? 'bg-emerald-500'
                  : activePlan.progress >= 50
                    ? 'bg-blue-500'
                    : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(activePlan.progress, 100)}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] font-bold text-[var(--color-text-muted)]">المخطط</p>
              <p className="text-sm font-bold tabular-nums">{formatNumber(activePlan.plannedQuantity)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-[var(--color-text-muted)]">منتَج ({periodLabel})</p>
              <p className="text-sm font-bold tabular-nums text-blue-600">
                {formatNumber(activePlan.periodProduced)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-[var(--color-text-muted)]">المتبقي</p>
              <p className="text-sm font-bold tabular-nums text-amber-600">
                {formatNumber(activePlan.globalRemaining)}
              </p>
            </div>
          </div>
        </OpsDashPanel>
      ) : null}

      <OpsDashPanel
        title="أوامر الشغل النشطة"
        accent="production"
        action={(
          <button
            type="button"
            className="ops-dash-panel__action"
            onClick={() => navigate('/work-orders')}
          >
            الكل
          </button>
        )}
      >
        {workOrdersPreview.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">
            لا توجد أوامر شغل نشطة مسندة إليك
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {workOrdersPreview.map((wo) => {
              const product = _rawProducts.find((p) => p.id === wo.productId);
              const line = _rawLines.find((l) => l.id === wo.lineId);
              const produced = Math.max(
                Number(wo.producedQuantity || 0),
                Number(wo.actualProducedFromScans || wo.scanSummary?.completedUnits || 0),
              );
              const progress =
                wo.quantity > 0 ? Math.min(Math.round((produced / wo.quantity) * 100), 100) : 0;
              return (
                <li key={wo.id || wo.workOrderNumber}>
                  <Link
                    to={tenantPath('/work-orders')}
                    className="flex items-center justify-between gap-3 py-3 hover:bg-[var(--color-border)]/20 rounded-md px-1 -mx-1 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-amber-600">
                          #{wo.workOrderNumber}
                        </span>
                        <StatusBadge label={STATUS_LABELS[wo.status] || wo.status} />
                      </div>
                      <p className="text-sm font-medium text-[var(--color-text)] truncate mt-0.5">
                        {product?.name ?? '—'}
                      </p>
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        {line?.name ?? '—'}
                        {wo.targetDate ? ` · ${wo.targetDate}` : ''}
                      </p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="text-sm font-bold tabular-nums">{progress}%</p>
                      <p className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
                        {formatNumber(produced)}/{formatNumber(wo.quantity)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </OpsDashPanel>
    </DomainHomeShell>
  );
};
