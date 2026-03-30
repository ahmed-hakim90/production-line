
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  DetailCollapsibleSection,
  DetailPageShell,
  DetailPageStickyHeader,
  SectionSkeleton,
  SURFACE_CARD,
} from '@/src/components/erp/DetailPageChrome';
import { Card as ErpCard, KPIBox, Badge } from '../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { reportService } from '@/modules/production/services/reportService';
import { lineAssignmentService } from '../../../services/lineAssignmentService';
import { workOrderService } from '../services/workOrderService';
import type { LineWorkerAssignment, WorkOrder } from '../../../types';
import {
  formatNumber,
  calculateAvgAssemblyTime,
  calculateWasteRatio,
  calculateTimeEfficiency,
  calculateUtilization,
  calculateDailyCapacity,
  calculateEstimatedDays,
  calculatePlanProgress,
  groupReportsByDate,
  countUniqueDays,
  getReportWaste,
  sumMaxWorkHoursByDate,
  getOperationalDateString,
} from '../../../utils/calculations';
import {
  formatCost,
  getCurrentMonth,
  calculateDailyIndirectCost,
  buildLineAllocatedCostSummary,
} from '../../../utils/costCalculations';
import { getAlertSettings } from '../../../utils/dashboardConfig';
import type { ProductionReport } from '../../../types';
import { ProductionLineStatus } from '../../../types';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// â”€â”€ Status display config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  [ProductionLineStatus.ACTIVE]: { label: 'نشط', variant: 'success' },
  [ProductionLineStatus.INJECTION]: { label: 'حقن', variant: 'warning' },
  [ProductionLineStatus.MAINTENANCE]: { label: 'صيانة', variant: 'warning' },
  [ProductionLineStatus.IDLE]: { label: 'متوقف', variant: 'neutral' },
  [ProductionLineStatus.WARNING]: { label: 'تحذير', variant: 'danger' },
};

const HEALTH_STATUS_CONFIG = {
  on_track: { label: 'في الموعد', variant: 'success' as const, color: 'text-emerald-500', desc: 'سير العمل ضمن المسار' },
  at_risk: { label: 'معرض للخطر', variant: 'warning' as const, color: 'text-amber-500', desc: 'يحتاج متابعة' },
  delayed: { label: 'متأخر', variant: 'danger' as const, color: 'text-rose-500', desc: 'يحتاج تدخل' },
  critical: { label: 'حرج', variant: 'danger' as const, color: 'text-rose-600', desc: 'يحتاج تدخل فوري' },
};

// â”€â”€ Chart tab types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ChartTab = 'production' | 'cost' | 'efficiency' | 'hours';
type Period = 'daily' | 'yesterday' | 'weekly' | 'monthly';

const CHART_TABS: { key: ChartTab; label: string; icon: string }[] = [
  { key: 'production', label: 'الإنتاج', icon: 'inventory' },
  { key: 'cost', label: 'التكلفة', icon: 'payments' },
  { key: 'efficiency', label: 'الكفاءة', icon: 'speed' },
  { key: 'hours', label: 'الساعات', icon: 'schedule' },
];

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'daily', label: 'اليوم' },
  { value: 'yesterday', label: 'أمس' },
  { value: 'weekly', label: 'أسبوعي' },
  { value: 'monthly', label: 'شهري' },
];

// â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const LineDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const canViewCosts = can('costs.view');

  const productionLines = useAppStore((s) => s.productionLines);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const employees = useAppStore((s) => s.employees);
  const productionPlans = useAppStore((s) => s.productionPlans);
  const planReports = useAppStore((s) => s.planReports);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const assets = useAppStore((s) => s.assets);
  const assetDepreciations = useAppStore((s) => s.assetDepreciations);
  const systemSettings = useAppStore((s) => s.systemSettings);

  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [lineWorkOrders, setLineWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartTab, setChartTab] = useState<ChartTab>('production');
  const [period, setPeriod] = useState<Period>('daily');
  const [viewWorkersData, setViewWorkersData] = useState<{ date: string; workers: LineWorkerAssignment[] } | null>(null);
  const [viewWorkersLoading, setViewWorkersLoading] = useState(false);
  const autoPeriodAdjustedRef = useRef(false);
  const todayStr = getOperationalDateString(8);

  const shiftDate = useCallback((dateYmd: string, days: number): string => {
    const parsed = new Date(`${dateYmd}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateYmd;
    parsed.setDate(parsed.getDate() + days);
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  const handleViewWorkers = async (date: string) => {
    if (!id) return;
    setViewWorkersLoading(true);
    setViewWorkersData({ date, workers: [] });
    try {
      const workers = await lineAssignmentService.getByLineAndDate(id, date);
      setViewWorkersData({ date, workers });
    } catch {
      setViewWorkersData(null);
    } finally {
      setViewWorkersLoading(false);
    }
  };

  const line = productionLines.find((l) => l.id === id);
  const rawLine = _rawLines.find((l) => l.id === id);
  const hourlyRate = laborSettings?.hourlyRate ?? 0;
  const alertCfg = useMemo(() => getAlertSettings(systemSettings), [systemSettings]);

  const periodReports = useMemo(() => {
    if (reports.length === 0) return [];

    if (period === 'daily') {
      return reports.filter((r) => r.date === todayStr);
    }

    if (period === 'yesterday') {
      const yesterdayStr = shiftDate(todayStr, -1);
      return reports.filter((r) => r.date === yesterdayStr);
    }

    if (period === 'weekly') {
      const start = shiftDate(todayStr, -6);
      return reports.filter((r) => r.date >= start && r.date <= todayStr);
    }

    const monthPrefix = todayStr.slice(0, 7);
    return reports.filter((r) => r.date.startsWith(monthPrefix));
  }, [reports, period, todayStr, shiftDate]);

  useEffect(() => {
    if (autoPeriodAdjustedRef.current || loading) return;

    // Keep the user-selected period if it already has data.
    if (periodReports.length > 0) {
      autoPeriodAdjustedRef.current = true;
      return;
    }

    // If there are no reports at all, keep current period and stop auto-adjust.
    if (reports.length === 0) {
      autoPeriodAdjustedRef.current = true;
      return;
    }

    const yesterdayStr = shiftDate(todayStr, -1);
    const weekStart = shiftDate(todayStr, -6);
    const monthPrefix = todayStr.slice(0, 7);

    const hasYesterday = reports.some((r) => r.date === yesterdayStr);
    const hasWeekly = reports.some((r) => r.date >= weekStart && r.date <= todayStr);
    const hasMonthly = reports.some((r) => r.date.startsWith(monthPrefix));

    if (hasYesterday) setPeriod('yesterday');
    else if (hasWeekly) setPeriod('weekly');
    else if (hasMonthly) setPeriod('monthly');
    // Otherwise leave current period as-is (data may be from older months only).

    autoPeriodAdjustedRef.current = true;
  }, [loading, periodReports.length, reports, todayStr, shiftDate]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      reportService.getByLine(id),
      workOrderService.getActiveByLine(id),
    ])
      .then(([data, wos]) => {
        if (!cancelled) {
          setReports(data);
          setLineWorkOrders(wos);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  // â”€â”€ Active plan for this line â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const activePlan = useMemo(
    () => productionPlans.find((p) => p.lineId === id && (p.status === 'in_progress' || p.status === 'planned')),
    [productionPlans, id]
  );

  const planActualProduced = useMemo(() => {
    if (!activePlan) return 0;
    const key = `${activePlan.lineId}_${activePlan.productId}`;
    const pReports = planReports[key] || [];
    return pReports.reduce((sum, r) => sum + (r.quantityProduced || 0), 0);
  }, [activePlan, planReports]);

  const activePlanProduct = useMemo(
    () => activePlan ? _rawProducts.find((p) => p.id === activePlan.productId)?.name ?? '—' : null,
    [activePlan, _rawProducts]
  );

  const linePageSubtitle = useMemo(() => {
    const parts: string[] = [];
    if (line?.employeeName) parts.push(`المشرف: ${line.employeeName}`);
    if (rawLine) parts.push(`${rawLine.dailyWorkingHours} ساعة آ· ${rawLine.maxWorkers} عامل`);
    if (activePlanProduct) parts.push(`المنتج: ${activePlanProduct}`);
    return parts.length > 0 ? parts.join(' آ· ') : 'تفاصيل خط الإنتاج';
  }, [line?.employeeName, rawLine, activePlanProduct]);

  // â”€â”€ Core metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const totalProduced = useMemo(
    () => periodReports.reduce((sum, r) => sum + (r.quantityProduced || 0), 0),
    [periodReports]
  );

  const totalWaste = useMemo(
    () => periodReports.reduce((sum, r) => sum + getReportWaste(r), 0),
    [periodReports]
  );

  const totalHours = useMemo(
    () => sumMaxWorkHoursByDate(periodReports),
    [periodReports]
  );

  const avgAssemblyTime = useMemo(
    () => calculateAvgAssemblyTime(periodReports),
    [periodReports]
  );

  const wasteRatio = useMemo(
    () => calculateWasteRatio(totalWaste, totalProduced + totalWaste),
    [totalWaste, totalProduced]
  );

  const standardTime = useMemo(() => {
    const productId = activePlan?.productId || line?.currentProductId;
    if (productId) {
      const config = lineProductConfigs.find((c) => c.lineId === id && c.productId === productId);
      if (config) return config.standardAssemblyTime;
    }
    const fallback = lineProductConfigs.find((c) => c.lineId === id);
    return fallback?.standardAssemblyTime ?? 0;
  }, [lineProductConfigs, id, activePlan, line]);

  const efficiency = useMemo(
    () => calculateTimeEfficiency(standardTime, avgAssemblyTime),
    [standardTime, avgAssemblyTime]
  );

  const uniqueDays = useMemo(() => countUniqueDays(periodReports), [periodReports]);

  const utilization = useMemo(() => {
    if (!rawLine || uniqueDays === 0) return 0;
    const availableHours = uniqueDays * rawLine.dailyWorkingHours;
    return calculateUtilization(totalHours, availableHours);
  }, [rawLine, uniqueDays, totalHours]);

  const planProgress = useMemo(
    () => activePlan ? calculatePlanProgress(planActualProduced, activePlan.plannedQuantity) : 0,
    [activePlan, planActualProduced]
  );

  const costSummaryMonth = useMemo(() => {
    const currentMonth = getCurrentMonth();

    const currentMonthHasLineAllocation = costAllocations.some((allocation) =>
      allocation.month === currentMonth
      && allocation.allocations?.some((entry) => entry.lineId === id && Number(entry.percentage || 0) > 0)
    );
    if (currentMonthHasLineAllocation) return currentMonth;

    const latestAllocatedMonthForLine = costAllocations
      .filter((allocation) =>
        allocation.allocations?.some((entry) => entry.lineId === id && Number(entry.percentage || 0) > 0)
      )
      .map((allocation) => allocation.month)
      .sort()
      .at(-1);
    if (latestAllocatedMonthForLine) return latestAllocatedMonthForLine;

    const sourceReports = periodReports.length > 0 ? periodReports : reports;
    const latestDate = sourceReports
      .map((r) => r.date)
      .filter(Boolean)
      .sort()
      .at(-1);
    if (latestDate && latestDate.length >= 7) return latestDate.slice(0, 7);

    return currentMonth;
  }, [costAllocations, id, periodReports, reports]);

  const lineAllocatedCosts = useMemo(() => {
    if (!id) return null;
    return buildLineAllocatedCostSummary(
      id,
      costSummaryMonth,
      costCenters,
      costCenterValues,
      costAllocations,
      assets,
      assetDepreciations,
    );
  }, [id, costSummaryMonth, costCenters, costCenterValues, costAllocations, assets, assetDepreciations]);

  const employeeHourlyRates = useMemo(() => {
    const rates = new Map<string, number>();
    _rawEmployees.forEach((employee) => {
      if (!employee.id) return;
      rates.set(employee.id, Math.max(0, employee.hourlyRate || 0));
    });
    return rates;
  }, [_rawEmployees]);

  const dailySupervisorCostRows = useMemo(() => {
    const byDate = new Map<string, {
      totalProduced: number;
      supervisors: Map<string, { name: string; maxHours: number; rate: number }>;
    }>();

    periodReports.forEach((report) => {
      const date = report.date;
      const hours = report.workHours || 0;
      const produced = report.quantityProduced || 0;
      const specificRate = report.employeeId ? (employeeHourlyRates.get(report.employeeId) || 0) : 0;
      // If supervisor rate is missing, fallback to global labor rate.
      const rate = specificRate > 0 ? specificRate : hourlyRate;
      const supervisorName = employees.find((e) => e.id === report.employeeId)?.name || '—';
      const supervisorKey = report.employeeId || `unknown:${supervisorName}`;

      const prev = byDate.get(date) || {
        totalProduced: 0,
        supervisors: new Map<string, { name: string; maxHours: number; rate: number }>(),
      };
      prev.totalProduced += produced;

      const supervisorPrev = prev.supervisors.get(supervisorKey) || {
        name: supervisorName,
        maxHours: 0,
        rate,
      };
      supervisorPrev.maxHours = Math.max(supervisorPrev.maxHours, hours);
      supervisorPrev.rate = rate;
      if (supervisorName && supervisorName !== '—') supervisorPrev.name = supervisorName;
      prev.supervisors.set(supervisorKey, supervisorPrev);

      byDate.set(date, prev);
    });

    return Array.from(byDate.entries())
      .map(([date, data]) => {
        const supervisors = Array.from(data.supervisors.values());
        const totalHours = supervisors.reduce((sum, sup) => sum + sup.maxHours, 0);
        const totalCost = supervisors.reduce((sum, sup) => sum + (sup.maxHours * sup.rate), 0);
        const supervisorNames = supervisors
          .map((sup) => sup.name)
          .filter((name) => name && name !== '—');

        return {
          date,
          supervisorsText: supervisorNames.length > 0 ? Array.from(new Set(supervisorNames)).join('طŒ ') : '—',
          totalHours: Number(totalHours.toFixed(2)),
          totalCost,
          produced: data.totalProduced,
          supervisorCostPerUnit: data.totalProduced > 0 ? totalCost / data.totalProduced : 0,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [periodReports, employeeHourlyRates, hourlyRate, employees]);

  // â”€â”€ Cost per unit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const costPerUnit = useMemo(() => {
    if (totalProduced === 0 || !id) return 0;

    const totalLaborCost = periodReports.reduce(
      (sum, r) => sum + (r.workersCount || 0) * (r.workHours || 0) * hourlyRate, 0
    );

    const monthCache = new Map<string, number>();
    const dates = new Set<string>(periodReports.filter((r) => r.quantityProduced > 0).map((r) => r.date));
    let totalIndirect = 0;
    let totalSupervisorIndirect = 0;
    dates.forEach((date: string) => {
      const month = date.slice(0, 7);
      if (!monthCache.has(month)) {
        monthCache.set(month, calculateDailyIndirectCost(id, month, costCenters, costCenterValues, costAllocations));
      }
      totalIndirect += monthCache.get(month) || 0;
    });

    periodReports.forEach((report) => {
      const savedCost = report.supervisorIndirectCost ?? 0;
      if (savedCost > 0) {
        totalSupervisorIndirect += savedCost;
        return;
      }
      const specificRate = report.employeeId ? (employeeHourlyRates.get(report.employeeId) || 0) : 0;
      const effectiveRate = specificRate > 0 ? specificRate : hourlyRate;
      totalSupervisorIndirect += (report.workHours || 0) * effectiveRate;
    });

    return (totalLaborCost + totalIndirect + totalSupervisorIndirect) / totalProduced;
  }, [periodReports, hourlyRate, id, costCenters, costCenterValues, costAllocations, totalProduced, employeeHourlyRates]);

  // â”€â”€ Capacity metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const dailyCapacity = useMemo(
    () => calculateDailyCapacity(rawLine?.maxWorkers ?? 0, rawLine?.dailyWorkingHours ?? 0, avgAssemblyTime),
    [rawLine, avgAssemblyTime]
  );

  const todayProduced = useMemo(
    () => periodReports.filter((r) => r.date === todayStr).reduce((sum, r) => sum + (r.quantityProduced || 0), 0),
    [periodReports, todayStr]
  );

  const currentLoadPercent = dailyCapacity > 0 ? Math.round((todayProduced / dailyCapacity) * 100) : 0;

  const remainingQty = activePlan ? Math.max(0, activePlan.plannedQuantity - planActualProduced) : 0;
  const remainingDays = useMemo(
    () => activePlan ? calculateEstimatedDays(remainingQty, dailyCapacity) : 0,
    [activePlan, remainingQty, dailyCapacity]
  );

  // â”€â”€ Planned end date (estimated) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const plannedEndDate = useMemo(() => {
    if (!activePlan || dailyCapacity <= 0) return null;
    const totalDays = Math.ceil(activePlan.plannedQuantity / dailyCapacity);
    const start = new Date(activePlan.startDate);
    start.setDate(start.getDate() + totalDays);
    return start.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  }, [activePlan, dailyCapacity]);

  // â”€â”€ Plan Health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const planHealth = useMemo(() => {
    if (!activePlan) return null;

    const startDate = new Date(activePlan.startDate);
    const now = new Date();
    const elapsedDays = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

    const estimatedTotalDays = dailyCapacity > 0 ? Math.ceil(activePlan.plannedQuantity / dailyCapacity) : 0;
    const elapsedRatio = estimatedTotalDays > 0 ? (elapsedDays / estimatedTotalDays) * 100 : 0;
    const completionRatio = activePlan.plannedQuantity > 0 ? (planActualProduced / activePlan.plannedQuantity) * 100 : 0;

    const expectedCompletion = estimatedTotalDays > 0 ? (elapsedDays / estimatedTotalDays) * 100 : 0;
    const delayDays = dailyCapacity > 0
      ? Math.max(0, Math.ceil((activePlan.plannedQuantity - planActualProduced) / dailyCapacity) - Math.max(0, estimatedTotalDays - elapsedDays))
      : 0;

    let status: 'on_track' | 'at_risk' | 'delayed' | 'critical';
    if (completionRatio >= expectedCompletion * 0.9) {
      status = 'on_track';
    } else if (completionRatio >= expectedCompletion * 0.7) {
      status = 'at_risk';
    } else if (completionRatio >= expectedCompletion * 0.4) {
      status = 'delayed';
    } else {
      status = 'critical';
    }

    return {
      elapsedDays,
      estimatedTotalDays,
      elapsedRatio: Number(Math.min(elapsedRatio, 100).toFixed(1)),
      completionRatio: Number(Math.min(completionRatio, 100).toFixed(1)),
      delayDays,
      status,
    };
  }, [activePlan, dailyCapacity, planActualProduced]);

  // â”€â”€ Chart data (all metrics per date) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const enrichedChartData = useMemo(() => {
    const byDate = new Map<string, { produced: number; waste: number; hours: number; workerHours: number }>();

    periodReports.forEach((r) => {
      const prev = byDate.get(r.date) || { produced: 0, waste: 0, hours: 0, workerHours: 0 };
      prev.produced += r.quantityProduced || 0;
      prev.waste += getReportWaste(r);
      prev.hours = Math.max(prev.hours, r.workHours || 0);
      prev.workerHours += (r.workersCount || 0) * (r.workHours || 0);
      byDate.set(r.date, prev);
    });

    const monthIndirectCache = new Map<string, number>();

    return Array.from(byDate.entries())
      .map(([date, d]) => {
        const dayReports = periodReports.filter((report) => report.date === date);
        const month = date.slice(0, 7);
        if (!monthIndirectCache.has(month) && id) {
          monthIndirectCache.set(month, calculateDailyIndirectCost(id, month, costCenters, costCenterValues, costAllocations));
        }
        const indirectCost = monthIndirectCache.get(month) || 0;
        const laborCost = d.workerHours * hourlyRate;
        const supervisorCost = dayReports
          .reduce((sum, report) => {
            const savedCost = report.supervisorIndirectCost ?? 0;
            if (savedCost > 0) return sum + savedCost;
            const specificRate = report.employeeId ? (employeeHourlyRates.get(report.employeeId) || 0) : 0;
            const effectiveRate = specificRate > 0 ? specificRate : hourlyRate;
            return sum + (report.workHours || 0) * effectiveRate;
          }, 0);
        const totalCost = laborCost + indirectCost + supervisorCost;
        const actualAssemblyTime = d.produced > 0 ? (d.workerHours * 60) / d.produced : 0;
        const dayEfficiency = standardTime > 0 && actualAssemblyTime > 0
          ? Number(((standardTime / actualAssemblyTime) * 100).toFixed(1))
          : 0;

        return {
          date: date.slice(5),
          fullDate: date,
          produced: d.produced,
          waste: d.waste,
          hours: Number(d.hours.toFixed(1)),
          costPerUnit: d.produced > 0 ? Number((totalCost / d.produced).toFixed(2)) : 0,
          efficiency: dayEfficiency,
        };
      })
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  }, [periodReports, id, hourlyRate, costCenters, costCenterValues, costAllocations, standardTime, employeeHourlyRates]);

  // â”€â”€ Visible chart tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const visibleChartTabs = useMemo(
    () => CHART_TABS.filter((tab) => tab.key !== 'cost' || canViewCosts),
    [canViewCosts]
  );

  // â”€â”€ Alerts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const alerts = useMemo(() => {
    const result: { type: 'danger' | 'warning' | 'info'; icon: string; message: string }[] = [];

    if (wasteRatio > alertCfg.wasteThreshold) {
      result.push({
        type: 'danger',
        icon: 'delete_sweep',
        message: `نسبة الهدر مرتفعة: ${wasteRatio}% (الحد المقبول ${alertCfg.wasteThreshold}%)`,
      });
    } else if (wasteRatio > alertCfg.wasteThreshold * 0.6) {
      result.push({
        type: 'warning',
        icon: 'warning',
        message: `نسبة الهدر تقترب من الحد: ${wasteRatio}%`,
      });
    }

    if (efficiency > 0 && efficiency < alertCfg.efficiencyThreshold) {
      result.push({
        type: 'warning',
        icon: 'speed',
        message: `الكفاءة أقل من الحد المحدد: ${efficiency}% (الحد: ${alertCfg.efficiencyThreshold}%)`,
      });
    }

    if (planHealth && (planHealth.status === 'delayed' || planHealth.status === 'critical')) {
      result.push({
        type: planHealth.status === 'critical' ? 'danger' : 'warning',
        icon: planHealth.status === 'critical' ? 'error' : 'schedule',
        message: planHealth.delayDays > 0
          ? `الخطة متأخرة بـ ${planHealth.delayDays} يوم عن الجدول الزمني`
          : `الخطة متأخرة عن معدل الإنجاز المتوقع`,
      });
    }

    if (result.length === 0) {
      result.push({
        type: 'info',
        icon: 'check_circle',
        message: 'لا توجد تنبيهات — الخط يعمل بشكل طبيعي',
      });
    }

    return result;
  }, [wasteRatio, efficiency, planHealth, alertCfg]);

  // â”€â”€ Chart tooltip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const ChartTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-3 text-sm" dir="rtl">
        <p className="font-bold text-[var(--color-text-muted)] mb-1">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></span>
            <span className="text-[var(--color-text-muted)]">{entry.name}:</span>
            <span className="font-bold">{typeof entry.value === 'number' && entry.value > 100 ? formatNumber(entry.value) : entry.value}</span>
          </div>
        ))}
      </div>
    );
  }, []);

  // â”€â”€ Loading / Not Found â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (loading) {
    return (
      <DetailPageShell>
        <DetailPageStickyHeader>
          <PageHeader title="تفاصيل الخط" backAction={{ to: '/lines', label: 'رجوع' }} loading />
          <Card className={SURFACE_CARD}>
            <SectionSkeleton rows={2} height={38} />
          </Card>
        </DetailPageStickyHeader>
        <Card className={SURFACE_CARD}>
          <SectionSkeleton rows={6} height={68} />
        </Card>
      </DetailPageShell>
    );
  }

  if (!line && !loading) {
    return (
      <DetailPageShell>
        <PageHeader title="تفاصيل الخط" backAction={{ to: '/lines', label: 'رجوع' }} />
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="space-y-4 p-6 text-center">
            <span className="material-icons-round block text-6xl opacity-30 text-muted-foreground">precision_manufacturing</span>
            <p className="text-lg font-bold text-destructive">خط الإنتاج غير موجود</p>
            <Button type="button" variant="outline" onClick={() => navigate('/lines')}>
              العودة لخطوط الإنتاج
            </Button>
          </CardContent>
        </Card>
      </DetailPageShell>
    );
  }

  const statusCfg = STATUS_CONFIG[line?.status ?? ''] || STATUS_CONFIG[ProductionLineStatus.IDLE];
  const healthCfg = planHealth ? HEALTH_STATUS_CONFIG[planHealth.status] : null;

  return (
    <DetailPageShell>
      <DetailPageStickyHeader>
        <PageHeader
          title={line?.name ?? 'تفاصيل الخط'}
          subtitle={linePageSubtitle}
          icon="factory"
          backAction={{ to: '/lines', label: 'رجوع' }}
          extra={(
            <Badge variant={statusCfg.variant} pulse={line?.status === ProductionLineStatus.ACTIVE}>
              {statusCfg.label}
            </Badge>
          )}
        />
        <Card className={SURFACE_CARD}>
          <CardContent className="flex flex-wrap items-center justify-end gap-3 p-4">
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200/90 bg-slate-100/80 p-1 dark:border-border dark:bg-muted/40">
              {PERIOD_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={period === opt.value ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => setPeriod(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </DetailPageStickyHeader>

      <DetailCollapsibleSection title="مؤشرات الأداء" defaultOpen>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <KPIBox
          label="الإنتاج مقابل الهدف"
          value={formatNumber(totalProduced)}
          unit={activePlan ? `/ ${formatNumber(activePlan.plannedQuantity)}` : 'وحدة'}
          icon="inventory"
          colorClass="bg-blue-50 text-blue-600 dark:bg-blue-900/20"
          trend={activePlan ? `${planProgress}% من الهدف` : undefined}
          trendUp={planProgress >= 50}
        />
        <KPIBox
          label="تقدم الخطة"
          value={activePlan ? `${planProgress}%` : '—'}
          icon="fact_check"
          colorClass={
            planProgress >= 80
              ? 'bg-emerald-50 text-emerald-600'
              : planProgress >= 50
              ? 'bg-amber-50 text-amber-600'
              : 'bg-[#f0f2f5] text-[var(--color-text-muted)]'
          }
          trend={activePlan ? `${formatNumber(planActualProduced)} من ${formatNumber(activePlan.plannedQuantity)}` : 'لا توجد خطة'}
          trendUp={planProgress >= 50}
        />
        <KPIBox
          label="الكفاءة"
          value={standardTime > 0 ? `${efficiency}%` : '—'}
          icon="bolt"
          colorClass={
            efficiency >= 90
              ? 'bg-emerald-50 text-emerald-600'
              : efficiency >= 70
              ? 'bg-amber-50 text-amber-600'
              : 'bg-rose-50 text-rose-600'
          }
          trend={efficiency >= 90 ? 'ممتاز' : efficiency >= 70 ? 'جيد' : standardTime > 0 ? 'يحتاج تحسين' : undefined}
          trendUp={efficiency >= 70}
        />
        <KPIBox
          label="متوسط وقت التجميع"
          value={avgAssemblyTime}
          unit="دقيقة/وحدة"
          icon="timer"
          colorClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
          trend={standardTime > 0 ? `المعياري: ${standardTime} دقيقة` : undefined}
          trendUp={avgAssemblyTime <= standardTime}
        />
        <KPIBox
          label="ساعات العمل"
          value={formatNumber(totalHours)}
          unit="ساعة"
          icon="schedule"
          colorClass="bg-amber-50 text-amber-600"
          trend={`${uniqueDays} يوم عمل`}
          trendUp
        />
        <KPIBox
          label="نسبة الهدر"
          value={`${wasteRatio}%`}
          icon="delete_sweep"
          colorClass={
            wasteRatio <= 2
              ? 'bg-emerald-50 text-emerald-600'
              : wasteRatio <= 5
              ? 'bg-amber-50 text-amber-600'
              : 'bg-rose-50 text-rose-600'
          }
          trend={`${formatNumber(totalWaste)} وحدة هالك`}
          trendUp={wasteRatio <= alertCfg.wasteThreshold}
        />
        <KPIBox
          label="نسبة الاستخدام"
          value={`${utilization}%`}
          icon="speed"
          colorClass={
            utilization >= 80
              ? 'bg-emerald-50 text-emerald-600'
              : utilization >= 50
              ? 'bg-amber-50 text-amber-600'
              : 'bg-[#f0f2f5] text-[var(--color-text-muted)]'
          }
          trend="ساعات فعلية / متاحة"
          trendUp={utilization >= 50}
        />
        {canViewCosts && (
          <KPIBox
            label="تكلفة الوحدة"
            value={costPerUnit > 0 ? formatCost(costPerUnit) : '—'}
            unit="ج.م"
            icon="payments"
            colorClass="bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400"
          />
        )}
      </div>
      </DetailCollapsibleSection>

      {canViewCosts && (
        <DetailCollapsibleSection title="التكاليف والتوزيع" defaultOpen>
      {lineAllocatedCosts && (
        <ErpCard>
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-violet-500">account_balance</span>
              <h3 className="text-lg font-bold">التكاليف المتوزعة على الخط</h3>
            </div>
            <span className="text-xs font-bold text-violet-500">شهر التكلفة: {lineAllocatedCosts.month}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-[var(--border-radius-lg)] border border-violet-100 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-900/10 p-3">
              <p className="text-xs text-slate-500">إجمالي شهري موزع</p>
              <p className="text-xl font-bold text-violet-700 dark:text-violet-300">
                {lineAllocatedCosts.totalMonthlyAllocated > 0 ? formatCost(lineAllocatedCosts.totalMonthlyAllocated) : '—'}
              </p>
            </div>
            <div className="rounded-[var(--border-radius-lg)] border border-violet-100 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-900/10 p-3">
              <p className="text-xs text-slate-500">موزع يومي</p>
              <p className="text-xl font-bold text-violet-700 dark:text-violet-300">
                {lineAllocatedCosts.totalDailyAllocated > 0 ? formatCost(lineAllocatedCosts.totalDailyAllocated) : '—'}
              </p>
            </div>
            <div className="rounded-[var(--border-radius-lg)] border border-violet-100 dark:border-violet-900/50 bg-violet-50/60 dark:bg-violet-900/10 p-3">
              <p className="text-xs text-slate-500">عدد مراكز التكلفة</p>
              <p className="text-xl font-bold text-violet-700 dark:text-violet-300">
                {lineAllocatedCosts.centers.length}
              </p>
            </div>
          </div>

          {lineAllocatedCosts.centers.length > 0 ? (
            <div className="overflow-x-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
              <table className="erp-table w-full text-right text-sm">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">مركز التكلفة</th>
                    <th className="erp-th text-center">نسبة التوزيع</th>
                    <th className="erp-th text-center">المبلغ الشهري</th>
                    <th className="erp-th text-center">المبلغ اليومي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {lineAllocatedCosts.centers.map((center) => (
                    <tr key={center.costCenterId}>
                      <td className="px-4 py-2.5 font-bold text-[var(--color-text)]">{center.costCenterName}</td>
                      <td className="px-4 py-2.5 text-center font-bold text-violet-600">{formatNumber(center.percentage)}%</td>
                      <td className="px-4 py-2.5 text-center font-bold">{formatCost(center.monthlyAllocated)}</td>
                      <td className="px-4 py-2.5 text-center font-bold text-[var(--color-text-muted)]">{formatCost(center.dailyAllocated)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-[var(--border-radius-lg)] border border-dashed border-[var(--color-border)] px-4 py-5 text-center text-sm font-medium text-slate-500">
              لا توجد توزيعات تكلفة غير مباشرة على هذا الخط خلال الشهر الحالي.
            </div>
          )}
        </ErpCard>
      )}

        <ErpCard>
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="material-icons-round text-emerald-500">manage_accounts</span>
              <h3 className="text-lg font-bold">تكلفة المشرف اليومية</h3>
            </div>
            <span className="text-xs text-[var(--color-text-muted)] font-bold">
              المعادلة: ساعات المشرف أ— أجر الساعة
            </span>
          </div>

          {dailySupervisorCostRows.length > 0 ? (
            <div className="overflow-x-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
              <table className="erp-table w-full text-right text-sm">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">التاريخ</th>
                    <th className="erp-th">المشرف</th>
                    <th className="erp-th text-center">ساعات الإشراف</th>
                    <th className="erp-th text-center">إنتاج اليوم</th>
                    <th className="erp-th text-center">تكلفة المشرف</th>
                    <th className="erp-th text-center">تكلفة مشرف/وحدة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {dailySupervisorCostRows.map((row) => (
                    <tr key={row.date}>
                      <td className="px-4 py-2.5 font-bold text-[var(--color-text)]">{row.date}</td>
                      <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{row.supervisorsText}</td>
                      <td className="px-4 py-2.5 text-center font-bold">{formatNumber(row.totalHours)}</td>
                      <td className="px-4 py-2.5 text-center font-bold">{formatNumber(row.produced)}</td>
                      <td className="px-4 py-2.5 text-center font-bold text-emerald-600">{formatCost(row.totalCost)}</td>
                      <td className="px-4 py-2.5 text-center font-bold text-[var(--color-text)]">
                        {row.supervisorCostPerUnit > 0 ? formatCost(row.supervisorCostPerUnit) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-[var(--border-radius-lg)] border border-dashed border-[var(--color-border)] px-4 py-5 text-center text-sm font-medium text-slate-500">
              لا توجد تقارير كافية لحساب تكلفة المشرف على هذا الخط.
            </div>
          )}
        </ErpCard>
        </DetailCollapsibleSection>
      )}

      {/* â”€â”€ Plan Health Block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activePlan && planHealth && healthCfg && (
        <DetailCollapsibleSection title="صحة الخطة" defaultOpen>
        <ErpCard>
          <div className="flex items-center gap-2 mb-5">
            <span className="material-icons-round text-violet-500">monitor_heart</span>
            <h3 className="text-lg font-bold">صحة الخطة</h3>
            <Badge variant={healthCfg.variant} pulse={planHealth.status === 'critical'}>
              {healthCfg.label}
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            {/* Elapsed time ratio */}
            <div>
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-2">نسبة الوقت المنقضي</p>
              <div className="h-2 bg-[#f0f2f5] rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${planHealth.elapsedRatio}%` }}
                ></div>
              </div>
              <p className="text-lg font-bold text-[var(--color-text)]">{planHealth.elapsedRatio}%</p>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                {planHealth.elapsedDays} من {planHealth.estimatedTotalDays} يوم
              </p>
            </div>
            {/* Completion ratio */}
            <div>
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-2">نسبة الإنجاز</p>
              <div className="h-2 bg-[#f0f2f5] rounded-full overflow-hidden mb-1.5">
                <div
                  className={`h-full rounded-full transition-all ${
                    planHealth.completionRatio >= planHealth.elapsedRatio ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${planHealth.completionRatio}%` }}
                ></div>
              </div>
              <p className="text-lg font-bold text-[var(--color-text)]">{planHealth.completionRatio}%</p>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                {formatNumber(planActualProduced)} من {formatNumber(activePlan.plannedQuantity)}
              </p>
            </div>
            {/* Delay days */}
            <div>
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-2">أيام التأخير</p>
              <p className={`text-3xl font-bold mt-1 ${planHealth.delayDays > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                {planHealth.delayDays}
              </p>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
                {planHealth.delayDays > 0 ? 'يوم تأخير عن الموعد' : 'في الموعد المحدد'}
              </p>
            </div>
            {/* Health status */}
            <div>
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-2">الحالة الصحية</p>
              <p className={`text-xl font-bold mt-1 ${healthCfg.color}`}>{healthCfg.label}</p>
              <p className="text-[10px] text-[var(--color-text-muted)] mt-1">{healthCfg.desc}</p>
            </div>
          </div>
        </ErpCard>
        </DetailCollapsibleSection>
      )}

      {/* â”€â”€ Charts with Tab Switcher â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <DetailCollapsibleSection title="تحليل الأداء" defaultOpen>
      <ErpCard>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-primary">show_chart</span>
            <h3 className="text-lg font-bold">تحليل الأداء</h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {visibleChartTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setChartTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--border-radius-base)] text-xs font-bold transition-all ${
                  chartTab === tab.key
                    ? 'bg-primary text-white shadow-primary/20'
                    : 'bg-[#f0f2f5] text-[var(--color-text-muted)] hover:bg-[#e8eaed]'
                }`}
              >
                <span className="material-icons-round text-sm">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {enrichedChartData.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <span className="material-icons-round text-4xl mb-2 block opacity-30">show_chart</span>
            <p className="font-bold">لا توجد بيانات بعد</p>
          </div>
        ) : (
          <div style={{ width: '100%', height: 320 }} dir="ltr">
            <ResponsiveContainer>
              {chartTab === 'production' ? (
                <AreaChart data={enrichedChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorProduced" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1392ec" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#1392ec" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorWaste" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend formatter={(val: string) => val === 'produced' ? 'الإنتاج' : 'الهالك'} />
                  <Area type="monotone" dataKey="produced" name="produced" stroke="#1392ec" strokeWidth={2} fillOpacity={1} fill="url(#colorProduced)" />
                  <Area type="monotone" dataKey="waste" name="waste" stroke="#ef4444" strokeWidth={1.5} fillOpacity={1} fill="url(#colorWaste)" />
                </AreaChart>
              ) : chartTab === 'cost' ? (
                <ComposedChart data={enrichedChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend formatter={(val: string) => val === 'produced' ? 'الإنتاج' : 'تكلفة الوحدة'} />
                  <Bar yAxisId="left" dataKey="produced" name="produced" fill="#1392ec" radius={[4, 4, 0, 0]} barSize={20} />
                  <Line yAxisId="right" type="monotone" dataKey="costPerUnit" name="costPerUnit" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              ) : chartTab === 'efficiency' ? (
                <BarChart data={enrichedChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} domain={[0, 'auto']} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend formatter={() => 'الكفاءة %'} />
                  <Bar dataKey="efficiency" name="efficiency" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              ) : (
                <BarChart data={enrichedChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend formatter={() => 'ساعات العمل'} />
                  <Bar dataKey="hours" name="hours" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={20} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </ErpCard>
      </DetailCollapsibleSection>

      {/* â”€â”€ Capacity Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <DetailCollapsibleSection title="مؤشرات الإنتاجية" defaultOpen>
      <ErpCard>
        <div className="flex items-center gap-2 mb-5">
          <span className="material-icons-round text-emerald-500">precision_manufacturing</span>
          <h3 className="text-lg font-bold">مؤشرات الإنتاجية</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">الإنتاج اليومي</p>
            <p className="text-2xl font-bold text-primary">
              {dailyCapacity > 0 ? formatNumber(dailyCapacity) : '—'}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">وحدة/يوم</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">الحمل الحالي</p>
            <p className={`text-2xl font-bold ${
              currentLoadPercent >= 80 ? 'text-emerald-500' : currentLoadPercent >= 40 ? 'text-amber-500' : 'text-slate-400'
            }`}>
              {dailyCapacity > 0 ? `${currentLoadPercent}%` : '—'}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{formatNumber(todayProduced)} وحدة اليوم</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">نسبة الاستخدام</p>
            <p className={`text-2xl font-bold ${
              utilization >= 80 ? 'text-emerald-500' : utilization >= 50 ? 'text-amber-500' : 'text-slate-400'
            }`}>
              {utilization}%
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">ساعات فعلية / متاحة</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">الأيام المتبقية</p>
            <p className="text-2xl font-bold text-violet-500">
              {activePlan && remainingDays > 0 ? remainingDays : '—'}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {activePlan ? 'لإنهاء الخطة الحالية' : 'لا توجد خطة نشطة'}
            </p>
          </div>
        </div>
        {dailyCapacity > 0 && (
          <div className="mt-5 pt-4 border-t border-[var(--color-border)]">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[var(--color-text-muted)] font-bold shrink-0">حمل اليوم</span>
              <div className="flex-1 h-3 bg-[#f0f2f5] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    currentLoadPercent >= 80 ? 'bg-emerald-500' : currentLoadPercent >= 40 ? 'bg-amber-500' : 'bg-slate-300'
                  }`}
                  style={{ width: `${Math.min(currentLoadPercent, 100)}%` }}
                ></div>
              </div>
              <span className="text-xs font-bold text-[var(--color-text-muted)] w-12 text-left">
                {currentLoadPercent}%
              </span>
            </div>
          </div>
        )}
      </ErpCard>
      </DetailCollapsibleSection>

      {/* â”€â”€ Alerts Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <DetailCollapsibleSection title="التنبيهات" defaultOpen>
      <ErpCard>
        <div className="flex items-center gap-2 mb-4">
          <span className="material-icons-round text-amber-500">notifications_active</span>
          <h3 className="text-lg font-bold">التنبيهات</h3>
        </div>
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
      </ErpCard>
      </DetailCollapsibleSection>

      {/* â”€â”€ Active Work Orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {can('workOrders.view') && lineWorkOrders.length > 0 && (
        <DetailCollapsibleSection title="أوامر الشغل المرتبطة" defaultOpen>
        <ErpCard className="!p-0 border-none overflow-hidden " title="">
          <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center gap-2">
            <span className="material-icons-round text-primary">assignment</span>
            <h3 className="text-lg font-bold">أوامر الشغل المرتبطة</h3>
            <Badge variant="info">{lineWorkOrders.length}</Badge>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {lineWorkOrders.map((wo) => {
              const product = _rawProducts.find((p) => p.id === wo.productId);
              const supervisor = employees.find((e) => e.id === wo.supervisorId);
              const prog = wo.quantity > 0 ? Math.min((wo.producedQuantity / wo.quantity) * 100, 100) : 0;
              return (
                <div key={wo.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4 cursor-pointer hover:ring-2 hover:ring-amber-200 dark:hover:ring-amber-800" onClick={() => navigate('/work-orders')}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-primary">{wo.workOrderNumber}</span>
                      <Badge variant={wo.status === 'in_progress' ? 'warning' : 'info'}>
                        {wo.status === 'in_progress' ? 'قيد التنفيذ' : 'قيد الانتظار'}
                      </Badge>
                    </div>
                    <p className="text-sm font-bold text-[var(--color-text)]">{product?.name ?? '—'}</p>
                    <p className="text-xs text-slate-500">المشرف: {supervisor?.name ?? '—'} آ· الحد الأقصى: {wo.maxWorkers} عامل آ· التسليم: {wo.targetDate}</p>
                  </div>
                  <div className="sm:w-48 space-y-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-[var(--color-text-muted)]">{formatNumber(wo.producedQuantity)} / {formatNumber(wo.quantity)}</span>
                      <span className="text-primary">{prog.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${prog >= 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${prog}%` }} />
                    </div>
                  </div>
                  {can('workOrders.viewCost') && (
                    <div className="sm:w-32 text-left">
                      <p className="text-[10px] text-[var(--color-text-muted)] font-bold">التكلفة</p>
                      <p className="text-sm font-bold text-[var(--color-text)]">{formatCost(wo.actualCost)}</p>
                      <p className="text-[10px] text-slate-400">مقدرة: {formatCost(wo.estimatedCost)}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ErpCard>
        </DetailCollapsibleSection>
      )}

      {/* â”€â”€ Reports Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <DetailCollapsibleSection title="سجل التقارير" defaultOpen>
      <ErpCard className="!p-0 border-none overflow-hidden " title="">
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-lg font-bold">سجل التقارير</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="erp-table w-full text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">التاريخ</th>
                <th className="erp-th">المنتج</th>
                <th className="erp-th text-center">الكمية</th>
                <th className="erp-th text-center">الهالك</th>
                <th className="erp-th text-center">عمال</th>
                <th className="erp-th text-center">ساعات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {periodReports.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <p className="font-bold">لا توجد تقارير لهذا الخط</p>
                  </td>
                </tr>
              )}
              {periodReports.slice(0, 20).map((r) => {
                const productName = _rawProducts.find((p) => p.id === r.productId)?.name ?? '—';
                return (
                  <tr key={r.id}>
                    <td className="px-5 py-3 text-sm font-bold text-[var(--color-text)]">{r.date}</td>
                    <td className="px-5 py-3 text-sm font-medium">{productName}</td>
                    <td className="px-5 py-3 text-center">
                      <span className="px-2.5 py-1 rounded-[var(--border-radius-base)] bg-emerald-50 text-emerald-600 text-sm font-bold ring-1 ring-emerald-500/20">
                        {formatNumber(r.quantityProduced)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center text-rose-500 font-bold text-sm">{formatNumber(getReportWaste(r))}</td>
                    <td className="px-5 py-3 text-center text-sm font-bold">
                      <button
                        onClick={() => handleViewWorkers(r.date)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--border-radius-base)] hover:bg-primary/10 text-primary transition-colors"
                        title="عرض العمالة"
                      >
                        {r.workersCount}
                        <span className="material-icons-round text-xs">groups</span>
                      </button>
                    </td>
                    <td className="px-5 py-3 text-center text-sm font-bold">{r.workHours}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {periodReports.length > 0 && (
          <div className="px-6 py-4 bg-[#f8f9fa]/50 border-t border-[var(--color-border)]">
            <span className="text-sm text-[var(--color-text-muted)] font-bold">
              إجمالي <span className="text-primary">{periodReports.length}</span> تقرير
            </span>
          </div>
        )}
      </ErpCard>
      </DetailCollapsibleSection>

      {/* View Workers Modal */}
      {viewWorkersData && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewWorkersData(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[95vw] max-w-md max-h-[90dvh] flex flex-col border border-[var(--color-border)] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-primary">groups</span>
                <h3 className="font-bold">عمالة {line?.name ?? ''}</h3>
                <span className="text-xs text-[var(--color-text-muted)] font-medium">{viewWorkersData.date}</span>
              </div>
              <button onClick={() => setViewWorkersData(null)} className="text-[var(--color-text-muted)] hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {viewWorkersLoading ? (
                <div className="text-center py-8">
                  <span className="material-icons-round text-3xl text-primary animate-spin block mb-2">refresh</span>
                  <p className="text-sm text-slate-500">جاري التحميل...</p>
                </div>
              ) : viewWorkersData.workers.length === 0 ? (
                <div className="text-center py-8">
                  <span className="material-icons-round text-4xl text-[var(--color-text-muted)] dark:text-[var(--color-text)] block mb-2">person_off</span>
                  <p className="text-sm text-[var(--color-text-muted)] font-medium">لا يوجد عمالة مسجلة على هذا الخط في هذا اليوم</p>
                </div>
              ) : (
                <>
                  <div className="mb-3 px-3 py-2 bg-primary/5 rounded-[var(--border-radius-lg)] text-center">
                    <span className="text-sm font-bold text-primary">{viewWorkersData.workers.length} عامل</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {viewWorkersData.workers.map((w, i) => (
                      <div key={w.id || i} className="flex items-center gap-3 py-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="material-icons-round text-primary text-sm">person</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-[var(--color-text)] truncate">{w.employeeName}</p>
                          <p className="text-xs text-[var(--color-text-muted)] font-mono">{w.employeeCode}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </DetailPageShell>
  );
};



