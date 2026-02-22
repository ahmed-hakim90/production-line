/**
 * Product Cost Breakdown Calculator
 *
 * totalCalculatedCost =
 *   chineseUnitCost
 * + rawMaterialCost            (SUM of materials quantityUsed × unitCost)
 * + innerBoxCost
 * + cartonShare                (outerCartonCost / unitsPerCarton)
 * + productionOverheadShare    (= monthly average production cost, auto-fetched)
 */
import type { FirestoreProduct, ProductMaterial } from '../types';

export interface ProductCostBreakdown {
  chineseUnitCost: number;
  rawMaterialCost: number;
  innerBoxCost: number;
  outerCartonCost: number;
  unitsPerCarton: number;
  cartonShare: number;
  productionOverheadShare: number;
  totalCalculatedCost: number;
}

/**
 * @param monthlyAvgUnitCost — the average unit cost from monthly_production_costs.
 *        This is used as productionOverheadShare automatically.
 */
export function calculateProductCostBreakdown(
  product: FirestoreProduct,
  materials: ProductMaterial[],
  monthlyAvgUnitCost: number = 0
): ProductCostBreakdown {
  const chineseUnitCost = product.chineseUnitCost ?? 0;
  const innerBoxCost = product.innerBoxCost ?? 0;
  const outerCartonCost = product.outerCartonCost ?? 0;
  const unitsPerCarton = product.unitsPerCarton ?? 0;
  const productionOverheadShare = monthlyAvgUnitCost;

  const rawMaterialCost = materials.reduce(
    (sum, m) => sum + (m.quantityUsed || 0) * (m.unitCost || 0),
    0
  );

  const cartonShare = unitsPerCarton > 0 ? outerCartonCost / unitsPerCarton : 0;

  const totalCalculatedCost =
    chineseUnitCost +
    rawMaterialCost +
    innerBoxCost +
    cartonShare +
    productionOverheadShare;

  return {
    chineseUnitCost,
    rawMaterialCost,
    innerBoxCost,
    outerCartonCost,
    unitsPerCarton,
    cartonShare,
    productionOverheadShare,
    totalCalculatedCost,
  };
}
