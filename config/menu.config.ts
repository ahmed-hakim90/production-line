/**
 * Sidebar Menu Configuration
 * Single source of truth for navigation structure and badge sources.
 */
import type { Permission } from '../utils/permissions';

export interface MenuItem {
  key: string;
  label: string;
  icon: string;
  path: string;
  permission: Permission;
  /** If set, the item is visible when the user has any of these permissions (OR). */
  anyOfPermissions?: Permission[];
  activePatterns?: string[];
  /**
   * When `activePatterns` or the default `path/` prefix matches, skip if the logical path
   * starts with one of these (e.g. exclude `/production/routing/analytics` from the list item).
   */
  activePathExcludePrefixes?: string[];
  badgeSource?: () => Promise<number>;
}

export interface MenuGroup {
  key: string;
  label: string;
  icon: string;
  children: MenuItem[];
  /** When true, children render as top-level links (no group header / accordion). */
  flat?: boolean;
}

/** Visible if `can` is true for any listed permission; otherwise uses `item.permission`. */
export function canAccessMenuItem(
  can: (permission: Permission) => boolean,
  item: MenuItem,
): boolean {
  if (item.anyOfPermissions?.length) {
    return item.anyOfPermissions.some((p) => can(p));
  }
  return can(item.permission);
}

// ─── Badge Sources ──────────────────────────────────────────────────────────

const badgeSources = {
  pendingApprovals: async (): Promise<number> => {
    const { approvalRequestsRef } = await import('../modules/hr/collections');
    const { getDocs, query, where } = await import('firebase/firestore');
    const q = query(approvalRequestsRef(), where('status', 'in', ['pending', 'in_progress', 'escalated']));
    return (await getDocs(q)).size;
  },
  draftPayroll: async (): Promise<number> => {
    const { payrollMonthsRef } = await import('../modules/hr/payroll/collections');
    const { getDocs, query, where } = await import('firebase/firestore');
    const q = query(payrollMonthsRef(), where('status', '==', 'draft'));
    return (await getDocs(q)).size;
  },
};

// ─── Menu Groups ────────────────────────────────────────────────────────────

export const MENU_CONFIG: MenuGroup[] = [
  {
    key: 'dashboards',
    label: 'لوحات التحكم',
    icon: 'space_dashboard',
    flat: true,
    children: [
      {
        key: 'home',
        label: 'الرئيسية',
        icon: 'dashboard',
        path: '/',
        permission: 'dashboard.view',
        anyOfPermissions: [
          'dashboard.view',
          'employeeDashboard.view',
          'factoryDashboard.view',
          'adminDashboard.view',
        ],
      },
    ],
  },
  {
    key: 'catalog',
    label: 'الكتالوج',
    icon: 'category',
    children: [
      { key: 'catalog-products', label: 'المنتجات', icon: 'inventory_2', path: '/products', permission: 'products.view', activePatterns: ['/products/'] },
      { key: 'catalog-products-add', label: 'إضافة منتج', icon: 'add_circle', path: '/products?action=create', permission: 'products.create', activePatterns: ['/products'] },
      { key: 'catalog-raw-materials', label: 'المواد الخام', icon: 'science', path: '/products/raw-materials', permission: 'products.rawMaterials.view' },
      { key: 'catalog-raw-materials-add', label: 'إضافة مادة خام', icon: 'add_circle', path: '/products/raw-materials?action=create', permission: 'inventory.items.manage' },
      { key: 'catalog-categories', label: 'الفئات', icon: 'category', path: '/catalog/categories', permission: 'catalog.categories.view' },
      { key: 'catalog-categories-add', label: 'إضافة فئة', icon: 'add_circle', path: '/catalog/categories?action=create', permission: 'catalog.categories.create' },
    ],
  },
  {
    key: 'production',
    label: 'الإنتاج',
    icon: 'precision_manufacturing',
    children: [
      { key: 'quick', label: 'إدخال سريع', icon: 'bolt', path: '/quick-action', permission: 'quickAction.view' },
      { key: 'reports', label: 'التقارير', icon: 'bar_chart', path: '/reports', permission: 'reports.view' },
      { key: 'supply-cycles', label: 'دورات التوريد', icon: 'inventory', path: '/supply-cycles', permission: 'supplyCycles.view', activePatterns: ['/supply-cycles/'] },
      { key: 'lines', label: 'خطوط الإنتاج', icon: 'precision_manufacturing', path: '/lines', permission: 'lines.view', activePatterns: ['/lines/'] },
      { key: 'plans', label: 'خطط الإنتاج', icon: 'event_note', path: '/production-plans', permission: 'plans.view' },
      {
        key: 'routing-list',
        label: 'مسارات الإنتاج',
        icon: 'alt_route',
        path: '/production/routing',
        permission: 'routing.view',
        activePathExcludePrefixes: ['/production/routing/analytics', '/production/routing/execution'],
      },
      { key: 'routing-analytics', label: 'تحليلات المسارات', icon: 'analytics', path: '/production/routing/analytics', permission: 'routing.analytics' },

      { key: 'work-orders', label: 'أوامر الشغل', icon: 'assignment', path: '/work-orders', permission: 'workOrders.view' },
      { key: 'supervisors', label: 'المشرفين', icon: 'engineering', path: '/supervisors', permission: 'supervisors.view', activePatterns: ['/supervisors/'] },
      { key: 'supervisor-line-assignments', label: 'توزيع المشرفين', icon: 'supervisor_account', path: '/supervisor-line-assignments', permission: 'supervisorAssignments.manage' },
      { key: 'production-workers', label: 'عمال الإنتاج', icon: 'construction', path: '/production-workers', permission: 'productionWorkers.view', activePatterns: ['/production-workers/'] },
      { key: 'line-workers', label: 'ربط العمالة بالخطوط', icon: 'group_work', path: '/line-workers', permission: 'lineWorkers.view' },
    ],
  },
  {
    key: 'inventory',
    label: 'المخازن',
    icon: 'warehouse',
    children: [
      { key: 'inv-dashboard', label: 'لوحة المخزون', icon: 'inventory', path: '/inventory', permission: 'inventory.view' },
      { key: 'inv-warehouses', label: 'إدارة المخازن', icon: 'warehouse', path: '/inventory/warehouses', permission: 'inventory.view' },
      { key: 'inv-balances', label: 'الأرصدة', icon: 'inventory_2', path: '/inventory/balances', permission: 'inventory.view' },
      { key: 'inv-transactions', label: 'الحركات', icon: 'sync_alt', path: '/inventory/transactions', permission: 'inventory.view' },
      { key: 'inv-transfer-approvals', label: 'اعتماد التحويلات', icon: 'verified_user', path: '/inventory/transfer-approvals', permission: 'inventory.view' },
      { key: 'inv-quick-transfer', label: 'تحويل سريع', icon: 'bolt', path: '/quick-inventory-transfer', permission: 'inventory.transactions.create' },
      { key: 'inv-movements', label: 'إدخال حركة', icon: 'add_circle', path: '/inventory/movements', permission: 'inventory.transactions.create' },
      { key: 'inv-create-warehouse', label: 'إضافة مخزن جديد', icon: 'warehouse', path: '/inventory/movements?action=create-warehouse', permission: 'inventory.warehouses.manage' },
      { key: 'inv-create-raw-material', label: 'إضافة مادة خام', icon: 'inventory_2', path: '/inventory/movements?action=create-raw-material', permission: 'inventory.items.manage' },
      { key: 'inv-counts', label: 'الجرد', icon: 'fact_check', path: '/inventory/counts', permission: 'inventory.counts.manage' },
    ],
  },
  {
    key: 'online',
    label: 'الأونلاين',
    icon: 'local_shipping',
    children: [
      {
        key: 'online-dash',
        label: 'لوحة الأونلاين',
        icon: 'dashboard',
        path: '/online',
        permission: 'onlineDispatch.view',
        anyOfPermissions: ['onlineDispatch.view', 'onlineDispatch.manage'],
        activePatterns: ['/online', '/online/dashboard'],
        activePathExcludePrefixes: ['/online/scan'],
      },
      {
        key: 'online-scan-w',
        label: 'مسح — للمخزن',
        icon: 'qr_code_scanner',
        path: '/online/scan/warehouse',
        permission: 'onlineDispatch.handoffToWarehouse',
        anyOfPermissions: ['onlineDispatch.handoffToWarehouse', 'onlineDispatch.manage'],
      },
      {
        key: 'online-scan-p',
        label: 'مسح — للبوسطة',
        icon: 'qr_code_scanner',
        path: '/online/scan/post',
        permission: 'onlineDispatch.handoffToPost',
        anyOfPermissions: ['onlineDispatch.handoffToPost', 'onlineDispatch.manage'],
      },
    ],
  },
  {
    key: 'customers',
    label: 'العملاء والإيداعات',
    icon: 'account_balance',
    children: [
      {
        key: 'customer-deposits',
        label: 'إيداعات البنك',
        icon: 'payments',
        path: '/customers/deposits',
        permission: 'customerDeposits.view',
        anyOfPermissions: [
          'customerDeposits.view',
          'customerDeposits.create',
          'customerDeposits.confirm',
          'customerDeposits.manage',
        ],
        activePatterns: ['/customers/deposits'],
        activePathExcludePrefixes: ['/customers/deposits/master'],
      },
      {
        key: 'customer-deposit-new',
        label: 'إيداع جديد',
        icon: 'add_circle',
        path: '/customers/deposits/new',
        permission: 'customerDeposits.create',
        anyOfPermissions: ['customerDeposits.create', 'customerDeposits.manage'],
      },
      {
        key: 'customer-deposit-master',
        label: 'إعداد العملاء والبنوك',
        icon: 'tune',
        path: '/customers/deposits/master',
        permission: 'customerDeposits.manage',
      },
    ],
  },
  {
    key: 'hr',
    label: 'فريق العمل',
    icon: 'badge',
    children: [
      { key: 'hr-dash', label: 'لوحة HR', icon: 'monitoring', path: '/hr-dashboard', permission: 'hrDashboard.view' },
      { key: 'employees', label: 'الموظفين', icon: 'groups', path: '/employees', permission: 'employees.view', activePatterns: ['/employees/'] },
      { key: 'emp-import', label: 'استيراد الموظفين', icon: 'upload', path: '/employees/import', permission: 'employees.create' },
      { key: 'org', label: 'الهيكل التنظيمي', icon: 'account_tree', path: '/organization', permission: 'hrSettings.view' },
      { key: 'self-svc', label: 'الخدمة الذاتية', icon: 'person', path: '/self-service', permission: 'selfService.view' },
      { key: 'leaves', label: 'الإجازات', icon: 'beach_access', path: '/leave-requests', permission: 'leave.view' },
      { key: 'loans', label: 'السُلف', icon: 'payments', path: '/loan-requests', permission: 'loan.view' },
      { key: 'approvals', label: 'مركز الموافقات', icon: 'fact_check', path: '/approval-center', permission: 'approval.view', badgeSource: badgeSources.pendingApprovals },
      { key: 'delegations', label: 'التفويضات', icon: 'swap_horiz', path: '/delegations', permission: 'approval.delegate' },
      { key: 'vehicles', label: 'المركبات', icon: 'directions_bus', path: '/vehicles', permission: 'vehicles.view' },
      { key: 'payroll', label: 'كشف الرواتب', icon: 'receipt_long', path: '/payroll', permission: 'payroll.view', badgeSource: badgeSources.draftPayroll },
      { key: 'payroll-accounts', label: 'صرف الرواتب', icon: 'payments', path: '/payroll/accounts', permission: 'payroll.accounts.view' },
      { key: 'payroll-overview', label: 'التحليل المالي للموظفين', icon: 'table_view', path: '/employee-financial-overview', permission: 'payroll.view' },
      { key: 'hr-evaluations', label: 'تقييم الموظفين', icon: 'stars', path: '/hr/evaluations', permission: 'hr.evaluation.view' },
      { key: 'hr-settings', label: 'إعدادات HR', icon: 'tune', path: '/hr-settings', permission: 'hrSettings.view' },
    ],
  },
  {
    key: 'attendance',
    label: 'الحضور',
    icon: 'fingerprint',
    children: [
      { key: 'att-logs', label: 'السجلات الخام', icon: 'event_note', path: '/attendance/logs', permission: 'attendance.view' },
      { key: 'att-daily', label: 'الحضور اليومي', icon: 'fact_check', path: '/attendance/daily', permission: 'attendance.view' },
      { key: 'att-sync', label: 'مزامنة الحضور', icon: 'sync', path: '/attendance/sync', permission: 'attendance.sync' },
    ],
  },
  {
    key: 'costs',
    label: 'التكاليف',
    icon: 'account_balance',
    children: [
      { key: 'monthly-costs', label: 'تكلفة الإنتاج الشهرية', icon: 'price_check', path: '/monthly-costs', permission: 'costs.view' },
      { key: 'cost-health', label: 'صحة بيانات التكاليف', icon: 'verified_user', path: '/costs/health', permission: 'costs.view' },
      { key: 'cost-assets', label: 'الأصول', icon: 'precision_manufacturing', path: '/costs/assets', permission: 'assets.view', activePatterns: ['/costs/assets/'] },
      { key: 'cost-assets-depreciation', label: 'تقرير الإهلاك', icon: 'receipt_long', path: '/costs/depreciation-report', permission: 'assets.depreciation.view' },
      { key: 'cost-centers', label: 'مراكز التكلفة', icon: 'account_balance', path: '/cost-centers', permission: 'costs.view', activePatterns: ['/cost-centers/'] },
      { key: 'cost-settings', label: 'إعدادات التكلفة', icon: 'payments', path: '/cost-settings', permission: 'costs.manage' },
    ],
  },
  {
    key: 'quality',
    label: 'الجودة',
    icon: 'verified',
    children: [
      { key: 'quality-settings', label: 'إعدادات الجودة', icon: 'tune', path: '/quality/settings', permission: 'quality.settings.view' },
      { key: 'quality-workers', label: 'عمال الجودة', icon: 'groups', path: '/quality/workers', permission: 'quality.workers.view' },
      { key: 'quality-final', label: 'الفحص النهائي', icon: 'task_alt', path: '/quality/final-inspection', permission: 'quality.finalInspection.view' },
      { key: 'quality-ipqc', label: 'IPQC', icon: 'rule', path: '/quality/ipqc', permission: 'quality.ipqc.view' },
      { key: 'quality-rework', label: 'إعادة التشغيل', icon: 'build', path: '/quality/rework', permission: 'quality.rework.view' },
      { key: 'quality-capa', label: 'CAPA', icon: 'fact_check', path: '/quality/capa', permission: 'quality.capa.view' },
      { key: 'quality-reports', label: 'تقارير الجودة', icon: 'print', path: '/quality/reports', permission: 'quality.reports.view' },
    ],
  },
  {
    key: 'repair',
    label: 'الصيانة',
    icon: 'build_circle',
    children: [
      { key: 'repair-dashboard', label: 'لوحة الصيانة', icon: 'dashboard', path: '/repair', permission: 'repair.dashboard.view' },
      { key: 'repair-jobs', label: 'طلبات الصيانة', icon: 'construction', path: '/repair/jobs', permission: 'repair.view' },
      { key: 'repair-new', label: 'جهاز جديد', icon: 'add_circle', path: '/repair/jobs/new', permission: 'repair.jobs.create' },
      { key: 'repair-parts', label: 'قطع الغيار', icon: 'inventory_2', path: '/repair/parts', permission: 'repair.parts.view' },
      { key: 'repair-treasury', label: 'الخزينة', icon: 'account_balance_wallet', path: '/repair/treasury', permission: 'repair.treasury.view' },
      { key: 'repair-sales-invoice', label: 'فاتورة بيع', icon: 'receipt_long', path: '/repair/sales-invoice', permission: 'repair.salesInvoice.create' },
      { key: 'repair-branches', label: 'الفروع', icon: 'store', path: '/repair/branches', permission: 'repair.branches.manage' },
      { key: 'repair-kpis', label: 'أداء الفنيين', icon: 'leaderboard', path: '/repair/technician-kpis', permission: 'repair.technician.view' },
      { key: 'repair-admin-dashboard', label: 'لوحة الأدمن', icon: 'admin_panel_settings', path: '/repair/admin-dashboard', permission: 'repair.adminDashboard.view' },
      { key: 'repair-settings', label: 'إعدادات الصيانة', icon: 'settings', path: '/repair/settings', permission: 'repair.settings.manage' },
    ],
  },
  {
    key: 'system',
    label: 'النظام',
    icon: 'tune',
    children: [
      { key: 'users', label: 'المستخدمون', icon: 'manage_accounts', path: '/system/users', permission: 'users.manage' },
      { key: 'roles', label: 'الأدوار والصلاحيات', icon: 'admin_panel_settings', path: '/roles', permission: 'roles.manage' },
      { key: 'activity', label: 'سجل النشاط والعمليات', icon: 'monitoring', path: '/activity-log', permission: 'activityLog.view' },
      { key: 'settings', label: 'الإعدادات', icon: 'settings', path: '/settings', permission: 'settings.view' },
    ],
  },
];

export const ALL_MENU_ITEMS: MenuItem[] = MENU_CONFIG.flatMap((g) => g.children);

