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
  /** Show only for these built-in role keys, even when an administrator has every permission. */
  includeRoleKeys?: FirestoreRoleKey[];
  activePatterns?: string[];
  /**
   * When `activePatterns` or the default `path/` prefix matches, skip if the logical path
   * starts with one of these (e.g. exclude `/production/routing/analytics` from the list item).
   */
  activePathExcludePrefixes?: string[];
  /**
   * When true, only the exact path (and optional query) marks the item active —
   * no `/path/...` prefix matching. Used for list pages that have nested detail routes.
   */
  exact?: boolean;
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
  if (item.includeRoleKeys?.length && (!roleKey || !item.includeRoleKeys.includes(roleKey as FirestoreRoleKey))) {
    return false;
  }
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
    const { countActionableApprovalsForCurrentUser } = await import(
      '../modules/hr/approval/countActionableApprovalsBadge'
    );
    return countActionableApprovalsForCurrentUser();
  },
  pendingLeaveApprovals: async (): Promise<number> => {
    const { countActionableApprovalsForCurrentUser } = await import(
      '../modules/hr/approval/countActionableApprovalsBadge'
    );
    return countActionableApprovalsForCurrentUser('leave');
  },
  pendingLoanApprovals: async (): Promise<number> => {
    const { countActionableApprovalsForCurrentUser } = await import(
      '../modules/hr/approval/countActionableApprovalsBadge'
    );
    return countActionableApprovalsForCurrentUser('loan');
  },
  activeSupplyCycles: async (): Promise<number> => {
    const { supplyCycleService } = await import(
      '../modules/production/services/supplyCycleService'
    );
    return supplyCycleService.countActive();
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
  pendingSparePartsReplenishmentCentral: async (): Promise<number> => {
    const { sparePartsReplenishmentService } = await import(
      '../modules/inventory/services/sparePartsReplenishmentService'
    );
    return sparePartsReplenishmentService.countCentralPending();
  },
  pendingSparePartsReplenishmentReceive: async (): Promise<number> => {
    const { sparePartsReplenishmentService } = await import(
      '../modules/inventory/services/sparePartsReplenishmentService'
    );
    return sparePartsReplenishmentService.countAwaitingReceive();
  },
  pendingRepairSpareIssues: async (): Promise<number> => {
    const { repairSpareIssueService } = await import(
      '../modules/repair/services/repairSpareIssueService'
    );
    return repairSpareIssueService.countPending();
  },
  pendingTransferApprovals: async (): Promise<number> => {
    const { transferApprovalService } = await import(
      '../modules/inventory/services/transferApprovalService'
    );
    return transferApprovalService.countPending();
  },
  pendingProductionInventoryApprovals: async (): Promise<number> => {
    const { countPendingProductionInventoryApprovals } = await import(
      '../modules/inventory/services/productionInventoryApprovalsBadge'
    );
    return countPendingProductionInventoryApprovals();
  },
  pendingStockCountApprovals: async (): Promise<number> => {
    const { stockService } = await import('../modules/inventory/services/stockService');
    return stockService.countAwaitingApproval();
  },
  pendingRepairPaymentApprovals: async (): Promise<number> => {
    const { repairPaymentService } = await import('../modules/repair/services/repairPaymentService');
    return repairPaymentService.countPendingApprovals();
  },
  pendingRepairExpenseApprovals: async (): Promise<number> => {
    const { useAppStore } = await import('../store/useAppStore');
    const permissions = useAppStore.getState().userPermissions;
    if (
      permissions['repair.treasury.manage'] !== true
      || permissions['repair.branches.manage'] !== true
    ) return 0;
    const { repairTreasuryService } = await import('../modules/repair/services/repairTreasuryService');
    return repairTreasuryService.countPendingExpenseApprovals();
  },
  pendingRepairReplacementApprovals: async (): Promise<number> => {
    const { repairCustomerOperationsService } = await import(
      '../modules/repair/services/repairCustomerOperationsService'
    );
    return repairCustomerOperationsService.countPendingApprovals();
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
      {
        key: 'catalog-dashboard',
        label: 'لوحة الكتالوج',
        icon: 'dashboard',
        path: '/catalog',
        permission: 'products.view',
        anyOfPermissions: ['products.view', 'materials.view', 'catalog.categories.view'],
        exact: true,
        excludeRoleKeys: [
          'spare_parts_central_warehouse',
          'maintenance_center_warehouse',
          'repair_reception',
          'repair_technician',
        ],
      },
      {
        key: 'catalog-products',
        label: 'المنتجات',
        icon: 'inventory_2',
        path: '/products',
        permission: 'products.view',
        activePatterns: ['/products/'],
        excludeRoleKeys: ['spare_parts_central_warehouse', 'maintenance_center_warehouse'],
      },
      {
        key: 'catalog-categories',
        label: 'الفئات',
        icon: 'category',
        path: '/catalog/categories',
        permission: 'catalog.categories.view',
        excludeRoleKeys: ['spare_parts_central_warehouse', 'maintenance_center_warehouse'],
      },
      {
        key: 'manufacturing-materials',
        label: 'المواد التصنيعية',
        icon: 'precision_manufacturing',
        path: '/manufacturing/materials',
        permission: 'materials.view',
        // Spare-parts / repair front desk use stock cards — not the manufacturing materials master.
        excludeRoleKeys: [
          'spare_parts_central_warehouse',
          'maintenance_center_warehouse',
          'repair_reception',
          'repair_technician',
        ],
      },
      {
        key: 'manufacturing-material-categories',
        label: 'فئات المواد',
        icon: 'category',
        path: '/manufacturing/material-categories',
        permission: 'materials.manage',
        excludeRoleKeys: [
          'spare_parts_central_warehouse',
          'maintenance_center_warehouse',
          'repair_reception',
          'repair_technician',
        ],
      },
    ],
  },
  {
    key: 'production',
    label: 'الإنتاج',
    icon: 'precision_manufacturing',
    children: [
      {
        key: 'production-dashboard',
        label: 'لوحة الإنتاج',
        icon: 'dashboard',
        path: '/production',
        // Factory-wide KPIs — not operational keys like plans/reports/quickAction.
        permission: 'productionDashboard.view',
        anyOfPermissions: [
          'productionDashboard.view',
          'factoryDashboard.view',
          'adminDashboard.view',
        ],
        exact: true,
      },
      // لوحة المشرف = الرئيسية للمشرف (`/` → SupervisorDashboard) — لا تكرار في سايدبار الإنتاج.
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
      {
        key: 'plans',
        label: 'خطط الإنتاج',
        icon: 'event_note',
        path: '/production-plans',
        permission: 'plans.view',
        // Factory/hall planning — not line supervisor day-to-day.
        excludeRoleKeys: ['supervisor'],
      },
      {
        key: 'production-issue-requests',
        label: 'طلبات صرف الإنتاج',
        icon: 'fact_check',
        path: '/production/issue-requests',
        // Must match page gate — plans.view alone opened a dead "no permission" screen.
        permission: 'productionIssue.request',
        activePatterns: ['/production/issue-requests'],
      },
      {
        key: 'production-floor',
        label: 'مساحة صالة الإنتاج',
        icon: 'precision_manufacturing',
        path: '/production/floor',
        permission: 'inventory.view',
        excludeRoleKeys: [
          'repair_reception',
          'repair_technician',
          'spare_parts_central_warehouse',
          'maintenance_center_warehouse',
        ],
        activePatterns: ['/production/floor', '/inventory/production-floor'],
      },
      {
        key: 'packaging-control',
        label: 'تحكم التغليف',
        icon: 'package_2',
        path: '/production/packaging/control',
        // Receipt + variance hub — not line-supervisor reports.view.
        permission: 'productionHandover.approve',
        anyOfPermissions: [
          'productionHandover.approve',
          'inventory.transfers.approve',
          'reports.packaging.create',
          'factoryDashboard.view',
          'adminDashboard.view',
        ],
        excludeRoleKeys: ['materials_warehouse', 'repair_reception', 'repair_technician'],
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
      {
        key: 'supply-cycles',
        label: 'دورات التوريد',
        icon: 'inventory',
        path: '/supply-cycles',
        permission: 'supplyCycles.view',
        activePatterns: ['/supply-cycles/'],
        badgeSource: badgeSources.activeSupplyCycles,
      },
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
      // نظرة عامة ومساحات
      { key: 'inv-dashboard', label: 'لوحة المخازن', icon: 'inventory', path: '/inventory', permission: 'inventory.view', exact: true },
      {
        key: 'inv-warehouses',
        label: 'كل المخازن ومساحاتها',
        icon: 'warehouse',
        path: '/inventory/warehouses',
        permission: 'inventory.view',
        exact: true,
      },
      {
        key: 'inv-raw-control',
        label: 'مساحة مستلزمات الإنتاج',
        icon: 'inventory_2',
        path: '/inventory/raw-materials/control',
        permission: 'inventory.view',
      },
      {
        key: 'inv-raw-alerts',
        label: 'تنبيهات المستلزمات',
        icon: 'notifications_active',
        path: '/inventory/raw-materials/alerts',
        permission: 'inventory.view',
        badgeSource: badgeSources.rawMaterialWarehouseAlerts,
      },
      {
        key: 'inv-spare-parts-replenishment',
        label: 'إذن صرف للمراكز (تموين)',
        icon: 'construction',
        path: '/inventory/spare-parts-replenishment',
        permission: 'sparePartsReplenishment.view',
        // Central warehouse operators only — center create/receive lives under /repair/parts.
        anyOfPermissions: ['sparePartsReplenishment.prepare', 'sparePartsReplenishment.approve', 'inventory.view'],
        badgeSource: badgeSources.pendingSparePartsReplenishmentCentral,
      },
      {
        key: 'inv-spare-parts-purchase',
        label: 'فاتورة شراء قطع',
        icon: 'receipt_long',
        path: '/inventory/spare-parts-purchase',
        permission: 'inventory.transactions.create',
        anyOfPermissions: ['inventory.transactions.create', 'sparePartsReplenishment.prepare', 'repair.parts.manage'],
      },
      { key: 'inv-spare-parts-in', label: 'إذن إضافة قطع غيار', icon: 'add_box', path: '/inventory/movements?movementType=IN', permission: 'inventory.transactions.create' },
      {
        key: 'inv-spare-parts-center-stock',
        label: 'أرصدة المراكز',
        icon: 'store',
        path: '/inventory/spare-parts-center-stock',
        permission: 'sparePartsRecall.view',
        anyOfPermissions: ['sparePartsRecall.view', 'sparePartsReplenishment.view', 'inventory.view'],
      },
      {
        key: 'inv-spare-parts-recall',
        label: 'سحب من المراكز',
        icon: 'keyboard_return',
        path: '/inventory/spare-parts-recall',
        permission: 'sparePartsRecall.view',
        anyOfPermissions: ['sparePartsRecall.view', 'sparePartsRecall.create', 'sparePartsRecall.confirm'],
      },
      // استعلام عبر كل المخازن
      { key: 'inv-balances', label: 'أرصدة كل المخازن', icon: 'inventory_2', path: '/inventory/balances', permission: 'inventory.view' },
      { key: 'inv-item-card', label: 'كارت الصنف', icon: 'badge', path: '/inventory/item-card', permission: 'inventory.view' },
      { key: 'inv-transactions', label: 'حركات كل المخازن', icon: 'sync_alt', path: '/inventory/transactions', permission: 'inventory.view' },
      { key: 'inv-locations', label: 'مواقع الأرفف', icon: 'grid_view', path: '/inventory/locations', permission: 'inventory.view' },
      // عمليات مشتركة
      {
        key: 'inv-department-consumables',
        label: 'صرف مستهلكات الأقسام',
        icon: 'shopping_bag',
        path: '/inventory/department-consumables',
        permission: 'departmentConsumables.view',
        anyOfPermissions: ['departmentConsumables.view', 'inventory.view'],
      },
      {
        key: 'inv-transfer-approvals',
        label: 'اعتماد تحويلات المخازن',
        icon: 'verified_user',
        path: '/inventory/transfer-approvals',
        permission: 'inventory.view',
        badgeSource: badgeSources.pendingTransferApprovals,
      },
      {
        key: 'inv-counts',
        label: 'جرد المخازن',
        icon: 'fact_check',
        path: '/inventory/counts',
        permission: 'inventory.counts.manage',
        badgeSource: badgeSources.pendingStockCountApprovals,
      },
      // إنتاج ↔ مخازن
      { key: 'inv-production-issues', label: 'صرف للإنتاج', icon: 'fact_check', path: '/inventory/production-issues', permission: 'inventory.view', badgeSource: badgeSources.pendingProductionIssueRequests },
      {
        key: 'inv-production-approvals',
        label: 'اعتمادات وارد الإنتاج',
        icon: 'approval',
        path: '/inventory/production-approvals',
        permission: 'inventory.view',
        excludeRoleKeys: ['materials_warehouse'],
        badgeSource: badgeSources.pendingProductionInventoryApprovals,
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
      // تحليل
      { key: 'inv-analytics', label: 'تحليلات المخازن', icon: 'analytics', path: '/inventory/analytics', permission: 'inventory.analytics.view' },
      { key: 'inv-exceptions', label: 'استثناءات المخازن', icon: 'warning', path: '/inventory/exceptions', permission: 'inventory.exceptions.view' },
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
      {
        key: 'leaves',
        label: 'الإجازات',
        icon: 'beach_access',
        path: '/hr/leave-requests',
        permission: 'leave.view',
        badgeSource: badgeSources.pendingLeaveApprovals,
      },
      {
        key: 'loans',
        label: 'السُلف',
        icon: 'payments',
        path: '/hr/loan-requests',
        permission: 'loan.view',
        badgeSource: badgeSources.pendingLoanApprovals,
      },
      {
        key: 'approvals',
        label: 'مركز الموافقات',
        icon: 'fact_check',
        path: '/hr/approval-center',
        permission: 'approval.view',
        badgeSource: badgeSources.pendingApprovals,
      },
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
    key: 'accounting',
    label: 'الحسابات',
    icon: 'account_balance',
    children: [
      { key: 'accounting-dashboard', label: 'لوحة الحسابات', icon: 'monitoring', path: '/accounting', permission: 'accounting.view' },
      { key: 'accounting-journals', label: 'القيود اليومية', icon: 'receipt_long', path: '/accounting/journals', permission: 'accounting.view' },
      { key: 'accounting-ledger', label: 'دفتر الأستاذ', icon: 'menu_book', path: '/accounting/ledger', permission: 'accounting.view' },
      { key: 'accounting-trial', label: 'ميزان المراجعة', icon: 'balance', path: '/accounting/trial-balance', permission: 'accounting.view' },
      { key: 'accounting-repair-pnl', label: 'ربحية الصيانة', icon: 'trending_up', path: '/accounting/repair-pnl', permission: 'accounting.view' },
      { key: 'accounting-inventory', label: 'قيمة المخزون', icon: 'inventory_2', path: '/accounting/inventory-valuation', permission: 'accounting.inventory.view' },
      { key: 'accounting-chart', label: 'شجرة الحسابات', icon: 'account_tree', path: '/accounting/chart', permission: 'accounting.view' },
      {
        key: 'accounting-cost-centers',
        label: 'مراكز التكلفة',
        icon: 'account_balance',
        path: '/accounting/cost-centers',
        permission: 'accounting.view',
        activePatterns: ['/accounting/cost-centers/'],
      },
      { key: 'accounting-settings', label: 'إعدادات الحسابات', icon: 'settings', path: '/accounting/settings', permission: 'accounting.view' },
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
    key: 'customers',
    label: 'العملاء',
    icon: 'groups',
    children: [
      { key: 'customers-kpi', label: 'لوحة العملاء', icon: 'monitoring', path: '/customers/kpi', permission: 'customers.view' },
      { key: 'customers-list', label: 'سجل العملاء', icon: 'badge', path: '/customers', permission: 'customers.view' },
      { key: 'customers-import', label: 'استيراد العملاء', icon: 'upload_file', path: '/customers/import', permission: 'customers.import' },
    ],
  },
  {
    key: 'repair',
    label: 'الصيانة',
    icon: 'build_circle',
    children: [
      {
        key: 'repair-dashboard',
        label: 'لوحة الصيانة',
        icon: 'dashboard',
        path: '/repair',
        permission: 'repair.dashboard.view',
        // Admin view already renders on `/repair` when `repair.adminDashboard.view` is present —
        // one sidebar entry only (no duplicate «لوحة الإدارة»).
        anyOfPermissions: ['repair.dashboard.view', 'repair.adminDashboard.view'],
        exact: true,
      },
      { key: 'repair-new-job', label: 'تسجيل طلب جديد', icon: 'add_circle', path: '/repair/jobs/new', permission: 'repair.jobs.create' },
      { key: 'repair-jobs', label: 'طلبات الصيانة', icon: 'construction', path: '/repair/jobs', permission: 'repair.view' },
      {
        key: 'repair-payments',
        label: 'التحصيل والتسليم',
        icon: 'payments',
        path: '/repair/payments',
        permission: 'repair.payments.view',
        badgeSource: badgeSources.pendingRepairPaymentApprovals,
      },
      { key: 'repair-call-center', label: 'مركز الاتصال', icon: 'call', path: '/repair/call-center', permission: 'repair.view' },
      { key: 'repair-customer-requests', label: 'طلبات العملاء', icon: 'assignment', path: '/repair/customer-requests', permission: 'repair.customerRequests.view', anyOfPermissions: ['repair.customerRequests.view', 'repair.customerRequests.assign', 'repair.customerRequests.receive'] },
      {
        key: 'repair-custody-stock',
        label: 'عهدة أجهزة العملاء',
        icon: 'inventory',
        path: '/repair/custody-stock',
        permission: 'repair.custody.view',
        // Warehouse ops only — `repair.custody.record` is workshop marking, not stock screens.
        anyOfPermissions: ['repair.custody.view', 'repair.custody.handover'],
        excludeRoleKeys: ['repair_technician'],
        activePatterns: ['/repair/custody-stock', '/repair/unrepairable-stock'],
      },
      {
        key: 'repair-replacements',
        label: 'طلبات الاستبدال',
        icon: 'swap_horiz',
        path: '/repair/replacements',
        permission: 'repair.replacements.view',
        anyOfPermissions: [
          'repair.replacements.view',
          'repair.replacements.create',
          'repair.replacements.approve',
          'repair.replacements.deliver',
        ],
        badgeSource: badgeSources.pendingRepairReplacementApprovals,
      },
      { key: 'repair-technician-home', label: 'لوحة الفني', icon: 'engineering', path: '/repair/technician', permission: 'repair.jobs.technician', includeRoleKeys: ['repair_technician'], exact: true },
      { key: 'repair-my-jobs', label: 'طلباتي (فني)', icon: 'engineering', path: '/repair/my-jobs', permission: 'repair.jobs.technician', includeRoleKeys: ['repair_technician'], exact: true },
      { key: 'repair-parts', label: 'قطع غيار المراكز', icon: 'inventory_2', path: '/repair/parts', permission: 'repair.parts.view' },
      {
        key: 'repair-parts-replenishment', label: 'متابعة التموين', icon: 'local_shipping', path: '/repair/parts-replenishment', permission: 'sparePartsReplenishment.view',
        anyOfPermissions: ['sparePartsReplenishment.view', 'sparePartsReplenishment.create', 'sparePartsReplenishment.receive'],
        badgeSource: badgeSources.pendingSparePartsReplenishmentReceive,
      },
      {
        key: 'repair-spare-issues',
        label: 'سندات صرف قطع الغيار',
        icon: 'assignment_turned_in',
        path: '/repair/spare-issues',
        permission: 'repairSpareIssues.view',
        badgeSource: badgeSources.pendingRepairSpareIssues,
      },
      { key: 'repair-sales-invoice', label: 'فواتير بيع القطع', icon: 'receipt_long', path: '/repair/sales-invoice', permission: 'repair.salesInvoice.create' },
      { key: 'repair-complaints', label: 'الشكاوى', icon: 'report', path: '/repair/complaints', permission: 'repair.complaints.view' },
      {
        key: 'repair-treasury',
        label: 'الخزينة',
        icon: 'account_balance_wallet',
        path: '/repair/treasury',
        permission: 'repair.treasury.view',
        badgeSource: badgeSources.pendingRepairExpenseApprovals,
      },
      { key: 'repair-treasury-report', label: 'تقرير الخزينة', icon: 'bar_chart', path: '/repair/treasury-report', permission: 'repair.treasury.view' },
      { key: 'repair-kpis', label: 'أداء الفنيين', icon: 'leaderboard', path: '/repair/technician-kpis', permission: 'repair.technician.view' },
      { key: 'repair-branches', label: 'الفروع', icon: 'store', path: '/repair/branches', permission: 'repair.branches.manage' },
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
