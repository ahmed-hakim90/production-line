import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { WorkOrderPrint } from '../../production/components/ProductionReportPrint';
import type { WorkOrderPrintData } from '../../production/components/ProductionReportPrint';
import { useAppStore, useShallowStore, getProductionReportsRangeCacheKey } from '../../../store/useAppStore';
import { useManagedPrint } from '@/utils/printManager';
import { ShiftLifecyclePanel } from '../../../components/EmployeeDashboardWidget';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { DataTable, type Column } from '@/src/components/erp/DataTable';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { PrimaryButton, GhostButton } from '@/src/components/erp/ActionButton';
import { DomainHomeShell } from '@/modules/dashboards/components/DomainHomeShell';
import {
  formatNumber,
  formatCurrency,
  calculateWasteRatio,
  calculatePlanProgress,
  getReportWaste,
  getTodayDateString,
  countUniqueDays,
} from '../../../utils/calculations';
import { resolvePlanReports } from '../lib/decisionMetrics';
import { usePermission } from '../../../utils/permissions';
import type { ProductionPlan, ProductionReport, WorkOrder } from '../../../types';
import type { InventoryTransferRequest } from '../../inventory/types';
import { transferApprovalService } from '../../inventory/services/transferApprovalService';
import { supervisorLineAssignmentService } from '../../production/services/supervisorLineAssignmentService';
import { findOpenProductionShift } from '../../production/utils/productionShiftLifecycle';
import {
  emptyWorkOrderCardMetricsData,
  getWorkOrderCardMetrics,
  loadWorkOrderCardMetricsData,
  type WorkOrderCardMetricsData,
} from '../utils/workOrderCardMetrics';
import {
  deriveWorkOrderStatusFromProduced,
  lastProducingReportDateFromReports,
} from '../../production/utils/workOrderReportLinking';
import {
  catalogOrComponentName,
  loadReportsComponentLabelOptions,
  type InjectionComponentOption,
} from '../../production/utils/injectionComponentOptions';
import { useOperationalDecisionSnapshot } from '../hooks/useOperationalDecisionSnapshot';
import { SearchableSelect } from '@/components/UI';
import { useActiveRoutingPlansQuery } from '../../production/routing/hooks/routingQueries';
import {
  EMPLOYEE_PORTAL_PATHS,
  SUPERVISOR_PORTAL_PATHS,
} from '../lib/portalHome';
import {
  WORK_ORDER_OPERATION_KEYS,
  WORK_ORDER_UPDATE_PATHS,
  isOperationPathEnabled,
} from '../../system/lib/operationPathSettings';

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

// â”€â”€â”€ Period Filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'daily', label: 'يومي' },
  { value: 'yesterday', label: 'أمس' },
  { value: 'weekly', label: 'أسبوعي' },
  { value: 'monthly', label: 'شهري' },
];

// â”€â”€â”€ Employee Dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const EmployeeDashboard: React.FC = () => {
  const navigate = useTenantNavigate();
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
    costCenters,
    costCenterValues,
    costAllocations,
    laborSettings,
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
    costCenters: s.costCenters,
    costCenterValues: s.costCenterValues,
    costAllocations: s.costAllocations,
    laborSettings: s.laborSettings,
    updateWorkOrder: s.updateWorkOrder,
    loading: s.loading,
  }));

  const { can } = usePermission();
  const canPackagingControl =
    can('productionHandover.approve')
    || can('inventory.transfers.approve')
    || can('reports.packaging.create')
    || can('factoryDashboard.view')
    || can('adminDashboard.view');
  const products = useAppStore((s) => s.products);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const employeeWorkOrderUpdateEnabled = isOperationPathEnabled(
    systemSettings,
    WORK_ORDER_OPERATION_KEYS.update,
    WORK_ORDER_UPDATE_PATHS.employeeDashboard,
  );
  const transferApprovalPermission = useAppStore(
    (s) => s.systemSettings.planSettings?.transferApprovalPermission || 'inventory.transfers.approve',
  );
  const ensureProductionReportsForRange = useAppStore((s) => s.ensureProductionReportsForRange);
  const updateReport = useAppStore((s) => s.updateReport);

  const [period, setPeriod] = useState<Period>('daily');
  const [periodReports, setPeriodReports] = useState<ProductionReport[]>([]);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [pendingEntriesLoading, setPendingEntriesLoading] = useState(false);
  const [pendingProductionEntries, setPendingProductionEntries] = useState<InventoryTransferRequest[]>([]);
  const { snapshot: decisionSnapshot, loading: decisionLoading } = useOperationalDecisionSnapshot();
  const [assignedLineIds, setAssignedLineIds] = useState<Set<string>>(new Set());
  const [workOrderCardMetricsData, setWorkOrderCardMetricsData] = useState<WorkOrderCardMetricsData>(
    () => emptyWorkOrderCardMetricsData(),
  );
  const today = getTodayDateString();

  const [woPrintData, setWoPrintData] = useState<WorkOrderPrintData | null>(null);
  const [componentLabelOptions, setComponentLabelOptions] = useState<InjectionComponentOption[]>([]);
  const woPrintRef = useRef<HTMLDivElement>(null);
  const handleWoPrint = useManagedPrint({ contentRef: woPrintRef, printSettings: printTemplate });

  const routingShortcutsVisible = can('routing.view') || can('routing.execute');
  const {
    data: activeRoutingPlans = [],
    isLoading: activeRoutingPlansLoading,
    isError: activeRoutingPlansError,
    refetch: refetchActiveRoutingPlans,
  } = useActiveRoutingPlansQuery({ enabled: routingShortcutsVisible });
  const [selectedRoutingPlanId, setSelectedRoutingPlanId] = useState('');

  const routingPlanOptions = useMemo(() => {
    const productLabel = (id: string) => products.find((p) => p.id === id)?.name ?? id;
    return [...activeRoutingPlans]
      .sort((a, b) => productLabel(a.productId).localeCompare(productLabel(b.productId), 'ar'))
      .map((p) => ({
        value: p.id,
        label: `${productLabel(p.productId)} · إصدار ${p.version}`,
      }));
  }, [activeRoutingPlans, products]);

  const selectedRoutingPlan = useMemo(
    () => activeRoutingPlans.find((p) => p.id === selectedRoutingPlanId),
    [activeRoutingPlans, selectedRoutingPlanId],
  );

  const STATUS_LABELS = {
    pending: 'مش شغال',
    in_progress: 'شغال',
    paused: 'متوقف',
    completed: 'مكتمل',
    cancelled: 'ملغي',
  };
  const resolveWorkOrderProducedNow = useCallback((wo: WorkOrder): number => {
    const producedFromOrder = Number(wo.producedQuantity || 0);
    const producedFromScans = Number(wo.actualProducedFromScans || wo.scanSummary?.completedUnits || 0);
    return Math.max(producedFromOrder, producedFromScans);
  }, []);

  const triggerWOPrint = useCallback(async (wo: WorkOrder) => {
    const productName = catalogOrComponentName(wo.productId, _rawProducts, componentLabelOptions) || '—';
    const line = _rawLines.find((l) => l.id === wo.lineId);
    const supervisor = _rawEmployees.find((e) => e.id === wo.supervisorId);
    const producedNow = resolveWorkOrderProducedNow(wo);
    setWoPrintData({
      workOrderNumber: wo.workOrderNumber,
      productName,
      lineName: line?.name ?? '—',
      supervisorName: supervisor?.name ?? '—',
      quantity: wo.quantity,
      producedQuantity: producedNow,
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
  }, [_rawProducts, _rawLines, _rawEmployees, can, componentLabelOptions, handleWoPrint, resolveWorkOrderProducedNow]);

  const employee = useMemo(
    () => _rawEmployees.find((s) => s.userId === uid),
    [_rawEmployees, uid]
  );

  useEffect(() => {
    let cancelled = false;
    if (!employee?.id) {
      setAssignedLineIds(new Set());
      return;
    }

    supervisorLineAssignmentService.getActiveByDate(today)
      .then((rows) => {
        if (cancelled) return;
        setAssignedLineIds(new Set(
          rows
            .filter((row) => row.supervisorId === employee.id)
            .map((row) => row.lineId)
            .filter(Boolean),
        ));
      })
      .catch(() => {
        if (!cancelled) setAssignedLineIds(new Set());
      });

    return () => { cancelled = true; };
  }, [employee?.id, today]);

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

  const myActiveWorkOrders = useMemo(() => {
    if (!employee) return [];
    const employeeName = (employee.name || '').trim().toLowerCase();
    return workOrders.filter((wo) => {
      if (wo.status !== 'pending' && wo.status !== 'in_progress' && wo.status !== 'paused') return false;
      if (wo.supervisorId === employee.id) return true;
      return (wo.supervisorId || '').trim().toLowerCase() === employeeName;
    });
  }, [employee, workOrders]);

  useEffect(() => {
    let cancelled = false;
    if (myActiveWorkOrders.length === 0) {
      setWorkOrderCardMetricsData(emptyWorkOrderCardMetricsData());
      return;
    }
    loadWorkOrderCardMetricsData(myActiveWorkOrders)
      .then((data) => {
        if (!cancelled) setWorkOrderCardMetricsData(data);
      })
      .catch(() => {
        if (!cancelled) setWorkOrderCardMetricsData(emptyWorkOrderCardMetricsData());
      });
    return () => {
      cancelled = true;
    };
  }, [myActiveWorkOrders]);

  useEffect(() => {
    if (!employee?.id) return;

    if (period === 'daily') {
      setPeriodReports(todayReports.filter((r) => r.employeeId === employee.id));
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
        if (!cancelled) {
          if (period === 'monthly') {
            setPeriodReports(monthlyReports.filter((r) => r.employeeId === employee.id));
          }
          setPeriodLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [period, employee?.id, todayReports, monthlyReports, ensureProductionReportsForRange]);

  useEffect(() => {
    let cancelled = false;
    if (!can(transferApprovalPermission as any)) {
      setPendingProductionEntries([]);
      return;
    }
    setPendingEntriesLoading(true);
    transferApprovalService.getByStatus('pending').then((rows) => {
      if (cancelled) return;
      const pending = rows.filter((row) => (row.requestType || 'transfer') === 'production_entry');
      setPendingProductionEntries(pending);
      setPendingEntriesLoading(false);
    }).catch(() => {
      if (!cancelled) {
        setPendingProductionEntries([]);
        setPendingEntriesLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [can, transferApprovalPermission, todayReports, monthlyReports]);

  // â”€â”€ KPIs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const kpis = useMemo(() => {
    const totalProduction = periodReports.reduce(
      (sum, r) => sum + (r.quantityProduced || 0), 0
    );
    const totalWaste = periodReports.reduce(
      (sum, r) => sum + getReportWaste(r), 0
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
      const historical = resolvePlanReports(plan, planReports);
      const fromReports = historical.reduce(
        (sum, r) => sum + Number(r.quantityProduced || 0),
        0,
      );
      totalActualProduced += Math.max(Number(plan.producedQuantity || 0), fromReports);
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

  // â”€â”€ Active Plan Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    const employeeLineIds = [...new Set(
      [
        ...todayReports,
        ...monthlyReports,
      ]
        .filter((r) => r.employeeId === employee.id)
        .map((r) => r.lineId)
    )];
    const visibleLineIds = [...new Set([...employeeLineIds, ...assignedLineIds])];

    const plan = productionPlans.find(
      (p) =>
        (p.status === 'in_progress' || p.status === 'planned') &&
        visibleLineIds.includes(p.lineId)
    );

    if (!plan) return null;

    const line = _rawLines.find((l) => l.id === plan.lineId);

    const historical = resolvePlanReports(plan, planReports);
    const fromReports = historical.reduce(
      (sum, r) => sum + Number(r.quantityProduced || 0),
      0,
    );
    const globalProduced = Math.max(Number(plan.producedQuantity || 0), fromReports);

    const periodProduced = periodReports
      .filter((r) => r.productId === plan.productId && r.lineId === plan.lineId)
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
  }, [employee?.id, productionPlans, planReports, todayReports, monthlyReports, periodReports, _rawProducts, _rawLines, assignedLineIds, componentLabelOptions]);

  const assignedLines = useMemo(
    () => _rawLines.filter((line) => line.id && assignedLineIds.has(line.id)),
    [_rawLines, assignedLineIds],
  );

  const planOpenShift = useMemo(
    () => activePlan
      ? findOpenProductionShift(todayReports, {
        lineId: activePlan.plan.lineId,
        planId: activePlan.plan.id,
        productId: activePlan.plan.productId,
      })
      : null,
    [activePlan, todayReports],
  );

  const refreshTodayReports = useCallback(async () => {
    await ensureProductionReportsForRange(today, today, { force: true });
  }, [ensureProductionReportsForRange, today]);

  // â”€â”€ Personal Performance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€ Alerts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const alerts = useMemo(() => {
    const result: { type: 'warning' | 'danger'; message: string; icon: string }[] = [];

    if (activePlan && activePlan.progress < 50 && activePlan.globalRemaining > 0) {
      result.push({
        type: 'warning',
        message: `خطة متأخرة — تم إنجاز ${activePlan.progress}% فقط. المتبقي: ${formatNumber(activePlan.globalRemaining)} وحدة`,
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

  const pendingEntriesColumns: Column<InventoryTransferRequest>[] = useMemo(
    () => [
      {
        key: 'referenceNo',
        header: 'المرجع',
        cell: (row) => <span className="font-medium text-[var(--color-text)]">{row.referenceNo || '—'}</span>,
        sortable: true,
      },
      {
        key: 'topItem',
        header: 'الصنف',
        cell: (row) => row.lines[0]?.itemName || '—',
      },
      {
        key: 'qty',
        header: 'الكمية',
        align: 'center',
        cell: (row) => formatNumber(row.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)),
        sortable: true,
      },
      {
        key: 'lines',
        header: 'عدد الأصناف',
        align: 'center',
        cell: (row) => row.lines.length,
        sortable: true,
      },
    ],
    []
  );

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (loading) {
    return <PageContentSkeleton variant="dashboard" kpiCount={4} />;
  }

  const periodLabel =
    period === 'daily'
      ? 'اليوم'
      : period === 'yesterday'
        ? 'أمس'
        : period === 'weekly'
          ? 'هذا الأسبوع'
          : 'هذا الشهر';

  const employeeHero = [
    {
      key: 'prod',
      label: `إنتاج ${periodLabel}`,
      value: periodLoading ? '…' : formatNumber(kpis.totalProduction),
      meta: period !== 'daily' ? `متوسط ${formatNumber(kpis.avgPerDay)} / يوم` : `${performance.reportsCount} تقرير`,
      accent: true as const,
    },
    {
      key: 'rate',
      label: 'متوسط/ساعة',
      value: periodLoading ? '…' : formatNumber(performance.avgPerHour),
      meta: `${formatNumber(performance.totalHours)} ساعة`,
    },
    {
      key: 'plan',
      label: 'تحقيق الخطة',
      value: periodLoading ? '…' : (kpis.planAchievement > 0 ? `${kpis.planAchievement}%` : '—'),
      meta: `متبقي ${formatNumber(kpis.remaining)}`,
    },
    {
      key: 'waste',
      label: 'هالك',
      value: periodLoading ? '…' : `${kpis.wasteRatio}%`,
      meta: formatNumber(kpis.totalWaste),
    },
    {
      key: 'wo',
      label: 'أوامر نشطة',
      value: formatNumber(myActiveWorkOrders.length),
    },
    {
      key: 'issues',
      label: 'صرف مفتوح',
      value: decisionLoading ? '…' : formatNumber(decisionSnapshot.issues.openCount),
      meta: `تغليف ${formatNumber(decisionSnapshot.packaging.awaitingUnits)}`,
    },
  ];

  return (
    <DomainHomeShell
      denseHero
      eyebrow={employee?.name ? `مرحباً، ${employee.name}` : 'لوحة الموظف'}
      hero={employeeHero}
      periods={PERIOD_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
      activePeriod={period}
      onPeriodChange={(value) => setPeriod(value as Period)}
      refreshing={periodLoading}
      secondarySummary={alerts.length > 0 ? 'تنبيهات وإجراءات سريعة' : 'إجراءات وروابط سريعة'}
      secondary={(
        <>
          {alerts.length > 0 && (
            <div className="space-y-1.5 mb-3">
              {alerts.map((alert, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-3 rounded-[var(--border-radius-lg)] border text-sm font-medium ${
                    alert.type === 'danger'
                      ? 'bg-[rgb(var(--color-danger)/0.1)] dark:bg-[rgb(var(--color-danger)/0.15)] border-[rgb(var(--color-danger)/0.25)] text-[rgb(var(--color-danger))]'
                      : 'bg-[rgb(var(--color-warning)/0.1)] dark:bg-[rgb(var(--color-warning)/0.15)] border-[rgb(var(--color-warning)/0.25)] text-[rgb(var(--color-warning))]'
                  }`}
                >
                  <span className="material-icons-round text-lg">{alert.icon}</span>
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
          {can('quickAction.view') && (
            <PrimaryButton
              type="button"
              onClick={() => navigate(EMPLOYEE_PORTAL_PATHS.quickAction)}
              iconName="bolt"
              tone="execute"
            >
              الإدخال السريع
            </PrimaryButton>
          )}
          {can('productionIssue.request') && (
            <GhostButton
              type="button"
              onClick={() => navigate(SUPERVISOR_PORTAL_PATHS.productionIssueRequests)}
              iconName="assignment"
              tone="view"
            >
              طلبات صرف الإنتاج
            </GhostButton>
          )}
          {can('inventory.transactions.create') && (
            <GhostButton
              type="button"
              onClick={() => navigate('/inventory/movements')}
              iconName="warehouse"
              tone="share"
            >
              حركة المخزون
            </GhostButton>
          )}
          {(can('departmentConsumables.view') || can('departmentConsumables.create')) && (
            <GhostButton
              type="button"
              onClick={() => navigate('/inventory/department-consumables')}
              iconName="shopping_bag"
              tone="edit"
            >
              مستهلكات الأقسام
            </GhostButton>
          )}
          {can('reports.componentWaste.create') && (
            <GhostButton
              type="button"
              onClick={() => navigate('/component-waste-reports')}
              iconName="report_problem"
              tone="undo"
            >
              هالك المكونات
            </GhostButton>
          )}
          {can('lineWorkers.view') && (
            <GhostButton
              type="button"
              onClick={() => navigate('/line-workers')}
              iconName="group_work"
              tone="submit"
            >
              ربط العمالة بالخط
            </GhostButton>
          )}
          {can(transferApprovalPermission as any) && (
            <GhostButton
              type="button"
              onClick={() => navigate('/inventory/transfer-approvals')}
              iconName="verified_user"
              tone="approve"
            >
              اعتماد التحويلات
            </GhostButton>
          )}
          {(can('reports.packaging.create' as any)
            || can('productionHandover.approve' as any)
            || can('inventory.transfers.approve' as any)
            || can('factoryDashboard.view' as any)
            || can('adminDashboard.view' as any)) && (
            <GhostButton
              type="button"
              onClick={() => navigate('/production/packaging/control')}
              iconName="package_2"
              tone="share"
            >
              تحكم التغليف
            </GhostButton>
          )}
        </div>
        </>
      )}
    >

      {routingShortcutsVisible && (
        <OpsDashPanel title="مسارات الإنتاج" accent="production">
          <div className="flex flex-col gap-3">
            <p className="text-xs text-[var(--color-text-muted)]">
              ابحث عن منتج له مسار نشط، ثم اعرض الخطة أو ابدأ تنفيذ المسار.
            </p>
            {activeRoutingPlansError && (
              <div className="rounded-lg border border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.1)] dark:bg-[rgb(var(--color-danger)/0.2)] px-3 py-2 text-xs text-[rgb(var(--color-danger))] dark:text-[rgb(var(--color-danger))] flex flex-wrap items-center gap-2">
                تعذر تحميل خطط المسارات.
                <GhostButton
                  type="button"
                  className="text-xs"
                  onClick={() => void refetchActiveRoutingPlans()}
                  iconName="refresh"
                  tone="neutral"
                >
                  إعادة المحاولة
                </GhostButton>
              </div>
            )}
            {activeRoutingPlansLoading ? (
              <p className="text-sm text-[var(--color-text-muted)]">جاري تحميل الخطط النشطة…</p>
            ) : routingPlanOptions.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">لا توجد خطط مسار نشطة حالياً.</p>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-text-muted)] mb-1">
                    منتج بمسار نشط
                  </label>
                  <SearchableSelect
                    options={routingPlanOptions}
                    value={selectedRoutingPlanId}
                    onChange={setSelectedRoutingPlanId}
                    placeholder="ابحث واختر خطة…"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <PrimaryButton
                    type="button"
                    className="shrink-0"
                    disabled={!selectedRoutingPlan}
                    onClick={() => {
                      if (!selectedRoutingPlan) return;
                      navigate(
                        `/production/routing/${selectedRoutingPlan.productId}?planId=${selectedRoutingPlan.id}`,
                      );
                    }}
                    iconName="visibility"
                    tone="view"
                  >
                    عرض الخطة
                  </PrimaryButton>
                  {can('routing.execute') && (
                    <GhostButton
                      type="button"
                      className="shrink-0"
                      disabled={!selectedRoutingPlan}
                      onClick={() => {
                        if (!selectedRoutingPlan) return;
                        navigate(`/production/routing/execution/new?productId=${selectedRoutingPlan.productId}`);
                      }}
                      iconName="play_arrow"
                      tone="execute"
                    >
                      بدء تنفيذ
                    </GhostButton>
                  )}
                </div>
              </>
            )}
          </div>
        </OpsDashPanel>
      )}

      {employee?.id && (
        <OpsDashPanel title="بدء وردية عامة" accent="production">
          <ShiftLifecyclePanel
            context={{ type: 'general', label: 'بدء وردية عامة' }}
            employeeId={employee.id}
            employeeName={employee.name || ''}
            uid={uid}
            today={today}
            products={_rawProducts}
            lines={_rawLines}
            assignedLines={assignedLines}
            openShift={null}
            reports={todayReports}
            onStarted={refreshTodayReports}
            onClosed={refreshTodayReports}
            updateReport={updateReport}
          />
        </OpsDashPanel>
      )}

      {can(transferApprovalPermission as any) && pendingProductionEntries.length > 0 && (
        <OpsDashPanel
          title="طلبات اعتماد دخول تم الصنع"
          accent="inventory"
          action={(
            <GhostButton
              type="button"
              onClick={() => navigate('/inventory/transfer-approvals')}
              className="text-xs"
              iconName="fact_check"
              tone="approve"
            >
              فتح شاشة الاعتماد
            </GhostButton>
          )}
        >
          <div className="mb-2">
            <StatusBadge label={`${pendingProductionEntries.length}`} type="warning" />
          </div>
          <div className="erp-mobile-card-list p-2 md:hidden">
            {pendingEntriesLoading ? (
              <p className="py-4 text-center text-sm text-[var(--color-text-muted)]">جاري التحميل…</p>
            ) : pendingProductionEntries.slice(0, 6).length === 0 ? (
              <p className="py-4 text-center text-sm text-[var(--color-text-muted)]">لا توجد طلبات اعتماد معلقة</p>
            ) : (
              pendingProductionEntries.slice(0, 6).map((row) => (
                <div
                  key={row.id || row.referenceNo}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 shadow-sm"
                >
                  <p className="font-medium text-[var(--color-text)]">{row.referenceNo || '—'}</p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{row.lines[0]?.itemName || '—'}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs tabular-nums text-[var(--color-text-muted)]">
                    <span>الكمية {formatNumber(row.lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0))}</span>
                    <span>أصناف {row.lines.length}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="erp-desktop-table hidden overflow-x-auto md:block">
            <DataTable
              columns={pendingEntriesColumns}
              data={pendingProductionEntries.slice(0, 6)}
              isLoading={pendingEntriesLoading}
              emptyMessage="لا توجد طلبات اعتماد معلقة"
            />
          </div>
        </OpsDashPanel>
      )}

      {(can('productionIssue.request' as any) || can('inventory.view' as any) || can('productionIssue.approve' as any) || can('inventory.counts.manage' as any) || can('plans.view' as any)) &&
        (decisionSnapshot.issues.openCount > 0 ||
          decisionSnapshot.packaging.awaitingUnits > 0 ||
          decisionSnapshot.inventory.negativeCount > 0 ||
          decisionSnapshot.inventory.lowStockCount > 0 ||
          decisionSnapshot.stockCounts.openSessions > 0 ||
          decisionSnapshot.stockCounts.awaitingApproval > 0 ||
          decisionSnapshot.materials.plansWithShortage > 0 ||
          (decisionSnapshot.materials.assemblableCoveragePercent != null &&
            decisionSnapshot.materials.assemblableCoveragePercent < 90)) && (
        <OpsDashPanel title="قرارات تشغيلية اليوم" accent="production">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {decisionSnapshot.issues.openCount > 0 &&
                (can('productionIssue.request' as any)
                  || can('productionIssue.approve' as any)
                  || can('inventory.view' as any)) && (
                <button
                  type="button"
                  onClick={() => navigate(
                    can('productionIssue.approve' as any) || can('inventory.view' as any)
                      ? '/inventory/production-issues'
                      : '/production/issue-requests',
                  )}
                  className="text-right rounded-[var(--border-radius-lg)] border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)]/80 px-3.5 py-3 hover:shadow-sm"
                >
                  <p className="text-xs font-bold text-[rgb(var(--color-warning))]">صرف إنتاج معلّق</p>
                  <p className="text-xl font-black tabular-nums text-[rgb(var(--color-warning))] mt-0.5">
                    {decisionLoading ? '…' : decisionSnapshot.issues.openCount}
                  </p>
                  <p className="text-[11px] text-[rgb(var(--color-warning))]/80 mt-1">
                    تنفيذ {decisionSnapshot.issues.fulfilmentPercent}% · {formatNumber(decisionSnapshot.issues.openRequestedQty)} وحدة
                  </p>
                </button>
              )}
              {canPackagingControl
                && decisionSnapshot.packaging.awaitingUnits > 0 && (
                <button
                  type="button"
                  onClick={() => navigate('/production/packaging/control')}
                  className="text-right rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-3 hover:shadow-sm"
                >
                  <p className="text-xs font-bold text-[var(--color-text)]">بانتظار التغليف</p>
                  <p className="text-xl font-black tabular-nums text-[var(--color-text)] mt-0.5">
                    {decisionLoading ? '…' : formatNumber(decisionSnapshot.packaging.awaitingUnits)}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                    {decisionSnapshot.packaging.skuCount} صنف · تحويلات معلّقة {decisionSnapshot.packaging.pendingTransfers}
                  </p>
                </button>
              )}
              {can('inventory.view' as any) &&
                (decisionSnapshot.inventory.negativeCount > 0 || decisionSnapshot.inventory.lowStockCount > 0) && (
                <button
                  type="button"
                  onClick={() => navigate('/inventory/exceptions')}
                  className="text-right rounded-[var(--border-radius-lg)] border border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.1)]/80 px-3.5 py-3 hover:shadow-sm"
                >
                  <p className="text-xs font-bold text-[rgb(var(--color-danger))]">مخاطر المخزون</p>
                  <p className="text-xl font-black tabular-nums text-[rgb(var(--color-danger))] mt-0.5">
                    {decisionLoading
                      ? '…'
                      : decisionSnapshot.inventory.negativeCount + decisionSnapshot.inventory.lowStockCount}
                  </p>
                  <p className="text-[11px] text-[rgb(var(--color-danger))]/80 mt-1">
                    سالب {decisionSnapshot.inventory.negativeCount} · تحت الحد {decisionSnapshot.inventory.lowStockCount}
                    {decisionSnapshot.inventory.finishedDaysOfCover != null
                      ? ` · تغطية ${decisionSnapshot.inventory.finishedDaysOfCover} يوم`
                      : ''}
                  </p>
                </button>
              )}
              {can('inventory.counts.manage' as any) &&
                (decisionSnapshot.stockCounts.openSessions > 0 || decisionSnapshot.stockCounts.awaitingApproval > 0) && (
                <button
                  type="button"
                  onClick={() => navigate('/inventory/counts')}
                  className="text-right rounded-[var(--border-radius-lg)] border border-[rgb(var(--color-primary)/0.25)] bg-[rgb(var(--color-primary)/0.1)]/80 px-3.5 py-3 hover:shadow-sm"
                >
                  <p className="text-xs font-bold text-[rgb(var(--color-primary))]">الجرد والمطابقة</p>
                  <p className="text-xl font-black tabular-nums text-[rgb(var(--color-primary))] mt-0.5">
                    {decisionLoading
                      ? '…'
                      : decisionSnapshot.stockCounts.accuracyPercent != null
                        ? `${decisionSnapshot.stockCounts.accuracyPercent}%`
                        : decisionSnapshot.stockCounts.openSessions + decisionSnapshot.stockCounts.awaitingApproval}
                  </p>
                  <p className="text-[11px] text-[rgb(var(--color-primary))]/80 mt-1">
                    مفتوح {decisionSnapshot.stockCounts.openSessions} · اعتماد {decisionSnapshot.stockCounts.awaitingApproval}
                  </p>
                </button>
              )}
              {(can('productionIssue.request' as any) || can('inventory.view' as any)) &&
                (decisionSnapshot.materials.plansWithShortage > 0 ||
                  (decisionSnapshot.materials.assemblableCoveragePercent != null &&
                    decisionSnapshot.materials.assemblableCoveragePercent < 90)) && (
                <button
                  type="button"
                  onClick={() => navigate('/production/issue-requests')}
                  className="text-right rounded-[var(--border-radius-lg)] border border-[rgb(var(--color-warning)/0.25)] bg-[rgb(var(--color-warning)/0.1)]/80 px-3.5 py-3 hover:shadow-sm"
                >
                  <p className="text-xs font-bold text-[rgb(var(--color-warning))]">جاهزية المواد / التجميع</p>
                  <p className="text-xl font-black tabular-nums text-[rgb(var(--color-warning))] mt-0.5">
                    {decisionLoading
                      ? '…'
                      : decisionSnapshot.materials.assemblableCoveragePercent != null
                        ? `${decisionSnapshot.materials.assemblableCoveragePercent}%`
                        : `${decisionSnapshot.materials.readinessPercent}%`}
                  </p>
                  <p className="text-[11px] text-[rgb(var(--color-warning))]/80 mt-1">
                    {decisionSnapshot.materials.assemblableCoveragePercent != null
                      ? `تحت القدرة ${decisionSnapshot.materials.plansBelowAssemblable} · عجز ${formatNumber(decisionSnapshot.materials.assemblableShortfallQty)}`
                      : `نواقص ${decisionSnapshot.materials.plansWithShortage} خطة · ${formatNumber(decisionSnapshot.materials.totalShortageQty)} مكوّن`}
                  </p>
                </button>
              )}
            </div>
        </OpsDashPanel>
      )}

      <>
          {/* â”€â”€ Main Content — Active Plan + Work Orders â”€â”€ */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">

            {/* الملخص والخطة — RIGHT column (col 1 in RTL) */}
            {activePlan ? (
              <OpsDashPanel
                title="ملخص الخطة الحالية"
                accent="plans"
                action={(
                  <StatusBadge label={activePlan.status === 'in_progress' ? 'قيد التنفيذ' : 'مخطط'} />
                )}
              >
                <p className="text-[11px] text-[var(--color-text-muted)] mb-4">{activePlan.productName} — {activePlan.lineName ?? ''}</p>

                {/* Progress bar — prominent */}
                <div className="mb-5">
                  <div className="flex justify-between text-sm font-bold mb-2">
                    <span className="text-[var(--color-text-muted)]">التقدم الإجمالي</span>
                    <span className={activePlan.progress >= 80 ? 'text-[rgb(var(--color-success))]' : activePlan.progress >= 50 ? 'text-[rgb(var(--color-primary))]' : 'text-[rgb(var(--color-warning))]'}>
                      {activePlan.progress}%
                    </span>
                  </div>
                  <div className="w-full h-4 bg-[var(--color-surface-hover)] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-1000 ${
                        activePlan.progress >= 80 ? 'bg-[rgb(var(--color-success)/0.1)]0' : activePlan.progress >= 50 ? 'bg-[rgb(var(--color-primary)/0.1)]0' : 'bg-[rgb(var(--color-warning)/0.1)]0'
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
                    { label: `منتظژج (${periodLabel})`, value: formatNumber(activePlan.periodProduced), color: 'text-[rgb(var(--color-primary))]' },
                    { label: 'إجمالي منتظژج', value: formatNumber(activePlan.globalProduced), color: 'text-[rgb(var(--color-success))]' },
                    { label: 'المتبقي', value: formatNumber(activePlan.globalRemaining), color: 'text-[rgb(var(--color-warning))]' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-[var(--color-bg)]/60 rounded-[var(--border-radius-lg)] p-3 text-center">
                      <p className="text-[10px] font-bold text-[var(--color-text-muted)] mb-1">{stat.label}</p>
                      <p className={`text-base font-bold ${stat.color}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                {employee?.id && (
                  <ShiftLifecyclePanel
                    context={{ type: 'plan', plan: activePlan.plan, label: 'بدء وردية من هذه الخطة' }}
                    employeeId={employee.id}
                    employeeName={employee.name || ''}
                    uid={uid}
                    today={today}
                    products={_rawProducts}
                    lines={_rawLines}
                    assignedLines={assignedLines}
                    openShift={planOpenShift}
                    reports={todayReports}
                    onStarted={refreshTodayReports}
                    onClosed={refreshTodayReports}
                    updateReport={updateReport}
                  />
                )}
              </OpsDashPanel>
            ) : (
              <OpsDashPanel title="ملخص الخطة الحالية" accent="plans">
                <div className="text-center py-8 text-[var(--color-text-muted)]">
                  <span className="material-icons-round text-5xl mb-3 block opacity-20">event_note</span>
                  <p className="font-bold text-sm">لا توجد خطط إنتاج نشطة حالياً</p>
                  <p className="text-xs mt-1 opacity-70">تواصل مع مشرف الصالة لإنشاء خطة جديدة</p>
                </div>
              </OpsDashPanel>
            )}

            {/* أوامر الشغل — LEFT column */}
            {employee && can('workOrders.view') && (() => {
              const myWOs = myActiveWorkOrders;
              if (myWOs.length === 0) return null;
              return (
                <OpsDashPanel
                  title="أوامر الشغل الخاصة بك"
                  accent="production"
                  action={<StatusBadge label={`${myWOs.length}`} type="warning" />}
                  bodyClassName="p-0"
                >
                    <div className="divide-y divide-[var(--color-border)]">
                      {myWOs.map((wo) => {
                        const product = _rawProducts.find((p) => p.id === wo.productId);
                        const line = _rawLines.find((l) => l.id === wo.lineId);
                        const isSupervisor = wo.supervisorId === employee.id;
                        const producedNow = resolveWorkOrderProducedNow(wo);
                        const linkedReports = (wo.id ? workOrderCardMetricsData.reportsByWorkOrderId[wo.id] : undefined) || [];
                        const reportCount = linkedReports.length;
                        const effectiveStatus = deriveWorkOrderStatusFromProduced(
                          producedNow,
                          Number(wo.quantity || 0),
                          wo.status,
                          lastProducingReportDateFromReports(linkedReports),
                          getTodayDateString(),
                        );
                        const prog = wo.quantity > 0 ? Math.min((producedNow / wo.quantity) * 100, 100) : 0;
                        const remaining = Math.max(wo.quantity - producedNow, 0);
                        const metrics = getWorkOrderCardMetrics(wo, product, workOrderCardMetricsData, {
                          producedNowRaw: producedNow,
                          lineDailyWorkingHours: Number(line?.dailyWorkingHours || 0),
                          supervisorHourlyRate: Number(employee.hourlyRate || laborSettings?.hourlyRate || 0),
                          hourlyRate: Number(laborSettings?.hourlyRate || 0),
                          costCenters,
                          costCenterValues,
                          costAllocations,
                          reportDate: wo.targetDate,
                        });
                        const avgWorkersLabel = metrics.averageWorkers !== null
                          ? `${metrics.averageWorkers.toFixed(1)} عامل`
                          : '—';
                        return (
                          <div key={wo.id} className="px-6 py-4 space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-[rgb(var(--color-warning))]">#{wo.workOrderNumber}</span>
                                <StatusBadge label={STATUS_LABELS[effectiveStatus] || STATUS_LABELS.pending} />
                                {isSupervisor && (
                                  <span className="text-[10px] font-bold text-[rgb(var(--color-primary))] bg-[rgb(var(--color-primary)/0.1)] dark:bg-[rgb(var(--color-primary)/0.15)] px-2 py-0.5 rounded-full">مشرف</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {can('print') && (
                                  <button
                                    onClick={() => triggerWOPrint(wo)}
                                    className="p-2 rounded-[var(--border-radius-base)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-primary hover:bg-[var(--color-surface-hover)] transition-colors"
                                    title="طباعة"
                                  >
                                    <span className="material-icons-round text-base">print</span>
                                  </button>
                                )}
                                {employeeWorkOrderUpdateEnabled && isSupervisor && can('workOrders.edit') && wo.status === 'pending' && (
                                  <GhostButton
                                    onClick={() => updateWorkOrder(
                                      wo.id!,
                                      { status: 'in_progress' },
                                      { path: WORK_ORDER_UPDATE_PATHS.employeeDashboard },
                                    )}
                                    className="h-8 px-3 text-xs"
                                    iconName="play_arrow"
                                    tone="execute"
                                  >
                                    بدء
                                  </GhostButton>
                                )}
                                {employeeWorkOrderUpdateEnabled && isSupervisor && can('workOrders.edit') && wo.status === 'in_progress' && (
                                  <GhostButton
                                    onClick={() => updateWorkOrder(
                                      wo.id!,
                                      {
                                        status: 'completed',
                                        completedAt: new Date().toISOString(),
                                        actualWorkHours: wo.actualWorkHours,
                                      },
                                      { path: WORK_ORDER_UPDATE_PATHS.employeeDashboard },
                                    )}
                                    className="h-8 px-3 text-xs"
                                    iconName="check_circle"
                                    tone="approve"
                                  >
                                    اكتمل
                                  </GhostButton>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="material-icons-round text-[var(--color-text-muted)] text-base">inventory_2</span>
                              <p className="text-xs font-bold text-[var(--color-text)]">
                                {catalogOrComponentName(wo.productId, _rawProducts, componentLabelOptions) || '—'}
                              </p>
                              <span className="text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)]">آ·</span>
                              <span className="material-icons-round text-[var(--color-text-muted)] text-sm">precision_manufacturing</span>
                              <span className="text-xs font-bold text-[var(--color-text-muted)]">{line?.name ?? '—'}</span>
                            </div>

                            <div className="grid grid-cols-3 gap-3 text-center">
                              <div className="bg-[var(--color-bg)] rounded-[var(--border-radius-base)] p-2.5">
                                <p className="text-[10px] text-[var(--color-text-muted)] font-medium mb-0.5">ملاحظات</p>
                                <p className="text-sm font-bold text-[var(--color-text)]">{formatNumber(wo.quantity)}</p>
                              </div>
                              <div className="bg-[var(--color-bg)] rounded-[var(--border-radius-base)] p-2.5">
                                <p className="text-[10px] text-[var(--color-text-muted)] font-medium mb-0.5">تم إنتاجه</p>
                                <p className="text-sm font-bold text-[rgb(var(--color-success))]">{formatNumber(producedNow)}</p>
                              </div>
                              <div className="bg-[var(--color-bg)] rounded-[var(--border-radius-base)] p-2.5">
                                <p className="text-[10px] text-[var(--color-text-muted)] font-medium mb-0.5">المتبقي</p>
                                <p className="text-sm font-bold text-[rgb(var(--color-danger))]">{formatNumber(remaining)}</p>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex justify-between text-xs font-bold">
                                <span className="text-[var(--color-text-muted)]">التقدم</span>
                                <span className={prog >= 80 ? 'text-[rgb(var(--color-success))]' : prog >= 50 ? 'text-[rgb(var(--color-warning))]' : 'text-[var(--color-text-muted)]'}>{prog.toFixed(0)}%</span>
                              </div>
                              <div className="h-2 bg-[var(--color-surface-hover)] rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-1000 ${prog >= 80 ? 'bg-[rgb(var(--color-success)/0.1)]0' : prog >= 50 ? 'bg-[rgb(var(--color-warning)/0.1)]0' : 'bg-primary'}`} style={{ width: `${Math.min(prog, 100)}%` }} />
                              </div>
                            </div>

                            <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                              <div className="flex items-center gap-1">
                                <span className="material-icons-round text-sm">groups</span>
                                <span className="font-bold">متوسط العمالة: {avgWorkersLabel}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="material-icons-round text-sm">event</span>
                                <span className="font-bold">{wo.targetDate}</span>
                              </div>
                              {can('workOrders.viewCost') && (
                                <div className="flex items-center gap-2 mr-auto">
                                  <div className="flex items-center gap-1">
                                    <span className="material-icons-round text-sm text-[rgb(var(--color-success))]">payments</span>
                                    <span className="font-bold text-[rgb(var(--color-success))]">
                                      مقدرة: {metrics.estimatedUnitCost !== null ? `${formatCurrency(metrics.estimatedUnitCost)} /وحدة` : '—'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <span className="material-icons-round text-sm text-primary">calculate</span>
                                    <span className="font-bold text-primary">
                                      فعلية: {metrics.actualUnitCostToDate !== null ? `${formatCurrency(metrics.actualUnitCostToDate)} /وحدة` : '—'}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
                              <div className="flex items-center gap-1">
                                <span className="material-icons-round text-sm">calendar_month</span>
                                <span className="font-bold">
                                  أيام تشغيل (بدون الجمعة): {metrics.estimatedWorkDays !== null ? metrics.estimatedWorkDays : '—'}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="material-icons-round text-sm">schedule</span>
                                <span className="font-bold">
                                  أيام متبقية (مقدر): {metrics.remainingDaysByBenchmark !== null ? metrics.remainingDaysByBenchmark.toFixed(1) : '—'}
                                </span>
                              </div>
                              {can('workOrders.viewCost') && (
                                <div className="flex items-center gap-1">
                                  <span className="material-icons-round text-sm">payments</span>
                                  <span className="font-bold">
                                    تكلفة الأيام المقدرة: {metrics.estimatedTotalCost !== null ? formatCurrency(metrics.estimatedTotalCost) : '—'}
                                  </span>
                                </div>
                              )}
                              {can('workOrders.viewCost') && (
                                <div className="flex items-center gap-1 mr-auto">
                                  <span className="material-icons-round text-sm">request_quote</span>
                                  <span className="font-bold">
                                    تكلفة متبقية (مقدرة): {metrics.estimatedRemainingCost !== null ? formatCurrency(metrics.estimatedRemainingCost) : '—'}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                </OpsDashPanel>
              );
            })()}
          </div>
      </>

      {/* Hidden print component */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <WorkOrderPrint ref={woPrintRef} data={woPrintData} printSettings={printTemplate} />
      </div>
    </DomainHomeShell>
  );
};




