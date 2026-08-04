import { useMemo } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import {
  resolveUserRepairBranchIds,
  type FirestoreUserWithRepair,
  type RepairBranch,
} from '../types';
import { resolveRepairWarehouseScopeIds } from '../lib/repairWarehouseScope';

/**
 * Warehouse/branch scope for repair spare-parts inventory (ADR-004).
 * Pass loaded repair branches from the page; hook resolves allowed warehouse IDs.
 */
export function useRepairWarehouseScope(branches: RepairBranch[]) {
  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;

  const repairBranchIds = useMemo(
    () => resolveUserRepairBranchIds(userProfile),
    [userProfile],
  );

  const branchWarehouseById = useMemo(() => {
    const map: Record<string, string> = {};
    branches.forEach((branch) => {
      const id = String(branch.id || '').trim();
      const warehouseId = String(branch.warehouseId || '').trim();
      if (id && warehouseId) map[id] = warehouseId;
    });
    return map;
  }, [branches]);

  const { scoped, warehouseIds, branchIds } = useMemo(
    () => resolveRepairWarehouseScopeIds({
      inventoryWarehouseId: userProfile?.inventoryWarehouseId,
      repairBranchIds,
      branchWarehouseById,
    }),
    [userProfile?.inventoryWarehouseId, repairBranchIds, branchWarehouseById],
  );

  const warehouseSelectLocked = scoped && warehouseIds.length <= 1;
  const warehouseId = warehouseIds[0] || '';

  const allowedBranchIds = useMemo(() => {
    if (!scoped) return branches.map((b) => String(b.id || '').trim()).filter(Boolean);
    if (branchIds.length > 0) return branchIds;
    // Bound warehouse only: map back to branch(es) that own it.
    if (warehouseIds.length === 0) return [];
    const allowedWh = new Set(warehouseIds);
    return branches
      .filter((b) => allowedWh.has(String(b.warehouseId || '').trim()))
      .map((b) => String(b.id || '').trim())
      .filter(Boolean);
  }, [scoped, branchIds, warehouseIds, branches]);

  return {
    scoped,
    warehouseId,
    warehouseIds,
    branchIds: allowedBranchIds,
    warehouseSelectLocked,
    filterBranches: (rows: RepairBranch[]) => {
      if (!scoped) return rows;
      const allowed = new Set(allowedBranchIds);
      if (allowed.size === 0) return [];
      return rows.filter((b) => b.id && allowed.has(b.id));
    },
    isWarehouseAllowed: (id: string) => {
      const trimmed = String(id || '').trim();
      if (!trimmed) return false;
      if (!scoped) return true;
      if (warehouseIds.length === 0) return false;
      return warehouseIds.includes(trimmed);
    },
  };
}
