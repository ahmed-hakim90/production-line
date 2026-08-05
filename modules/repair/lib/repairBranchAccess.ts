import type { RepairBranch } from '../types';
import { resolveUserRepairBranchIds, type FirestoreUserWithRepair } from '../types';

/**
 * Resolve the repair branch linked to a bound inventory warehouse
 * (center operators often have inventoryWarehouseId without repairBranchIds).
 */
export function resolveRepairBranchIdForInventoryWarehouse(
  branches: Array<Pick<RepairBranch, 'id' | 'warehouseId'>>,
  inventoryWarehouseId?: string | null,
): string | null {
  const warehouseId = String(inventoryWarehouseId || '').trim();
  if (!warehouseId) return null;
  for (const branch of branches || []) {
    const branchId = String(branch.id || '').trim();
    if (!branchId) continue;
    if (String(branch.warehouseId || '').trim() === warehouseId) return branchId;
  }
  return null;
}

/**
 * Branch IDs the operator may load on spare-parts / branch-scoped repair screens.
 * Combines profile scope, technician assignment ids, and warehouse bind fallback.
 */
export function resolveAccessibleRepairBranchIds(input: {
  user: FirestoreUserWithRepair | null | undefined;
  branches: Array<Pick<RepairBranch, 'id' | 'warehouseId' | 'technicianIds'>>;
  currentEmployeeId?: string | null;
  canViewAllBranches?: boolean;
}): string[] {
  if (input.canViewAllBranches) {
    return (input.branches || [])
      .map((branch) => String(branch.id || '').trim())
      .filter(Boolean);
  }

  const uid = String(input.user?.id || '').trim();
  const eid = String(input.currentEmployeeId || '').trim();
  const fromProfile = resolveUserRepairBranchIds(input.user);
  const fromWarehouse = resolveRepairBranchIdForInventoryWarehouse(
    input.branches,
    input.user?.inventoryWarehouseId,
  );

  const fromTechnicians: string[] = [];
  for (const branch of input.branches || []) {
    const branchId = String(branch.id || '').trim();
    if (!branchId) continue;
    const techIds = branch.technicianIds || [];
    if ((uid && techIds.includes(uid)) || (eid && techIds.includes(eid))) {
      fromTechnicians.push(branchId);
    }
  }

  return Array.from(
    new Set([
      ...fromProfile,
      ...fromTechnicians,
      ...(fromWarehouse ? [fromWarehouse] : []),
    ]),
  );
}
