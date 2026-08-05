import type { WarehouseRole } from '../types';
import { repairCenterWarehouseMenuPath } from '../../repair/lib/repairCenterWarehouseMenu';

/**
 * Post-login / inventory-home destination for warehouse operators.
 * Prefer the bound warehouse workspace; materials role falls back to supplies control.
 * Maintenance-center warehouses open under الصيانة.
 */
export function resolveWarehouseOperatorHomePath(input: {
  boundWarehouseId?: string | null;
  boundWarehouseRole?: WarehouseRole | null;
  isMaterialsWarehouseRole?: boolean;
}): string {
  const boundId = String(input.boundWarehouseId || '').trim();
  if (boundId) {
    const role = input.boundWarehouseRole || 'general';
    if (role === 'maintenance_center') {
      return repairCenterWarehouseMenuPath(boundId);
    }
    if (role === 'spare_parts_central') {
      return `/inventory/warehouses/${boundId}`;
    }
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
      return `/inventory/warehouses/${id}`;
    case 'maintenance_center':
      return '/repair/parts-replenishment';
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
