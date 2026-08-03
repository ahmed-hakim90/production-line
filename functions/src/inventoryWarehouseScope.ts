import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Resolve bound warehouse from user doc. Super-admins and empty field = unbound.
 */
export function resolveBoundInventoryWarehouseId(user: {
  inventoryWarehouseId?: string | null;
  isSuperAdmin?: boolean;
}): string | null {
  if (user.isSuperAdmin === true) return null;
  const id = String(user.inventoryWarehouseId || '').trim();
  return id || null;
}

/**
 * Strict: every non-empty warehouse id must equal the bound warehouse.
 * Unbound actors pass.
 */
export function assertActorWarehousesAllowed(
  boundWarehouseId: string | null,
  warehouseIds: Array<string | null | undefined>,
  message = 'هذا الحساب مرتبط بمخزن آخر.',
): void {
  if (!boundWarehouseId) return;
  const ids = [
    ...new Set(
      warehouseIds
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    ),
  ];
  for (const id of ids) {
    if (id !== boundWarehouseId) {
      throw new HttpsError('permission-denied', message);
    }
  }
}

/**
 * Involved: bound warehouse must appear among the touched warehouses.
 * Used for cross-warehouse callables (handover / issue) where Admin SDK
 * may write both sides but the actor must own at least one side.
 */
export function assertActorWarehouseInvolved(
  boundWarehouseId: string | null,
  warehouseIds: Array<string | null | undefined>,
  message = 'هذا الحساب مرتبط بمخزن آخر.',
): void {
  if (!boundWarehouseId) return;
  const ids = [
    ...new Set(
      warehouseIds
        .map((id) => String(id || '').trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0) return;
  if (!ids.includes(boundWarehouseId)) {
    throw new HttpsError('permission-denied', message);
  }
}
