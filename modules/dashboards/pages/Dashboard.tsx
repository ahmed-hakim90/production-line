
import React, { useState, useMemo, useEffect } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Factory,
  Flag,
  Hammer,
  Info,
  Layers,
  Lightbulb,
  Loader2,
  Sparkles,
  TrendingUp,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { KPIBox, Card, Badge, Button, LoadingSkeleton } from '../components/UI';
import { EmployeeDashboardWidget } from '../../../components/EmployeeDashboardWidget';
import { OrderedDashboardWidgets } from '../../../components/OrderedDashboardWidgets';
import { useAppStore, getProductionReportsRangeCacheKey } from '../../../store/useAppStore';
import {
  formatNumber,
  buildDashboardKPIs,
  calculateAvgAssemblyTime,
  calculateDailyCapacity,
  calculateEstimatedDays,
} from '../../../utils/calculations';
import {
  buildLineCosts,
  formatCost,
  ProductCostData,
  buildDailyProductionCostChart,
  getCurrentMonth,
  computeLiveProductCosts,
  buildSupervisorHourlyRatesMap,
} from '../../../utils/costCalculations';
import { monthlyProductionCostService, type MonthlyDashboardCostSummary } from '@/modules/costs/services/monthlyProductionCostService';
import { ProductionLineStatus, ProductionReport } from '../../../types';
import { usePermission } from '../../../utils/permissions';
import {
  getKPIThreshold,
  getKPIColor,
  KPI_COLOR_CLASSES,
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
  Legend,
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
  clear_all: Layers,
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
  const navigate = useTenantNavigate();

  const { can } = usePermission();
  const canViewCosts = can('costs.view');

  const linkedEmployee = useMemo(
    () => _rawEmployees.find((s) => s.userId === uid),
    [_rawEmployees, uid]
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
    const standardTime = config?.standardAssemblyTime ?? avgTime;
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
  }, [selectedProductId, planQuantity, todayReports, _rawLines, lineProductConfigs]);

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
    return (
      <div className="erp-dashboard-theme win2k-theme space-y-8">
        <div className="win2k-panel-header" style={{background:'linear-gradient(to left,#0a246a,#a6b8cb)',padding:'3px 8px',display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:11,fontWeight:'bold',color:'#fff',fontFamily:'Tahoma,sans-serif'}}>مؤسسة المغربي — جاري تحميل البيانات...</span>
        </div>
        <LoadingSkeleton type="card" rows={6} />
      </div>
    );
  }

  return (
    <div className="erp-dashboard-theme win2k-theme space-y-6 sm:space-y-8">
      {/* Win2K window title bar */}
      <div style={{
        background: 'linear-gradient(to left, #0a246a, #a6b8cb)',
        padding: '3px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: 'inset -1px -1px 0 #404040, inset 1px 1px 0 #ffffff',
      }}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{width:14,height:14,background:'#ece9d8',border:'1px solid #808080',display:'inline-block',flexShrink:0}}></span>
          <span style={{fontSize:11,fontWeight:'bold',color:'#ffffff',fontFamily:'Tahoma,sans-serif',letterSpacing:0}}>لوحة التحكم — مؤسسة المغربي</span>
        </div>
        <div style={{display:'flex',gap:2}}>
          {['_','□','✕'].map((btn) => (
            <span key={btn} style={{
              width:16,height:14,background:'#d4d0c8',display:'inline-flex',alignItems:'center',justifyContent:'center',
              fontSize:10,fontWeight:'bold',color:'#000000',fontFamily:'Tahoma,sans-serif',
              boxShadow:'inset -1px -1px 0 #404040, inset 1px 1px 0 #ffffff, inset -2px -2px 0 #808080, inset 2px 2px 0 #ece9d8',
              cursor:'default',userSelect:'none'
            }}>{btn}</span>
          ))}
        </div>
      </div>

      <OrderedDashboardWidgets
        dashboardKey="dashboard"
        systemSettings={systemSettings}
        renderBuiltin={(widgetId) => {
          switch (widgetId) {
            case 'kpi_row':
              return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
        {/* Production Card — Daily & Monthly */}
        <div className="bg-[var(--color-card)] p-4 sm:p-6 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] sm:col-span-2 md:col-span-1">
          <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-blue-50 text-blue-600 dark:bg-blue-900/20 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0">
              <DashboardIcon name="inventory" className="text-2xl sm:text-3xl" />
            </div>
            <p className="text-[var(--color-text-muted)] text-sm font-bold">إجمالي الإنتاج</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-blue-50/60 dark:bg-blue-900/10 rounded-[var(--border-radius-lg)] p-3 sm:p-4 text-center border border-blue-100 dark:border-blue-900/20">
              <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1.5">إنتاج اليوم</p>
              <h3 className="text-xl sm:text-2xl font-bold text-blue-600">{formatNumber(kpis.todayProduction)}</h3>
              <span className="text-[10px] font-medium text-slate-400">وحدة</span>
            </div>
            <div className="bg-indigo-50/60 dark:bg-indigo-900/10 rounded-[var(--border-radius-lg)] p-3 sm:p-4 text-center border border-indigo-100 dark:border-indigo-900/20">
              <p className="text-[11px] font-bold text-[var(--color-text-muted)] mb-1.5">إنتاج الشهر</p>
              <h3 className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatNumber(kpis.monthlyProduction)}</h3>
              <span className="text-[10px] font-medium text-slate-400">وحدة</span>
            </div>
          </div>
        </div>
        {(() => {
          const effColor = getKPIColor(kpis.efficiency, getKPIThreshold(systemSettings, 'efficiency'), false);
          return <KPIBox label="معدل الكفاءة" value={`${kpis.efficiency}%`} icon="bolt" trend="" trendUp={true} colorClass={KPI_COLOR_CLASSES[effColor]} />;
        })()}
        {(() => {
          const wasteColor = getKPIColor(kpis.wasteRatio, getKPIThreshold(systemSettings, 'wasteRatio'), true);
          return <KPIBox label="نسبة الهالك" value={`${kpis.wasteRatio}%`} icon="delete_sweep" trend="" trendUp={wasteColor === 'good'} colorClass={KPI_COLOR_CLASSES[wasteColor]} />;
        })()}
      </div>
              );
            case 'product_cost_analysis':
              if (!canViewCosts) return null;
              return (
        <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] border border-[var(--color-border)] overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-50 dark:bg-violet-900/20 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0">
                <DashboardIcon name="price_check" className="text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--color-text)]">تحليل تكلفة المنتجات</h3>
                <p className="text-[11px] text-[var(--color-text-muted)] font-medium">اختر منتج أو أكثر لمقارنة متوسط التكلفة الشهرية</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
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
                <SelectTrigger className="w-full sm:w-auto border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm py-2.5 px-4 font-medium sm:min-w-[200px]">
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
                  onClick={() => setCostProductIds([])}
                  className="p-2 text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-[var(--border-radius-base)] transition-all"
                  title="مسح الكل"
                >
                  <DashboardIcon name="clear_all" className="text-sm" />
                </button>
              )}
            </div>
          </div>

          {costProductIds.length > 0 && (
            <div className="px-5 sm:px-6 pt-4 flex flex-wrap gap-2">
              {costProductIds.map((pid) => {
                const p = products.find((pr) => pr.id === pid);
                return (
                  <span key={pid} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-xs font-bold border border-violet-200 dark:border-violet-800">
                    {p?.name || pid}
                    <button
                      onClick={() => setCostProductIds(costProductIds.filter((id) => id !== pid))}
                      className="hover:text-rose-500 transition-colors"
                    >
                      <DashboardIcon name="close" className="text-sm" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {Object.keys(costAnalysisMap).length > 0 ? (
            <div className="p-5 sm:p-6">
              <div className="md:hidden space-y-2.5">
                {costProductIds.map((pid) => {
                  const data = costAnalysisMap[pid];
                  const p = products.find((pr) => pr.id === pid);
                  if (!data) {
                    return (
                      <div key={pid} className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 text-xs text-[var(--color-text-muted)]">
                        <p className="font-bold text-[var(--color-text)] mb-1.5">{p?.name || '—'}</p>
                        لا توجد بيانات
                      </div>
                    );
                  }
                  return (
                    <div key={pid} className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-2.5">
                      <p className="text-sm font-bold text-primary">{p?.name || '—'}</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] p-2">
                          <p className="text-[var(--color-text-muted)] mb-0.5">تكلفة الوحدة</p>
                          <p className="font-bold text-violet-600">{formatCost(data.costPerUnit)} ج.م</p>
                        </div>
                        <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] p-2">
                          <p className="text-[var(--color-text-muted)] mb-0.5">الإنتاج</p>
                          <p className="font-bold text-emerald-600">{formatNumber(data.quantityProduced)} وحدة</p>
                        </div>
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)] space-y-1">
                        <p><span className="font-bold">العمالة:</span> {formatCost(data.laborCost)} ج.م</p>
                        <p><span className="font-bold">غير مباشرة:</span> {formatCost(data.indirectCost)} ج.م</p>
                        <p><span className="font-bold">الإجمالي:</span> <span className="text-primary font-bold">{formatCost(data.totalCost)} ج.م</span></p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="erp-table w-full text-right border-collapse">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">المنتج</th>
                      <th className="erp-th text-center">تكلفة الوحدة</th>
                      <th className="erp-th text-center">تكلفة العمالة</th>
                      <th className="erp-th text-center">غير مباشرة</th>
                      <th className="erp-th text-center">إجمالي التكلفة</th>
                      <th className="erp-th text-center">الإنتاج</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {costProductIds.map((pid) => {
                      const data = costAnalysisMap[pid];
                      const p = products.find((pr) => pr.id === pid);
                      if (!data) return (
                        <tr key={pid} className="text-[var(--color-text-muted)]">
                          <td className="px-4 py-3 text-sm font-bold">{p?.name || '—'}</td>
                          <td colSpan={5} className="px-4 py-3 text-center text-xs">لا توجد بيانات</td>
                        </tr>
                      );
                      return (
                        <tr key={pid} onClick={() => navigate(`/products/${pid}`)} className="hover:bg-[#f8f9fa]/50 transition-colors cursor-pointer">
                          <td className="px-4 py-3 text-sm font-bold text-primary">{p?.name || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2.5 py-1 rounded-[var(--border-radius-base)] bg-violet-50 dark:bg-violet-900/20 text-violet-600 text-sm font-bold ring-1 ring-violet-500/20">
                              {formatCost(data.costPerUnit)} ج.م
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-[var(--color-text-muted)]">{formatCost(data.laborCost)} ج.م</td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-[var(--color-text-muted)]">{formatCost(data.indirectCost)} ج.م</td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-primary">{formatCost(data.totalCost)} ج.م</td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-emerald-600">{formatNumber(data.quantityProduced)} وحدة</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {Object.keys(costAnalysisMap).length > 1 && (
                    <tfoot>
                      <tr className="bg-[#f8f9fa]/50 border-t-2 border-[var(--color-border)]">
                        <td className="px-4 py-3 text-sm font-bold text-[var(--color-text)]">الإجمالي</td>
                        {(() => {
                          const vals = Object.values(costAnalysisMap) as ProductCostData[];
                          const sumLabor = vals.reduce((s, v) => s + v.laborCost, 0);
                          const sumIndirect = vals.reduce((s, v) => s + v.indirectCost, 0);
                          const sumTotal = vals.reduce((s, v) => s + v.totalCost, 0);
                          const sumQty = vals.reduce((s, v) => s + v.quantityProduced, 0);
                          const avgCPU = sumQty > 0 ? sumTotal / sumQty : 0;
                          return (
                            <>
                              <td className="px-4 py-3 text-center text-sm font-bold text-violet-600">{avgCPU > 0 ? `${formatCost(avgCPU)} ج.م` : '—'}</td>
                              <td className="px-4 py-3 text-center text-sm font-bold text-[var(--color-text-muted)]">{formatCost(sumLabor)} ج.م</td>
                              <td className="px-4 py-3 text-center text-sm font-bold text-[var(--color-text-muted)]">{formatCost(sumIndirect)} ج.م</td>
                              <td className="px-4 py-3 text-center text-sm font-bold text-primary">{formatCost(sumTotal)} ج.م</td>
                              <td className="px-4 py-3 text-center text-sm font-bold text-emerald-600">{formatNumber(sumQty)} وحدة</td>
                            </>
                          );
                        })()}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          ) : costProductIds.length > 0 ? (
            <div className="p-8 text-center text-slate-400">
              <DashboardIcon name="info" className="text-3xl mb-2 block opacity-30" />
              <p className="text-sm font-bold">لا توجد بيانات تكلفة للمنتجات المختارة في الشهر الحالي</p>
            </div>
          ) : null}
        </div>
              );
            case 'daily_cost_chart':
              if (!canViewCosts) return null;
              return (
        <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] border border-[var(--color-border)] overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-[var(--color-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0">
                <DashboardIcon name="insights" className="text-blue-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--color-text)]">الإنتاج اليومي مقابل التكلفة</h3>
                <p className="text-[11px] text-[var(--color-text-muted)] font-medium">تحليل يومي للإنتاج والتكاليف خلال الشهر المحدد</p>
              </div>
            </div>
          </div>

          <div className="px-5 sm:px-6 pt-4 flex flex-wrap gap-3">
            <Select value={chartProductId || 'all'} onValueChange={(value) => setChartProductId(value === 'all' ? '' : value)}>
              <SelectTrigger className="w-full sm:w-auto border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm py-2.5 px-4 font-medium sm:min-w-[160px]">
                <SelectValue placeholder="كل المنتجات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المنتجات</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={chartLineId || 'all'} onValueChange={(value) => setChartLineId(value === 'all' ? '' : value)}>
              <SelectTrigger className="w-full sm:w-auto border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm py-2.5 px-4 font-medium sm:min-w-[160px]">
                <SelectValue placeholder="كل الخطوط" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الخطوط</SelectItem>
                {_rawLines.map((l) => (
                  <SelectItem key={l.id} value={l.id!}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={chartMonth} onValueChange={setChartMonth}>
              <SelectTrigger className="w-full sm:w-auto border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm py-2.5 px-4 font-medium sm:min-w-[160px]">
                <SelectValue placeholder="اختر الشهر" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="p-5 sm:p-6">
            {chartLoading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <DashboardIcon name="refresh" className="animate-spin text-2xl" />
                <span className="mr-2 text-sm font-bold">جاري تحميل البيانات...</span>
              </div>
            ) : dailyChartData.length > 0 ? (
              <div style={{ width: '100%', height: 380 }} dir="ltr">
                <ResponsiveContainer>
                  <ComposedChart data={dailyChartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="production"
                      orientation="left"
                      tick={{ fontSize: 11, fill: '#3b82f6', fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                      label={{ value: 'الإنتاج', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 11, fill: '#3b82f6', fontWeight: 700 } }}
                    />
                    <YAxis
                      yAxisId="cost"
                      orientation="right"
                      tick={{ fontSize: 11, fill: '#8b5cf6', fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                      label={{ value: 'تكلفة الوحدة', angle: 90, position: 'insideRight', offset: 10, style: { fontSize: 11, fill: '#8b5cf6', fontWeight: 700 } }}
                    />
                    <Tooltip content={<DailyChartTooltip />} />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="square"
                      formatter={(value: string) => <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{value}</span>}
                    />
                    <Bar
                      yAxisId="production"
                      dataKey="production"
                      name="الإنتاج اليومي"
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                      barSize={22}
                      opacity={0.85}
                    />
                    <Line
                      yAxisId="cost"
                      type="monotone"
                      dataKey="costPerUnit"
                      name="تكلفة الوحدة"
                      stroke="#8b5cf6"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: '#8b5cf6', strokeWidth: 0 }}
                      activeDot={{ r: 6, stroke: '#8b5cf6', strokeWidth: 2, fill: '#fff' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <DashboardIcon name="bar_chart" className="text-3xl mb-2 block opacity-30" />
                <p className="text-sm font-bold">لا توجد بيانات للشهر المحدد</p>
                <p className="text-xs mt-1">اختر شهر يحتوي على تقارير إنتاج لعرض الرسم البياني</p>
              </div>
            )}
          </div>
        </div>
              );
            case 'production_lines':
              return (
          <>
          <div className="flex items-center justify-between px-2 gap-3">
            <h3 className="text-lg sm:text-xl font-bold flex items-center gap-3">
              <span className="w-2 h-7 bg-primary rounded-full shrink-0"></span>
              مراقبة خطوط الإنتاج
            </h3>
            <Button variant="outline" className="text-xs py-1.5 h-auto shrink-0" onClick={() => navigate('/lines')}>عرض الكل</Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {productionLines.length === 0 && !loading && (
              <div className="col-span-2 text-center py-12 text-slate-400">
                <DashboardIcon name="precision_manufacturing" className="text-5xl mb-3 block opacity-30" />
                <p className="font-bold">لا توجد خطوط إنتاج بعد</p>
                <p className="text-sm mt-1">أضف خطوط الإنتاج من صفحة "خطوط الإنتاج"</p>
              </div>
            )}
            {productionLines.map((line) => (
              <Card key={line.id} className="transition-all hover:ring-2 hover:ring-primary/10">
                <div className="cursor-pointer" onClick={() => navigate(`/lines/${line.id}`)}>
                  <div className="flex justify-between items-start mb-5">
                    <div>
                      <h4 className="font-bold text-lg text-[var(--color-text)]">{line.name}</h4>
                      <span className="text-xs text-[var(--color-text-muted)] font-bold uppercase tracking-wider">{line.employeeName}</span>
                    </div>
                    <Badge variant={getVariant(line.status)} pulse={line.status === ProductionLineStatus.ACTIVE}>
                      {getStatusLabel(line.status)}
                    </Badge>
                  </div>

                  <div className="mb-6">
                    <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1 uppercase tracking-tight">المنتج الحالي</p>
                    <p className="text-base font-bold text-[var(--color-text)]">{line.currentProduct}</p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-[var(--color-text-muted)]">الإنتاج: {formatNumber(line.achievement)} / {formatNumber(line.target)}</span>
                      <span className={`${line.efficiency > 80 ? 'text-emerald-600' : 'text-amber-600'}`}>{line.efficiency}%</span>
                    </div>
                    {line.target > 0 && (
                      <p className="text-[11px] font-bold text-slate-400">المتبقي: {formatNumber(Math.max(line.target - line.achievement, 0))}</p>
                    )}
                    <div className="w-full h-2.5 bg-[#f0f2f5] rounded-full overflow-hidden shadow-inner">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${line.status === ProductionLineStatus.WARNING ? 'bg-amber-500' : 'bg-primary shadow-[0_0_10px_rgba(19,146,236,0.3)]'}`} 
                        style={{ width: `${Math.min(line.efficiency, 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {canViewCosts && lineCosts[line.id] && (lineCosts[line.id].laborCost > 0 || lineCosts[line.id].indirectCost > 0) && (
                    <div className="mt-4 pt-4 border-t border-[var(--color-border)] grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400">تكلفة العمالة</p>
                        <p className="text-xs font-bold text-[var(--color-text)]">{formatCost(lineCosts[line.id].laborCost)} ج.م</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400">تكلفة غير مباشرة</p>
                        <p className="text-xs font-bold text-[var(--color-text)]">{formatCost(lineCosts[line.id].indirectCost)} ج.م</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400">إجمالي التكلفة</p>
                        <p className="text-xs font-bold text-primary">{formatCost(lineCosts[line.id].totalCost)} ج.م</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400">تكلفة الوحدة (المنتج)</p>
                        <p className="text-xs font-bold text-emerald-600">
                          {line.currentProductId && productCosts[line.currentProductId]?.costPerUnit > 0
                            ? `${formatCost(productCosts[line.currentProductId].costPerUnit)} ج.م`
                            : '—'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                {can("lineStatus.edit") && (
                  <button
                    onClick={(e) => { e.stopPropagation(); openTargetModal(line.id, line.name); }}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-[var(--border-radius-base)] transition-all"
                  >
                    <DashboardIcon name="flag" className="text-sm" />
                    {line.target > 0 ? 'تعديل الهدف' : 'تعيين الهدف'}
                  </button>
                )}
              </Card>
            ))}
          </div>
          </>
              );
            case 'smart_planning':
              return (
          <Card className="lg:sticky lg:top-24 border-primary/20 shadow-primary/5" title="الملخص الذكي">
            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">اختر المنتج</label>
                <Select value={selectedProductId || 'none'} onValueChange={(value) => setSelectedProductId(value === 'none' ? '' : value)}>
                  <SelectTrigger className="w-full border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 font-medium">
                    <SelectValue placeholder="اختر المنتج..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">اختر المنتج...</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">الكمية المخططة</label>
                <input 
                  className="w-full border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all" 
                  placeholder="أدخل الكمية..." 
                  type="number"
                  min={0}
                  value={planQuantity || ''}
                  onChange={(e) => setPlanQuantity(Number(e.target.value))}
                />
              </div>

              <div className="p-5 bg-[#f8f9fa] rounded-[var(--border-radius-lg)] border border-[var(--color-border)] space-y-4">
                {planResults ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-500">متوسط وقت التجميع</span>
                      <span className="text-sm font-bold text-primary">{planResults.avgAssemblyTime} دقيقة/وحدة</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-500">الأهداف اليومية لكل خط</span>
                      <span className="text-sm font-bold text-primary">{formatNumber(planResults.dailyCapacityPerLine)} وحدة</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-500">إجمالي الأهداف اليومية</span>
                      <span className="text-sm font-bold text-primary">
                        {formatNumber(planResults.totalDailyCapacity)} وحدة ({planResults.activeLinesCount} خط)
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-[var(--color-border)]">
                      <span className="text-xs font-bold text-slate-500">الأيام المقدرة للإنجاز</span>
                      <span className="text-sm font-bold text-emerald-600">
                        {planResults.estimatedDays > 0 ? `${planResults.estimatedDays} يوم` : '—'}
                      </span>
                    </div>
                    {selectedProductCost && planQuantity > 0 && (
                      <div className="flex justify-between items-center pt-3 border-t border-[var(--color-border)]">
                        <span className="text-xs font-bold text-slate-500">التكلفة المتوقعة</span>
                        <span className="text-sm font-bold text-primary">
                          {formatCost(selectedProductCost.costPerUnit * planQuantity)} ج.م
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-[var(--color-text-muted)] py-2">
                    <DashboardIcon name="calculate" className="text-2xl mb-1 block opacity-40" />
                    <p className="text-xs font-bold">اختر منتج وأدخل الكمية لعرض التقديرات</p>
                  </div>
                )}
              </div>
            </form>

            {selectedProductId && planQuantity > 0 && can('plans.create') && (
              <div className="mt-6">
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => navigate(`/production-plans?productId=${selectedProductId}&quantity=${planQuantity}`)}
                >
                  <DashboardIcon name="add_task" className="text-sm" />
                  إنشاء خطط رسمية
                </Button>
              </div>
            )}

            {canViewCosts && selectedProductCost && (
              <div className="mt-6 p-4 bg-violet-50 dark:bg-violet-900/10 rounded-[var(--border-radius-lg)] border border-violet-200 dark:border-violet-800 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <DashboardIcon name="price_check" className="text-violet-600 text-sm" />
                  <h4 className="text-xs font-bold text-violet-600">تحليل تكلفة المنتج (متوسط الشهر)</h4>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500">متوسط تكلفة الوحدة</span>
                  <span className="text-sm font-bold text-violet-600">{formatCost(selectedProductCost.costPerUnit)} ج.م</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500">تكلفة العمالة</span>
                  <span className="text-sm font-bold text-[var(--color-text)]">{formatCost(selectedProductCost.laborCost)} ج.م</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500">تكلفة غير مباشرة</span>
                  <span className="text-sm font-bold text-[var(--color-text)]">{formatCost(selectedProductCost.indirectCost)} ج.م</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-violet-200 dark:border-violet-700">
                  <span className="text-xs font-bold text-slate-500">إجمالي الإنتاج</span>
                  <span className="text-sm font-bold text-[var(--color-text)]">{formatNumber(selectedProductCost.quantityProduced)} وحدة</span>
                </div>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-[var(--color-border)]">
              <h4 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-[0.2em] mb-4">أهم تنبيهات اليوم</h4>
              {productionLines.filter((l) => l.status === ProductionLineStatus.IDLE).length > 0 ? (
                <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/10 p-3 rounded-[var(--border-radius-base)] border border-amber-100 dark:border-amber-900/20">
                  <DashboardIcon name="info" className="text-amber-500 text-sm mt-0.5" />
                  <p className="text-xs text-[var(--color-text-muted)] dark:text-amber-200/80 leading-relaxed font-medium">
                    يوجد {productionLines.filter((l) => l.status === ProductionLineStatus.IDLE).length} خط إنتاج في وضع الاستعداد. يمكن تشغيلها لزيادة الطاقة الإنتاجية.
                  </p>
                </div>
              ) : productionLines.filter((l) => l.status === ProductionLineStatus.MAINTENANCE).length > 0 ? (
                <div className="flex items-start gap-3 bg-[#f8f9fa] p-3 rounded-[var(--border-radius-base)] border border-[var(--color-border)]">
                  <DashboardIcon name="build" className="text-[var(--color-text-muted)] text-sm mt-0.5" />
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed font-medium">
                    يوجد {productionLines.filter((l) => l.status === ProductionLineStatus.MAINTENANCE).length} خط في وضع الصيانة.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-900/10 p-3 rounded-[var(--border-radius-base)] border border-emerald-100 dark:border-emerald-900/20">
                  <DashboardIcon name="check_circle" className="text-emerald-500 text-sm mt-0.5" />
                  <p className="text-xs text-[var(--color-text-muted)] dark:text-emerald-200/80 leading-relaxed font-medium">
                    جميع الخطوط تعمل بشكل طبيعي.
                  </p>
                </div>
              )}
            </div>
          </Card>
              );
            default:
              return null;
          }
        }}
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
                    {_rawProducts.map((p) => (
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
                    من <span className="font-bold text-[var(--color-text)]">{_rawProducts.find(p => p.id === targetForm.currentProductId)?.name}</span> لهذا الخط
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




