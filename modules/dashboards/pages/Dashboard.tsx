
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
import { Badge, Button } from '../components/UI';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { EmployeeDashboardWidget } from '../../../components/EmployeeDashboardWidget';
import { OperationalDecisionQueue } from '../components/OperationalDecisionQueue';
import { OperationsDashboardBoard, OpsDashPanel } from '../components/OperationsDashboardBoard';
import { DashboardProgressGauge } from '../components/DashboardProgressGauge';
import { useOperationalDecisionSnapshot } from '../hooks/useOperationalDecisionSnapshot';
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
  getKPIThreshold,
  getKPIColor,
  isWidgetVisible,
} from '../../../utils/dashboardConfig';
import {
  ComposedChart,
  Line,
  Bar,
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
  const { snapshot: decisionSnapshot, loading: decisionLoading } = useOperationalDecisionSnapshot();

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
    if (!canViewCosts) return;
    const currentMonth = getCurrentMonth();
    if (chartMonth === currentMonth) {
      setChartReports(monthlyReports);
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
  }, [canViewCosts, chartMonth, monthlyReports, ensureProductionReportsForRange]);

  const dailyChartData = useMemo(() => {
    if (!canViewCosts || chartReports.length === 0) return [];
    const hourlyRate = laborSettings?.hourlyRate ?? 0;
    return buildDailyProductionCostChart(
      chartReports, chartProductId, chartLineId, chartMonth,
      hourlyRate, costCenters, costCenterValues, costAllocations
    );
  }, [canViewCosts, chartReports, chartProductId, chartLineId, chartMonth, laborSettings, costCenters, costCenterValues, costAllocations]);

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

  if (loading) {
    return <PageContentSkeleton variant="dashboard" kpiCount={6} />;
  }

  const show = (widgetId: string) => isWidgetVisible(systemSettings, 'dashboard', widgetId);
  const idleLines = productionLines.filter((l) => l.status === ProductionLineStatus.IDLE).length;
  const maintLines = productionLines.filter((l) => l.status === ProductionLineStatus.MAINTENANCE).length;

  return (
    <div className="erp-dashboard-theme">
      <OperationsDashboardBoard
        header={(
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-text)]">لوحة التشغيل</h1>
              <p className="text-xs sm:text-sm text-[var(--color-text-muted)] font-medium mt-1">
                نظرة كثيفة: قرارات · إنتاج · خطوط · تخطيط
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex max-w-[min(100%,280px)] items-center gap-2 truncate rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-text-muted)]"
                title={deskTodayLabel}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                {deskTodayLabel}
              </span>
              <Button variant="primary" className="!h-9 !text-xs !px-3" onClick={() => navigate('/production-plans')}>
                + خطة إنتاج
              </Button>
              <Button variant="outline" className="!h-9 !text-xs !px-3" onClick={() => navigate('/lines')}>
                خطوط الإنتاج
              </Button>
            </div>
          </div>
        )}
        kpi={show('kpi_row') ? (
          <div className="ops-dash-kpi-grid">
            <div className="ops-dash-kpi-card ops-dash-kpi-card--accent">
              <p className="ops-dash-kpi-card__label">إنتاج اليوم</p>
              <p className="ops-dash-kpi-card__value">{formatNumber(kpis.todayProduction)}</p>
              <p className="ops-dash-kpi-card__meta">الشهر: {formatNumber(kpis.monthlyProduction)} وحدة</p>
            </div>
            <div className="ops-dash-kpi-card">
              <p className="ops-dash-kpi-card__label">معدل الكفاءة</p>
              <p className="ops-dash-kpi-card__value">{kpis.efficiency}%</p>
              <p className="ops-dash-kpi-card__meta">
                {getKPIColor(kpis.efficiency, getKPIThreshold(systemSettings, 'efficiency'), false) === 'good' ? 'ضمن الهدف' : 'يحتاج متابعة'}
              </p>
            </div>
            <div className="ops-dash-kpi-card">
              <p className="ops-dash-kpi-card__label">نسبة الهالك</p>
              <p className="ops-dash-kpi-card__value">{kpis.wasteRatio}%</p>
              <p className="ops-dash-kpi-card__meta">من إنتاج اليوم/الشهر</p>
            </div>
            <div className="ops-dash-kpi-card">
              <p className="ops-dash-kpi-card__label">خطوط نشطة</p>
              <p className="ops-dash-kpi-card__value">
                {productionLines.filter((l) => l.status === ProductionLineStatus.ACTIVE).length}
              </p>
              <p className="ops-dash-kpi-card__meta">من {productionLines.length} خط</p>
            </div>
          </div>
        ) : null}
        chart={show('daily_cost_chart') && canViewCosts ? (
          <OpsDashPanel
            title="تحليل الإنتاج والتكلفة"
            action={(
              <div className="flex flex-wrap gap-1.5">
                <Select value={chartMonth} onValueChange={setChartMonth}>
                  <SelectTrigger className="h-8 w-[120px] text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          >
            {chartLoading ? (
              <div className="flex items-center justify-center h-[220px] text-[var(--color-text-muted)] text-xs font-bold gap-2">
                <DashboardIcon name="refresh" className="animate-spin h-4 w-4" />
                جاري التحميل...
              </div>
            ) : dailyChartData.length > 0 ? (
              <div className="h-[220px] w-full" dir="ltr">
                <ResponsiveContainer>
                  <ComposedChart data={dailyChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="production" tick={{ fontSize: 10, fill: '#3b82f6' }} axisLine={false} tickLine={false} width={36} />
                    <YAxis yAxisId="cost" orientation="right" tick={{ fontSize: 10, fill: '#8b5cf6' }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip content={<DailyChartTooltip />} />
                    <Bar yAxisId="production" dataKey="production" name="الإنتاج" fill="rgb(var(--color-primary))" radius={[4, 4, 0, 0]} barSize={16} opacity={0.9} />
                    <Line yAxisId="cost" type="monotone" dataKey="costPerUnit" name="تكلفة الوحدة" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-xs text-[var(--color-text-muted)] font-bold">
                لا توجد بيانات للشهر المحدد
              </div>
            )}
          </OpsDashPanel>
        ) : null}
        queue={show('decision_queue') ? (
          <OpsDashPanel>
            <OperationalDecisionQueue
              snapshot={decisionSnapshot}
              loading={decisionLoading}
              compact
              maxItems={6}
            />
          </OpsDashPanel>
        ) : null}
        list={show('production_lines') ? (
          <OpsDashPanel
            title="قائمة الخطوط"
            action={(
              <button type="button" className="text-[11px] font-bold text-primary" onClick={() => navigate('/lines')}>
                + جديد
              </button>
            )}
          >
            {productionLines.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] text-center py-8">لا توجد خطوط بعد</p>
            ) : (
              <ul className="space-y-2">
                {productionLines.slice(0, 8).map((line) => (
                  <li key={line.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/lines/${line.id}`)}
                      className="w-full text-right rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-2.5 py-2 hover:bg-[var(--color-surface-hover)] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[var(--color-text)] truncate">{line.name}</p>
                          <p className="text-[10px] text-[var(--color-text-muted)] truncate mt-0.5">{line.currentProduct || '—'}</p>
                        </div>
                        <div className="text-end shrink-0">
                          <p className="text-xs font-bold tabular-nums text-primary">{line.efficiency}%</p>
                          <Badge variant={getVariant(line.status)}>
                            {getStatusLabel(line.status)}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </OpsDashPanel>
        ) : null}
        team={show('production_lines') ? (
          <OpsDashPanel title="حالة الخطوط">
            <ul className="space-y-2">
              {productionLines.slice(0, 6).map((line) => (
                <li key={`team-${line.id}`} className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{line.name}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] truncate">{line.employeeName || '—'}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    line.status === ProductionLineStatus.ACTIVE
                      ? 'bg-emerald-50 text-emerald-700'
                      : line.status === ProductionLineStatus.WARNING
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                  }`}>
                    {getStatusLabel(line.status)}
                  </span>
                </li>
              ))}
              {productionLines.length === 0 && (
                <li className="text-xs text-[var(--color-text-muted)] text-center py-6">لا بيانات</li>
              )}
            </ul>
          </OpsDashPanel>
        ) : null}
        gauge={show('kpi_row') ? (
          <OpsDashPanel title="تقدم التشغيل">
            <DashboardProgressGauge
              value={kpis.efficiency}
              label="كفاءة الإنتاج"
              sublabel={`هالك ${kpis.wasteRatio}% · إنتاج اليوم ${formatNumber(kpis.todayProduction)}`}
              legend={[
                { label: 'مكتمل/جيد', color: 'rgb(var(--color-success))' },
                { label: 'متابعة', color: 'rgb(var(--color-warning))' },
                { label: 'حرج', color: 'rgb(var(--color-danger))' },
              ]}
            />
          </OpsDashPanel>
        ) : null}
        focus={show('smart_planning') ? (
          <OpsDashPanel tone="primary" title="التخطيط الذكي">
            <form className="space-y-3" onSubmit={(e) => e.preventDefault()}>
              <Select value={selectedProductId || 'none'} onValueChange={(value) => setSelectedProductId(value === 'none' ? '' : value)}>
                <SelectTrigger className="w-full h-9 text-xs bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder="اختر المنتج..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">اختر المنتج...</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                className="w-full h-9 rounded-[var(--border-radius-lg)] border border-white/20 bg-white/10 text-white text-xs px-3 outline-none placeholder:text-white/60"
                placeholder="الكمية المخططة"
                type="number"
                min={0}
                value={planQuantity || ''}
                onChange={(e) => setPlanQuantity(Number(e.target.value))}
              />
              <div className="rounded-[var(--border-radius-lg)] bg-black/15 px-3 py-2.5 space-y-1.5 text-xs">
                {planResults ? (
                  <>
                    <div className="flex justify-between gap-2">
                      <span className="opacity-80">قدرة يومية</span>
                      <span className="font-bold">{formatNumber(planResults.totalDailyCapacity)} وحدة</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="opacity-80">أيام مقدّرة</span>
                      <span className="font-bold">{planResults.estimatedDays > 0 ? `${planResults.estimatedDays} يوم` : '—'}</span>
                    </div>
                  </>
                ) : (
                  <p className="opacity-80 text-center py-2">اختر منتجاً وكمية للتقدير</p>
                )}
              </div>
              {selectedProductId && planQuantity > 0 && can('plans.create') && (
                <Button
                  variant="outline"
                  className="w-full !h-9 !text-xs !bg-white !text-[rgb(var(--color-primary))] !border-0"
                  onClick={() => navigate(`/production-plans?productId=${selectedProductId}&quantity=${planQuantity}`)}
                >
                  إنشاء خطة
                </Button>
              )}
              <p className="text-[10px] opacity-80 leading-relaxed">
                {idleLines > 0
                  ? `${idleLines} خط في وضع الاستعداد — يمكن تشغيلها لزيادة القدرة.`
                  : maintLines > 0
                    ? `${maintLines} خط تحت الصيانة.`
                    : 'الخطوط تعمل بشكل طبيعي.'}
              </p>
            </form>
          </OpsDashPanel>
        ) : null}
        secondary={show('product_cost_analysis') && canViewCosts ? (
          <details>
            <summary>تحليل تكلفة المنتجات والمزيد</summary>
            <div className="ops-dash-secondary__body">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={costProductCandidate || 'none'}
                  onValueChange={(value) => {
                    setCostProductCandidate(value === 'none' ? '' : value);
                    if (value !== 'none' && !costProductIds.includes(value)) {
                      setCostProductIds([...costProductIds, value]);
                      setCostProductCandidate('');
                    }
                  }}
                >
                  <SelectTrigger className="w-full sm:w-auto sm:min-w-[200px] text-sm">
                    <SelectValue placeholder="إضافة منتج..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">إضافة منتج...</SelectItem>
                    {products.filter((p) => !costProductIds.includes(p.id)).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {costProductIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCostProductIds([])}
                    className="text-xs font-bold text-rose-600"
                  >
                    مسح الكل
                  </button>
                )}
              </div>
              {costProductIds.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">أضف منتجات لمقارنة متوسط التكلفة الشهرية.</p>
              ) : Object.keys(costAnalysisMap).length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)]">لا توجد بيانات تكلفة للمنتجات المختارة.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="erp-table w-full text-right">
                    <thead className="erp-thead">
                      <tr>
                        <th className="erp-th">المنتج</th>
                        <th className="erp-th text-center">تكلفة الوحدة</th>
                        <th className="erp-th text-center">الإنتاج</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costProductIds.map((pid) => {
                        const data = costAnalysisMap[pid];
                        const p = products.find((pr) => pr.id === pid);
                        const name = p?.name?.trim() ? p.name : resolveManufacturingItemName(pid, manufacturingNameMap);
                        return (
                          <tr key={pid} className="border-b border-[var(--color-border)]">
                            <td className="px-3 py-2 text-sm font-bold text-primary">{name}</td>
                            <td className="px-3 py-2 text-center text-sm font-bold">
                              {data ? `${formatCost(data.costPerUnit)} ج.م` : '—'}
                            </td>
                            <td className="px-3 py-2 text-center text-sm font-bold">
                              {data ? formatNumber(data.quantityProduced) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </details>
        ) : null}
      />

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
    </div>
  );
};




