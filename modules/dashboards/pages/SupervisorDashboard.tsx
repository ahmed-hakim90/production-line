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
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { withTenantPath } from '@/lib/tenantPaths';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { DomainHomeShell } from '@/modules/dashboards/components/DomainHomeShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { SupervisorWorkOrderQuickReportDialog } from '@/modules/dashboards/components/SupervisorWorkOrderQuickReportDialog';
import { SupervisorDailyReportsPanel } from '@/modules/dashboards/components/SupervisorDailyReportsPanel';
import { useOperationalDecisionSnapshot } from '@/modules/dashboards/hooks/useOperationalDecisionSnapshot';
import { SUPERVISOR_PORTAL_PATHS } from '@/modules/dashboards/lib/portalHome';
import { supervisorLineAssignmentService } from '@/modules/production/services/supervisorLineAssignmentService';
import { useAppStore, useShallowStore, getProductionReportsRangeCacheKey } from '@/store/useAppStore';
import type { ProductionPlan, ProductionReport, WorkOrder } from '@/types';
import { WORK_ORDER_STATUS_LABELS } from '@/modules/production/utils/workOrderReportLinking';
import {
  catalogOrComponentName,
  loadReportsComponentLabelOptions,
  type InjectionComponentOption,
} from '@/modules/production/utils/injectionComponentOptions';
import { usePermission } from '@/utils/permissions';
import {
  calculatePlanProgress,
  calculateWasteRatio,
  countUniqueDays,
  formatNumber,
  getReportWaste,
  getTodayDateString,
} from '@/utils/calculations';
import { resolvePlanReports } from '@/modules/dashboards/lib/decisionMetrics';
import {
  filterActiveWorkOrdersForReporter,
  indexTodayReportStateByWorkOrder,
  reportWasEnteredByActor,
  sortWorkOrdersByTodayReportState,
} from '@/modules/dashboards/lib/supervisorReportingAccess';
import {
  resolveProductCategoryFilterKey,
  resolveProductCategoryLeafName,
} from '@/modules/catalog/lib/resolveProductCategory';

const ACTIVE_WO_FILTERS_STORAGE_PREFIX = 'supervisor.activeWoFilters.v1';

type ActiveWoPersistedFilters = {
  supervisorId?: string;
  lineId?: string;
  status?: string;
  categoryKey?: string;
};

function activeWoFiltersStorageKey(tenantSlug: string | undefined, uid: string | null | undefined): string | null {
  const slug = String(tenantSlug || '').trim();
  const userId = String(uid || '').trim();
  if (!slug || !userId) return null;
  return `${ACTIVE_WO_FILTERS_STORAGE_PREFIX}:${slug}:${userId}`;
}

function readActiveWoPersistedFilters(key: string | null): ActiveWoPersistedFilters {
  if (!key || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ActiveWoPersistedFilters;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeActiveWoPersistedFilters(key: string | null, value: ActiveWoPersistedFilters): void {
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private-mode failures
  }
}

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

const STATUS_LABELS = WORK_ORDER_STATUS_LABELS;

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
  const { can } = usePermission();
  const canCreateReport = can('reports.create') || can('reports.componentInjection.manage');
  const canCreateForAnySupervisor = can('reports.createForAnySupervisor');
  const tenantPath = useCallback(
    (path: string) => withTenantPath(tenantSlug, path),
    [tenantSlug],
  );

  const {
    uid,
    _rawEmployees,
    _rawProducts,
    _productCategories,
    _rawLines,
    productionPlans,
    planReports,
    todayReports,
    monthlyReports,
    workOrders,
    printTemplate,
    tenantCompanyName,
    loading,
  } = useShallowStore((s) => ({
    uid: s.uid,
    _rawEmployees: s._rawEmployees,
    _rawProducts: s._rawProducts,
    _productCategories: s._productCategories,
    _rawLines: s._rawLines,
    productionPlans: s.productionPlans,
    planReports: s.planReports,
    todayReports: s.todayReports,
    monthlyReports: s.monthlyReports,
    workOrders: s.workOrders,
    printTemplate: s.systemSettings.printTemplate,
    tenantCompanyName: s.tenantCompanyName,
    loading: s.loading,
  }));

  const ensureProductionReportsForRange = useAppStore((s) => s.ensureProductionReportsForRange);
  const retryQueuedReportCreate = useAppStore((s) => s.retryQueuedReportCreate);
  const fetchProducts = useAppStore((s) => s.fetchProducts);
  const fetchLines = useAppStore((s) => s.fetchLines);
  const fetchEmployees = useAppStore((s) => s.fetchEmployees);
  const fetchProductionPlans = useAppStore((s) => s.fetchProductionPlans);
  const fetchWorkOrders = useAppStore((s) => s.fetchWorkOrders);
  useEffect(() => {
    void Promise.all([
      fetchProducts(),
      fetchLines(),
      fetchEmployees(),
      fetchProductionPlans(),
      fetchWorkOrders({ silent: true }),
    ]).catch(() => undefined);
  }, [fetchEmployees, fetchLines, fetchProductionPlans, fetchProducts, fetchWorkOrders]);
  const { snapshot: decisionSnapshot, loading: decisionLoading, refresh: refreshDecision } =
    useOperationalDecisionSnapshot();

  const [period, setPeriod] = useState<Period>('monthly');
  const [periodReports, setPeriodReports] = useState<ProductionReport[]>([]);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [assignedLineIds, setAssignedLineIds] = useState<Set<string>>(new Set());
  const [quickReportWorkOrder, setQuickReportWorkOrder] = useState<WorkOrder | null>(null);
  const [workOrderSearch, setWorkOrderSearch] = useState('');
  const [workOrderSupervisorFilter, setWorkOrderSupervisorFilter] = useState('all');
  const [workOrderLineFilter, setWorkOrderLineFilter] = useState('all');
  const [workOrderStatusFilter, setWorkOrderStatusFilter] = useState('all');
  const [workOrderCategoryFilter, setWorkOrderCategoryFilter] = useState('all');
  const [woFiltersHydrated, setWoFiltersHydrated] = useState(false);
  const [workOrdersPage, setWorkOrdersPage] = useState(1);
  const [componentLabelOptions, setComponentLabelOptions] = useState<InjectionComponentOption[]>([]);
  const today = getTodayDateString();
  const woFiltersStorageKey = activeWoFiltersStorageKey(tenantSlug, uid);

  useEffect(() => {
    if (!woFiltersStorageKey) {
      setWoFiltersHydrated(true);
      return;
    }
    const saved = readActiveWoPersistedFilters(woFiltersStorageKey);
    if (saved.supervisorId) setWorkOrderSupervisorFilter(saved.supervisorId);
    if (saved.lineId) setWorkOrderLineFilter(saved.lineId);
    if (saved.status) setWorkOrderStatusFilter(saved.status);
    if (saved.categoryKey) setWorkOrderCategoryFilter(saved.categoryKey);
    setWoFiltersHydrated(true);
  }, [woFiltersStorageKey]);

  useEffect(() => {
    if (!woFiltersHydrated || !woFiltersStorageKey) return;
    writeActiveWoPersistedFilters(woFiltersStorageKey, {
      supervisorId: workOrderSupervisorFilter,
      lineId: workOrderLineFilter,
      status: workOrderStatusFilter,
      categoryKey: workOrderCategoryFilter,
    });
  }, [
    woFiltersHydrated,
    woFiltersStorageKey,
    workOrderSupervisorFilter,
    workOrderLineFilter,
    workOrderStatusFilter,
    workOrderCategoryFilter,
  ]);

  useEffect(() => {
    let mounted = true;
    loadReportsComponentLabelOptions()
      .then((rows) => {
        if (mounted) setComponentLabelOptions(rows);
      })
      .catch(() => {
        if (mounted) setComponentLabelOptions([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const employee = useMemo(
    () => _rawEmployees.find((s) => s.userId === uid),
    [_rawEmployees, uid],
  );

  const isMyReport = useCallback((report: ProductionReport) => {
    return reportWasEnteredByActor(
      report,
      uid,
      employee?.id,
      canCreateForAnySupervisor,
    );
  }, [canCreateForAnySupervisor, employee?.id, uid]);

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
      setPeriodReports(cached.rows.filter(isMyReport));
      setPeriodLoading(false);
    } else {
      setPeriodLoading(true);
    }

    ensureProductionReportsForRange(start, end, { maxAgeMs })
      .then((reports) => {
        if (!cancelled) {
          setPeriodReports(reports.filter(isMyReport));
          setPeriodLoading(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        if (period === 'daily') {
          setPeriodReports(todayReports.filter(isMyReport));
        } else if (period === 'monthly') {
          setPeriodReports(monthlyReports.filter(isMyReport));
        }
        setPeriodLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period, employee?.id, todayReports, monthlyReports, ensureProductionReportsForRange, isMyReport]);

  const refreshPeriodReports = useCallback(async () => {
    if (!employee?.id) return;
    const { start, end } = getDateRange(period);
    setPeriodLoading(true);
    try {
      const reports = await ensureProductionReportsForRange(start, end, { force: true });
      setPeriodReports(reports.filter(isMyReport));
    } catch {
      // keep previous periodReports on refresh failure
    } finally {
      setPeriodLoading(false);
    }
  }, [employee?.id, period, ensureProductionReportsForRange, isMyReport]);

  const myActiveWorkOrders = useMemo(() => {
    return filterActiveWorkOrdersForReporter(workOrders, employee, canCreateForAnySupervisor);
  }, [employee, workOrders, canCreateForAnySupervisor]);
  const todayReportStateByWorkOrder = useMemo(
    () => indexTodayReportStateByWorkOrder(todayReports),
    [todayReports],
  );

  const workOrderCategoryOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const wo of myActiveWorkOrders) {
      const product = _rawProducts.find((row) => row.id === wo.productId);
      if (!product) continue;
      const key = resolveProductCategoryFilterKey(product);
      if (!key || byKey.has(key)) continue;
      const label = resolveProductCategoryLeafName(product, _productCategories) || 'بدون فئة';
      byKey.set(key, label);
    }
    return [...byKey.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ar'));
  }, [myActiveWorkOrders, _rawProducts, _productCategories]);

  const filteredWorkOrders = useMemo(() => {
    const query = workOrderSearch.trim().toLocaleLowerCase('ar');
    const matching = myActiveWorkOrders.filter((wo) => {
      if (workOrderSupervisorFilter !== 'all' && wo.supervisorId !== workOrderSupervisorFilter) return false;
      if (workOrderLineFilter !== 'all' && wo.lineId !== workOrderLineFilter) return false;
      if (workOrderStatusFilter !== 'all' && wo.status !== workOrderStatusFilter) return false;
      if (workOrderCategoryFilter !== 'all') {
        const product = _rawProducts.find((row) => row.id === wo.productId);
        const categoryKey = product ? resolveProductCategoryFilterKey(product) : '';
        if (categoryKey !== workOrderCategoryFilter) return false;
      }
      if (!query) return true;
      const productName = catalogOrComponentName(wo.productId, _rawProducts, componentLabelOptions);
      const supervisorName = _rawEmployees.find((row) => row.id === wo.supervisorId)?.name || '';
      return [wo.workOrderNumber, productName, supervisorName]
        .some((value) => String(value || '').toLocaleLowerCase('ar').includes(query));
    });
    return sortWorkOrdersByTodayReportState(matching, todayReportStateByWorkOrder);
  }, [
    myActiveWorkOrders,
    workOrderLineFilter,
    workOrderSearch,
    workOrderStatusFilter,
    workOrderSupervisorFilter,
    workOrderCategoryFilter,
    _rawEmployees,
    _rawProducts,
    componentLabelOptions,
    todayReportStateByWorkOrder,
  ]);

  useEffect(() => {
    setWorkOrdersPage(1);
  }, [
    workOrderSearch,
    workOrderSupervisorFilter,
    workOrderLineFilter,
    workOrderStatusFilter,
    workOrderCategoryFilter,
  ]);

  const kpis = useMemo(() => {
    const totalProduction = periodReports.reduce(
      (sum, r) => sum + (r.quantityProduced || 0),
      0,
    );
    const totalWaste = periodReports.reduce((sum, r) => sum + getReportWaste(r), 0);
    const wasteRatio = calculateWasteRatio(totalWaste, totalProduction + totalWaste);

    const employeeLineIds = [...new Set(periodReports.map((r) => r.lineId))];
    const visibleLineIds = [...new Set([...employeeLineIds, ...assignedLineIds])];
    const employeeProductIds = [...new Set(periodReports.map((r) => r.productId))];
    const activePlans = productionPlans.filter(
      (p) =>
        (p.status === 'in_progress' || p.status === 'planned' || p.status === 'paused')
        && (
          !p.lineId
          || visibleLineIds.includes(p.lineId)
          || employeeProductIds.includes(p.productId)
        ),
    );

    let totalPlannedQty = 0;
    let totalActualProduced = 0;
    activePlans.forEach((plan) => {
      totalPlannedQty += plan.plannedQuantity;
      const historical = resolvePlanReports(plan, planReports);
      const fromReports = historical.reduce(
        (sum, r) => sum + Number(r.quantityProduced || 0),
        0,
      );
      totalActualProduced += Math.max(Number(plan.producedQuantity || 0), fromReports);
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
    const employeeProductIds = [
      ...new Set(
        [...todayReports, ...monthlyReports]
          .filter((r) => r.employeeId === employee.id)
          .map((r) => r.productId),
      ),
    ];
    const visibleLineIds = [...new Set([...employeeLineIds, ...assignedLineIds])];

    const plan = productionPlans.find(
      (p) =>
        (p.status === 'in_progress' || p.status === 'planned' || p.status === 'paused')
        && (
          employeeProductIds.includes(p.productId)
          || (p.lineId ? visibleLineIds.includes(p.lineId) : false)
        ),
    );
    if (!plan) return null;

    const line = plan.lineId ? _rawLines.find((l) => l.id === plan.lineId) : undefined;
    const historical = resolvePlanReports(plan, planReports);
    const fromReports = historical.reduce(
      (sum, r) => sum + Number(r.quantityProduced || 0),
      0,
    );
    const globalProduced = Math.max(Number(plan.producedQuantity || 0), fromReports);
    const periodProduced = periodReports
      .filter((r) => r.productId === plan.productId)
      .reduce((sum, r) => sum + (r.quantityProduced || 0), 0);
    const globalRemaining = Math.max(plan.plannedQuantity - globalProduced, 0);
    const progress = calculatePlanProgress(globalProduced, plan.plannedQuantity);

    return {
      plan,
      productName: catalogOrComponentName(plan.productId, _rawProducts, componentLabelOptions) || '—',
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
    componentLabelOptions,
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
      meta: canCreateForAnySupervisor ? 'لكل المشرفين' : 'مسندة لك',
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

  const workOrdersPageSize = 10;
  const workOrdersTotalPages = Math.max(1, Math.ceil(filteredWorkOrders.length / workOrdersPageSize));
  const safeWorkOrdersPage = Math.min(workOrdersPage, workOrdersTotalPages);
  const workOrdersPreview = filteredWorkOrders.slice(
    (safeWorkOrdersPage - 1) * workOrdersPageSize,
    safeWorkOrdersPage * workOrdersPageSize,
  );
  const todaysEnteredReports = todayReports.filter(isMyReport);

  return (
    <DomainHomeShell
      denseHero
      eyebrow={canCreateForAnySupervisor ? 'لوحة مشرف الصالة' : 'لوحة المشرف'}
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
          {can('productionIssue.request') ? (
            <Link to={tenantPath(SUPERVISOR_PORTAL_PATHS.productionIssueRequests)}>
              <GhostButton iconName="fact_check" tone="approve">طلبات الصرف</GhostButton>
            </Link>
          ) : null}
          <Link to={tenantPath(SUPERVISOR_PORTAL_PATHS.reports)}>
            <GhostButton iconName="bar_chart" tone="view">التقارير</GhostButton>
          </Link>
        </div>
      )}
    >
      <div className="ops-module-charts__qty-row ops-module-charts__qty-row--4">
        {can('productionIssue.request') ? (
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
        ) : (
          <button
            type="button"
            className="ops-module-charts__qty text-start"
            onClick={() => navigate(SUPERVISOR_PORTAL_PATHS.teamActions)}
          >
            <p className="ops-module-charts__qty-label">طلبات الإنتاج</p>
            <p className="ops-module-charts__qty-value">→</p>
          </button>
        )}
        <button
          type="button"
          className="ops-module-charts__qty text-start"
          onClick={() => navigate('/work-orders')}
        >
          <p className="ops-module-charts__qty-label">أوامر نشطة</p>
          <p className="ops-module-charts__qty-value">
            {formatNumber(myActiveWorkOrders.length)}
          </p>
        </button>
        <button
          type="button"
          className="ops-module-charts__qty text-start"
          onClick={() => navigate(SUPERVISOR_PORTAL_PATHS.reports)}
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
        title="أوامر الشغل النشطة"
        accent="production"
        action={(
          canCreateForAnySupervisor ? (
            <span className="text-xs font-bold text-[var(--color-text-muted)]">
              {formatNumber(filteredWorkOrders.length)} أمر
            </span>
          ) : (
            <button
              type="button"
              className="ops-dash-panel__action"
              onClick={() => navigate('/work-orders')}
            >
              الكل
            </button>
          )
        )}
      >
        {canCreateForAnySupervisor ? (
          <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <input
              type="search"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-primary"
              value={workOrderSearch}
              onChange={(event) => setWorkOrderSearch(event.target.value)}
              placeholder="بحث برقم الأمر أو المنتج"
            />
            <select
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-primary"
              value={workOrderSupervisorFilter}
              onChange={(event) => setWorkOrderSupervisorFilter(event.target.value)}
            >
              <option value="all">كل المشرفين</option>
              {_rawEmployees
                .filter((row) => row.id && row.isActive !== false && myActiveWorkOrders.some((wo) => wo.supervisorId === row.id))
                .map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
            <select
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-primary"
              value={workOrderLineFilter}
              onChange={(event) => setWorkOrderLineFilter(event.target.value)}
            >
              <option value="all">كل الخطوط</option>
              {_rawLines
                .filter((row) => row.id && myActiveWorkOrders.some((wo) => wo.lineId === row.id))
                .map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
            <select
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-primary"
              value={workOrderCategoryFilter}
              onChange={(event) => setWorkOrderCategoryFilter(event.target.value)}
            >
              <option value="all">فئة المنتج</option>
              {workOrderCategoryOptions.map((row) => (
                <option key={row.value} value={row.value}>{row.label}</option>
              ))}
            </select>
            <select
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-primary"
              value={workOrderStatusFilter}
              onChange={(event) => setWorkOrderStatusFilter(event.target.value)}
            >
              <option value="all">كل الحالات</option>
              <option value="pending">{STATUS_LABELS.pending}</option>
              <option value="in_progress">{STATUS_LABELS.in_progress}</option>
              <option value="paused">{STATUS_LABELS.paused}</option>
            </select>
          </div>
        ) : null}
        {workOrdersPreview.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">
            {canCreateForAnySupervisor ? 'لا توجد أوامر مطابقة للفلاتر.' : 'لا توجد أوامر شغل نشطة مسندة إليك'}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-[var(--color-border)]">
              {workOrdersPreview.map((wo) => {
                const productName = catalogOrComponentName(wo.productId, _rawProducts, componentLabelOptions) || '—';
                const line = _rawLines.find((l) => l.id === wo.lineId);
                const reportSupervisor = _rawEmployees.find((row) => row.id === wo.supervisorId);
                const canReportForWorkOrder = Boolean(wo.supervisorId && reportSupervisor?.isActive !== false);
                const reportState = wo.id ? todayReportStateByWorkOrder.get(wo.id) : undefined;
                const produced = Math.max(
                  Number(wo.producedQuantity || 0),
                  Number(wo.actualProducedFromScans || wo.scanSummary?.completedUnits || 0),
                );
                const progress =
                  wo.quantity > 0 ? Math.min(Math.round((produced / wo.quantity) * 100), 100) : 0;
                return (
                  <li key={wo.id || wo.workOrderNumber} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-[rgb(var(--color-warning))]">
                            #{wo.workOrderNumber}
                          </span>
                          <StatusBadge label={STATUS_LABELS[wo.status] || wo.status} />
                        </div>
                        <p className="text-sm font-medium text-[var(--color-text)] truncate mt-0.5">
                          {productName}
                        </p>
                        <p className="text-[11px] text-[var(--color-text-muted)]">
                          {line?.name ?? '—'}
                          {canCreateForAnySupervisor ? ` · المشرف: ${reportSupervisor?.name || 'غير محدد'}` : ''}
                          {wo.targetDate ? ` · ${wo.targetDate}` : ''}
                          {' · '}
                          <span className="tabular-nums">{formatNumber(produced)}/{formatNumber(wo.quantity)}</span>
                          {' · '}
                          <span className="tabular-nums font-bold">{progress}%</span>
                        </p>
                        {!canReportForWorkOrder ? (
                          <p className="mt-1 text-[11px] font-bold text-[rgb(var(--color-danger))]">
                            لا يمكن إنشاء تقرير: الأمر بلا مشرف نشط.
                          </p>
                        ) : null}
                      </div>
                      {canCreateReport && wo.id && canReportForWorkOrder ? (
                        reportState?.state === 'saved' ? (
                          <GhostButton
                            type="button"
                            size="sm"
                            tone="approve"
                            iconName="check_circle"
                            className="shrink-0"
                            disabled
                          >
                            تم عمل تقرير اليوم
                          </GhostButton>
                        ) : reportState?.state === 'saving' ? (
                          <GhostButton
                            type="button"
                            size="sm"
                            tone="edit"
                            iconName="hourglass_top"
                            className="shrink-0"
                            disabled
                          >
                            جارٍ حفظ التقرير
                          </GhostButton>
                        ) : reportState?.state === 'failed' && reportState.reportId ? (
                          <PrimaryButton
                            type="button"
                            size="sm"
                            tone="undo"
                            iconName="refresh"
                            className="shrink-0"
                            onClick={() => { void retryQueuedReportCreate(reportState.reportId!); }}
                          >
                            إعادة حفظ التقرير
                          </PrimaryButton>
                        ) : (
                          <PrimaryButton
                            type="button"
                            size="sm"
                            tone="execute"
                            iconName="add_chart"
                            className="shrink-0"
                            onClick={() => setQuickReportWorkOrder(wo)}
                          >
                            إنشاء تقرير سريع
                          </PrimaryButton>
                        )
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            {canCreateForAnySupervisor ? (
              <DataPaginationFooter
                page={safeWorkOrdersPage}
                itemCount={workOrdersPreview.length}
                itemLabel="أمر"
                hasPrevious={safeWorkOrdersPage > 1}
                hasNext={safeWorkOrdersPage < workOrdersTotalPages}
                onPrevious={() => setWorkOrdersPage((value) => Math.max(1, value - 1))}
                onNext={() => setWorkOrdersPage((value) => Math.min(workOrdersTotalPages, value + 1))}
              />
            ) : null}
          </>
        )}
      </OpsDashPanel>

      {canCreateForAnySupervisor ? (
        <SupervisorDailyReportsPanel
          reports={todaysEnteredReports}
          employees={_rawEmployees}
          products={_rawProducts}
          companyName={tenantCompanyName}
          printSettings={printTemplate}
          loading={periodLoading}
        />
      ) : (
        <OpsDashPanel
          title="تقارير الإنتاج"
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
                    fill="var(--color-primary-hex)"
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
      )}

      {activePlan ? (
        <OpsDashPanel
          title="الخطة النشطة"
          accent="plans"
          action={(
            can('plans.view') ? (
              <button
                type="button"
                className="ops-dash-panel__action"
                onClick={() => navigate('/production-plans')}
              >
                الخطط
              </button>
            ) : undefined
          )}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="font-bold text-[var(--color-text)] truncate">{activePlan.productName}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{activePlan.lineName}</p>
            </div>
            <StatusBadge
              label={
                activePlan.status === 'in_progress'
                  ? 'شغال'
                  : activePlan.status === 'paused'
                    ? 'متوقف'
                    : activePlan.status === 'completed'
                      ? 'مكتمل'
                      : 'مش شغال'
              }
            />
          </div>
          <div className="flex justify-between text-sm font-bold mb-2">
            <span className="text-[var(--color-text-muted)]">التقدم</span>
            <span
              className={
                activePlan.progress >= 80
                  ? 'text-[rgb(var(--color-success))]'
                  : activePlan.progress >= 50
                    ? 'text-[rgb(var(--color-primary))]'
                    : 'text-[rgb(var(--color-warning))]'
              }
            >
              {activePlan.progress}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-[var(--color-border)]/40 rounded-full overflow-hidden mb-3">
            <div
              className={`h-full rounded-full ${
                activePlan.progress >= 80
                  ? 'bg-[rgb(var(--color-success)/0.1)]0'
                  : activePlan.progress >= 50
                    ? 'bg-[rgb(var(--color-primary)/0.1)]0'
                    : 'bg-[rgb(var(--color-warning)/0.1)]0'
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
              <p className="text-sm font-bold tabular-nums text-[rgb(var(--color-primary))]">
                {formatNumber(activePlan.periodProduced)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-[var(--color-text-muted)]">المتبقي</p>
              <p className="text-sm font-bold tabular-nums text-[rgb(var(--color-warning))]">
                {formatNumber(activePlan.globalRemaining)}
              </p>
            </div>
          </div>
        </OpsDashPanel>
      ) : null}

      <SupervisorWorkOrderQuickReportDialog
        open={Boolean(quickReportWorkOrder)}
        workOrder={quickReportWorkOrder}
        reportSupervisorEmployeeId={quickReportWorkOrder?.supervisorId || employee?.id || ''}
        supervisorName={
          quickReportWorkOrder
            ? _rawEmployees.find((row) => row.id === quickReportWorkOrder.supervisorId)?.name
            : employee?.name
        }
        productName={
          quickReportWorkOrder
            ? catalogOrComponentName(quickReportWorkOrder.productId, _rawProducts, componentLabelOptions) || undefined
            : undefined
        }
        lineName={
          quickReportWorkOrder
            ? _rawLines.find((l) => l.id === quickReportWorkOrder.lineId)?.name
            : undefined
        }
        onClose={() => setQuickReportWorkOrder(null)}
        onSaved={() => {
          void refreshDecision();
        }}
      />
    </DomainHomeShell>
  );
};
