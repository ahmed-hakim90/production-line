import React, { useState, useEffect, useMemo } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { useAppStore, getProductionReportsRangeCacheKey } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { Card, Badge } from '../components/UI';
import { KPICard } from '@/src/components/erp/KPICard';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataTable, type Column } from '@/src/components/erp/DataTable';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { GhostButton } from '@/src/components/erp/ActionButton';
import { ModuleChartsHomeBoard } from '../components/ModuleChartsHomeBoard';
import { OperationalDecisionQueue } from '../components/OperationalDecisionQueue';
import { useWorkerDashboardSnapshot } from '@/modules/production/hooks/useWorkerDashboardSnapshot';
import { reportComplianceService, type ReportComplianceSnapshot } from '../services/reportComplianceService';
import {
  fetchCachedPageData,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';
import {
  calculateProgressRatio,
  calculateSmartStatus,
  calculateTimeRatio,
  calculateWasteRatio,
  calculateWorkOrderExecutionMetrics,
  formatNumber,
  getReportWaste,
  getExecutionDeviationTone,
  getTodayDateString,
} from '../../../utils/calculations';
import { effectiveStandardAssemblyMinutes } from '../../../utils/routingStandardAssembly';
import { countsTowardFinishedGoodsProduction } from '../../production/utils/packagingLine';
import { exportProductionPlanShortages } from '../../../utils/exportExcel';
import {
  formatCost,
  buildSupervisorHourlyRatesMap,
  computeLiveProductCosts,
} from '../../../utils/costCalculations';
import {
  buildManufacturingItemNameMap,
  resolveManufacturingItemName,
} from '../../../utils/manufacturingItemLabels';
import { monthlyProductionCostService, type MonthlyDashboardCostSummary } from '@/modules/costs/services/monthlyProductionCostService';
import {
  emptyWorkOrderCardMetricsData,
  getWorkOrderCardMetrics,
  loadWorkOrderCardMetricsData,
  type WorkOrderCardMetricsData,
} from '../utils/workOrderCardMetrics';
import {
  getAlertSettings,
  getKPIThreshold,
  getKPIColor,
} from '../../../utils/dashboardConfig';
import type { ProductionReport, PlanPriority, SmartStatus } from '../../../types';
import { useOperationalDecisionSnapshot } from '../hooks/useOperationalDecisionSnapshot';
import {
  averageScheduleAdherence,
  isPlanBehindSchedule,
  laborUtilizationPercent,
  outputVsIdealPercent,
  qualityRatesFromTotals,
  volumeWeightedPlanAchievement,
  yieldEfficiencyPercent,
} from '../lib/decisionMetrics';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
} from 'recharts';

type PeriodPreset = 'week' | 'month' | '3months' | 'custom';

const getPresetRange = (preset: PeriodPreset): { start: string; end: string } => {
  const now = new Date();
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const end = fmt(now);

  switch (preset) {
    case 'week': {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { start: fmt(s), end };
    }
    case 'month': {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      return { start: `${y}-${m}-01`, end };
    }
    case '3months': {
      const s = new Date(now);
      s.setMonth(s.getMonth() - 3);
      return { start: fmt(s), end };
    }
    default:
      return { start: end, end };
  }
};

const PRESET_LABELS: Record<PeriodPreset, string> = {
  week: 'هذا الأسبوع',
  month: 'هذا الشهر',
  '3months': 'آخر 3 أشهر',
  custom: 'مخصص',
};

const resolveWorkOrderProducedNow = (
  wo: {
    producedQuantity?: number;
    actualProducedFromScans?: number;
    scanSummary?: { completedUnits?: number };
  },
): number => {
  const producedFromOrder = Number(wo.producedQuantity || 0);
  const producedFromScans = Number(wo.actualProducedFromScans || wo.scanSummary?.completedUnits || 0);
  return Math.max(producedFromOrder, producedFromScans);
};

export const FactoryManagerDashboard: React.FC = () => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const canViewCosts = can('costs.view');
  const canExport = can('export');

  const _rawProducts = useAppStore((s) => s._rawProducts);
  const products = useAppStore((s) => s.products);
  const reportsUiReferenceCache = useAppStore((s) => s.reportsUiReferenceCache);
  const ensureReportsUiReferenceData = useAppStore((s) => s.ensureReportsUiReferenceData);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const productionLines = useAppStore((s) => s.productionLines);
  const workOrders = useAppStore((s) => s.workOrders);
  const productionPlans = useAppStore((s) => s.productionPlans);
  const productionPlanFollowUps = useAppStore((s) => s.productionPlanFollowUps);
  const planReports = useAppStore((s) => s.planReports);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const assets = useAppStore((s) => s.assets);
  const assetDepreciations = useAppStore((s) => s.assetDepreciations);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const routingTotalTimeSecondsByProduct = useAppStore((s) => s.routingTotalTimeSecondsByProduct);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const workerDashboard = useWorkerDashboardSnapshot();
  const ensureProductionReportsForRange = useAppStore((s) => s.ensureProductionReportsForRange);

  useEffect(() => {
    void ensureReportsUiReferenceData();
  }, [ensureReportsUiReferenceData]);

  const rawMaterialOptions = reportsUiReferenceCache?.rawMaterialOptions;
  const manufacturingNameMap = useMemo(
    () => buildManufacturingItemNameMap(_rawProducts, products, rawMaterialOptions ?? []),
    [_rawProducts, products, rawMaterialOptions],
  );

  const alertCfg = useMemo(() => getAlertSettings(systemSettings), [systemSettings]);
  const { snapshot: decisionSnapshot, loading: decisionLoading } = useOperationalDecisionSnapshot({
    planDelayDays: alertCfg.planDelayDays,
  });

  const [preset, setPreset] = useState<PeriodPreset>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthlyCostSummary, setMonthlyCostSummary] = useState<MonthlyDashboardCostSummary | null>(null);
  const [yesterdayCompliance, setYesterdayCompliance] = useState<ReportComplianceSnapshot | null>(null);
  const [yesterdayComplianceLoading, setYesterdayComplianceLoading] = useState(true);
  const [yesterdayComplianceError, setYesterdayComplianceError] = useState<string | null>(null);
  const [selectedComplianceDate, setSelectedComplianceDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [workOrderCardMetricsData, setWorkOrderCardMetricsData] = useState<WorkOrderCardMetricsData>(
    () => emptyWorkOrderCardMetricsData(),
  );

  const dateRange = useMemo(() => {
    if (preset === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return getPresetRange(preset);
  }, [preset, customStart, customEnd]);
  const fullMonthKey = useMemo(() => {
    const { start, end } = dateRange;
    if (!start || !end || start.length < 10 || end.length < 10) return null;
    const monthKey = start.slice(0, 7);
    if (end.slice(0, 7) !== monthKey) return null;
    if (start.slice(8, 10) !== '01') return null;
    const [y, m] = monthKey.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return end === `${monthKey}-${String(lastDay).padStart(2, '0')}` ? monthKey : null;
  }, [dateRange]);
  const yesterdayOperationalDate = useMemo(() => {
    const d = new Date(clockNow);
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, [clockNow]);

  useEffect(() => {
    let cancelled = false;
    const { start, end } = dateRange;
    const maxAgeMs = 5 * 60 * 1000;
    const cacheKey = getProductionReportsRangeCacheKey(start, end);
    const cached = useAppStore.getState().productionReportsRangeCache[cacheKey];
    if (cached) {
      setReports(cached.rows);
      setLoading(false);
    } else {
      setLoading(true);
    }
    ensureProductionReportsForRange(start, end, { maxAgeMs })
      .then((data) => {
        if (!cancelled) {
          setReports(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [dateRange.start, dateRange.end, ensureProductionReportsForRange]);

  useEffect(() => {
    let cancelled = false;
    if (!fullMonthKey) {
      setMonthlyCostSummary(null);
      return () => { cancelled = true; };
    }
    const cacheKey = `dashboard:factory:monthly-cost:${fullMonthKey}`;
    const cached = peekPageDataCache<MonthlyDashboardCostSummary>(cacheKey);
    if (cached) setMonthlyCostSummary(cached);
    fetchCachedPageData(
      cacheKey,
      () => monthlyProductionCostService.getDashboardMonthlySummary(fullMonthKey),
      { maxAgeMs: 60_000 },
    )
      .then(({ data: summary }) => {
        if (!cancelled) setMonthlyCostSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setMonthlyCostSummary(null);
      });
    return () => { cancelled = true; };
  }, [fullMonthKey]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeWorkOrders = useMemo(
    () => workOrders.filter((wo) => wo.status === 'pending' || wo.status === 'in_progress'),
    [workOrders],
  );

  const qualityKpis = useMemo(() => {
    const active = workOrders.filter((w) => w.status === 'pending' || w.status === 'in_progress' || w.status === 'completed');
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
    const pendingQuality = active.filter((wo) => wo.qualityStatus && wo.qualityStatus !== 'approved').length;
    return {
      inspected: totals.inspected,
      failed: totals.failed,
      rework: totals.rework,
      failRate: rates.failRate,
      reworkRate: rates.reworkRate,
      avgFpy: rates.avgFpy,
      pendingQuality,
    };
  }, [workOrders]);

  const workOrderRisk = useMemo(() => {
    let costToCompleteTotal = 0;
    let atRiskCount = 0;
    activeWorkOrders.forEach((wo) => {
      const producedNow = resolveWorkOrderProducedNow(wo);
      const remaining = Math.max(Number(wo.quantity || 0) - producedNow, 0);
      const unitCost =
        Number(wo.quantity || 0) > 0
          ? Number(wo.estimatedCost || 0) / Number(wo.quantity || 0)
          : 0;
      costToCompleteTotal += remaining * unitCost;

      const product = _rawProducts.find((p) => p.id === wo.productId);
      const daily = Math.max(0, Number(product?.avgDailyProduction || 0));
      if (daily > 0 && remaining > 0 && wo.targetDate) {
        const daysNeeded = Math.ceil(remaining / daily);
        const forecast = new Date();
        forecast.setDate(forecast.getDate() + daysNeeded);
        const target = new Date(wo.targetDate);
        if (Number.isFinite(target.getTime()) && forecast.getTime() > target.getTime()) {
          atRiskCount += 1;
        }
      }
    });
    return {
      costToComplete: Number(costToCompleteTotal.toFixed(2)),
      atRiskCount,
    };
  }, [activeWorkOrders, _rawProducts]);

  useEffect(() => {
    let cancelled = false;
    if (activeWorkOrders.length === 0) {
      setWorkOrderCardMetricsData(emptyWorkOrderCardMetricsData());
      return;
    }
    loadWorkOrderCardMetricsData(activeWorkOrders)
      .then((data) => {
        if (!cancelled) setWorkOrderCardMetricsData(data);
      })
      .catch(() => {
        if (!cancelled) setWorkOrderCardMetricsData(emptyWorkOrderCardMetricsData());
      });
    return () => {
      cancelled = true;
    };
  }, [activeWorkOrders]);

  useEffect(() => {
    let cancelled = false;
    const loadCompliance = async (force = false) => {
      const cacheKey = `dashboard:factory:compliance:${selectedComplianceDate}`;
      const cached = peekPageDataCache<ReportComplianceSnapshot>(cacheKey);
      if (cached) {
        setYesterdayCompliance(cached);
        setYesterdayComplianceLoading(false);
      } else {
        setYesterdayComplianceLoading(true);
      }
      setYesterdayComplianceError(null);
      try {
        const { data: yesterdaySnapshot } = await fetchCachedPageData(
          cacheKey,
          () => reportComplianceService.getSnapshotForDate(
            selectedComplianceDate,
            _rawEmployees,
            _rawLines,
            { scope: 'assigned_only' },
          ),
          { force, maxAgeMs: 45_000 },
        );
        if (!cancelled) {
          setYesterdayCompliance(yesterdaySnapshot);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'تعذر تحميل متابعة التزام التقارير.';
          setYesterdayComplianceError(message);
          setYesterdayCompliance(null);
        }
      } finally {
        if (!cancelled) {
          setYesterdayComplianceLoading(false);
        }
      }
    };
    void loadCompliance(false);
    const refreshTimer = window.setInterval(() => void loadCompliance(true), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [_rawEmployees, _rawLines, selectedComplianceDate]);

  const hourlyRate = laborSettings?.hourlyRate ?? 0;
  const productCategoryById = useMemo(
    () => new Map(_rawProducts.map((product) => [String(product.id || ''), String(product.model || '')])),
    [_rawProducts]
  );
  const supervisorHourlyRates = useMemo(
    () => buildSupervisorHourlyRatesMap(_rawEmployees),
    [_rawEmployees]
  );
  const payrollNetByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    _rawEmployees.forEach((employee) => {
      if (!employee.id || employee.isActive === false) return;
      map.set(String(employee.id), Number(employee.baseSalary || 0));
    });
    return map;
  }, [_rawEmployees]);
  const payrollNetByDepartment = useMemo(() => {
    const map = new Map<string, number>();
    _rawEmployees.forEach((employee) => {
      if (employee.isActive === false) return;
      const departmentId = String(employee.departmentId || '');
      if (!departmentId) return;
      map.set(departmentId, (map.get(departmentId) || 0) + Number(employee.baseSalary || 0));
    });
    return map;
  }, [_rawEmployees]);
  const liveCostComputation = useMemo(
    () => computeLiveProductCosts(
      reports,
      hourlyRate,
      costCenters,
      costCenterValues,
      costAllocations,
      {
        assets,
        assetDepreciations,
        productCategoryById,
        supervisorHourlyRates,
        payrollNetByEmployee,
        payrollNetByDepartment,
        workingDaysByMonth: systemSettings.costMonthlyWorkingDays,
      }
    ),
    [
      reports,
      hourlyRate,
      costCenters,
      costCenterValues,
      costAllocations,
      assets,
      assetDepreciations,
      productCategoryById,
      supervisorHourlyRates,
      payrollNetByEmployee,
      payrollNetByDepartment,
      systemSettings.costMonthlyWorkingDays,
    ]
  );
  const monthlyCostMode = Boolean(fullMonthKey && monthlyCostSummary);
  const productionReports = useMemo(
    () => reports.filter((r) => countsTowardFinishedGoodsProduction(r, _rawLines)),
    [reports, _rawLines],
  );

  // â”€â”€ KPI Calculations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const kpis = useMemo(() => {
    const totalProduction = productionReports.reduce((s, r) => s + (r.quantityProduced || 0), 0);
    const totalWaste = productionReports.reduce((s, r) => s + getReportWaste(r), 0);
    const wastePercent = calculateWasteRatio(totalWaste, totalProduction + totalWaste);
    const efficiency = yieldEfficiencyPercent(totalProduction, totalWaste);

    const totalLaborCost = monthlyCostMode
      ? Number(monthlyCostSummary?.totals.directCost || 0)
      : liveCostComputation.totalLaborCost;
    const totalIndirectCost = monthlyCostMode
      ? Number(monthlyCostSummary?.totals.indirectCost || 0)
      : liveCostComputation.totalIndirectCost;

    const totalCost = totalLaborCost + totalIndirectCost;
    const avgCostPerUnit = totalProduction > 0 ? totalCost / totalProduction : 0;

    const standardConfigs = lineProductConfigs;
    let standardTotalCost = 0;
    let standardTotalQty = 0;
    reports.forEach((r) => {
      const config = standardConfigs.find((c) => c.productId === r.productId && c.lineId === r.lineId);
      const stdMin = effectiveStandardAssemblyMinutes(
        r.productId,
        config?.standardAssemblyTime,
        routingTotalTimeSecondsByProduct,
      );
      if (stdMin > 0 && r.quantityProduced > 0) {
        const stdLaborPerUnit = (stdMin / 60) * hourlyRate;
        standardTotalCost += stdLaborPerUnit * r.quantityProduced;
        standardTotalQty += r.quantityProduced;
      }
    });
    const standardAvgCost = standardTotalQty > 0 ? standardTotalCost / standardTotalQty : 0;
    const costVariance = standardAvgCost > 0
      ? Number((((avgCostPerUnit - standardAvgCost) / standardAvgCost) * 100).toFixed(1))
      : 0;

    const activePlans = productionPlans.filter(
      (p) => p.status === 'in_progress' || p.status === 'completed' || p.status === 'planned',
    );
    const planActuals = activePlans.map((plan) => {
      const key = `${plan.lineId}_${plan.productId}`;
      const pReports = planReports[key] || [];
      const fromReports = pReports.reduce((s, r) => s + (r.quantityProduced || 0), 0);
      return {
        plannedQuantity: plan.plannedQuantity,
        actualQuantity: Math.max(Number(plan.producedQuantity || 0), fromReports),
        startDate: plan.plannedStartDate || plan.startDate,
        plannedEndDate: plan.plannedEndDate,
        status: plan.status,
      };
    });
    const planAchievementRate = volumeWeightedPlanAchievement(planActuals);
    const scheduleAdherence = averageScheduleAdherence(
      planActuals.filter((p) => p.status === 'in_progress' || p.status === 'planned'),
    );

    return {
      totalProduction,
      avgCostPerUnit,
      costVariance,
      wastePercent,
      efficiency,
      planAchievementRate,
      scheduleAdherence,
      totalLaborCost,
      totalIndirectCost,
    };
  }, [productionReports, liveCostComputation, hourlyRate, lineProductConfigs, routingTotalTimeSecondsByProduct, productionPlans, planReports, monthlyCostMode, monthlyCostSummary, reports]);

  const utilizationMetrics = useMemo(() => {
    const actualLaborHours = productionReports.reduce(
      (sum, report) => sum + Number(report.workersCount || 0) * Number(report.workHours || 0),
      0,
    );
    const byLineDay = new Map<string, { workers: number; lineHours: number }>();
    let idealUnits = 0;
    productionReports.forEach((report) => {
      const line = _rawLines.find((row) => row.id === report.lineId);
      const lineHours = Number(line?.dailyWorkingHours || 0);
      const key = `${report.lineId}|${report.date}`;
      const prev = byLineDay.get(key) || { workers: 0, lineHours };
      prev.workers = Math.max(prev.workers, Number(report.workersCount || 0));
      prev.lineHours = lineHours;
      byLineDay.set(key, prev);

      const product = _rawProducts.find((row) => row.id === report.productId);
      const avgDaily = Number(product?.avgDailyProduction || 0);
      const workHours = Number(report.workHours || 0);
      if (avgDaily > 0 && lineHours > 0 && workHours > 0) {
        idealUnits += avgDaily * (workHours / lineHours);
      }
    });
    const scheduledLaborHours = Array.from(byLineDay.values()).reduce(
      (sum, row) => sum + row.workers * row.lineHours,
      0,
    );
    return {
      laborUtilization: laborUtilizationPercent(actualLaborHours, scheduledLaborHours),
      performanceProxy: outputVsIdealPercent(kpis.totalProduction, idealUnits),
    };
  }, [productionReports, _rawLines, _rawProducts, kpis.totalProduction]);

  // â”€â”€ Chart 1: Production vs Cost Per Unit (daily) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const dailyChartData = useMemo(() => {
    const byDate = new Map<string, { production: number; laborCost: number }>();
    productionReports.forEach((r) => {
      const prev = byDate.get(r.date) || { production: 0, laborCost: 0 };
      prev.production += r.quantityProduced || 0;
      prev.laborCost += (r.workersCount || 0) * (r.workHours || 0) * hourlyRate;
      byDate.set(r.date, prev);
    });

    const dateIndirect = new Map<string, number>();
    reports.forEach((r) => {
      if (!r.quantityProduced || r.quantityProduced <= 0) return;
      const reportUnitCost = r.id ? Number(liveCostComputation.reportUnitCost.get(r.id) || 0) : 0;
      if (reportUnitCost <= 0) return;
      const laborCost = (r.workersCount || 0) * (r.workHours || 0) * hourlyRate;
      const indirectPart = (reportUnitCost * r.quantityProduced) - laborCost;
      if (indirectPart > 0) {
        dateIndirect.set(r.date, (dateIndirect.get(r.date) || 0) + indirectPart);
      }
    });

    return Array.from(byDate.entries())
      .map(([date, d]) => {
        const totalCost = d.laborCost + (dateIndirect.get(date) || 0);
        return {
          date: date.slice(5),
          production: d.production,
          costPerUnit: d.production > 0 ? Number((totalCost / d.production).toFixed(2)) : 0,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [productionReports, hourlyRate, liveCostComputation.reportUnitCost]);

  // â”€â”€ Chart 3: Top 5 Lines by production â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const topLines = useMemo(() => {
    const lineMap = new Map<string, number>();
    productionReports.forEach((r) => {
      lineMap.set(r.lineId, (lineMap.get(r.lineId) || 0) + (r.quantityProduced || 0));
    });
    return Array.from(lineMap.entries())
      .map(([lineId, qty]) => ({
        name: _rawLines.find((l) => l.id === lineId)?.name || lineId,
        production: qty,
      }))
      .sort((a, b) => b.production - a.production)
      .slice(0, 5);
  }, [productionReports, _rawLines]);

  // â”€â”€ Chart 4: Top 5 Products by production â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const topProducts = useMemo(() => {
    const prodMap = new Map<string, number>();
    productionReports.forEach((r) => {
      prodMap.set(r.productId, (prodMap.get(r.productId) || 0) + (r.quantityProduced || 0));
    });
    return Array.from(prodMap.entries())
      .map(([productId, qty]) => ({
        id: productId,
        name: resolveManufacturingItemName(productId, manufacturingNameMap),
        production: qty,
      }))
      .sort((a, b) => b.production - a.production)
      .slice(0, 5);
  }, [productionReports, manufacturingNameMap]);

  // â”€â”€ Alerts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const alerts = useMemo(() => {
    const result: { type: 'danger' | 'warning' | 'info'; icon: string; message: string }[] = [];

    if (kpis.costVariance > alertCfg.costVarianceThreshold) {
      result.push({
        type: 'danger',
        icon: 'trending_up',
        message: `التكلفة أعلى من المعيار بنسبة ${kpis.costVariance}% (الحد: ${alertCfg.costVarianceThreshold}%)`,
      });
    }

    const delayedPlans = productionPlans.filter((p) => {
      if (p.status !== 'in_progress' && p.status !== 'planned') return false;
      const key = `${p.lineId}_${p.productId}`;
      const pReports = planReports[key] || [];
      const fromReports = pReports.reduce((s, r) => s + (r.quantityProduced || 0), 0);
      return isPlanBehindSchedule(
        {
          plannedQuantity: p.plannedQuantity,
          actualQuantity: Math.max(Number(p.producedQuantity || 0), fromReports),
          startDate: p.plannedStartDate || p.startDate,
          plannedEndDate: p.plannedEndDate,
          status: p.status,
        },
        { minElapsedDays: alertCfg.planDelayDays, gapPercent: 20 },
      );
    });
    if (delayedPlans.length > 0) {
      result.push({
        type: 'warning',
        icon: 'schedule',
        message: `${delayedPlans.length} خطة إنتاج متأخرة عن الجدول (التزام ${kpis.scheduleAdherence}%)`,
      });
    }

    if (decisionSnapshot.issues.openCount > 0) {
      result.push({
        type: decisionSnapshot.issues.agingOver72h > 0 ? 'danger' : 'warning',
        icon: 'fact_check',
        message: `${decisionSnapshot.issues.openCount} طلب صرف إنتاج معلّق (تنفيذ ${decisionSnapshot.issues.fulfilmentPercent}%)`,
      });
    }

    if (decisionSnapshot.packaging.awaitingUnits > 0 || decisionSnapshot.transfers.pendingPackaging > 0) {
      result.push({
        type: 'warning',
        icon: 'package_2',
        message: `${formatNumber(decisionSnapshot.packaging.awaitingUnits)} وحدة بانتظار التغليف · ${decisionSnapshot.transfers.pendingPackaging} تحويل معلّق`,
      });
    }

    if (decisionSnapshot.transfers.pendingProductionEntry > 0) {
      result.push({
        type: 'info',
        icon: 'inventory_2',
        message: `${decisionSnapshot.transfers.pendingProductionEntry} اعتماد دخول إنتاج بانتظار المراجعة`,
      });
    }

    if (decisionSnapshot.inventory.negativeCount > 0) {
      result.push({
        type: 'danger',
        icon: 'report_problem',
        message: `${decisionSnapshot.inventory.negativeCount} رصيد سالب يحتاج مراجعة فورية`,
      });
    } else if (decisionSnapshot.inventory.lowStockCount > 0) {
      result.push({
        type: 'warning',
        icon: 'inventory_2',
        message: `${decisionSnapshot.inventory.lowStockCount} صنف تحت الحد الأدنى للمخزون`,
      });
    }

    if (
      decisionSnapshot.inventory.finishedDaysOfCover != null &&
      decisionSnapshot.inventory.finishedDaysOfCover < 3
    ) {
      result.push({
        type: 'warning',
        icon: 'timelapse',
        message: `تغطية تم الصنع ${decisionSnapshot.inventory.finishedDaysOfCover} يوم فقط مقابل الطلب اليومي للخطط`,
      });
    }

    if (decisionSnapshot.receipts.awaitingCount > 0) {
      result.push({
        type: decisionSnapshot.receipts.agingOver72h > 0 ? 'danger' : 'info',
        icon: 'local_shipping',
        message: `${decisionSnapshot.receipts.awaitingCount} إيصال مستلزمات بانتظار الإتمام`,
      });
    }

    if (decisionSnapshot.stockCounts.awaitingApproval > 0 || decisionSnapshot.stockCounts.openSessions > 0) {
      result.push({
        type: 'warning',
        icon: 'fact_check',
        message: `جرد: ${decisionSnapshot.stockCounts.openSessions} مفتوح · ${decisionSnapshot.stockCounts.awaitingApproval} بانتظار الاعتماد${
          decisionSnapshot.stockCounts.accuracyPercent != null
            ? ` · دقة ${decisionSnapshot.stockCounts.accuracyPercent}%`
            : ''
        }`,
      });
    }

    if (decisionSnapshot.materials.plansWithShortage > 0) {
      result.push({
        type: decisionSnapshot.materials.readinessPercent < 70 ? 'danger' : 'warning',
        icon: 'report_problem',
        message: `جاهزية المواد ${decisionSnapshot.materials.readinessPercent}% · ${decisionSnapshot.materials.plansWithShortage} خطة بنواقص مكونات`,
      });
    }

    if (
      decisionSnapshot.materials.assemblableCoveragePercent != null &&
      decisionSnapshot.materials.assemblableCoveragePercent < 90
    ) {
      result.push({
        type: decisionSnapshot.materials.assemblableCoveragePercent < 70 ? 'danger' : 'warning',
        icon: 'inventory_2',
        message: `تغطية التجميع من المخزن ${decisionSnapshot.materials.assemblableCoveragePercent}% · عجز ${formatNumber(decisionSnapshot.materials.assemblableShortfallQty)} وحدة · ${decisionSnapshot.materials.plansBelowAssemblable} خطة تحت القدرة`,
      });
    }

    if (qualityKpis.pendingQuality > 0) {
      result.push({
        type: 'warning',
        icon: 'verified',
        message: `${qualityKpis.pendingQuality} أمر شغل بانتظار اعتماد الجودة`,
      });
    }

    if (workOrderRisk.atRiskCount > 0) {
      result.push({
        type: 'danger',
        icon: 'assignment',
        message: `${workOrderRisk.atRiskCount} أمر شغل متوقع تأخره عن تاريخ الهدف`,
      });
    }

    if (kpis.wastePercent > alertCfg.wasteThreshold) {
      result.push({
        type: 'danger',
        icon: 'delete_sweep',
        message: `نسبة الهدر مرتفعة: ${kpis.wastePercent}% (الحد المقبول ${alertCfg.wasteThreshold}%)`,
      });
    } else if (kpis.wastePercent > alertCfg.wasteThreshold * 0.6) {
      result.push({
        type: 'warning',
        icon: 'warning',
        message: `نسبة الهدر تقترب من الحد: ${kpis.wastePercent}%`,
      });
    }

    if (kpis.efficiency > 0 && kpis.efficiency < alertCfg.efficiencyThreshold) {
      result.push({
        type: 'warning',
        icon: 'speed',
        message: `عائد الإنتاج أقل من الحد: ${kpis.efficiency}% (الحد: ${alertCfg.efficiencyThreshold}%)`,
      });
    }

    if (result.length === 0) {
      result.push({
        type: 'info',
        icon: 'check_circle',
        message: 'لا توجد تنبيهات — الأداء ضمن المعايير المقبولة',
      });
    }

    return result;
  }, [kpis, productionPlans, planReports, alertCfg, decisionSnapshot, qualityKpis.pendingQuality, workOrderRisk.atRiskCount]);

  const supervisorExecutionDiscipline = useMemo(() => {
    const today = getTodayDateString();
    const activeWOs = workOrders.filter((wo) => wo.status === 'pending' || wo.status === 'in_progress');
    if (activeWOs.length === 0) {
      return {
        delayedCount: 0,
        avgDeviation: null as number | null,
        worstSupervisors: [] as { supervisorId: string; name: string; deviation: number; delayed: number }[],
      };
    }

    const rows = activeWOs.map((wo) => {
      const productAvgDaily = Math.max(0, Number(_rawProducts.find((p) => p.id === wo.productId)?.avgDailyProduction || 0));
      const execution = calculateWorkOrderExecutionMetrics({
        quantity: wo.quantity,
        producedQuantity: resolveWorkOrderProducedNow(wo),
        targetDate: wo.targetDate,
        createdAt: wo.createdAt,
        today,
        benchmarkDailyRate: productAvgDaily,
      });
      const delayed = execution.forecastEndDate !== '—' && execution.forecastEndDate > wo.targetDate;
      return { wo, execution, delayed };
    });

    const weightedBase = rows.reduce((sum, r) => sum + r.execution.remainingQty, 0);
    const weightedDeviation = weightedBase > 0
      ? rows.reduce((sum, r) => sum + ((r.execution.deviationPct ?? 0) * r.execution.remainingQty), 0) / weightedBase
      : null;

    const bySupervisor = new Map<string, { weightedSum: number; weight: number; delayed: number }>();
    rows.forEach((row) => {
      const key = row.wo.supervisorId || 'unknown';
      const prev = bySupervisor.get(key) ?? { weightedSum: 0, weight: 0, delayed: 0 };
      prev.weightedSum += (row.execution.deviationPct ?? 0) * row.execution.remainingQty;
      prev.weight += row.execution.remainingQty;
      if (row.delayed) prev.delayed += 1;
      bySupervisor.set(key, prev);
    });

    const worstSupervisors = Array.from(bySupervisor.entries())
      .map(([supervisorId, agg]) => {
        const deviation = agg.weight > 0 ? Number((agg.weightedSum / agg.weight).toFixed(1)) : 0;
        const name = _rawEmployees.find((e) => e.id === supervisorId)?.name ?? 'غير معروف';
        return { supervisorId, name, deviation, delayed: agg.delayed };
      })
      .sort((a, b) => a.deviation - b.deviation)
      .slice(0, 3);

    return {
      delayedCount: rows.filter((r) => r.delayed).length,
      avgDeviation: weightedDeviation !== null ? Number(weightedDeviation.toFixed(1)) : null,
      worstSupervisors,
    };
  }, [workOrders, _rawEmployees, _rawProducts]);

  const shortageRows = useMemo(() => {
    return productionPlanFollowUps
      .slice()
      .sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime;
      })
      .map((row) => ({
        id: row.id || `${row.planId}-${row.componentId}`,
        productName: resolveManufacturingItemName(row.productId, manufacturingNameMap),
        componentName: row.componentName || '—',
        shortageQty: Number(row.shortageQty || 0),
        note: row.note || '',
      }));
  }, [productionPlanFollowUps, manufacturingNameMap]);

  const complianceRows = useMemo(
    () => [
      ...((yesterdayCompliance?.missing ?? []).map((row) => ({ ...row, submitted: false }))),
      ...((yesterdayCompliance?.submitted ?? []).map((row) => ({ ...row, submitted: true }))),
    ],
    [yesterdayCompliance]
  );

  const complianceColumns: Column<(typeof complianceRows)[number]>[] = useMemo(
    () => [
      { key: 'name', header: 'المشرف', cell: (row) => <span className="font-medium text-[#0F172A]">{row.name}</span>, sortable: true },
      { key: 'reports', header: 'التقارير', cell: (row) => `${row.submittedReports} / ${row.expectedReports}` },
      { key: 'submittedLines', header: 'تم الإرسال', cell: (row) => (row.submittedLineNames.length > 0 ? row.submittedLineNames.join('، ') : '—') },
      { key: 'missingLines', header: 'غير مرسل', cell: (row) => (row.missingLineNames.length > 0 ? row.missingLineNames.join('، ') : '—') },
      {
        key: 'status',
        header: 'الحالة',
        align: 'center',
        cell: (row) => <StatusBadge label={row.submitted ? 'تم الإرسال' : 'لم يرسل'} type={row.submitted ? 'success' : 'danger'} />,
      },
    ],
    []
  );

  const shortageColumns: Column<(typeof shortageRows)[number]>[] = useMemo(
    () => [
      { key: 'productName', header: 'المنتج', cell: (row) => <span className="font-medium text-[#0F172A]">{row.productName}</span>, sortable: true },
      { key: 'componentName', header: 'المكون', cell: (row) => row.componentName },
      { key: 'shortageQty', header: 'الكمية', align: 'center', cell: (row) => formatNumber(row.shortageQty), sortable: true },
      { key: 'note', header: 'ملاحظات', cell: (row) => row.note || '—' },
    ],
    []
  );

  // â”€â”€ Custom Tooltip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-3 text-sm">
        <p className="font-bold text-[var(--color-text-muted)] mb-1">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></span>
            <span className="text-[var(--color-text-muted)]">{entry.name}:</span>
            <span className="font-bold">{formatNumber(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  if (loading && reports.length === 0) {
    return <PageContentSkeleton variant="dashboard" kpiCount={4} />;
  }

  return (
    <div className="space-y-3 md:space-y-4">
      <ModuleChartsHomeBoard />
      <OperationalDecisionQueue
        snapshot={decisionSnapshot}
        loading={decisionLoading}
        compact
        maxItems={8}
        atRiskWorkOrders={workOrderRisk.atRiskCount}
        qualityPending={qualityKpis.pendingQuality}
      />
    </div>
  );
};
