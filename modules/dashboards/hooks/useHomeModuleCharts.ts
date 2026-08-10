import { useEffect, useMemo, useState } from 'react';
import { useAppStore, getProductionReportsRangeCacheKey } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import {
  buildDashboardKPIs,
  formatNumber,
  getReportWaste,
  getTodayDateString,
} from '@/utils/calculations';
import {
  buildDailyProductionCostChart,
  getCurrentMonth,
} from '@/utils/costCalculations';
import { monthlyProductionCostService } from '@/modules/costs/services/monthlyProductionCostService';
import { stockService } from '@/modules/inventory/services/stockService';
import { customerService } from '@/modules/customers/services/customerService';
import { repairJobService, REPAIR_JOB_DASHBOARD_LIMIT } from '@/modules/repair/services/repairJobService';
import { resolveRepairSettings } from '@/modules/repair/config/repairSettings';
import { summarizeRepairJobs } from '@/modules/repair/utils/repairBusinessLogic';
import { qualityRatesFromTotals } from '../lib/decisionMetrics';
import { countsTowardFinishedGoodsProduction } from '@/modules/production/utils/packagingLine';
import {
  monthsOverlappingPeriod,
  type HomeChartsPeriod,
} from '../lib/homeChartsPeriod';
import { useOperationalDecisionSnapshot } from './useOperationalDecisionSnapshot';
import type { ProductionReport } from '@/types';

export type ModuleChartSeries = Array<{ name: string; value: number }>;

export type HomeModuleChartsModel = {
  loading: boolean;
  loadedAt: number | null;
  period: HomeChartsPeriod;
  hero: {
    todayProduction: number;
    periodProduction: number;
    efficiency: number;
    wasteRatio: number;
    planAchievement: number;
    scheduleAdherence: number;
    lowStockCount: number;
    openRepairLike: number;
  };
  productionDaily: Array<{
    day: string;
    production: number;
    costPerUnit: number;
  }>;
  inventoryBars: ModuleChartSeries;
  inventoryQty: {
    wip: number;
    finished: number;
    packaging: number;
  };
  hrBars: ModuleChartSeries;
  hrActiveCount: number;
  qualityBars: ModuleChartSeries;
  qualityRates: { failRate: number; reworkRate: number; avgFpy: number } | null;
  qualitySource: 'work_orders' | 'production' | 'empty';
  repairBars: ModuleChartSeries;
  customersBars: ModuleChartSeries;
  planStatusBars: ModuleChartSeries;
  planTotalCount: number;
  costSummary: {
    averageUnitCost: number;
    totalCost: number;
    producedQty: number;
    source: 'approved' | 'live' | 'empty';
  } | null;
  modules: {
    production: boolean;
    inventory: boolean;
    hr: boolean;
    costs: boolean;
    quality: boolean;
    repair: boolean;
    customers: boolean;
  };
};

const EMPTY_CUSTOMER_BARS: ModuleChartSeries = [
  { name: 'نشط', value: 0 },
  { name: 'يحتاج اتصال', value: 0 },
  { name: 'كبير', value: 0 },
  { name: 'متوسط', value: 0 },
  { name: 'صغير', value: 0 },
];

export type UseHomeModuleChartsOptions = {
  period: HomeChartsPeriod;
  refreshToken?: number;
};

/**
 * Aggregates real per-module series for the home charts board.
 * Each module panel is gated by the same permission keys used in the menu.
 */
export function useHomeModuleCharts(options: UseHomeModuleChartsOptions): HomeModuleChartsModel {
  const { period, refreshToken = 0 } = options;
  const { can } = usePermission();
  const modules = useMemo(
    () => ({
      production: can('dashboard.view') || can('factoryDashboard.view') || can('adminDashboard.view') || can('plans.view'),
      inventory: can('inventory.view'),
      hr: can('hrDashboard.view') || can('employees.view'),
      costs: can('costs.view'),
      quality: can('quality.view') || can('quality.reports.view') || can('workOrders.view') || can('factoryDashboard.view') || can('adminDashboard.view'),
      repair: can('repair.dashboard.view') || can('repair.adminDashboard.view') || can('sparePartsReplenishment.view'),
      customers: can('customers.view'),
    }),
    [can],
  );

  const ensureProductionReportsForRange = useAppStore((s) => s.ensureProductionReportsForRange);
  const fetchAttendanceRecords = useAppStore((s) => s.fetchAttendanceRecords);
  const fetchWorkOrders = useAppStore((s) => s.fetchWorkOrders);
  const fetchEmployees = useAppStore((s) => s.fetchEmployees);
  const fetchProductionPlans = useAppStore((s) => s.fetchProductionPlans);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const workOrders = useAppStore((s) => s.workOrders);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const attendanceRecords = useAppStore((s) => s.attendanceRecords);
  const productionPlans = useAppStore((s) => s.productionPlans);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const _rawLines = useAppStore((s) => s._rawLines);

  const { snapshot: decision, loading: decisionLoading } = useOperationalDecisionSnapshot();

  const [todayReports, setTodayReports] = useState<ProductionReport[]>([]);
  const [periodReports, setPeriodReports] = useState<ProductionReport[]>([]);
  const [inventoryKpi, setInventoryKpi] = useState({ totalLines: 0, totalQty: 0, lowStockCount: 0 });
  const [approvedCost, setApprovedCost] = useState<{
    averageUnitCost: number;
    totalCost: number;
    producedQty: number;
  } | null>(null);
  const [customerBars, setCustomerBars] = useState<ModuleChartSeries>(EMPTY_CUSTOMER_BARS);
  const [repairBars, setRepairBars] = useState<ModuleChartSeries>([]);
  const [repairOpenCount, setRepairOpenCount] = useState(0);
  const [extraLoading, setExtraLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const today = getTodayDateString();
    const force = refreshToken > 0;
    const maxAgeMs = force ? 0 : 5 * 60 * 1000;
    const cache = useAppStore.getState().productionReportsRangeCache;
    const kToday = getProductionReportsRangeCacheKey(today, today);
    const kPeriod = getProductionReportsRangeCacheKey(period.start, period.end);
    if (!force && cache[kToday]) setTodayReports(cache[kToday].rows);
    if (!force && cache[kPeriod]) setPeriodReports(cache[kPeriod].rows);

    setExtraLoading(true);
    const openStatusIds = resolveRepairSettings(systemSettings).workflow.openStatusIds;
    const costMonth = period.end.slice(0, 7) || getCurrentMonth();

    void Promise.all([
      ensureProductionReportsForRange(today, today, { maxAgeMs, force }),
      ensureProductionReportsForRange(period.start, period.end, { maxAgeMs, force }),
      modules.hr
        ? fetchEmployees({ maxAgeMs, force }).catch(() => undefined)
        : Promise.resolve(undefined),
      modules.hr
        ? fetchAttendanceRecords(period.start, period.end).catch(() => undefined)
        : Promise.resolve(undefined),
      modules.quality
        ? fetchWorkOrders({ maxAgeMs, silent: true, force }).catch(() => undefined)
        : Promise.resolve(undefined),
      fetchProductionPlans({ maxAgeMs, force }).catch(() => undefined),
      modules.inventory
        ? stockService.getInventoryKpiSummary().catch(() => ({
            totalLines: 0,
            totalQty: 0,
            lowStockCount: 0,
            truncated: false,
            pagesScanned: 0,
          }))
        : Promise.resolve(null),
      modules.costs
        ? monthlyProductionCostService.getDashboardMonthlySummary(costMonth).catch(() => null)
        : Promise.resolve(null),
      modules.customers
        ? customerService.listAll({ includeInactive: false, max: 500 }).catch(() => [])
        : Promise.resolve([]),
      modules.repair
        ? repairJobService.listAllBranches({ limit: REPAIR_JOB_DASHBOARD_LIMIT }).catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([todayRows, periodRows, , , , , inv, cost, customers, repairJobs]) => {
        if (cancelled) return;
        setTodayReports(todayRows);
        setPeriodReports(periodRows);
        if (inv) {
          setInventoryKpi({
            totalLines: inv.totalLines,
            totalQty: inv.totalQty,
            lowStockCount: inv.lowStockCount,
          });
        }
        if (cost?.totals) {
          setApprovedCost({
            averageUnitCost: Number(cost.totals.averageUnitCost || 0),
            totalCost: Number(cost.totals.totalCost || 0),
            producedQty: Number(cost.totals.producedQty || 0),
          });
        } else {
          setApprovedCost(null);
        }
        if (Array.isArray(customers)) {
          const active = customers.filter((c) => c.isActive !== false).length;
          const needsCall = customers.filter((c) => c.followUpStatus === 'needs_call').length;
          const large = customers.filter((c) => c.sizeTier === 'large').length;
          const medium = customers.filter((c) => c.sizeTier === 'medium').length;
          const small = customers.filter((c) => c.sizeTier === 'small').length;
          setCustomerBars([
            { name: 'نشط', value: active },
            { name: 'يحتاج اتصال', value: needsCall },
            { name: 'كبير', value: large },
            { name: 'متوسط', value: medium },
            { name: 'صغير', value: small },
          ]);
        } else {
          setCustomerBars(EMPTY_CUSTOMER_BARS);
        }
        if (Array.isArray(repairJobs)) {
          const summary = summarizeRepairJobs(repairJobs, openStatusIds);
          setRepairOpenCount(summary.open);
          setRepairBars([
            { name: 'مفتوح', value: summary.open },
            { name: 'جاهز', value: summary.ready },
            { name: 'متأخر', value: summary.overdue },
            { name: 'اليوم', value: summary.createdToday },
            { name: 'مُسلّم', value: summary.delivered },
          ]);
        } else {
          setRepairOpenCount(0);
          setRepairBars([]);
        }
        setLoadedAt(Date.now());
        setExtraLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedAt(Date.now());
          setExtraLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    ensureProductionReportsForRange,
    fetchAttendanceRecords,
    fetchEmployees,
    fetchWorkOrders,
    fetchProductionPlans,
    modules.inventory,
    modules.costs,
    modules.customers,
    modules.hr,
    modules.quality,
    modules.repair,
    period.start,
    period.end,
    refreshToken,
    systemSettings,
  ]);

  const finishedTodayReports = useMemo(
    () => todayReports.filter((r) => countsTowardFinishedGoodsProduction(r, _rawLines)),
    [todayReports, _rawLines],
  );
  const finishedPeriodReports = useMemo(
    () => periodReports.filter((r) => countsTowardFinishedGoodsProduction(r, _rawLines)),
    [periodReports, _rawLines],
  );

  const periodKpis = useMemo(
    () => buildDashboardKPIs(finishedTodayReports, finishedPeriodReports),
    [finishedTodayReports, finishedPeriodReports],
  );

  const productionDaily = useMemo(() => {
    if (finishedPeriodReports.length === 0 && periodReports.length === 0) return [];
    if (modules.costs) {
      const hourlyRate = laborSettings?.hourlyRate ?? 0;
      const months = monthsOverlappingPeriod(period.start, period.end);
      const merged = months.flatMap((month) =>
        buildDailyProductionCostChart(
          periodReports,
          '',
          '',
          month,
          hourlyRate,
          costCenters,
          costCenterValues,
          costAllocations,
        ),
      );
      const byDate = new Map<string, { production: number; costPerUnit: number; weight: number }>();
      merged.forEach((row) => {
        if (row.date < period.start || row.date > period.end) return;
        const prev = byDate.get(row.date);
        if (!prev) {
          byDate.set(row.date, {
            production: Number(row.production || 0),
            costPerUnit: Number(row.costPerUnit || 0),
            weight: Number(row.production || 0),
          });
          return;
        }
        const prod = prev.production + Number(row.production || 0);
        const weight = prev.weight + Number(row.production || 0);
        const costPerUnit = weight > 0
          ? ((prev.costPerUnit * prev.weight) + (Number(row.costPerUnit || 0) * Number(row.production || 0))) / weight
          : 0;
        byDate.set(row.date, { production: prod, costPerUnit, weight });
      });
      return Array.from(byDate.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, row]) => ({
          day: date.slice(5),
          production: row.production,
          costPerUnit: Number(row.costPerUnit.toFixed(2)),
        }));
    }
    const byDay = new Map<string, number>();
    finishedPeriodReports.forEach((r) => {
      const day = String(r.date || '');
      if (!day || day < period.start || day > period.end) return;
      byDay.set(day, (byDay.get(day) || 0) + Number(r.quantityProduced || 0));
    });
    return Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, production]) => ({ day: day.slice(5), production, costPerUnit: 0 }));
  }, [modules.costs, periodReports, finishedPeriodReports, period.start, period.end, laborSettings, costCenters, costCenterValues, costAllocations]);

  const costSummary = useMemo<HomeModuleChartsModel['costSummary']>(() => {
    if (!modules.costs) return null;
    const approvedHasData = Boolean(
      approvedCost && (approvedCost.totalCost > 0 || approvedCost.producedQty > 0),
    );
    // Approved monthly totals only match calendar-month-to-date ranges (start on day 01).
    // A week inside the month must stay on live period costs.
    const monthKey = period.start.slice(0, 7);
    const isCalendarMonthToDate =
      Boolean(monthKey)
      && period.start === `${monthKey}-01`
      && period.end.slice(0, 7) === monthKey;
    if (approvedHasData && approvedCost && isCalendarMonthToDate) {
      return { ...approvedCost, source: 'approved' };
    }
    const producedQty = productionDaily.reduce((s, d) => s + d.production, 0);
    const totalCost = productionDaily.reduce((s, d) => s + d.production * d.costPerUnit, 0);
    if (producedQty > 0 || totalCost > 0) {
      return {
        averageUnitCost: producedQty > 0 ? totalCost / producedQty : 0,
        totalCost,
        producedQty,
        source: 'live',
      };
    }
    return {
      averageUnitCost: 0,
      totalCost: 0,
      producedQty: 0,
      source: 'empty',
    };
  }, [modules.costs, approvedCost, productionDaily, period.start, period.end]);

  const inventoryBars = useMemo<ModuleChartSeries>(() => {
    if (!modules.inventory) return [];
    const lowStock = Math.max(inventoryKpi.lowStockCount, decision.inventory.lowStockCount);
    return [
      { name: 'أصناف', value: inventoryKpi.totalLines },
      { name: 'تحت الحد', value: lowStock },
      { name: 'سالب', value: decision.inventory.negativeCount },
      { name: 'تموين', value: decision.inventory.suppliesAlertCount },
      { name: 'تحويل معلّق', value: decision.transfers.pendingTotal },
      { name: 'صرف مفتوح', value: decision.issues.openCount },
      { name: 'إيصالات', value: decision.receipts.awaitingCount },
    ];
  }, [modules.inventory, inventoryKpi, decision]);

  const inventoryQty = useMemo(
    () => ({
      wip: decision.inventory.wipQty,
      finished: decision.inventory.finishedQty,
      packaging: decision.packaging.awaitingUnits,
    }),
    [decision],
  );

  const hrActiveCount = useMemo(() => {
    if (!modules.hr) return 0;
    return _rawEmployees.filter((e) => e.isActive !== false).length;
  }, [modules.hr, _rawEmployees]);

  const hrBars = useMemo<ModuleChartSeries>(() => {
    if (!modules.hr) return [];
    const inRange = attendanceRecords.filter((r) => {
      const d = String(r.date || '');
      return d >= period.start && d <= period.end;
    });
    const present = inRange.filter((r) => {
      const s = String(r.status || '');
      return s === 'present' || s === 'overtime';
    }).length;
    const absent = inRange.filter((r) => String(r.status || '') === 'absent').length;
    const late = inRange.filter((r) => {
      const s = String(r.status || '');
      return s === 'late' || s === 'present_late' || s === 'present_late_early';
    }).length;
    // Gap for the period end day only — multi-day "active × days − rows" inflates weekends/holidays.
    const focusDate = period.end;
    const focusEmployeeIds = new Set(
      inRange.filter((r) => String(r.date || '') === focusDate).map((r) => String(r.employeeId || '')),
    );
    const unrecorded = Math.max(0, hrActiveCount - focusEmployeeIds.size);
    return [
      { name: 'حضور', value: present },
      { name: 'غياب', value: absent },
      { name: 'تأخير', value: late },
      { name: 'بدون سجل', value: unrecorded },
    ];
  }, [modules.hr, attendanceRecords, hrActiveCount, period.start, period.end]);

  const { qualityBars, qualityRates, qualitySource } = useMemo(() => {
    if (!modules.quality) {
      return {
        qualityBars: [] as ModuleChartSeries,
        qualityRates: null as { failRate: number; reworkRate: number; avgFpy: number } | null,
        qualitySource: 'empty' as const,
      };
    }
    const active = workOrders.filter(
      (w) => w.status === 'pending' || w.status === 'in_progress' || w.status === 'completed',
    );
    const totals = active.reduce(
      (acc, wo) => {
        const summary = wo.qualitySummary;
        if (!summary) return acc;
        acc.inspected += summary.inspectedUnits || 0;
        acc.failed += summary.failedUnits || 0;
        acc.rework += summary.reworkUnits || 0;
        acc.fpyTotal += summary.firstPassYield || 0;
        acc.fpyCount += 1;
        return acc;
      },
      { inspected: 0, failed: 0, rework: 0, fpyTotal: 0, fpyCount: 0 },
    );
    const rates = qualityRatesFromTotals(totals);
    const pending = active.filter((wo) => wo.qualityStatus && wo.qualityStatus !== 'approved').length;
    const hasWoQuality = totals.inspected > 0 || pending > 0 || rates.avgFpy > 0;
    if (hasWoQuality) {
      return {
        // Counts only on one axis — percentages shown as meta under the chart.
        qualityBars: [
          { name: 'مفحوص', value: totals.inspected },
          { name: 'فاشل', value: totals.failed },
          { name: 'إعادة', value: totals.rework },
          { name: 'بانتظار', value: pending },
        ],
        qualityRates: {
          failRate: rates.failRate,
          reworkRate: rates.reworkRate,
          avgFpy: rates.avgFpy,
        },
        qualitySource: 'work_orders' as const,
      };
    }
    const produced = finishedPeriodReports.reduce((s, r) => s + Number(r.quantityProduced || 0), 0);
    const waste = finishedPeriodReports.reduce((s, r) => s + getReportWaste(r), 0);
    if (produced > 0 || waste > 0) {
      return {
        qualityBars: [
          { name: 'إنتاج', value: produced },
          { name: 'هالك', value: waste },
        ],
        qualityRates: null,
        qualitySource: 'production' as const,
      };
    }
    return {
      qualityBars: [
        { name: 'مفحوص', value: 0 },
        { name: 'فاشل', value: 0 },
        { name: 'إعادة', value: 0 },
        { name: 'بانتظار', value: 0 },
      ],
      qualityRates: { failRate: 0, reworkRate: 0, avgFpy: 0 },
      qualitySource: 'empty' as const,
    };
  }, [modules.quality, workOrders, finishedPeriodReports]);

  const resolvedRepairBars = useMemo<ModuleChartSeries>(() => {
    if (!modules.repair) return [];
    if (repairBars.length > 0) return repairBars;
    return [
      { name: 'مفتوح', value: 0 },
      { name: 'جاهز', value: 0 },
      { name: 'متأخر', value: 0 },
      { name: 'اليوم', value: 0 },
      { name: 'مُسلّم', value: 0 },
    ];
  }, [modules.repair, repairBars]);

  const planStatusBars = useMemo<ModuleChartSeries>(() => {
    const planned = productionPlans.filter((p) => p.status === 'planned').length;
    const inProgress = productionPlans.filter((p) => p.status === 'in_progress').length;
    const completed = productionPlans.filter((p) => p.status === 'completed').length;
    const cancelled = productionPlans.filter((p) => p.status === 'cancelled').length;
    // Status partition only — behind-schedule is a schedule KPI, not a status bucket.
    return [
      { name: 'مخطط', value: planned },
      { name: 'جاري', value: inProgress },
      { name: 'مكتمل', value: completed },
      { name: 'ملغي', value: cancelled },
    ];
  }, [productionPlans]);

  const planTotalCount = productionPlans.length;
  const planAchievement = decision.planVolumeAchievement;
  const scheduleAdherence = decision.scheduleAdherence;
  const lowStockCount = modules.inventory
    ? Math.max(inventoryKpi.lowStockCount, decision.inventory.lowStockCount)
    : decision.inventory.lowStockCount;

  const periodProduction = finishedPeriodReports.reduce((s, r) => s + Number(r.quantityProduced || 0), 0);

  return {
    loading: decisionLoading || extraLoading,
    loadedAt,
    period,
    hero: {
      todayProduction: periodKpis.todayProduction,
      periodProduction,
      efficiency: periodKpis.efficiency,
      wasteRatio: periodKpis.wasteRatio,
      planAchievement,
      scheduleAdherence,
      lowStockCount,
      openRepairLike: modules.repair
        ? repairOpenCount
        : decision.transfers.pendingTotal + decision.issues.openCount + decision.behindScheduleCount,
    },
    productionDaily,
    inventoryBars,
    inventoryQty,
    hrBars,
    hrActiveCount,
    qualityBars,
    qualityRates,
    qualitySource,
    repairBars: resolvedRepairBars,
    customersBars: modules.customers ? customerBars : [],
    planStatusBars,
    planTotalCount,
    costSummary,
    modules,
  };
}

export function formatHero(n: number): string {
  return formatNumber(n);
}
