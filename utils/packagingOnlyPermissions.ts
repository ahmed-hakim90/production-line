/**
 * Packaging-only is derived — not a standalone RBAC flag.
 * Mode = can create packaging reports AND cannot create general production reports.
 */

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
