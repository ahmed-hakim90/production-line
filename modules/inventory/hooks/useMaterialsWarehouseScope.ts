import { useCallback, useMemo } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { resolveInventoryRoutingV1 } from '../lib/inventoryRoutingResolver';
import type { FirestoreRoleKey } from '../../../types';
import type { Warehouse } from '../types';

const MATERIALS_WAREHOUSE_ROLE_KEY: FirestoreRoleKey = 'materials_warehouse';

function normalizeRoleName(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * True when the signed-in user is the built-in "مسؤول مخزن المستلزمات" role.
 * Scoped to decomposed (مستلزم إنتاج) + raw-materials when configured separately.
 * Fail-closed: missing routing IDs → empty warehouse list (no silent open-all).
 */
export function useMaterialsWarehouseScope() {
  const systemSettings = useAppStore((s) => s.systemSettings);
  const roles = useAppStore((s) => s.roles);
  const userRoleId = useAppStore((s) => s.userRoleId);
  const userRoleName = useAppStore((s) => s.userRoleName);

  const role = useMemo(
    () => roles.find((r) => r.id === userRoleId) || null,
    [roles, userRoleId],
  );

  const scoped = useMemo(() => {
    if (role?.roleKey === MATERIALS_WAREHOUSE_ROLE_KEY) return true;
    return normalizeRoleName(userRoleName) === normalizeRoleName('مسؤول مخزن المستلزمات');
  }, [role?.roleKey, userRoleName]);

  const routing = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);

  /** Allowed warehouses for scoped role: decomposed first, then raw (unique). */
  const warehouseIds = useMemo(() => {
    if (!scoped) return [] as string[];
    const ids = [routing.decomposedWarehouseId, routing.rawMaterialWarehouseId]
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    return [...new Set(ids)];
  }, [scoped, routing.decomposedWarehouseId, routing.rawMaterialWarehouseId]);

  /** Preferred home warehouse (decomposed → raw). */
  const warehouseId = warehouseIds[0] || '';

  /** Scoped role with no routing warehouses configured. */
  const routingConfigured = !scoped || warehouseIds.length > 0;

  /**
   * Lock the warehouse select only when scoped to exactly one warehouse.
   * With two allowed warehouses the operator may pick between them.
   */
  const warehouseSelectLocked = scoped && warehouseIds.length <= 1;

  const filterWarehouses = useCallback(
    (warehouses: Warehouse[]): Warehouse[] => {
      if (!scoped) return warehouses;
      if (warehouseIds.length === 0) return [];
      const allowed = new Set(warehouseIds);
      return warehouses.filter((w) => w.id && allowed.has(w.id));
    },
    [scoped, warehouseIds],
  );

  const isWarehouseAllowed = useCallback(
    (id: string): boolean => {
      const trimmed = String(id || '').trim();
      if (!trimmed) return false;
      if (!scoped) return true;
      if (warehouseIds.length === 0) return false;
      return warehouseIds.includes(trimmed);
    },
    [scoped, warehouseIds],
  );

  /** Keep current selection if allowed; otherwise prefer query → home → first. */
  const resolveScopedWarehouseId = useCallback(
    (currentId: string, preferredIds: string[] = []): string => {
      if (!scoped) {
        return (
          preferredIds.find((id) => Boolean(String(id || '').trim())) ||
          String(currentId || '').trim() ||
          ''
        );
      }
      if (warehouseIds.length === 0) return '';
      if (currentId && warehouseIds.includes(currentId)) return currentId;
      for (const id of preferredIds) {
        const trimmed = String(id || '').trim();
        if (trimmed && warehouseIds.includes(trimmed)) return trimmed;
      }
      return warehouseId;
    },
    [scoped, warehouseId, warehouseIds],
  );

  return {
    scoped,
    warehouseId,
    warehouseIds,
    routingConfigured,
    warehouseSelectLocked,
    roleKey: (role?.roleKey || null) as FirestoreRoleKey | null,
    filterWarehouses,
    isWarehouseAllowed,
    resolveScopedWarehouseId,
    controlPath: '/inventory/raw-materials/control',
    alertsPath: '/inventory/raw-materials/alerts',
    settingsPath: '/settings/production',
  };
}
