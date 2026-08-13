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
import {
  isPackagingOnlyPermissions,
  normalizeRolePermissions,
} from './packagingOnlyPermissions';

export {
  canCreatePackagingReportsFromMap,
  isPackagingOnlyPermissions,
  normalizeRolePermissions,
} from './packagingOnlyPermissions';

// Permission matrix engine: import from `@/utils/permissionCatalog`
// (kept separate to avoid circular imports with this file).

// ─── Permission Names (all known permission keys) ────────────────────────────

export type Permission =
  | 'dashboard.view'
  | 'products.view' | 'products.create' | 'products.edit' | 'products.delete' | 'products.createRawMaterial' | 'products.rawMaterials.view' | 'products.sellingPrice.view'
  | 'materials.view' | 'materials.manage'
  | 'bom.view' | 'bom.manage'
  | 'planning.materialRequirements.view' | 'planning.materialRequirements.generate'
  | 'manufacturing.purchaseGap.view'
  | 'catalog.categories.view' | 'catalog.categories.create' | 'catalog.categories.edit' | 'catalog.categories.delete'
  | 'lines.view' | 'lines.create' | 'lines.edit' | 'lines.delete'
  | 'inventory.view' | 'inventory.analytics.view' | 'inventory.exceptions.view' | 'inventory.transactions.create' | 'inventory.transactions.edit' | 'inventory.transactions.print' | 'inventory.transactions.export' | 'inventory.transactions.delete' | 'inventory.counts.manage' | 'inventory.warehouses.manage' | 'inventory.locations.manage' | 'inventory.items.manage' | 'inventory.transfers.approve' | 'inventory.finishedStock.allowNegativeApprove' | 'inventory.disassembly.manage'
  | 'departmentConsumables.view' | 'departmentConsumables.create' | 'departmentConsumables.approve' | 'departmentConsumables.issue' | 'departmentConsumables.export'
  | 'sparePartsReplenishment.view' | 'sparePartsReplenishment.create' | 'sparePartsReplenishment.approve' | 'sparePartsReplenishment.prepare' | 'sparePartsReplenishment.responsibleApprove' | 'sparePartsReplenishment.receive' | 'sparePartsReplenishment.cancel' | 'sparePartsReplenishment.reject'
  | 'sparePartsRecall.view' | 'sparePartsRecall.create' | 'sparePartsRecall.confirm' | 'sparePartsRecall.cancel'
  | 'repairSpareIssues.view' | 'repairSpareIssues.create' | 'repairSpareIssues.approve' | 'repairSpareIssues.issue' | 'repairSpareIssues.print' | 'repairSpareIssues.cancel' | 'repairSpareIssues.reject'
  | 'productionIssue.create' | 'productionIssue.request' | 'productionIssue.approve' | 'productionIssue.print' | 'productionIssue.return' | 'productionIssue.compensate'
  | 'productionHandover.approve'
  | 'employees.view' | 'employees.viewDetails' | 'employees.create' | 'employees.edit' | 'employees.delete'
  | 'supervisors.view'
  | 'productionWorkers.view'
  | 'production.workers.view' | 'production.workers.manage'
  | 'production.workerTargets.manage'
  | 'production.workerReports.view'
  | 'production.workerRatings.view' | 'production.workerRatings.manage'
  | 'production.workerBonus.view' | 'production.workerBonus.manage'
  | 'production.attendance.view' | 'production.attendance.manage'
  | 'lineWorkers.view'
  | 'supervisorAssignments.manage'
  | 'reports.view' | 'reports.create' | 'reports.createForAnySupervisor' | 'reports.edit' | 'reports.delete' | 'reports.viewCost' | 'reports.componentInjection.manage' | 'reports.componentInjection.only' | 'reports.packaging.create' | 'reports.componentWaste.create'
  | 'supplyCycles.view' | 'supplyCycles.manage' | 'supplyCycles.close' | 'supplyCycles.delete'
  | 'lineStatus.view' | 'lineStatus.edit'
  | 'production.requests.observe'
  | 'lineProductConfig.view'
  | 'assets.view' | 'assets.create' | 'assets.edit' | 'assets.delete' | 'assets.depreciation.run' | 'assets.depreciation.view'
  | 'settings.view' | 'settings.edit'
  | 'system.readiness.view'
  | 'users.manage'
  | 'roles.view' | 'roles.manage'
  | 'activityLog.view'
  | 'quickAction.view'
  | 'costs.view' | 'costs.manage' | 'costs.closePeriod'
  | 'accounting.view' | 'accounting.accounts.manage' | 'accounting.journals.post' | 'accounting.journals.reverse' | 'accounting.periods.manage' | 'accounting.settings.manage' | 'accounting.inventory.view'
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
  | 'productionDashboard.view'
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
  | 'repair.jobs.create' | 'repair.jobs.edit' | 'repair.jobs.delete' | 'repair.jobs.technician' | 'repair.jobs.reception'
  | 'repair.parts.view' | 'repair.parts.manage' | 'repair.parts.request' | 'repair.parts.stockAdjust'
  | 'repair.pricing.manage'
  | 'repair.finance.view' | 'repair.payments.view' | 'repair.payments.collect' | 'repair.payments.reverse'
  | 'repair.discounts.request' | 'repair.discounts.approve'
  | 'repair.credit.request' | 'repair.credit.approve' | 'repair.accounting.manage'
  | 'repair.branches.manage'
  | 'repair.technician.view'
  | 'repair.treasury.view' | 'repair.treasury.manage'
  | 'repair.settings.manage'
  | 'repair.callCenter.viewAll'
  | 'repair.complaints.view' | 'repair.complaints.manage'
  | 'repair.customerPortal.manage'
  | 'repair.customerRequests.view' | 'repair.customerRequests.assign' | 'repair.customerRequests.receive'
  | 'repair.custody.view' | 'repair.custody.record' | 'repair.custody.correct' | 'repair.custody.handover'
  | 'repair.replacements.view' | 'repair.replacements.create' | 'repair.replacements.approve' | 'repair.replacements.deliver'
  | 'repair.salesInvoice.create' | 'repair.salesInvoice.view' | 'repair.salesInvoice.edit' | 'repair.salesInvoice.cancel'
  | 'customers.view' | 'customers.create' | 'customers.edit' | 'customers.import'
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
      { key: 'productionDashboard.view', label: 'عرض لوحة الإنتاج' },
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
      { key: 'products.sellingPrice.view', label: 'عرض سعر البيع (تفاصيل مالية)' },
      { key: 'catalog.categories.view', label: 'عرض فئات الكتالوج' },
      { key: 'catalog.categories.create', label: 'إنشاء فئة كتالوج' },
      { key: 'catalog.categories.edit', label: 'تعديل فئات الكتالوج' },
      { key: 'catalog.categories.delete', label: 'حذف فئات الكتالوج' },
    ],
  },
  {
    key: 'manufacturing',
    label: 'التصنيع والمواد',
    permissions: [
      { key: 'materials.view', label: 'عرض المواد التصنيعية' },
      { key: 'materials.manage', label: 'إدارة المواد التصنيعية' },
      { key: 'bom.view', label: 'عرض مكونات المنتج (BOM)' },
      { key: 'bom.manage', label: 'إدارة مكونات المنتج (زر المكونات / إضافة وتعديل)' },
      { key: 'planning.materialRequirements.view', label: 'عرض احتياجات المواد' },
      { key: 'planning.materialRequirements.generate', label: 'توليد احتياجات المواد' },
      { key: 'manufacturing.purchaseGap.view', label: 'تقرير فجوة الشراء' },
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
      { key: 'production.workers.view', label: 'عرض عمال الإنتاج (جديد)' },
      { key: 'production.workers.manage', label: 'إدارة عمال الإنتاج' },
      { key: 'production.workerTargets.manage', label: 'إدارة أهداف عمال الإنتاج' },
      { key: 'production.workerReports.view', label: 'عرض تقارير عمال الإنتاج' },
      { key: 'production.workerRatings.view', label: 'عرض تقييمات عمال الإنتاج' },
      { key: 'production.workerRatings.manage', label: 'مراجعة تقييمات عمال الإنتاج' },
      { key: 'production.workerBonus.view', label: 'عرض مكافآت عمال الإنتاج' },
      { key: 'production.workerBonus.manage', label: 'إدارة مكافآت عمال الإنتاج' },
      { key: 'production.attendance.view', label: 'عرض سجل حضور الإنتاج' },
      { key: 'production.attendance.manage', label: 'إدارة سجل حضور الإنتاج' },
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
      { key: 'workOrders.componentInjection.manage', label: 'إدارة أوامر شغل مكونات الحقن' },
      { key: 'reports.view', label: 'عرض التقارير' },
      { key: 'reports.create', label: 'إنشاء التقارير' },
      { key: 'reports.createForAnySupervisor', label: 'إنشاء تقرير لأي مشرف من أمر الشغل' },
      { key: 'reports.edit', label: 'تعديل التقارير' },
      { key: 'reports.delete', label: 'حذف التقارير' },
      { key: 'reports.viewCost', label: 'عرض عمود التكلفة' },
      { key: 'reports.componentInjection.manage', label: 'إدارة تقارير مكونات الحقن' },
      { key: 'reports.componentInjection.only', label: 'وضع حقن فقط (قفل تقرير المنتج العادي)' },
      { key: 'reports.packaging.create', label: 'إنشاء تقرير تغليف فقط (بدون إنشاء تقارير الإنتاج — يقفل الواجهة على التغليف)' },
      { key: 'reports.componentWaste.create', label: 'إنشاء تقرير هالك مكونات' },
      { key: 'quickAction.view', label: 'الإدخال السريع' },
      { key: 'production.requests.observe', label: 'الاطلاع على طلبات الإنتاج' },
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
      { key: 'inventory.analytics.view', label: 'تحليلات المخزون (ABC)' },
      { key: 'inventory.exceptions.view', label: 'استثناءات المخزون' },
      { key: 'inventory.transactions.create', label: 'تسجيل حركات المخزون' },
      { key: 'inventory.transactions.edit', label: 'تعديل حركات المخزون' },
      { key: 'inventory.transactions.print', label: 'طباعة حركات المخزون' },
      { key: 'inventory.transactions.export', label: 'تصدير حركات المخزون' },
      { key: 'inventory.transactions.delete', label: 'حذف حركات المخزون' },
      { key: 'inventory.counts.manage', label: 'إدارة الجرد والمطابقة واعتماد الفروق' },
      { key: 'inventory.warehouses.manage', label: 'إدارة المخازن' },
      { key: 'inventory.locations.manage', label: 'إدارة لوكيشنات المخازن' },
      { key: 'inventory.items.manage', label: 'إدارة الأصناف الخام' },
      { key: 'inventory.transfers.approve', label: 'اعتماد تحويلات المخازن' },
      { key: 'inventory.finishedStock.allowNegativeApprove', label: 'الموافقة على تحويل بالسالب (تم الصنع أو مخزن المفكك)' },
      { key: 'productionIssue.create', label: 'إنشاء أوامر صرف إنتاج' },
      { key: 'productionIssue.request', label: 'طلب صرف إنتاج من الإنتاج' },
      { key: 'productionIssue.approve', label: 'اعتماد صرف الإنتاج' },
      { key: 'productionIssue.print', label: 'طباعة إذن صرف إنتاج' },
      { key: 'productionIssue.return', label: 'تسجيل مرتجع مكونات' },
      { key: 'productionIssue.compensate', label: 'تسجيل تعويض مكونات' },
      { key: 'productionHandover.approve', label: 'اعتماد استلام تغليف (الكمية الفعلية)' },
      { key: 'inventory.disassembly.manage', label: 'إدارة التفكيك العكسي' },
      { key: 'departmentConsumables.view', label: 'عرض صرف مستهلكات الأقسام' },
      { key: 'departmentConsumables.create', label: 'إنشاء صرف مستهلكات الأقسام' },
      { key: 'departmentConsumables.approve', label: 'اعتماد صرف مستهلكات الأقسام' },
      { key: 'departmentConsumables.issue', label: 'تنفيذ/مرتجع صرف مستهلكات الأقسام' },
      { key: 'departmentConsumables.export', label: 'تصدير تقرير مستهلكات الأقسام' },
      { key: 'sparePartsReplenishment.view', label: 'عرض تموين قطع الغيار للمراكز' },
      { key: 'sparePartsReplenishment.create', label: 'إنشاء طلب تموين قطع غيار (مركز)' },
      { key: 'sparePartsReplenishment.approve', label: 'اعتماد طلب تموين قطع الغيار' },
      { key: 'sparePartsReplenishment.prepare', label: 'تجهيز طلب تموين قطع الغيار' },
      { key: 'sparePartsReplenishment.responsibleApprove', label: 'موافقة المسؤول على تموين قطع الغيار' },
      { key: 'sparePartsReplenishment.receive', label: 'تأكيد استلام تموين قطع الغيار بالمركز' },
      { key: 'sparePartsReplenishment.cancel', label: 'إلغاء طلب تموين قطع الغيار' },
      { key: 'sparePartsReplenishment.reject', label: 'رفض طلب تموين قطع الغيار' },
      { key: 'sparePartsRecall.view', label: 'عرض سحب قطع الغيار من المراكز' },
      { key: 'sparePartsRecall.create', label: 'إنشاء طلب سحب من مركز إلى الرئيسي' },
      { key: 'sparePartsRecall.confirm', label: 'تأكيد تسليم سحب قطع الغيار من المركز' },
      { key: 'sparePartsRecall.cancel', label: 'إلغاء طلب سحب قطع الغيار' },
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
    key: 'customers',
    label: 'العملاء',
    permissions: [
      { key: 'customers.view', label: 'عرض العملاء' },
      { key: 'customers.create', label: 'إنشاء عميل' },
      { key: 'customers.edit', label: 'تعديل عميل' },
      { key: 'customers.import', label: 'استيراد العملاء' },
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
      { key: 'repair.jobs.reception', label: 'استقبال الصيانة والتسليم' },
      { key: 'repair.parts.view', label: 'عرض قطع الغيار' },
      { key: 'repair.parts.manage', label: 'إدارة قطع الغيار' },
      { key: 'repair.parts.stockAdjust', label: 'جرد يدوي لقطع المركز (+/− / حذف) — ليس لمسؤول المركز' },
      { key: 'repair.parts.request', label: 'طلب قطعة من الورشة بدون أسعار' },
      { key: 'repair.pricing.manage', label: 'تسعير قطع الغيار وخدمات الصيانة' },
      { key: 'repair.finance.view', label: 'عرض ماليات طلبات الصيانة' },
      { key: 'repair.payments.view', label: 'عرض أذونات ودفعات الصيانة' },
      { key: 'repair.payments.collect', label: 'تحصيل دفعات الصيانة' },
      { key: 'repair.payments.reverse', label: 'عكس دفعة صيانة' },
      { key: 'repair.discounts.request', label: 'طلب خصم صيانة' },
      { key: 'repair.discounts.approve', label: 'اعتماد خصم صيانة' },
      { key: 'repair.credit.request', label: 'طلب تسليم برصيد' },
      { key: 'repair.credit.approve', label: 'اعتماد تسليم برصيد' },
      { key: 'repair.accounting.manage', label: 'إعداد حسابات ومراكز تكلفة الصيانة' },
      { key: 'repairSpareIssues.view', label: 'عرض سندات صرف قطع الغيار' },
      { key: 'repairSpareIssues.create', label: 'إنشاء سند صرف قطع غيار' },
      { key: 'repairSpareIssues.approve', label: 'اعتماد سند صرف قطع غيار' },
      { key: 'repairSpareIssues.issue', label: 'تنفيذ/مرتجع صرف قطع الغيار' },
      { key: 'repairSpareIssues.print', label: 'طباعة سند صرف قطع غيار' },
      { key: 'repairSpareIssues.cancel', label: 'إلغاء سند صرف قطع غيار' },
      { key: 'repairSpareIssues.reject', label: 'رفض سند صرف قطع غيار' },
      { key: 'repair.branches.manage', label: 'إدارة فروع الصيانة' },
      { key: 'repair.technician.view', label: 'عرض أداء الفنيين' },
      { key: 'repair.treasury.view', label: 'عرض خزينة الصيانة' },
      { key: 'repair.treasury.manage', label: 'إدارة خزينة الصيانة' },
      { key: 'repair.settings.manage', label: 'إدارة إعدادات الصيانة' },
      { key: 'repair.callCenter.viewAll', label: 'مركز اتصال — عرض كل الفروع' },
      { key: 'repair.complaints.view', label: 'عرض شكاوى الصيانة' },
      { key: 'repair.complaints.manage', label: 'إدارة شكاوى الصيانة' },
      { key: 'repair.customerPortal.manage', label: 'إدارة PIN بوابة العملاء' },
      { key: 'repair.customerRequests.view', label: 'عرض طلبات العملاء' },
      { key: 'repair.customerRequests.assign', label: 'توزيع طلبات العملاء على المراكز' },
      { key: 'repair.customerRequests.receive', label: 'تأكيد استلام طلبات العملاء' },
      { key: 'repair.custody.view', label: 'عرض عهدة أجهزة العملاء' },
      { key: 'repair.custody.record', label: 'تسجيل غير القابل للإصلاح' },
      { key: 'repair.custody.correct', label: 'تصحيح أرصدة وقرارات العهدة' },
      { key: 'repair.custody.handover', label: 'تأكيد التسليم الفعلي وخروج العهدة' },
      { key: 'repair.replacements.view', label: 'عرض طلبات الاستبدال' },
      { key: 'repair.replacements.create', label: 'إنشاء طلب استبدال' },
      { key: 'repair.replacements.approve', label: 'اعتماد أو رفض طلب استبدال' },
      { key: 'repair.replacements.deliver', label: 'تأكيد تسليم المنتج البديل' },
      { key: 'repair.salesInvoice.create', label: 'إنشاء فاتورة بيع قطع الغيار' },
      { key: 'repair.salesInvoice.view', label: 'عرض فواتير بيع قطع الغيار' },
      { key: 'repair.salesInvoice.edit', label: 'تعديل فاتورة بيع قطع الغيار' },
      { key: 'repair.salesInvoice.cancel', label: 'إلغاء فاتورة بيع قطع الغيار' },
    ],
  },
  {
    key: 'accounting',
    label: 'الحسابات العامة',
    permissions: [
      { key: 'accounting.view', label: 'عرض موديول الحسابات والتقارير' },
      { key: 'accounting.accounts.manage', label: 'إدارة شجرة الحسابات' },
      { key: 'accounting.journals.post', label: 'إنشاء وترحيل قيود يدوية' },
      { key: 'accounting.journals.reverse', label: 'عكس القيود المحاسبية' },
      { key: 'accounting.periods.manage', label: 'إقفال وإعادة فتح الفترات' },
      { key: 'accounting.settings.manage', label: 'إدارة السياسات والربط المحاسبي' },
      { key: 'accounting.inventory.view', label: 'عرض قيمة المخزون محاسبيًا' },
    ],
  },
  {
    key: 'costs',
    label: 'إدارة التكاليف',
    permissions: [
      { key: 'costs.view', label: 'عرض التكاليف وتفاصيل المنتج المالية' },
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
      { key: 'system.readiness.view', label: 'جاهزية المستأجر' },
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

  // Legacy: packaging-only used to be a separate restrictive flag.
  // Now "packaging only" = packaging.create without reports.create.
  if (permission === 'reports.packaging.create') {
    return permissions['reports.packaging.only'] === true;
  }

  // Backward compatibility for old role docs created before this permission existed.
  if (permission === 'employees.viewDetails') {
    return permissions['employees.view'] === true;
  }
  // Catalog key was missing historically; allow injection work orders when the role
  // can create work orders and already manages injection plans/reports.
  if (permission === 'workOrders.componentInjection.manage') {
    return permissions['workOrders.create'] === true
      && (
        permissions['plans.componentInjection.manage'] === true
        || permissions['reports.componentInjection.manage'] === true
        || permissions['roles.manage'] === true
      );
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
  if (permission === 'system.readiness.view') {
    return permissions['settings.view'] === true || permissions['adminDashboard.view'] === true;
  }
  if (permission === 'inventory.analytics.view' || permission === 'inventory.exceptions.view') {
    return permissions['inventory.view'] === true;
  }
  if (permission === 'inventory.locations.manage') {
    return permissions['inventory.warehouses.manage'] === true;
  }
  // Legacy manufacturing roles used products.createRawMaterial before materials.manage.
  // Do not treat inventory.items.manage / inventory.view as the manufacturing catalog —
  // spare-parts central operators hold those keys for stock cards, not BOM materials.
  if (permission === 'materials.manage') {
    return permissions['products.createRawMaterial'] === true;
  }
  if (permission === 'materials.view') {
    return (
      permissions['materials.manage'] === true
      || permissions['products.rawMaterials.view'] === true
    );
  }
  if (permission === 'productionIssue.create' || permission === 'productionIssue.print' || permission === 'productionIssue.return') {
    return permissions['inventory.transactions.create'] === true;
  }
  if (permission === 'productionIssue.approve' || permission === 'productionIssue.compensate') {
    return permissions['inventory.transfers.approve'] === true || permissions['inventory.transactions.create'] === true;
  }
  if (permission === 'departmentConsumables.view') {
    return permissions['inventory.view'] === true;
  }
  if (permission === 'departmentConsumables.create') {
    return permissions['inventory.transactions.create'] === true;
  }
  if (permission === 'departmentConsumables.approve') {
    return permissions['inventory.transfers.approve'] === true;
  }
  if (permission === 'departmentConsumables.issue') {
    return permissions['inventory.transactions.create'] === true;
  }
  if (permission === 'departmentConsumables.export') {
    return permissions['inventory.transactions.export'] === true || permissions['export'] === true;
  }
  if (permission === 'sparePartsReplenishment.view') {
    return permissions['inventory.view'] === true;
  }
  if (permission === 'sparePartsReplenishment.create') {
    return permissions['inventory.transactions.create'] === true;
  }
  if (permission === 'sparePartsReplenishment.approve') {
    return permissions['inventory.transfers.approve'] === true;
  }
  if (permission === 'sparePartsReplenishment.prepare') {
    return (
      permissions['inventory.transfers.approve'] === true
      || permissions['inventory.transactions.create'] === true
    );
  }
  if (permission === 'sparePartsReplenishment.responsibleApprove') {
    return permissions['inventory.transfers.approve'] === true;
  }
  if (permission === 'sparePartsReplenishment.receive') {
    return (
      permissions['inventory.transactions.create'] === true
      || permissions['inventory.transfers.approve'] === true
    );
  }
  if (permission === 'sparePartsReplenishment.cancel') {
    return (
      permissions['sparePartsReplenishment.create'] === true
      || permissions['inventory.transactions.create'] === true
      || permissions['inventory.transfers.approve'] === true
    );
  }
  if (permission === 'sparePartsReplenishment.reject') {
    return (
      permissions['sparePartsReplenishment.approve'] === true
      || permissions['inventory.transfers.approve'] === true
    );
  }
  if (permission === 'sparePartsRecall.view') {
    return (
      permissions['sparePartsReplenishment.view'] === true
      || permissions['inventory.view'] === true
    );
  }
  if (permission === 'sparePartsRecall.create') {
    return (
      permissions['sparePartsReplenishment.prepare'] === true
      || permissions['inventory.transactions.create'] === true
    );
  }
  if (permission === 'sparePartsRecall.confirm') {
    return (
      permissions['sparePartsReplenishment.receive'] === true
      || permissions['inventory.transactions.create'] === true
      || permissions['inventory.transfers.approve'] === true
    );
  }
  if (permission === 'sparePartsRecall.cancel') {
    return (
      permissions['sparePartsRecall.create'] === true
      || permissions['sparePartsReplenishment.approve'] === true
      || permissions['inventory.transfers.approve'] === true
    );
  }
  if (permission === 'repair.parts.stockAdjust') {
    // Manual +/- / delete on center stock — not for typical center managers who only have parts.manage.
    return (
      permissions['repair.parts.stockAdjust'] === true
      || permissions['inventory.counts.manage'] === true
      || permissions['repair.adminDashboard.view'] === true
      || permissions['repair.branches.manage'] === true
    );
  }
  if (permission === 'repairSpareIssues.view') {
    return permissions['repair.parts.view'] === true || permissions['repair.view'] === true;
  }
  if (permission === 'repairSpareIssues.create') {
    return permissions['repair.parts.manage'] === true;
  }
  if (permission === 'repairSpareIssues.approve') {
    return permissions['repair.parts.manage'] === true;
  }
  if (permission === 'repairSpareIssues.issue') {
    return permissions['repair.parts.manage'] === true;
  }
  if (permission === 'repairSpareIssues.print') {
    return (
      permissions['repairSpareIssues.view'] === true
      || permissions['repair.parts.view'] === true
      || permissions['repair.view'] === true
      || permissions['repair.parts.manage'] === true
    );
  }
  if (permission === 'repairSpareIssues.cancel') {
    return (
      permissions['repairSpareIssues.create'] === true
      || permissions['repair.parts.manage'] === true
    );
  }
  if (permission === 'repairSpareIssues.reject') {
    return (
      permissions['repairSpareIssues.approve'] === true
      || permissions['repair.parts.manage'] === true
    );
  }
  // New permission — older role docs (including admin) may omit the key entirely.
  if (permission === 'productionIssue.request') {
    return (
      permissions['productionIssue.create'] === true
      || permissions['plans.create'] === true
      || permissions['adminDashboard.view'] === true
      || permissions['roles.manage'] === true
    );
  }
  if (permission === 'inventory.disassembly.manage') {
    return permissions['inventory.transactions.create'] === true;
  }
  if (permission === 'manufacturing.purchaseGap.view') {
    return permissions['planning.materialRequirements.view'] === true;
  }
  if (permission === 'attendance.sync' || permission === 'attendance.process') {
    return permissions['attendance.import'] === true || permissions['attendance.edit'] === true;
  }
  if (permission === 'leave.view' || permission === 'leave.create') {
    return permissions['leave.manage'] === true
      || permissions['approval.view'] === true
      || permissions['reports.create'] === true
      || permissions['production.workerReports.view'] === true;
  }
  if (permission === 'products.sellingPrice.view') {
    // Legacy: selling price was gated by roles.manage before this key existed.
    return permissions['roles.manage'] === true;
  }
  if (permission === 'bom.view') {
    return permissions['bom.manage'] === true;
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
    return (
      permissions['reports.create'] === true
      || permissions['reports.packaging.create'] === true
      || permissions['quickAction.view'] === true
    );
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
  /** Derived: packaging.create without reports.create */
  isPackagingOnly: boolean;
}

// ─── React Hooks ─────────────────────────────────────────────────────────────

/** Primary hook — returns `can()` checker plus named guards */
export function usePermission(): PermissionGuards {
  const permissions = useAppStore((s) => s.userPermissions);
  return useMemo(() => {
    const can = (permission: Permission) => checkPermission(permissions, permission);
    return {
      can,
      canCreateReport: can('reports.create') || can('reports.packaging.create'),
      canEditReport: can('reports.edit'),
      canDeleteReport: can('reports.delete'),
      canManageUsers: can('users.manage') || can('employees.create') || can('employees.edit'),
      canViewActivityLog: can('activityLog.view'),
      canUseQuickAction: can('quickAction.view'),
      isPackagingOnly: isPackagingOnlyPermissions(permissions),
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
