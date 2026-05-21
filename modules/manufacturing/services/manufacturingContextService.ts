import type { ProductMaterial } from '../../../types';
import { productMaterialService } from '../../production/services/productMaterialService';
import { stockService } from '../../inventory/services/stockService';
import type { InventoryItemType } from '../../inventory/types';
import type { BomExplosionContext } from '../engines/bomExplosionEngine';
import { materialService } from './materialService';
import { bomService } from './bomService';
import type { Bom, BomItem, BomOwnerType, Material } from '../types';

export type ManufacturingDataBundle = {
  materials: Material[];
  materialsById: Map<string, Material>;
  bomsByOwner: Map<string, Bom>;
  itemsByBomId: Map<string, BomItem[]>;
  stockByMaterialId: Map<string, { availableQty: number; reservedQty: number }>;
};

const ownerKey = (ownerType: BomOwnerType, ownerId: string) => `${ownerType}:${ownerId}`;

export async function loadManufacturingBundle(): Promise<ManufacturingDataBundle> {
  const [materials, balances] = await Promise.all([
    materialService.getAll(),
    stockService.getBalances(),
  ]);

  const materialsById = new Map<string, Material>();
  const legacyToMaterial = new Map<string, string>();
  for (const m of materials) {
    if (m.id) {
      materialsById.set(m.id, m);
      if (m.legacyRawMaterialId) legacyToMaterial.set(m.legacyRawMaterialId, m.id);
    }
  }

  const stockByMaterialId = new Map<string, { availableQty: number; reservedQty: number }>();
  for (const bal of balances) {
    let materialId: string | undefined;
    if (bal.itemType === 'raw_material') {
      materialId = legacyToMaterial.get(bal.itemId) ?? bal.itemId;
      if (!materialsById.has(materialId) && materialsById.has(bal.itemId)) {
        materialId = bal.itemId;
      }
    }
    if (!materialId) continue;
    const prev = stockByMaterialId.get(materialId) ?? { availableQty: 0, reservedQty: 0 };
    prev.availableQty += Number(bal.quantity || 0);
    stockByMaterialId.set(materialId, prev);
  }

  return {
    materials,
    materialsById,
    bomsByOwner: new Map(),
    itemsByBomId: new Map(),
    stockByMaterialId,
  };
}

export async function buildExplosionContext(
  bundle?: ManufacturingDataBundle,
): Promise<{ ctx: BomExplosionContext; bundle: ManufacturingDataBundle }> {
  const data = bundle ?? (await loadManufacturingBundle());
  const bomsByOwner = new Map<string, Bom>();
  const itemsByBomId = new Map<string, BomItem[]>();

  const ctx: BomExplosionContext = {
    getActiveBom(ownerType, ownerId) {
      const key = ownerKey(ownerType, ownerId);
      if (bomsByOwner.has(key)) return bomsByOwner.get(key);
      return undefined;
    },
    getBomItems(bomId: string) {
      return itemsByBomId.get(bomId) ?? [];
    },
    getMaterial(materialId: string) {
      return data.materialsById.get(materialId) ?? null;
    },
    getMaterialType(materialId: string) {
      return data.materialsById.get(materialId)?.type;
    },
  };

  return { ctx, bundle: data };
}

export async function preloadOwnersForExplosion(
  owners: Array<{ ownerType: BomOwnerType; ownerId: string }>,
  bundle: ManufacturingDataBundle,
): Promise<ManufacturingDataBundle> {
  for (const { ownerType, ownerId } of owners) {
    const key = ownerKey(ownerType, ownerId);
    if (bundle.bomsByOwner.has(key)) continue;
    const { bom, items } = await bomService.getActiveBomWithLegacyFallback(ownerType, ownerId);
    if (bom) {
      bundle.bomsByOwner.set(key, bom);
      if (bom.id) bundle.itemsByBomId.set(bom.id, items);
    }
  }
  return bundle;
}

/** Resolve legacy product_material rows to material ids after migration */
export async function resolveLegacyMaterialId(
  materialId: string | undefined,
  materialName: string,
  bundle: ManufacturingDataBundle,
): Promise<string | null> {
  if (materialId && bundle.materialsById.has(materialId)) return materialId;
  if (materialId) {
    const byLegacy = await materialService.getByLegacyRawMaterialId(materialId);
    if (byLegacy?.id) return byLegacy.id;
  }
  const normalized = materialName.trim().toLowerCase();
  const found = bundle.materials.find(
    (m) => m.name.trim().toLowerCase() === normalized,
  );
  return found?.id ?? null;
}

export function virtualItemsFromProductMaterials(
  productId: string,
  rows: ProductMaterial[],
  bundle: ManufacturingDataBundle,
): BomItem[] {
  return rows.map((row, index) => ({
    bomId: `legacy-${productId}`,
    itemId: row.materialId || row.id || `name-${index}`,
    itemType: 'material' as const,
    itemName: row.materialName,
    qtyPerUnit: Number(row.quantityUsed || 0),
    unit: 'piece',
    directCostPerUnit: Number(row.unitCost || 0),
    indirectCostPerUnit: 0,
    sortOrder: index,
  }));
}
