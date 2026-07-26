import type { Warehouse } from '../types';
import type { ResolvedInventoryRouting } from '../types';

/**
 * Resolve the operational "مستلزمات / مستلزم إنتاج" warehouse:
 * 1) decomposed warehouse (مفكك) — BOM component stock for production issue
 * 2) raw materials routing — fallback only
 * 3) warehouse role/name heuristics
 */
export function resolveSuppliesWarehouseId(
  routing: Pick<ResolvedInventoryRouting, 'rawMaterialWarehouseId' | 'decomposedWarehouseId'>,
  warehouses: Warehouse[],
): string {
  const decomposed = String(routing.decomposedWarehouseId || '').trim();
  if (decomposed) return decomposed;
  const raw = String(routing.rawMaterialWarehouseId || '').trim();
  if (raw) return raw;

  const byRole =
    warehouses.find((w) => w.warehouseRole === 'decomposed')
    || warehouses.find((w) => w.warehouseRole === 'raw_material');
  if (byRole?.id) return byRole.id;

  const byName = warehouses.find((w) => /مستلزم|مفكك|مواد\s*خام|^خام/i.test(w.name || ''));
  return byName?.id || '';
}
