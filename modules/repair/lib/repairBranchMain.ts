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

/** Center / legacy RWH warehouse eligible to link to a repair branch. */
export const isRepairCenterWarehouse = (warehouse: {
  warehouseRole?: string | null;
  code?: string | null;
}): boolean => {
  const role = warehouse.warehouseRole || 'general';
  const code = String(warehouse.code || '').trim().toUpperCase();
  return role === 'maintenance_center' || /^RWH-\d{3}$/.test(code);
};
