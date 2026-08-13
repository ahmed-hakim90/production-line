/**
 * Built-in role keys that must never retain certain permissions at runtime,
 * even if an older Firestore role doc still has them set true.
 */
export const BUILTIN_ROLE_PERMISSION_LOCKS: Record<string, readonly string[]> = {
  // Line supervisor: day-to-day ops only — not factory planning / KPI boards.
  supervisor: ['plans.view', 'productionDashboard.view'],
  // Central spare-parts warehouse: stock + replenishment, not manufacturing catalog.
  spare_parts_central_warehouse: [
    'materials.view',
    'materials.manage',
    'products.view',
    'catalog.categories.view',
  ],
  maintenance_center_warehouse: [
    'materials.view',
    'materials.manage',
    'products.view',
    'catalog.categories.view',
  ],
};

export function applyBuiltinRolePermissionLocks(
  permissions: Record<string, boolean> | null | undefined,
  roleKey?: string | null,
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...(permissions ?? {}) };
  const locks = roleKey ? BUILTIN_ROLE_PERMISSION_LOCKS[roleKey] : undefined;
  if (!locks?.length) return next;
  for (const key of locks) {
    next[key] = false;
  }
  return next;
}
