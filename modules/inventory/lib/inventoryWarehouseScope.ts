/**
 * Pure inventory warehouse scope resolution (UI filter + select lock).
 * User-bound warehouse wins over materials_warehouse routing when set.
 */
export function resolveInventoryWarehouseScopeIds(input: {
  inventoryWarehouseId?: string | null;
  isMaterialsWarehouseRole: boolean;
  materialsRoutingWarehouseIds: string[];
}): { scoped: boolean; warehouseIds: string[] } {
  const bound = String(input.inventoryWarehouseId || '').trim();
  if (bound) {
    return { scoped: true, warehouseIds: [bound] };
  }
  if (input.isMaterialsWarehouseRole) {
    const ids = [...new Set(
      (input.materialsRoutingWarehouseIds || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    )];
    return { scoped: true, warehouseIds: ids };
  }
  return { scoped: false, warehouseIds: [] };
}
