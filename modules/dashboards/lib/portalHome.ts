/**
 * Role-based portal home selection (single SPA).
 * Matches HomeDashboardRouter permission priority.
 */

export type PortalKind =
  | 'admin'
  | 'factory_manager'
  | 'employee'
  | 'warehouse_manager'
  | 'generic';

export type PortalPermissionChecker = {
  can: (permission: string) => boolean;
  roleKey?: string | null;
  inventoryWarehouseId?: string | null;
};

export function resolvePortalKind(checker: PortalPermissionChecker): PortalKind {
  if (checker.can('adminDashboard.view')) return 'admin';
  if (checker.can('factoryDashboard.view')) return 'factory_manager';
  if (checker.can('employeeDashboard.view')) return 'employee';

  const boundWarehouse = Boolean(String(checker.inventoryWarehouseId || '').trim());
  const warehouseRoleKey = checker.roleKey === 'materials_warehouse'
    || checker.roleKey === 'inventory_viewer';
  if (
    checker.can('inventory.view')
    && (warehouseRoleKey || boundWarehouse || hasPrivilegedInventoryAccess(checker))
  ) {
    return 'warehouse_manager';
  }

  return 'generic';
}

/** Supervisor day-to-day entry points (curated; one clear path each). */
export const SUPERVISOR_PORTAL_PATHS = {
  quickAction: '/quick-action',
  productionIssueRequests: '/production/issue-requests',
  teamActions: '/production/requests',
  workerEvaluation: '/my-workers/evaluation',
  reports: '/reports',
} as const;

/**
 * Privileged inventory actions — employees/supervisors with only `inventory.view`
 * must not receive these via role seed; menu already gates by permission.
 */
export const PRIVILEGED_INVENTORY_PERMISSIONS = [
  'inventory.items.manage',
  'inventory.transactions.create',
  'inventory.transactions.edit',
  'inventory.counts.manage',
  'inventory.disassembly.manage',
  'productionIssue.approve',
  'productionIssue.print',
] as const;

export function hasPrivilegedInventoryAccess(checker: PortalPermissionChecker): boolean {
  return PRIVILEGED_INVENTORY_PERMISSIONS.some((permission) => checker.can(permission));
}

/** Employee self-service paths (no privileged inventory). */
export const EMPLOYEE_PORTAL_PATHS = {
  home: '/',
  quickAction: '/quick-action',
  selfService: '/hr/self-service',
  leave: '/hr/leave',
} as const;
