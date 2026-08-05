import { normalizeRepairSalePrice } from '../utils/sparePartPricing';

export type MaterialSalePriceBackfillPlanItem = {
  materialId: string;
  nextSalePrice: number;
  sourcePartCount: number;
};

/**
 * For materials without a company sale price, copy the max positive
 * defaultSalePrice from linked branch catalog parts (legacy per-branch prices).
 * Never overwrites an existing Material.defaultSalePrice > 0.
 */
export function planMaterialSalePriceBackfill(input: {
  materials: Array<{ id?: string; defaultSalePrice?: number | null }>;
  parts: Array<{
    materialId?: string | null;
    rawMaterialId?: string | null;
    defaultSalePrice?: number | null;
  }>;
}): MaterialSalePriceBackfillPlanItem[] {
  const maxPartSaleByMaterial = new Map<string, { price: number; count: number }>();
  for (const part of input.parts) {
    const materialId = String(part.materialId || part.rawMaterialId || '').trim();
    if (!materialId) continue;
    const sale = normalizeRepairSalePrice(part.defaultSalePrice);
    if (!(sale > 0)) continue;
    const prev = maxPartSaleByMaterial.get(materialId);
    if (!prev) {
      maxPartSaleByMaterial.set(materialId, { price: sale, count: 1 });
      continue;
    }
    prev.count += 1;
    if (sale > prev.price) prev.price = sale;
  }

  const plans: MaterialSalePriceBackfillPlanItem[] = [];
  for (const material of input.materials) {
    const materialId = String(material.id || '').trim();
    if (!materialId) continue;
    if (normalizeRepairSalePrice(material.defaultSalePrice) > 0) continue;
    const fromParts = maxPartSaleByMaterial.get(materialId);
    if (!fromParts || !(fromParts.price > 0)) continue;
    plans.push({
      materialId,
      nextSalePrice: fromParts.price,
      sourcePartCount: fromParts.count,
    });
  }
  return plans.sort((a, b) => a.materialId.localeCompare(b.materialId));
}
