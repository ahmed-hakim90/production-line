import { doc, getDoc } from 'firebase/firestore';
import { auth, db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';

export type InventoryWarehouseReadScope = {
  boundWarehouseId: string | null;
  warehouseId: string | null;
  denied: boolean;
};

/**
 * Reads the server-authorized warehouse bind from the signed-in user's document.
 * Firestore rules remain authoritative; this helper only makes list queries rule-compatible.
 */
export async function getCurrentBoundInventoryWarehouseId(): Promise<string | null> {
  const uid = auth?.currentUser?.uid;
  if (!isConfigured || !uid) return null;

  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;

  const user = snap.data() as {
    tenantId?: unknown;
    inventoryWarehouseId?: unknown;
    isSuperAdmin?: unknown;
  };
  if (user.isSuperAdmin === true) return null;

  const tenantId = getCurrentTenantId();
  if (tenantId && String(user.tenantId || '') !== tenantId) {
    throw new Error('تعذر التحقق من نطاق المخزن للحساب الحالي.');
  }

  const warehouseId = String(user.inventoryWarehouseId || '').trim();
  return warehouseId || null;
}

export async function resolveInventoryWarehouseReadScope(
  requestedWarehouseId?: string | null,
): Promise<InventoryWarehouseReadScope> {
  const requested = String(requestedWarehouseId || '').trim();
  const boundWarehouseId = await getCurrentBoundInventoryWarehouseId();
  if (!boundWarehouseId) {
    return {
      boundWarehouseId: null,
      warehouseId: requested || null,
      denied: false,
    };
  }

  if (requested && requested !== boundWarehouseId) {
    return {
      boundWarehouseId,
      warehouseId: null,
      denied: true,
    };
  }

  return {
    boundWarehouseId,
    warehouseId: boundWarehouseId,
    denied: false,
  };
}
