/**
 * Pure helper: when an operator is bound to spare_parts_central, destination
 * maintenance_center warehouses must appear alongside the bound warehouse.
 */
export function warehousesForBoundInventoryOperator(
  bound: { id?: string; warehouseRole?: string; name?: string } | null,
  maintenanceCenters: Array<{ id?: string; warehouseRole?: string; name?: string }>,
): Array<{ id?: string; warehouseRole?: string; name?: string }> {
  if (!bound?.id) return [];
  if (bound.warehouseRole !== 'spare_parts_central') return [bound];
  const centers = maintenanceCenters
    .filter((w) => w.id && w.id !== bound.id && w.warehouseRole === 'maintenance_center')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
  return [bound, ...centers];
}

/** Bound central lists replenishment by source; bound center lists by destination. */
export function replenishmentScopeFieldForBoundRole(
  warehouseRole: string | undefined,
): 'fromWarehouseId' | 'toWarehouseId' {
  return warehouseRole === 'spare_parts_central' ? 'fromWarehouseId' : 'toWarehouseId';
}
