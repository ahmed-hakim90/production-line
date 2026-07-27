import type { Material } from '../../manufacturing/types';
import type { InventoryItemType, RawMaterial, StockItemBalance } from '../types';

export type ComponentCatalogOption = {
  id: string;
  name: string;
  code: string;
  minStock: number;
  unitsPerCarton: number;
  /** Primary identity used for new IN postings. */
  stockItemType: 'material' | 'raw_material';
  /** Balance aliases (material id + legacy raw id). */
  stockKeys: Array<{ itemType: 'material' | 'raw_material'; itemId: string }>;
};

function normalizeCode(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

/**
 * Prefer manufacturing materials (product BOM components); append legacy raws
 * that are not already covered by code or legacyRawMaterialId.
 */
export function buildComponentCatalogOptions(
  materials: Material[],
  rawMaterials: RawMaterial[],
): ComponentCatalogOption[] {
  const materialOpts: ComponentCatalogOption[] = materials
    .filter((m) => m.id && m.isActive !== false)
    .map((m) => {
      const id = m.id!;
      const legacyId = String(m.legacyRawMaterialId || '').trim();
      const keys: ComponentCatalogOption['stockKeys'] = [{ itemType: 'material', itemId: id }];
      if (legacyId && legacyId !== id) {
        keys.push({ itemType: 'raw_material', itemId: legacyId });
        keys.push({ itemType: 'material', itemId: legacyId });
      }
      keys.push({ itemType: 'raw_material', itemId: id });
      return {
        id,
        name: m.name,
        code: m.code,
        minStock: Number(m.minStock || 0),
        unitsPerCarton: 0,
        stockItemType: 'material' as const,
        stockKeys: keys,
      };
    });

  const coveredCodes = new Set(materialOpts.map((o) => normalizeCode(o.code)).filter(Boolean));
  const coveredLegacyIds = new Set(
    materials
      .map((m) => String(m.legacyRawMaterialId || '').trim())
      .filter(Boolean),
  );
  const coveredMaterialIds = new Set(materialOpts.map((o) => o.id));

  const rawOpts: ComponentCatalogOption[] = rawMaterials
    .filter((m) => {
      if (!m.id || m.isActive === false) return false;
      if (coveredMaterialIds.has(m.id) || coveredLegacyIds.has(m.id)) return false;
      if (normalizeCode(m.code) && coveredCodes.has(normalizeCode(m.code))) return false;
      return true;
    })
    .map((m) => ({
      id: m.id!,
      name: m.name,
      code: m.code,
      minStock: Number(m.minStock || 0),
      unitsPerCarton: 0,
      stockItemType: 'raw_material' as const,
      stockKeys: [
        { itemType: 'raw_material' as const, itemId: m.id! },
        { itemType: 'material' as const, itemId: m.id! },
      ],
    }));

  return [...materialOpts, ...rawOpts].sort((a, b) =>
    a.name.localeCompare(b.name, 'ar'),
  );
}

export function getComponentAvailableQty(
  balances: StockItemBalance[],
  warehouseId: string,
  option: Pick<ComponentCatalogOption, 'stockKeys'>,
): number {
  if (!warehouseId) return 0;
  let total = 0;
  const seen = new Set<string>();
  for (const key of option.stockKeys) {
    const token = `${key.itemType}__${key.itemId}`;
    if (seen.has(token)) continue;
    seen.add(token);
    for (const row of balances) {
      if (
        row.warehouseId === warehouseId &&
        row.itemType === key.itemType &&
        row.itemId === key.itemId
      ) {
        total += Number(row.quantity || 0);
      }
    }
  }
  return total;
}

/**
 * Choose which stock identity to post against.
 * IN → always primary. OUT/TRANSFER/ADJUSTMENT → key with the most available qty.
 */
export function resolveComponentStockIdentity(
  option: ComponentCatalogOption,
  balances: StockItemBalance[],
  warehouseId: string,
  movementType: 'IN' | 'OUT' | 'TRANSFER' | 'ADJUSTMENT',
): { itemType: InventoryItemType; itemId: string; available: number } {
  if (movementType === 'IN') {
    return {
      itemType: option.stockItemType,
      itemId: option.id,
      available: getComponentAvailableQty(balances, warehouseId, option),
    };
  }

  let best = {
    itemType: option.stockItemType as InventoryItemType,
    itemId: option.id,
    available: 0,
  };
  const seen = new Set<string>();
  for (const key of option.stockKeys) {
    const token = `${key.itemType}__${key.itemId}`;
    if (seen.has(token)) continue;
    seen.add(token);
    const row = balances.find(
      (b) =>
        b.warehouseId === warehouseId &&
        b.itemType === key.itemType &&
        b.itemId === key.itemId,
    );
    const available = Number(row?.quantity || 0);
    if (available > best.available) {
      best = { itemType: key.itemType, itemId: key.itemId, available };
    }
  }
  if (best.available <= 0) {
    return {
      itemType: option.stockItemType,
      itemId: option.id,
      available: 0,
    };
  }
  return best;
}
