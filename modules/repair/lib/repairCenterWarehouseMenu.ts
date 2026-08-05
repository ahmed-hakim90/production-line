import type { Warehouse, WarehouseRole } from '../../inventory/types';
import type { RepairBranch } from '../types';

export type RepairCenterWarehouseNavSource = {
  warehouseId: string;
  warehouseName: string;
  warehouseCode?: string;
  branchId?: string;
  branchName?: string;
};

export function isMaintenanceCenterWarehouseRole(
  role: WarehouseRole | string | null | undefined,
): boolean {
  return (role || 'general') === 'maintenance_center';
}

/**
 * Warehouse IDs that belong to repair center warehouses the user may open from الصيانة.
 * Scoped users: only warehouses linked to their repair branches (plus optional inventory bind).
 * Branch managers / all-branches: every warehouse linked to any repair branch.
 */
export function resolveRepairCenterWarehouseIds(input: {
  branches: Array<Pick<RepairBranch, 'id' | 'warehouseId'>>;
  canViewAllBranches: boolean;
  userBranchIds: readonly string[];
  /** Fallback when the user is inventory-bound to a center warehouse without repairBranchIds. */
  inventoryWarehouseId?: string | null;
}): string[] {
  const branchRows = input.branches || [];
  const allowedBranchIds = input.canViewAllBranches
    ? branchRows.map((b) => String(b.id || '').trim()).filter(Boolean)
    : (input.userBranchIds || []).map((id) => String(id || '').trim()).filter(Boolean);

  const allowed = new Set(allowedBranchIds);
  const warehouseIds = new Set<string>();

  for (const branch of branchRows) {
    const branchId = String(branch.id || '').trim();
    const warehouseId = String(branch.warehouseId || '').trim();
    if (!branchId || !warehouseId) continue;
    if (!allowed.has(branchId)) continue;
    warehouseIds.add(warehouseId);
  }

  const bound = String(input.inventoryWarehouseId || '').trim();
  if (bound && !input.canViewAllBranches && warehouseIds.size === 0) {
    warehouseIds.add(bound);
  }

  return Array.from(warehouseIds);
}

export function buildRepairCenterWarehouseNavSources(input: {
  warehouses: Array<Pick<Warehouse, 'id' | 'name' | 'warehouseRole'> & { code?: string }>;
  branches: Array<Pick<RepairBranch, 'id' | 'name' | 'warehouseId'>>;
  allowedWarehouseIds: readonly string[];
}): RepairCenterWarehouseNavSource[] {
  const allowed = new Set(
    (input.allowedWarehouseIds || []).map((id) => String(id || '').trim()).filter(Boolean),
  );
  if (allowed.size === 0) return [];

  const branchByWarehouseId = new Map<string, { id: string; name: string }>();
  for (const branch of input.branches || []) {
    const warehouseId = String(branch.warehouseId || '').trim();
    const branchId = String(branch.id || '').trim();
    if (!warehouseId || !branchId || !allowed.has(warehouseId)) continue;
    if (!branchByWarehouseId.has(warehouseId)) {
      branchByWarehouseId.set(warehouseId, {
        id: branchId,
        name: String(branch.name || '').trim() || branchId,
      });
    }
  }

  const out: RepairCenterWarehouseNavSource[] = [];
  for (const warehouse of input.warehouses || []) {
    const warehouseId = String(warehouse.id || '').trim();
    if (!warehouseId || !allowed.has(warehouseId)) continue;
    if (!isMaintenanceCenterWarehouseRole(warehouse.warehouseRole)) continue;
    const branch = branchByWarehouseId.get(warehouseId);
    out.push({
      warehouseId,
      warehouseName: String(warehouse.name || '').trim() || warehouseId,
      warehouseCode: warehouse.code,
      branchId: branch?.id,
      branchName: branch?.name,
    });
  }

  out.sort((a, b) => a.warehouseName.localeCompare(b.warehouseName, 'ar'));
  return out;
}

export function repairCenterWarehouseMenuPath(warehouseId: string): string {
  return `/repair/warehouses/${encodeURIComponent(String(warehouseId || '').trim())}`;
}
