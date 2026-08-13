/**
 * Pure helpers for repair branch main-flag uniqueness.
 */
export function otherMainBranchIds(
  branches: Array<{ id?: string; isMain?: boolean }>,
  exceptId?: string | null,
): string[] {
  const except = String(exceptId || '').trim();
  return branches
    .filter((branch) => {
      const id = String(branch.id || '').trim();
      if (!id || !branch.isMain) return false;
      if (except && id === except) return false;
      return true;
    })
    .map((branch) => String(branch.id));
}

export const repairMaintenanceWarehouseName = (branchName: string): string =>
  `مخزن صيانة - ${String(branchName || '').trim() || 'فرع'}`;

/** Legacy sales-style names that should follow the repair-center pattern. */
export const isLegacyRepairWarehouseName = (name: string): boolean =>
  /^مخزن\s*فرع(?:\s|$)/u.test(String(name || '').trim());

/**
 * Rename linked center warehouses from «مخزن فرع …» to «مخزن صيانة - {اسم الفرع}».
 * Leaves already-correct and custom names untouched.
 */
export function plannedRepairCenterWarehouseRename(input: {
  warehouseName?: string | null;
  branchName: string;
}): string | null {
  const branchName = String(input.branchName || '').trim();
  if (!branchName) return null;
  const target = repairMaintenanceWarehouseName(branchName);
  const current = String(input.warehouseName || '').trim();
  if (current === target) return null;
  if (!current || isLegacyRepairWarehouseName(current)) return target;
  return null;
}

/** Center / legacy RWH warehouse eligible to link to a repair branch. */
export const isRepairCenterWarehouse = (warehouse: {
  warehouseRole?: string | null;
  code?: string | null;
}): boolean => {
  const role = warehouse.warehouseRole || 'general';
  const code = String(warehouse.code || '').trim().toUpperCase();
  return role === 'maintenance_center' || /^RWH-\d{3}$/.test(code);
};
