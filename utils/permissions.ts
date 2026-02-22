/**
 * Centralised Permission System (Dynamic — backed by Firestore)
 *
 * Permissions are stored per-role in Firestore "roles" collection.
 * The active user's resolved permissions live in the Zustand store.
 *
 * Usage in components:
 *   const { can, canCreateReport, canManageUsers } = usePermission();
 *   {canCreateReport && <Button>Add</Button>}
 */
import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';

// ─── Permission Names (all known permission keys) ────────────────────────────

export type Permission =
  | 'dashboard.view'
  | 'products.view' | 'products.create' | 'products.edit' | 'products.delete'
  | 'lines.view' | 'lines.create' | 'lines.edit' | 'lines.delete'
  | 'employees.view' | 'employees.create' | 'employees.edit' | 'employees.delete'
  | 'supervisors.view'
  | 'productionWorkers.view'
  | 'reports.view' | 'reports.create' | 'reports.edit' | 'reports.delete' | 'reports.viewCost'
  | 'lineStatus.view' | 'lineStatus.edit'
  | 'lineProductConfig.view'
  | 'settings.view' | 'settings.edit'
  | 'roles.view' | 'roles.manage'
  | 'users.view' | 'users.create' | 'users.edit' | 'users.delete'
  | 'activityLog.view'
  | 'quickAction.view'
  | 'costs.view' | 'costs.manage'
  | 'plans.view' | 'plans.create' | 'plans.edit'
  | 'employeeDashboard.view'
  | 'selfService.view'
  | 'factoryDashboard.view'
  | 'adminDashboard.view'
  | 'attendance.view' | 'attendance.import' | 'attendance.edit'
  | 'leave.view' | 'leave.create' | 'leave.manage'
  | 'loan.view' | 'loan.create' | 'loan.manage' | 'loan.disburse'
  | 'approval.view' | 'approval.manage' | 'approval.delegate' | 'approval.escalate' | 'approval.override'
  | 'payroll.view' | 'payroll.generate' | 'payroll.finalize' | 'payroll.lock'
  | 'hrDashboard.view'
  | 'vehicles.view' | 'vehicles.manage'
  | 'hrSettings.view' | 'hrSettings.edit'
  | 'print' | 'export';

// ─── Permission Groups (for admin UI) ────────────────────────────────────────

export interface PermissionItem {
  key: Permission;
  label: string;
}

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: PermissionItem[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'dashboard',
    label: 'لوحة التحكم',
    permissions: [
      { key: 'dashboard.view', label: 'عرض لوحة التحكم' },
    ],
  },
  {
    key: 'products',
    label: 'المنتجات',
    permissions: [
      { key: 'products.view', label: 'عرض' },
      { key: 'products.create', label: 'إنشاء' },
      { key: 'products.edit', label: 'تعديل' },
      { key: 'products.delete', label: 'حذف' },
    ],
  },
  {
    key: 'lines',
    label: 'خطوط الإنتاج',
    permissions: [
      { key: 'lines.view', label: 'عرض' },
      { key: 'lines.create', label: 'إنشاء' },
      { key: 'lines.edit', label: 'تعديل' },
      { key: 'lines.delete', label: 'حذف' },
    ],
  },
  {
    key: 'employees',
    label: 'الموظفين',
    permissions: [
      { key: 'employees.view', label: 'عرض' },
      { key: 'employees.create', label: 'إنشاء' },
      { key: 'employees.edit', label: 'تعديل' },
      { key: 'employees.delete', label: 'حذف' },
    ],
  },
  {
    key: 'supervisors',
    label: 'المشرفين',
    permissions: [
      { key: 'supervisors.view', label: 'عرض المشرفين' },
    ],
  },
  {
    key: 'productionWorkers',
    label: 'عمال الإنتاج',
    permissions: [
      { key: 'productionWorkers.view', label: 'عرض عمال الإنتاج' },
    ],
  },
  {
    key: 'reports',
    label: 'التقارير',
    permissions: [
      { key: 'reports.view', label: 'عرض' },
      { key: 'reports.create', label: 'إنشاء' },
      { key: 'reports.edit', label: 'تعديل' },
      { key: 'reports.delete', label: 'حذف' },
      { key: 'reports.viewCost', label: 'عرض عمود التكلفة' },
    ],
  },
  {
    key: 'lineStatus',
    label: 'حالة الخطوط',
    permissions: [
      { key: 'lineStatus.view', label: 'عرض' },
      { key: 'lineStatus.edit', label: 'تعديل' },
    ],
  },
  {
    key: 'lineProductConfig',
    label: 'إعدادات المنتج-الخط',
    permissions: [
      { key: 'lineProductConfig.view', label: 'عرض' },
    ],
  },
  {
    key: 'settings',
    label: 'الإعدادات',
    permissions: [
      { key: 'settings.view', label: 'عرض' },
      { key: 'settings.edit', label: 'تعديل' },
    ],
  },
  {
    key: 'roles',
    label: 'إدارة الأدوار',
    permissions: [
      { key: 'roles.view', label: 'عرض الأدوار' },
      { key: 'roles.manage', label: 'إدارة الأدوار' },
    ],
  },
  {
    key: 'users',
    label: 'إدارة المستخدمين',
    permissions: [
      { key: 'users.view', label: 'عرض المستخدمين' },
      { key: 'users.create', label: 'إنشاء مستخدم' },
      { key: 'users.edit', label: 'تعديل مستخدم' },
      { key: 'users.delete', label: 'حذف مستخدم' },
    ],
  },
  {
    key: 'activityLog',
    label: 'سجل النشاط',
    permissions: [
      { key: 'activityLog.view', label: 'عرض سجل النشاط' },
    ],
  },
  {
    key: 'quickAction',
    label: 'إدخال سريع',
    permissions: [
      { key: 'quickAction.view', label: 'الإدخال السريع' },
    ],
  },
  {
    key: 'costs',
    label: 'إدارة التكاليف',
    permissions: [
      { key: 'costs.view', label: 'عرض التكاليف' },
      { key: 'costs.manage', label: 'إدارة التكاليف' },
    ],
  },
  {
    key: 'plans',
    label: 'خطط الإنتاج',
    permissions: [
      { key: 'plans.view', label: 'عرض الخطط' },
      { key: 'plans.create', label: 'إنشاء خطة' },
      { key: 'plans.edit', label: 'تعديل خطة' },
    ],
  },
  {
    key: 'attendance',
    label: 'الحضور والانصراف',
    permissions: [
      { key: 'attendance.view', label: 'عرض الحضور' },
      { key: 'attendance.import', label: 'استيراد بيانات' },
      { key: 'attendance.edit', label: 'تعديل الحضور' },
    ],
  },
  {
    key: 'leave',
    label: 'الإجازات',
    permissions: [
      { key: 'leave.view', label: 'عرض الإجازات' },
      { key: 'leave.create', label: 'طلب إجازة' },
      { key: 'leave.manage', label: 'إدارة الإجازات' },
    ],
  },
  {
    key: 'loan',
    label: 'السُلف والقروض',
    permissions: [
      { key: 'loan.view', label: 'عرض السُلف' },
      { key: 'loan.create', label: 'طلب سلفة' },
      { key: 'loan.manage', label: 'إدارة السُلف' },
      { key: 'loan.disburse', label: 'صرف السُلف (الحسابات)' },
    ],
  },
  {
    key: 'approval',
    label: 'الموافقات',
    permissions: [
      { key: 'approval.view', label: 'عرض الموافقات' },
      { key: 'approval.manage', label: 'إدارة الموافقات' },
      { key: 'approval.delegate', label: 'تفويض الموافقات' },
      { key: 'approval.escalate', label: 'تصعيد الموافقات' },
      { key: 'approval.override', label: 'تجاوز الموافقات (مدير النظام)' },
    ],
  },
  {
    key: 'payroll',
    label: 'الرواتب',
    permissions: [
      { key: 'payroll.view', label: 'عرض كشف الرواتب' },
      { key: 'payroll.generate', label: 'إنشاء / احتساب الرواتب' },
      { key: 'payroll.finalize', label: 'اعتماد كشف الرواتب' },
      { key: 'payroll.lock', label: 'قفل الشهر نهائياً' },
    ],
  },
  {
    key: 'hrDashboard',
    label: 'لوحة HR',
    permissions: [
      { key: 'hrDashboard.view', label: 'عرض لوحة الموارد البشرية' },
    ],
  },
  {
    key: 'vehicles',
    label: 'المركبات',
    permissions: [
      { key: 'vehicles.view', label: 'عرض المركبات' },
      { key: 'vehicles.manage', label: 'إدارة المركبات' },
    ],
  },
  {
    key: 'hrSettings',
    label: 'إعدادات الموارد البشرية',
    permissions: [
      { key: 'hrSettings.view', label: 'عرض إعدادات HR' },
      { key: 'hrSettings.edit', label: 'تعديل إعدادات HR' },
    ],
  },
  {
    key: 'employeeDashboard',
    label: 'لوحة الموظف',
    permissions: [
      { key: 'employeeDashboard.view', label: 'عرض لوحة الموظف' },
    ],
  },
  {
    key: 'selfService',
    label: 'الخدمة الذاتية',
    permissions: [
      { key: 'selfService.view', label: 'الخدمة الذاتية للموظف' },
    ],
  },
  {
    key: 'factoryDashboard',
    label: 'لوحة مدير المصنع',
    permissions: [
      { key: 'factoryDashboard.view', label: 'عرض لوحة مدير المصنع' },
    ],
  },
  {
    key: 'adminDashboard',
    label: 'لوحة مدير النظام',
    permissions: [
      { key: 'adminDashboard.view', label: 'عرض لوحة مدير النظام' },
    ],
  },
  {
    key: 'special',
    label: 'صلاحيات خاصة',
    permissions: [
      { key: 'print', label: 'طباعة' },
      { key: 'export', label: 'تصدير' },
    ],
  },
];

/** Flat list of every permission key */
export const ALL_PERMISSIONS: Permission[] =
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

// ─── Sidebar Items ───────────────────────────────────────────────────────────

export interface SidebarItem {
  path: string;
  icon: string;
  label: string;
  permission: Permission;
}

export interface SidebarGroup {
  key: string;
  label: string;
  items: SidebarItem[];
}

export const SIDEBAR_GROUPS: SidebarGroup[] = [
  {
    key: 'dashboards',
    label: 'لوحات التحكم',
    items: [
      { path: '/', icon: 'dashboard', label: 'الرئيسية', permission: 'dashboard.view' },
      { path: '/employee-dashboard', icon: 'assignment_ind', label: 'لوحة الموظف', permission: 'employeeDashboard.view' },
      { path: '/factory-dashboard', icon: 'analytics', label: 'لوحة مدير المصنع', permission: 'factoryDashboard.view' },
      { path: '/admin-dashboard', icon: 'shield', label: 'لوحة مدير النظام', permission: 'adminDashboard.view' },
    ],
  },
  {
    key: 'production',
    label: 'الإنتاج',
    items: [
      { path: '/lines', icon: 'precision_manufacturing', label: 'خطوط الإنتاج', permission: 'lines.view' },
      { path: '/products', icon: 'inventory_2', label: 'المنتجات', permission: 'products.view' },
      { path: '/production-plans', icon: 'event_note', label: 'خطط الإنتاج', permission: 'plans.view' },
      { path: '/supervisors', icon: 'engineering', label: 'المشرفين', permission: 'supervisors.view' },
      { path: '/production-workers', icon: 'construction', label: 'عمال الإنتاج', permission: 'productionWorkers.view' },
      { path: '/reports', icon: 'bar_chart', label: 'التقارير', permission: 'reports.view' },
      { path: '/quick-action', icon: 'bolt', label: 'إدخال سريع', permission: 'quickAction.view' },
    ],
  },
  {
    key: 'hr',
    label: 'فريق العمل',
    items: [
      { path: '/hr-dashboard', icon: 'monitoring', label: 'لوحة HR', permission: 'hrDashboard.view' },
      { path: '/employees', icon: 'groups', label: 'الموظفين', permission: 'employees.view' },
      { path: '/employees/import', icon: 'upload', label: 'استيراد الموظفين', permission: 'employees.create' },
      { path: '/organization', icon: 'account_tree', label: 'الهيكل التنظيمي', permission: 'hrSettings.view' },
      { path: '/self-service', icon: 'person', label: 'الخدمة الذاتية', permission: 'selfService.view' },
      { path: '/attendance', icon: 'fingerprint', label: 'سجل الحضور', permission: 'attendance.view' },
      { path: '/attendance/import', icon: 'upload_file', label: 'استيراد الحضور', permission: 'attendance.import' },
      { path: '/leave-requests', icon: 'beach_access', label: 'الإجازات', permission: 'leave.view' },
      { path: '/loan-requests', icon: 'payments', label: 'السُلف', permission: 'loan.view' },
      { path: '/approval-center', icon: 'fact_check', label: 'مركز الموافقات', permission: 'approval.view' },
      { path: '/delegations', icon: 'swap_horiz', label: 'التفويضات', permission: 'approval.delegate' },
      { path: '/employee-financials', icon: 'account_balance_wallet', label: 'بدلات واستقطاعات', permission: 'hrSettings.view' },
      { path: '/hr-transactions', icon: 'swap_vert', label: 'سجل الحركات', permission: 'hrDashboard.view' },
      { path: '/vehicles', icon: 'directions_bus', label: 'المركبات', permission: 'vehicles.view' },
      { path: '/payroll', icon: 'receipt_long', label: 'كشف الرواتب', permission: 'payroll.view' },
      { path: '/hr-settings', icon: 'tune', label: 'إعدادات HR', permission: 'hrSettings.view' },
    ],
  },
  {
    key: 'costs',
    label: 'التكاليف',
    items: [
      { path: '/cost-centers', icon: 'account_balance', label: 'مراكز التكلفة', permission: 'costs.view' },
      { path: '/cost-settings', icon: 'payments', label: 'إعدادات التكلفة', permission: 'costs.manage' },
    ],
  },
  {
    key: 'system',
    label: 'النظام',
    items: [
      { path: '/roles', icon: 'admin_panel_settings', label: 'الأدوار والصلاحيات', permission: 'roles.manage' },
      { path: '/activity-log', icon: 'history', label: 'سجل النشاط', permission: 'activityLog.view' },
      { path: '/settings', icon: 'settings', label: 'الإعدادات', permission: 'settings.view' },
    ],
  },
];

/** Flat list for backward compatibility (route matching, etc.) */
export const SIDEBAR_ITEMS: SidebarItem[] = SIDEBAR_GROUPS.flatMap((g) => g.items);

// ─── Route → Permission Mapping ──────────────────────────────────────────────

export const ROUTE_PERMISSIONS: Record<string, Permission> = {
  '/': 'dashboard.view',
  '/employee-dashboard': 'employeeDashboard.view',
  '/products': 'products.view',
  '/products/:id': 'products.view',
  '/lines': 'lines.view',
  '/lines/:id': 'lines.view',
  '/employees': 'employees.view',
  '/employees/import': 'employees.create',
  '/employees/:id': 'employees.view',
  '/supervisors': 'supervisors.view',
  '/supervisors/:id': 'supervisors.view',
  '/production-workers': 'productionWorkers.view',
  '/production-workers/:id': 'productionWorkers.view',
  '/self-service': 'selfService.view',
  '/reports': 'reports.view',
  '/quick-action': 'quickAction.view',
  '/users': 'users.view',
  '/activity-log': 'activityLog.view',
  '/production-plans': 'plans.view',
  '/factory-dashboard': 'factoryDashboard.view',
  '/admin-dashboard': 'adminDashboard.view',
  '/cost-centers': 'costs.view',
  '/cost-centers/:id': 'costs.view',
  '/cost-settings': 'costs.manage',
  '/roles': 'roles.manage',
  '/settings': 'settings.view',
  '/attendance': 'attendance.view',
  '/attendance/import': 'attendance.import',
  '/leave-requests': 'leave.view',
  '/loan-requests': 'loan.view',
  '/approval-center': 'approval.view',
  '/delegations': 'approval.delegate',
  '/payroll': 'payroll.view',
  '/hr-dashboard': 'hrDashboard.view',
  '/hr-transactions': 'hrDashboard.view',
  '/employee-financials': 'hrSettings.view',
  '/vehicles': 'vehicles.view',
  '/organization': 'hrSettings.view',
  '/hr-settings': 'hrSettings.view',
};

// ─── Role-based Home Route ───────────────────────────────────────────────────

const HOME_ROUTES: { permission: Permission; path: string }[] = [
  { permission: 'adminDashboard.view', path: '/admin-dashboard' },
  { permission: 'factoryDashboard.view', path: '/factory-dashboard' },
  { permission: 'employeeDashboard.view', path: '/employee-dashboard' },
  { permission: 'dashboard.view', path: '/' },
];

/** Returns the appropriate home route based on the user's permissions (highest role first) */
export function getHomeRoute(permissions: Record<string, boolean>): string {
  for (const entry of HOME_ROUTES) {
    if (permissions[entry.permission] === true) return entry.path;
  }
  return '/';
}

// ─── Pure Helpers ────────────────────────────────────────────────────────────

/** Check a single permission against a permissions map */
export function checkPermission(
  permissions: Record<string, boolean>,
  permission: Permission,
): boolean {
  return permissions[permission] === true;
}

/** Derive read-only status from a permissions map */
export function deriveIsReadOnly(permissions: Record<string, boolean>): boolean {
  return !Object.entries(permissions).some(
    ([key, val]) =>
      val && !key.endsWith('.view') && key !== 'print' && key !== 'export',
  );
}

// ─── Permission Guard Interface ──────────────────────────────────────────────

export interface PermissionGuards {
  can: (permission: Permission) => boolean;
  canCreateReport: boolean;
  canEditReport: boolean;
  canDeleteReport: boolean;
  canManageUsers: boolean;
  canViewActivityLog: boolean;
  canUseQuickAction: boolean;
}

// ─── React Hooks ─────────────────────────────────────────────────────────────

/** Primary hook — returns `can()` checker plus named guards */
export function usePermission(): PermissionGuards {
  const permissions = useAppStore((s) => s.userPermissions);
  return useMemo(() => {
    const can = (permission: Permission) => permissions[permission] === true;
    return {
      can,
      canCreateReport: can('reports.create'),
      canEditReport: can('reports.edit'),
      canDeleteReport: can('reports.delete'),
      canManageUsers: can('users.create') || can('users.edit'),
      canViewActivityLog: can('activityLog.view'),
      canUseQuickAction: can('quickAction.view'),
    };
  }, [permissions]);
}

/** Display hook — returns current role info for UI chrome */
export function useCurrentRole() {
  const roleName = useAppStore((s) => s.userRoleName);
  const roleColor = useAppStore((s) => s.userRoleColor);
  const permissions = useAppStore((s) => s.userPermissions);
  return useMemo(() => ({
    roleName,
    roleColor,
    isReadOnly: deriveIsReadOnly(permissions),
  }), [roleName, roleColor, permissions]);
}
