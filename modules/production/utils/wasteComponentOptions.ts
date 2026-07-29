import type { RawMaterial } from '../../inventory/types';
import type { BomItem, Material } from '../../manufacturing/types';
import { resolveCatalogComponents } from '../../catalog/lib/productComponents';

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

type WasteComponentSource = Pick<BomItem, 'itemId' | 'itemType' | 'itemName' | 'qtyPerUnit' | 'unit'>;

/**
 * Resolve a product BOM into component options for the component-waste flow.
 * Delegates to shared catalog master-data resolution.
 */
export function resolveWasteComponentOptions(input: {
  bomItems: WasteComponentSource[];
  materials: Material[];
  rawMaterials: RawMaterial[];
}): WasteComponentOption[] {
  return resolveCatalogComponents({
    bomItems: input.bomItems,
    materials: input.materials,
    rawMaterials: input.rawMaterials,
  }).map((row) => ({
    materialId: row.materialId,
    materialName: row.materialName,
    quantityUsed: Number(row.qtyPerUnit || 0),
  }));
}

export async function loadWasteComponentOptions(productId: string): Promise<WasteComponentOption[]> {
  const id = String(productId || '').trim();
  if (!id) return [];

  const { loadProductComponents } = await import('../../catalog/lib/productComponents');
  const rows = await loadProductComponents(id);
  return rows.map((row) => ({
    materialId: row.materialId,
    materialName: row.materialName,
    quantityUsed: Number(row.qtyPerUnit || 0),
  }));
}
