/**
 * Sidebar Menu Configuration
 * Single source of truth for navigation structure and badge sources.
 */
import type { Permission } from '../utils/permissions';
import type { FirestoreRoleKey } from '../types';

export interface MenuItem {
  key: string;
  label: string;
  icon: string;
  path: string;
  permission: Permission;
  /** If set, the item is visible when the user has any of these permissions (OR). */
  anyOfPermissions?: Permission[];
  /** Visible only when the logged-in employee is a supervisor self-service user. */
  selfSupervisorOnly?: boolean;
  /** Hide from these built-in role keys (role-focused navigation). */
  excludeRoleKeys?: FirestoreRoleKey[];
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
  roleKey?: FirestoreRoleKey | string | null,
): boolean {
  if (roleKey && item.excludeRoleKeys?.length && item.excludeRoleKeys.includes(roleKey as FirestoreRoleKey)) {
    return false;
  }
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
  rawMaterialWarehouseAlerts: async (): Promise<number> => {
    const { countRawMaterialWarehouseAlerts } = await import(
      '../modules/inventory/services/rawMaterialWarehouseAlertsService'
    );
    return countRawMaterialWarehouseAlerts();
  },
  pendingProductionIssueRequests: async (): Promise<number> => {
    const { productionIssueService } = await import(
      '../modules/inventory/services/productionIssueService'
    );
    const rows = await productionIssueService.getAll();
    return rows.filter((row) => row.status === 'requested').length;
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
      { key: 'catalog-categories', label: 'الفئات', icon: 'category', path: '/catalog/categories', permission: 'catalog.categories.view' },
      { key: 'manufacturing-materials', label: 'المواد التصنيعية', icon: 'precision_manufacturing', path: '/manufacturing/materials', permission: 'materials.view' },
      { key: 'manufacturing-material-categories', label: 'فئات المواد', icon: 'category', path: '/manufacturing/material-categories', permission: 'materials.manage' },
    ],
  },
  {
    key: 'production',
    label: 'الإنتاج',
    icon: 'precision_manufacturing',
    children: [
      { key: 'quick', label: 'إدخال سريع', icon: 'bolt', path: '/quick-action', permission: 'quickAction.view' },
      {
        key: 'production-requests',
        label: 'طلبات الإنتاج',
        icon: 'assignment',
        path: '/production/requests',
        permission: 'employeeDashboard.view',
        anyOfPermissions: ['employeeDashboard.view', 'quickAction.view', 'production.workerReports.view', 'reports.create', 'approval.view', 'leave.manage', 'approval.manage', 'production.requests.observe'],
        activePatterns: ['/production/requests', '/team-requests'],
      },
      { key: 'work-orders', label: 'أوامر الشغل', icon: 'assignment', path: '/work-orders', permission: 'workOrders.view' },
      { key: 'plans', label: 'خطط الإنتاج', icon: 'event_note', path: '/production-plans', permission: 'plans.view' },
      {
        key: 'production-issue-requests',
        label: 'طلبات صرف الإنتاج',
        icon: 'fact_check',
        path: '/production/issue-requests',
        permission: 'productionIssue.request',
        anyOfPermissions: ['productionIssue.request', 'plans.view', 'workOrders.view'],
        activePatterns: ['/production/issue-requests'],
      },
      {
        key: 'packaging-control',
        label: 'تحكم التغليف',
        icon: 'package_2',
        path: '/production/packaging/control',
        permission: 'reports.view',
        anyOfPermissions: ['reports.view', 'reports.packaging.create', 'inventory.view'],
        excludeRoleKeys: ['materials_warehouse'],
        activePatterns: ['/production/packaging/', '/inventory/packaging/'],
      },
      { key: 'lines', label: 'خطوط الإنتاج', icon: 'precision_manufacturing', path: '/lines', permission: 'lines.view', activePatterns: ['/lines/'] },
      { key: 'supervisors', label: 'المشرفين', icon: 'engineering', path: '/supervisors', permission: 'supervisors.view', anyOfPermissions: ['supervisors.view', 'supervisorAssignments.manage'], activePatterns: ['/supervisors/', '/supervisor-line-assignments'] },
      {
        key: 'production-workers',
        label: 'عمال الإنتاج',
        icon: 'construction',
        path: '/production-workers',
        permission: 'production.workers.view',
        anyOfPermissions: ['productionWorkers.view', 'production.workers.view'],
        activePatterns: ['/production-workers/', '/production/workers/', '/production/worker-reports', '/production/worker-ratings'],
      },
      { key: 'line-workers', label: 'ربط العمالة الدائم', icon: 'group_work', path: '/line-workers', permission: 'lineWorkers.view' },
      {
        key: 'my-workers-evaluation',
        label: 'تقييم العمالة',
        icon: 'assignment_ind',
        path: '/my-workers/evaluation',
        permission: 'employeeDashboard.view',
        anyOfPermissions: ['employeeDashboard.view', 'quickAction.view'],
        selfSupervisorOnly: true,
      },
      {
        key: 'production-attendance',
        label: 'حضور الإنتاج',
        icon: 'fact_check',
        path: '/production/attendance',
        permission: 'production.attendance.view',
        anyOfPermissions: ['production.attendance.view', 'production.attendance.manage', 'reports.view'],
      },
      { key: 'reports', label: 'التقارير', icon: 'bar_chart', path: '/reports', permission: 'reports.view' },
      {
        key: 'routing-list',
        label: 'مسارات الإنتاج',
        icon: 'alt_route',
        path: '/production/routing',
        permission: 'routing.view',
        activePathExcludePrefixes: ['/production/routing/analytics', '/production/routing/execution'],
      },
      { key: 'routing-analytics', label: 'تحليلات المسارات', icon: 'analytics', path: '/production/routing/analytics', permission: 'routing.analytics' },
      { key: 'supply-cycles', label: 'دورات التوريد', icon: 'inventory', path: '/supply-cycles', permission: 'supplyCycles.view', activePatterns: ['/supply-cycles/'] },
      { key: 'material-planning-run', label: 'تخطيط احتياجات المواد', icon: 'checklist', path: '/manufacturing/planning-run', permission: 'planning.materialRequirements.view' },
      { key: 'purchase-gap', label: 'فجوة الشراء', icon: 'shopping_cart', path: '/manufacturing/purchase-gap', permission: 'manufacturing.purchaseGap.view' },
      { key: 'component-waste-reports', label: 'تقرير هالك المكونات', icon: 'report_problem', path: '/component-waste-reports', permission: 'reports.componentWaste.create' },
    ],
  },
  {
    key: 'inventory',
    label: 'المخازن',
    icon: 'warehouse',
    children: [
      // نظرة عامة
      { key: 'inv-dashboard', label: 'لوحة تحكم المخزون', icon: 'inventory', path: '/inventory', permission: 'inventory.view' },
      {
        key: 'inv-raw-control',
        label: 'تحكم مخزن المستلزمات',
        icon: 'inventory_2',
        path: '/inventory/raw-materials/control',
        permission: 'inventory.view',
      },
      {
        key: 'inv-raw-alerts',
        label: 'تنبيهات مخزن المستلزمات',
        icon: 'notifications_active',
        path: '/inventory/raw-materials/alerts',
        permission: 'inventory.view',
        badgeSource: badgeSources.rawMaterialWarehouseAlerts,
      },
      // إعداد المخازن
      { key: 'inv-warehouses', label: 'إدارة المخازن', icon: 'warehouse', path: '/inventory/warehouses', permission: 'inventory.view' },
      { key: 'inv-locations', label: 'لوكيشنات المخازن', icon: 'grid_view', path: '/inventory/locations', permission: 'inventory.view' },
      // استعلام
      { key: 'inv-balances', label: 'الأرصدة', icon: 'inventory_2', path: '/inventory/balances', permission: 'inventory.view' },
      { key: 'inv-transactions', label: 'الحركات', icon: 'sync_alt', path: '/inventory/transactions', permission: 'inventory.view' },
      // عمليات ومتابعة
      { key: 'inv-transfer-approvals', label: 'اعتماد التحويلات', icon: 'verified_user', path: '/inventory/transfer-approvals', permission: 'inventory.view' },
      { key: 'inv-counts', label: 'الجرد والمطابقة', icon: 'fact_check', path: '/inventory/counts', permission: 'inventory.counts.manage' },
      // مخزون الإنتاج
      { key: 'inv-production-issues', label: 'صرف إنتاج', icon: 'fact_check', path: '/inventory/production-issues', permission: 'inventory.view', badgeSource: badgeSources.pendingProductionIssueRequests },
      {
        key: 'inv-production-approvals',
        label: 'اعتمادات الإنتاج المخزنية',
        icon: 'approval',
        path: '/inventory/production-approvals',
        permission: 'inventory.view',
        excludeRoleKeys: ['materials_warehouse'],
      },
      { key: 'inv-production-component-records', label: 'سجلات مكونات الإنتاج', icon: 'receipt_long', path: '/inventory/production-component-records', permission: 'inventory.view' },
      {
        key: 'inv-production-consumption-analysis',
        label: 'تحليل استهلاك الإنتاج',
        icon: 'analytics',
        path: '/inventory/production-consumption-analysis',
        permission: 'inventory.view',
        excludeRoleKeys: ['materials_warehouse'],
      },
      { key: 'inv-disassembly', label: 'تفكيك عكسي', icon: 'sync_alt', path: '/inventory/disassembly', permission: 'inventory.disassembly.manage' },
      // تحليل ومتابعة
      { key: 'inv-analytics', label: 'تحليلات المخزون', icon: 'analytics', path: '/inventory/analytics', permission: 'inventory.analytics.view' },
      { key: 'inv-exceptions', label: 'استثناءات المخزون', icon: 'warning', path: '/inventory/exceptions', permission: 'inventory.exceptions.view' },
    ],
  },
  {
    key: 'hr',
    label: 'فريق العمل',
    icon: 'badge',
    children: [
      { key: 'hr-dash', label: 'لوحة HR', icon: 'monitoring', path: '/hr/dashboard', permission: 'hrDashboard.view' },
      { key: 'employees', label: 'الموظفين', icon: 'groups', path: '/hr/employees', permission: 'employees.view', activePatterns: ['/hr/employees/'] },
      { key: 'org', label: 'الهيكل التنظيمي', icon: 'account_tree', path: '/hr/organization', permission: 'hrSettings.view' },
      { key: 'self-svc', label: 'الخدمة الذاتية', icon: 'person', path: '/hr/self-service', permission: 'selfService.view' },
      { key: 'leaves', label: 'الإجازات', icon: 'beach_access', path: '/hr/leave-requests', permission: 'leave.view' },
      { key: 'loans', label: 'السُلف', icon: 'payments', path: '/hr/loan-requests', permission: 'loan.view' },
      { key: 'approvals', label: 'مركز الموافقات', icon: 'fact_check', path: '/hr/approval-center', permission: 'approval.view', badgeSource: badgeSources.pendingApprovals },
      { key: 'delegations', label: 'التفويضات', icon: 'swap_horiz', path: '/hr/delegations', permission: 'approval.delegate' },
      { key: 'att-daily', label: 'الحضور اليومي', icon: 'fact_check', path: '/hr/attendance/daily', permission: 'attendance.view' },
      { key: 'att-logs', label: 'السجلات الخام', icon: 'event_note', path: '/hr/attendance/logs', permission: 'attendance.view' },
      { key: 'att-sync', label: 'مزامنة الحضور', icon: 'sync', path: '/hr/attendance/sync', permission: 'attendance.sync' },
      { key: 'payroll', label: 'كشف الرواتب', icon: 'receipt_long', path: '/hr/payroll', permission: 'payroll.view', badgeSource: badgeSources.draftPayroll },
      { key: 'payroll-accounts', label: 'صرف الرواتب', icon: 'payments', path: '/hr/payroll/accounts', permission: 'payroll.accounts.view' },
      { key: 'payroll-overview', label: 'التحليل المالي للموظفين', icon: 'table_view', path: '/hr/employee-financial-overview', permission: 'payroll.view' },
      { key: 'hr-evaluations', label: 'تقييم الموظفين', icon: 'stars', path: '/hr/evaluations', permission: 'hr.evaluation.view' },
      { key: 'vehicles', label: 'المركبات', icon: 'directions_bus', path: '/hr/vehicles', permission: 'vehicles.view' },
      { key: 'hr-settings', label: 'إعدادات HR', icon: 'tune', path: '/hr/settings', permission: 'hrSettings.view' },
    ],
  },
  {
    key: 'costs',
    label: 'التكاليف',
    icon: 'account_balance',
    children: [
      { key: 'monthly-costs', label: 'تكلفة الإنتاج الشهرية', icon: 'price_check', path: '/monthly-costs', permission: 'costs.view' },
      { key: 'cost-centers', label: 'مراكز التكلفة', icon: 'account_balance', path: '/cost-centers', permission: 'costs.view', activePatterns: ['/cost-centers/'] },
      { key: 'cost-assets', label: 'الأصول', icon: 'precision_manufacturing', path: '/costs/assets', permission: 'assets.view', activePatterns: ['/costs/assets/'] },
      { key: 'cost-assets-depreciation', label: 'تقرير الإهلاك', icon: 'receipt_long', path: '/costs/depreciation-report', permission: 'assets.depreciation.view' },
      { key: 'cost-health', label: 'صحة بيانات التكاليف', icon: 'verified_user', path: '/costs/health', permission: 'costs.view' },
      { key: 'cost-settings', label: 'إعدادات التكلفة', icon: 'payments', path: '/cost-settings', permission: 'costs.manage' },
    ],
  },
  {
    key: 'quality',
    label: 'الجودة',
    icon: 'verified',
    children: [
      { key: 'quality-workers', label: 'عمال الجودة', icon: 'groups', path: '/quality/workers', permission: 'quality.workers.view' },
      { key: 'quality-final', label: 'الفحص النهائي', icon: 'task_alt', path: '/quality/final-inspection', permission: 'quality.finalInspection.view' },
      { key: 'quality-ipqc', label: 'IPQC', icon: 'rule', path: '/quality/ipqc', permission: 'quality.ipqc.view' },
      { key: 'quality-rework', label: 'إعادة التشغيل', icon: 'build', path: '/quality/rework', permission: 'quality.rework.view' },
      { key: 'quality-capa', label: 'CAPA', icon: 'fact_check', path: '/quality/capa', permission: 'quality.capa.view' },
      { key: 'quality-reports', label: 'تقارير الجودة', icon: 'print', path: '/quality/reports', permission: 'quality.reports.view' },
      { key: 'quality-settings', label: 'إعدادات الجودة', icon: 'tune', path: '/quality/settings', permission: 'quality.settings.view' },
    ],
  },
  {
    key: 'repair',
    label: 'الصيانة',
    icon: 'build_circle',
    children: [
      { key: 'repair-dashboard', label: 'لوحة الصيانة', icon: 'dashboard', path: '/repair', permission: 'repair.dashboard.view' },
      { key: 'repair-call-center', label: 'مركز الاتصال', icon: 'call', path: '/repair/call-center', permission: 'repair.view' },
      { key: 'repair-jobs', label: 'طلبات الصيانة', icon: 'construction', path: '/repair/jobs', permission: 'repair.view' },
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
      { key: 'settings', label: 'الإعدادات', icon: 'settings', path: '/settings', permission: 'settings.view', activePatterns: ['/settings/'] },
      { key: 'tenant-readiness', label: 'جاهزية المستأجر', icon: 'verified', path: '/system/readiness', permission: 'system.readiness.view' },
    ],
  },
];

export const ALL_MENU_ITEMS: MenuItem[] = MENU_CONFIG.flatMap((g) => g.children);
