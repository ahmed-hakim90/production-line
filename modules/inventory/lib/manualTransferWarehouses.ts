import type { Warehouse, WarehouseRole } from '../types';

/** Repair system warehouses — managed by repair jobs only, not manual inventory transfers. */
export const REPAIR_SYSTEM_WAREHOUSE_ROLES: readonly WarehouseRole[] = [
  'repair_customer_custody',
  'repair_unrepairable',
];

const REPAIR_SYSTEM_ROLE_SET = new Set<string>(REPAIR_SYSTEM_WAREHOUSE_ROLES);

/** Eligible destination/source roles when transferring spare parts between warehouses. */
export const SPARE_PARTS_TRANSFER_WAREHOUSE_ROLES: readonly WarehouseRole[] = [
  'spare_parts_central',
  'maintenance_center',
];

const SPARE_PARTS_TRANSFER_ROLE_SET = new Set<string>(SPARE_PARTS_TRANSFER_WAREHOUSE_ROLES);

export function isRepairSystemWarehouseRole(role?: string | null): boolean {
  return REPAIR_SYSTEM_ROLE_SET.has(String(role || '').trim());
}

export function isSparePartsTransferWarehouseRole(role?: string | null): boolean {
  return SPARE_PARTS_TRANSFER_ROLE_SET.has(String(role || 'general').trim() || 'general');
}

/**
 * Manual inventory transfer selects must never offer repair custody / unrepairable warehouses.
 * When `sparePartsOnly`, only central + maintenance-center spare warehouses are eligible.
 */
export function isEligibleManualTransferWarehouse(
  warehouse: Pick<Warehouse, 'warehouseRole'> | null | undefined,
  options?: { sparePartsOnly?: boolean },
): boolean {
  const role = warehouse?.warehouseRole || 'general';
  if (isRepairSystemWarehouseRole(role)) return false;
  if (options?.sparePartsOnly) return isSparePartsTransferWarehouseRole(role);
  return true;
}

export function filterManualTransferWarehouses<T extends Pick<Warehouse, 'warehouseRole'>>(
  warehouses: T[],
  options?: { sparePartsOnly?: boolean },
): T[] {
  return warehouses.filter((w) => isEligibleManualTransferWarehouse(w, options));
}

export const MANUAL_TRANSFER_REPAIR_WAREHOUSE_ERROR =
  'مخازن عهدة أجهزة العملاء وغير القابل للإصلاح خاصة بوحدة الصيانة ولا تدخل في التحويل اليدوي.';
