import type {
  SystemSettings, AlertSettings, KPIThreshold, WidgetConfig, PrintTemplateSettings,
  PlanSettings, BrandingSettings, ThemeSettings, DashboardDisplaySettings, AlertToggleSettings,
  QuickActionColor, QuickActionType,
} from '../types';

// ─── Widget Registry ─────────────────────────────────────────────────────────

export interface WidgetDefinition {
  id: string;
  label: string;
  icon: string;
}

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
    { id: 'top_lines', label: 'أعلى 5 خطوط إنتاج', icon: 'precision_manufacturing' },
    { id: 'top_products', label: 'أعلى 5 منتجات', icon: 'inventory_2' },
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
  { key: 'reports', label: 'التقارير', icon: 'bar_chart', color: 'primary', actionType: 'navigate', target: '/reports', permission: 'reports.view' },
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
  primaryColor: '#1392ec',
  paperSize: 'a4',
  orientation: 'portrait',
  copies: 1,
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
  maxWasteThreshold: 5,
  efficiencyCalculationMode: 'standard',
  averageProductionMode: 'daily',
};

export const DEFAULT_BRANDING: BrandingSettings = {
  factoryName: 'مؤسسة المغربي',
  logoUrl: '',
  currency: 'SAR',
  timezone: 'Asia/Riyadh',
};

export const DEFAULT_THEME: ThemeSettings = {
  primaryColor: '#24308f',
  secondaryColor: '#64748b',
  successColor: '#10b981',
  warningColor: '#f59e0b',
  dangerColor: '#ef4444',
  backgroundColor: '#f6f7f8',
  darkMode: 'light',
  baseFontFamily: 'Cairo',
  baseFontSize: 14,
  borderRadius: 12,
  density: 'comfortable',
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

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  dashboardWidgets: {
    dashboard: buildDefaultWidgets('dashboard'),
    adminDashboard: buildDefaultWidgets('adminDashboard'),
    factoryDashboard: buildDefaultWidgets('factoryDashboard'),
  },
  alertSettings: DEFAULT_ALERT_SETTINGS,
  kpiThresholds: DEFAULT_KPI_THRESHOLDS,
  printTemplate: DEFAULT_PRINT_TEMPLATE,
  planSettings: DEFAULT_PLAN_SETTINGS,
  branding: DEFAULT_BRANDING,
  theme: DEFAULT_THEME,
  dashboardDisplay: DEFAULT_DASHBOARD_DISPLAY,
  alertToggles: DEFAULT_ALERT_TOGGLES,
  quickActions: [],
};

// ─── Selectors / Helpers ─────────────────────────────────────────────────────

export function getWidgetOrder(
  settings: SystemSettings | null,
  dashboardKey: string,
): WidgetConfig[] {
  const widgets = settings?.dashboardWidgets?.[dashboardKey];
  if (widgets && widgets.length > 0) return widgets;
  return buildDefaultWidgets(dashboardKey);
}

export function isWidgetVisible(
  settings: SystemSettings | null,
  dashboardKey: string,
  widgetId: string,
): boolean {
  const widgets = getWidgetOrder(settings, dashboardKey);
  const found = widgets.find((w) => w.id === widgetId);
  return found ? found.visible : true;
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
