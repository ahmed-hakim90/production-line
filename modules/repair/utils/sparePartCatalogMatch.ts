import type { CatalogComponent } from '../../catalog/lib/productComponents';
import type { RepairSparePart } from '../types';

type SparePartLinkFields = Pick<RepairSparePart, 'id' | 'name' | 'materialId' | 'rawMaterialId'>;

/**
 * Match a branch spare-part row to shared catalog components.
 * Prefer materialId / rawMaterialId; fall back to name for legacy unlinked parts.
 */
export function sparePartMatchesCatalogComponents(
  part: SparePartLinkFields,
  components: CatalogComponent[],
): boolean {
  if (!components.length) return false;

  const materialId = String(part.materialId || '').trim();
  const rawMaterialId = String(part.rawMaterialId || '').trim();
  const partName = String(part.name || '').trim().toLowerCase();

  return components.some((component) => {
    const componentId = String(component.materialId || '').trim();
    if (materialId && componentId && materialId === componentId) return true;
    if (rawMaterialId && componentId && rawMaterialId === componentId) return true;
    const componentName = String(component.materialName || '').trim().toLowerCase();
    if (partName && componentName && partName === componentName) return true;
    return false;
  });
}

export function filterSparePartsByCatalogComponents<T extends SparePartLinkFields>(
  parts: T[],
  components: CatalogComponent[],
): T[] {
  if (!components.length) return [];
  return parts.filter((part) => sparePartMatchesCatalogComponents(part, components));
}

export function collectJobProductIds(input: {
  productId?: string | null;
  jobProducts?: Array<{ productId?: string | null }> | null;
}): string[] {
  const ids = new Set<string>();
  const primary = String(input.productId || '').trim();
  if (primary) ids.add(primary);
  for (const row of input.jobProducts || []) {
    const id = String(row?.productId || '').trim();
    if (id) ids.add(id);
  }
  return Array.from(ids);
}
