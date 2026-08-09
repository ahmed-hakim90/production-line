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
  qualityBars: ModuleChartSeries;
  repairBars: ModuleChartSeries;
  customersBars: ModuleChartSeries;
  costSummary: {
    averageUnitCost: number;
    totalCost: number;
    producedQty: number;
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
  const laborSettings = useAppStore((s) => s.laborSettings);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const workOrders = useAppStore((s) => s.workOrders);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const attendanceRecords = useAppStore((s) => s.attendanceRecords);

  const { snapshot: decision, loading: decisionLoading } = useOperationalDecisionSnapshot();

  const [todayReports, setTodayReports] = useState<ProductionReport[]>(storeTodayReports);
  const [monthlyReports, setMonthlyReports] = useState<ProductionReport[]>(storeMonthlyReports);
  const [inventoryKpi, setInventoryKpi] = useState({ totalLines: 0, totalQty: 0, lowStockCount: 0 });
  const [costSummary, setCostSummary] = useState<HomeModuleChartsModel['costSummary']>(null);
  const [customerBars, setCustomerBars] = useState<ModuleChartSeries>([]);
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

    void Promise.all([
      ensureProductionReportsForRange(today, today, { maxAgeMs }),
      ensureProductionReportsForRange(monthStart, monthEnd, { maxAgeMs }),
      modules.inventory
        ? stockService.getInventoryKpiSummary().catch(() => ({ totalLines: 0, totalQty: 0, lowStockCount: 0, truncated: false, pagesScanned: 0 }))
        : Promise.resolve(null),
      modules.costs
        ? monthlyProductionCostService.getDashboardMonthlySummary(month).catch(() => null)
        : Promise.resolve(null),
      modules.customers
        ? customerService.listAll({ includeInactive: false, max: 500 }).catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([todayRows, monthRows, inv, cost, customers]) => {
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
        if (cost) {
          setCostSummary({
            averageUnitCost: cost.averageUnitCost,
            totalCost: cost.totalCost,
            producedQty: cost.producedQty,
          });
        }
        if (Array.isArray(customers) && customers.length > 0) {
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
          setCustomerBars([]);
        }
        setExtraLoading(false);
      })
      .catch(() => {
        if (!cancelled) setExtraLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ensureProductionReportsForRange, modules.inventory, modules.costs, modules.customers]);

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

  const inventoryBars = useMemo<ModuleChartSeries>(() => {
    if (!modules.inventory) return [];
    return [
      { name: 'أصناف', value: inventoryKpi.totalLines },
      { name: 'تحت الحد', value: inventoryKpi.lowStockCount },
      { name: 'سالب', value: decision.inventory.negativeCount },
      { name: 'تحويل معلّق', value: decision.transfers.pendingTotal },
      { name: 'صرف مفتوح', value: decision.issues.openCount },
      { name: 'إيصالات', value: decision.receipts.awaitingCount },
    ];
  }, [modules.inventory, inventoryKpi, decision]);

  const hrBars = useMemo<ModuleChartSeries>(() => {
    if (!modules.hr) return [];
    const today = getTodayDateString();
    const active = _rawEmployees.filter((e) => e.isActive !== false);
    const todayAtt = attendanceRecords.filter((r) => String(r.date || '') === today);
    const present = todayAtt.filter((r) => {
      const s = String(r.status || '');
      return s === 'present' || s === 'late';
    }).length;
    const absent = todayAtt.filter((r) => String(r.status || '') === 'absent').length;
    const late = todayAtt.filter((r) => String(r.status || '') === 'late').length;
    return [
      { name: 'نشطون', value: active.length },
      { name: 'حضور', value: present },
      { name: 'غياب', value: absent },
      { name: 'تأخير', value: late },
    ];
  }, [modules.hr, _rawEmployees, attendanceRecords]);

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

  const repairBars = useMemo<ModuleChartSeries>(() => {
    if (!modules.repair) return [];
    return [
      { name: 'تغليف معلّق', value: decision.packaging.awaitingUnits },
      { name: 'اعتمادات', value: decision.transfers.pendingTotal },
      { name: 'تموين/مخاطر', value: decision.inventory.lowStockCount + decision.inventory.negativeCount },
      { name: 'خطط متأخرة', value: decision.behindScheduleCount },
    ];
  }, [modules.repair, decision]);

  const planAchievement = decision.planVolumeAchievement;
  const scheduleAdherence = decision.scheduleAdherence;

  return {
    loading: decisionLoading || extraLoading,
    hero: {
      todayProduction: kpis.todayProduction,
      monthlyProduction: kpis.monthlyProduction,
      efficiency: kpis.efficiency,
      wasteRatio: kpis.wasteRatio,
      planAchievement,
      scheduleAdherence,
      lowStockCount: modules.inventory ? inventoryKpi.lowStockCount : decision.inventory.lowStockCount,
      openRepairLike: decision.transfers.pendingTotal + decision.issues.openCount + decision.behindScheduleCount,
    },
    productionDaily,
    inventoryBars,
    hrBars,
    qualityBars,
    repairBars,
    customersBars: customerBars,
    costSummary,
    modules,
  };
}

export function formatHero(n: number): string {
  return formatNumber(n);
}
