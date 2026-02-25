import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { usePermission } from '../utils/permissions';
import { Card, KPIBox, Badge, LoadingSkeleton } from '../components/UI';
import { reportService } from '../services/reportService';
import { adminService, type SystemUsers } from '../services/adminService';
import { formatNumber, calculateWasteRatio } from '../utils/calculations';
import { exportProductSummary } from '../utils/exportExcel';
import {
  formatCost,
  getCurrentMonth,
  calculateDailyIndirectCost,
} from '../utils/costCalculations';
import {
  getAlertSettings,
  getKPIThreshold,
  getKPIColor,
  KPI_COLOR_CLASSES,
  isWidgetVisible,
  getWidgetOrder,
} from '../utils/dashboardConfig';
import type { ProductionReport, ActivityLog } from '../types';
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

// ── Period filter types (local to this dashboard) ────────────────────────────

type PeriodPreset = 'today' | 'week' | 'month' | '3months' | 'custom';

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
    case 'today':
      return { start: end, end };
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
  today: 'اليوم',
  week: 'هذا الأسبوع',
  month: 'هذا الشهر',
  '3months': 'آخر 3 أشهر',
  custom: 'مخصص',
};

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'تسجيل دخول',
  LOGOUT: 'تسجيل خروج',
  CREATE_REPORT: 'إنشاء تقرير',
  UPDATE_REPORT: 'تعديل تقرير',
  DELETE_REPORT: 'حذف تقرير',
  CREATE_USER: 'إنشاء مستخدم',
  UPDATE_USER_ROLE: 'تغيير صلاحية',
  TOGGLE_USER_ACTIVE: 'تفعيل/تعطيل مستخدم',
};

const ACTION_ICONS: Record<string, string> = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  CREATE_REPORT: 'note_add',
  UPDATE_REPORT: 'edit_note',
  DELETE_REPORT: 'delete',
  CREATE_USER: 'person_add',
  UPDATE_USER_ROLE: 'admin_panel_settings',
  TOGGLE_USER_ACTIVE: 'toggle_on',
};

// ── Gauge Chart Component ────────────────────────────────────────────────────

const GaugeChart: React.FC<{ value: number; label: string }> = ({ value, label }) => {
  const clampedValue = Math.max(0, Math.min(100, value));
  const angle = (clampedValue / 100) * 180;

  const getColor = (v: number) => {
    if (v >= 80) return '#10b981';
    if (v >= 60) return '#f59e0b';
    if (v >= 40) return '#f97316';
    return '#ef4444';
  };

  const getLabel = (v: number) => {
    if (v >= 80) return 'ممتاز';
    if (v >= 60) return 'جيد';
    if (v >= 40) return 'مقبول';
    return 'ضعيف';
  };

  const color = getColor(clampedValue);
  const statusLabel = getLabel(clampedValue);

  const startAngle = 180;
  const endAngle = startAngle - angle;
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;

  const cx = 120;
  const cy = 110;
  const r = 85;

  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy - r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy - r * Math.sin(endRad);
  const largeArc = angle > 180 ? 1 : 0;

  return (
    <div className="flex flex-col items-center">
      <svg width="240" height="140" viewBox="0 0 240 140">
        {/* Background arc */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="16"
          strokeLinecap="round"
          className="dark:stroke-slate-700"
        />
        {/* Value arc */}
        {clampedValue > 0 && (
          <path
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 0 ${x2} ${y2}`}
            fill="none"
            stroke={color}
            strokeWidth="16"
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 1s ease-in-out',
            }}
          />
        )}
        {/* Value text */}
        <text
          x={cx}
          y={cy - 10}
          textAnchor="middle"
          className="text-3xl font-black"
          fill={color}
          style={{ fontSize: '32px', fontWeight: 900 }}
        >
          {clampedValue}
        </text>
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          className="text-xs"
          fill="#94a3b8"
          style={{ fontSize: '13px', fontWeight: 700 }}
        >
          {statusLabel}
        </text>
        {/* Min/Max labels */}
        <text x={cx - r - 5} y={cy + 18} textAnchor="middle" fill="#94a3b8" style={{ fontSize: '10px', fontWeight: 600 }}>0</text>
        <text x={cx + r + 5} y={cy + 18} textAnchor="middle" fill="#94a3b8" style={{ fontSize: '10px', fontWeight: 600 }}>100</text>
      </svg>
      <p className="text-sm font-bold text-slate-600 dark:text-slate-300 -mt-2">{label}</p>
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermission();
  const canViewCosts = can('costs.view');

  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const workOrders = useAppStore((s) => s.workOrders);
  const liveProduction = useAppStore((s) => s.liveProduction);
  const productionPlans = useAppStore((s) => s.productionPlans);
  const planReports = useAppStore((s) => s.planReports);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const systemSettings = useAppStore((s) => s.systemSettings);

  const alertCfg = useMemo(() => getAlertSettings(systemSettings), [systemSettings]);
  const widgetOrder = useMemo(() => getWidgetOrder(systemSettings, 'adminDashboard'), [systemSettings]);
  const isVisible = useCallback(
    (widgetId: string) => isWidgetVisible(systemSettings, 'adminDashboard', widgetId),
    [systemSettings]
  );

  // ── Period filter state (local to this dashboard) ────────────────────────
  const [preset, setPreset] = useState<PeriodPreset>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [loading, setLoading] = useState(true);

  // ── System metrics state ─────────────────────────────────────────────────
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  const [systemUsers, setSystemUsers] = useState<SystemUsers>({ total: 0, active: 0, disabled: 0 });
  const [rolesDistribution, setRolesDistribution] = useState<{ roleName: string; color: string; count: number }[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [systemLoading, setSystemLoading] = useState(true);

  const dateRange = useMemo(() => {
    if (preset === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return getPresetRange(preset);
  }, [preset, customStart, customEnd]);

  // Fetch production reports by date range
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

  // Fetch system metrics (one-time, not affected by period)
  useEffect(() => {
    let cancelled = false;
    setSystemLoading(true);
    Promise.all([
      adminService.getSystemUsers(),
      adminService.getRolesDistribution(),
      adminService.getRecentActivity(10),
    ]).then(([users, roles, activity]) => {
      if (!cancelled) {
        setSystemUsers(users);
        setRolesDistribution(roles);
        setRecentActivity(activity);
        setSystemLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setSystemLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const hourlyRate = laborSettings?.hourlyRate ?? 0;

  // ── KPI Calculations ──────────────────────────────────────────────────────

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
      totalCost,
    };
  }, [reports, hourlyRate, costCenters, costCenterValues, costAllocations, lineProductConfigs, productionPlans, planReports]);

  // ── Cost Allocation Completion % ──────────────────────────────────────────

  const costAllocationCompletion = useMemo(() => {
    if (costCenters.length === 0) return 0;
    const currentMonth = getCurrentMonth();
    const activeCenters = costCenters.filter((c) => c.isActive);
    if (activeCenters.length === 0) return 0;

    let allocated = 0;
    activeCenters.forEach((center) => {
      const hasValue = costCenterValues.some((v) => v.costCenterId === center.id && v.month === currentMonth);
      const hasAllocation = costAllocations.some((a) => a.costCenterId === center.id && a.month === currentMonth);
      if (hasValue && hasAllocation) allocated++;
    });
    return Number(((allocated / activeCenters.length) * 100).toFixed(0));
  }, [costCenters, costCenterValues, costAllocations]);

  // ── Production Health Score ───────────────────────────────────────────────

  const healthScore = useMemo(() => {
    const efficiencyScore = Math.min(kpis.efficiency, 100);

    const varianceAbs = Math.abs(kpis.costVariance);
    const varianceScore = varianceAbs <= 5 ? 100 : varianceAbs <= 15 ? 70 : varianceAbs <= 30 ? 40 : 10;

    const wasteScore = kpis.wastePercent <= 2 ? 100 : kpis.wastePercent <= 5 ? 75 : kpis.wastePercent <= 10 ? 40 : 10;

    const planScore = kpis.planAchievementRate;

    const weights = { efficiency: 0.3, variance: 0.2, waste: 0.25, plan: 0.25 };
    const score = Math.round(
      efficiencyScore * weights.efficiency +
      varianceScore * weights.variance +
      wasteScore * weights.waste +
      planScore * weights.plan
    );

    return Math.max(0, Math.min(100, score));
  }, [kpis]);

  // ── Charts Data ───────────────────────────────────────────────────────────

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

  const costPieData = useMemo(() => {
    if (kpis.totalLaborCost === 0 && kpis.totalIndirectCost === 0) return [];
    return [
      { name: 'تكلفة العمالة', value: Number(kpis.totalLaborCost.toFixed(2)) },
      { name: 'تكاليف غير مباشرة', value: Number(kpis.totalIndirectCost.toFixed(2)) },
    ];
  }, [kpis.totalLaborCost, kpis.totalIndirectCost]);

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

  // ── Roles chart data ──────────────────────────────────────────────────────

  const rolesChartData = useMemo(() => {
    return rolesDistribution
      .filter((r) => r.count > 0)
      .map((r) => ({ name: r.roleName, value: r.count }));
  }, [rolesDistribution]);

  // ── Cost Centers Summary ──────────────────────────────────────────────────

  const costCentersSummary = useMemo(() => {
    const currentMonth = getCurrentMonth();
    return costCenters
      .filter((c) => c.isActive)
      .map((center) => {
        const monthValue = costCenterValues.find(
          (v) => v.costCenterId === center.id && v.month === currentMonth
        );
        const allocation = costAllocations.find(
          (a) => a.costCenterId === center.id && a.month === currentMonth
        );
        return {
          name: center.name,
          type: center.type,
          amount: monthValue?.amount ?? 0,
          allocated: !!allocation,
        };
      })
      .slice(0, 6);
  }, [costCenters, costCenterValues, costAllocations]);

  const liveScanKpis = useMemo(() => {
    const activeWorkOrderIds = new Set(
      workOrders
        .map((wo) => wo.id)
        .filter((id): id is string => !!id),
    );
    const summaries = Object.entries(liveProduction).filter(([woId]) => activeWorkOrderIds.has(woId));
    const totals = summaries.reduce(
      (acc, [, s]) => {
        acc.completedUnits += s.completedUnits || 0;
        acc.inProgressUnits += s.inProgressUnits || 0;
        acc.activeWorkers += s.activeWorkers || 0;
        if ((s.avgCycleSeconds || 0) > 0) {
          acc.avgCycleSecondsTotal += s.avgCycleSeconds || 0;
          acc.avgCycleCount += 1;
        }
        return acc;
      },
      { completedUnits: 0, inProgressUnits: 0, activeWorkers: 0, avgCycleSecondsTotal: 0, avgCycleCount: 0 },
    );
    const avgCycleSeconds = totals.avgCycleCount > 0
      ? Math.round(totals.avgCycleSecondsTotal / totals.avgCycleCount)
      : 0;

    const hottestFromLive = summaries
      .map(([woId, s]) => {
        const wo = workOrders.find((w) => w.id === woId);
        if (!wo) return null;
        const line = _rawLines.find((l) => l.id === wo.lineId)?.name ?? '—';
        const product = _rawProducts.find((p) => p.id === wo.productId)?.name ?? '—';
        return { woId, produced: s.completedUnits || 0, line, product };
      })
      .filter((x): x is { woId: string; produced: number; line: string; product: string } => !!x)
      .sort((a, b) => b.produced - a.produced)[0];

    const hottestFromWorkOrders = workOrders
      .filter((w) => w.status === 'pending' || w.status === 'in_progress')
      .map((w) => {
        const producedFromLive = liveProduction[w.id ?? '']?.completedUnits;
        const producedNow = producedFromLive ?? w.actualProducedFromScans ?? w.producedQuantity ?? 0;
        return {
          produced: producedNow,
          line: _rawLines.find((l) => l.id === w.lineId)?.name ?? '—',
          product: _rawProducts.find((p) => p.id === w.productId)?.name ?? '—',
        };
      })
      .sort((a, b) => b.produced - a.produced)[0];

    const hottest = hottestFromLive ?? hottestFromWorkOrders;

    return {
      ...totals,
      avgCycleSeconds,
      hotLineProduct: hottest ? `${hottest.line} — ${hottest.product}` : '—',
    };
  }, [liveProduction, workOrders, _rawLines, _rawProducts]);

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

    const defectRate = totals.inspected > 0
      ? Number((((totals.failed + totals.rework) / totals.inspected) * 100).toFixed(2))
      : 0;
    const avgFpy = totals.fpyCount > 0 ? Number((totals.fpyTotal / totals.fpyCount).toFixed(2)) : 0;
    const pendingQuality = active.filter((wo) => wo.qualityStatus && wo.qualityStatus !== 'approved').length;

    return {
      inspected: totals.inspected,
      failed: totals.failed,
      rework: totals.rework,
      defectRate,
      avgFpy,
      pendingQuality,
    };
  }, [workOrders]);

  // ── Product Summary (products worked on during the period) ────────────────

  const productSummary = useMemo(() => {
    const map = new Map<string, { qty: number; laborCost: number; indirectCost: number }>();

    const lineMonthIndirectCache = new Map<string, number>();
    const lineDateTotals = new Map<string, number>();
    reports.forEach((r) => {
      const key = `${r.lineId}_${r.date}`;
      lineDateTotals.set(key, (lineDateTotals.get(key) || 0) + (r.quantityProduced || 0));
    });

    reports.forEach((r) => {
      if (!r.quantityProduced || r.quantityProduced <= 0) return;
      const prev = map.get(r.productId) || { qty: 0, laborCost: 0, indirectCost: 0 };
      prev.qty += r.quantityProduced;
      prev.laborCost += (r.workersCount || 0) * (r.workHours || 0) * hourlyRate;

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
        prev.indirectCost += lineIndirect * (r.quantityProduced / lineDateTotal);
      }

      map.set(r.productId, prev);
    });

    return Array.from(map.entries())
      .map(([productId, d]) => {
        const product = _rawProducts.find((p) => p.id === productId);
        return {
          id: productId,
          name: product?.name || productId,
          code: product?.code || '',
          category: product?.model || 'غير مصنفة',
          qty: d.qty,
          avgCost: d.qty > 0 ? (d.laborCost + d.indirectCost) / d.qty : 0,
        };
      })
      .sort((a, b) => b.qty - a.qty);
  }, [reports, _rawProducts, hourlyRate, costCenters, costCenterValues, costAllocations]);

  const productSummaryCategories = useMemo(() => {
    const categories = productSummary
      .map((p) => p.category)
      .filter((category): category is string => category.trim().length > 0);
    return (Array.from(new Set(categories)) as string[])
      .sort((a, b) => a.localeCompare(b, 'ar'));
  }, [productSummary]);

  // ── Alerts ────────────────────────────────────────────────────────────────

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

    if (systemUsers.disabled > 0) {
      result.push({
        type: 'info',
        icon: 'person_off',
        message: `يوجد ${systemUsers.disabled} حساب معطل في النظام`,
      });
    }

    if (result.length === 0) {
      result.push({
        type: 'info',
        icon: 'check_circle',
        message: 'لا توجد تنبيهات — النظام يعمل بشكل طبيعي',
      });
    }

    return result;
  }, [kpis, productionPlans, planReports, systemUsers, alertCfg]);

  // ── Tooltips ──────────────────────────────────────────────────────────────

  const ChartTooltip = useCallback(({ active, payload, label }: any) => {
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
  }, []);

  const PieTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 text-sm" dir="rtl">
        <p className="font-bold">{d.name}</p>
        <p className="text-slate-500">{typeof d.value === 'number' && d.value > 1000 ? formatCost(d.value) + ' ج.م' : d.value}</p>
      </div>
    );
  }, []);

  // ── Format timestamp helper ───────────────────────────────────────────────

  const formatTimestamp = (ts: any): string => {
    if (!ts) return '—';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }) +
      ' ' + date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };

  // ── Loading State ─────────────────────────────────────────────────────────

  if (loading && reports.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 rounded-xl flex items-center justify-center">
            <span className="material-icons-round text-rose-600 dark:text-rose-400 text-2xl">shield</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold">لوحة مدير النظام</h2>
            <p className="text-sm text-slate-400">جاري تحميل البيانات...</p>
          </div>
        </div>
        <LoadingSkeleton rows={6} type="card" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Alerts ──────────────────────────────────────────────────────────── */}
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

     

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-rose-100 dark:bg-rose-900/30 rounded-xl flex items-center justify-center">
            <span className="material-icons-round text-rose-600 dark:text-rose-400 text-2xl">shield</span>
          </div>
          <div>
            <h2 className="text-2xl font-bold">لوحة مدير النظام</h2>
            <p className="text-sm text-slate-400">نظرة شاملة على الإنتاج والنظام والصحة العامة</p>
          </div>
        </div>
        {(loading || systemLoading) && (
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <span className="material-icons-round text-sm animate-spin">sync</span>
            جاري التحديث...
          </span>
        )}
      </div>

      {/* ── Period Filter ───────────────────────────────────────────────────── */}
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
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart || dateRange.start}
              onChange={(e) => { setCustomStart(e.target.value); setPreset('custom'); }}
              className={`border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 transition-all ${
                preset === 'custom'
                  ? 'border-primary ring-1 ring-primary/20'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            />
            <span className="text-slate-400">—</span>
            <input
              type="date"
              value={customEnd || dateRange.end}
              onChange={(e) => { setCustomEnd(e.target.value); setPreset('custom'); }}
              className={`border rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 transition-all ${
                preset === 'custom'
                  ? 'border-primary ring-1 ring-primary/20'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            />
          </div>
          <div className="mr-auto text-xs text-slate-400 font-medium">
            {dateRange.start} → {dateRange.end}
          </div>
        </div>
      </Card>
 

      {/* ── Operational KPIs ────────────────────────────────────────────────── */}
      {isVisible('operational_kpis') && (
      <div>
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="material-icons-round text-base">precision_manufacturing</span>
          مؤشرات تشغيلية
        </h3>
        <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${canViewCosts ? 'xl:grid-cols-6' : 'xl:grid-cols-3'} gap-4`}>
          <KPIBox
            label="إجمالي الإنتاج"
            value={formatNumber(kpis.totalProduction)}
            icon="inventory"
            unit="وحدة"
            colorClass="bg-primary/10 text-primary"
          />
          {canViewCosts && (
            <KPIBox
              label={`إجمالي التكلفة (${PRESET_LABELS[preset]})`}
              value={formatCost(kpis.totalCost)}
              icon="account_balance_wallet"
              unit="ج.م"
              colorClass="bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400"
            />
          )}
          {canViewCosts && (
            <KPIBox
              label="تكلفة الوحدة"
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
        </div>
      </div>
      )}

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <span className="material-icons-round text-blue-500">bolt</span>
          <h3 className="text-lg font-bold">الإنتاج اللحظي (الباركود)</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPIBox label="وحدات مكتملة الآن" value={liveScanKpis.completedUnits} icon="check_circle" colorClass="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" />
          <KPIBox label="وحدات قيد التشغيل" value={liveScanKpis.inProgressUnits} icon="hourglass_top" colorClass="bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" />
          <KPIBox label="عمالة فعالة" value={liveScanKpis.activeWorkers} icon="groups" colorClass="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" />
          <KPIBox label="متوسط سيكل تايم" value={liveScanKpis.avgCycleSeconds} unit="ث" icon="timer" colorClass="bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400" />
        </div>
        <p className="text-xs text-slate-500 mt-4">
          أعلى نشاط حالي: <span className="font-bold text-slate-700 dark:text-slate-300">{liveScanKpis.hotLineProduct}</span>
        </p>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <span className="material-icons-round text-violet-500">verified</span>
          <h3 className="text-lg font-bold">مؤشرات الجودة</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KPIBox label="وحدات مفحوصة" value={qualityKpis.inspected} icon="fact_check" colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
          <KPIBox label="وحدات فاشلة" value={qualityKpis.failed} icon="error" colorClass="bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400" />
          <KPIBox label="إعادة تشغيل" value={qualityKpis.rework} icon="build" colorClass="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" />
          <KPIBox label="Defect Rate" value={qualityKpis.defectRate} unit="%" icon="priority_high" colorClass="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400" />
          <KPIBox label="FPY" value={qualityKpis.avgFpy} unit="%" icon="insights" colorClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" />
          <KPIBox label="Pending Quality" value={qualityKpis.pendingQuality} icon="pending_actions" colorClass="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" />
        </div>
      </Card>
{/* ── Active Work Orders (same visual style) ─────────────────────────── */}
{(() => {
        const activeWOs = workOrders.filter((w) => w.status === 'pending' || w.status === 'in_progress');
        if (activeWOs.length === 0) return null;
        const totalQty = activeWOs.reduce((s, w) => s + w.quantity, 0);
        const totalProduced = activeWOs.reduce((s, w) => {
          const producedFromLive = liveProduction[w.id ?? '']?.completedUnits;
          const producedNow = producedFromLive ?? w.actualProducedFromScans ?? w.producedQuantity ?? 0;
          return s + producedNow;
        }, 0);
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
                const lineName = _rawLines.find((l) => l.id === wo.lineId)?.name ?? '—';
                const supervisor = _rawEmployees.find((e) => e.id === wo.supervisorId);
                const producedFromLive = liveProduction[wo.id ?? '']?.completedUnits;
                const producedNow = producedFromLive ?? wo.actualProducedFromScans ?? wo.producedQuantity ?? 0;
                const progress = wo.quantity > 0 ? Math.round((producedNow / wo.quantity) * 100) : 0;
                const remaining = wo.quantity - producedNow;
                const estCostPerUnit = wo.quantity > 0 ? wo.estimatedCost / wo.quantity : 0;

                return (
                  <div
                    key={wo.id}
                    onClick={() => navigate('/work-orders')}
                    className={`rounded-2xl border p-5 space-y-4 transition-all cursor-pointer hover:ring-2 hover:ring-amber-200 dark:hover:ring-amber-800 ${
                      wo.status === 'in_progress'
                        ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/40'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                    }`}
                  >
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
                        <p className="text-lg font-black text-emerald-600">{formatNumber(producedNow)}</p>
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
      {/* ── Product Summary Table ──────────────────────────────────────────── */}
      {productSummary.length > 0 && (() => {
        const q = productSearch.trim().toLowerCase();
        const byCategory = productCategoryFilter === 'all'
          ? productSummary
          : productSummary.filter((p) => p.category === productCategoryFilter);
        const filtered = q
          ? byCategory.filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
          : byCategory;
        return (
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-primary">inventory_2</span>
                <h3 className="text-lg font-bold">ملخص المنتجات خلال الفترة</h3>
                <Badge variant="info">{productSummary.length} منتج</Badge>
              </div>
              <div className="flex items-center gap-2 sm:mr-auto">
              <div className="relative">
                  <span className="material-icons-round text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 text-sm">search</span>
                  <input
                    type="text"
                    placeholder="بحث بالكود أو الاسم..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold w-full sm:w-56 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                  />
                </div>
               
                <div className="relative">
                  <span className="material-icons-round text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 text-sm">category</span>
                  <select
                    value={productCategoryFilter}
                    onChange={(e) => setProductCategoryFilter(e.target.value)}
                    className="pr-9 pl-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold w-full sm:w-44 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all appearance-none"
                  >
                    <option value="all">كل الفئات</option>
                    {productSummaryCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => exportProductSummary(filtered, canViewCosts)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-primary/5 hover:border-primary/30 hover:text-primary transition-all"
                  title="تصدير Excel"
                >
                  <span className="material-icons-round text-sm">download</span>
                  <span className="hidden sm:inline">Excel</span>
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-right py-3 px-4 font-bold text-slate-500 text-xs">#</th>
                    <th className="text-right py-3 px-4 font-bold text-slate-500 text-xs">المنتج</th>
                    <th className="text-right py-3 px-4 font-bold text-slate-500 text-xs">الكود</th>
                    <th className="text-right py-3 px-4 font-bold text-slate-500 text-xs">الكمية المنتجة</th>
                    {canViewCosts && (
                      <th className="text-right py-3 px-4 font-bold text-slate-500 text-xs">متوسط تكلفة الوحدة</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={canViewCosts ? 5 : 4} className="py-8 text-center text-slate-400 text-sm">
                        لا توجد نتائج مطابقة للفلاتر الحالية
                      </td>
                    </tr>
                  ) : (
                    filtered.map((p, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 px-4 text-slate-400 font-mono text-xs">{i + 1}</td>
                        <td className="py-3 px-4 font-bold">
                          <button
                            onClick={() => navigate(`/products/${p.id}`)}
                            className="text-primary hover:underline cursor-pointer transition-colors"
                          >{p.name}</button>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{p.code}</td>
                        <td className="py-3 px-4 font-mono font-bold text-primary">{formatNumber(p.qty)}</td>
                        {canViewCosts && (
                          <td className="py-3 px-4 font-mono font-bold text-amber-600 dark:text-amber-400">{formatCost(p.avgCost)} ج.م</td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                      <td colSpan={3} className="py-3 px-4 font-black text-slate-600 dark:text-slate-300">الإجمالي</td>
                      <td className="py-3 px-4 font-mono font-black text-primary">{formatNumber(filtered.reduce((s, p) => s + p.qty, 0))}</td>
                      {canViewCosts && (
                        <td className="py-3 px-4 font-mono font-bold text-amber-600 dark:text-amber-400">
                          {formatCost(filtered.reduce((s, p) => s + p.qty, 0) > 0
                            ? filtered.reduce((s, p) => s + p.avgCost * p.qty, 0) / filtered.reduce((s, p) => s + p.qty, 0)
                            : 0
                          )} ج.م
                        </td>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        );
      })()}

      {/* ── System KPIs ─────────────────────────────────────────────────────── */}
      {isVisible('system_kpis') && <div>
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="material-icons-round text-base">computer</span>
          مؤشرات النظام
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <KPIBox
            label="إجمالي المستخدمين"
            value={systemUsers.total}
            icon="group"
            colorClass="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
          />
          <KPIBox
            label="مستخدمون نشطون"
            value={systemUsers.active}
            icon="person"
            colorClass="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
          />
          <KPIBox
            label="حسابات معطلة"
            value={systemUsers.disabled}
            icon="person_off"
            colorClass={systemUsers.disabled > 0 ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}
          />
          <KPIBox
            label="أوامر الشغل النشطة"
            value={productionPlans.filter((p) => p.status === 'in_progress' || p.status === 'planned').length}
            icon="assignment"
            colorClass="bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400"
          />
          {canViewCosts && (() => {
            const caColor = getKPIColor(costAllocationCompletion, getKPIThreshold(systemSettings, 'costAllocation'), false);
            return (
              <KPIBox
                label="اكتمال التخصيص"
                value={`${costAllocationCompletion}%`}
                icon="account_balance"
                colorClass={KPI_COLOR_CLASSES[caColor]}
                trend={costAllocationCompletion >= 100 ? 'مكتمل' : 'غير مكتمل'}
                trendUp={caColor !== 'danger'}
              />
            );
          })()}
        </div>
      </div>}

     
      {/* ── Production Health Score + Charts ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Health Score Gauge */}
        {isVisible('health_score') && <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="material-icons-round text-rose-500">monitor_heart</span>
            <h3 className="text-lg font-bold">صحة الإنتاج</h3>
          </div>
          <div className="flex justify-center py-4">
            <GaugeChart value={healthScore} label="مؤشر صحة الإنتاج" />
          </div>
          <div className="mt-4 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            {[
              { label: 'الكفاءة', value: kpis.efficiency, weight: '30%', icon: 'speed' },
              { label: 'انحراف التكلفة', value: Math.abs(kpis.costVariance) <= 5 ? 100 : Math.abs(kpis.costVariance) <= 15 ? 70 : 40, weight: '20%', icon: 'compare_arrows' },
              { label: 'الهدر', value: kpis.wastePercent <= 2 ? 100 : kpis.wastePercent <= 5 ? 75 : 40, weight: '25%', icon: 'delete_sweep' },
              { label: 'تحقيق الخطط', value: kpis.planAchievementRate, weight: '25%', icon: 'fact_check' },
            ].map((metric) => (
              <div key={metric.label} className="flex items-center gap-3">
                <span className="material-icons-round text-sm text-slate-400">{metric.icon}</span>
                <span className="text-xs font-bold text-slate-500 flex-1">{metric.label}</span>
                <span className="text-[10px] text-slate-400 font-medium">({metric.weight})</span>
                <div className="w-20 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      metric.value >= 75 ? 'bg-emerald-500' : metric.value >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(metric.value, 100)}%` }}
                  ></div>
                </div>
                <span className="text-xs font-black text-slate-600 dark:text-slate-300 w-8 text-left">{Math.round(metric.value)}</span>
              </div>
            ))}
          </div>
        </Card>}

        {/* Cost Breakdown Pie */}
        {isVisible('cost_breakdown') && canViewCosts && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <span className="material-icons-round text-amber-500">pie_chart</span>
              <h3 className="text-lg font-bold">توزيع التكاليف</h3>
            </div>
            {costPieData.length > 0 ? (
              <div style={{ direction: 'ltr' }} className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={costPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
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
              <div className="h-56 flex items-center justify-center text-slate-400 text-sm">
                لا توجد بيانات تكاليف
              </div>
            )}
            {costPieData.length > 0 && (
              <div className="mt-2 flex justify-center gap-6 text-sm">
                {costPieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }}></span>
                    <span className="text-slate-600 dark:text-slate-300 text-xs">{d.name}: <strong>{formatCost(d.value)}</strong> ج.م</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Roles Distribution Pie */}
        {isVisible('roles_distribution') && <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="material-icons-round text-indigo-500">admin_panel_settings</span>
            <h3 className="text-lg font-bold">توزيع الأدوار</h3>
          </div>
          {rolesChartData.length > 0 ? (
            <div style={{ direction: 'ltr' }} className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={rolesChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, value }) => `${name} (${value})`}
                  >
                    {rolesChartData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-slate-400 text-sm">
              {systemLoading ? 'جاري التحميل...' : 'لا توجد بيانات'}
            </div>
          )}
          {rolesChartData.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
              {rolesChartData.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}></span>
                  <span className="text-slate-600 dark:text-slate-300 font-bold">{d.name}: {d.value}</span>
                </div>
              ))}
            </div>
          )}
        </Card>}
      </div>

      {/* ── Production vs Cost Chart (full width) ────────────────────────────── */}
      {isVisible('production_cost_chart') && canViewCosts && (
        <Card>
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

      {/* ── System Monitoring Section ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Log Snapshot */}
        {isVisible('activity_log') && <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="material-icons-round text-blue-500">history</span>
            <h3 className="text-lg font-bold">آخر النشاطات</h3>
            <span className="text-xs text-slate-400 font-medium mr-auto">آخر 10 إجراءات</span>
          </div>
          {recentActivity.length > 0 ? (
            <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
              {recentActivity.map((log, i) => (
                <div
                  key={log.id || i}
                  onClick={() => navigate('/activity-log')}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="material-icons-round text-sm text-slate-500">
                      {ACTION_ICONS[log.action] || 'info'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-black text-slate-700 dark:text-slate-300 truncate">
                        {log.userEmail}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold shrink-0">
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 truncate">{log.description}</p>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap shrink-0 mt-1">
                    {formatTimestamp(log.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-400 text-sm">
              <span className="material-icons-round text-3xl mb-2 block opacity-30">history</span>
              {systemLoading ? 'جاري التحميل...' : 'لا توجد نشاطات مسجلة'}
            </div>
          )}
        </Card>}

        {/* Cost Centers Summary */}
        {isVisible('cost_centers_summary') && canViewCosts && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <span className="material-icons-round text-emerald-500">account_balance</span>
              <h3 className="text-lg font-bold">ملخص مراكز التكلفة</h3>
              <span className="text-xs text-slate-400 font-medium mr-auto">الشهر الحالي</span>
            </div>
            {costCentersSummary.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-right py-3 px-3 font-bold text-slate-500 text-xs">المركز</th>
                      <th className="text-right py-3 px-3 font-bold text-slate-500 text-xs">النوع</th>
                      <th className="text-right py-3 px-3 font-bold text-slate-500 text-xs">المبلغ</th>
                      <th className="text-center py-3 px-3 font-bold text-slate-500 text-xs">التخصيص</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costCentersSummary.map((cc, i) => (
                      <tr key={i} onClick={() => navigate('/cost-centers')} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer">
                        <td className="py-2.5 px-3 font-bold text-sm">{cc.name}</td>
                        <td className="py-2.5 px-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            cc.type === 'indirect'
                              ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                              : 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                          }`}>
                            {cc.type === 'indirect' ? 'غير مباشر' : 'مباشر'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-sm font-bold text-slate-600 dark:text-slate-300">
                          {cc.amount > 0 ? `${formatCost(cc.amount)} ج.م` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {cc.allocated ? (
                            <span className="material-icons-round text-emerald-500 text-sm">check_circle</span>
                          ) : (
                            <span className="material-icons-round text-slate-300 dark:text-slate-600 text-sm">radio_button_unchecked</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-sm">
                <span className="material-icons-round text-3xl mb-2 block opacity-30">account_balance</span>
                لا توجد مراكز تكلفة
              </div>
            )}
          </Card>
        )}
      </div>

      {/* ── Top Lines & Products ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Lines */}
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

        {/* Top 5 Products */}
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
      </div>

      {/* ── Product Performance Table ────────────────────────────────────────── */}
      {isVisible('product_performance') && <Card>
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
  );
};
