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
  | 'products.view' | 'products.create' | 'products.edit' | 'products.delete' | 'products.createRawMaterial' | 'products.rawMaterials.view'
  | 'catalog.categories.view' | 'catalog.categories.create' | 'catalog.categories.edit' | 'catalog.categories.delete'
  | 'lines.view' | 'lines.create' | 'lines.edit' | 'lines.delete'
  | 'inventory.view' | 'inventory.transactions.create' | 'inventory.transactions.edit' | 'inventory.transactions.print' | 'inventory.transactions.export' | 'inventory.transactions.delete' | 'inventory.counts.manage' | 'inventory.warehouses.manage' | 'inventory.items.manage' | 'inventory.transfers.approve' | 'inventory.finishedStock.allowNegativeApprove'
  | 'employees.view' | 'employees.viewDetails' | 'employees.create' | 'employees.edit' | 'employees.delete'
  | 'supervisors.view'
  | 'productionWorkers.view'
  | 'lineWorkers.view'
  | 'supervisorAssignments.manage'
  | 'reports.view' | 'reports.create' | 'reports.edit' | 'reports.delete' | 'reports.viewCost' | 'reports.componentInjection.manage' | 'reports.componentInjection.only'
  | 'supplyCycles.view' | 'supplyCycles.manage' | 'supplyCycles.close' | 'supplyCycles.delete'
  | 'lineStatus.view' | 'lineStatus.edit'
  | 'lineProductConfig.view'
  | 'assets.view' | 'assets.create' | 'assets.edit' | 'assets.delete' | 'assets.depreciation.run' | 'assets.depreciation.view'
  | 'settings.view' | 'settings.edit'
  | 'users.manage'
  | 'roles.view' | 'roles.manage'
  | 'activityLog.view'
  | 'quickAction.view'
  | 'costs.view' | 'costs.manage' | 'costs.closePeriod'
  | 'plans.view' | 'plans.create' | 'plans.edit' | 'plans.componentInjection.manage'
  | 'routing.view' | 'routing.manage' | 'routing.execute' | 'routing.analytics'
  | 'workOrders.view' | 'workOrders.create' | 'workOrders.edit' | 'workOrders.delete' | 'workOrders.viewCost' | 'workOrders.componentInjection.manage'
  | 'quality.view' | 'quality.inspect' | 'quality.approve' | 'quality.print' | 'quality.manageWorkers'
  | 'quality.settings.view' | 'quality.settings.manage'
  | 'quality.workers.view' | 'quality.workers.manage'
  | 'quality.finalInspection.view' | 'quality.finalInspection.inspect'
  | 'quality.ipqc.view' | 'quality.ipqc.inspect'
  | 'quality.rework.view' | 'quality.rework.manage'
  | 'quality.capa.view' | 'quality.capa.manage'
  | 'quality.reports.view'
  | 'employeeDashboard.view'
  | 'selfService.view'
  | 'factoryDashboard.view'
  | 'adminDashboard.view'
  | 'attendance.view' | 'attendance.import' | 'attendance.sync' | 'attendance.process' | 'attendance.edit'
  | 'leave.view' | 'leave.create' | 'leave.manage'
  | 'loan.view' | 'loan.create' | 'loan.manage' | 'loan.disburse'
  | 'approval.view' | 'approval.manage' | 'approval.delegate' | 'approval.escalate' | 'approval.override'
  | 'payroll.view' | 'payroll.generate' | 'payroll.finalize' | 'payroll.lock'
  | 'payroll.accounts.view' | 'payroll.accounts.disburse'
  | 'hr.evaluation.view' | 'hr.evaluation.create' | 'hr.evaluation.approve'
  | 'hrDashboard.view'
  | 'vehicles.view' | 'vehicles.manage'
  | 'hrSettings.view' | 'hrSettings.edit'
  | 'repair.view'
  | 'repair.dashboard.view'
  | 'repair.adminDashboard.view'
  | 'repair.jobs.create' | 'repair.jobs.edit' | 'repair.jobs.delete' | 'repair.jobs.technician'
  | 'repair.parts.view' | 'repair.parts.manage'
  | 'repair.branches.manage'
  | 'repair.technician.view'
  | 'repair.treasury.view' | 'repair.treasury.manage'
  | 'repair.settings.manage'
  | 'repair.salesInvoice.create' | 'repair.salesInvoice.view' | 'repair.salesInvoice.edit' | 'repair.salesInvoice.cancel'
  | 'print' | 'export' | 'import';

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

const PERMISSION_GROUPS_RAW: PermissionGroup[] = [
  {
    key: 'dashboards',
    label: 'لوحات التحكم',
    permissions: [
      { key: 'dashboard.view', label: 'عرض لوحة التحكم' },
      { key: 'employeeDashboard.view', label: 'عرض لوحة الموظف' },
      { key: 'factoryDashboard.view', label: 'عرض لوحة مدير المصنع' },
      { key: 'adminDashboard.view', label: 'عرض لوحة مدير النظام' },
    ],
  },
  {
    key: 'catalog',
    label: 'الكتالوج',
    permissions: [
      { key: 'products.view', label: 'عرض المنتجات' },
      { key: 'products.rawMaterials.view', label: 'عرض صفحة المواد الخام (الإنتاج)' },
      { key: 'products.create', label: 'إنشاء منتج' },
      { key: 'products.createRawMaterial', label: 'إضافة مادة خام' },
      { key: 'products.edit', label: 'تعديل المنتجات' },
      { key: 'products.delete', label: 'حذف المنتجات' },
      { key: 'catalog.categories.view', label: 'عرض فئات الكتالوج' },
      { key: 'catalog.categories.create', label: 'إنشاء فئة كتالوج' },
      { key: 'catalog.categories.edit', label: 'تعديل فئات الكتالوج' },
      { key: 'catalog.categories.delete', label: 'حذف فئات الكتالوج' },
    ],
  },
  {
    key: 'production',
    label: 'الإنتاج',
    permissions: [
      { key: 'lines.view', label: 'عرض خطوط الإنتاج' },
      { key: 'lines.create', label: 'إنشاء خط إنتاج' },
      { key: 'lines.edit', label: 'تعديل خطوط الإنتاج' },
      { key: 'lines.delete', label: 'حذف خطوط الإنتاج' },
      { key: 'supervisors.view', label: 'عرض المشرفين' },
      { key: 'productionWorkers.view', label: 'عرض عمال الإنتاج' },
      { key: 'lineWorkers.view', label: 'عرض وإدارة ربط العمالة' },
      { key: 'supervisorAssignments.manage', label: 'إدارة توزيع المشرفين على الخطوط' },
      { key: 'plans.view', label: 'عرض خطط الإنتاج' },
      { key: 'plans.create', label: 'إنشاء خطة إنتاج' },
      { key: 'plans.edit', label: 'تعديل خطط الإنتاج' },
      { key: 'plans.componentInjection.manage', label: 'إدارة خطط إنتاج مكونات الحقن' },
      { key: 'workOrders.view', label: 'عرض أوامر الشغل' },
      { key: 'workOrders.create', label: 'إنشاء أمر شغل' },
      { key: 'workOrders.edit', label: 'تعديل أمر شغل' },
      { key: 'workOrders.delete', label: 'حذف أمر شغل' },
      { key: 'workOrders.viewCost', label: 'عرض تكاليف أوامر الشغل' },
      { key: 'reports.view', label: 'عرض التقارير' },
      { key: 'reports.create', label: 'إنشاء التقارير' },
      { key: 'reports.edit', label: 'تعديل التقارير' },
      { key: 'reports.delete', label: 'حذف التقارير' },
      { key: 'reports.viewCost', label: 'عرض عمود التكلفة' },
      { key: 'reports.componentInjection.manage', label: 'إدارة تقارير مكونات الحقن' },
      { key: 'reports.componentInjection.only', label: 'وضع حقن فقط (قفل تقرير المنتج العادي)' },
      { key: 'quickAction.view', label: 'الإدخال السريع' },
      { key: 'lineStatus.view', label: 'عرض حالة الخطوط' },
      { key: 'lineStatus.edit', label: 'تعديل حالة الخطوط' },
      { key: 'routing.view', label: 'عرض مسارات الإنتاج' },
      { key: 'routing.manage', label: 'إدارة مسارات الإنتاج' },
      { key: 'routing.execute', label: 'تنفيذ مسار إنتاج (مشرف)' },
      { key: 'routing.analytics', label: 'تحليلات مسارات الإنتاج' },
      { key: 'lineProductConfig.view', label: 'عرض إعدادات المنتج-الخط' },
      { key: 'supplyCycles.view', label: 'عرض دورات التوريد (باتش)' },
      { key: 'supplyCycles.manage', label: 'إنشاء وتعديل دورات التوريد' },
      { key: 'supplyCycles.close', label: 'إقفال دورة توريد' },
      { key: 'supplyCycles.delete', label: 'حذف دورة توريد (مسودة/فارغة)' },
    ],
  },
  {
    key: 'inventory',
    label: 'المخازن',
    permissions: [
      { key: 'inventory.view', label: 'عرض المخازن' },
      { key: 'inventory.transactions.create', label: 'تسجيل حركات المخزون' },
      { key: 'inventory.transactions.edit', label: 'تعديل حركات المخزون' },
      { key: 'inventory.transactions.print', label: 'طباعة حركات المخزون' },
      { key: 'inventory.transactions.export', label: 'تصدير حركات المخزون' },
      { key: 'inventory.transactions.delete', label: 'حذف حركات المخزون' },
      { key: 'inventory.counts.manage', label: 'إدارة الجرد واعتماد الفروق' },
      { key: 'inventory.warehouses.manage', label: 'إدارة المخازن' },
      { key: 'inventory.items.manage', label: 'إدارة الأصناف الخام' },
      { key: 'inventory.transfers.approve', label: 'اعتماد تحويلات المخازن' },
      { key: 'inventory.finishedStock.allowNegativeApprove', label: 'الموافقة على تحويل بالسالب (تم الصنع أو مخزن المفكك)' },
    ],
  },
  {
    key: 'quality',
    label: 'الجودة',
    permissions: [
      { key: 'quality.print', label: 'طباعة مستندات الجودة' },
      { key: 'quality.settings.view', label: 'عرض إعدادات الجودة' },
      { key: 'quality.settings.manage', label: 'إدارة إعدادات الجودة' },
      { key: 'quality.workers.view', label: 'عرض عمال الجودة' },
      { key: 'quality.workers.manage', label: 'إدارة عمال الجودة' },
      { key: 'quality.finalInspection.view', label: 'عرض الفحص النهائي' },
      { key: 'quality.finalInspection.inspect', label: 'تنفيذ الفحص النهائي' },
      { key: 'quality.ipqc.view', label: 'عرض IPQC' },
      { key: 'quality.ipqc.inspect', label: 'تنفيذ IPQC' },
      { key: 'quality.rework.view', label: 'عرض إعادة التشغيل' },
      { key: 'quality.rework.manage', label: 'إدارة إعادة التشغيل' },
      { key: 'quality.capa.view', label: 'عرض CAPA' },
      { key: 'quality.capa.manage', label: 'إدارة CAPA' },
      { key: 'quality.reports.view', label: 'عرض تقارير الجودة' },
    ],
  },
  {
    key: 'hr',
    label: 'الموارد البشرية',
    permissions: [
      { key: 'employees.view', label: 'عرض الموظفين' },
      { key: 'employees.viewDetails', label: 'عرض ملف الموظف' },
      { key: 'employees.create', label: 'إنشاء موظف' },
      { key: 'employees.edit', label: 'تعديل الموظفين' },
      { key: 'employees.delete', label: 'حذف الموظفين' },
      { key: 'attendance.view', label: 'عرض الحضور' },
      { key: 'attendance.import', label: 'استيراد بيانات' },
      { key: 'attendance.sync', label: 'مزامنة أجهزة الحضور' },
      { key: 'attendance.process', label: 'معالجة الحضور اليومي' },
      { key: 'attendance.edit', label: 'تعديل الحضور' },
      { key: 'leave.view', label: 'عرض الإجازات' },
      { key: 'leave.create', label: 'طلب إجازة' },
      { key: 'leave.manage', label: 'إدارة الإجازات' },
      { key: 'loan.view', label: 'عرض السُلف' },
      { key: 'loan.create', label: 'طلب سلفة' },
      { key: 'loan.manage', label: 'إدارة السُلف' },
      { key: 'loan.disburse', label: 'صرف السُلف (الحسابات)' },
      { key: 'approval.view', label: 'عرض الموافقات' },
      { key: 'approval.manage', label: 'إدارة الموافقات' },
      { key: 'approval.delegate', label: 'تفويض الموافقات' },
      { key: 'approval.escalate', label: 'تصعيد الموافقات' },
      { key: 'approval.override', label: 'تجاوز الموافقات (مدير النظام)' },
      { key: 'payroll.view', label: 'عرض كشف الرواتب' },
      { key: 'payroll.generate', label: 'إنشاء / احتساب الرواتب' },
      { key: 'payroll.finalize', label: 'اعتماد كشف الرواتب' },
      { key: 'payroll.lock', label: 'قفل الشهر نهائياً' },
      { key: 'payroll.accounts.view', label: 'عرض صرف الرواتب (الحسابات)' },
      { key: 'payroll.accounts.disburse', label: 'تأكيد صرف الرواتب' },
      { key: 'hr.evaluation.view', label: 'عرض تقييم الموظفين' },
      { key: 'hr.evaluation.create', label: 'إنشاء تقييم موظف' },
      { key: 'hr.evaluation.approve', label: 'اعتماد مكافآت التقييم' },
      { key: 'hrDashboard.view', label: 'عرض لوحة الموارد البشرية' },
      { key: 'vehicles.view', label: 'عرض المركبات' },
      { key: 'vehicles.manage', label: 'إدارة المركبات' },
      { key: 'hrSettings.view', label: 'عرض إعدادات HR' },
      { key: 'hrSettings.edit', label: 'تعديل إعدادات HR' },
      { key: 'selfService.view', label: 'الخدمة الذاتية للموظف' },
    ],
  },
  {
    key: 'repair',
    label: 'الصيانة',
    permissions: [
      { key: 'repair.view', label: 'عرض طلبات الصيانة' },
      { key: 'repair.dashboard.view', label: 'عرض لوحة الصيانة' },
      { key: 'repair.adminDashboard.view', label: 'عرض لوحة أدمن الصيانة' },
      { key: 'repair.jobs.create', label: 'إنشاء طلب صيانة' },
      { key: 'repair.jobs.edit', label: 'تعديل طلب صيانة' },
      { key: 'repair.jobs.delete', label: 'حذف طلب صيانة' },
      { key: 'repair.jobs.technician', label: 'فني صيانة (طلبات مسندة فقط)' },
      { key: 'repair.parts.view', label: 'عرض قطع الغيار' },
      { key: 'repair.parts.manage', label: 'إدارة قطع الغيار' },
      { key: 'repair.branches.manage', label: 'إدارة فروع الصيانة' },
      { key: 'repair.technician.view', label: 'عرض أداء الفنيين' },
      { key: 'repair.treasury.view', label: 'عرض خزينة الصيانة' },
      { key: 'repair.treasury.manage', label: 'إدارة خزينة الصيانة' },
      { key: 'repair.settings.manage', label: 'إدارة إعدادات الصيانة' },
      { key: 'repair.salesInvoice.create', label: 'إنشاء فاتورة بيع قطع الغيار' },
      { key: 'repair.salesInvoice.view', label: 'عرض فواتير بيع قطع الغيار' },
      { key: 'repair.salesInvoice.edit', label: 'تعديل فاتورة بيع قطع الغيار' },
      { key: 'repair.salesInvoice.cancel', label: 'إلغاء فاتورة بيع قطع الغيار' },
    ],
  },
  {
    key: 'costs',
    label: 'إدارة التكاليف',
    permissions: [
      { key: 'costs.view', label: 'عرض التكاليف' },
      { key: 'costs.manage', label: 'إدارة التكاليف' },
      { key: 'costs.closePeriod', label: 'إغلاق الفترة المحاسبية' },
      { key: 'assets.view', label: 'عرض الأصول' },
      { key: 'assets.create', label: 'إنشاء أصل' },
      { key: 'assets.edit', label: 'تعديل أصل' },
      { key: 'assets.delete', label: 'حذف أصل' },
      { key: 'assets.depreciation.view', label: 'عرض تقرير الإهلاك' },
      { key: 'assets.depreciation.run', label: 'تشغيل احتساب الإهلاك' },
    ],
  },
  {
    key: 'system',
    label: 'النظام',
    permissions: [
      { key: 'roles.view', label: 'عرض الأدوار' },
      { key: 'roles.manage', label: 'إدارة الأدوار' },
      { key: 'users.manage', label: 'إدارة المستخدمين' },
      { key: 'activityLog.view', label: 'عرض سجل النشاط' },
      { key: 'settings.view', label: 'عرض الإعدادات' },
      { key: 'settings.edit', label: 'تعديل الإعدادات' },
    ],
  },
  {
    key: 'special',
    label: 'صلاحيات خاصة',
    permissions: [
      { key: 'print', label: 'طباعة' },
      { key: 'export', label: 'تصدير' },
      { key: 'import', label: 'استيراد' },
    ],
  },
];

const PERMISSION_GROUP_ORDER: string[] = [
  // Dashboards
  'dashboards',
  // Catalog
  'catalog',
  // Production
  'production',
  // Inventory
  'inventory',
  // Quality
  'quality',
  // HR
  'hr',
  // Costs
  'repair',
  'costs',
  // System
  'system',
  // Special
  'special',
];

const permissionGroupOrderRank = new Map(
  PERMISSION_GROUP_ORDER.map((key, idx) => [key, idx]),
);

export const PERMISSION_GROUPS: PermissionGroup[] = [...PERMISSION_GROUPS_RAW].sort(
  (a, b) => {
    const aRank = permissionGroupOrderRank.get(a.key) ?? Number.MAX_SAFE_INTEGER;
    const bRank = permissionGroupOrderRank.get(b.key) ?? Number.MAX_SAFE_INTEGER;
    return aRank - bRank;
  },
);

/** Flat list of every permission key */
export const ALL_PERMISSIONS: Permission[] =
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

// NOTE: Sidebar/menu and route-to-permission mapping are centralized in
// `config/menu.config.ts` and module route definitions.

// ─── Pure Helpers ────────────────────────────────────────────────────────────

/** Check a single permission against a permissions map */
export function checkPermission(
  permissions: Record<string, boolean>,
  permission: Permission,
): boolean {
  const explicit = permissions[permission];
  if (explicit !== undefined) return explicit === true;

  // Backward compatibility for old role docs created before this permission existed.
  if (permission === 'employees.viewDetails') {
    return permissions['employees.view'] === true;
  }
  if (permission === 'quality.finalInspection.view' || permission === 'quality.ipqc.view' || permission === 'quality.rework.view' || permission === 'quality.capa.view' || permission === 'quality.reports.view') {
    return permissions['quality.view'] === true;
  }
  if (permission === 'quality.finalInspection.inspect' || permission === 'quality.ipqc.inspect') {
    return permissions['quality.inspect'] === true;
  }
  if (permission === 'quality.workers.manage') {
    return permissions['quality.manageWorkers'] === true;
  }
  if (
    permission === 'inventory.transactions.edit' ||
    permission === 'inventory.transactions.print' ||
    permission === 'inventory.transactions.export' ||
    permission === 'inventory.transactions.delete'
  ) {
    return permissions['inventory.transactions.create'] === true;
  }
  if (permission === 'users.manage') {
    return permissions['roles.manage'] === true;
  }
  if (permission === 'attendance.sync' || permission === 'attendance.process') {
    return permissions['attendance.import'] === true || permissions['attendance.edit'] === true;
  }
  if (permission === 'catalog.categories.view') {
    return permissions['products.view'] === true;
  }
  if (permission === 'repair.salesInvoice.edit' || permission === 'repair.salesInvoice.cancel') {
    return permissions['repair.salesInvoice.create'] === true;
  }
  if (
    permission === 'catalog.categories.create' ||
    permission === 'catalog.categories.edit' ||
    permission === 'catalog.categories.delete'
  ) {
    return permissions['products.edit'] === true || permissions['products.create'] === true;
  }
  if (permission === 'routing.view' || permission === 'routing.analytics') {
    return permissions['plans.view'] === true;
  }
  if (permission === 'routing.manage') {
    return permissions['plans.edit'] === true;
  }
  if (permission === 'routing.execute') {
    return permissions['reports.create'] === true || permissions['quickAction.view'] === true;
  }
  return false;
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
    const can = (permission: Permission) => checkPermission(permissions, permission);
    return {
      can,
      canCreateReport: can('reports.create'),
      canEditReport: can('reports.edit'),
      canDeleteReport: can('reports.delete'),
      canManageUsers: can('users.manage') || can('employees.create') || can('employees.edit'),
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
