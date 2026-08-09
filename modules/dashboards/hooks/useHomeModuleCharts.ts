import { useEffect, useMemo, useState } from 'react';
import { useAppStore, getProductionReportsRangeCacheKey } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { buildDashboardKPIs, formatNumber, getTodayDateString } from '@/utils/calculations';
import {
  buildDailyProductionCostChart,
  getCurrentMonth,
} from '@/utils/costCalculations';
import { monthlyProductionCostService } from '@/modules/costs/services/monthlyProductionCostService';
import { stockService } from '@/modules/inventory/services/stockService';
import { customerService } from '@/modules/customers/services/customerService';
import { repairJobService } from '@/modules/repair/services/repairJobService';
import { resolveRepairSettings } from '@/modules/repair/config/repairSettings';
import { summarizeRepairJobs } from '@/modules/repair/utils/repairBusinessLogic';
import { qualityRatesFromTotals } from '../lib/decisionMetrics';
import { useOperationalDecisionSnapshot } from './useOperationalDecisionSnapshot';
import type { ProductionReport } from '@/types';

export type ModuleChartSeries = Array<{ name: string; value: number }>;

export type HomeModuleChartsModel = {
  loading: boolean;
  hero: {
    todayProduction: number;
    monthlyProduction: number;
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
  hrBars: ModuleChartSeries;
  hrActiveCount: number;
  qualityBars: ModuleChartSeries;
  repairBars: ModuleChartSeries;
  customersBars: ModuleChartSeries;
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

/**
 * Aggregates real per-module series for the home charts board.
 * Each module panel is gated by the same permission keys used in the menu.
 */
export function useHomeModuleCharts(): HomeModuleChartsModel {
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

  const storeTodayReports = useAppStore((s) => s.todayReports);
  const storeMonthlyReports = useAppStore((s) => s.monthlyReports);
  const ensureProductionReportsForRange = useAppStore((s) => s.ensureProductionReportsForRange);
  const fetchAttendanceRecords = useAppStore((s) => s.fetchAttendanceRecords);
  const fetchWorkOrders = useAppStore((s) => s.fetchWorkOrders);
  const fetchEmployees = useAppStore((s) => s.fetchEmployees);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const workOrders = useAppStore((s) => s.workOrders);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const attendanceRecords = useAppStore((s) => s.attendanceRecords);
  const systemSettings = useAppStore((s) => s.systemSettings);

  const { snapshot: decision, loading: decisionLoading } = useOperationalDecisionSnapshot();

  const [todayReports, setTodayReports] = useState<ProductionReport[]>(storeTodayReports);
  const [monthlyReports, setMonthlyReports] = useState<ProductionReport[]>(storeMonthlyReports);
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

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const month = getCurrentMonth();
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
    const today = getTodayDateString();
    const maxAgeMs = 5 * 60 * 1000;
    const cache = useAppStore.getState().productionReportsRangeCache;
    const kToday = getProductionReportsRangeCacheKey(today, today);
    const kMonth = getProductionReportsRangeCacheKey(monthStart, monthEnd);
    if (cache[kToday]) setTodayReports(cache[kToday].rows);
    if (cache[kMonth]) setMonthlyReports(cache[kMonth].rows);

    const openStatusIds = resolveRepairSettings(systemSettings).workflow.openStatusIds;

    void Promise.all([
      ensureProductionReportsForRange(today, today, { maxAgeMs }),
      ensureProductionReportsForRange(monthStart, monthEnd, { maxAgeMs }),
      modules.hr
        ? fetchEmployees({ maxAgeMs }).catch(() => undefined)
        : Promise.resolve(undefined),
      modules.hr
        ? fetchAttendanceRecords(today, today).catch(() => undefined)
        : Promise.resolve(undefined),
      modules.quality
        ? fetchWorkOrders({ maxAgeMs, silent: true }).catch(() => undefined)
        : Promise.resolve(undefined),
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
        ? monthlyProductionCostService.getDashboardMonthlySummary(month).catch(() => null)
        : Promise.resolve(null),
      modules.customers
        ? customerService.listAll({ includeInactive: false, max: 500 }).catch(() => [])
        : Promise.resolve([]),
      modules.repair
        ? repairJobService.listAllBranches().catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([todayRows, monthRows, , , , inv, cost, customers, repairJobs]) => {
        if (cancelled) return;
        setTodayReports(todayRows);
        setMonthlyReports(monthRows);
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
          setRepairOpenCount(summary.open + summary.overdue);
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
        setExtraLoading(false);
      })
      .catch(() => {
        if (!cancelled) setExtraLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    ensureProductionReportsForRange,
    fetchAttendanceRecords,
    fetchEmployees,
    fetchWorkOrders,
    modules.inventory,
    modules.costs,
    modules.customers,
    modules.hr,
    modules.quality,
    modules.repair,
    systemSettings,
  ]);

  const kpis = useMemo(
    () => buildDashboardKPIs(todayReports, monthlyReports),
    [todayReports, monthlyReports],
  );

  const productionDaily = useMemo(() => {
    const month = getCurrentMonth();
    if (modules.costs && monthlyReports.length > 0) {
      const hourlyRate = laborSettings?.hourlyRate ?? 0;
      return buildDailyProductionCostChart(
        monthlyReports,
        '',
        '',
        month,
        hourlyRate,
        costCenters,
        costCenterValues,
        costAllocations,
      ).map((row) => ({
        day: String(row.day),
        production: Number(row.production || 0),
        costPerUnit: Number(row.costPerUnit || 0),
      }));
    }
    const byDay = new Map<string, number>();
    monthlyReports.forEach((r) => {
      const day = String(r.date || '').slice(8, 10);
      if (!day) return;
      byDay.set(day, (byDay.get(day) || 0) + Number(r.quantityProduced || 0));
    });
    return Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, production]) => ({ day, production, costPerUnit: 0 }));
  }, [modules.costs, monthlyReports, laborSettings, costCenters, costCenterValues, costAllocations]);

  const costSummary = useMemo<HomeModuleChartsModel['costSummary']>(() => {
    if (!modules.costs) return null;
    const approvedHasData = Boolean(
      approvedCost && (approvedCost.totalCost > 0 || approvedCost.producedQty > 0),
    );
    if (approvedHasData && approvedCost) {
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
    if (approvedCost) {
      return { ...approvedCost, source: 'approved' };
    }
    return {
      averageUnitCost: 0,
      totalCost: 0,
      producedQty: 0,
      source: 'empty',
    };
  }, [modules.costs, approvedCost, productionDaily]);

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

  const hrActiveCount = useMemo(() => {
    if (!modules.hr) return 0;
    return _rawEmployees.filter((e) => e.isActive !== false).length;
  }, [modules.hr, _rawEmployees]);

  const hrBars = useMemo<ModuleChartSeries>(() => {
    if (!modules.hr) return [];
    const today = getTodayDateString();
    const todayAtt = attendanceRecords.filter((r) => String(r.date || '') === today);
    const present = todayAtt.filter((r) => {
      const s = String(r.status || '');
      return s === 'present' || s === 'late';
    }).length;
    const absent = todayAtt.filter((r) => String(r.status || '') === 'absent').length;
    const late = todayAtt.filter((r) => String(r.status || '') === 'late').length;
    const unrecorded = Math.max(0, hrActiveCount - todayAtt.length);
    return [
      { name: 'حضور', value: present },
      { name: 'غياب', value: absent },
      { name: 'تأخير', value: late },
      { name: 'بدون سجل', value: unrecorded },
    ];
  }, [modules.hr, attendanceRecords, hrActiveCount]);

  const qualityBars = useMemo<ModuleChartSeries>(() => {
    if (!modules.quality) return [];
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
    return [
      { name: 'مفحوص', value: totals.inspected },
      { name: 'فشل %', value: rates.failRate },
      { name: 'إعادة %', value: rates.reworkRate },
      { name: 'FPY', value: rates.avgFpy },
      { name: 'بانتظار', value: pending },
    ];
  }, [modules.quality, workOrders]);

  const resolvedRepairBars = useMemo<ModuleChartSeries>(() => {
    if (!modules.repair) return [];
    if (repairBars.length > 0) return repairBars;
    // Fallback operational queues when repair jobs list is unavailable/empty-load
    return [
      { name: 'مفتوح', value: 0 },
      { name: 'جاهز', value: 0 },
      { name: 'متأخر', value: 0 },
      { name: 'اليوم', value: 0 },
      { name: 'مُسلّم', value: 0 },
    ];
  }, [modules.repair, repairBars]);

  const planAchievement = decision.planVolumeAchievement;
  const scheduleAdherence = decision.scheduleAdherence;
  const lowStockCount = modules.inventory
    ? Math.max(inventoryKpi.lowStockCount, decision.inventory.lowStockCount)
    : decision.inventory.lowStockCount;

  return {
    loading: decisionLoading || extraLoading,
    hero: {
      todayProduction: kpis.todayProduction,
      monthlyProduction: kpis.monthlyProduction,
      efficiency: kpis.efficiency,
      wasteRatio: kpis.wasteRatio,
      planAchievement,
      scheduleAdherence,
      lowStockCount,
      openRepairLike: modules.repair
        ? repairOpenCount
        : decision.transfers.pendingTotal + decision.issues.openCount + decision.behindScheduleCount,
    },
    productionDaily,
    inventoryBars,
    hrBars,
    hrActiveCount,
    qualityBars,
    repairBars: resolvedRepairBars,
    customersBars: modules.customers ? customerBars : [],
    costSummary,
    modules,
  };
}

export function formatHero(n: number): string {
  return formatNumber(n);
}
