
import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Factory,
  Flag,
  Hammer,
  Info,
  Lightbulb,
  Loader2,
  Sparkles,
  TrendingUp,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { filterProductionProducts } from '@/modules/production/utils/isProductionProduct';
import { Button } from '../components/UI';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { EmployeeDashboardWidget } from '../../../components/EmployeeDashboardWidget';
import { DomainHomeShell } from '../components/DomainHomeShell';
import { ModuleChartsHomeBoard } from '../components/ModuleChartsHomeBoard';
import { useAppStore, getProductionReportsRangeCacheKey } from '../../../store/useAppStore';
import {
  formatNumber,
  buildDashboardKPIs,
  calculateAvgAssemblyTime,
  calculateDailyCapacity,
  calculateEstimatedDays,
} from '../../../utils/calculations';
import { effectiveStandardAssemblyMinutes } from '../../../utils/routingStandardAssembly';
import {
  buildLineCosts,
  formatCost,
  ProductCostData,
  buildDailyProductionCostChart,
  getCurrentMonth,
  computeLiveProductCosts,
  buildSupervisorHourlyRatesMap,
} from '../../../utils/costCalculations';
import {
  buildManufacturingItemNameMap,
  resolveManufacturingItemName,
} from '../../../utils/manufacturingItemLabels';
import { monthlyProductionCostService, type MonthlyDashboardCostSummary } from '@/modules/costs/services/monthlyProductionCostService';
import { ProductionLineStatus, ProductionReport } from '../../../types';
import { usePermission } from '../../../utils/permissions';
import {
  ComposedChart,
  Line,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const DailyChartTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  return (
    <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-3 shadow-lg text-right min-w-[180px]">
      <p className="text-xs font-bold text-[var(--color-text-muted)] mb-2 border-b border-[var(--color-border)] pb-1.5">{data.date}</p>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-6">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 shrink-0"></span><span className="text-[var(--color-text-muted)] font-bold">الإنتاج</span></span>
          <span className="font-bold text-blue-600">{formatNumber(data.production)} وحدة</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-[var(--color-text-muted)] font-bold">تكلفة العمالة</span>
          <span className="font-bold text-[var(--color-text)]">{formatCost(data.laborCost)} ج.م</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-[var(--color-text-muted)] font-bold">غير مباشرة</span>
          <span className="font-bold text-[var(--color-text)]">{formatCost(data.indirectCost)} ج.م</span>
        </div>
        <div className="flex justify-between gap-6 pt-1.5 border-t border-[var(--color-border)]">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-500 shrink-0"></span><span className="text-[var(--color-text-muted)] font-bold">تكلفة الوحدة</span></span>
          <span className="font-bold text-violet-600">{formatCost(data.costPerUnit)} ج.م</span>
        </div>
      </div>
    </div>
  );
};

const DASHBOARD_ICON_MAP: Record<string, LucideIcon> = {
  inventory: Factory,
  price_check: WalletCards,
  close: X,
  info: Info,
  insights: TrendingUp,
  refresh: Loader2,
  bar_chart: BarChart3,
  precision_manufacturing: Hammer,
  flag: Flag,
  calculate: Lightbulb,
  add_task: Sparkles,
  build: Hammer,
  check_circle: CheckCircle2,
};

const DashboardIcon = ({
  name,
  ...iconProps
}: {
  name: string;
} & React.ComponentProps<'svg'>) => {
  const Icon = DASHBOARD_ICON_MAP[name] ?? AlertTriangle;
  return <Icon {...iconProps} />;
};

export const Dashboard: React.FC = () => {
  const productionLines = useAppStore((s) => s.productionLines);
  const storeTodayReports = useAppStore((s) => s.todayReports);
  const storeMonthlyReports = useAppStore((s) => s.monthlyReports);
  const products = useAppStore((s) => s.products);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const lineStatuses = useAppStore((s) => s.lineStatuses);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const routingTotalTimeSecondsByProduct = useAppStore((s) => s.routingTotalTimeSecondsByProduct);
  const loading = useAppStore((s) => s.loading);
  const createLineStatus = useAppStore((s) => s.createLineStatus);
  const updateLineStatus = useAppStore((s) => s.updateLineStatus);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const assets = useAppStore((s) => s.assets);
  const assetDepreciations = useAppStore((s) => s.assetDepreciations);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const uid = useAppStore((s) => s.uid);
  const systemSettings = useAppStore((s) => s.systemSettings);
  const ensureProductionReportsForRange = useAppStore((s) => s.ensureProductionReportsForRange);
  const reportsUiReferenceCache = useAppStore((s) => s.reportsUiReferenceCache);
  const ensureReportsUiReferenceData = useAppStore((s) => s.ensureReportsUiReferenceData);
  const navigate = useTenantNavigate();

  const { can } = usePermission();
  const canViewCosts = can('costs.view');

  const linkedEmployee = useMemo(
    () => _rawEmployees.find((s) => s.userId === uid),
    [_rawEmployees, uid]
  );

  useEffect(() => {
    void ensureReportsUiReferenceData();
  }, [ensureReportsUiReferenceData]);

  const rawMaterialOptions = reportsUiReferenceCache?.rawMaterialOptions;
  const manufacturingNameMap = useMemo(
    () => buildManufacturingItemNameMap(_rawProducts, products, rawMaterialOptions ?? []),
    [_rawProducts, products, rawMaterialOptions],
  );

  const deskTodayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('ar-EG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    []
  );

  if (linkedEmployee && !canViewCosts) {
    return <EmployeeDashboardWidget employeeId={linkedEmployee.id!} employeeName={linkedEmployee.name} />;
  }

  const [selectedProductId, setSelectedProductId] = useState('');
  const [planQuantity, setPlanQuantity] = useState<number>(0);

  const [costProductIds, setCostProductIds] = useState<string[]>([]);
  const [costProductCandidate, setCostProductCandidate] = useState('');

  // â”€â”€ Daily Production vs Cost Chart â”€â”€
  const [chartProductId, setChartProductId] = useState('');
  const [chartLineId, setChartLineId] = useState('');
  const [chartMonth, setChartMonth] = useState(getCurrentMonth);
  const [chartReports, setChartReports] = useState<ProductionReport[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [todayReportsScoped, setTodayReportsScoped] = useState<ProductionReport[]>([]);
  const [monthlyReportsScoped, setMonthlyReportsScoped] = useState<ProductionReport[]>([]);
  const [monthlyCostSummary, setMonthlyCostSummary] = useState<MonthlyDashboardCostSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const month = getCurrentMonth();
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
    const today = new Date().toISOString().slice(0, 10);
    const maxAgeMs = 5 * 60 * 1000;
    const kToday = getProductionReportsRangeCacheKey(today, today);
    const kMonth = getProductionReportsRangeCacheKey(monthStart, monthEnd);
    const cache = useAppStore.getState().productionReportsRangeCache;
    if (cache[kToday]) setTodayReportsScoped(cache[kToday].rows);
    if (cache[kMonth]) setMonthlyReportsScoped(cache[kMonth].rows);
    void Promise.all([
      ensureProductionReportsForRange(today, today, { maxAgeMs }),
      ensureProductionReportsForRange(monthStart, monthEnd, { maxAgeMs }),
    ])
      .then(([todayRows, monthRows]) => {
        if (cancelled) return;
        setTodayReportsScoped(todayRows);
        setMonthlyReportsScoped(monthRows);
      })
      .catch(() => {
        if (cancelled) return;
        setTodayReportsScoped([]);
        setMonthlyReportsScoped([]);
      });
    return () => { cancelled = true; };
  }, [ensureProductionReportsForRange]);

  useEffect(() => {
    let cancelled = false;
    const month = getCurrentMonth();
    monthlyProductionCostService.getDashboardMonthlySummary(month)
      .then((summary) => {
        if (!cancelled) setMonthlyCostSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setMonthlyCostSummary(null);
      });
    return () => { cancelled = true; };
  }, []);

  const todayReports = todayReportsScoped.length > 0 ? todayReportsScoped : storeTodayReports;
  const monthlyReports = monthlyReportsScoped.length > 0 ? monthlyReportsScoped : storeMonthlyReports;

  // â”€â”€ Set Target Modal â”€â”€
  const [targetModal, setTargetModal] = useState<{ lineId: string; lineName: string } | null>(null);
  const [targetForm, setTargetForm] = useState({ currentProductId: '', targetTodayQty: 0 });
  const [targetSaving, setTargetSaving] = useState(false);

  const openTargetModal = (lineId: string, lineName: string) => {
    const existing = lineStatuses.find((s) => s.lineId === lineId);
    setTargetForm({
      currentProductId: existing?.currentProductId ?? '',
      targetTodayQty: existing?.targetTodayQty ?? 0,
    });
    setTargetModal({ lineId, lineName });
  };

  const handleSaveTarget = async () => {
    if (!targetModal) return;
    setTargetSaving(true);
    const existing = lineStatuses.find((s) => s.lineId === targetModal.lineId);
    if (existing?.id) {
      await updateLineStatus(existing.id, {
        currentProductId: targetForm.currentProductId,
        targetTodayQty: targetForm.targetTodayQty,
      });
    } else {
      await createLineStatus({
        lineId: targetModal.lineId,
        currentProductId: targetForm.currentProductId,
        targetTodayQty: targetForm.targetTodayQty,
      });
    }
    setTargetSaving(false);
    setTargetModal(null);
  };

  const kpis = buildDashboardKPIs(todayReports, monthlyReports);
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
  const liveTodayCostComputation = useMemo(
    () => computeLiveProductCosts(
      todayReports,
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
      todayReports,
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
  const reportsForAnalysis = monthlyReports.length > 0 ? monthlyReports : todayReports;
  const liveAnalysisCostComputation = useMemo(
    () => computeLiveProductCosts(
      reportsForAnalysis,
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
      reportsForAnalysis,
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

  const lineCosts = useMemo(
    () => buildLineCosts(
      productionLines.map((l) => l.id),
      todayReports, laborSettings, costCenters, costCenterValues, costAllocations
    ),
    [productionLines, todayReports, laborSettings, costCenters, costCenterValues, costAllocations]
  );

  const monthlyPerProduct = monthlyCostSummary?.perProduct || {};

  const productCosts = useMemo(() => {
    if (!canViewCosts) return {};
    const pids = [...new Set(productionLines.map((l) => l.currentProductId).filter(Boolean))];
    if (pids.length === 0) return {};
    const result: Record<string, ProductCostData> = {};
    pids.forEach((pid) => {
      const monthlyRow = monthlyPerProduct[pid];
      if (monthlyRow) {
        result[pid] = {
          laborCost: monthlyRow.directCost,
          indirectCost: monthlyRow.indirectCost,
          totalCost: monthlyRow.totalCost,
          quantityProduced: monthlyRow.producedQty,
          costPerUnit: monthlyRow.averageUnitCost,
        };
        return;
      }
      const row = liveTodayCostComputation.byProduct[pid];
      if (!row) {
        result[pid] = { laborCost: 0, indirectCost: 0, totalCost: 0, quantityProduced: 0, costPerUnit: 0 };
      } else {
        result[pid] = row;
      }
    });
    return result;
  }, [canViewCosts, productionLines, monthlyPerProduct, liveTodayCostComputation.byProduct]);

  const costAnalysisMap = useMemo(() => {
    if (!canViewCosts || costProductIds.length === 0) return {};
    const result: Record<string, ProductCostData> = {};
    for (const pid of costProductIds) {
      const monthlyRow = monthlyPerProduct[pid];
      const avg = monthlyRow
        ? {
            laborCost: monthlyRow.directCost,
            indirectCost: monthlyRow.indirectCost,
            totalCost: monthlyRow.totalCost,
            quantityProduced: monthlyRow.producedQty,
            costPerUnit: monthlyRow.averageUnitCost,
          }
        : (liveAnalysisCostComputation.byProduct[pid] || { laborCost: 0, indirectCost: 0, totalCost: 0, quantityProduced: 0, costPerUnit: 0 });
      if (avg.quantityProduced > 0) result[pid] = avg;
    }
    return result;
  }, [canViewCosts, costProductIds, monthlyPerProduct, liveAnalysisCostComputation.byProduct]);

  const selectedProductCost = useMemo(() => {
    if (!canViewCosts || !selectedProductId) return null;
    const monthlyRow = monthlyPerProduct[selectedProductId];
    const avg = monthlyRow
      ? {
          laborCost: monthlyRow.directCost,
          indirectCost: monthlyRow.indirectCost,
          totalCost: monthlyRow.totalCost,
          quantityProduced: monthlyRow.producedQty,
          costPerUnit: monthlyRow.averageUnitCost,
        }
      : (liveAnalysisCostComputation.byProduct[selectedProductId] || { laborCost: 0, indirectCost: 0, totalCost: 0, quantityProduced: 0, costPerUnit: 0 });
    if (avg.costPerUnit <= 0) return null;
    return avg;
  }, [canViewCosts, selectedProductId, monthlyPerProduct, liveAnalysisCostComputation.byProduct]);

  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });
      options.push({ value, label });
    }
    return options;
  }, []);

  useEffect(() => {
    const currentMonth = getCurrentMonth();
    if (chartMonth === currentMonth) {
      setChartReports(monthlyReports);
      setChartLoading(false);
      return;
    }
    let cancelled = false;
    const [y, m] = chartMonth.split('-').map(Number);
    const dim = new Date(y, m, 0).getDate();
    const startDate = `${chartMonth}-01`;
    const endDate = `${chartMonth}-${String(dim).padStart(2, '0')}`;
    const maxAgeMs = 5 * 60 * 1000;
    const ck = getProductionReportsRangeCacheKey(startDate, endDate);
    const cached = useAppStore.getState().productionReportsRangeCache[ck];
    if (cached) {
      setChartReports(cached.rows);
      setChartLoading(false);
    } else {
      setChartLoading(true);
    }
    ensureProductionReportsForRange(startDate, endDate, { maxAgeMs })
      .then((reports) => {
        if (!cancelled) {
          setChartReports(reports);
          setChartLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => { cancelled = true; };
  }, [chartMonth, monthlyReports, ensureProductionReportsForRange]);

  const dailyChartData = useMemo(() => {
    const source = chartReports.length > 0 ? chartReports : monthlyReports;
    if (source.length === 0) return [] as Array<{ day: string; date: string; production: number; costPerUnit: number; laborCost: number; indirectCost: number }>;
    if (canViewCosts) {
      const hourlyRate = laborSettings?.hourlyRate ?? 0;
      return buildDailyProductionCostChart(
        source, chartProductId, chartLineId, chartMonth,
        hourlyRate, costCenters, costCenterValues, costAllocations
      );
    }
    // Production-only series when costs permission is absent
    const byDay = new Map<string, number>();
    source.forEach((r) => {
      if (chartProductId && r.productId !== chartProductId) return;
      if (chartLineId && r.lineId !== chartLineId) return;
      const day = String(r.date || '').slice(8, 10) || String(r.date || '');
      const qty = Number(r.quantityProduced ?? 0) || 0;
      byDay.set(day, (byDay.get(day) || 0) + qty);
    });
    return Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, production]) => ({
        day,
        date: `${chartMonth}-${day}`,
        production,
        costPerUnit: 0,
        laborCost: 0,
        indirectCost: 0,
      }));
  }, [canViewCosts, chartReports, monthlyReports, chartProductId, chartLineId, chartMonth, laborSettings, costCenters, costCenterValues, costAllocations]);

  const lineEfficiencyChart = useMemo(
    () =>
      productionLines.slice(0, 8).map((line) => ({
        name: line.name.length > 14 ? `${line.name.slice(0, 14)}…` : line.name,
        efficiency: Math.min(100, Math.max(0, Number(line.efficiency) || 0)),
        production: Number(line.achievement) || 0,
      })),
    [productionLines],
  );

  const planResults = useMemo(() => {
    if (!selectedProductId || planQuantity <= 0) return null;

    const productReports = todayReports.filter(
      (r) => r.productId === selectedProductId
    );

    const avgTime = calculateAvgAssemblyTime(
      productReports.length > 0 ? productReports : todayReports
    );

    const config = lineProductConfigs.find(
      (c) => c.productId === selectedProductId
    );
    const std = effectiveStandardAssemblyMinutes(
      selectedProductId,
      config?.standardAssemblyTime,
      routingTotalTimeSecondsByProduct,
    );
    const standardTime = std > 0 ? std : avgTime;
    const effectiveTime = standardTime > 0 ? standardTime : avgTime;

    const activeLines = _rawLines.filter(
      (l) =>
        l.status === ProductionLineStatus.ACTIVE ||
        l.status === ProductionLineStatus.IDLE ||
        l.status === ProductionLineStatus.INJECTION
    );

    let totalDailyCapacity = 0;
    activeLines.forEach((line) => {
      totalDailyCapacity += calculateDailyCapacity(
        line.maxWorkers,
        line.dailyWorkingHours,
        effectiveTime
      );
    });

    const perLineCapacity =
      activeLines.length > 0
        ? Math.round(totalDailyCapacity / activeLines.length)
        : 0;

    const estimatedDays = calculateEstimatedDays(planQuantity, totalDailyCapacity);

    return {
      avgAssemblyTime: effectiveTime,
      dailyCapacityPerLine: perLineCapacity,
      totalDailyCapacity,
      estimatedDays,
      activeLinesCount: activeLines.length,
    };
  }, [selectedProductId, planQuantity, todayReports, _rawLines, lineProductConfigs, routingTotalTimeSecondsByProduct]);

  const getVariant = (status: ProductionLineStatus) => {
    switch (status) {
      case ProductionLineStatus.ACTIVE: return 'success';
      case ProductionLineStatus.INJECTION: return 'warning';
      case ProductionLineStatus.WARNING: return 'warning';
      case ProductionLineStatus.MAINTENANCE: return 'neutral';
      case ProductionLineStatus.IDLE: return 'neutral';
      default: return 'neutral';
    }
  };

  const getStatusLabel = (status: ProductionLineStatus) => {
    switch (status) {
      case ProductionLineStatus.ACTIVE: return 'يعمل حالياً';
      case ProductionLineStatus.INJECTION: return 'خط حقن';
      case ProductionLineStatus.WARNING: return 'تنبيه: سرعة منخفضة';
      case ProductionLineStatus.MAINTENANCE: return 'متوقف (صيانة)';
      case ProductionLineStatus.IDLE: return 'جاهز للتشغيل';
      default: return 'غير معروف';
    }
  };

  const fallbackHero = useMemo(
    () => [
      {
        key: 'today',
        label: 'إنتاج اليوم',
        value: formatNumber(kpis.todayProduction),
        accent: true,
      },
      {
        key: 'month',
        label: 'إنتاج الشهر',
        value: formatNumber(kpis.monthlyProduction),
      },
      {
        key: 'efficiency',
        label: 'كفاءة اليوم',
        value: `${kpis.efficiency}%`,
      },
      {
        key: 'waste',
        label: 'هدر اليوم',
        value: `${kpis.wasteRatio}%`,
      },
    ],
    [kpis],
  );

  if (loading) {
    return <PageContentSkeleton variant="dashboard" kpiCount={6} />;
  }

  return (
    <DomainHomeShell
      denseHero
      eyebrow="لوحة التشغيل"
      hero={fallbackHero}
      rangeLabel={deskTodayLabel}
      dir="rtl"
    >
      <ModuleChartsHomeBoard />

      {/* â”€â”€ Set Target Modal â”€â”€ */}

      {targetModal && can("lineStatus.edit") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setTargetModal(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">تعيين هدف اليوم</h3>
                <p className="text-xs text-[var(--color-text-muted)] font-medium mt-0.5">{targetModal.lineName}</p>
              </div>
              <button onClick={() => setTargetModal(null)} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
                <DashboardIcon name="close" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">المنتج الحالي *</label>
                <Select
                  value={targetForm.currentProductId || 'none'}
                  onValueChange={(value) => setTargetForm({ ...targetForm, currentProductId: value === 'none' ? '' : value })}
                >
                  <SelectTrigger className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 font-medium">
                    <SelectValue placeholder="اختر المنتج..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">اختر المنتج...</SelectItem>
                    {filterProductionProducts(_rawProducts).map((p) => (
                      <SelectItem key={p.id} value={p.id!}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">الهدف اليومي (كمية) *</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={targetForm.targetTodayQty || ''}
                  onChange={(e) => setTargetForm({ ...targetForm, targetTodayQty: Number(e.target.value) })}
                  placeholder="مثال: 500"
                />
              </div>
              {targetForm.currentProductId && targetForm.targetTodayQty > 0 && (
                <div className="bg-primary/5 border border-primary/10 rounded-[var(--border-radius-lg)] p-4 flex items-center gap-3">
                  <DashboardIcon name="info" className="text-primary text-lg" />
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">
                    سيتم تعيين هدف <span className="font-bold text-primary">{formatNumber(targetForm.targetTodayQty)}</span> وحدة
                    من <span className="font-bold text-[var(--color-text)]">{resolveManufacturingItemName(targetForm.currentProductId, manufacturingNameMap)}</span> لهذا الخط
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setTargetModal(null)}>إلغاء</Button>
              <Button
                variant="primary"
                onClick={handleSaveTarget}
                disabled={targetSaving || !targetForm.currentProductId || !targetForm.targetTodayQty}
              >
                {targetSaving && <DashboardIcon name="refresh" className="animate-spin text-sm" />}
                <DashboardIcon name="flag" className="text-sm" />
                حفظ الهدف
              </Button>
            </div>
          </div>
        </div>
      )}
    </DomainHomeShell>
  );
};