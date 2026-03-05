import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { Card, KPIBox, Badge, LoadingSkeleton } from '../components/UI';
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
  getExecutionDeviationTone,
  getTodayDateString,
} from '../../../utils/calculations';
import {
  formatCost,
  getCurrentMonth,
  calculateDailyIndirectCost,
} from '../../../utils/costCalculations';
import {
  getAlertSettings,
  getKPIThreshold,
  getKPIColor,
  KPI_COLOR_CLASSES,
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

export const FactoryManagerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermission();
  const canViewCosts = can('costs.view');

  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const productionLines = useAppStore((s) => s.productionLines);
  const workOrders = useAppStore((s) => s.workOrders);
  const productionPlans = useAppStore((s) => s.productionPlans);
  const planReports = useAppStore((s) => s.planReports);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
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
  const [reportCompliance, setReportCompliance] = useState<ReportComplianceSnapshot | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(true);
  const [complianceError, setComplianceError] = useState<string | null>(null);
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

  const dateRange = useMemo(() => {
    if (preset === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return getPresetRange(preset);
  }, [preset, customStart, customEnd]);
  const isAfterComplianceCutoff = useMemo(
    () => new Date(clockNow).getHours() >= 16,
    [clockNow],
  );
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
    const timer = window.setInterval(() => setClockNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadCompliance = async () => {
      setComplianceLoading(true);
      setComplianceError(null);
      setYesterdayComplianceLoading(true);
      setYesterdayComplianceError(null);
      try {
        const [todaySnapshot, yesterdaySnapshot] = await Promise.all([
          reportComplianceService.getTodaySnapshot(_rawEmployees, _rawLines),
          reportComplianceService.getSnapshotForDate(
            selectedComplianceDate,
            _rawEmployees,
            _rawLines,
            { scope: 'all_active' },
          ),
        ]);
        if (!cancelled) {
          setReportCompliance(todaySnapshot);
          setYesterdayCompliance(yesterdaySnapshot);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'تعذر تحميل متابعة التزام التقارير.';
          setComplianceError(message);
          setReportCompliance(null);
          setYesterdayComplianceError(message);
          setYesterdayCompliance(null);
        }
      } finally {
        if (!cancelled) {
          setComplianceLoading(false);
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

  // ── KPI Calculations ────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalProduction = reports.reduce((s, r) => s + (r.quantityProduced || 0), 0);
    const totalWaste = reports.reduce((s, r) => s + (r.quantityWaste || 0), 0);
    const wastePercent = calculateWasteRatio(totalWaste, totalProduction + totalWaste);
    const efficiency = totalProduction + totalWaste > 0
      ? Number(((totalProduction / (totalProduction + totalWaste)) * 100).toFixed(1))
      : 0;

    let totalLaborCost = 0;
    let totalIndirectCost = 0;
    reports.forEach((r) => {
      totalLaborCost += (r.workersCount || 0) * (r.workHours || 0) * hourlyRate;
    });

    const lineMonthIndirectCache = new Map<string, number>();
    const lineDateTotals = new Map<string, number>();
    reports.forEach((r) => {
      const key = `${r.lineId}_${r.date}`;
      lineDateTotals.set(key, (lineDateTotals.get(key) || 0) + (r.quantityProduced || 0));
    });

    reports.forEach((r) => {
      if (!r.quantityProduced || r.quantityProduced <= 0) return;
      const month = r.date?.slice(0, 7) || getCurrentMonth();
      const cacheKey = `${r.lineId}_${month}`;
      if (!lineMonthIndirectCache.has(cacheKey)) {
        lineMonthIndirectCache.set(cacheKey,
          calculateDailyIndirectCost(r.lineId, month, costCenters, costCenterValues, costAllocations)
        );
      }
      const lineIndirect = lineMonthIndirectCache.get(cacheKey) || 0;
      const lineDateKey = `${r.lineId}_${r.date}`;
      const lineDateTotal = lineDateTotals.get(lineDateKey) || 0;
      if (lineDateTotal > 0) {
        totalIndirectCost += lineIndirect * (r.quantityProduced / lineDateTotal);
      }
    });

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
  }, [reports, hourlyRate, costCenters, costCenterValues, costAllocations, lineProductConfigs, productionPlans, planReports]);

  // ── Chart 1: Production vs Cost Per Unit (daily) ────────────────────────────

  const dailyChartData = useMemo(() => {
    const byDate = new Map<string, { production: number; laborCost: number }>();
    reports.forEach((r) => {
      const prev = byDate.get(r.date) || { production: 0, laborCost: 0 };
      prev.production += r.quantityProduced || 0;
      prev.laborCost += (r.workersCount || 0) * (r.workHours || 0) * hourlyRate;
      byDate.set(r.date, prev);
    });

    const lineMonthIndirectCache = new Map<string, number>();
    const lineDateTotals = new Map<string, number>();
    reports.forEach((r) => {
      const key = `${r.lineId}_${r.date}`;
      lineDateTotals.set(key, (lineDateTotals.get(key) || 0) + (r.quantityProduced || 0));
    });

    const dateIndirect = new Map<string, number>();
    reports.forEach((r) => {
      if (!r.quantityProduced || r.quantityProduced <= 0) return;
      const month = r.date?.slice(0, 7) || getCurrentMonth();
      const cacheKey = `${r.lineId}_${month}`;
      if (!lineMonthIndirectCache.has(cacheKey)) {
        lineMonthIndirectCache.set(cacheKey,
          calculateDailyIndirectCost(r.lineId, month, costCenters, costCenterValues, costAllocations)
        );
      }
      const lineIndirect = lineMonthIndirectCache.get(cacheKey) || 0;
      const lineDateKey = `${r.lineId}_${r.date}`;
      const lineDateTotal = lineDateTotals.get(lineDateKey) || 0;
      if (lineDateTotal > 0) {
        dateIndirect.set(r.date, (dateIndirect.get(r.date) || 0) + lineIndirect * (r.quantityProduced / lineDateTotal));
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
  }, [reports, hourlyRate, costCenters, costCenterValues, costAllocations]);

  // ── Chart 3: Top 5 Lines by production ──────────────────────────────────────

  const topLines = useMemo(() => {
    const lineMap = new Map<string, number>();
    reports.forEach((r) => {
      lineMap.set(r.lineId, (lineMap.get(r.lineId) || 0) + (r.quantityProduced || 0));
    });
    return Array.from(lineMap.entries())
      .map(([lineId, qty]) => ({
        name: _rawLines.find((l) => l.id === lineId)?.name || lineId,
        production: qty,
      }))
      .sort((a, b) => b.production - a.production)
      .slice(0, 5);
  }, [reports, _rawLines]);

  // ── Chart 4: Top 5 Products by production ───────────────────────────────────

  const topProducts = useMemo(() => {
    const prodMap = new Map<string, number>();
    reports.forEach((r) => {
      prodMap.set(r.productId, (prodMap.get(r.productId) || 0) + (r.quantityProduced || 0));
    });
    return Array.from(prodMap.entries())
      .map(([productId, qty]) => ({
        id: productId,
        name: _rawProducts.find((p) => p.id === productId)?.name || productId,
        production: qty,
      }))
      .sort((a, b) => b.production - a.production)
      .slice(0, 5);
  }, [reports, _rawProducts]);

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
      const productAvgDaily = Math.max(0, Number(_rawProducts.find((p) => p.id === wo.productId)?.avgDailyProduction || 0));
      const execution = calculateWorkOrderExecutionMetrics({
        quantity: wo.quantity,
        producedQuantity: wo.actualProducedFromScans ?? wo.producedQuantity ?? 0,
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
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-100 rounded-[var(--border-radius-lg)] flex items-center justify-center">
            <span className="material-icons-round text-blue-600 text-2xl">analytics</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold">لوحة مدير المصنع</h2>
            <p className="text-sm text-slate-400">تحليلات متقدمة للإنتاج والتكاليف</p>
          </div>
        </div>
        <LoadingSkeleton rows={6} type="card" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        {/* <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-100 rounded-[var(--border-radius-lg)] flex items-center justify-center">
            <span className="material-icons-round text-blue-600 text-2xl">analytics</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold">لوحة مدير المصنع</h2>
            <p className="text-sm text-slate-400">تحليلات متقدمة للإنتاج والتكاليف</p>
          </div>
        </div> */}
        {loading && (
          <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1">
            <span className="material-icons-round text-sm animate-spin">sync</span>
            جاري التحديث...
          </span>
        )}
      </div>

      <CustomDashboardWidgets dashboardKey="factoryDashboard" systemSettings={systemSettings} />

      {/* ── Period Filter ──────────────────────────────────────────────────────── */}
      <div className="erp-filter-bar">
        <div className="erp-date-seg">
          {(Object.keys(PRESET_LABELS) as PeriodPreset[]).map((key) => (
            <button
              key={key}
              onClick={() => setPreset(key)}
              className={`erp-date-seg-btn${preset === key ? ' active' : ''}`}
            >
              {PRESET_LABELS[key]}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <>
            <div className="erp-filter-date">
              <span className="erp-filter-label">من</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </div>
            <div className="erp-filter-date">
              <span className="erp-filter-label">إلى</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </div>
          </>
        )}
        <div className="erp-filter-sep" />
        <span className="text-xs text-[var(--color-text-muted)] font-medium">{dateRange.start} ← {dateRange.end}</span>
      </div>

      {/* ── KPI Section ────────────────────────────────────────────────────────── */}
      {isVisible('kpis') && (
      <div className="overflow-x-auto pb-2 -mx-1 px-1 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
        <div className={`flex gap-3 min-w-max sm:min-w-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 ${canViewCosts ? 'xl:grid-cols-6' : 'xl:grid-cols-4'} sm:gap-4`}>
          <div className="min-w-[220px] sm:min-w-0">
            <KPIBox
              label="إجمالي الإنتاج"
              value={formatNumber(kpis.totalProduction)}
              icon="inventory"
              unit="وحدة"
              colorClass="bg-primary/10 text-primary"
            />
          </div>
          {canViewCosts && (
            <div className="min-w-[220px] sm:min-w-0">
              <KPIBox
                label="متوسط تكلفة الوحدة"
                value={formatCost(kpis.avgCostPerUnit)}
                icon="payments"
                unit="ج.م"
                colorClass="bg-amber-100 text-amber-600"
              />
            </div>
          )}
          {canViewCosts && (() => {
            const totalTrackedCost = kpis.totalLaborCost + kpis.totalIndirectCost;
            const directShare = totalTrackedCost > 0 ? ((kpis.totalLaborCost / totalTrackedCost) * 100).toFixed(1) : '0.0';
            return (
              <div className="min-w-[220px] sm:min-w-0">
                <KPIBox
                  label="التكاليف المباشرة"
                  value={formatCost(kpis.totalLaborCost)}
                  icon="groups"
                  unit="ج.م"
                  colorClass="bg-blue-100 text-blue-600"
                  trend={`${directShare}% من توزيع التكاليف`}
                  trendUp={true}
                />
              </div>
            );
          })()}
          {canViewCosts && (() => {
            const totalTrackedCost = kpis.totalLaborCost + kpis.totalIndirectCost;
            const indirectShare = totalTrackedCost > 0 ? ((kpis.totalIndirectCost / totalTrackedCost) * 100).toFixed(1) : '0.0';
            return (
              <div className="min-w-[220px] sm:min-w-0">
                <KPIBox
                  label="التكاليف غير المباشرة"
                  value={formatCost(kpis.totalIndirectCost)}
                  icon="account_balance"
                  unit="ج.م"
                  colorClass="bg-emerald-100 text-emerald-600"
                  trend={`${indirectShare}% من توزيع التكاليف`}
                  trendUp={false}
                />
              </div>
            );
          })()}
          {(() => {
            const effColor = getKPIColor(kpis.efficiency, getKPIThreshold(systemSettings, 'efficiency'), false);
            return (
              <div className="min-w-[220px] sm:min-w-0">
                <KPIBox
                  label="الكفاءة العامة"
                  value={`${kpis.efficiency}%`}
                  icon="speed"
                  colorClass={KPI_COLOR_CLASSES[effColor]}
                  trend={effColor === 'good' ? 'ممتاز' : effColor === 'warning' ? 'جيد' : 'يحتاج تحسين'}
                  trendUp={effColor !== 'danger'}
                />
              </div>
            );
          })()}
          {(() => {
            const paColor = getKPIColor(kpis.planAchievementRate, getKPIThreshold(systemSettings, 'planAchievement'), false);
            return (
              <div className="min-w-[220px] sm:min-w-0">
                <KPIBox
                  label="تحقيق الخطط"
                  value={`${kpis.planAchievementRate}%`}
                  icon="fact_check"
                  colorClass={KPI_COLOR_CLASSES[paColor]}
                />
              </div>
            );
          })()}
        </div>
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

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <span className="material-icons-round text-indigo-500">task_alt</span>
          <h3 className="text-sm font-bold text-[var(--color-text)]">متابعة التزام تقارير الإنتاج اليومية</h3>
          {reportCompliance?.operationalDate && (
            <Badge variant="info">{reportCompliance.operationalDate}</Badge>
          )}
          {complianceLoading && (
            <span className="text-xs text-[var(--color-text-muted)] ms-auto">جاري التحديث...</span>
          )}
        </div>

        {!isAfterComplianceCutoff ? (
          <div className="erp-alert erp-alert-info">
            <span className="material-icons-round text-[18px] shrink-0">schedule</span>
            <span>تبدأ متابعة الالتزام اليومية بعد الساعة 16:00.</span>
          </div>
        ) : complianceError ? (
          <div className="erp-alert erp-alert-warning">
            <span className="material-icons-round text-[18px] shrink-0">warning</span>
            <span>{complianceError}</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="rounded-[var(--border-radius-lg)] border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 p-3">
                <p className="text-xs text-emerald-700 font-bold mb-1">قدّم تقرير</p>
                <p className="text-2xl font-black text-emerald-600">{reportCompliance?.submittedCount ?? 0}</p>
              </div>
              <div className="rounded-[var(--border-radius-lg)] border border-rose-200 bg-rose-50 dark:bg-rose-900/10 p-3">
                <p className="text-xs text-rose-700 font-bold mb-1">لم يقدّم تقرير</p>
                <p className="text-2xl font-black text-rose-600">{reportCompliance?.missingCount ?? 0}</p>
              </div>
              <div className="rounded-[var(--border-radius-lg)] border border-slate-200 bg-[#f8f9fa] dark:bg-slate-900/20 p-3">
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">غير مكلّف/غير موجود اليوم</p>
                <p className="text-2xl font-black text-[var(--color-text)]">{reportCompliance?.unassignedCount ?? 0}</p>
              </div>
            </div>

            {(reportCompliance?.assignedSupervisorsCount ?? 0) === 0 ? (
              <div className="erp-alert erp-alert-info">
                <span className="material-icons-round text-[18px] shrink-0">info</span>
                <span>لا يوجد مشرفون مكلّفون اليوم في تعيينات الخطوط.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-[var(--border-radius-lg)] border border-emerald-200/70 p-3">
                  <p className="text-xs font-bold text-emerald-700 mb-2">قائمة المرسلين</p>
                  <div className="space-y-1.5">
                    {(reportCompliance?.submitted ?? []).slice(0, 8).map((row) => (
                      <div key={row.employeeId} className="text-xs text-[var(--color-text)]">
                        <span className="font-bold">{row.name}</span>
                        {row.lineNames.length > 0 && (
                          <span className="text-[var(--color-text-muted)]"> — {row.lineNames.join('، ')}</span>
                        )}
                      </div>
                    ))}
                    {(reportCompliance?.submittedCount ?? 0) > 8 && (
                      <p className="text-[11px] text-[var(--color-text-muted)]">+ المزيد...</p>
                    )}
                  </div>
                </div>
                <div className="rounded-[var(--border-radius-lg)] border border-rose-200/70 p-3">
                  <p className="text-xs font-bold text-rose-700 mb-2">قائمة غير المرسلين</p>
                  <div className="space-y-1.5">
                    {(reportCompliance?.missing ?? []).slice(0, 8).map((row) => (
                      <div key={row.employeeId} className="text-xs text-[var(--color-text)]">
                        <span className="font-bold">{row.name}</span>
                        {row.lineNames.length > 0 && (
                          <span className="text-[var(--color-text-muted)]"> — {row.lineNames.join('، ')}</span>
                        )}
                      </div>
                    ))}
                    {(reportCompliance?.missingCount ?? 0) > 8 && (
                      <p className="text-[11px] text-[var(--color-text-muted)]">+ المزيد...</p>
                    )}
                  </div>
                </div>
                <div className="rounded-[var(--border-radius-lg)] border border-slate-200 p-3">
                  <p className="text-xs font-bold text-[var(--color-text-muted)] mb-2">غير مكلّف/غير موجود</p>
                  <div className="space-y-1.5">
                    {(reportCompliance?.unassigned ?? []).slice(0, 8).map((row) => (
                      <div key={row.employeeId} className="text-xs text-[var(--color-text)]">
                        <span className="font-bold">{row.name}</span>
                      </div>
                    ))}
                    {(reportCompliance?.unassignedCount ?? 0) > 8 && (
                      <p className="text-[11px] text-[var(--color-text-muted)]">+ المزيد...</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {/* ── Active Work Orders ───────────────────────────────────────────────── */}
      {(() => {
        const activeWOs = workOrders.filter((w) => w.status === 'pending' || w.status === 'in_progress');
        if (activeWOs.length === 0) return null;
        const totalQty = activeWOs.reduce((s, w) => s + w.quantity, 0);
        const totalProduced = activeWOs.reduce((s, w) => s + (w.producedQuantity ?? 0), 0);
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
                <span className={`font-black ${overallProgress >= 80 ? 'text-emerald-600' : overallProgress >= 50 ? 'text-amber-600' : 'text-slate-500'}`}>{overallProgress}%</span>
              </div>
            </div>
            <div className="overflow-x-auto pb-2 -mx-1 px-1 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
              <div className="flex gap-3 min-w-max sm:min-w-0 sm:grid sm:grid-cols-2 xl:grid-cols-3 sm:gap-4">
                {activeWOs.map((wo) => {
                const product = _rawProducts.find((p) => p.id === wo.productId);
                const lineName = productionLines.find((l) => l.id === wo.lineId)?.name ?? _rawLines.find((l) => l.id === wo.lineId)?.name ?? '—';
                const supervisor = _rawEmployees.find((e) => e.id === wo.supervisorId);
                const progress = wo.quantity > 0 ? Math.round(((wo.producedQuantity ?? 0) / wo.quantity) * 100) : 0;
                const remaining = wo.quantity - (wo.producedQuantity ?? 0);
                const estCostPerUnit = wo.quantity > 0 ? wo.estimatedCost / wo.quantity : 0;

                return (
                  <div key={wo.id} onClick={() => navigate('/work-orders')} className={`min-w-[280px] max-w-[85vw] sm:min-w-0 sm:max-w-none rounded-[var(--border-radius-xl)] border p-5 space-y-4 transition-all cursor-pointer hover:ring-2 hover:ring-amber-200 dark:hover:ring-amber-800 ${wo.status === 'in_progress' ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200/40' : 'bg-[#f8f9fa]/50 border-[var(--color-border)]'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-icons-round text-amber-500 text-lg">assignment</span>
                        <span className="text-sm font-bold text-amber-700">أمر شغل #{wo.workOrderNumber}</span>
                      </div>
                      <Badge variant={wo.status === 'in_progress' ? 'warning' : 'neutral'}>
                        {wo.status === 'in_progress' ? 'قيد التنفيذ' : 'في الانتظار'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-[var(--color-text-muted)] text-base">inventory_2</span>
                      <p className="text-base font-bold text-[var(--color-text)] truncate">{product?.name ?? '—'}</p>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="material-icons-round text-indigo-400 text-base">person</span>
                        <span className="text-sm font-bold text-[var(--color-text-muted)]">{supervisor?.name ?? '—'}</span>
                      </div>
                      {canViewCosts && estCostPerUnit > 0 && (
                        <div className="flex items-center gap-1.5 bg-[var(--color-card)] rounded-[var(--border-radius-base)] px-3 py-1">
                          <span className="material-icons-round text-emerald-500 text-sm">payments</span>
                          <span className="text-[10px] text-slate-400">التكلفة المتوقعة</span>
                          <span className="text-sm font-bold text-emerald-600">{formatCost(estCostPerUnit)}</span>
                          <span className="text-[10px] text-slate-400">/قطعة</span>
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
                        <p className="text-lg font-bold text-emerald-600">{formatNumber(wo.producedQuantity ?? 0)}</p>
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
                        <span className="font-bold">{wo.maxWorkers} عامل</span>
                      </div>
                      <div className="flex items-center gap-1 mr-auto">
                        <span className="material-icons-round text-sm">event</span>
                        <span className="font-bold">{wo.targetDate}</span>
                      </div>
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
            <h3 className="text-sm font-bold text-[var(--color-text)]">التزام المشرفين بالتقرير</h3>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedComplianceDate}
              max={getTodayDateString()}
              onChange={(e) => setSelectedComplianceDate(e.target.value)}
              className="px-2.5 py-1.5 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-xs font-bold text-[var(--color-text)] outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={() => setSelectedComplianceDate(yesterdayOperationalDate)}
              className="px-2.5 py-1.5 text-xs font-bold rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-text-muted)] hover:text-primary hover:border-primary/30 transition-all"
            >
              أمس
            </button>
            <Badge variant="info">{selectedComplianceDate}</Badge>
          </div>
        </div>
        {yesterdayComplianceLoading ? (
          <p className="text-xs text-[var(--color-text-muted)]">جاري تحميل الحالة...</p>
        ) : yesterdayComplianceError ? (
          <p className="text-xs text-rose-600 font-bold">{yesterdayComplianceError}</p>
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
                <p className="text-2xl font-black text-[var(--color-text)]">{yesterdayCompliance?.assignedSupervisorsCount ?? 0}</p>
              </div>
              <div className="rounded-[var(--border-radius-lg)] border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 p-3">
                <p className="text-xs text-emerald-700 font-bold mb-1">بعت تقرير</p>
                <p className="text-2xl font-black text-emerald-600">{yesterdayCompliance?.submittedCount ?? 0}</p>
              </div>
              <div className="rounded-[var(--border-radius-lg)] border border-rose-200 bg-rose-50 dark:bg-rose-900/10 p-3">
                <p className="text-xs text-rose-700 font-bold mb-1">ما بعتش تقرير</p>
                <p className="text-2xl font-black text-rose-600">{yesterdayCompliance?.missingCount ?? 0}</p>
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
                          {row.submitted ? 'بعت' : 'ما بعتش'}
                        </Badge>
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)]">
                        <span className="font-bold">الخطوط: </span>
                        <span>{row.lineNames.length > 0 ? row.lineNames.join('، ') : '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm" data-no-table-enhance="true">
                    <thead className="erp-thead">
                      <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)] text-xs font-bold">
                        <th className="erp-th">المشرف</th>
                        <th className="erp-th">الخطوط</th>
                        <th className="erp-th">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...((yesterdayCompliance?.missing ?? []).map((row) => ({ ...row, submitted: false }))),
                        ...((yesterdayCompliance?.submitted ?? []).map((row) => ({ ...row, submitted: true }))),
                      ].map((row) => (
                        <tr key={row.employeeId} className="border-b border-[var(--color-border)]">
                          <td className="py-2.5 px-3 font-bold text-[var(--color-text)]">{row.name}</td>
                          <td className="py-2.5 px-3 text-[var(--color-text-muted)]">{row.lineNames.length > 0 ? row.lineNames.join('، ') : '—'}</td>
                          <td className="py-2.5 px-3">
                            <Badge variant={row.submitted ? 'success' : 'danger'}>
                              {row.submitted ? 'بعت' : 'ما بعتش'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                <span className={`font-black ${overallProgress >= 80 ? 'text-emerald-600' : overallProgress >= 50 ? 'text-amber-600' : 'text-slate-500'}`}>{overallProgress}%</span>
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
            <div className="overflow-x-auto">
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
          ) : (
            <div className="py-8 text-center text-[var(--color-text-muted)] text-sm">لا توجد بيانات</div>
          )}
        </Card>}
      </div>
    </div>
  );
};


