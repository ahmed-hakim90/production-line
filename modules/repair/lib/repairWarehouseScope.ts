/**
 * Resolve inventory warehouse scope for repair / service-center operators.
 * Prefer explicit inventoryWarehouseId; else warehouses of the user's repair branches.
 */
export function resolveRepairWarehouseScopeIds(input: {
  inventoryWarehouseId?: string | null;
  repairBranchIds: string[];
  branchWarehouseById: Record<string, string | undefined | null>;
}): { scoped: boolean; warehouseIds: string[]; branchIds: string[] } {
  const branchIds = [...new Set(
    (input.repairBranchIds || [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  )];

  const bound = String(input.inventoryWarehouseId || '').trim();
  if (bound) {
    return { scoped: true, warehouseIds: [bound], branchIds };
  }

  const warehouseIds = [...new Set(
    branchIds
      .map((branchId) => String(input.branchWarehouseById[branchId] || '').trim())
      .filter(Boolean),
  )];

  if (warehouseIds.length > 0 || branchIds.length > 0) {
    return { scoped: true, warehouseIds, branchIds };
  }

  return { scoped: false, warehouseIds: [], branchIds: [] };
}

export function isSparePartsWarehouseRole(role: string | null | undefined): boolean {
  return String(role || '').trim() === 'spare_parts';
}
