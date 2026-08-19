import type { WarehouseRole } from '../types';

export type TransferCatalogItemType = 'finished_good' | 'raw_material';

const RAW_MATERIAL_WAREHOUSE_ROLES = new Set<string>([
  'raw_material',
  'decomposed',
  'spare_parts_central',
  'maintenance_center',
]);

/**
 * Warehouse-scoped users used to always default to raw materials.
 * That hid finished products for packaging / staging operators (search → «لا نتائج»).
 */
export function defaultTransferItemType(input: {
  queryItemType?: string | null;
  isMaterialsWarehouseRole?: boolean;
  warehouseRole?: WarehouseRole | string | null;
  sparePartsContext?: boolean;
}): TransferCatalogItemType {
  const query = String(input.queryItemType || '').trim();
  if (query === 'raw_material') return 'raw_material';
  if (query === 'finished_good') return 'finished_good';
  if (input.sparePartsContext) return 'raw_material';
  if (input.isMaterialsWarehouseRole) return 'raw_material';
  const role = String(input.warehouseRole || '').trim();
  if (RAW_MATERIAL_WAREHOUSE_ROLES.has(role)) return 'raw_material';
  return 'finished_good';
}

/** Page title for the shared `/inventory/movements` form — never warehouse-role-specific. */
export function inventoryMovementsPageTitle(movementType?: string | null): string {
  const movement = String(movementType || '').trim().toUpperCase();
  if (movement === 'TRANSFER') return 'تحويل مخزون';
  if (movement === 'OUT') return 'إذن منصرف';
  if (movement === 'ADJUSTMENT') return 'تسوية مخزون';
  if (movement === 'IN') return 'إذن إضافة';
  return 'حركة المخزون';
}

export function inventoryMovementsBreadcrumbLabel(search: string): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return inventoryMovementsPageTitle(params.get('movementType'));
}
