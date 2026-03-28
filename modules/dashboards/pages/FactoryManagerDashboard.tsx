import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { Card, Badge } from '../components/UI';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { KPICard } from '@/src/components/erp/KPICard';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataTable, type Column } from '@/src/components/erp/DataTable';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { GhostButton } from '@/src/components/erp/ActionButton';
import { CustomDashboardWidgets } from '../../../components/CustomDashboardWidgets';
import { reportService } from '@/modules/production/services/reportService';
import { reportComplianceService, type ReportComplianceSnapshot } from '../services/reportComplianceService';
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
import { exportProductionPlanShortages } from '../../../utils/exportExcel';
import {
  formatCost,
  buildSupervisorHourlyRatesMap,
  computeLiveProductCosts,
} from '../../../utils/costCalculations';
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
  isWidgetVisible,
} from '../../../utils/dashboardConfig';
import type { ProductionReport, PlanPriority, SmartStatus } from '../../../types';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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
  const navigate = useNavigate();
  const { can } = usePermission();
  const canViewCosts = can('costs.view');
  const canExport = can('export');

  const _rawProducts = useAppStore((s) => s._rawProducts);
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
  const systemSettings = useAppStore((s) => s.systemSettings);

  const alertCfg = useMemo(() => getAlertSettings(systemSettings), [systemSettings]);
  const isVisible = useCallback(
    (widgetId: string) => isWidgetVisible(systemSettings, 'factoryDashboard', widgetId),
    [systemSettings]
  );

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
    setLoading(true);
    reportService.getByDateRange(dateRange.start, dateRange.end).then((data) => {
      if (!cancelled) {
        setReports(data);
        setLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [dateRange.start, dateRange.end]);

  useEffect(() => {
    let cancelled = false;
    if (!fullMonthKey) {
      setMonthlyCostSummary(null);
      return () => { cancelled = true; };
    }
    monthlyProductionCostService.getDashboardMonthlySummary(fullMonthKey)
      .then((summary) => {
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
    const loadCompliance = async () => {
      setYesterdayComplianceLoading(true);
      setYesterdayComplianceError(null);
      try {
        const yesterdaySnapshot = await reportComplianceService.getSnapshotForDate(
          selectedComplianceDate,
          _rawEmployees,
          _rawLines,
          { scope: 'assigned_only' },
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
    loadCompliance();
    const refreshTimer = window.setInterval(loadCompliance, 5 * 60 * 1000);
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

  // Shared O(1) lookup Maps — avoids O(n) .find() inside nested loops and useMemos
  const productByIdMap  = useMemo(() => new Map(_rawProducts.map((p) => [p.id ?? '', p])), [_rawProducts]);
  const lineByIdMap     = useMemo(() => new Map([..._rawLines, ...productionLines].map((l) => [l.id ?? '', l])), [_rawLines, productionLines]);
  const employeeNameMap = useMemo(() => new Map(_rawEmployees.map((e) => [e.id ?? '', e.name])), [_rawEmployees]);

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

  // ── KPI Calculations ────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalProduction = monthlyCostMode
      ? Number(monthlyCostSummary?.totals.producedQty || 0)
      : reports.reduce((s, r) => s + (r.quantityProduced || 0), 0);
    const totalWaste = reports.reduce((s, r) => s + getReportWaste(r), 0);
    const wastePercent = calculateWasteRatio(totalWaste, totalProduction + totalWaste);
    const efficiency = totalProduction + totalWaste > 0
      ? Number(((totalProduction / (totalProduction + totalWaste)) * 100).toFixed(1))
      : 0;

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
      if (config && config.standardAssemblyTime > 0 && r.quantityProduced > 0) {
        const stdLaborPerUnit = (config.standardAssemblyTime / 60) * hourlyRate;
        standardTotalCost += stdLaborPerUnit * r.quantityProduced;
        standardTotalQty += r.quantityProduced;
      }
    });
    const standardAvgCost = standardTotalQty > 0 ? standardTotalCost / standardTotalQty : 0;
    const costVariance = standardAvgCost > 0
      ? Number((((avgCostPerUnit - standardAvgCost) / standardAvgCost) * 100).toFixed(1))
      : 0;

    const activePlans = productionPlans.filter(
      (p) => p.status === 'in_progress' || p.status === 'completed'
    );
    let achievedCount = 0;
    activePlans.forEach((plan) => {
      const key = `${plan.lineId}_${plan.productId}`;
      const pReports = planReports[key] || [];
      const actual = pReports.reduce((s, r) => s + (r.quantityProduced || 0), 0);
      if (actual >= plan.plannedQuantity * 0.9) achievedCount++;
    });
    const planAchievementRate = activePlans.length > 0
      ? Number(((achievedCount / activePlans.length) * 100).toFixed(0))
      : 0;

    return {
      totalProduction,
      avgCostPerUnit,
      costVariance,
      wastePercent,
      efficiency,
      planAchievementRate,
      totalLaborCost,
      totalIndirectCost,
    };
  }, [reports, liveCostComputation, hourlyRate, lineProductConfigs, productionPlans, planReports, monthlyCostMode, monthlyCostSummary]);

  // ── Chart 1: Production vs Cost Per Unit (daily) ────────────────────────────

  const dailyChartData = useMemo(() => {
    const byDate = new Map<string, { production: number; laborCost: number }>();
    reports.forEach((r) => {
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
  }, [reports, hourlyRate, liveCostComputation.reportUnitCost]);

  // ── Chart 3: Top 5 Lines by production ──────────────────────────────────────

  const topLines = useMemo(() => {
    const lineMap = new Map<string, number>();
    reports.forEach((r) => {
      lineMap.set(r.lineId, (lineMap.get(r.lineId) || 0) + (r.quantityProduced || 0));
    });
    return Array.from(lineMap.entries())
      .map(([lineId, qty]) => ({
        name: lineByIdMap.get(lineId)?.name || lineId,
        production: qty,
      }))
      .sort((a, b) => b.production - a.production)
      .slice(0, 5);
  }, [reports, lineByIdMap]);

  // ── Chart 4: Top 5 Products by production ───────────────────────────────────

  const topProducts = useMemo(() => {
    const prodMap = new Map<string, number>();
    reports.forEach((r) => {
      prodMap.set(r.productId, (prodMap.get(r.productId) || 0) + (r.quantityProduced || 0));
    });
    return Array.from(prodMap.entries())
      .map(([productId, qty]) => ({
        id: productId,
        name: productByIdMap.get(productId)?.name || productId,
        production: qty,
      }))
      .sort((a, b) => b.production - a.production)
      .slice(0, 5);
  }, [reports, productByIdMap]);

  // ── Alerts ──────────────────────────────────────────────────────────────────

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
      const actual = pReports.reduce((s, r) => s + (r.quantityProduced || 0), 0);
      const progress = p.plannedQuantity > 0 ? (actual / p.plannedQuantity) * 100 : 0;

      const start = new Date(p.startDate);
      const now = new Date();
      const elapsed = Math.max(1, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      const expectedProgress = Math.min(100, (elapsed / Math.max(1, elapsed)) * (progress > 0 ? 50 : 30));
      return progress < expectedProgress * 0.5 && elapsed > alertCfg.planDelayDays;
    });
    if (delayedPlans.length > 0) {
      result.push({
        type: 'warning',
        icon: 'schedule',
        message: `${delayedPlans.length} خطة إنتاج متأخرة عن الجدول الزمني`,
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
        message: `الكفاءة أقل من الحد المطلوب: ${kpis.efficiency}% (الحد: ${alertCfg.efficiencyThreshold}%)`,
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
  }, [kpis, productionPlans, planReports, alertCfg]);

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
      const productAvgDaily = Math.max(0, Number(productByIdMap.get(wo.productId)?.avgDailyProduction || 0));
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
        const name = employeeNameMap.get(supervisorId) ?? 'غير معروف';
        return { supervisorId, name, deviation, delayed: agg.delayed };
      })
      .sort((a, b) => a.deviation - b.deviation)
      .slice(0, 3);

    return {
      delayedCount: rows.filter((r) => r.delayed).length,
      avgDeviation: weightedDeviation !== null ? Number(weightedDeviation.toFixed(1)) : null,
      worstSupervisors,
    };
  }, [workOrders, employeeNameMap, productByIdMap]);

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
        productName: productByIdMap.get(row.productId)?.name || '—',
        componentName: row.componentName || '—',
        shortageQty: Number(row.shortageQty || 0),
        note: row.note || '',
      }));
  }, [productionPlanFollowUps, productByIdMap]);

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
      { key: 'note', header: 'الملحوظة', cell: (row) => row.note || '—' },
    ],
    []
  );

  // ── Custom Tooltip ──────────────────────────────────────────────────────────

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-3 text-sm" dir="rtl">
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
    return (
      <div className="erp-dashboard-theme space-y-6">
        <PageHeader title="لوحة مدير المصنع" subtitle="جاري تحميل البيانات..." />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <KPICard key={`factory-loading-kpi-${idx}`} label="" value="" loading />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="erp-dashboard-theme space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <PageHeader
        title="لوحة مدير المصنع"
        subtitle="تحليلات متقدمة للإنتاج والتكاليف"
        actions={
          loading ? (
            <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1">
              <span className="material-icons-round text-sm animate-spin">sync</span>
              جاري التحديث...
            </span>
          ) : undefined
        }
      />

      <CustomDashboardWidgets dashboardKey="factoryDashboard" systemSettings={systemSettings} />

      {/* ── Period Filter ──────────────────────────────────────────────────────── */}
      <SmartFilterBar
        periods={(Object.keys(PRESET_LABELS) as PeriodPreset[]).map((key) => ({
          value: key,
          label: PRESET_LABELS[key],
        }))}
        activePeriod={preset}
        onPeriodChange={(value) => setPreset(value as PeriodPreset)}
        advancedFilters={[
          { key: 'dateFrom', label: 'من تاريخ', placeholder: '', options: [], type: 'date', width: 'w-[150px]' },
          { key: 'dateTo', label: 'إلى تاريخ', placeholder: '', options: [], type: 'date', width: 'w-[150px]' },
        ]}
        advancedFilterValues={{
          dateFrom: customStart || dateRange.start,
          dateTo: customEnd || dateRange.end,
        }}
        onAdvancedFilterChange={(key, value) => {
          if (key === 'dateFrom') {
            setCustomStart(value);
            setPreset('custom');
          }
          if (key === 'dateTo') {
            setCustomEnd(value);
            setPreset('custom');
          }
        }}
        onApply={() => undefined}
        applyLabel="عرض"
        extra={(
          <div className="inline-flex h-[34px] items-center rounded-lg border border-slate-200 px-2.5 text-xs text-slate-500">
            {monthlyCostMode ? 'مصدر التكلفة: الحساب الشهري المعتمد' : 'مصدر التكلفة: حساب لحظي (fallback)'}
          </div>
        )}
      />

      {/* ── KPI Section ────────────────────────────────────────────────────────── */}
      {isVisible('kpis') && (
      <div className="overflow-x-auto pb-2 -mx-1 px-1 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
            {Array.from({ length: canViewCosts ? 6 : 4 }).map((_, idx) => (
              <KPICard key={`factory-kpi-loading-${idx}`} label="" value="" loading />
            ))}
          </div>
        ) : (
          <div className={`flex gap-3 min-w-max sm:min-w-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 ${canViewCosts ? 'xl:grid-cols-6' : 'xl:grid-cols-4'} sm:gap-4`}>
            <KPICard label="إجمالي الإنتاج" value={formatNumber(kpis.totalProduction)} unit="وحدة" iconType="metric" color="indigo" />
            {canViewCosts && (
              <KPICard label="متوسط تكلفة الوحدة" value={formatCost(kpis.avgCostPerUnit)} unit="ج.م" iconType="money" color="amber" />
            )}
            {canViewCosts && (() => {
              const totalTrackedCost = kpis.totalLaborCost + kpis.totalIndirectCost;
              const directShare = totalTrackedCost > 0 ? ((kpis.totalLaborCost / totalTrackedCost) * 100).toFixed(1) : '0.0';
              return (
                <KPICard
                  label="التكاليف المباشرة"
                  value={formatCost(kpis.totalLaborCost)}
                  unit="ج.م"
                  iconType="money"
                  color="indigo"
                  trend={`${directShare}% من توزيع التكاليف`}
                  trendUp
                />
              );
            })()}
            {canViewCosts && (() => {
              const totalTrackedCost = kpis.totalLaborCost + kpis.totalIndirectCost;
              const indirectShare = totalTrackedCost > 0 ? ((kpis.totalIndirectCost / totalTrackedCost) * 100).toFixed(1) : '0.0';
              return (
                <KPICard
                  label="التكاليف غير المباشرة"
                  value={formatCost(kpis.totalIndirectCost)}
                  unit="ج.م"
                  iconType="money"
                  color="green"
                  trend={`${indirectShare}% من توزيع التكاليف`}
                  trendUp={false}
                />
              );
            })()}
            {(() => {
              const effColor = getKPIColor(kpis.efficiency, getKPIThreshold(systemSettings, 'efficiency'), false);
              const mappedColor = effColor === 'good' ? 'green' : effColor === 'warning' ? 'amber' : 'red';
              return (
                <KPICard
                  label="الكفاءة العامة"
                  value={`${kpis.efficiency}%`}
                  iconType="trend"
                  color={mappedColor}
                  trend={effColor === 'good' ? 'ممتاز' : effColor === 'warning' ? 'جيد' : 'يحتاج تحسين'}
                  trendUp={effColor !== 'danger'}
                />
              );
            })()}
            {(() => {
              const paColor = getKPIColor(kpis.planAchievementRate, getKPIThreshold(systemSettings, 'planAchievement'), false);
              const mappedColor = paColor === 'good' ? 'green' : paColor === 'warning' ? 'amber' : 'red';
              return (
                <KPICard
                  label="تحقيق الخطط"
                  value={`${kpis.planAchievementRate}%`}
                  iconType="trend"
                  color={mappedColor}
                />
              );
            })()}
          </div>
        )}
      </div>
      )}

      {/* ── Alerts ─────────────────────────────────────────────────────────────── */}
      {isVisible('alerts') && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-3 rounded-[var(--border-radius-lg)] border text-sm font-medium ${
                alert.type === 'danger'
                  ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 text-rose-700'
                  : alert.type === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 text-amber-700'
                  : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 text-blue-700'
              }`}
            >
              <span className="material-icons-round text-lg">{alert.icon}</span>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Active Work Orders ───────────────────────────────────────────────── */}
      {(() => {
        const activeWOs = activeWorkOrders;
        if (activeWOs.length === 0) return null;
        const totalQty = activeWOs.reduce((s, w) => s + w.quantity, 0);
        const totalProduced = activeWOs.reduce((s, w) => s + resolveWorkOrderProducedNow(w), 0);
        const overallProgress = totalQty > 0 ? Math.round((totalProduced / totalQty) * 100) : 0;

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-amber-500">assignment</span>
                <h3 className="text-base font-bold text-[var(--color-text)]">أوامر الشغل النشطة</h3>
                <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{activeWOs.length}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="font-bold">الإجمالي: {formatNumber(totalProduced)} / {formatNumber(totalQty)}</span>
                <span className={`font-medium ${overallProgress >= 80 ? 'text-emerald-600' : overallProgress >= 50 ? 'text-amber-600' : 'text-slate-500'}`}>{overallProgress}%</span>
              </div>
            </div>
            <div className="overflow-x-auto pb-2 -mx-1 px-1 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
              <div className="flex gap-3 min-w-max sm:min-w-0 sm:grid sm:grid-cols-2 xl:grid-cols-3 sm:gap-4">
                {activeWOs.map((wo) => {
                const product = productByIdMap.get(wo.productId);
                const lineName = lineByIdMap.get(wo.lineId)?.name ?? '—';
                const supervisorName = employeeNameMap.get(wo.supervisorId) ?? '—';
                const supervisorObj = _rawEmployees.find((e) => e.id === wo.supervisorId);
                const producedNow = resolveWorkOrderProducedNow(wo);
                const reportCount = (wo.id ? workOrderCardMetricsData.reportsByWorkOrderId[wo.id]?.length : 0) || 0;
                const effectiveStatus = wo.status === 'in_progress' && reportCount === 0 ? 'pending' : wo.status;
                const progress = wo.quantity > 0 ? Math.round((producedNow / wo.quantity) * 100) : 0;
                const remaining = Math.max(wo.quantity - producedNow, 0);
                const metrics = getWorkOrderCardMetrics(wo, product, workOrderCardMetricsData, {
                  producedNowRaw: producedNow,
                  lineDailyWorkingHours: Number(lineByIdMap.get(wo.lineId)?.dailyWorkingHours || 0),
                  supervisorHourlyRate: Number(supervisorObj?.hourlyRate || laborSettings?.hourlyRate || 0),
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
                  <div key={wo.id} onClick={() => navigate('/work-orders')} className={`min-w-[280px] max-w-[85vw] sm:min-w-0 sm:max-w-none rounded-[var(--border-radius-xl)] border p-5 space-y-4 transition-all cursor-pointer hover:ring-2 hover:ring-amber-200 dark:hover:ring-amber-800 ${effectiveStatus === 'in_progress' ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200/40' : 'bg-[#f8f9fa]/50 border-[var(--color-border)]'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-icons-round text-amber-500 text-lg">assignment</span>
                        <span className="text-sm font-bold text-amber-700">أمر شغل #{wo.workOrderNumber}</span>
                      </div>
                      <Badge variant={effectiveStatus === 'in_progress' ? 'warning' : 'neutral'}>
                        {effectiveStatus === 'in_progress' ? 'قيد التنفيذ' : 'في الانتظار'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-[var(--color-text-muted)] text-base">inventory_2</span>
                      <p className="text-sm font-bold text-[var(--color-text)] truncate">{product?.name ?? '—'}</p>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="material-icons-round text-indigo-400 text-base">person</span>
                        <span className="text-sm font-bold text-[var(--color-text-muted)]">{supervisorName}</span>
                      </div>
                      {canViewCosts && (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-[var(--color-card)] rounded-[var(--border-radius-base)] px-3 py-1">
                            <span className="material-icons-round text-emerald-500 text-sm">payments</span>
                            <span className="text-[10px] text-slate-400">التكلفة المقدرة</span>
                            <span className="text-sm font-bold text-emerald-600">
                              {metrics.estimatedUnitCost !== null ? formatCost(metrics.estimatedUnitCost) : '—'}
                            </span>
                            <span className="text-[10px] text-slate-400">/قطعة</span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-[var(--color-card)] rounded-[var(--border-radius-base)] px-3 py-1">
                            <span className="material-icons-round text-primary text-sm">calculate</span>
                            <span className="text-[10px] text-slate-400">التكلفة الفعلية</span>
                            <span className="text-sm font-bold text-primary">
                              {metrics.actualUnitCostToDate !== null ? formatCost(metrics.actualUnitCostToDate) : '—'}
                            </span>
                            <span className="text-[10px] text-slate-400">/قطعة</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] p-3">
                        <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">المطلوب</p>
                        <p className="text-lg font-bold text-[var(--color-text)]">{formatNumber(wo.quantity)}</p>
                      </div>
                      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] p-3">
                        <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">تم إنتاجه</p>
                        <p className="text-lg font-bold text-emerald-600">{formatNumber(producedNow)}</p>
                      </div>
                      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] p-3">
                        <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">المتبقي</p>
                        <p className="text-lg font-bold text-rose-500">{formatNumber(remaining)}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-[var(--color-text-muted)]">التقدم</span>
                        <span className={progress >= 80 ? 'text-emerald-600' : progress >= 50 ? 'text-amber-600' : 'text-slate-500'}>{progress}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-[var(--color-card)] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-primary'}`}
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 text-xs text-[var(--color-text-muted)] pt-1">
                      <div className="flex items-center gap-1">
                        <span className="material-icons-round text-sm">precision_manufacturing</span>
                        <span className="font-bold">{lineName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="material-icons-round text-sm">groups</span>
                        <span className="font-bold">متوسط العمالة: {avgWorkersLabel}</span>
                      </div>
                      <div className="flex items-center gap-1 mr-auto">
                        <span className="material-icons-round text-sm">event</span>
                        <span className="font-bold">{wo.targetDate}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--color-text-muted)]">
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
                      {canViewCosts && (
                        <div className="flex items-center gap-1">
                          <span className="material-icons-round text-sm">payments</span>
                          <span className="font-bold">
                            تكلفة الأيام المقدرة: {metrics.estimatedTotalCost !== null ? `${formatCost(metrics.estimatedTotalCost)} ج.م` : '—'}
                          </span>
                        </div>
                      )}
                      {canViewCosts && (
                        <div className="flex items-center gap-1 mr-auto">
                          <span className="material-icons-round text-sm">request_quote</span>
                          <span className="font-bold">
                            تكلفة متبقية (مقدرة): {metrics.estimatedRemainingCost !== null ? `${formatCost(metrics.estimatedRemainingCost)} ج.م` : '—'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-rose-500">fact_check</span>
            <h3 className="text-sm font-medium text-[var(--color-text)]">التزام المشرفين بالتقرير</h3>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedComplianceDate}
              max={getTodayDateString()}
              onChange={(e) => setSelectedComplianceDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-xs font-medium text-[var(--color-text)] outline-none focus:border-[#4F46E5] focus:ring-1 focus:ring-[#4F46E5]/20"
            />
            <GhostButton
              type="button"
              onClick={() => setSelectedComplianceDate(yesterdayOperationalDate)}
              className="h-8 px-2.5 text-xs"
            >
              أمس
            </GhostButton>
            <StatusBadge label={selectedComplianceDate} type="info" />
          </div>
        </div>
        {yesterdayComplianceLoading ? (
          <DataTable columns={complianceColumns} data={[]} isLoading emptyMessage="جاري تحميل الحالة..." />
        ) : yesterdayComplianceError ? (
          <p className="text-xs text-rose-600 font-medium">{yesterdayComplianceError}</p>
        ) : yesterdayCompliance?.isFactoryHoliday ? (
          <div className="erp-alert erp-alert-info">
            <span className="material-icons-round text-[18px] shrink-0">weekend</span>
            <span>{yesterdayCompliance.holidayReason || 'إجازة المصنع'}</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="rounded-[var(--border-radius-lg)] border border-slate-200 bg-[#f8f9fa] p-3">
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">إجمالي المشرفين المطلوب منهم</p>
                <p className="text-2xl font-medium text-[var(--color-text)]">{yesterdayCompliance?.assignedSupervisorsCount ?? 0}</p>
              </div>
              <div className="rounded-[var(--border-radius-lg)] border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 p-3">
                <p className="text-xs text-emerald-700 font-bold mb-1">تم ارسال تقرير</p>
                <p className="text-2xl font-medium text-emerald-600">{yesterdayCompliance?.submittedCount ?? 0}</p>
              </div>
              <div className="rounded-[var(--border-radius-lg)] border border-rose-200 bg-rose-50 dark:bg-rose-900/10 p-3">
                <p className="text-xs text-rose-700 font-bold mb-1">لم يرسل تقرير</p>
                <p className="text-2xl font-medium text-rose-600">{yesterdayCompliance?.missingCount ?? 0}</p>
              </div>
            </div>
            {(yesterdayCompliance?.assignedSupervisorsCount ?? 0) === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">لا يوجد مشرفون مكلّفون في هذا التاريخ.</p>
            ) : (
              <div className="space-y-2">
                <div className="md:hidden space-y-2">
                  {[
                    ...((yesterdayCompliance?.missing ?? []).map((row) => ({ ...row, submitted: false }))),
                    ...((yesterdayCompliance?.submitted ?? []).map((row) => ({ ...row, submitted: true }))),
                  ].map((row) => (
                    <div key={row.employeeId} className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold text-[var(--color-text)] leading-snug">{row.name}</p>
                        <Badge variant={row.submitted ? 'success' : 'danger'}>
                          {row.submitted ? 'تم ارسال' : 'لم يرسل'}
                        </Badge>
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)]">
                        <span className="font-bold">التقارير: </span>
                        <span>{row.submittedReports} / {row.expectedReports}</span>
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)]">
                        <span className="font-bold">تم الإرسال: </span>
                        <span>{row.submittedLineNames.length > 0 ? row.submittedLineNames.join('، ') : '—'}</span>
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)]">
                        <span className="font-bold">غير مرسل: </span>
                        <span>{row.missingLineNames.length > 0 ? row.missingLineNames.join('، ') : '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block">
                  <DataTable
                    columns={complianceColumns}
                    data={complianceRows}
                    emptyMessage="لا يوجد مشرفون مكلّفون في هذا التاريخ."
                  />
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── Active Production Plans ──────────────────────────────────────────── */}
      {(() => {
        const activePlans = productionPlans.filter((p) => p.status === 'in_progress' || p.status === 'planned');
        if (activePlans.length === 0) return null;

        const priorityCfg: Record<PlanPriority, { label: string; color: string; bg: string }> = {
          low: { label: 'منخفضة', color: 'text-slate-500', bg: 'bg-[#f0f2f5]' },
          medium: { label: 'متوسطة', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          high: { label: 'عالية', color: 'text-amber-600', bg: 'bg-amber-50' },
          urgent: { label: 'عاجلة', color: 'text-rose-600', bg: 'bg-rose-50' },
        };
        const smartCfg: Record<SmartStatus, { label: string; color: string }> = {
          on_track: { label: 'في المسار', color: 'text-emerald-600' },
          at_risk: { label: 'معرض للخطر', color: 'text-amber-600' },
          delayed: { label: 'متأخر', color: 'text-orange-600' },
          critical: { label: 'حرج', color: 'text-rose-600' },
          completed: { label: 'مكتمل', color: 'text-emerald-600' },
        };

        const totalPlanned = activePlans.reduce((s, p) => s + p.plannedQuantity, 0);
        const totalProduced = activePlans.reduce((s, p) => s + (p.producedQuantity ?? 0), 0);
        const overallProgress = totalPlanned > 0 ? Math.round((totalProduced / totalPlanned) * 100) : 0;

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-indigo-500">event_note</span>
                <h3 className="text-base font-bold text-[var(--color-text)]">خطط الإنتاج النشطة</h3>
                <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-bold px-2 py-0.5 rounded-full">{activePlans.length}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="font-bold">الإجمالي: {formatNumber(totalProduced)} / {formatNumber(totalPlanned)}</span>
                <span className={`font-medium ${overallProgress >= 80 ? 'text-emerald-600' : overallProgress >= 50 ? 'text-amber-600' : 'text-slate-500'}`}>{overallProgress}%</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {activePlans.map((plan) => {
                const product = _rawProducts.find((p) => p.id === plan.productId);
                const line = _rawLines.find((l) => l.id === plan.lineId);
                const produced = plan.producedQuantity ?? 0;
                const remaining = Math.max(plan.plannedQuantity - produced, 0);
                const progressRatio = calculateProgressRatio(produced, plan.plannedQuantity);
                const progress = Math.round(Math.min(progressRatio, 100));
                const timeRatio = plan.plannedEndDate ? calculateTimeRatio(plan.plannedStartDate || plan.startDate, plan.plannedEndDate) : 0;
                const smartStatus = calculateSmartStatus(progressRatio, timeRatio, plan.status);
                const smart = smartCfg[smartStatus];
                const pri = priorityCfg[plan.priority || 'medium'];
                const estCostPerUnit = plan.plannedQuantity > 0 ? plan.estimatedCost / plan.plannedQuantity : 0;

                return (
                  <div key={plan.id} onClick={() => navigate('/production-plans')} className="rounded-[var(--border-radius-xl)] border bg-indigo-50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800/40 p-5 space-y-4 transition-all cursor-pointer hover:ring-2 hover:ring-indigo-200 dark:hover:ring-indigo-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-icons-round text-indigo-500 text-lg">event_note</span>
                        <span className={`text-xs font-bold ${smart.color}`}>{smart.label}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${pri.bg} ${pri.color}`}>{pri.label}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-[var(--color-text-muted)] text-base">inventory_2</span>
                      <p className="text-base font-bold text-[var(--color-text)] truncate">{product?.name ?? '—'}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-[var(--color-text-muted)] text-base">precision_manufacturing</span>
                      <span className="text-sm font-bold text-[var(--color-text-muted)]">{line?.name ?? '—'}</span>
                      {canViewCosts && estCostPerUnit > 0 && (
                        <div className="flex items-center gap-1.5 bg-[var(--color-card)] rounded-[var(--border-radius-base)] px-3 py-1 mr-auto">
                          <span className="material-icons-round text-emerald-500 text-sm">payments</span>
                          <span className="text-[10px] text-slate-400">التكلفة المتوقعة</span>
                          <span className="text-sm font-bold text-emerald-600">{formatCost(estCostPerUnit)}</span>
                          <span className="text-[10px] text-slate-400">/قطعة</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] p-3">
                        <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">المخطط</p>
                        <p className="text-lg font-bold text-[var(--color-text)]">{formatNumber(plan.plannedQuantity)}</p>
                      </div>
                      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] p-3">
                        <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">تم إنتاجه</p>
                        <p className="text-lg font-bold text-emerald-600">{formatNumber(produced)}</p>
                      </div>
                      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-lg)] p-3">
                        <p className="text-xs text-[var(--color-text-muted)] font-medium mb-1">المتبقي</p>
                        <p className="text-lg font-bold text-rose-500">{formatNumber(remaining)}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-[var(--color-text-muted)]">التقدم</span>
                        <span className={progress >= 80 ? 'text-emerald-600' : progress >= 50 ? 'text-amber-600' : 'text-slate-500'}>{progress}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-[var(--color-card)] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-primary'}`}
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 text-xs text-[var(--color-text-muted)] pt-1">
                      <div className="flex items-center gap-1">
                        <span className="material-icons-round text-sm">event</span>
                        <span className="font-bold">{plan.plannedStartDate || plan.startDate}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="material-icons-round text-sm">event_available</span>
                        <span className="font-bold">{plan.plannedEndDate || '—'}</span>
                      </div>
                      <div className="flex items-center gap-1 mr-auto">
                        <span className="material-icons-round text-sm">speed</span>
                        <span className="font-bold">{formatNumber(plan.avgDailyTarget || 0)} /يوم</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-amber-600">report_problem</span>
            <h3 className="text-sm font-medium text-[var(--color-text)]">نواقص المكونات</h3>
            <StatusBadge label={`${shortageRows.length}`} type="warning" />
          </div>
          {canExport && shortageRows.length > 0 && (
            <GhostButton
              type="button"
              onClick={() => exportProductionPlanShortages(shortageRows)}
              className="h-8 px-3 text-xs"
            >
              <span className="material-icons-round text-sm">download</span>
              <span>Excel</span>
            </GhostButton>
          )}
        </div>
        {shortageRows.length === 0 ? (
          <div className="erp-alert erp-alert-info">
            <span className="material-icons-round text-[18px] shrink-0">info</span>
            <span>لا توجد نواقص مكونات مسجلة حاليًا.</span>
          </div>
        ) : (
          <DataTable columns={shortageColumns} data={shortageRows} emptyMessage="لا توجد نواقص مكونات مسجلة حاليًا." />
        )}
      </Card>

      {/* ── Charts Grid ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Production vs Cost Per Unit */}
        {isVisible('production_cost_chart') && canViewCosts && (
          <Card className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-icons-round text-primary">show_chart</span>
              <h3 className="text-lg font-bold">الإنتاج مقابل تكلفة الوحدة</h3>
            </div>
            {dailyChartData.length > 0 ? (
              <div style={{ direction: 'ltr' }} className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={dailyChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      formatter={(val: string) =>
                        val === 'production' ? 'الإنتاج' : 'تكلفة الوحدة'
                      }
                    />
                    <Bar yAxisId="left" dataKey="production" name="production" fill="#1392ec" radius={[4, 4, 0, 0]} barSize={20} />
                    <Line yAxisId="right" type="monotone" dataKey="costPerUnit" name="costPerUnit" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center text-[var(--color-text-muted)] text-sm">
                <span className="material-icons-round ml-2">bar_chart</span>
                لا توجد بيانات للفترة المحددة
              </div>
            )}
          </Card>
        )}

        {/* Chart 3: Top 5 Lines */}
        {isVisible('top_lines') && <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="material-icons-round text-emerald-500">precision_manufacturing</span>
            <h3 className="text-lg font-bold">أعلى 5 خطوط إنتاج</h3>
          </div>
          {topLines.length > 0 ? (
            <div style={{ direction: 'ltr' }} className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topLines} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="production" name="الإنتاج" fill="#10b981" radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-[var(--color-text-muted)] text-sm">
              لا توجد بيانات
            </div>
          )}
        </Card>}

        {/* Chart 4: Top 5 Products */}
        {isVisible('top_products') && <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="material-icons-round text-violet-500">inventory_2</span>
            <h3 className="text-lg font-bold">أعلى 5 منتجات</h3>
          </div>
          {topProducts.length > 0 ? (
            <div style={{ direction: 'ltr' }} className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topProducts} layout="vertical" margin={{ left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="production" name="الإنتاج" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-[var(--color-text-muted)] text-sm">
              لا توجد بيانات
            </div>
          )}
        </Card>}

        {/* Chart: Top 5 Products Table Detail */}
        {isVisible('product_performance') && <Card className="lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-icons-round text-primary">table_chart</span>
            <h3 className="text-lg font-bold">ملخص أداء المنتجات</h3>
          </div>
          {topProducts.length > 0 ? (
            <>
              <div className="md:hidden space-y-2.5">
                {topProducts.map((p, i) => {
                  const share = kpis.totalProduction > 0 ? (p.production / kpis.totalProduction) * 100 : 0;
                  return (
                    <div key={p.id} className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => navigate(`/products/${p.id}`)}
                          className="text-sm font-bold text-primary text-right leading-snug hover:underline"
                        >
                          {p.name}
                        </button>
                        <span className="text-[11px] font-mono text-[var(--color-text-muted)]">#{i + 1}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] px-2.5 py-2">
                          <p className="text-[var(--color-text-muted)] mb-0.5">الإنتاج</p>
                          <p className="font-mono font-bold text-primary">{formatNumber(p.production)}</p>
                        </div>
                        <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] px-2.5 py-2">
                          <p className="text-[var(--color-text-muted)] mb-0.5">الحصة</p>
                          <p className="font-mono font-bold text-violet-600">{share.toFixed(1)}%</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-[#f0f2f5] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-violet-500 rounded-full transition-all"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">المنتج</th>
                      <th className="erp-th">الإنتاج</th>
                      <th className="erp-th">الحصة %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.map((p, i) => (
                      <tr key={i} onClick={() => navigate(`/products/${p.id}`)} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa] transition-colors cursor-pointer">
                        <td className="py-3 px-4 font-bold text-primary">{p.name}</td>
                        <td className="py-3 px-4">{formatNumber(p.production)}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 max-w-[120px] h-2 bg-[#f0f2f5] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-violet-500 rounded-full transition-all"
                                style={{ width: `${kpis.totalProduction > 0 ? (p.production / kpis.totalProduction) * 100 : 0}%` }}
                              ></div>
                            </div>
                            <span className="text-[var(--color-text-muted)] text-xs font-bold">
                              {kpis.totalProduction > 0 ? ((p.production / kpis.totalProduction) * 100).toFixed(1) : 0}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-[var(--color-text-muted)] text-sm">لا توجد بيانات</div>
          )}
        </Card>}
      </div>
    </div>
  );
};


