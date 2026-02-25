import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { Card, KPIBox, Badge, LoadingSkeleton } from '../components/UI';
import { reportService } from '../../../services/reportService';
import { formatNumber, calculateWasteRatio, calculateProgressRatio, calculateTimeRatio, calculateSmartStatus } from '../../../utils/calculations';
import {
  formatCost,
  getCurrentMonth,
  calculateDailyLaborCost,
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
  PieChart,
  Pie,
  Cell,
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

const PIE_COLORS = ['#1392ec', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];

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

  const dateRange = useMemo(() => {
    if (preset === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return getPresetRange(preset);
  }, [preset, customStart, customEnd]);

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

  // ── Chart 2: Cost Breakdown Pie (Labor vs Indirect) ─────────────────────────

  const costPieData = useMemo(() => {
    if (kpis.totalLaborCost === 0 && kpis.totalIndirectCost === 0) return [];
    return [
      { name: 'تكلفة العمالة', value: Number(kpis.totalLaborCost.toFixed(2)) },
      { name: 'تكاليف غير مباشرة', value: Number(kpis.totalIndirectCost.toFixed(2)) },
    ];
  }, [kpis.totalLaborCost, kpis.totalIndirectCost]);

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

  // ── Custom Tooltip ──────────────────────────────────────────────────────────

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 text-sm" dir="rtl">
        <p className="font-bold text-slate-600 dark:text-slate-300 mb-1">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }}></span>
            <span className="text-slate-500">{entry.name}:</span>
            <span className="font-bold">{formatNumber(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  const PieTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 text-sm" dir="rtl">
        <p className="font-bold">{d.name}</p>
        <p className="text-slate-500">{formatCost(d.value)} ج.م</p>
      </div>
    );
  };

  if (loading && reports.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
            <span className="material-icons-round text-blue-600 dark:text-blue-400 text-2xl">analytics</span>
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
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
            <span className="material-icons-round text-blue-600 dark:text-blue-400 text-2xl">analytics</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold">لوحة مدير المصنع</h2>
            <p className="text-sm text-slate-400">تحليلات متقدمة للإنتاج والتكاليف</p>
          </div>
        </div>
        {loading && (
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <span className="material-icons-round text-sm animate-spin">sync</span>
            جاري التحديث...
          </span>
        )}
      </div>

      {/* ── Period Filter ──────────────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="material-icons-round text-primary">date_range</span>
            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">الفترة:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PRESET_LABELS) as PeriodPreset[]).map((key) => (
              <button
                key={key}
                onClick={() => setPreset(key)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  preset === key
                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {PRESET_LABELS[key]}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800"
              />
              <span className="text-slate-400">—</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800"
              />
            </div>
          )}
          <div className="mr-auto text-xs text-slate-400 font-medium">
            {dateRange.start} → {dateRange.end}
          </div>
        </div>
      </Card>

      {/* ── KPI Section ────────────────────────────────────────────────────────── */}
      {isVisible('kpis') && (
      <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${canViewCosts ? 'xl:grid-cols-6' : 'xl:grid-cols-4'} gap-4`}>
        <KPIBox
          label="إجمالي الإنتاج"
          value={formatNumber(kpis.totalProduction)}
          icon="inventory"
          unit="وحدة"
          colorClass="bg-primary/10 text-primary"
        />
        {canViewCosts && (
          <KPIBox
            label="متوسط تكلفة الوحدة"
            value={formatCost(kpis.avgCostPerUnit)}
            icon="payments"
            unit="ج.م"
            colorClass="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
          />
        )}
        {canViewCosts && (() => {
          const cvColor = getKPIColor(Math.abs(kpis.costVariance), getKPIThreshold(systemSettings, 'costVariance'), true);
          return (
            <KPIBox
              label="انحراف التكلفة"
              value={`${kpis.costVariance > 0 ? '+' : ''}${kpis.costVariance}%`}
              icon="compare_arrows"
              colorClass={KPI_COLOR_CLASSES[cvColor]}
              trend={cvColor === 'good' ? 'ضمن المعيار' : 'أعلى من المعيار'}
              trendUp={cvColor === 'good'}
            />
          );
        })()}
        {(() => {
          const wasteColor = getKPIColor(kpis.wastePercent, getKPIThreshold(systemSettings, 'wasteRatio'), true);
          return (
            <KPIBox
              label="نسبة الهدر"
              value={`${kpis.wastePercent}%`}
              icon="delete_sweep"
              colorClass={KPI_COLOR_CLASSES[wasteColor]}
            />
          );
        })()}
        {(() => {
          const effColor = getKPIColor(kpis.efficiency, getKPIThreshold(systemSettings, 'efficiency'), false);
          return (
            <KPIBox
              label="الكفاءة العامة"
              value={`${kpis.efficiency}%`}
              icon="speed"
              colorClass={KPI_COLOR_CLASSES[effColor]}
              trend={effColor === 'good' ? 'ممتاز' : effColor === 'warning' ? 'جيد' : 'يحتاج تحسين'}
              trendUp={effColor !== 'danger'}
            />
          );
        })()}
        {(() => {
          const paColor = getKPIColor(kpis.planAchievementRate, getKPIThreshold(systemSettings, 'planAchievement'), false);
          return (
            <KPIBox
              label="تحقيق الخطط"
              value={`${kpis.planAchievementRate}%`}
              icon="fact_check"
              colorClass={KPI_COLOR_CLASSES[paColor]}
            />
          );
        })()}
      </div>
      )}

      {/* ── Alerts ─────────────────────────────────────────────────────────────── */}
      {isVisible('alerts') && alerts.length > 0 && (
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
      )}

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
                <h3 className="text-base font-black text-slate-800 dark:text-white">أوامر الشغل النشطة</h3>
                <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-black px-2 py-0.5 rounded-full">{activeWOs.length}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span className="font-bold">الإجمالي: {formatNumber(totalProduced)} / {formatNumber(totalQty)}</span>
                <span className={`font-black ${overallProgress >= 80 ? 'text-emerald-600' : overallProgress >= 50 ? 'text-amber-600' : 'text-slate-500'}`}>{overallProgress}%</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeWOs.map((wo) => {
                const product = _rawProducts.find((p) => p.id === wo.productId);
                const lineName = productionLines.find((l) => l.id === wo.lineId)?.name ?? _rawLines.find((l) => l.id === wo.lineId)?.name ?? '—';
                const supervisor = _rawEmployees.find((e) => e.id === wo.supervisorId);
                const progress = wo.quantity > 0 ? Math.round(((wo.producedQuantity ?? 0) / wo.quantity) * 100) : 0;
                const remaining = wo.quantity - (wo.producedQuantity ?? 0);
                const estCostPerUnit = wo.quantity > 0 ? wo.estimatedCost / wo.quantity : 0;

                return (
                  <div key={wo.id} onClick={() => navigate('/work-orders')} className={`rounded-2xl border p-5 space-y-4 transition-all cursor-pointer hover:ring-2 hover:ring-amber-200 dark:hover:ring-amber-800 ${wo.status === 'in_progress' ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-icons-round text-amber-500 text-lg">assignment</span>
                        <span className="text-sm font-black text-amber-700 dark:text-amber-400">أمر شغل #{wo.workOrderNumber}</span>
                      </div>
                      <Badge variant={wo.status === 'in_progress' ? 'warning' : 'neutral'}>
                        {wo.status === 'in_progress' ? 'قيد التنفيذ' : 'في الانتظار'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-slate-400 text-base">inventory_2</span>
                      <p className="text-base font-bold text-slate-700 dark:text-slate-200 truncate">{product?.name ?? '—'}</p>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="material-icons-round text-indigo-400 text-base">person</span>
                        <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{supervisor?.name ?? '—'}</span>
                      </div>
                      {canViewCosts && estCostPerUnit > 0 && (
                        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 rounded-lg px-3 py-1">
                          <span className="material-icons-round text-emerald-500 text-sm">payments</span>
                          <span className="text-[10px] text-slate-400">التكلفة المتوقعة</span>
                          <span className="text-sm font-black text-emerald-600">{formatCost(estCostPerUnit)}</span>
                          <span className="text-[10px] text-slate-400">/قطعة</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-white dark:bg-slate-800 rounded-xl p-3">
                        <p className="text-xs text-slate-400 font-medium mb-1">المطلوب</p>
                        <p className="text-lg font-black text-slate-700 dark:text-white">{formatNumber(wo.quantity)}</p>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-xl p-3">
                        <p className="text-xs text-slate-400 font-medium mb-1">تم إنتاجه</p>
                        <p className="text-lg font-black text-emerald-600">{formatNumber(wo.producedQuantity ?? 0)}</p>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-xl p-3">
                        <p className="text-xs text-slate-400 font-medium mb-1">المتبقي</p>
                        <p className="text-lg font-black text-rose-500">{formatNumber(remaining)}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-500">التقدم</span>
                        <span className={progress >= 80 ? 'text-emerald-600' : progress >= 50 ? 'text-amber-600' : 'text-slate-500'}>{progress}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-white dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-primary'}`}
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 text-xs text-slate-500 pt-1">
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
        );
      })()}

      {/* ── Active Production Plans ──────────────────────────────────────────── */}
      {(() => {
        const activePlans = productionPlans.filter((p) => p.status === 'in_progress' || p.status === 'planned');
        if (activePlans.length === 0) return null;

        const priorityCfg: Record<PlanPriority, { label: string; color: string; bg: string }> = {
          low: { label: 'منخفضة', color: 'text-slate-500', bg: 'bg-slate-100 dark:bg-slate-800' },
          medium: { label: 'متوسطة', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          high: { label: 'عالية', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
          urgent: { label: 'عاجلة', color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-900/20' },
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
                <h3 className="text-base font-black text-slate-800 dark:text-white">خطط الإنتاج النشطة</h3>
                <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-xs font-black px-2 py-0.5 rounded-full">{activePlans.length}</span>
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
                  <div key={plan.id} onClick={() => navigate('/production-plans')} className="rounded-2xl border bg-indigo-50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800/40 p-5 space-y-4 transition-all cursor-pointer hover:ring-2 hover:ring-indigo-200 dark:hover:ring-indigo-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="material-icons-round text-indigo-500 text-lg">event_note</span>
                        <span className={`text-xs font-black ${smart.color}`}>{smart.label}</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${pri.bg} ${pri.color}`}>{pri.label}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-slate-400 text-base">inventory_2</span>
                      <p className="text-base font-bold text-slate-700 dark:text-slate-200 truncate">{product?.name ?? '—'}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-slate-400 text-base">precision_manufacturing</span>
                      <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{line?.name ?? '—'}</span>
                      {canViewCosts && estCostPerUnit > 0 && (
                        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 rounded-lg px-3 py-1 mr-auto">
                          <span className="material-icons-round text-emerald-500 text-sm">payments</span>
                          <span className="text-[10px] text-slate-400">التكلفة المتوقعة</span>
                          <span className="text-sm font-black text-emerald-600">{formatCost(estCostPerUnit)}</span>
                          <span className="text-[10px] text-slate-400">/قطعة</span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div className="bg-white dark:bg-slate-800 rounded-xl p-3">
                        <p className="text-xs text-slate-400 font-medium mb-1">المخطط</p>
                        <p className="text-lg font-black text-slate-700 dark:text-white">{formatNumber(plan.plannedQuantity)}</p>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-xl p-3">
                        <p className="text-xs text-slate-400 font-medium mb-1">تم إنتاجه</p>
                        <p className="text-lg font-black text-emerald-600">{formatNumber(produced)}</p>
                      </div>
                      <div className="bg-white dark:bg-slate-800 rounded-xl p-3">
                        <p className="text-xs text-slate-400 font-medium mb-1">المتبقي</p>
                        <p className="text-lg font-black text-rose-500">{formatNumber(remaining)}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-500">التقدم</span>
                        <span className={progress >= 80 ? 'text-emerald-600' : progress >= 50 ? 'text-amber-600' : 'text-slate-500'}>{progress}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-white dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-1000 ${progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-primary'}`}
                          style={{ width: `${Math.min(progress, 100)}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 text-xs text-slate-500 pt-1">
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
              <div className="h-72 flex items-center justify-center text-slate-400 text-sm">
                <span className="material-icons-round ml-2">bar_chart</span>
                لا توجد بيانات للفترة المحددة
              </div>
            )}
          </Card>
        )}

        {/* Chart 2: Cost Breakdown Pie */}
        {isVisible('cost_breakdown') && canViewCosts && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <span className="material-icons-round text-amber-500">pie_chart</span>
              <h3 className="text-lg font-bold">توزيع التكاليف</h3>
            </div>
            {costPieData.length > 0 ? (
              <div style={{ direction: 'ltr' }} className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {costPieData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                لا توجد بيانات تكاليف
              </div>
            )}
            {costPieData.length > 0 && (
              <div className="mt-2 flex justify-center gap-6 text-sm">
                {costPieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }}></span>
                    <span className="text-slate-600 dark:text-slate-300">{d.name}: <strong>{formatCost(d.value)}</strong> ج.م</span>
                  </div>
                ))}
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
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
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
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
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
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-right py-3 px-4 font-bold text-slate-500">المنتج</th>
                    <th className="text-right py-3 px-4 font-bold text-slate-500">الإنتاج</th>
                    <th className="text-right py-3 px-4 font-bold text-slate-500">الحصة %</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p, i) => (
                    <tr key={i} onClick={() => navigate(`/products/${p.id}`)} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                      <td className="py-3 px-4 font-bold text-primary">{p.name}</td>
                      <td className="py-3 px-4">{formatNumber(p.production)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 max-w-[120px] h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-violet-500 rounded-full transition-all"
                              style={{ width: `${kpis.totalProduction > 0 ? (p.production / kpis.totalProduction) * 100 : 0}%` }}
                            ></div>
                          </div>
                          <span className="text-slate-500 text-xs font-bold">
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
            <div className="py-8 text-center text-slate-400 text-sm">لا توجد بيانات</div>
          )}
        </Card>}
      </div>
    </div>
  );
};
