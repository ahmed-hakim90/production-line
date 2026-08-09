/**
 * Role-based portal home selection (single SPA).
 * Matches HomeDashboardRouter permission priority.
 */

export type PortalKind =
  | 'admin'
  | 'factory_manager'
  | 'employee'
  | 'warehouse_manager'
  | 'repair'
  | 'repair_technician'
  | 'generic';

export type PortalPermissionChecker = {
  can: (permission: string) => boolean;
  roleKey?: string | null;
  inventoryWarehouseId?: string | null;
};

/** Self-scoped repair tech home — not managers with ops/KPI dashboards. */
export function isRepairTechnicianPortal(checker: PortalPermissionChecker): boolean {
  if (checker.roleKey === 'repair_technician') return true;
  if (!checker.can('repair.jobs.technician')) return false;
  if (checker.can('repair.dashboard.view')) return false;
  if (checker.can('repair.technician.view')) return false;
  return true;
}

function isWarehouseOperatorPortal(checker: PortalPermissionChecker): boolean {
  // Center front-desk / tech stay on repair portals even when bound to a maintenance_center warehouse
  // and granted spare-parts receive/confirm (reception runs the center stock — no separate warehouse role).
  if (checker.roleKey === 'repair_reception' || checker.roleKey === 'repair_technician') {
    return false;
  }
  const boundWarehouse = Boolean(String(checker.inventoryWarehouseId || '').trim());
  const warehouseRoleKey = checker.roleKey === 'materials_warehouse'
    || checker.roleKey === 'inventory_viewer'
    || checker.roleKey === 'spare_parts_central_warehouse'
    || checker.roleKey === 'maintenance_center_warehouse';
  if (warehouseRoleKey) return checker.can('inventory.view') || hasPrivilegedInventoryAccess(checker);
  if (!boundWarehouse) {
    return checker.can('inventory.view') && hasPrivilegedInventoryAccess(checker);
  }
  // Bound warehouse operators (e.g. central spare parts) land on warehouse hub
  // even when employeeDashboard.view is also granted on a custom role.
  return (
    checker.can('inventory.view')
    || hasPrivilegedInventoryAccess(checker)
    || checker.can('sparePartsReplenishment.view')
    || checker.can('sparePartsRecall.view')
  );
}

/** Repair ops / centers-manager home — not factory production dashboards. */
export function isRepairOpsPortal(checker: PortalPermissionChecker): boolean {
  return checker.can('repair.adminDashboard.view') || checker.can('repair.dashboard.view');
}

export function resolvePortalKind(checker: PortalPermissionChecker): PortalKind {
  if (checker.can('adminDashboard.view')) return 'admin';
  if (checker.can('factoryDashboard.view')) return 'factory_manager';

  if (isWarehouseOperatorPortal(checker)) return 'warehouse_manager';

  // Centers manager (`repair.adminDashboard.view`) and reception (`repair.dashboard.view`)
  // must not fall through to the generic factory ops board.
  if (isRepairOpsPortal(checker)) return 'repair';

  if (checker.can('employeeDashboard.view')) return 'employee';

  if (isRepairTechnicianPortal(checker)) return 'repair_technician';

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
