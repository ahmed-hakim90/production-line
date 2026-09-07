import { useCallback, useMemo } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import type { Warehouse } from '../types';

/** Generic inventory scope. It deliberately has no warehouse-type or role-name fallback. */
export function useInventoryWarehouseScope() {
  const profile = useAppStore((state) => state.userProfile);
  const warehouseIds = useMemo(() => {
    if (profile?.isSuperAdmin === true) return [];
    const ids = [
      ...(Array.isArray(profile?.inventoryWarehouseIds) ? profile.inventoryWarehouseIds : []),
      profile?.inventoryWarehouseId,
    ].map((id) => String(id || '').trim()).filter(Boolean);
    return [...new Set(ids)];
  }, [profile?.inventoryWarehouseId, profile?.inventoryWarehouseIds, profile?.isSuperAdmin]);
  const scoped = profile?.isSuperAdmin !== true && warehouseIds.length > 0;
  const warehouseId = warehouseIds[0] || '';
  const filterWarehouses = useCallback((rows: Warehouse[]) => {
    if (!scoped) return rows;
    const allowed = new Set(warehouseIds);
    return rows.filter((row) => Boolean(row.id && allowed.has(row.id)));
  }, [scoped, warehouseIds]);
  const isWarehouseAllowed = useCallback((id: string) => !scoped || warehouseIds.includes(String(id || '').trim()), [scoped, warehouseIds]);

  return {
    scoped,
    warehouseId,
    warehouseIds,
    warehouseSelectLocked: scoped && warehouseIds.length === 1,
    filterWarehouses,
    isWarehouseAllowed,
  };
}
