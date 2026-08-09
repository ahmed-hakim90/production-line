import type { WarehouseRole } from '../types';

/** Warehouse-scoped inventory sidebar visibility (allowlist by warehouseRole). */

/**
 * When the user is warehouse-scoped, inventory menu is an allowlist:
 * only keys listed for their accessible warehouse role(s) stay visible.
 * Unscoped admins keep the full permission-filtered menu.
 */
const SCOPED_SHARED_MENU_KEYS = [
  'inv-dashboard',
  'inv-warehouses',
  'inv-balances',
  'inv-item-card',
  'inv-transactions',
  'inv-locations',
  'inv-counts',
  'inv-department-consumables',
] as const;

const MENU_KEYS_BY_WAREHOUSE_ROLE: Record<WarehouseRole, readonly string[]> = {
  raw_material: [
    ...SCOPED_SHARED_MENU_KEYS,
    'inv-raw-control',
    'inv-raw-alerts',
    'inv-production-issues',
    'inv-disassembly',
  ],
  decomposed: [
    ...SCOPED_SHARED_MENU_KEYS,
    'inv-raw-control',
    'inv-raw-alerts',
    'inv-production-issues',
    'inv-disassembly',
  ],
  production_floor: [
    ...SCOPED_SHARED_MENU_KEYS,
    'inv-production-floor',
    'inv-production-issues',
    'inv-production-component-records',
  ],
  production_wip: [
    ...SCOPED_SHARED_MENU_KEYS,
    'inv-transfer-approvals',
  ],
  finished_staging: [
    ...SCOPED_SHARED_MENU_KEYS,
    'inv-transfer-approvals',
    'inv-production-approvals',
  ],
  final_product: [
    ...SCOPED_SHARED_MENU_KEYS,
    'inv-transfer-approvals',
    'inv-production-approvals',
  ],
  packaging: [
    ...SCOPED_SHARED_MENU_KEYS,
    'inv-transfer-approvals',
  ],
  waste: [...SCOPED_SHARED_MENU_KEYS],
  spare_parts_central: [
    'inv-dashboard',
    'inv-balances',
    'inv-item-card',
    'inv-transactions',
    'inv-locations',
    'inv-counts',
    'inv-spare-parts-replenishment',
    'inv-spare-parts-in',
    'inv-spare-parts-center-stock',
    'inv-spare-parts-recall',
  ],
  maintenance_center: [
    ...SCOPED_SHARED_MENU_KEYS,
    'inv-spare-parts-recall',
  ],
  repair_customer_custody: [...SCOPED_SHARED_MENU_KEYS],
  repair_unrepairable: [...SCOPED_SHARED_MENU_KEYS],
  general: [...SCOPED_SHARED_MENU_KEYS],
};

const MATERIALS_SCOPE_ROLES: readonly WarehouseRole[] = ['raw_material', 'decomposed'];

/** Spare-parts warehouses (central + maintenance centers) never run factory production flows. */
const SPARE_PARTS_SCOPE_ROLES: readonly WarehouseRole[] = [
  'spare_parts_central',
  'maintenance_center',
];

export function resolveAccessibleWarehouseRoles(input: {
  warehouseRoles: readonly (WarehouseRole | undefined | null)[];
  isMaterialsWarehouseRole?: boolean;
}): WarehouseRole[] {
  const fromWarehouses = [
    ...new Set(
      (input.warehouseRoles || [])
        .map((role) => (role || 'general') as WarehouseRole)
        .filter(Boolean),
    ),
  ];
  if (fromWarehouses.length > 0) return fromWarehouses;
  if (input.isMaterialsWarehouseRole) return [...MATERIALS_SCOPE_ROLES];
  return [];
}

function allowedMenuKeysForRoles(roles: readonly WarehouseRole[]): Set<string> {
  const allowed = new Set<string>();
  for (const role of roles) {
    const keys = MENU_KEYS_BY_WAREHOUSE_ROLE[role] || MENU_KEYS_BY_WAREHOUSE_ROLE.general;
    for (const key of keys) allowed.add(key);
  }
  return allowed;
}

export function isInventoryMenuItemVisibleForWarehouseScope(input: {
  menuKey: string;
  scoped: boolean;
  accessibleWarehouseRoles: readonly WarehouseRole[];
}): boolean {
  const key = String(input.menuKey || '').trim();
  if (!key) return true;
  // Dynamic per-warehouse shortcuts injected by the sidebar.
  if (key.startsWith('inv-wh-space-')) return true;
  // Maintenance-center warehouse shortcuts live under الصيانة, not inventory scope.
  if (key.startsWith('repair-wh-space-')) return true;
  if (!input.scoped) return true;

  const roles = input.accessibleWarehouseRoles || [];
  if (roles.length === 0) return false;

  return allowedMenuKeysForRoles(roles).has(key);
}

/**
 * Factory-only production screens (e.g. «تحكم التغليف») are reachable with plain `inventory.view`,
 * which spare-parts operators also hold. Hide them from spare-parts-scoped warehouses.
 */
export function isFactoryProductionMenuVisibleForWarehouseScope(input: {
  accessibleWarehouseRoles: readonly (WarehouseRole | string)[];
  warehouseScoped: boolean;
}): boolean {
  if (!input.warehouseScoped) return true;
  const roles = (input.accessibleWarehouseRoles || []).map(
    (role) => (role || 'general') as WarehouseRole,
  );
  if (roles.length === 0) return true;
  return !roles.every((role) => SPARE_PARTS_SCOPE_ROLES.includes(role));
}

/**
 * «متابعة تموين القطع» is for maintenance centers.
 * Hide it from spare-parts-central-only operators (they use central replenishment).
 */
export function isRepairPartsReplenishmentMenuVisible(input: {
  accessibleWarehouseRoles: readonly (WarehouseRole | string)[];
  warehouseScoped: boolean;
  userRepairBranchIds: readonly string[];
  canViewAllBranches: boolean;
}): boolean {
  if (input.canViewAllBranches) return true;
  if ((input.userRepairBranchIds || []).some((id) => Boolean(String(id || '').trim()))) {
    return true;
  }
  const roles = (input.accessibleWarehouseRoles || []).map(
    (role) => (role || 'general') as WarehouseRole,
  );
  if (roles.includes('maintenance_center')) return true;

  if (
    input.warehouseScoped
    && roles.length > 0
    && roles.every((role) => role === 'spare_parts_central')
  ) {
    return false;
  }

  return true;
}

/** Hide center-only repair stock screens from central spare-parts operators. */
export function isRepairCenterPartsMenuVisible(input: {
  accessibleWarehouseRoles: readonly (WarehouseRole | string)[];
  warehouseScoped: boolean;
  userRepairBranchIds: readonly string[];
  canViewAllBranches: boolean;
}): boolean {
  if (input.canViewAllBranches) return true;
  if ((input.userRepairBranchIds || []).some((id) => Boolean(String(id || '').trim()))) {
    return true;
  }
  const roles = (input.accessibleWarehouseRoles || []).map(
    (role) => (role || 'general') as WarehouseRole,
  );
  if (roles.includes('maintenance_center')) return true;
  if (
    input.warehouseScoped
    && roles.length > 0
    && roles.every((role) => role === 'spare_parts_central')
  ) {
    return false;
  }
  return true;
}

/**
 * «تأكيد سحب للرئيسي» under الصيانة is for maintenance centers.
 * Central operators use inventory «سحب من المراكز» instead.
 */
export function isRepairSparePartsRecallMenuVisible(input: {
  accessibleWarehouseRoles: readonly (WarehouseRole | string)[];
  warehouseScoped: boolean;
  userRepairBranchIds: readonly string[];
  canViewAllBranches: boolean;
}): boolean {
  return isRepairPartsReplenishmentMenuVisible(input);
}
