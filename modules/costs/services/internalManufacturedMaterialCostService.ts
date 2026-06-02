import type { FirestoreProduct, ProductMaterial } from '../../../types';
import type { Material } from '../../manufacturing/types';

export type InternalMaterialLinkContext = {
  productIds: Set<string>;
  productIdByCode: Map<string, string>;
  productIdByName: Map<string, string>;
  materialById: Map<string, Material>;
  materialIdByLegacyRawMaterialId: Map<string, string>;
};

export type ResolvedProductMaterialCostLine = {
  material: ProductMaterial;
  quantityUsed: number;
  baseUnitCost: number;
  linkedProductId: string | null;
  manufacturingAverageUnitCost: number;
  resolvedUnitCost: number;
  lineTotalCost: number;
};

const normalizeToken = (value: string): string => value.trim().toLowerCase();

export function buildInternalMaterialLinkContext(
  products: Array<Pick<FirestoreProduct, 'id' | 'code' | 'name'>>,
  materials: Material[] = [],
): InternalMaterialLinkContext {
  const productIds = new Set<string>();
  const productIdByCode = new Map<string, string>();
  const productIdByName = new Map<string, string>();
  products.forEach((product) => {
    const id = String(product.id || '').trim();
    if (!id) return;
    productIds.add(id);
    const code = String(product.code || '').trim().toUpperCase();
    if (code) productIdByCode.set(code, id);
    const name = normalizeToken(String(product.name || ''));
    if (name) productIdByName.set(name, id);
  });
  const materialById = new Map<string, Material>();
  const materialIdByLegacyRawMaterialId = new Map<string, string>();
  materials.forEach((material) => {
    const id = String(material.id || '').trim();
    if (!id) return;
    materialById.set(id, material);
    const legacyId = String(material.legacyRawMaterialId || '').trim();
    if (legacyId) materialIdByLegacyRawMaterialId.set(legacyId, id);
  });
  return {
    productIds,
    productIdByCode,
    productIdByName,
    materialById,
    materialIdByLegacyRawMaterialId,
  };
}

export function resolveLinkedProductIdForMaterial(
  material: Pick<ProductMaterial, 'materialId' | 'materialName'>,
  context: InternalMaterialLinkContext,
): string | null {
  const rawId = String(material.materialId || '').trim();
  if (rawId && context.productIds.has(rawId)) return rawId;
  const codeToken = rawId.toUpperCase();
  if (codeToken && context.productIdByCode.has(codeToken)) {
    return context.productIdByCode.get(codeToken) || null;
  }
  const materialEntityId = context.materialById.has(rawId)
    ? rawId
    : (context.materialIdByLegacyRawMaterialId.get(rawId) || '');
  const materialEntity = materialEntityId ? context.materialById.get(materialEntityId) : null;
  if (materialEntity?.isManufacturedInternally) {
    const explicitProductId = String(materialEntity.manufacturedProductId || '').trim();
    if (explicitProductId && context.productIds.has(explicitProductId)) return explicitProductId;
    const materialCode = String(materialEntity.code || '').trim().toUpperCase();
    if (materialCode && context.productIdByCode.has(materialCode)) {
      return context.productIdByCode.get(materialCode) || null;
    }
    const materialName = normalizeToken(String(materialEntity.name || ''));
    if (materialName && context.productIdByName.has(materialName)) {
      return context.productIdByName.get(materialName) || null;
    }
  }
  const name = normalizeToken(String(material.materialName || ''));
  if (name && context.productIdByName.has(name)) {
    return context.productIdByName.get(name) || null;
  }
  return null;
}

export async function loadLatestManufacturingAverageByProduct(
  productIds: Iterable<string>,
  getByProduct?: (productId: string) => Promise<Array<{ averageUnitCost?: number }>>,
): Promise<Map<string, number>> {
  const unique = Array.from(new Set(Array.from(productIds).map((id) => String(id || '').trim()).filter(Boolean)));
  if (unique.length === 0) return new Map<string, number>();

  const getter = getByProduct || (async (productId: string) => {
    const mod = await import('./monthlyProductionCostService');
    return mod.monthlyProductionCostService.getByProduct(productId);
  });
  const rows = await Promise.all(
    unique.map(async (productId) => {
      const history = await getter(productId);
      return [productId, pickLatestAvailableAverage(history)] as const;
    }),
  );
  return new Map<string, number>(rows);
}

export function pickLatestAvailableAverage(
  history: Array<{ averageUnitCost?: number }>,
): number {
  const latest = history.find((row) => Number(row.averageUnitCost || 0) > 0);
  return Number(latest?.averageUnitCost || 0);
}

export function resolveProductMaterialCosts(
  materials: ProductMaterial[],
  context: InternalMaterialLinkContext,
  manufacturingAverageByProductId: ReadonlyMap<string, number>,
): { lines: ResolvedProductMaterialCostLine[]; total: number } {
  const lines: ResolvedProductMaterialCostLine[] = materials.map((material) => {
    const quantityUsed = Number(material.quantityUsed || 0);
    const baseUnitCost = Number(material.unitCost || 0);
    const linkedProductId = resolveLinkedProductIdForMaterial(material, context);
    const manufacturingAverageUnitCost = linkedProductId
      ? Number(manufacturingAverageByProductId.get(linkedProductId) || 0)
      : 0;
    const resolvedUnitCost = baseUnitCost + manufacturingAverageUnitCost;
    const lineTotalCost = quantityUsed * resolvedUnitCost;
    return {
      material,
      quantityUsed,
      baseUnitCost,
      linkedProductId,
      manufacturingAverageUnitCost,
      resolvedUnitCost,
      lineTotalCost,
    };
  });
  const total = lines.reduce((sum, line) => sum + Number(line.lineTotalCost || 0), 0);
  return { lines, total };
}
