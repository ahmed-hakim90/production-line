import type { RawMaterial } from '../../inventory/types';
import type { BomItem, Material } from '../../manufacturing/types';

export type WasteComponentOption = {
  /**
   * Id used by the waste report picker / save payload.
   * Prefer manufacturing material ids from the BOM; fall back to raw_material
   * ids for legacy product_materials rows that never migrated.
   */
  materialId: string;
  materialName: string;
  quantityUsed: number;
};

type WasteComponentSource = Pick<BomItem, 'itemId' | 'itemType' | 'itemName' | 'qtyPerUnit'>;

/**
 * Resolve a product BOM into component options for the component-waste flow.
 *
 * Shows every active BOM material line. Manufacturing materials are kept even
 * when they have no `legacyRawMaterialId` — stock posting resolves the correct
 * item type (`material` vs `raw_material`) at save time.
 */
export function resolveWasteComponentOptions(input: {
  bomItems: WasteComponentSource[];
  materials: Material[];
  rawMaterials: RawMaterial[];
}): WasteComponentOption[] {
  const rawById = new Map<string, RawMaterial>();
  for (const raw of input.rawMaterials) {
    if (raw.id && raw.isActive !== false) rawById.set(String(raw.id), raw);
  }

  const materialById = new Map<string, Material>();
  for (const material of input.materials) {
    if (material.id) materialById.set(String(material.id), material);
  }

  const options: WasteComponentOption[] = [];
  const seen = new Set<string>();

  for (const item of input.bomItems || []) {
    const itemId = String(item?.itemId || '').trim();
    if (!itemId) continue;

    const material = materialById.get(itemId);
    if (material) {
      if (material.isActive === false) continue;
      if (seen.has(itemId)) continue;
      seen.add(itemId);
      options.push({
        materialId: itemId,
        materialName: material.name || String(item?.itemName || '').trim() || itemId,
        quantityUsed: Number(item?.qtyPerUnit || 0),
      });
      continue;
    }

    const raw = rawById.get(itemId);
    if (!raw?.id) continue;
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    options.push({
      materialId: raw.id,
      materialName: String(item?.itemName || '').trim() || raw.name || raw.id,
      quantityUsed: Number(item?.qtyPerUnit || 0),
    });
  }

  return options;
}

export async function loadWasteComponentOptions(productId: string): Promise<WasteComponentOption[]> {
  const id = String(productId || '').trim();
  if (!id) return [];

  const [{ bomService }, { materialService }, { rawMaterialService }] = await Promise.all([
    import('../../manufacturing/services/bomService'),
    import('../../manufacturing/services/materialService'),
    import('../../inventory/services/rawMaterialService'),
  ]);

  const [{ items }, materials, rawMaterials] = await Promise.all([
    bomService.getActiveBomWithLegacyFallback('product', id),
    materialService.getAll(),
    rawMaterialService.getAll(),
  ]);

  return resolveWasteComponentOptions({ bomItems: items, materials, rawMaterials });
}
