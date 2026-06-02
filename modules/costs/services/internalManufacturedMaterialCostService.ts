import type { FirestoreProduct, ProductMaterial } from '../../../types';

export type InternalMaterialLinkContext = {
  productIds: Set<string>;
  productIdByCode: Map<string, string>;
  productIdByName: Map<string, string>;
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
  return { productIds, productIdByCode, productIdByName };
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
