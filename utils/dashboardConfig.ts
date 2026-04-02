import type {
  SystemSettings, AlertSettings, KPIThreshold, WidgetConfig, PrintTemplateSettings,
  PlanSettings, BrandingSettings, ThemeSettings, DashboardDisplaySettings, AlertToggleSettings,
  QuickActionColor, QuickActionType, CustomWidgetType, CustomWidgetConfig,
  ExportImportSettings, ExportImportPageControl, SidebarIconStyle, AttendanceIntegrationSettings,
} from '../types';

// ─── Widget Registry ─────────────────────────────────────────────────────────

export interface WidgetDefinition {
  id: string;
  label: string;
  icon: string;
}

export interface WidgetTypeDefinition {
  type: CustomWidgetType;
  label: string;
  icon: string;
}

export const CUSTOM_WIDGET_TYPES: WidgetTypeDefinition[] = [
  { type: 'kpi', label: 'KPI', icon: 'analytics' },
  { type: 'text', label: 'نص توضيحي', icon: 'text_fields' },
  { type: 'quick_link', label: 'رابط سريع', icon: 'link' },
];

export const DASHBOARD_WIDGETS: Record<string, WidgetDefinition[]> = {
  dashboard: [
    { id: 'kpi_row', label: 'مؤشرات الأداء', icon: 'speed' },
    { id: 'product_cost_analysis', label: 'تحليل تكلفة المنتجات', icon: 'price_check' },
    { id: 'daily_cost_chart', label: 'الإنتاج اليومي مقابل التكلفة', icon: 'insights' },
    { id: 'production_lines', label: 'مراقبة خطوط الإنتاج', icon: 'precision_manufacturing' },
    { id: 'smart_planning', label: 'التخطيط الذكي', icon: 'calculate' },
  ],
  adminDashboard: [
    { id: 'operational_kpis', label: 'مؤشرات تشغيلية', icon: 'precision_manufacturing' },
    { id: 'system_kpis', label: 'مؤشرات النظام', icon: 'computer' },
    { id: 'alerts', label: 'التنبيهات', icon: 'notifications_active' },
    { id: 'health_score', label: 'صحة الإنتاج', icon: 'monitor_heart' },
    { id: 'cost_breakdown', label: 'توزيع التكاليف', icon: 'pie_chart' },
    { id: 'roles_distribution', label: 'توزيع الأدوار', icon: 'admin_panel_settings' },
    { id: 'production_cost_chart', label: 'الإنتاج مقابل التكلفة', icon: 'show_chart' },
    { id: 'activity_log', label: 'آخر النشاطات', icon: 'history' },
    { id: 'cost_centers_summary', label: 'ملخص مراكز التكلفة', icon: 'account_balance' },
    { id: 'monthly_depreciation_summary', label: 'ملخص الاهلاكات الشهرية', icon: 'event_repeat' },
    { id: 'top_lines', label: 'أعلى 5 خطوط إنتاج', icon: 'precision_manufacturing' },
    { id: 'top_products', label: 'أعلى 5 منتجات', icon: 'inventory_2' },
    { id: 'top_supervisors', label: 'أعلى 5 مشرفين في الأداء', icon: 'supervisor_account' },
    { id: 'product_performance', label: 'ملخص أداء المنتجات', icon: 'table_chart' },
  ],
  factoryDashboard: [
    { id: 'kpis', label: 'مؤشرات الأداء', icon: 'speed' },
    { id: 'alerts', label: 'التنبيهات', icon: 'notifications_active' },
    { id: 'production_cost_chart', label: 'الإنتاج مقابل التكلفة', icon: 'show_chart' },
    { id: 'cost_breakdown', label: 'توزيع التكاليف', icon: 'pie_chart' },
    { id: 'top_lines', label: 'أعلى 5 خطوط إنتاج', icon: 'precision_manufacturing' },
    { id: 'top_products', label: 'أعلى 5 منتجات', icon: 'inventory_2' },
    { id: 'product_performance', label: 'ملخص أداء المنتجات', icon: 'table_chart' },
  ],
};

export const DASHBOARD_LABELS: Record<string, string> = {
  dashboard: 'لوحة التحكم الرئيسية',
  adminDashboard: 'لوحة مدير النظام',
  factoryDashboard: 'لوحة مدير المصنع',
};

/** Flat lookup for labels/icons when a widget is placed on any dashboard (incl. cross-dashboard moves). */
export const ALL_DASHBOARD_WIDGET_DEFS: Record<string, WidgetDefinition> = (() => {
  const map: Record<string, WidgetDefinition> = {};
  Object.values(DASHBOARD_WIDGETS).forEach((defs) => {
    defs.forEach((d) => {
      if (!map[d.id]) map[d.id] = d;
    });
  });
  return map;
})();

/**
 * Built-in widget IDs to append once to an existing saved layout (e.g. after an app update).
 * When empty, saved `dashboardWidgets[dashboardKey]` is the full source of truth for built-ins.
 */
export const DASHBOARD_BUILTIN_WIDGET_MIGRATIONS: Record<string, readonly string[]> = {
  dashboard: [],
  adminDashboard: [],
  factoryDashboard: [],
};

// ─── Quick Actions Registry ─────────────────────────────────────────────────

export interface QuickActionDefinition {
  key: string;
  label: string;
  icon: string;
  color: QuickActionColor;
  actionType: QuickActionType;
  target?: string;
  permission?: string;
}

export const AVAILABLE_QUICK_ACTIONS: QuickActionDefinition[] = [
  { key: 'quick_action', label: 'إدخال سريع', icon: 'bolt', color: 'amber', actionType: 'navigate', target: '/quick-action', permission: 'quickAction.view' },
  { key: 'quick_inventory_transfer', label: 'تحويل مخزن سريع', icon: 'swap_horiz', color: 'emerald', actionType: 'navigate', target: '/quick-inventory-transfer', permission: 'inventory.transactions.create' },
  { key: 'transfer_approvals', label: 'اعتماد التحويلات', icon: 'verified_user', color: 'amber', actionType: 'navigate', target: '/inventory/transfer-approvals', permission: 'inventory.view' },
  { key: 'reports', label: 'التقارير', icon: 'bar_chart', color: 'primary', actionType: 'navigate', target: '/reports', permission: 'reports.view' },
  { key: 'quality_final', label: 'الفحص النهائي', icon: 'task_alt', color: 'emerald', actionType: 'navigate', target: '/quality/final-inspection', permission: 'quality.finalInspection.view' },
  { key: 'quality_ipqc', label: 'IPQC', icon: 'rule', color: 'violet', actionType: 'navigate', target: '/quality/ipqc', permission: 'quality.ipqc.view' },
  { key: 'quality_reports', label: 'تقارير الجودة', icon: 'print', color: 'slate', actionType: 'navigate', target: '/quality/reports', permission: 'quality.reports.view' },
  { key: 'lines', label: 'خطوط الإنتاج', icon: 'precision_manufacturing', color: 'violet', actionType: 'navigate', target: '/lines', permission: 'lines.view' },
  { key: 'products', label: 'المنتجات', icon: 'inventory_2', color: 'emerald', actionType: 'navigate', target: '/products', permission: 'products.view' },
  { key: 'plans', label: 'خطط الإنتاج', icon: 'event_note', color: 'primary', actionType: 'navigate', target: '/production-plans', permission: 'plans.view' },
  { key: 'work_orders', label: 'أوامر الشغل', icon: 'assignment', color: 'slate', actionType: 'navigate', target: '/work-orders', permission: 'workOrders.view' },
  { key: 'employees', label: 'الموظفين', icon: 'groups', color: 'emerald', actionType: 'navigate', target: '/employees', permission: 'employees.view' },
  { key: 'attendance', label: 'سجل الحضور', icon: 'fingerprint', color: 'violet', actionType: 'navigate', target: '/attendance', permission: 'attendance.view' },
  { key: 'approval_center', label: 'مركز الموافقات', icon: 'fact_check', color: 'amber', actionType: 'navigate', target: '/approval-center', permission: 'approval.view' },
  { key: 'payroll', label: 'كشف الرواتب', icon: 'receipt_long', color: 'rose', actionType: 'navigate', target: '/payroll', permission: 'payroll.view' },
  { key: 'cost_centers', label: 'مراكز التكلفة', icon: 'account_balance', color: 'slate', actionType: 'navigate', target: '/cost-centers', permission: 'costs.view' },
  { key: 'settings', label: 'الإعدادات', icon: 'settings', color: 'primary', actionType: 'navigate', target: '/settings', permission: 'settings.view' },
  { key: 'roles', label: 'الأدوار والصلاحيات', icon: 'admin_panel_settings', color: 'rose', actionType: 'navigate', target: '/roles', permission: 'roles.manage' },
  { key: 'export_product_summary', label: 'تصدير ملخص المنتجات (Excel)', icon: 'download', color: 'emerald', actionType: 'export_excel', permission: 'reports.view' },
];

// ─── KPI Registry ────────────────────────────────────────────────────────────

export interface KPIDefinition {
  key: string;
  label: string;
  icon: string;
  unit: string;
  invertedScale: boolean;
}

export const KPI_DEFINITIONS: KPIDefinition[] = [
  { key: 'efficiency', label: 'الكفاءة', icon: 'speed', unit: '%', invertedScale: false },
  { key: 'wasteRatio', label: 'نسبة الهدر', icon: 'delete_sweep', unit: '%', invertedScale: true },
  { key: 'costVariance', label: 'انحراف التكلفة', icon: 'compare_arrows', unit: '%', invertedScale: true },
  { key: 'planAchievement', label: 'تحقيق الخطط', icon: 'fact_check', unit: '%', invertedScale: false },
  { key: 'costAllocation', label: 'اكتمال التخصيص', icon: 'account_balance', unit: '%', invertedScale: false },
];

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  wasteThreshold: 5,
  costVarianceThreshold: 10,
  efficiencyThreshold: 75,
  planDelayDays: 3,
  overProductionThreshold: 120,
};

export const DEFAULT_KPI_THRESHOLDS: Record<string, KPIThreshold> = {
  efficiency: { good: 90, warning: 75 },
  wasteRatio: { good: 2, warning: 5 },
  costVariance: { good: 5, warning: 10 },
  planAchievement: { good: 90, warning: 70 },
  costAllocation: { good: 80, warning: 50 },
};

function buildDefaultWidgets(dashboardKey: string): WidgetConfig[] {
  const defs = DASHBOARD_WIDGETS[dashboardKey] || [];
  return defs.map((d) => ({ id: d.id, visible: true }));
}

export const DEFAULT_PRINT_TEMPLATE: PrintTemplateSettings = {
  logoUrl: '',
  headerText: 'مؤسسة المغربي',
  footerText: 'هذا التقرير تم إنشاؤه آلياً من نظام إدارة الإنتاج',
  primaryColor: '#1f2937',
  printThemePreset: 'erpnext',
  textColor: '#0f172a',
  mutedTextColor: '#334155',
  borderColor: '#94a3b8',
  tableHeaderBgColor: '#e2e8f0',
  tableHeaderTextColor: '#0f172a',
  tableRowAltBgColor: '#f8fafc',
  accentSuccessColor: '#065f46',
  accentWarningColor: '#92400e',
  accentDangerColor: '#991b1b',
  paperSize: 'a4',
  orientation: 'portrait',
  copies: 1,
  marginTopMm: 10,
  marginRightMm: 10,
  marginBottomMm: 10,
  marginLeftMm: 10,
  printBackground: true,
  decimalPlaces: 0,
  showWaste: true,
  showEmployee: true,
  showQRCode: false,
  showCosts: true,
  showWorkOrder: true,
  showSellingPrice: true,
};

export const DEFAULT_PLAN_SETTINGS: PlanSettings = {
  allowMultipleActivePlans: true,
  allowReportWithoutPlan: true,
  allowOverProduction: true,
  autoClosePlan: true,
  defaultProductionWarehouseId: '',
  rawMaterialWarehouseId: '',
  decomposedSourceWarehouseId: '',
  finishedReceiveWarehouseId: '',
  wasteReceiveWarehouseId: '',
  finalProductWarehouseId: '',
  transferApprovalPermission: 'inventory.transfers.approve',
  transferDisplayUnit: 'piece',
  hrApproverUserIds: [],
  allowNegativeDecomposedStock: false,
  allowNegativeFinishedTransferStock: false,
  requireFinishedStockApprovalForReports: true,
  maxWasteThreshold: 5,
  efficiencyCalculationMode: 'standard',
  averageProductionMode: 'daily',
  injectionRawMaterialCategoryKeywords: 'حقن',
};

export const DEFAULT_BRANDING: BrandingSettings = {
  factoryName: 'مؤسسة المغربي',
  logoUrl: '',
  currency: 'SAR',
  timezone: 'Asia/Riyadh',
};

export const DEFAULT_THEME: ThemeSettings = {
  primaryColor: '#4F46E5',
  secondaryColor: '#6366F1',
  successColor: '#059669',
  warningColor: '#D97706',
  dangerColor: '#DC2626',
  backgroundColor: '#F8FAFC',
  cssVars: {
    '--primary': '239 84% 60%',
    '--primary-foreground': '0 0% 100%',
    '--secondary': '240 5% 96%',
    '--secondary-foreground': '240 6% 10%',
    '--background': '210 40% 98%',
    '--foreground': '222 84% 5%',
    '--muted': '210 40% 96%',
    '--muted-foreground': '215 16% 47%',
    '--accent': '239 84% 97%',
    '--accent-foreground': '239 84% 30%',
    '--border': '214 32% 91%',
    '--input': '214 32% 91%',
    '--ring': '239 84% 60%',
    '--card': '0 0% 100%',
    '--card-foreground': '222 84% 5%',
    '--radius': '0.5rem',
  },
  darkMode: 'light',
  baseFontFamily: 'Cairo',
  baseFontSize: 14,
  borderRadius: 6,
  density: 'comfortable',
  sidebarIconStyle: 'colorful',
  textColor: '#1a1a1a',
  mutedTextColor: '#8d99a6',
  contentMaxWidth: '1536px',
  pageLayoutOverrides: {},
};

export const DEFAULT_DASHBOARD_DISPLAY: DashboardDisplaySettings = {
  showCostWidgets: true,
  showAlertsWidget: true,
  widgetsPerRow: 3,
  enableDragReorder: true,
};

export const DEFAULT_ALERT_TOGGLES: AlertToggleSettings = {
  enablePlanDelayAlert: true,
  enableCapacityAlert: true,
  enableCostVarianceAlert: true,
};

export const DEFAULT_EXPORT_IMPORT_PAGE_CONTROL: ExportImportPageControl = {
  exportEnabled: true,
  importEnabled: true,
  exportVariant: 'secondary',
  importVariant: 'outline',
};

export const DEFAULT_EXPORT_IMPORT_SETTINGS: ExportImportSettings = {
  pages: {},
};

export const DEFAULT_ATTENDANCE_INTEGRATION: AttendanceIntegrationSettings = {
  watchFolderPath: '',
  watchFolderEnabled: false,
  importFilePattern: '*.xlsx,*.xls,*.csv',
  watchFactoryId: '',
  shiftStartTime: '08:00',
  workingMinutesPerDay: 480,
  lateGraceMinutes: 15,
  overtimeThresholdMinutes: 480,
};

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  dashboardWidgets: {
    dashboard: buildDefaultWidgets('dashboard'),
    adminDashboard: buildDefaultWidgets('adminDashboard'),
    factoryDashboard: buildDefaultWidgets('factoryDashboard'),
  },
  customDashboardWidgets: [],
  alertSettings: DEFAULT_ALERT_SETTINGS,
  kpiThresholds: DEFAULT_KPI_THRESHOLDS,
  printTemplate: DEFAULT_PRINT_TEMPLATE,
  planSettings: DEFAULT_PLAN_SETTINGS,
  costMonthlyWorkingDays: {},
  branding: DEFAULT_BRANDING,
  theme: DEFAULT_THEME,
  dashboardDisplay: DEFAULT_DASHBOARD_DISPLAY,
  alertToggles: DEFAULT_ALERT_TOGGLES,
  quickActions: [],
  exportImport: DEFAULT_EXPORT_IMPORT_SETTINGS,
  attendanceIntegration: DEFAULT_ATTENDANCE_INTEGRATION,
  repairSettings: {
    access: { managerScope: 'branch' },
    workflow: {
      statuses: [
        { id: 'received', label: 'وارد', color: '#64748b', order: 1, isTerminal: false, isEnabled: true },
        { id: 'inspection', label: 'فحص', color: '#f59e0b', order: 2, isTerminal: false, isEnabled: true },
        { id: 'repair', label: 'إصلاح', color: '#0ea5e9', order: 3, isTerminal: false, isEnabled: true },
        { id: 'ready', label: 'جاهز للتسليم', color: '#22c55e', order: 4, isTerminal: false, isEnabled: true },
        { id: 'delivered', label: 'تم التسليم', color: '#16a34a', order: 5, isTerminal: true, isEnabled: true },
        { id: 'unrepairable', label: 'غير قابل للإصلاح', color: '#ef4444', order: 6, isTerminal: true, isEnabled: true },
      ],
      initialStatusId: 'received',
      openStatusIds: ['received', 'inspection', 'repair', 'ready'],
    },
    defaults: {
      defaultWarranty: 'none',
      defaultMinStock: 1,
      defaultSlaHours: 24,
    },
    treasury: {
      autoClose: {
        enabled: true,
        mode: 'scheduled_midnight',
        timezone: 'Africa/Cairo',
        blockOperationsIfPrevDayOpen: true,
      },
    },
  },
};

// ─── Selectors / Helpers ─────────────────────────────────────────────────────

export function getCustomWidgets(
  settings: SystemSettings | null,
  dashboardKey: string,
): CustomWidgetConfig[] {
  return (settings?.customDashboardWidgets ?? [])
    .filter((widget) => widget.dashboardKey === dashboardKey)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

export function getWidgetOrder(
  settings: SystemSettings | null,
  dashboardKey: string,
): WidgetConfig[] {
  const baseDefaults = buildDefaultWidgets(dashboardKey);
  const savedOrder = settings?.dashboardWidgets?.[dashboardKey] ?? [];
  const customWidgets = getCustomWidgets(settings, dashboardKey);
  const customDefaults = customWidgets.map((widget) => ({
    id: widget.id,
    visible: widget.visible !== false,
  }));

  if (savedOrder.length === 0) {
    return [...baseDefaults, ...customDefaults];
  }

  const knownIds = new Set(savedOrder.map((widget) => widget.id));
  const migrationIds = new Set(DASHBOARD_BUILTIN_WIDGET_MIGRATIONS[dashboardKey] ?? []);
  const missingMigrated = baseDefaults.filter(
    (widget) => !knownIds.has(widget.id) && migrationIds.has(widget.id),
  );
  const missingCustom = customDefaults.filter((widget) => !knownIds.has(widget.id));

  return [...savedOrder, ...missingMigrated, ...missingCustom];
}

export function isWidgetVisible(
  settings: SystemSettings | null,
  dashboardKey: string,
  widgetId: string,
): boolean {
  const widgets = getWidgetOrder(settings, dashboardKey);
  const found = widgets.find((w) => w.id === widgetId);
  if (!found) return false;
  return found.visible;
}

export function getAlertSettings(settings: SystemSettings | null): AlertSettings {
  if (settings?.alertSettings) {
    return { ...DEFAULT_ALERT_SETTINGS, ...settings.alertSettings };
  }
  return DEFAULT_ALERT_SETTINGS;
}

export function getKPIThreshold(
  settings: SystemSettings | null,
  kpiKey: string,
): KPIThreshold {
  return settings?.kpiThresholds?.[kpiKey] ?? DEFAULT_KPI_THRESHOLDS[kpiKey] ?? { good: 90, warning: 70 };
}

export function getKPIColor(
  value: number,
  threshold: KPIThreshold,
  inverted: boolean,
): 'good' | 'warning' | 'danger' {
  if (inverted) {
    if (value <= threshold.good) return 'good';
    if (value <= threshold.warning) return 'warning';
    return 'danger';
  }
  if (value >= threshold.good) return 'good';
  if (value >= threshold.warning) return 'warning';
  return 'danger';
}

export const KPI_COLOR_CLASSES = {
  good: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  danger: 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400',
};
