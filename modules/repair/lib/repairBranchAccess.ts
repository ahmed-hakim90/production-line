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
 * Combines profile scope, technician assignment, warehouse bind, and branch manager.
 */
export function resolveAccessibleRepairBranchIds(input: {
  user: FirestoreUserWithRepair | null | undefined;
  branches: Array<Pick<RepairBranch, 'id' | 'warehouseId' | 'technicianIds' | 'managerEmployeeId'>>;
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

  const fromAssignments: string[] = [];
  for (const branch of input.branches || []) {
    const branchId = String(branch.id || '').trim();
    if (!branchId) continue;
    const techIds = branch.technicianIds || [];
    if ((uid && techIds.includes(uid)) || (eid && techIds.includes(eid))) {
      fromAssignments.push(branchId);
      continue;
    }
    if (eid && String(branch.managerEmployeeId || '').trim() === eid) {
      fromAssignments.push(branchId);
    }
  }

  return Array.from(
    new Set([
      ...fromProfile,
      ...fromAssignments,
      ...(fromWarehouse ? [fromWarehouse] : []),
    ]),
  );
}

/** Chunk size for Firestore `in` filters (hard limit 30; keep 10 for older indexes). */
export const REPAIR_BRANCH_IN_QUERY_CHUNK = 10;

export function chunkIdsForInQuery(ids: string[], chunkSize = REPAIR_BRANCH_IN_QUERY_CHUNK): string[][] {
  const normalized = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
  if (normalized.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < normalized.length; i += chunkSize) {
    chunks.push(normalized.slice(i, i + chunkSize));
  }
  return chunks;
}
