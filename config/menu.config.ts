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
  activePatterns?: string[];
  badgeSource?: () => Promise<number>;
}

export interface MenuGroup {
  key: string;
  label: string;
  icon: string;
  children: MenuItem[];
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
    children: [
      { key: 'home', label: 'الرئيسية', icon: 'dashboard', path: '/', permission: 'dashboard.view' },
      { key: 'emp-dash', label: 'لوحة الموظف', icon: 'assignment_ind', path: '/employee-dashboard', permission: 'employeeDashboard.view' },
      { key: 'factory-dash', label: 'لوحة مدير المصنع', icon: 'analytics', path: '/factory-dashboard', permission: 'factoryDashboard.view' },
      { key: 'admin-dash', label: 'لوحة مدير النظام', icon: 'shield', path: '/admin-dashboard', permission: 'adminDashboard.view' },
    ],
  },
  {
    key: 'production',
    label: 'الإنتاج',
    icon: 'precision_manufacturing',
    children: [
      { key: 'quick', label: 'إدخال سريع', icon: 'bolt', path: '/quick-action', permission: 'quickAction.view' },
      { key: 'reports', label: 'التقارير', icon: 'bar_chart', path: '/reports', permission: 'reports.view' },
      { key: 'lines', label: 'خطوط الإنتاج', icon: 'precision_manufacturing', path: '/lines', permission: 'lines.view', activePatterns: ['/lines/'] },
      { key: 'products', label: 'المنتجات', icon: 'inventory_2', path: '/products', permission: 'products.view', activePatterns: ['/products/'] },
      { key: 'plans', label: 'خطط الإنتاج', icon: 'event_note', path: '/production-plans', permission: 'plans.view' },
      { key: 'work-orders', label: 'أوامر الشغل', icon: 'assignment', path: '/work-orders', permission: 'workOrders.view' },
      { key: 'supervisors', label: 'المشرفين', icon: 'engineering', path: '/supervisors', permission: 'employees.view', activePatterns: ['/supervisors/'] },
      { key: 'production-workers', label: 'عمال الإنتاج', icon: 'construction', path: '/production-workers', permission: 'employees.view', activePatterns: ['/production-workers/'] },
      { key: 'line-workers', label: 'ربط العمالة بالخطوط', icon: 'group_work', path: '/line-workers', permission: 'lineWorkers.view' },
    ],
  },
  {
    key: 'inventory',
    label: 'المخازن',
    icon: 'warehouse',
    children: [
      { key: 'inv-dashboard', label: 'لوحة المخزون', icon: 'inventory', path: '/inventory', permission: 'inventory.view' },
      { key: 'inv-balances', label: 'الأرصدة', icon: 'inventory_2', path: '/inventory/balances', permission: 'inventory.view' },
      { key: 'inv-transactions', label: 'الحركات', icon: 'sync_alt', path: '/inventory/transactions', permission: 'inventory.view' },
      { key: 'inv-transfer-approvals', label: 'اعتماد التحويلات', icon: 'verified_user', path: '/inventory/transfer-approvals', permission: 'inventory.view' },
      { key: 'inv-movements', label: 'إدخال حركة', icon: 'add_circle', path: '/inventory/movements', permission: 'inventory.transactions.create' },
      { key: 'inv-create-warehouse', label: 'إضافة مخزن جديد', icon: 'warehouse', path: '/inventory/movements?action=create-warehouse', permission: 'inventory.warehouses.manage' },
      { key: 'inv-create-raw-material', label: 'إضافة مادة خام', icon: 'inventory_2', path: '/inventory/movements?action=create-raw-material', permission: 'inventory.items.manage' },
      { key: 'inv-counts', label: 'الجرد', icon: 'fact_check', path: '/inventory/counts', permission: 'inventory.counts.manage' },
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
      { key: 'attendance', label: 'سجل الحضور', icon: 'fingerprint', path: '/attendance', permission: 'attendance.view' },
      { key: 'att-import', label: 'استيراد الحضور', icon: 'upload_file', path: '/attendance/import', permission: 'attendance.import' },
      { key: 'leaves', label: 'الإجازات', icon: 'beach_access', path: '/leave-requests', permission: 'leave.view' },
      { key: 'loans', label: 'السُلف', icon: 'payments', path: '/loan-requests', permission: 'loan.view' },
      { key: 'approvals', label: 'مركز الموافقات', icon: 'fact_check', path: '/approval-center', permission: 'approval.view', badgeSource: badgeSources.pendingApprovals },
      { key: 'delegations', label: 'التفويضات', icon: 'swap_horiz', path: '/delegations', permission: 'approval.delegate' },
      { key: 'vehicles', label: 'المركبات', icon: 'directions_bus', path: '/vehicles', permission: 'vehicles.view' },
      { key: 'payroll', label: 'كشف الرواتب', icon: 'receipt_long', path: '/payroll', permission: 'payroll.view', badgeSource: badgeSources.draftPayroll },
      { key: 'hr-settings', label: 'إعدادات HR', icon: 'tune', path: '/hr-settings', permission: 'hrSettings.view' },
    ],
  },
  {
    key: 'costs',
    label: 'التكاليف',
    icon: 'account_balance',
    children: [
      { key: 'monthly-costs', label: 'تكلفة الإنتاج الشهرية', icon: 'price_check', path: '/monthly-costs', permission: 'costs.view' },
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
    key: 'system',
    label: 'النظام',
    icon: 'tune',
    children: [
      { key: 'roles', label: 'الأدوار والصلاحيات', icon: 'admin_panel_settings', path: '/roles', permission: 'roles.manage' },
      { key: 'activity', label: 'سجل النشاط', icon: 'history', path: '/activity-log', permission: 'activityLog.view' },
      { key: 'settings', label: 'الإعدادات', icon: 'settings', path: '/settings', permission: 'settings.view' },
    ],
  },
];

export const ALL_MENU_ITEMS: MenuItem[] = MENU_CONFIG.flatMap((g) => g.children);

