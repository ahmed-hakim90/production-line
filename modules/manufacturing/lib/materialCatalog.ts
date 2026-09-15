import type { StockItemBalance } from '../../inventory/types';
import type { Material } from '../types';

export type MaterialDataHealth =
  | 'complete'
  | 'inactive'
  | 'missing_category'
  | 'missing_cost'
  | 'missing_barcode'
  | 'missing_min_stock'
  | 'missing_bom';

export type MaterialCatalogRow = Material & {
  dataHealth: MaterialDataHealth[];
  totalOnHand: number;
  totalAvailable: number;
  warehouseCount: number;
  bomItemCount?: number;
};

export const MATERIAL_HEALTH_LABELS: Record<MaterialDataHealth, string> = {
  complete: 'مكتملة',
  inactive: 'موقوفة',
  missing_category: 'بلا فئة',
  missing_cost: 'بلا تكلفة',
  missing_barcode: 'بلا باركود',
  missing_min_stock: 'بلا حد أدنى',
  missing_bom: 'تحتاج BOM',
};

export function materialDataHealth(
  material: Material,
  options: { bomItemCount?: number } = {},
): MaterialDataHealth[] {
  const issues: MaterialDataHealth[] = [];
  if (material.isActive === false) issues.push('inactive');
  if (!String(material.categoryId || '').trim()) issues.push('missing_category');
  if (!material.isManufacturedInternally && Number(material.purchaseCost || 0) <= 0) {
    issues.push('missing_cost');
  }
  if (!String(material.barcode || '').trim()) issues.push('missing_barcode');
  if (Number(material.minStock || 0) <= 0) issues.push('missing_min_stock');
  if (
    material.isManufacturedInternally
    && options.bomItemCount !== undefined
    && options.bomItemCount === 0
  ) {
    issues.push('missing_bom');
  }
  return issues.length > 0 ? issues : ['complete'];
}

export function buildMaterialCatalogRows(
  materials: Material[],
  balances: StockItemBalance[] = [],
  bomCountByMaterialId: ReadonlyMap<string, number> = new Map(),
): MaterialCatalogRow[] {
  const balancesByItem = new Map<string, StockItemBalance[]>();
  for (const balance of balances) {
    const current = balancesByItem.get(balance.itemId) || [];
    current.push(balance);
    balancesByItem.set(balance.itemId, current);
  }
  return materials.map((material) => {
    const id = String(material.id || '');
    const itemBalances = balancesByItem.get(id) || [];
    const bomItemCount = bomCountByMaterialId.get(id);
    return {
      ...material,
      dataHealth: materialDataHealth(material, { bomItemCount }),
      totalOnHand: itemBalances.reduce((sum, row) => sum + Number(row.quantity || 0), 0),
      totalAvailable: itemBalances.reduce(
        (sum, row) => sum + Number(row.availableQty ?? row.quantity ?? 0),
        0,
      ),
      warehouseCount: new Set(itemBalances.map((row) => row.warehouseId)).size,
      bomItemCount,
    };
  });
}

export function materialHasHealth(row: Pick<MaterialCatalogRow, 'dataHealth'>, health: MaterialDataHealth) {
  return row.dataHealth.includes(health);
}
