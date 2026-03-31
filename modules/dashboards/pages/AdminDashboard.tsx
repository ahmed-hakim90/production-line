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
import { Card, KPIBox, Badge } from '../components/UI';
import { PageHeader } from '@/src/components/erp/PageHeader';
import { KPICard } from '@/src/components/erp/KPICard';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { DataTable, type Column } from '@/src/components/erp/DataTable';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { GhostButton } from '@/src/components/erp/ActionButton';
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
import { exportProductSummary, exportProductionPlanShortages } from '../../../utils/exportExcel';
import {
  formatCost,
  getCurrentMonth,
  buildSupervisorHourlyRatesMap,
  computeLiveProductCosts,
} from '../../../utils/costCalculations';
import { monthlyProductionCostService, type MonthlyDashboardCostSummary } from '@/modules/costs/services/monthlyProductionCostService';
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
import {
  getAlertSettings,
  getKPIThreshold,
  getKPIColor,
  KPI_COLOR_CLASSES,
  isWidgetVisible,
} from '../../../utils/dashboardConfig';
import type { ProductionReport, ActivityLog, QuickActionItem, QuickActionColor } from '../../../types';
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

const getComplianceDefaultDate = (nowMs: number): string => {
  const d = new Date(nowMs);
  if (d.getHours() < COMPLIANCE_CUTOFF_HOUR) {
    d.setDate(d.getDate() - 1);
  }
  return formatDateISO(d);
};

const PIE_COLORS = ['#1392ec', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

const PRESET_LABELS: Record<PeriodPreset, string> = {
  today: 'اليوم',
  yesterday: 'أمس',
  week: 'هذا الأسبوع',
  month: 'هذا الشهر',
  '3months': 'آخر 3 أشهر',
  custom: 'مخصص',
};

const QUICK_ACTION_COLOR_CLASSES: Record<QuickActionColor, string> = {
  primary: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/15',
  emerald: 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 border-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/20',
  amber: 'bg-amber-50 dark:bg-amber-900/10 text-amber-600 border-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/20',
  rose: 'bg-rose-50 dark:bg-rose-900/10 text-rose-600 border-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/20',
  violet: 'bg-violet-50 dark:bg-violet-900/10 text-violet-600 border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/20',
  slate: 'bg-[#f0f2f5] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-[#e8eaed]',
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
          stroke="#e8eaed"
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
          fill="#94a3b8"
          style={{ fontSize: '13px', fontWeight: 700 }}
        >
          {statusLabel}
        </text>
        {/* Min/Max labels */}
        <text x={cx - r - 5} y={cy + 18} textAnchor="middle" fill="#94a3b8" style={{ fontSize: '10px', fontWeight: 600 }}>0</text>
        <text x={cx + r + 5} y={cy + 18} textAnchor="middle" fill="#94a3b8" style={{ fontSize: '10px', fontWeight: 600 }}>100</text>
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
    systemSettings,
  } = useDashboardSlice();
  const productionPlanFollowUps = useAppStore((s) => s.productionPlanFollowUps);
  const appLoading = useAppStore((s) => s.loading);
  const productsLoading = useAppStore((s) => s.productsLoading);
  const linesLoading = useAppStore((s) => s.linesLoading);
  const ensureProductionReportsForRange = useAppStore((s) => s.ensureProductionReportsForRange);
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

  // â”€â”€ Period filter state (local to this dashboard) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [preset, setPreset] = useState<PeriodPreset>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [monthlyCostSummary, setMonthlyCostSummary] = useState<MonthlyDashboardCostSummary | null>(null);

  // â”€â”€ System metrics state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  const [systemUsers, setSystemUsers] = useState<SystemUsers>({ total: 0, active: 0, disabled: 0 });
  const [rolesDistribution, setRolesDistribution] = useState<{ roleName: string; color: string; count: number }[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [systemLoading, setSystemLoading] = useState(true);
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

  // Fetch system metrics (tenant-aware)
  useEffect(() => {
    let cancelled = false;
    setSystemLoading(true);
    setSystemUsers({ total: 0, active: 0, disabled: 0 });
    setRolesDistribution([]);
    setRecentActivity([]);
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
  }, [tenantSlug]);

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

  // â”€â”€ KPI Calculations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const kpis = useMemo(() => {
    const reportsTotalProduction = reports.reduce((s, r) => s + (r.quantityProduced || 0), 0);
    const reportsTotalWaste = reports.reduce((s, r) => s + getReportWaste(r), 0);
    // Same source as FactoryManagerDashboard: sum loaded reports (not dashboardStats) so KPI matches raw data.
    const totalProduction = monthlyCostMode
      ? Number(monthlyCostSummary?.totals.producedQty || 0)
      : reportsTotalProduction;
    const totalWaste = reportsTotalWaste;
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

    const computedTotalCost = totalLaborCost + totalIndirectCost;
    const totalCost = computedTotalCost;
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
  }, [reports, liveCostComputation, hourlyRate, lineProductConfigs, productionPlans, planReports, monthlyCostMode, monthlyCostSummary]);

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

  // â”€â”€ Production Health Score â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€ Charts Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  const topSupervisors = useMemo(() => {
    const map = new Map<string, { production: number; reports: number }>();
    reports.forEach((report) => {
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
  }, [reports, _rawEmployees]);

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
        const product = _rawProducts.find((p) => p.id === wo.productId)?.name ?? '—';
        return { woId, produced: s.completedUnits || 0, line, product };
      })
      .filter((x): x is { woId: string; produced: number; line: string; product: string } => !!x)
      .sort((a, b) => b.produced - a.produced)[0];

    const hottestFromWorkOrders = workOrders
      .filter((w) => w.status === 'pending' || w.status === 'in_progress')
      .map((w) => {
        const producedFromLive = liveProduction[w.id ?? '']?.completedUnits;
        const producedNow = producedFromLive ?? w.actualProducedFromScans ?? w.scanSummary?.completedUnits ?? w.producedQuantity ?? 0;
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
          name: product?.name || productId,
          code: product?.code || '',
          category: product?.model || 'غير مصنفة',
          qty,
          avgCost: monthlyCostMode ? Number((d as { averageUnitCost: number }).averageUnitCost || 0) : Number((d as { costPerUnit: number }).costPerUnit || 0),
        };
      })
      .filter((row) => row.qty > 0)
      .sort((a, b) => b.qty - a.qty);
  }, [monthlyCostMode, monthlyCostSummary, liveCostComputation.byProduct, _rawProducts]);

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

  const weightedAvgProductCost = useMemo(() => {
    const totalQty = filteredProductSummary.reduce((sum, product) => sum + product.qty, 0);
    if (totalQty <= 0) return 0;
    const weightedTotal = filteredProductSummary.reduce((sum, product) => sum + (product.avgCost * product.qty), 0);
    return weightedTotal / totalQty;
  }, [filteredProductSummary]);

  const getProductCostTrend = useCallback((avgCost: number) => {
    if (!canViewCosts || weightedAvgProductCost <= 0) {
      return {
        label: '—',
        direction: 'flat' as 'up' | 'down' | 'flat',
        delta: 0,
      };
    }
    const delta = avgCost - weightedAvgProductCost;
    const absDelta = Math.abs(delta);
    if (absDelta < 0.01) {
      return {
        label: 'مطابق للمتوسط',
        direction: 'flat' as 'up' | 'down' | 'flat',
        delta: 0,
      };
    }
    if (delta > 0) {
      return {
        label: `أعلى ${formatCost(absDelta)} ج.م`,
        direction: 'up' as 'up' | 'down' | 'flat',
        delta,
      };
    }
    return {
      label: `أقل ${formatCost(absDelta)} ج.م`,
      direction: 'down' as 'up' | 'down' | 'flat',
      delta,
    };
  }, [canViewCosts, weightedAvgProductCost]);

  const quickActions = useMemo(() => {
    const configured = (systemSettings?.quickActions ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return configured.filter((item) => {
      if (item.actionType === 'export_excel' && !canExportFromPage) return false;
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
        productName: _rawProducts.find((p) => p.id === row.productId)?.name || '—',
        componentName: row.componentName || '—',
        shortageQty: Number(row.shortageQty || 0),
        note: row.note || '',
      }));
  }, [productionPlanFollowUps, _rawProducts]);

  const runQuickAction = useCallback((action: QuickActionItem) => {
    if (action.actionType === 'navigate' && action.target) {
      navigate(action.target);
      return;
    }
    if (action.actionType === 'export_excel' && canExportFromPage) {
      exportProductSummary(filteredProductSummary, canViewCosts);
    }
  }, [navigate, filteredProductSummary, canViewCosts, canExportFromPage]);

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
        message: `${delayedPlans.length} خطط إنتاج متأخرة عن الجدول الزمني`,
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

  // â”€â”€ Tooltips â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const ChartTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        dir="rtl"
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
        dir="rtl"
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

  // â”€â”€ Loading State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (isFinalLoading && reports.length === 0) {
    return (
      <div className="erp-dashboard-theme space-y-6">
        <PageHeader title="لوحة مدير النظام" subtitle="جاري تحميل البيانات..." />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <KPICard key={`admin-loading-kpi-${idx}`} label="" value="" loading />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="erp-dashboard-theme space-y-6">
      {/* â”€â”€ Alerts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {isVisible('alerts') && alerts.length > 0 && (
        <div className="space-y-1.5">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`erp-alert${
                alert.type === 'danger'  ? ' erp-alert-error' :
                alert.type === 'warning' ? ' erp-alert-warning' :
                                           ' erp-alert-info'
              } erp-animate-in`}
            >
              {renderDashboardIcon(alert.icon, 'text-[18px] shrink-0')}
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

     

      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <PageHeader
        title="لوحة مدير النظام"
        subtitle="نظرة شاملة على الإنتاج والنظام والصحة العامة"
        actions={
          isFinalLoading ? (
            <span className="text-[12px] text-[var(--color-text-muted)] flex items-center gap-1">
              {renderDashboardIcon('sync', 'text-[14px] animate-spin')}
              جاري التحديث...
            </span>
          ) : undefined
        }
      />

      {/* â”€â”€ Period Filter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

      {reportsError && (
        <div className="erp-alert erp-alert-warning">
          {renderDashboardIcon('warning', 'text-[18px] shrink-0')}
          <span>تعذر تحميل بيانات التقارير: {reportsError}</span>
        </div>
      )}
      {!isFinalLoading && !reportsError && reports.length === 0 && (
        <div className="erp-alert erp-alert-info">
          {renderDashboardIcon('info', 'text-[18px] shrink-0')}
          <span>لا توجد تقارير إنتاج في الفترة المحددة.</span>
        </div>
      )}

      {/*  */}

      {quickActions.length > 0 && (
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-2">
              {renderDashboardIcon('bolt', 'text-primary')}
              <h3 className="text-sm font-bold text-[var(--color-text)]">إجراءات سريعة</h3>
            </div>
            <div className="flex flex-wrap gap-2 sm:mr-auto">
              {quickActions.map((action) => (
                <GhostButton
                  key={action.id}
                  onClick={() => runQuickAction(action)}
                  className={`h-9 px-3 text-sm font-medium ${QUICK_ACTION_COLOR_CLASSES[action.color]}`}
                >
                  {renderDashboardIcon(action.icon, 'text-sm')}
                  <span>{action.label}</span>
                </GhostButton>
              ))}
            </div>
          </div>
        </Card>
      )}

      <CustomDashboardWidgets dashboardKey="adminDashboard" systemSettings={systemSettings} />


      {/* â”€â”€ Operational KPIs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {isVisible('operational_kpis') && (
      <div>
        <h3 className="text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
          {renderDashboardIcon('precision_manufacturing', 'text-base')}
          مؤشرات تشغيلية
        </h3>
        <div className="overflow-x-auto pb-2 -mx-1 px-1 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
          {isFinalLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
              {Array.from({ length: canViewCosts ? 6 : 3 }).map((_, idx) => (
                <KPICard key={`admin-kpi-loading-${idx}`} label="" value="" loading />
              ))}
            </div>
          ) : (
            <div className={`flex gap-3 min-w-max sm:min-w-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 ${canViewCosts ? 'xl:grid-cols-6' : 'xl:grid-cols-3'} sm:gap-4`}>
              <KPICard label="إجمالي الإنتاج" value={formatNumber(kpis.totalProduction)} unit="وحدة" iconType="metric" color="indigo" />
              {canViewCosts && (
                <KPICard label={`إجمالي التكلفة (${PRESET_LABELS[preset]})`} value={formatCost(kpis.totalCost)} unit="ج.م" iconType="money" color="green" />
              )}
              {canViewCosts && (
                <KPICard label="تكلفة الوحدة" value={formatCost(kpis.avgCostPerUnit)} unit="ج.م" iconType="money" color="amber" />
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
            </div>
          )}
        </div>
      </div>
      )}

      {/* <Card>
        <div className="flex items-center gap-2 mb-4">
          {renderDashboardIcon('bolt', 'text-blue-500')}
          <h3 className="text-lg font-bold">الإنتاج اللحظي (الباركود)</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPIBox label="وحدات مكتملة الآن" value={liveScanKpis.completedUnits} icon="check_circle" colorClass="bg-emerald-100 text-emerald-600" />
          <KPIBox label="وحدات قيد التشغيل" value={liveScanKpis.inProgressUnits} icon="hourglass_top" colorClass="bg-amber-100 text-amber-600" />
          <KPIBox label="عمالة فعالة" value={liveScanKpis.activeWorkers} icon="groups" colorClass="bg-blue-100 text-blue-600" />
          <KPIBox label="متوسط سيكل تايم" value={liveScanKpis.avgCycleSeconds} unit="ث" icon="timer" colorClass="bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400" />
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-4">
          أعلى نشاط حالي: <span className="font-bold text-[var(--color-text)]">{liveScanKpis.hotLineProduct}</span>
        </p>
      </Card> */}
{/* â”€â”€ Product Summary Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
{productSummary.length > 0 && (() => {
        return (
          <Card>
            <div className="flex flex-col gap-3 mb-4">
              <div className="flex items-center gap-2">
                {renderDashboardIcon('inventory_2', 'text-primary')}
                <h3 className="text-lg font-bold">ملخص المنتجات خلال الفترة</h3>
                <Badge variant="info">{productSummary.length} منتج</Badge>
              </div>
              <SmartFilterBar
                searchPlaceholder="بحث بالكود أو الاسم..."
                searchValue={productSearch}
                onSearchChange={setProductSearch}
                quickFilters={[
                  {
                    key: 'category',
                    placeholder: 'كل الفئات',
                    options: productSummaryCategories.map((category) => ({ value: category, label: category })),
                    width: 'w-[200px]',
                  },
                ]}
                quickFilterValues={{ category: productCategoryFilter || 'all' }}
                onQuickFilterChange={(_, value) => setProductCategoryFilter(value)}
                onApply={() => undefined}
                applyLabel="عرض"
                extra={canExportFromPage ? (
                  <button
                    type="button"
                    onClick={() => exportProductSummary(filteredProductSummary, canViewCosts)}
                    className="inline-flex h-[34px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-sm font-medium hover:bg-slate-50"
                    title="تصدير Excel"
                  >
                    {renderDashboardIcon('download', 'text-sm')}
                    <span>Excel</span>
                  </button>
                ) : undefined}
                className="mb-0"
              />
            </div>
            <div className="md:hidden space-y-2.5">
              {filteredProductSummary.length === 0 ? (
                <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-4 text-center text-[var(--color-text-muted)] text-sm">
                  لا توجد نتائج مطابقة للفلاتر الحالية
                </div>
              ) : (
                <>
                  {filteredProductSummary.map((p, i) => (
                    <div key={p.id} className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => navigate(`/products/${p.id}`)}
                            className="text-sm font-bold text-primary text-right leading-snug hover:underline line-clamp-2"
                          >
                            {p.name}
                          </button>
                          <p className="text-[11px] font-mono text-[var(--color-text-muted)] mt-1">{p.code || '—'}</p>
                        </div>
                        <span className="text-[11px] font-mono text-[var(--color-text-muted)]">#{i + 1}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-[var(--border-radius-base)] bg-[var(--color-bg)] px-2.5 py-2">
                          {canViewCosts ? (
                            <>
                              <p className="text-[var(--color-text-muted)] mb-0.5">متوسط تكلفة الوحدة</p>
                              <p className="font-mono font-bold text-[var(--color-text)]">{formatCost(p.avgCost)} ج.م</p>
                            </>
                          ) : (
                            <>
                              <p className="text-[var(--color-text-muted)] mb-0.5">الحالة</p>
                              <p className="font-bold text-[var(--color-text)]">—</p>
                            </>
                          )}
                        </div>
                        <div className="rounded-[var(--border-radius-base)] bg-[var(--color-bg)] px-2.5 py-2">
                          <p className="text-[var(--color-text-muted)] mb-0.5">الكمية</p>
                          <p className="font-mono font-bold text-primary">{formatNumber(p.qty)}</p>
                        </div>
                      </div>
                      {canViewCosts && (() => {
                        const trend = getProductCostTrend(p.avgCost);
                        return (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-[var(--color-text-muted)] font-bold">الاتجاه</span>
                            <span className={`font-bold ${
                              trend.direction === 'up'
                                ? 'text-rose-500'
                                : trend.direction === 'down'
                                  ? 'text-emerald-600'
                                  : 'text-[var(--color-text-muted)]'
                            }`}>
                              {trend.label}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                  <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--color-text-muted)]">الإجمالي</span>
                    <span className="font-mono font-bold text-primary">{formatNumber(filteredProductSummary.reduce((s, p) => s + p.qty, 0))}</span>
                  </div>
                </>
              )}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="erp-table w-full text-sm">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">#</th>
                    <th className="erp-th">المنتج</th>
                    <th className="erp-th">الكود</th>
                    <th className="erp-th">الكمية المنتجة</th>
                    {canViewCosts && (
                      <th className="erp-th">متوسط تكلفة الوحدة</th>
                    )}
                    {canViewCosts && (
                      <th className="erp-th">الاتجاه</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredProductSummary.length === 0 ? (
                    <tr>
                      <td colSpan={canViewCosts ? 6 : 4} className="py-8 text-center text-[var(--color-text-muted)] text-sm">
                        لا توجد نتائج مطابقة للفلاتر الحالية
                      </td>
                    </tr>
                  ) : (
                    filteredProductSummary.map((p, i) => (
                      <tr key={i} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors">
                        <td className="py-3 px-4 text-[var(--color-text-muted)] font-mono text-xs">{i + 1}</td>
                        <td className="py-3 px-4 font-bold">
                          <button
                            onClick={() => navigate(`/products/${p.id}`)}
                            className="text-primary hover:underline cursor-pointer transition-colors"
                          >{p.name}</button>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{p.code}</td>
                        <td className="py-3 px-4 font-mono font-bold text-primary">{formatNumber(p.qty)}</td>
                        {canViewCosts && (
                          <td className="py-3 px-4 font-mono font-bold text-[var(--color-text)]">{formatCost(p.avgCost)} ج.م</td>
                        )}
                        {canViewCosts && (() => {
                          const trend = getProductCostTrend(p.avgCost);
                          return (
                            <td className="py-3 px-4">
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-[var(--border-radius-base)] text-[11px] font-bold ${
                                trend.direction === 'up'
                                  ? 'bg-rose-50 text-rose-600'
                                  : trend.direction === 'down'
                                    ? 'bg-emerald-50 text-emerald-600'
                                    : 'bg-[var(--color-bg)] text-[var(--color-text-muted)]'
                              }`}>
                                {renderDashboardIcon(
                                  trend.direction === 'up' ? 'trending_up' : trend.direction === 'down' ? 'trending_down' : 'drag_handle',
                                  'text-[13px]'
                                )}
                                <span>{trend.label}</span>
                              </span>
                            </td>
                          );
                        })()}
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredProductSummary.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]">
                      <td colSpan={3} className="py-3 px-4 font-bold text-[var(--color-text-muted)]">الإجمالي</td>
                      <td className="py-3 px-4 font-mono font-bold text-primary">{formatNumber(filteredProductSummary.reduce((s, p) => s + p.qty, 0))}</td>
                      {canViewCosts && (
                        <td className="py-3 px-4 font-mono font-bold text-[var(--color-text)]">
                          {formatCost(filteredProductSummary.reduce((s, p) => s + p.qty, 0) > 0
                            ? filteredProductSummary.reduce((s, p) => s + p.avgCost * p.qty, 0) / filteredProductSummary.reduce((s, p) => s + p.qty, 0)
                            : 0
                          )} ج.م
                        </td>
                      )}
                      {canViewCosts && (
                        <td className="py-3 px-4 text-[var(--color-text-muted)] font-bold">—</td>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
        );
      })()}

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            {renderDashboardIcon('report_problem', 'text-amber-600')}
            <h3 className="text-sm font-bold text-[var(--color-text)]">نواقص المكونات</h3>
            <Badge variant="warning">{shortageRows.length}</Badge>
          </div>
          {canExportFromPage && shortageRows.length > 0 && (
            <button
              type="button"
              onClick={() => exportProductionPlanShortages(shortageRows)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--border-radius-base)] border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-muted)] hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-all"
            >
              {renderDashboardIcon('download', 'text-sm')}
              <span>Excel</span>
            </button>
          )}
        </div>
        {shortageRows.length === 0 ? (
          <div className="erp-alert erp-alert-info">
            {renderDashboardIcon('info', 'text-[18px] shrink-0')}
            <span>لا توجد نواقص مكونات مسجلة حاليًا.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-table w-full text-sm" data-no-table-enhance="true">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">المنتج</th>
                  <th className="erp-th">المكون</th>
                  <th className="erp-th">الكمية</th>
                  <th className="erp-th">الملحوظة</th>
                </tr>
              </thead>
              <tbody>
                {shortageRows.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--color-border)]">
                    <td className="py-2.5 px-3 font-bold text-[var(--color-text)]">{row.productName}</td>
                    <td className="py-2.5 px-3 text-[var(--color-text-muted)]">{row.componentName}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-rose-600">{formatNumber(row.shortageQty)}</td>
                    <td className="py-2.5 px-3 text-[var(--color-text-muted)]">{row.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            {renderDashboardIcon('fact_check', 'text-rose-500')}
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
           
          </div>
        </div>
        {yesterdayComplianceLoading ? (
          <DataTable columns={complianceColumns} data={[]} isLoading emptyMessage="جاري تحميل الحالة..." />
        ) : yesterdayComplianceError ? (
          <p className="text-xs text-rose-600 font-medium">{yesterdayComplianceError}</p>
        ) : yesterdayCompliance?.isFactoryHoliday ? (
          <div className="erp-alert erp-alert-info">
            {renderDashboardIcon('weekend', 'text-[18px] shrink-0')}
            <span>{yesterdayCompliance.holidayReason || 'إجازة المصنع'}</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <div className="rounded-[var(--border-radius-lg)] border border-slate-200 bg-[#f8f9fa] p-3">
                <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1"> إجمالي المشرفين المطلوب منهم</p>
              
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
      <Card>
        <div className="flex items-center gap-2 mb-4">
          {renderDashboardIcon('verified', 'text-violet-500')}
          <h3 className="text-lg font-bold">مؤشرات الجودة</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <KPIBox label="وحدات مفحوصة" value={qualityKpis.inspected} icon="fact_check" colorClass="bg-blue-100 text-blue-600" />
          <KPIBox label="وحدات فاشلة" value={qualityKpis.failed} icon="error" colorClass="bg-rose-100 text-rose-600" />
          <KPIBox label="إعادة تشغيل" value={qualityKpis.rework} icon="build" colorClass="bg-amber-100 text-amber-600" />
          <KPIBox label="Defect Rate" value={qualityKpis.defectRate} unit="%" icon="priority_high" colorClass="bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400" />
          <KPIBox label="FPY" value={qualityKpis.avgFpy} unit="%" icon="insights" colorClass="bg-emerald-100 text-emerald-600" />
          <KPIBox label="Pending Quality" value={qualityKpis.pendingQuality} icon="pending_actions" colorClass="bg-[#f0f2f5] text-[var(--color-text-muted)]" />
        </div>
      </Card>

{/* â”€â”€ Active Work Orders (same visual style) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
{(() => {
        const activeWOs = activeWorkOrders;
        if (activeWOs.length === 0) return null;
        const totalQty = activeWOs.reduce((s, w) => s + w.quantity, 0);
        const totalProduced = activeWOs.reduce((s, w) => {
          const producedFromLive = liveProduction[w.id ?? '']?.completedUnits;
          const producedNow = producedFromLive ?? w.actualProducedFromScans ?? w.scanSummary?.completedUnits ?? w.producedQuantity ?? 0;
          return s + producedNow;
        }, 0);
        const overallProgress = totalQty > 0 ? Math.round((totalProduced / totalQty) * 100) : 0;

        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {renderDashboardIcon('assignment', 'text-amber-500')}
                <h3 className="text-base font-bold text-[var(--color-text)]">أوامر الشغل النشطة</h3>
                <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{activeWOs.length}</span>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span className="font-bold">الإجمالي: {formatNumber(totalProduced)} / {formatNumber(totalQty)}</span>
                <span className={`font-medium ${overallProgress >= 80 ? 'text-emerald-600' : overallProgress >= 50 ? 'text-amber-600' : 'text-slate-500'}`}>{overallProgress}%</span>
              </div>
            </div>

            <div className="overflow-x-auto pb-2 -mx-1 px-1 sm:overflow-visible sm:pb-0 sm:mx-0 sm:px-0">
              <div className="flex gap-3 min-w-max sm:min-w-0 sm:grid sm:grid-cols-2 xl:grid-cols-3 sm:gap-4">
                {activeWOs.map((wo) => {
                const product = _rawProducts.find((p) => p.id === wo.productId);
                const lineName = _rawLines.find((l) => l.id === wo.lineId)?.name ?? '—';
                const supervisor = _rawEmployees.find((e) => e.id === wo.supervisorId);
                const producedFromLive = liveProduction[wo.id ?? '']?.completedUnits;
                const producedNow = producedFromLive ?? wo.actualProducedFromScans ?? wo.scanSummary?.completedUnits ?? wo.producedQuantity ?? 0;
                const reportCount = (wo.id ? workOrderCardMetricsData.reportsByWorkOrderId[wo.id]?.length : 0) || 0;
                const effectiveStatus = wo.status === 'in_progress' && reportCount === 0 ? 'pending' : wo.status;
                const progress = wo.quantity > 0 ? Math.round((producedNow / wo.quantity) * 100) : 0;
                const remaining = wo.quantity - producedNow;
                const metrics = getWorkOrderCardMetrics(wo, product, workOrderCardMetricsData, {
                  producedNowRaw: producedNow,
                  lineDailyWorkingHours: Number(_rawLines.find((l) => l.id === wo.lineId)?.dailyWorkingHours || 0),
                  supervisorHourlyRate: Number(supervisor?.hourlyRate || laborSettings?.hourlyRate || 0),
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
                  <div
                    key={wo.id}
                    onClick={() => navigate('/work-orders')}
                    className={`min-w-[280px] max-w-[85vw] sm:min-w-0 sm:max-w-none rounded-[var(--border-radius-xl)] border p-5 space-y-4 transition-all cursor-pointer hover:ring-2 hover:ring-amber-200 dark:hover:ring-amber-800 ${
                      effectiveStatus === 'in_progress'
                        ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200/40'
                        : 'bg-[#f8f9fa]/50 border-[var(--color-border)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {renderDashboardIcon('assignment', 'text-amber-500 text-lg')}
                        <span className="text-sm font-bold text-amber-700">أمر شغل #{wo.workOrderNumber}</span>
                      </div>
                      <Badge variant={effectiveStatus === 'in_progress' ? 'warning' : 'neutral'}>
                        {effectiveStatus === 'in_progress' ? 'قيد التنفيذ' : 'في الانتظار'}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      {renderDashboardIcon('inventory_2', 'text-[var(--color-text-muted)] text-base')}
                      <p className="text-sm font-bold text-[var(--color-text)] truncate">{product?.name ?? '—'}</p>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {renderDashboardIcon('person', 'text-indigo-400 text-base')}
                        <span className="text-sm font-bold text-[var(--color-text-muted)]">{supervisor?.name ?? '—'}</span>
                      </div>
                      {canViewCosts && (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-[var(--color-card)] rounded-[var(--border-radius-base)] px-3 py-1">
                            {renderDashboardIcon('payments', 'text-emerald-500 text-sm')}
                            <span className="text-[10px] text-slate-400">التكلفة المقدرة</span>
                            <span className="text-sm font-bold text-emerald-600">
                              {metrics.estimatedUnitCost !== null ? formatCost(metrics.estimatedUnitCost) : '—'}
                            </span>
                            <span className="text-[10px] text-slate-400">/وحدة</span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-[var(--color-card)] rounded-[var(--border-radius-base)] px-3 py-1">
                            {renderDashboardIcon('calculate', 'text-primary text-sm')}
                            <span className="text-[10px] text-slate-400">التكلفة الفعلية</span>
                            <span className="text-sm font-bold text-primary">
                              {metrics.actualUnitCostToDate !== null ? formatCost(metrics.actualUnitCostToDate) : '—'}
                            </span>
                            <span className="text-[10px] text-slate-400">/وحدة</span>
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
                        {renderDashboardIcon('precision_manufacturing', 'text-sm')}
                        <span className="font-bold">{lineName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {renderDashboardIcon('groups', 'text-sm')}
                        <span className="font-bold">متوسط العمالة: {avgWorkersLabel}</span>
                      </div>
                      <div className="flex items-center gap-1 mr-auto">
                        {renderDashboardIcon('event', 'text-sm')}
                        <span className="font-bold">{wo.targetDate}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--color-text-muted)]">
                      <div className="flex items-center gap-1">
                        {renderDashboardIcon('calendar_month', 'text-sm')}
                        <span className="font-bold">
                          أيام تشغيل (بدون الجمعة): {metrics.estimatedWorkDays !== null ? metrics.estimatedWorkDays : '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {renderDashboardIcon('schedule', 'text-sm')}
                        <span className="font-bold">
                          أيام متبقية (مقدر): {metrics.remainingDaysByBenchmark !== null ? metrics.remainingDaysByBenchmark.toFixed(1) : '—'}
                        </span>
                      </div>
                      {canViewCosts && (
                        <div className="flex items-center gap-1">
                          {renderDashboardIcon('payments', 'text-sm')}
                          <span className="font-bold">
                            تكلفة الأيام المقدرة: {metrics.estimatedTotalCost !== null ? `${formatCost(metrics.estimatedTotalCost)} ج.م` : '—'}
                          </span>
                        </div>
                      )}
                      {canViewCosts && (
                        <div className="flex items-center gap-1 mr-auto">
                          {renderDashboardIcon('request_quote', 'text-sm')}
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
      
      
      {/* â”€â”€ System KPIs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {isVisible('system_kpis') && <div>
        <h3 className="text-sm font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3 flex items-center gap-2">
          {renderDashboardIcon('computer', 'text-base')}
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
            colorClass="bg-emerald-100 text-emerald-600"
          />
          <KPIBox
            label="حسابات معطلة"
            value={systemUsers.disabled}
            icon="person_off"
            colorClass={systemUsers.disabled > 0 ? 'bg-rose-100 text-rose-600' : 'bg-[#f0f2f5] text-slate-500'}
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

     
      {/* â”€â”€ Production Health Score + Charts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Health Score Gauge */}
        {/* {isVisible('health_score') &&
        <Card>
          <div className="flex items-center gap-2 mb-4">
            {renderDashboardIcon('monitor_heart', 'text-rose-500')}
            <h3 className="text-lg font-bold">صحة الإنتاج</h3>
          </div>
          <div className="flex justify-center py-4">
            <GaugeChart value={healthScore} label="مؤشر صحة الإنتاج" />
          </div>
          <div className="mt-4 space-y-3 border-t border-[var(--color-border)] pt-4">
            {[
              { label: 'الكفاءة', value: kpis.efficiency, weight: '30%', icon: 'speed' },
              { label: 'انحراف التكلفة', value: Math.abs(kpis.costVariance) <= 5 ? 100 : Math.abs(kpis.costVariance) <= 15 ? 70 : 40, weight: '20%', icon: 'compare_arrows' },
              { label: 'الهدر', value: kpis.wastePercent <= 2 ? 100 : kpis.wastePercent <= 5 ? 75 : 40, weight: '25%', icon: 'delete_sweep' },
              { label: 'تحقيق الخطة', value: kpis.planAchievementRate, weight: '25%', icon: 'fact_check' },
            ].map((metric) => (
              <div key={metric.label} className="flex items-center gap-3">
                {renderDashboardIcon(metric.icon, 'text-[14px] text-[var(--color-text-muted)]')}
                <span className="text-[12px] font-medium text-[var(--color-text-muted)] flex-1">{metric.label}</span>
                <span className="text-[10px] text-[var(--color-text-muted)]">({metric.weight})</span>
                <div className="erp-progress-wrap" style={{ width: 80 }}>
                  <div
                    className={`erp-progress-bar${metric.value >= 75 ? ' success' : metric.value < 50 ? ' error' : ''}`}
                    style={{
                      width: `${Math.min(metric.value, 100)}%`,
                      background: metric.value >= 75 ? '#16a34a' : metric.value >= 50 ? '#d97706' : '#dc2626',
                    }}
                  />
                </div>
                <span className="text-[11px] font-bold text-[var(--color-text)] w-7 text-left">{Math.round(metric.value)}</span>
              </div>
            ))}
          </div>
        </Card>
        } */}

        {/* Roles Distribution Pie */}
        {isVisible('roles_distribution') && <Card>
          <div className="flex items-center gap-2 mb-4">
            {renderDashboardIcon('admin_panel_settings', 'text-indigo-500')}
            <h3 className="text-lg font-bold">توزيع الأدوار</h3>
          </div>
          {rolesChartData.length > 0 ? (
            <div style={{ direction: 'ltr' }} className="h-56 min-h-[14rem] min-w-0">
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
            <div className="h-56 flex items-center justify-center text-[var(--color-text-muted)] text-sm">
              {systemLoading ? 'جاري التحميل...' : 'لا توجد بيانات'}
            </div>
          )}
          {rolesChartData.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
              {rolesChartData.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}></span>
                  <span className="text-slate-600 font-bold">{d.name}: {d.value}</span>
                </div>
              ))}
            </div>
          )}
        </Card>}
      </div>

      {/* â”€â”€ Production vs Cost Chart (full width) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {isVisible('production_cost_chart') && canViewCosts && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            {renderDashboardIcon('show_chart', 'text-primary')}
            <h3 className="text-lg font-bold">الإنتاج مقابل تكلفة الوحدة</h3>
          </div>
          {dailyChartData.length > 0 ? (
            <div style={{ direction: 'ltr' }} className="h-72 min-h-[18rem] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.7} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--color-text-muted)', fontFamily: 'Cairo' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--color-text-muted)', fontFamily: 'Cairo' }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--color-text-muted)', fontFamily: 'Cairo' }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    formatter={(val: string) => val === 'production' ? 'الإنتاج' : 'تكلفة الوحدة'}
                    wrapperStyle={{ fontSize: 12, fontFamily: 'Cairo' }}
                  />
                  <Bar yAxisId="left" dataKey="production" name="production" fill="var(--chart-1,#1392ec)" radius={[3, 3, 0, 0]} barSize={18} />
                  <Line yAxisId="right" type="monotone" dataKey="costPerUnit" name="costPerUnit" stroke="var(--chart-3,#f59e0b)" strokeWidth={2} dot={{ r: 3, fill: 'var(--chart-3,#f59e0b)' }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-[var(--color-text-muted)] text-sm">
              {renderDashboardIcon('bar_chart', 'ml-2')}
              لا توجد بيانات للفترة المحددة
            </div>
          )}
        </Card>
      )}

      {/* â”€â”€ System Monitoring Section â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Log Snapshot */}
        {isVisible('activity_log') && <Card>
          <div className="flex items-center gap-2 mb-4">
            {renderDashboardIcon('history', 'text-blue-500')}
            <h3 className="text-lg font-bold">آخر النشاطات</h3>
            <span className="text-xs text-[var(--color-text-muted)] font-medium mr-auto">آخر 10 إجراءات</span>
          </div>
          {recentActivity.length > 0 ? (
            <div className="space-y-0.5 max-h-[400px] overflow-y-auto">
              {recentActivity.map((log, i) => (
                <div
                  key={log.id || i}
                  onClick={() => navigate('/activity-log')}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-[var(--border-radius-base)] hover:bg-[#f8f9fa] transition-colors group cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-[var(--border-radius-base)] bg-[#f0f2f5] flex items-center justify-center shrink-0 mt-0.5">
                    {renderDashboardIcon(ACTION_ICONS[log.action] || 'info', 'text-sm text-slate-500')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-bold text-[var(--color-text)] truncate">
                        {log.userEmail}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f0f2f5] text-[var(--color-text-muted)] font-bold shrink-0">
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] truncate">{log.description}</p>
                  </div>
                  <span className="text-[10px] text-[var(--color-text-muted)] font-medium whitespace-nowrap shrink-0 mt-1">
                    {formatTimestamp(log.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-[var(--color-text-muted)] text-sm">
              {renderDashboardIcon('history', 'text-3xl mb-2 block opacity-30')}
              {systemLoading ? 'جاري التحميل...' : 'لا توجد نشاطات مسجلة'}
            </div>
          )}
        </Card>}

        {/* Cost Centers Summary */}
        {isVisible('cost_centers_summary') && canViewCosts && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              {renderDashboardIcon('account_balance', 'text-emerald-500')}
              <h3 className="text-lg font-bold">ملخص مراكز التكلفة</h3>
              <span className="text-xs text-[var(--color-text-muted)] font-medium mr-auto">الشهر الحالي</span>
            </div>
            {costCentersSummary.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="erp-table w-full text-sm">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">المركز</th>
                      <th className="erp-th">النوع</th>
                      <th className="erp-th">المبلغ</th>
                      <th className="erp-th text-center">التخصيص</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costCentersSummary.map((cc, i) => (
                      <tr key={i} onClick={() => navigate('/cost-centers')} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa] transition-colors cursor-pointer">
                        <td className="py-2.5 px-3 font-bold text-sm">{cc.name}</td>
                        <td className="py-2.5 px-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                            cc.type === 'indirect'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-100 dark:bg-blue-900/20 text-blue-700'
                          }`}>
                            {cc.type === 'indirect' ? 'غير مباشر' : 'مباشر'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-sm font-bold text-[var(--color-text-muted)]">
                          {cc.amount > 0 ? `${formatCost(cc.amount)} ج.م` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {cc.allocated ? (
                            renderDashboardIcon('check_circle', 'text-emerald-500 text-sm')
                          ) : (
                            renderDashboardIcon('radio_button_unchecked', 'text-[var(--color-text-muted)] dark:text-slate-600 text-sm')
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-[var(--color-text-muted)] text-sm">
                {renderDashboardIcon('account_balance', 'text-3xl mb-2 block opacity-30')}
                لا توجد مراكز تكلفة
              </div>
            )}
          </Card>
        )}

        {isVisible('monthly_depreciation_summary') && canViewCosts && (
          <Card>
            <div className="flex items-center gap-2 mb-4">
              {renderDashboardIcon('event_repeat', 'text-violet-500')}
              <h3 className="text-lg font-bold">ملخص الاهلاكات الشهرية</h3>
              <span className="text-xs text-[var(--color-text-muted)] font-medium mr-auto">{monthlyDepreciationSummary.month}</span>
            </div>
            {monthlyDepreciationSummary.rows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="erp-table w-full text-sm">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">مركز التكلفة</th>
                      <th className="erp-th">عدد الأصول</th>
                      <th className="erp-th">قيمة الإهلاك</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyDepreciationSummary.rows.map((row) => (
                      <tr key={row.centerId} className="border-b border-[var(--color-border)] hover:bg-[#f8f9fa] transition-colors">
                        <td className="py-2.5 px-3 font-bold text-sm text-[var(--color-text)]">{row.centerName}</td>
                        <td className="py-2.5 px-3 text-sm font-bold text-[var(--color-text-muted)]">{formatNumber(row.assetsCount)}</td>
                        <td className="py-2.5 px-3 text-sm font-bold text-violet-600">{formatCost(row.amount)} ج.م</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[var(--color-border)] bg-[#f8f9fa]/60">
                      <td className="py-2.5 px-3 font-bold text-[var(--color-text-muted)]">الإجمالي</td>
                      <td className="py-2.5 px-3 text-sm font-bold text-[var(--color-text-muted)]">
                        {formatNumber(monthlyDepreciationSummary.rows.reduce((sum, row) => sum + row.assetsCount, 0))}
                      </td>
                      <td className="py-2.5 px-3 text-sm font-bold text-violet-600">{formatCost(monthlyDepreciationSummary.total)} ج.م</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-[var(--color-text-muted)] text-sm">
                {renderDashboardIcon('event_repeat', 'text-3xl mb-2 block opacity-30')}
                لا توجد اهلاكات مسجلة لهذا الشهر
              </div>
            )}
          </Card>
        )}
      </div>

      {/* â”€â”€ Top Lines & Products â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Top 5 Lines */}
        {isVisible('top_lines') && <Card>
          <div className="flex items-center gap-2 mb-4">
            {renderDashboardIcon('precision_manufacturing', 'text-emerald-500')}
            <h3 className="text-lg font-bold">أعلى 5 خطوط إنتاج</h3>
          </div>
          {topLines.length > 0 ? (
            <div style={{ direction: 'ltr' }} className="h-64 min-h-[16rem] min-w-0">
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

        {/* Top 5 Products */}
        {isVisible('top_products') && <Card>
          <div className="flex items-center gap-2 mb-4">
            {renderDashboardIcon('inventory_2', 'text-violet-500')}
            <h3 className="text-lg font-bold">أعلى 5 منتجات</h3>
          </div>
          {topProducts.length > 0 ? (
            <div style={{ direction: 'ltr' }} className="h-64 min-h-[16rem] min-w-0">
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

        {/* Top 5 Supervisors */}
        {isVisible('top_supervisors') && <Card>
          <div className="flex items-center gap-2 mb-4">
            {renderDashboardIcon('supervisor_account', 'text-amber-500')}
            <h3 className="text-lg font-bold">أعلى 5 مشرفين في الأداء</h3>
          </div>
          {topSupervisors.length > 0 ? (
            <div style={{ direction: 'ltr' }} className="h-64 min-h-[16rem] min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topSupervisors} layout="vertical" margin={{ left: 70 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="production" name="الإنتاج" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-[var(--color-text-muted)] text-sm">
              لا توجد بيانات
            </div>
          )}
        </Card>}
      </div>

      {/* â”€â”€ Product Performance Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {isVisible('product_performance') && <Card>
        <div className="flex items-center gap-2 mb-4">
          {renderDashboardIcon('table_chart', 'text-primary')}
          <h3 className="text-lg font-bold">ملخص أداء المنتجات</h3>
        </div>
        {topProducts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="erp-table w-full text-sm">
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
  );
};






