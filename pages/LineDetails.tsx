
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, KPIBox, Badge, Button, LoadingSkeleton } from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import { usePermission } from '../utils/permissions';
import { reportService } from '../services/reportService';
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
  getTodayDateString,
} from '../utils/calculations';
import {
  formatCost,
  getCurrentMonth,
  calculateDailyIndirectCost,
} from '../utils/costCalculations';
import { getAlertSettings } from '../utils/dashboardConfig';
import type { ProductionReport } from '../types';
import { ProductionLineStatus } from '../types';
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

// ── Status display config ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  [ProductionLineStatus.ACTIVE]: { label: 'نشط', variant: 'success' },
  [ProductionLineStatus.MAINTENANCE]: { label: 'صيانة', variant: 'warning' },
  [ProductionLineStatus.IDLE]: { label: 'متوقف', variant: 'neutral' },
  [ProductionLineStatus.WARNING]: { label: 'تحذير', variant: 'danger' },
};

const HEALTH_STATUS_CONFIG = {
  on_track: { label: 'في الموعد', variant: 'success' as const, color: 'text-emerald-500', desc: 'سير العمل طبيعي' },
  at_risk: { label: 'معرض للخطر', variant: 'warning' as const, color: 'text-amber-500', desc: 'يحتاج متابعة' },
  delayed: { label: 'متأخر', variant: 'danger' as const, color: 'text-rose-500', desc: 'يحتاج تدخل' },
  critical: { label: 'حرج', variant: 'danger' as const, color: 'text-rose-600', desc: 'يحتاج تدخل فوري' },
};

// ── Chart tab types ──────────────────────────────────────────────────────────

type ChartTab = 'production' | 'cost' | 'efficiency' | 'hours';

const CHART_TABS: { key: ChartTab; label: string; icon: string }[] = [
  { key: 'production', label: 'الإنتاج', icon: 'inventory' },
  { key: 'cost', label: 'التكلفة', icon: 'payments' },
  { key: 'efficiency', label: 'الكفاءة', icon: 'speed' },
  { key: 'hours', label: 'الساعات', icon: 'schedule' },
];

// ── Main Component ───────────────────────────────────────────────────────────

export const LineDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();
  const canViewCosts = can('costs.view');

  const productionLines = useAppStore((s) => s.productionLines);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const supervisors = useAppStore((s) => s.supervisors);
  const productionPlans = useAppStore((s) => s.productionPlans);
  const planReports = useAppStore((s) => s.planReports);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const systemSettings = useAppStore((s) => s.systemSettings);

  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartTab, setChartTab] = useState<ChartTab>('production');

  const line = productionLines.find((l) => l.id === id);
  const rawLine = _rawLines.find((l) => l.id === id);
  const hourlyRate = laborSettings?.hourlyRate ?? 0;
  const alertCfg = useMemo(() => getAlertSettings(systemSettings), [systemSettings]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    reportService
      .getByLine(id)
      .then((data) => {
        if (!cancelled) setReports(data);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id]);

  // ── Active plan for this line ────────────────────────────────────────────

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

  // ── Core metrics ──────────────────────────────────────────────────────────

  const totalProduced = useMemo(
    () => reports.reduce((sum, r) => sum + (r.quantityProduced || 0), 0),
    [reports]
  );

  const totalWaste = useMemo(
    () => reports.reduce((sum, r) => sum + (r.quantityWaste || 0), 0),
    [reports]
  );

  const totalHours = useMemo(
    () => reports.reduce((sum, r) => sum + (r.workHours || 0), 0),
    [reports]
  );

  const avgAssemblyTime = useMemo(
    () => calculateAvgAssemblyTime(reports),
    [reports]
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

  const uniqueDays = useMemo(() => countUniqueDays(reports), [reports]);

  const utilization = useMemo(() => {
    if (!rawLine || uniqueDays === 0) return 0;
    const availableHours = uniqueDays * rawLine.dailyWorkingHours;
    return calculateUtilization(totalHours, availableHours);
  }, [rawLine, uniqueDays, totalHours]);

  const planProgress = useMemo(
    () => activePlan ? calculatePlanProgress(planActualProduced, activePlan.plannedQuantity) : 0,
    [activePlan, planActualProduced]
  );

  // ── Cost per unit ──────────────────────────────────────────────────────────

  const costPerUnit = useMemo(() => {
    if (totalProduced === 0 || !id) return 0;

    const totalLaborCost = reports.reduce(
      (sum, r) => sum + (r.workersCount || 0) * (r.workHours || 0) * hourlyRate, 0
    );

    const monthCache = new Map<string, number>();
    const dates = new Set(reports.filter((r) => r.quantityProduced > 0).map((r) => r.date));
    let totalIndirect = 0;
    dates.forEach((date) => {
      const month = date.slice(0, 7);
      if (!monthCache.has(month)) {
        monthCache.set(month, calculateDailyIndirectCost(id, month, costCenters, costCenterValues, costAllocations));
      }
      totalIndirect += monthCache.get(month) || 0;
    });

    return (totalLaborCost + totalIndirect) / totalProduced;
  }, [reports, hourlyRate, id, costCenters, costCenterValues, costAllocations, totalProduced]);

  // ── Capacity metrics ───────────────────────────────────────────────────────

  const dailyCapacity = useMemo(
    () => calculateDailyCapacity(rawLine?.maxWorkers ?? 0, rawLine?.dailyWorkingHours ?? 0, avgAssemblyTime),
    [rawLine, avgAssemblyTime]
  );

  const todayStr = getTodayDateString();
  const todayProduced = useMemo(
    () => reports.filter((r) => r.date === todayStr).reduce((sum, r) => sum + (r.quantityProduced || 0), 0),
    [reports, todayStr]
  );

  const currentLoadPercent = dailyCapacity > 0 ? Math.round((todayProduced / dailyCapacity) * 100) : 0;

  const remainingQty = activePlan ? Math.max(0, activePlan.plannedQuantity - planActualProduced) : 0;
  const remainingDays = useMemo(
    () => activePlan ? calculateEstimatedDays(remainingQty, dailyCapacity) : 0,
    [activePlan, remainingQty, dailyCapacity]
  );

  // ── Planned end date (estimated) ───────────────────────────────────────────

  const plannedEndDate = useMemo(() => {
    if (!activePlan || dailyCapacity <= 0) return null;
    const totalDays = Math.ceil(activePlan.plannedQuantity / dailyCapacity);
    const start = new Date(activePlan.startDate);
    start.setDate(start.getDate() + totalDays);
    return start.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
  }, [activePlan, dailyCapacity]);

  // ── Plan Health ────────────────────────────────────────────────────────────

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

  // ── Chart data (all metrics per date) ──────────────────────────────────────

  const enrichedChartData = useMemo(() => {
    const byDate = new Map<string, { produced: number; waste: number; hours: number; workerHours: number }>();

    reports.forEach((r) => {
      const prev = byDate.get(r.date) || { produced: 0, waste: 0, hours: 0, workerHours: 0 };
      prev.produced += r.quantityProduced || 0;
      prev.waste += r.quantityWaste || 0;
      prev.hours += r.workHours || 0;
      prev.workerHours += (r.workersCount || 0) * (r.workHours || 0);
      byDate.set(r.date, prev);
    });

    const monthIndirectCache = new Map<string, number>();

    return Array.from(byDate.entries())
      .map(([date, d]) => {
        const month = date.slice(0, 7);
        if (!monthIndirectCache.has(month) && id) {
          monthIndirectCache.set(month, calculateDailyIndirectCost(id, month, costCenters, costCenterValues, costAllocations));
        }
        const indirectCost = monthIndirectCache.get(month) || 0;
        const laborCost = d.workerHours * hourlyRate;
        const totalCost = laborCost + indirectCost;
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
  }, [reports, id, hourlyRate, costCenters, costCenterValues, costAllocations, standardTime]);

  // ── Visible chart tabs ─────────────────────────────────────────────────────

  const visibleChartTabs = useMemo(
    () => CHART_TABS.filter((tab) => tab.key !== 'cost' || canViewCosts),
    [canViewCosts]
  );

  // ── Alerts ─────────────────────────────────────────────────────────────────

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
        message: `الكفاءة أقل من الحد المطلوب: ${efficiency}% (الحد: ${alertCfg.efficiencyThreshold}%)`,
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

  // ── Chart tooltip ──────────────────────────────────────────────────────────

  const ChartTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 text-sm" dir="rtl">
        <p className="font-bold text-slate-600 dark:text-slate-300 mb-1">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></span>
            <span className="text-slate-500">{entry.name}:</span>
            <span className="font-bold">{typeof entry.value === 'number' && entry.value > 100 ? formatNumber(entry.value) : entry.value}</span>
          </div>
        ))}
      </div>
    );
  }, []);

  // ── Loading / Not Found ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton type="detail" />
      </div>
    );
  }

  if (!line && !loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16 text-slate-400">
          <span className="material-icons-round text-6xl mb-4 block opacity-30">precision_manufacturing</span>
          <p className="font-bold text-lg">خط الإنتاج غير موجود</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/lines')}>
            <span className="material-icons-round text-sm">arrow_forward</span>
            العودة لخطوط الإنتاج
          </Button>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[line?.status ?? ''] || STATUS_CONFIG[ProductionLineStatus.IDLE];
  const healthCfg = planHealth ? HEALTH_STATUS_CONFIG[planHealth.status] : null;

  return (
    <div className="space-y-6">
      {/* ── Alerts ──────────────────────────────────────────────────────────── */}
      {alerts.length > 0 && alerts[0].type !== 'info' && (
        <div className="space-y-2">
          {alerts.filter((a) => a.type !== 'info').map((alert, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
                alert.type === 'danger'
                  ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400'
                  : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
              }`}
            >
              <span className="material-icons-round text-lg">{alert.icon}</span>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Enhanced Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
          <button
            onClick={() => navigate('/lines')}
            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all shrink-0 mt-1 sm:mt-0"
          >
            <span className="material-icons-round">arrow_forward</span>
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white truncate">
                {line?.name}
              </h2>
              <Badge variant={statusCfg.variant} pulse={line?.status === ProductionLineStatus.ACTIVE}>
                {statusCfg.label}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <span className="text-xs sm:text-sm text-slate-400 font-medium flex items-center gap-1">
                <span className="material-icons-round text-xs">person</span>
                المشرف: <strong className="text-slate-600 dark:text-slate-300">{line?.supervisorName}</strong>
              </span>
              {rawLine && (
                <>
                  <span className="hidden sm:inline text-slate-300 dark:text-slate-600">|</span>
                  <span className="text-xs sm:text-sm text-slate-400">
                    {rawLine.dailyWorkingHours} ساعة · {rawLine.maxWorkers} عامل
                  </span>
                </>
              )}
              {activePlanProduct && (
                <>
                  <span className="hidden sm:inline text-slate-300 dark:text-slate-600">|</span>
                  <span className="text-xs sm:text-sm text-slate-400 flex items-center gap-1">
                    <span className="material-icons-round text-xs">event_note</span>
                    الخطة: <strong className="text-primary">{activePlanProduct}</strong>
                  </span>
                </>
              )}
            </div>
            {activePlan && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                {plannedEndDate && (
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <span className="material-icons-round text-xs">event</span>
                    الانتهاء المتوقع: <strong className="text-slate-600 dark:text-slate-300">{plannedEndDate}</strong>
                  </span>
                )}
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  <span className="material-icons-round text-xs">inventory</span>
                  المتبقي: <strong className="text-slate-600 dark:text-slate-300">{formatNumber(remainingQty)}</strong> وحدة
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Expanded KPI Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <KPIBox
          label="الإنتاج مقابل الهدف"
          value={formatNumber(totalProduced)}
          unit={activePlan ? `/ ${formatNumber(activePlan.plannedQuantity)}` : 'وحدة'}
          icon="inventory"
          colorClass="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
          trend={activePlan ? `${planProgress}% من الهدف` : undefined}
          trendUp={planProgress >= 50}
        />
        <KPIBox
          label="تقدم الخطة"
          value={activePlan ? `${planProgress}%` : '—'}
          icon="fact_check"
          colorClass={
            planProgress >= 80
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
              : planProgress >= 50
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
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
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
              : efficiency >= 70
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
              : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
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
          colorClass="bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
          trend={`${uniqueDays} يوم عمل`}
          trendUp
        />
        <KPIBox
          label="نسبة الهدر"
          value={`${wasteRatio}%`}
          icon="delete_sweep"
          colorClass={
            wasteRatio <= 2
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
              : wasteRatio <= 5
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
              : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'
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
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
              : utilization >= 50
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
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

      {/* ── Plan Health Block ──────────────────────────────────────────────── */}
      {activePlan && planHealth && healthCfg && (
        <Card>
          <div className="flex items-center gap-2 mb-5">
            <span className="material-icons-round text-violet-500">monitor_heart</span>
            <h3 className="text-lg font-bold">صحة الخطة</h3>
            <Badge variant={healthCfg.variant} pulse={planHealth.status === 'critical'}>
              {healthCfg.label}
            </Badge>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Elapsed time ratio */}
            <div>
              <p className="text-xs text-slate-400 font-bold mb-2">نسبة الوقت المنقضي</p>
              <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-1.5">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${planHealth.elapsedRatio}%` }}
                ></div>
              </div>
              <p className="text-lg font-black text-slate-700 dark:text-slate-200">{planHealth.elapsedRatio}%</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {planHealth.elapsedDays} من {planHealth.estimatedTotalDays} يوم
              </p>
            </div>
            {/* Completion ratio */}
            <div>
              <p className="text-xs text-slate-400 font-bold mb-2">نسبة الإنجاز</p>
              <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-1.5">
                <div
                  className={`h-full rounded-full transition-all ${
                    planHealth.completionRatio >= planHealth.elapsedRatio ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${planHealth.completionRatio}%` }}
                ></div>
              </div>
              <p className="text-lg font-black text-slate-700 dark:text-slate-200">{planHealth.completionRatio}%</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                {formatNumber(planActualProduced)} من {formatNumber(activePlan.plannedQuantity)}
              </p>
            </div>
            {/* Delay days */}
            <div>
              <p className="text-xs text-slate-400 font-bold mb-2">أيام التأخير</p>
              <p className={`text-3xl font-black mt-1 ${planHealth.delayDays > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                {planHealth.delayDays}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">
                {planHealth.delayDays > 0 ? 'يوم تأخير عن الموعد' : 'في الموعد المحدد'}
              </p>
            </div>
            {/* Health status */}
            <div>
              <p className="text-xs text-slate-400 font-bold mb-2">الحالة الصحية</p>
              <p className={`text-xl font-black mt-1 ${healthCfg.color}`}>{healthCfg.label}</p>
              <p className="text-[10px] text-slate-400 mt-1">{healthCfg.desc}</p>
            </div>
          </div>
        </Card>
      )}

      {/* ── Charts with Tab Switcher ──────────────────────────────────────── */}
      <Card>
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  chartTab === tab.key
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
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
      </Card>

      {/* ── Capacity Section ──────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2 mb-5">
          <span className="material-icons-round text-emerald-500">precision_manufacturing</span>
          <h3 className="text-lg font-bold">الطاقة الإنتاجية</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <p className="text-xs text-slate-400 font-bold mb-1">الطاقة اليومية</p>
            <p className="text-2xl font-black text-primary">
              {dailyCapacity > 0 ? formatNumber(dailyCapacity) : '—'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">وحدة/يوم</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-400 font-bold mb-1">الحمل الحالي</p>
            <p className={`text-2xl font-black ${
              currentLoadPercent >= 80 ? 'text-emerald-500' : currentLoadPercent >= 40 ? 'text-amber-500' : 'text-slate-400'
            }`}>
              {dailyCapacity > 0 ? `${currentLoadPercent}%` : '—'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{formatNumber(todayProduced)} وحدة اليوم</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-400 font-bold mb-1">نسبة الاستخدام</p>
            <p className={`text-2xl font-black ${
              utilization >= 80 ? 'text-emerald-500' : utilization >= 50 ? 'text-amber-500' : 'text-slate-400'
            }`}>
              {utilization}%
            </p>
            <p className="text-xs text-slate-400 mt-0.5">ساعات فعلية / متاحة</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-400 font-bold mb-1">الأيام المتبقية</p>
            <p className="text-2xl font-black text-violet-500">
              {activePlan && remainingDays > 0 ? remainingDays : '—'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {activePlan ? 'لإنهاء الخطة الحالية' : 'لا توجد خطة نشطة'}
            </p>
          </div>
        </div>
        {dailyCapacity > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 font-bold shrink-0">حمل اليوم</span>
              <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    currentLoadPercent >= 80 ? 'bg-emerald-500' : currentLoadPercent >= 40 ? 'bg-amber-500' : 'bg-slate-300'
                  }`}
                  style={{ width: `${Math.min(currentLoadPercent, 100)}%` }}
                ></div>
              </div>
              <span className="text-xs font-black text-slate-600 dark:text-slate-300 w-12 text-left">
                {currentLoadPercent}%
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* ── Alerts Section ────────────────────────────────────────────────── */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <span className="material-icons-round text-amber-500">notifications_active</span>
          <h3 className="text-lg font-bold">التنبيهات</h3>
        </div>
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
                alert.type === 'danger'
                  ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400'
                  : alert.type === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                  : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
              }`}
            >
              <span className="material-icons-round text-lg">{alert.icon}</span>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Reports Table ─────────────────────────────────────────────────── */}
      <Card className="!p-0 border-none overflow-hidden shadow-xl shadow-slate-200/50" title="">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-bold">سجل التقارير</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">التاريخ</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">المنتج</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الكمية</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الهالك</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">عمال</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">ساعات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {reports.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <p className="font-bold">لا توجد تقارير لهذا الخط</p>
                  </td>
                </tr>
              )}
              {reports.slice(0, 20).map((r) => {
                const productName = _rawProducts.find((p) => p.id === r.productId)?.name ?? '—';
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-300">{r.date}</td>
                    <td className="px-5 py-3 text-sm font-medium">{productName}</td>
                    <td className="px-5 py-3 text-center">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-sm font-black ring-1 ring-emerald-500/20">
                        {formatNumber(r.quantityProduced)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center text-rose-500 font-bold text-sm">{formatNumber(r.quantityWaste)}</td>
                    <td className="px-5 py-3 text-center text-sm font-bold">{r.workersCount}</td>
                    <td className="px-5 py-3 text-center text-sm font-bold">{r.workHours}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {reports.length > 0 && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
            <span className="text-sm text-slate-500 font-bold">
              إجمالي <span className="text-primary">{reports.length}</span> تقرير
            </span>
          </div>
        )}
      </Card>
    </div>
  );
};
