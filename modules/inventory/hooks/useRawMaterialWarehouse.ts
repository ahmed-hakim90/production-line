import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { resolveInventoryRoutingV1 } from '../lib/inventoryRoutingResolver';
import { resolveSuppliesWarehouseId } from '../lib/resolveSuppliesWarehouse';
import { warehouseService } from '../services/warehouseService';
import type { Warehouse } from '../types';

/**
 * Operational "مخزن المستلزمات" — prefers decomposed, falls back to raw.
 * When both routing slots are set and distinct, the operator can switch between them.
 * User `inventoryWarehouseId` overrides to a single locked warehouse.
 */
export function useRawMaterialWarehouse() {
  const systemSettings = useAppStore((s) => s.systemSettings);
  const inventoryWarehouseId = useAppStore((s) => s.userProfile?.inventoryWarehouseId);
  const routing = useMemo(() => resolveInventoryRoutingV1(systemSettings), [systemSettings]);
  const boundWarehouseId = String(inventoryWarehouseId || '').trim();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadingWarehouse, setLoadingWarehouse] = useState(true);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadingWarehouse(true);
    void warehouseService
      .getAllWarehouses()
      .then((rows) => {
        if (cancelled) return;
        setWarehouses(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setWarehouses([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingWarehouse(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const configuredIds = useMemo(() => {
    const ids = [routing.decomposedWarehouseId, routing.rawMaterialWarehouseId]
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    return [...new Set(ids)];
  }, [routing.decomposedWarehouseId, routing.rawMaterialWarehouseId]);

  const defaultWarehouseId = useMemo(() => {
    if (boundWarehouseId) return boundWarehouseId;
    return resolveSuppliesWarehouseId(routing, warehouses);
  }, [boundWarehouseId, routing, warehouses]);

  const allowedWarehouses = useMemo(() => {
    if (boundWarehouseId) {
      const wh = warehouses.find((w) => w.id === boundWarehouseId);
      return wh ? [wh] : [];
    }
    if (configuredIds.length === 0) {
      return defaultWarehouseId
        ? warehouses.filter((w) => w.id === defaultWarehouseId)
        : [];
    }
    const byId = new Map(warehouses.map((w) => [w.id || '', w]));
    return configuredIds.map((id) => byId.get(id)).filter((w): w is Warehouse => Boolean(w?.id));
  }, [boundWarehouseId, configuredIds, warehouses, defaultWarehouseId]);

  const canSwitchWarehouse = !boundWarehouseId && allowedWarehouses.length > 1;

  useEffect(() => {
    if (!defaultWarehouseId && !selectedWarehouseId) return;
    const allowed = new Set(allowedWarehouses.map((w) => w.id || ''));
    if (selectedWarehouseId && allowed.has(selectedWarehouseId)) return;
    if (defaultWarehouseId && (allowed.size === 0 || allowed.has(defaultWarehouseId))) {
      setSelectedWarehouseId(defaultWarehouseId);
      return;
    }
    if (allowedWarehouses[0]?.id) {
      setSelectedWarehouseId(allowedWarehouses[0].id!);
    }
  }, [allowedWarehouses, defaultWarehouseId, selectedWarehouseId]);

  const warehouseId = selectedWarehouseId || defaultWarehouseId;
  const warehouse = useMemo(
    () => warehouses.find((w) => w.id === warehouseId) || null,
    [warehouses, warehouseId],
  );

  const setWarehouseId = useCallback(
    (nextId: string) => {
      const trimmed = String(nextId || '').trim();
      if (!trimmed) return;
      if (boundWarehouseId) return;
      if (configuredIds.length > 0 && !configuredIds.includes(trimmed)) return;
      setSelectedWarehouseId(trimmed);
    },
    [boundWarehouseId, configuredIds],
  );

  return {
    routing,
    warehouseId,
    setWarehouseId,
    warehouse,
    warehouseName: warehouse?.name || warehouseId || '',
    configured: Boolean(warehouseId),
    loadingWarehouse,
    allowedWarehouses,
    canSwitchWarehouse,
    configuredIds,
  };
}
