import type { WarehouseRole } from '../types';

/**
 * Post-login / inventory-home destination for warehouse operators.
 * Prefer the bound warehouse workspace; materials role falls back to supplies control.
 */
export function resolveWarehouseOperatorHomePath(input: {
  boundWarehouseId?: string | null;
  boundWarehouseRole?: WarehouseRole | null;
  isMaterialsWarehouseRole?: boolean;
}): string {
  const boundId = String(input.boundWarehouseId || '').trim();
  if (boundId) {
    return `/inventory/warehouses/${boundId}`;
  }
  if (input.isMaterialsWarehouseRole) {
    return '/inventory/raw-materials/control';
  }
  return '/inventory';
}

/** Role-specific primary action path inside a warehouse workspace (optional deep link). */
export function resolveWarehouseRolePrimaryPath(
  warehouseId: string,
  role?: WarehouseRole | null,
): string {
  const id = String(warehouseId || '').trim();
  if (!id) return '/inventory';
  switch (role) {
    case 'spare_parts_central':
    case 'maintenance_center':
      return `/inventory/spare-parts-replenishment`;
    case 'raw_material':
    case 'decomposed':
      return '/inventory/raw-materials/control';
    case 'final_product':
      return '/inventory/transfer-approvals';
    case 'production_floor':
      return '/inventory/production-floor';
    default:
      return `/inventory/warehouses/${id}`;
  }
}
