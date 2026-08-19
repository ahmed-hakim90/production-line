/**
 * Packaging-only is derived — not a standalone RBAC flag.
 * Mode = can create packaging reports AND cannot create general production reports.
 *
 * Firestore role `permissions` should enable ONLY the keys in
 * `PACKAGING_OPERATOR_FIRESTORE_PERMISSIONS`. Extra keys are stripped at runtime
 * so a copied warehouse/spare-parts role cannot open unrelated screens.
 */

/** Keys to set `true` on the packaging operator role document. Do not set `reports.create`. */
export const PACKAGING_OPERATOR_FIRESTORE_PERMISSIONS = [
  'employeeDashboard.view',
  'quickAction.view',
  'reports.view',
  'reports.packaging.create',
  'productionHandover.approve',
  'inventory.view',
  'inventory.transactions.create',
] as const;

const PACKAGING_OPERATOR_KEEP = new Set<string>([
  ...PACKAGING_OPERATOR_FIRESTORE_PERMISSIONS,
  'print',
  'export',
  'inventory.transactions.print',
  'inventory.transfers.approve',
]);

/** Sidebar / command-palette allowlist while packaging-only. */
export const PACKAGING_ONLY_MENU_KEYS = new Set<string>([
  'packaging-control',
  'quick',
  'reports',
  'inv-balances',
  'inv-fg-transfer',
]);

export function canCreatePackagingReportsFromMap(
  permissions: Record<string, boolean> | null | undefined,
): boolean {
  const perms = permissions ?? {};
  if (perms['reports.create'] === true) return true;
  if (perms['reports.packaging.create'] === true) return true;
  // Legacy restrictive flag still meant the user could create packaging reports.
  if (perms['reports.packaging.only'] === true) return true;
  return false;
}

export function isPackagingOnlyPermissions(
  permissions: Record<string, boolean> | null | undefined,
): boolean {
  const perms = permissions ?? {};
  const canGeneralCreate = perms['reports.create'] === true;
  const canPackaging =
    perms['reports.packaging.create'] === true
    || perms['reports.packaging.only'] === true;
  return canPackaging && !canGeneralCreate;
}

export function isPackagingOnlyMenuItemVisible(menuKey: string, packagingOnly: boolean): boolean {
  if (!packagingOnly) return true;
  const key = String(menuKey || '').trim();
  if (!key) return false;
  if (key.startsWith('inv-wh-space-')) return true;
  return PACKAGING_ONLY_MENU_KEYS.has(key);
}

/**
 * Strip keys that are not part of packaging work. Explicit `false` also blocks
 * permission aliases (e.g. `inventory.view` → analytics / consumables).
 */
export function applyPackagingOnlyPermissionLocks(
  permissions: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...(permissions ?? {}) };
  if (!isPackagingOnlyPermissions(next)) return next;
  for (const key of Object.keys(next)) {
    if (next[key] === true && !PACKAGING_OPERATOR_KEEP.has(key)) {
      next[key] = false;
    }
  }
  return next;
}

/**
 * Migrate legacy `reports.packaging.only` into `reports.packaging.create`
 * and drop the restrictive flag so it cannot lock admins / full creators.
 */
export function normalizeRolePermissions(
  permissions: Record<string, boolean> | null | undefined,
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...(permissions ?? {}) };
  if (next['reports.packaging.only'] === true) {
    next['reports.packaging.create'] = true;
  }
  if ('reports.packaging.only' in next) {
    delete next['reports.packaging.only'];
  }
  return next;
}
