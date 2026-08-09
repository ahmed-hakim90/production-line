import type { RawMaterial } from '../../inventory/types';
import type { BomItem, Material, MaterialUnit } from '../../manufacturing/types';
import { MATERIAL_UNIT_LABELS, normalizeLegacyUnit } from '../../manufacturing/types';
import { isMaterialAvailableForSpareParts } from '../../manufacturing/utils/isMaterialAvailableForSpareParts';
import type { ProductMaterial } from '../../../types';

/**
 * Normalized product/material component from shared master data (BOM + materials).
 * Usable by repair, waste, inventory, and future modules — not production-scoped.
 */
export type CatalogComponent = {
  materialId: string;
  materialName: string;
  materialCode?: string;
  /** Arabic (or display) unit label for forms */
  unitLabel: string;
  baseUnit: MaterialUnit;
  purchaseCost?: number;
  categoryName?: string;
  /** Qty per finished unit from the BOM line (when loaded from a product BOM). */
  qtyPerUnit?: number;
  itemType: 'material' | 'legacy_raw';
  sourceProductId?: string;
};

type BomLine = Pick<BomItem, 'itemId' | 'itemType' | 'itemName' | 'qtyPerUnit' | 'unit'>;

function unitLabelFor(unit: string | undefined, fallback?: MaterialUnit): string {
  const base = normalizeLegacyUnit(unit || fallback || 'piece');
  return MATERIAL_UNIT_LABELS[base] || MATERIAL_UNIT_LABELS.piece;
}

/**
 * Resolve BOM lines into catalog components using manufacturing materials,
 * with legacy raw_materials fallback for unmigrated rows.
 */
export function resolveCatalogComponents(input: {
  bomItems: BomLine[];
  materials: Material[];
  rawMaterials: RawMaterial[];
  sourceProductId?: string;
}): CatalogComponent[] {
  const materialById = new Map<string, Material>();
  const materialByLegacyRawId = new Map<string, Material>();
  for (const material of input.materials) {
    if (!material.id) continue;
    materialById.set(String(material.id), material);
    const legacyId = String(material.legacyRawMaterialId || '').trim();
    if (legacyId) materialByLegacyRawId.set(legacyId, material);
  }

  const rawById = new Map<string, RawMaterial>();
  for (const raw of input.rawMaterials) {
    if (raw.id && raw.isActive !== false) rawById.set(String(raw.id), raw);
  }

  const out: CatalogComponent[] = [];
  const seen = new Set<string>();

  for (const item of input.bomItems || []) {
    const itemId = String(item?.itemId || '').trim();
    if (!itemId) continue;
    const qtyPerUnit = Number(item?.qtyPerUnit || 0);

    const fromMaterial =
      materialById.get(itemId) || materialByLegacyRawId.get(itemId) || null;
    if (fromMaterial?.id) {
      if (fromMaterial.isActive === false) continue;
      const id = String(fromMaterial.id);
      if (seen.has(id)) continue;
      seen.add(id);
      const baseUnit = normalizeLegacyUnit(fromMaterial.baseUnit || item.unit);
      out.push({
        materialId: id,
        materialName: fromMaterial.name || String(item.itemName || '').trim() || id,
        materialCode: fromMaterial.code,
        unitLabel: MATERIAL_UNIT_LABELS[baseUnit] || unitLabelFor(item.unit, baseUnit),
        baseUnit,
        purchaseCost: Number(fromMaterial.purchaseCost || 0) || undefined,
        categoryName: fromMaterial.categoryName,
        qtyPerUnit,
        itemType: 'material',
        sourceProductId: input.sourceProductId,
      });
      continue;
    }

    // Legacy BOM / product_materials pointing at raw_materials only
    if (item.itemType === 'product') continue;
    const raw = rawById.get(itemId);
    if (!raw?.id) continue;
    if (seen.has(raw.id)) continue;
    seen.add(raw.id);
    const baseUnit = normalizeLegacyUnit(raw.unit || item.unit);
    out.push({
      materialId: raw.id,
      materialName: String(item.itemName || '').trim() || raw.name || raw.id,
      materialCode: raw.code,
      unitLabel: unitLabelFor(raw.unit || item.unit, baseUnit),
      baseUnit,
      categoryName: raw.categoryName,
      qtyPerUnit,
      itemType: 'legacy_raw',
      sourceProductId: input.sourceProductId,
    });
  }

  return out;
}

/** Map active manufacturing materials into the same component shape (full catalog). */
export function materialsToCatalogComponents(materials: Material[]): CatalogComponent[] {
  const out: CatalogComponent[] = [];
  for (const material of materials) {
    if (!material.id || material.isActive === false) continue;
    const baseUnit = normalizeLegacyUnit(material.baseUnit);
    out.push({
      materialId: String(material.id),
      materialName: material.name,
      materialCode: material.code,
      unitLabel: MATERIAL_UNIT_LABELS[baseUnit] || MATERIAL_UNIT_LABELS.piece,
      baseUnit,
      purchaseCost: Number(material.purchaseCost || 0) || undefined,
      categoryName: material.categoryName,
      itemType: 'material',
    });
  }
  return out.sort((a, b) => a.materialName.localeCompare(b.materialName, 'ar'));
}

/**
 * Adapt catalog components to the legacy ProductMaterial shape used by cost helpers.
 * Prefer new BOM/materials ids; quantity/cost come from the catalog line.
 */
export function catalogComponentsToProductMaterials(
  productId: string,
  components: CatalogComponent[],
): ProductMaterial[] {
  const pid = String(productId || '').trim();
  return components.map((component) => ({
    id: `catalog-${pid}-${component.materialId}`,
    productId: pid,
    materialId: component.materialId,
    materialName: component.materialName,
    quantityUsed: Number(component.qtyPerUnit || 0),
    unitCost: Number(component.purchaseCost || 0),
  }));
}

async function loadCatalogLookups() {
  const [{ bomService }, { materialService }, { rawMaterialService }] = await Promise.all([
    import('../../manufacturing/services/bomService'),
    import('../../manufacturing/services/materialService'),
    import('../../inventory/services/rawMaterialService'),
  ]);
  const [materials, rawMaterials] = await Promise.all([
    materialService.getAll(),
    rawMaterialService.getAll(),
  ]);
  return { bomService, materials, rawMaterials };
}

export async function loadProductComponents(productId: string): Promise<CatalogComponent[]> {
  const id = String(productId || '').trim();
  if (!id) return [];

  const { bomService, materials, rawMaterials } = await loadCatalogLookups();
  const { items } = await bomService.getActiveBomWithLegacyFallback('product', id);
  return resolveCatalogComponents({
    bomItems: items,
    materials,
    rawMaterials,
    sourceProductId: id,
  });
}

/** Union of components across multiple products (deduped by materialId). */
export async function loadProductComponentsForProducts(
  productIds: string[],
): Promise<CatalogComponent[]> {
  const byProduct = await loadProductComponentsByProductIds(productIds);
  const merged = new Map<string, CatalogComponent>();
  for (const list of Object.values(byProduct)) {
    for (const row of list) {
      if (!merged.has(row.materialId)) merged.set(row.materialId, row);
    }
  }
  return Array.from(merged.values()).sort((a, b) =>
    a.materialName.localeCompare(b.materialName, 'ar'),
  );
}

/** Per-product component lists from shared BOM master data (batched lookups). */
export async function loadProductComponentsByProductIds(
  productIds: string[],
): Promise<Record<string, CatalogComponent[]>> {
  const uniqueIds = Array.from(
    new Set(productIds.map((id) => String(id || '').trim()).filter(Boolean)),
  );
  const result: Record<string, CatalogComponent[]> = {};
  if (uniqueIds.length === 0) return result;

  const { bomService, materials, rawMaterials } = await loadCatalogLookups();
  await Promise.all(
    uniqueIds.map(async (id) => {
      const { items } = await bomService.getActiveBomWithLegacyFallback('product', id);
      result[id] = resolveCatalogComponents({
        bomItems: items,
        materials,
        rawMaterials,
        sourceProductId: id,
      });
    }),
  );
  return result;
}

export async function loadProductMaterials(productId: string): Promise<ProductMaterial[]> {
  const id = String(productId || '').trim();
  if (!id) return [];
  const components = await loadProductComponents(id);
  return catalogComponentsToProductMaterials(id, components);
}

export async function loadProductMaterialsByProductIds(
  productIds: string[],
): Promise<Record<string, ProductMaterial[]>> {
  const byProduct = await loadProductComponentsByProductIds(productIds);
  const result: Record<string, ProductMaterial[]> = {};
  for (const [productId, components] of Object.entries(byProduct)) {
    result[productId] = catalogComponentsToProductMaterials(productId, components);
  }
  return result;
}

export async function loadAllCatalogMaterials(): Promise<CatalogComponent[]> {
  const { materialService } = await import('../../manufacturing/services/materialService');
  const materials = await materialService.getAll();
  return materialsToCatalogComponents(materials);
}

/** Active materials allowed to appear as repair spare parts. */
export async function loadSparePartsCatalogMaterials(): Promise<CatalogComponent[]> {
  const { materialService } = await import('../../manufacturing/services/materialService');
  const materials = await materialService.getAll();
  return materialsToCatalogComponents(
    materials.filter((material) => isMaterialAvailableForSpareParts(material)),
  );
}

export function filterCatalogComponentsForSpareParts(
  components: CatalogComponent[],
  materials: Material[],
): CatalogComponent[] {
  const byId = new Map(
    materials.filter((m) => m.id).map((m) => [String(m.id), m] as const),
  );
  return components.filter((component) => {
    if (component.itemType === 'legacy_raw') return true;
    const material = byId.get(component.materialId);
    if (!material) return true;
    return isMaterialAvailableForSpareParts(material);
  });
}
