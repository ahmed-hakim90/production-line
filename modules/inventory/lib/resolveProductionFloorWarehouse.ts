import type { Warehouse } from '../types';

const FLOOR_FALLBACK_NAME = 'صالة الإنتاج';

function trimId(value: unknown): string {
  return String(value ?? '').trim();
}

/**
 * Production issue destination is routing.productionFloorWarehouseId.
 * Bound supplies operators only see their own warehouse in catalog lists,
 * so a missing list row is not the same as a missing/inactive floor warehouse.
 */
export function resolveProductionFloorWarehouseForIssue(params: {
  routingFloorWarehouseId: string;
  decomposedWarehouseId?: string;
  loadedWarehouse: Warehouse | null;
}): Warehouse {
  const floorId = trimId(params.routingFloorWarehouseId);
  if (!floorId) {
    throw new Error('حدّد مخزن صالة الإنتاج في توجيه المخازن أولاً.');
  }
  if (floorId === trimId(params.decomposedWarehouseId)) {
    throw new Error('مخزن صالة الإنتاج يجب أن يختلف عن مخزن المفكك.');
  }

  const loaded = params.loadedWarehouse;
  if (loaded?.id && loaded.id === floorId) {
    if (loaded.isActive === false) {
      throw new Error('مخزن صالة الإنتاج غير نشط.');
    }
    return loaded;
  }

  return {
    id: floorId,
    name: FLOOR_FALLBACK_NAME,
    code: '',
    isActive: true,
    warehouseRole: 'production_floor',
    createdAt: '',
  };
}
