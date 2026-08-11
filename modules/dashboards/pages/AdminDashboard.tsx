import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Armchair,
  BadgeCheck,
  BarChart3,
  Calculator,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Circle,
  Clock3,
  Download,
  Factory,
  FilePlus2,
  FileSpreadsheet,
  FileText,
  Gauge,
  Grip,
  HeartPulse,
  History,
  Info,
  Landmark,
  LogIn,
  LogOut,
  Monitor,
  Package2,
  PencilLine,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
  Table2,
  Trash2,
  TrendingUp,
  TrendingDown,
  User,
  UserCog,
  UserPlus,
  UserX,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { useDashboardSlice } from '../../../store/selectors';
import { useAppStore, getProductionReportsRangeCacheKey } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { getExportImportPageControl } from '../../../utils/exportImportControls';
import {
  buildManufacturingItemCodeMap,
  buildManufacturingItemNameMap,
  resolveManufacturingItemName,
} from '../../../utils/manufacturingItemLabels';
import { KPIBox, Badge, Button } from '../components/UI';
import { OpsDashPanel } from '../components/OperationsDashboardBoard';
import { KPICard } from '@/src/components/erp/KPICard';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataTable, type Column } from '@/src/components/erp/DataTable';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { GhostButton } from '@/src/components/erp/ActionButton';
import type { TableIconActionTone } from '@/src/components/erp/TableIconAction';
import { CustomDashboardWidgets } from '../../../components/CustomDashboardWidgets';
import { adminService, type SystemUsers } from '../services/adminService';
import { reportComplianceService, type ReportComplianceSnapshot } from '../services/reportComplianceService';
import {
  calculateWasteRatio,
  calculateWorkOrderExecutionMetrics,
  formatNumber,
  getReportWaste,
  getExecutionDeviationTone,
  getTodayDateString,
} from '../../../utils/calculations';
import { effectiveStandardAssemblyMinutes } from '../../../utils/routingStandardAssembly';
import { countsTowardFinishedGoodsProduction } from '../../production/utils/packagingLine';
import { exportProductSummary, exportProductionPlanShortages } from '../../../utils/exportExcel';
import {
  formatCost,
  getCurrentMonth,
  buildSupervisorHourlyRatesMap,
  computeLiveProductCosts,
} from '../../../utils/costCalculations';
import { monthlyProductionCostService, type MonthlyDashboardCostSummary } from '@/modules/costs/services/monthlyProductionCostService';
import {
  PRODUCTION_REPORT_CREATE_PATHS,
  PRODUCTION_REPORT_OPERATION_KEYS,
  isOperationPathEnabled,
} from '../../system/lib/operationPathSettings';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  emptyWorkOrderCardMetricsData,
  getWorkOrderCardMetrics,
  loadWorkOrderCardMetricsData,
  type WorkOrderCardMetricsData,
} from '../utils/workOrderCardMetrics';
import { buildLaborGoalsAnalysis } from '../utils/laborGoalAnalysis';
import {
  getAlertSettings,
  getKPIThreshold,
  getKPIColor,
  KPI_COLOR_CLASSES,
  isWidgetVisible,
} from '../../../utils/dashboardConfig';
import type { ProductionReport, ActivityLog, QuickActionItem, QuickActionColor } from '../../../types';
import {
  fetchCachedPageData,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';
import { OperationalDecisionQueue } from '../components/OperationalDecisionQueue';
import { DomainHomeShell } from '../components/DomainHomeShell';
import { ModuleChartsHomeBoard } from '../components/ModuleChartsHomeBoard';
import { useOperationalDecisionSnapshot } from '../hooks/useOperationalDecisionSnapshot';
import {
  averageScheduleAdherence,
  computeProductionHealthBreakdown,
  isPlanBehindSchedule,
  laborUtilizationPercent,
  outputVsIdealPercent,
  qualityRatesFromTotals,
  resolvePlanReports,
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
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
} from 'recharts';

// â”€â”€ Period filter types (local to this dashboard) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type PeriodPreset = 'today' | 'yesterday' | 'week' | 'month' | '3months' | 'custom';

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
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const date = fmt(y);
      return { start: date, end: date };
    }
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

const COMPLIANCE_CUTOFF_HOUR = 13;

const formatDateISO = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getPreviousMonth = (month: string): string => {
  const [year, mon] = month.split('-').map(Number);
  if (!year || !mon) return month;
  const date = new Date(year, mon - 1, 1);
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const getComplianceDefaultDate = (nowMs: number): string => {
  const d = new Date(nowMs);
  if (d.getHours() < COMPLIANCE_CUTOFF_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  return formatDateISO(d);
};

const PIE_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-7)'];

const PRESET_LABELS: Record<PeriodPreset, string> = {
  today: 'اليوم',
  yesterday: 'أمس',
  week: 'هذا الأسبوع',
  month: 'هذا الشهر',
  '3months': 'آخر 3 أشهر',
  custom: 'مخصص',
};

const QUICK_ACTION_TONE: Record<QuickActionColor, TableIconActionTone> = {
  primary: 'execute',
  emerald: 'approve',
  amber: 'edit',
  rose: 'reject',
  violet: 'save',
  slate: 'neutral',
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

const DASHBOARD_ICON_MAP: Record<string, LucideIcon> = {
  shield: Shield,
  warning: AlertTriangle,
  delete_sweep: Trash2,
  speed: Gauge,
  person_off: UserX,
  info: Info,
  bolt: Zap,
  precision_manufacturing: Factory,
  inventory_2: Package2,
  search: Search,
  category: Settings2,
  download: Download,
  report_problem: AlertTriangle,
  fact_check: ShieldCheck,
  weekend: Armchair,
  verified: BadgeCheck,
  assignment: FileText,
  person: User,
  payments: Wallet,
  calculate: Calculator,
  groups: Users,
  event: CalendarDays,
  calendar_month: CalendarRange,
  schedule: Clock3,
  request_quote: FileSpreadsheet,
  computer: Monitor,
  monitor_heart: HeartPulse,
  admin_panel_settings: UserCog,
  show_chart: TrendingUp,
  bar_chart: BarChart3,
  history: History,
  account_balance: Landmark,
  account_balance_wallet: Wallet,
  group: Users,
  check_circle: CheckCircle2,
  trending_up: TrendingUp,
  trending_down: TrendingDown,
  drag_handle: Grip,
  radio_button_unchecked: Circle,
  event_repeat: CalendarRange,
  supervisor_account: UserCog,
  table_chart: Table2,
  sync: Settings2,
  login: LogIn,
  logout: LogOut,
  note_add: FilePlus2,
  edit_note: PencilLine,
  delete: Trash2,
  person_add: UserPlus,
  toggle_on: Settings2,
  compare_arrows: TrendingUp,
  rule: ShieldCheck,
  package_2: Package2,
  event_note: CalendarDays,
  hourglass_top: Clock3,
  error: AlertTriangle,
  build: Settings2,
  priority_high: AlertTriangle,
  insights: BarChart3,
  pending_actions: Clock3,
  build_circle: Settings2,
  timelapse: Clock3,
  local_shipping: Package2,
};

const renderDashboardIcon = (
  icon: string,
  className?: string,
  style?: React.CSSProperties,
) => {
  const Icon = DASHBOARD_ICON_MAP[icon] ?? Circle;
  return <Icon className={className} style={style} />;
};

// â”€â”€ Gauge Chart Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const GaugeChart: React.FC<{ value: number; label: string }> = ({ value, label }) => {
  const clampedValue = Math.max(0, Math.min(100, value));
  const angle = (clampedValue / 100) * 180;

  const getColor = (v: number) => {
    if (v >= 80) return 'var(--chart-2)';
    if (v >= 60) return 'var(--chart-3)';
    if (v >= 40) return 'var(--chart-3)';
    return 'var(--chart-4)';
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
          stroke="var(--color-border)"
          strokeWidth="14"
          strokeLinecap="round"
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
          className="text-3xl font-medium"
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
          fill="var(--color-text-muted)"
          style={{ fontSize: '13px', fontWeight: 700 }}
        >
          {statusLabel}
        </text>
        {/* Min/Max labels */}
        <text x={cx - r - 5} y={cy + 18} textAnchor="middle" fill="var(--color-text-muted)" style={{ fontSize: '10px', fontWeight: 600 }}>0</text>
        <text x={cx + r + 5} y={cy + 18} textAnchor="middle" fill="var(--color-text-muted)" style={{ fontSize: '10px', fontWeight: 600 }}>100</text>
      </svg>
      <p className="text-sm font-bold text-[var(--color-text-muted)] -mt-2">{label}</p>
    </div>
  );
};

// â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const AdminDashboard: React.FC = () => {
  const navigate = useTenantNavigate();
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { can } = usePermission();
  const canViewCosts = can('costs.view');

  const {
    _rawProducts,
    products,
    _rawLines,
    _rawEmployees,
    workOrders,
    liveProduction,
    productionPlans,
    planReports,
    costCenters,
    costCenterValues,
    costAllocations,
    assets,
    assetDepreciations,
    laborSettings,
    lineProductConfigs,
    routingTotalTimeSecondsByProduct,
    systemSettings,
    reportsUiReferenceCache,
    ensureReportsUiReferenceData,
  } = useDashboardSlice();
  const productionPlanFollowUps = useAppStore((s) => s.productionPlanFollowUps);
  const appLoading = useAppStore((s) => s.loading);
  const productsLoading = useAppStore((s) => s.productsLoading);
  const linesLoading = useAppStore((s) => s.linesLoading);
  const ensureProductionReportsForRange = useAppStore((s) => s.ensureProductionReportsForRange);

  useEffect(() => {
    void ensureReportsUiReferenceData();
  }, [ensureReportsUiReferenceData]);

  const rawMaterialOptions = reportsUiReferenceCache?.rawMaterialOptions;
  const manufacturingNameMap = useMemo(
    () => buildManufacturingItemNameMap(_rawProducts, products, rawMaterialOptions ?? []),
    [_rawProducts, products, rawMaterialOptions],
  );
  const manufacturingCodeMap = useMemo(
    () => buildManufacturingItemCodeMap(_rawProducts, products, rawMaterialOptions ?? []),
    [_rawProducts, products, rawMaterialOptions],
  );
  const pageControl = useMemo(
    () => getExportImportPageControl(systemSettings.exportImport, 'adminDashboard'),
    [systemSettings.exportImport]
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;

  const alertCfg = useMemo(() => getAlertSettings(systemSettings), [systemSettings]);
  const isVisible = useCallback(
    (widgetId: string) => isWidgetVisible(systemSettings, 'adminDashboard', widgetId),
    [systemSettings]
  );
  const { snapshot: decisionSnapshot, loading: decisionLoading } = useOperationalDecisionSnapshot({
    planDelayDays: alertCfg.planDelayDays,
  });

  // â”€â”€ Period filter state (local to this dashboard) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [preset, setPreset] = useState<PeriodPreset>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthlyCostSummary, setMonthlyCostSummary] = useState<MonthlyDashboardCostSummary | null>(null);
  const [previousMonthlyCostSummary, setPreviousMonthlyCostSummary] = useState<MonthlyDashboardCostSummary | null>(null);
  const [prevMonthReports, setPrevMonthReports] = useState<ProductionReport[]>([]);

  // â”€â”€ System metrics state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  const systemMetricsCacheKey = `dashboard:admin:system-metrics:${tenantSlug || 'default'}`;
  const initialSystemMetrics = peekPageDataCache<{
    users: SystemUsers;
    roles: { roleName: string; color: string; count: number }[];
    activity: ActivityLog[];
  }>(systemMetricsCacheKey);
  const [systemUsers, setSystemUsers] = useState<SystemUsers>(
    () => initialSystemMetrics?.users ?? { total: 0, active: 0, disabled: 0 },
  );
  const [rolesDistribution, setRolesDistribution] = useState<{ roleName: string; color: string; count: number }[]>(
    () => initialSystemMetrics?.roles ?? [],
  );
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>(
    () => initialSystemMetrics?.activity ?? [],
  );
  const [systemLoading, setSystemLoading] = useState(() => initialSystemMetrics == null);
  const [yesterdayCompliance, setYesterdayCompliance] = useState<ReportComplianceSnapshot | null>(null);
  const [yesterdayComplianceLoading, setYesterdayComplianceLoading] = useState(true);
  const [yesterdayComplianceError, setYesterdayComplianceError] = useState<string | null>(null);
  const [selectedComplianceDate, setSelectedComplianceDate] = useState(() => getComplianceDefaultDate(Date.now()));
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [workOrderCardMetricsData, setWorkOrderCardMetricsData] = useState<WorkOrderCardMetricsData>(
    () => emptyWorkOrderCardMetricsData(),
  );
  const [referenceDataLoadingTimedOut, setReferenceDataLoadingTimedOut] = useState(false);

  const dateRange = useMemo(() => {
    if (preset === 'custom' && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    return getPresetRange(preset);
  }, [preset, customStart, customEnd]);
  /** شهر تقويمي (من 1 إلى أي يوم داخل نفس الشهر) — فلتر «هذا الشهر» لا ينتهي بآخر يوم */
  const calendarMonthKey = useMemo(() => {
    const { start, end } = dateRange;
    if (!start || !end || start.length < 10 || end.length < 10) return null;
    const monthKey = start.slice(0, 7);
    if (end.slice(0, 7) !== monthKey) return null;
    if (start.slice(8, 10) !== '01') return null;
    return monthKey;
  }, [dateRange]);
  const yesterdayOperationalDate = useMemo(() => {
    const d = new Date(clockNow);
    d.setDate(d.getDate() - 1);
    return formatDateISO(d);
  }, [clockNow]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const hasReferenceDataGap = useMemo(() => {
    if (reports.length === 0) return false;
    return _rawProducts.length === 0 || _rawLines.length === 0;
  }, [reports.length, _rawProducts.length, _rawLines.length]);

  useEffect(() => {
    if (!hasReferenceDataGap) {
      setReferenceDataLoadingTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => setReferenceDataLoadingTimedOut(true), 12000);
    return () => window.clearTimeout(timer);
  }, [hasReferenceDataGap]);

  const isFinalLoading = loading
    || systemLoading
    || appLoading
    || productsLoading
    || linesLoading
    || (hasReferenceDataGap && !referenceDataLoadingTimedOut);

  const activeWorkOrders = useMemo(
    () => workOrders.filter((wo) => wo.status === 'pending' || wo.status === 'in_progress' || wo.status === 'paused'),
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

  // Fetch production reports by date range (shared Zustand cache + stale-while-revalidate)
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
    setReportsError(null);
    ensureProductionReportsForRange(start, end, { maxAgeMs })
      .then((data) => {
        if (cancelled) return;
        setReports(data);
        setLoading(false);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'تعذر تحميل تقارير الإنتاج.';
        setReportsError(message);
        setReports([]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [dateRange.start, dateRange.end, ensureProductionReportsForRange]);

  useEffect(() => {
    let cancelled = false;
    if (!calendarMonthKey) {
      setMonthlyCostSummary(null);
      return () => { cancelled = true; };
    }
    const cacheKey = `dashboard:admin:monthly-cost:${calendarMonthKey}`;
    const cached = peekPageDataCache<MonthlyDashboardCostSummary>(cacheKey);
    if (cached) setMonthlyCostSummary(cached);
    fetchCachedPageData(
      cacheKey,
      () => monthlyProductionCostService.getDashboardMonthlySummary(calendarMonthKey),
      { maxAgeMs: 60_000 },
    )
      .then(({ data: summary }) => {
        if (!cancelled) setMonthlyCostSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setMonthlyCostSummary(null);
      });
    return () => { cancelled = true; };
  }, [calendarMonthKey]);

  useEffect(() => {
    let cancelled = false;
    if (!calendarMonthKey) {
      setPreviousMonthlyCostSummary(null);
      return () => { cancelled = true; };
    }
    const prevMonth = getPreviousMonth(calendarMonthKey);
    const cacheKey = `dashboard:admin:monthly-cost:${prevMonth}`;
    const cached = peekPageDataCache<MonthlyDashboardCostSummary>(cacheKey);
    if (cached) setPreviousMonthlyCostSummary(cached);
    fetchCachedPageData(
      cacheKey,
      () => monthlyProductionCostService.getDashboardMonthlySummary(prevMonth),
      { maxAgeMs: 60_000 },
    )
      .then(({ data: summary }) => {
        if (!cancelled) setPreviousMonthlyCostSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setPreviousMonthlyCostSummary(null);
      });
    return () => { cancelled = true; };
  }, [calendarMonthKey]);

  useEffect(() => {
    let cancelled = false;
    if (!calendarMonthKey) {
      setPrevMonthReports([]);
      return () => { cancelled = true; };
    }
    const prevMonth = getPreviousMonth(calendarMonthKey);
    const [y, m] = prevMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const start = `${prevMonth}-01`;
    const end = `${prevMonth}-${String(lastDay).padStart(2, '0')}`;
    ensureProductionReportsForRange(start, end, { maxAgeMs: 5 * 60 * 1000 })
      .then((rows) => {
        if (!cancelled) setPrevMonthReports(rows);
      })
      .catch(() => {
        if (!cancelled) setPrevMonthReports([]);
      });
    return () => { cancelled = true; };
  }, [calendarMonthKey, ensureProductionReportsForRange]);

  // Fetch system metrics (tenant-aware)
  useEffect(() => {
    let cancelled = false;
    const cached = peekPageDataCache<{
      users: SystemUsers;
      roles: { roleName: string; color: string; count: number }[];
      activity: ActivityLog[];
    }>(systemMetricsCacheKey);
    if (cached) {
      setSystemUsers(cached.users);
      setRolesDistribution(cached.roles);
      setRecentActivity(cached.activity);
      setSystemLoading(false);
    } else {
      setSystemLoading(true);
    }
    fetchCachedPageData(
      systemMetricsCacheKey,
      async () => {
        const [users, roles, activity] = await Promise.all([
          adminService.getSystemUsers(),
          adminService.getRolesDistribution(),
          adminService.getRecentActivity(10),
        ]);
        return { users, roles, activity };
      },
      { maxAgeMs: 60_000 },
    ).then(({ data }) => {
      if (!cancelled) {
        setSystemUsers(data.users);
        setRolesDistribution(data.roles);
        setRecentActivity(data.activity);
        setSystemLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setSystemLoading(false);
    });
    return () => { cancelled = true; };
  }, [systemMetricsCacheKey]);

  useEffect(() => {
    let cancelled = false;
    const loadCompliance = async (force = false) => {
      const cacheKey = `dashboard:admin:compliance:${selectedComplianceDate}`;
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
  const monthlyCostMode = Boolean(calendarMonthKey && monthlyCostSummary);
  const productionReports = useMemo(
    () => reports.filter((r) => countsTowardFinishedGoodsProduction(r, _rawLines)),
    [reports, _rawLines],
  );

  // â”€â”€ KPI Calculations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    const avgLaborCostPerUnit = totalProduction > 0 ? totalLaborCost / totalProduction : 0;
    const avgCostPerUnit = totalProduction > 0 ? totalCost / totalProduction : 0;

    const standardConfigs = lineProductConfigs;
    let standardTotalCost = 0;
    let standardTotalQty = 0;
    productionReports.forEach((r) => {
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
    // Compare labor actual vs labor standard (same basis — loaded cost is shown separately).
    const costVariance = standardAvgCost > 0
      ? Number((((avgLaborCostPerUnit - standardAvgCost) / standardAvgCost) * 100).toFixed(1))
      : 0;

    const activePlans = productionPlans.filter(
      (p) => p.status === 'in_progress' || p.status === 'completed' || p.status === 'planned',
    );
    const planActuals = activePlans.map((plan) => {
      const pReports = resolvePlanReports(plan, planReports);
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
      totalCost,
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

  // â”€â”€ Cost Allocation Completion % â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€ Charts Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  const topSupervisors = useMemo(() => {
    const map = new Map<string, { production: number; reports: number }>();
    productionReports.forEach((report) => {
      const key = report.employeeId;
      const prev = map.get(key) || { production: 0, reports: 0 };
      prev.production += Number(report.quantityProduced || 0);
      prev.reports += 1;
      map.set(key, prev);
    });
    return Array.from(map.entries())
      .map(([employeeId, value]) => ({
        id: employeeId,
        name: _rawEmployees.find((employee) => employee.id === employeeId)?.name || employeeId,
        production: value.production,
        reports: value.reports,
      }))
      .sort((a, b) => b.production - a.production)
      .slice(0, 5);
  }, [productionReports, _rawEmployees]);

  const laborGoalsAnalysis = useMemo(() => {
    const endDate = dateRange.end || formatDateISO(new Date());
    const previousMonthProductionReports = prevMonthReports.filter((report) => countsTowardFinishedGoodsProduction(report, _rawLines));
    return buildLaborGoalsAnalysis({
      productionReports,
      previousMonthProductionReports,
      lineProductConfigs,
      endDate,
    });
  }, [productionReports, prevMonthReports, _rawLines, lineProductConfigs, dateRange.end]);

  // â”€â”€ Roles chart data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const rolesChartData = useMemo(() => {
    return rolesDistribution
      .filter((r) => r.count > 0)
      .map((r) => ({ name: r.roleName, value: r.count }));
  }, [rolesDistribution]);

  // â”€â”€ Cost Centers Summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  const monthlyDepreciationSummary = useMemo(() => {
    const currentMonth = getCurrentMonth();
    const byCenter = new Map<string, { amount: number; assetsCount: number }>();
    const activeAssetIds = new Set(
      assets
        .filter((asset) => asset.status === 'active' && asset.id)
        .map((asset) => String(asset.id)),
    );
    assetDepreciations
      .filter((entry) => entry.period === currentMonth && activeAssetIds.has(String(entry.assetId)))
      .forEach((entry) => {
        const centerId = assets.find((asset) => String(asset.id) === String(entry.assetId))?.centerId || '';
        if (!centerId) return;
        const prev = byCenter.get(centerId) || { amount: 0, assetsCount: 0 };
        prev.amount += Number(entry.depreciationAmount || 0);
        prev.assetsCount += 1;
        byCenter.set(centerId, prev);
      });

    const rows = Array.from(byCenter.entries())
      .map(([centerId, value]) => ({
        centerId,
        centerName: costCenters.find((center) => center.id === centerId)?.name || '—',
        amount: value.amount,
        assetsCount: value.assetsCount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
    const total = rows.reduce((sum, row) => sum + row.amount, 0);

    return { month: currentMonth, rows, total };
  }, [assetDepreciations, assets, costCenters]);

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
        const product = resolveManufacturingItemName(wo.productId, manufacturingNameMap);
        return { woId, produced: s.completedUnits || 0, line, product };
      })
      .filter((x): x is { woId: string; produced: number; line: string; product: string } => !!x)
      .sort((a, b) => b.produced - a.produced)[0];

    const hottestFromWorkOrders = workOrders
      .filter((w) => w.status === 'pending' || w.status === 'in_progress' || w.status === 'paused')
      .map((w) => {
        const producedFromLive = liveProduction[w.id ?? '']?.completedUnits;
        const producedNow = producedFromLive ?? w.actualProducedFromScans ?? w.scanSummary?.completedUnits ?? w.producedQuantity ?? 0;
        return {
          produced: producedNow,
          line: _rawLines.find((l) => l.id === w.lineId)?.name ?? '—',
          product: resolveManufacturingItemName(w.productId, manufacturingNameMap),
        };
      })
      .sort((a, b) => b.produced - a.produced)[0];

    const hottest = hottestFromLive ?? hottestFromWorkOrders;

    return {
      ...totals,
      avgCycleSeconds,
      hotLineProduct: hottest ? `${hottest.line} — ${hottest.product}` : '—',
    };
  }, [liveProduction, workOrders, _rawLines, manufacturingNameMap]);

  const supervisorExecutionDiscipline = useMemo(() => {
    const today = getTodayDateString();
    const activeWOs = workOrders.filter((wo) => wo.status === 'pending' || wo.status === 'in_progress' || wo.status === 'paused');
    if (activeWOs.length === 0) {
      return {
        delayedCount: 0,
        avgDeviation: null as number | null,
        worstSupervisors: [] as { supervisorId: string; name: string; deviation: number; delayed: number }[],
      };
    }

    const rows = activeWOs.map((wo) => {
      const producedNow = liveProduction[wo.id ?? '']?.completedUnits ?? wo.actualProducedFromScans ?? wo.scanSummary?.completedUnits ?? wo.producedQuantity ?? 0;
      const productAvgDaily = Math.max(0, Number(_rawProducts.find((p) => p.id === wo.productId)?.avgDailyProduction || 0));
      const execution = calculateWorkOrderExecutionMetrics({
        quantity: wo.quantity,
        producedQuantity: producedNow,
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
  }, [workOrders, liveProduction, _rawEmployees, _rawProducts]);

  const qualityKpis = useMemo(() => {
    const active = workOrders.filter((w) => w.status === 'pending' || w.status === 'in_progress' || w.status === 'paused' || w.status === 'completed');
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
      defectRate: rates.defectRate,
      failRate: rates.failRate,
      reworkRate: rates.reworkRate,
      avgFpy: rates.avgFpy,
      pendingQuality,
    };
  }, [workOrders]);

  const healthBreakdown = useMemo(() => {
    return computeProductionHealthBreakdown({
      yieldEfficiency: kpis.efficiency,
      costVarianceAbs: Math.abs(kpis.costVariance),
      wastePercent: kpis.wastePercent,
      planVolumeAchievement: kpis.planAchievementRate,
      scheduleAdherence: kpis.scheduleAdherence,
      openIssueCount: decisionSnapshot.issues.openCount,
      packagingAwaitingUnits: decisionSnapshot.packaging.awaitingUnits,
      pendingApprovals:
        decisionSnapshot.transfers.pendingProductionEntry +
        decisionSnapshot.transfers.pendingPackaging +
        decisionSnapshot.receipts.awaitingCount +
        decisionSnapshot.inventory.negativeCount +
        decisionSnapshot.materials.plansWithShortage,
      qualityFailRate: qualityKpis.failRate,
    });
  }, [kpis, decisionSnapshot, qualityKpis.failRate]);

  const healthScore = healthBreakdown.total;

  const workOrderRisk = useMemo(() => {
    let costToCompleteTotal = 0;
    let atRiskCount = 0;
    activeWorkOrders.forEach((wo) => {
      const producedNow = Math.max(
        Number(wo.producedQuantity || 0),
        Number(wo.actualProducedFromScans || wo.scanSummary?.completedUnits || 0),
      );
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

  // â”€â”€ Product Summary (products worked on during the period) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const productSummary = useMemo(() => {
    const sourceRows = monthlyCostMode
      ? (Object.entries(monthlyCostSummary?.perProduct || {}) as Array<[string, { producedQty: number; averageUnitCost: number }]>)
      : (Object.entries(liveCostComputation.byProduct) as Array<[string, { quantityProduced: number; costPerUnit: number }]>);
    return sourceRows
      .map(([productId, d]) => {
        const product = _rawProducts.find((p) => p.id === productId);
        const qty = monthlyCostMode
          ? Number((d as { producedQty: number }).producedQty || 0)
          : Number((d as { quantityProduced: number }).quantityProduced || 0);
        return {
          id: productId,
          name: resolveManufacturingItemName(productId, manufacturingNameMap),
          code: product?.code || manufacturingCodeMap.get(productId) || '',
          category: product?.model || 'غير مصنفة',
          qty,
          avgCost: monthlyCostMode ? Number((d as { averageUnitCost: number }).averageUnitCost || 0) : Number((d as { costPerUnit: number }).costPerUnit || 0),
        };
      })
      .filter((row) => row.qty > 0)
      .sort((a, b) => b.qty - a.qty);
  }, [monthlyCostMode, monthlyCostSummary, liveCostComputation.byProduct, _rawProducts, manufacturingNameMap, manufacturingCodeMap]);

  const productSummaryCategories = useMemo(() => {
    const categories = productSummary
      .map((p) => p.category)
      .filter((category): category is string => category.trim().length > 0);
    return (Array.from(new Set(categories)) as string[])
      .sort((a, b) => a.localeCompare(b, 'ar'));
  }, [productSummary]);

  const filteredProductSummary = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const byCategory = productCategoryFilter === 'all'
      ? productSummary
      : productSummary.filter((p) => p.category === productCategoryFilter);
    return q
      ? byCategory.filter((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
      : byCategory;
  }, [productSummary, productSearch, productCategoryFilter]);

  const prevMonthLiveCosts = useMemo(
    () => computeLiveProductCosts(
      prevMonthReports,
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
      },
    ),
    [
      prevMonthReports,
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
    ],
  );

  const prevUnitCostByProductId = useMemo(() => {
    const map = new Map<string, number>();
    Object.entries(previousMonthlyCostSummary?.perProduct || {}).forEach(([productId, row]) => {
      const prevAvg = Number(row.averageUnitCost || 0);
      if (prevAvg > 0) map.set(productId, prevAvg);
    });
    Object.entries(prevMonthLiveCosts.byProduct).forEach(([productId, row]) => {
      if (map.has(productId)) return;
      const unit = Number(row.costPerUnit || 0);
      if (unit > 0) map.set(productId, unit);
    });
    return map;
  }, [previousMonthlyCostSummary, prevMonthLiveCosts]);

  const getProductCostTrend = useCallback((productId: string, avgCost: number) => {
    if (!canViewCosts || avgCost <= 0) {
      return {
        label: '—',
        direction: 'flat' as 'up' | 'down' | 'flat',
        delta: 0,
      };
    }
    if (!calendarMonthKey) {
      return {
        label: '—',
        direction: 'flat' as 'up' | 'down' | 'flat',
        delta: 0,
      };
    }
    const prevCost = prevUnitCostByProductId.get(productId);
    if (prevCost === undefined) {
      return {
        label: 'لا بيانات للشهر السابق',
        direction: 'flat' as 'up' | 'down' | 'flat',
        delta: 0,
      };
    }
    const delta = avgCost - prevCost;
    const absDelta = Math.abs(delta);
    if (absDelta < 0.01) {
      return {
        label: 'مطابق للشهر السابق',
        direction: 'flat' as 'up' | 'down' | 'flat',
        delta: 0,
      };
    }
    if (delta > 0) {
      return {
        label: `أعلى ${formatCost(absDelta)} ج.م عن الشهر السابق`,
        direction: 'up' as 'up' | 'down' | 'flat',
        delta,
      };
    }
    return {
      label: `أقل ${formatCost(absDelta)} ج.م عن الشهر السابق`,
      direction: 'down' as 'up' | 'down' | 'flat',
      delta,
    };
  }, [canViewCosts, calendarMonthKey, prevUnitCostByProductId]);

  const quickActions = useMemo(() => {
    const configured = (systemSettings?.quickActions ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return configured.filter((item) => {
      if (item.actionType === 'export_excel' && !canExportFromPage) return false;
      if (
        item.actionType === 'navigate'
        && item.target === '/quick-action'
        && !isOperationPathEnabled(
          systemSettings,
          PRODUCTION_REPORT_OPERATION_KEYS.create,
          PRODUCTION_REPORT_CREATE_PATHS.quickAction,
        )
      ) return false;
      return !item.permission || can(item.permission as any);
    });
  }, [systemSettings, can, canExportFromPage]);

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

  const runQuickAction = useCallback((action: QuickActionItem) => {
    if (action.actionType === 'navigate' && action.target) {
      navigate(action.target);
      return;
    }
    if (action.actionType === 'export_excel' && canExportFromPage) {
      exportProductSummary(filteredProductSummary, canViewCosts, prevUnitCostByProductId);
    }
  }, [navigate, filteredProductSummary, canViewCosts, canExportFromPage, prevUnitCostByProductId]);

  // â”€â”€ Alerts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      const pReports = resolvePlanReports(p, planReports);
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
        message: `${delayedPlans.length} خطط إنتاج متأخرة عن الجدول (التزام ${kpis.scheduleAdherence}%)`,
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
        message: `${formatNumber(decisionSnapshot.packaging.awaitingUnits)} وحدة بانتظار التغليف · ${decisionSnapshot.transfers.pendingPackaging} تحويل تغليف معلّق`,
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
        message: `عائد الإنتاج (بدون هدر) أقل من الحد: ${kpis.efficiency}% (الحد: ${alertCfg.efficiencyThreshold}%)`,
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
  }, [kpis, productionPlans, planReports, systemUsers, alertCfg, decisionSnapshot, qualityKpis.pendingQuality, workOrderRisk.atRiskCount]);

  const reportAnalysis = useMemo(() => {
    const productionDays = new Set(productionReports.map((report) => report.date)).size;
    const avgDailyProduction = productionDays > 0 ? Math.round(kpis.totalProduction / productionDays) : 0;
    const topProduct = topProducts[0];
    const topLine = topLines[0];
    const topSupervisor = topSupervisors[0];
    const warningAlerts = alerts.filter((alert) => alert.type !== 'info').length;
    const assignedSupervisors = yesterdayCompliance?.assignedSupervisorsCount ?? 0;
    const complianceRate = assignedSupervisors > 0
      ? Math.round(((yesterdayCompliance?.submittedCount ?? 0) / assignedSupervisors) * 100)
      : null;

    const insights = [
      {
        title: 'قراءة الأداء',
        icon: kpis.efficiency >= 85 ? 'check_circle' : 'speed',
        tone: kpis.efficiency >= 85 ? 'success' : kpis.efficiency >= 70 ? 'warning' : 'danger',
        body: kpis.totalProduction > 0
          ? `الكفاءة الحالية ${kpis.efficiency}% مع متوسط إنتاج يومي ${formatNumber(avgDailyProduction)} وحدة.`
          : 'لا توجد بيانات إنتاج كافية لبناء قراءة أداء دقيقة لهذه الفترة.',
      },
      {
        title: 'التركيز الإنتاجي',
        icon: 'inventory_2',
        tone: topProduct ? 'info' : 'warning',
        body: topProduct
          ? `أعلى منتج في الفترة هو ${topProduct.name} بإجمالي ${formatNumber(topProduct.production)} وحدة.`
          : 'لم يظهر منتج رئيسي خلال الفترة المحددة.',
      },
      {
        title: 'التكلفة والهدر',
        icon: canViewCosts ? 'payments' : 'delete_sweep',
        tone: kpis.wastePercent > alertCfg.wasteThreshold || kpis.costVariance > alertCfg.costVarianceThreshold ? 'danger' : 'success',
        body: canViewCosts
          ? `تكلفة الوحدة ${formatCost(kpis.avgCostPerUnit)} ج.م، والهدر ${kpis.wastePercent}%، وانحراف التكلفة ${kpis.costVariance}%.`
          : `الهدر الحالي ${kpis.wastePercent}% مع إخفاء تفاصيل التكلفة حسب الصلاحيات.`,
      },
      {
        title: 'الالتزام والتنبيهات',
        icon: warningAlerts > 0 ? 'warning' : 'fact_check',
        tone: warningAlerts > 0 ? 'warning' : 'success',
        body: complianceRate !== null
          ? `التزام التقارير ${complianceRate}%، مع ${warningAlerts} تنبيه يحتاج متابعة.`
          : `${warningAlerts} تنبيه يحتاج متابعة، ولا توجد بيانات التزام مكتملة للتاريخ المختار.`,
      },
    ];

    const recommendations = [
      kpis.wastePercent > alertCfg.wasteThreshold
        ? 'مراجعة أسباب الهدر مع أعلى خط إنتاج وربطها بتقارير المشرفين اليومية.'
        : 'الاستمرار في متابعة الهدر يومياً للحفاظ على المستوى الحالي.',
      canViewCosts && kpis.costVariance > alertCfg.costVarianceThreshold
        ? 'تحليل المنتجات الأعلى تكلفة ومقارنة العمالة الفعلية بالمعيار قبل اعتماد الشهر.'
        : 'تثبيت مراجعة أسبوعية لتكلفة الوحدة على المنتجات الأعلى إنتاجاً.',
      warningAlerts > 0
        ? 'إغلاق التنبيهات المفتوحة حسب الأولوية قبل نهاية الوردية.'
        : 'لا توجد تنبيهات حرجة حالياً؛ ركز على توثيق أفضل الممارسات المتكررة.',
      shortageRows.length > 0
        ? 'متابعة نواقص المكونات مع المخزن لتجنب تعطيل أوامر الشغل النشطة.'
        : 'لا توجد نواقص مكونات مسجلة حالياً؛ راقب التغير مع خطط الإنتاج الجديدة.',
    ].filter(Boolean);

    return {
      productionDays,
      avgDailyProduction,
      topProduct,
      topLine,
      topSupervisor,
      warningAlerts,
      complianceRate,
      insights,
      recommendations,
    };
  }, [
    productionReports,
    kpis,
    topProducts,
    topLines,
    topSupervisors,
    alerts,
    yesterdayCompliance,
    canViewCosts,
    alertCfg,
    shortageRows.length,
  ]);

  // â”€â”€ Tooltips â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const ChartTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div
       
        style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--border-radius-base)',
          padding: '10px 14px',
          fontSize: 12.5,
        }}
      >
        <p style={{ fontWeight: 700, color: 'var(--color-text)', marginBottom: 6 }}>{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--color-text-muted)' }}>{entry.name}:</span>
            <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{formatNumber(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  }, []);

  const PieTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
      <div
       
        style={{
          background: 'var(--color-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--border-radius-base)',
          padding: '10px 14px',
          fontSize: 12.5,
        }}
      >
        <p style={{ fontWeight: 700, color: 'var(--color-text)', marginBottom: 4 }}>{d.name}</p>
        <p style={{ color: 'var(--color-text-muted)' }}>
          {typeof d.value === 'number' && d.value > 1000 ? formatCost(d.value) + ' ج.م' : d.value}
        </p>
      </div>
    );
  }, []);

  // â”€â”€ Format timestamp helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const formatTimestamp = (ts: any): string => {
    if (!ts) return '—';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }) +
      ' ' + date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
  };

  const complianceRows = useMemo(
    () => [
      ...((yesterdayCompliance?.missing ?? []).map((row) => ({ ...row, submitted: false }))),
      ...((yesterdayCompliance?.submitted ?? []).map((row) => ({ ...row, submitted: true }))),
    ],
    [yesterdayCompliance]
  );

  const complianceColumns: Column<(typeof complianceRows)[number]>[] = useMemo(
    () => [
      { key: 'name', header: 'المشرف', cell: (row) => <span className="font-medium text-[var(--color-text)]">{row.name}</span>, sortable: true },
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

  // â”€â”€ Loading State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const adminHero = useMemo(
    () => [
      {
        key: 'production',
        label: 'الإنتاج',
        value: formatNumber(kpis.totalProduction),
        accent: true,
      },
      {
        key: 'plan',
        label: 'تحقيق الخطط',
        value: `${kpis.planAchievementRate}%`,
      },
      {
        key: 'schedule',
        label: 'التزام الجدول',
        value: `${kpis.scheduleAdherence}%`,
      },
      {
        key: 'waste',
        label: 'الهدر',
        value: `${kpis.wastePercent}%`,
      },
      {
        key: 'efficiency',
        label: 'عائد الإنتاج',
        value: `${kpis.efficiency}%`,
      },
      {
        key: 'cost',
        label: 'تكلفة الوحدة',
        value: formatCost(kpis.avgCostPerUnit),
        meta: `إجمالي ${formatCost(kpis.totalCost)}`,
      },
    ],
    [kpis],
  );

  return (
    <DomainHomeShell
      denseHero
      eyebrow="لوحة الإدارة"
      hero={adminHero}
      periods={(Object.keys(PRESET_LABELS) as PeriodPreset[]).map((key) => ({
        value: key,
        label: PRESET_LABELS[key],
      }))}
      activePeriod={preset}
      onPeriodChange={(value) => setPreset(value as PeriodPreset)}
      rangeLabel={`${dateRange.start} → ${dateRange.end}`}
      refreshing={isFinalLoading || decisionLoading}
      secondarySummary="تنبيهات التشغيل"
      secondary={
        isVisible('alerts') && alerts.length > 0 ? (
          <div className="space-y-1.5">
            {alerts.map((alert, i) => (
              <div
                key={i}
                className={`erp-alert${
                  alert.type === 'danger'  ? ' erp-alert-error' :
                  alert.type === 'warning' ? ' erp-alert-warning' :
                                             ' erp-alert-info'
                }`}
              >
                {renderDashboardIcon(alert.icon, 'text-[18px] shrink-0')}
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">لا توجد تنبيهات ظاهرة حالياً.</p>
        )
      }
      dir="rtl"
    >
      <ModuleChartsHomeBoard />

      <OperationalDecisionQueue
        snapshot={decisionSnapshot}
        loading={decisionLoading}
        compact
        maxItems={8}
      />
    </DomainHomeShell>
  );
};