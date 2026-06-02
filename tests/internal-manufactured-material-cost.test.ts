import assert from 'node:assert/strict';
import type { ProductMaterial } from '../types';
import {
  buildInternalMaterialLinkContext,
  loadLatestManufacturingAverageByProduct,
  pickLatestAvailableAverage,
  resolveProductMaterialCosts,
} from '../modules/costs/services/internalManufacturedMaterialCostService';
import { calculateProductCostBreakdown } from '../utils/productCostBreakdown';

{
  assert.equal(
    pickLatestAvailableAverage([
      { averageUnitCost: 0 },
      { averageUnitCost: 2 },
    ]),
    2,
  );
  assert.equal(pickLatestAvailableAverage([{ averageUnitCost: 0 }]), 0);
}

{
  const map = await loadLatestManufacturingAverageByProduct(
    ['p-child', 'p-missing'],
    async (productId: string) => {
      if (productId === 'p-child') {
        return [{ averageUnitCost: 0 }, { averageUnitCost: 2 }];
      }
      return [];
    },
  );
  assert.equal(map.get('p-child'), 2);
  assert.equal(map.get('p-missing'), 0);
}

{
  const context = buildInternalMaterialLinkContext([
    { id: 'p-child', code: 'INJ-0003', name: 'بودى غطاء' } as any,
  ]);
  const materials: ProductMaterial[] = [
    {
      productId: 'p-parent',
      materialId: 'p-child',
      materialName: 'بودى غطاء',
      quantityUsed: 1,
      unitCost: 10,
    },
    {
      productId: 'p-parent',
      materialId: 'unknown',
      materialName: 'مادة عادية',
      quantityUsed: 2,
      unitCost: 3,
    },
  ];
  const resolved = resolveProductMaterialCosts(
    materials,
    context,
    new Map<string, number>([['p-child', 2]]),
  );
  assert.equal(resolved.total, 18);
  assert.equal(resolved.lines[0].resolvedUnitCost, 12);
  assert.equal(resolved.lines[1].resolvedUnitCost, 3);
}

{
  const product = {
    chineseUnitCost: 0,
    innerBoxCost: 0,
    outerCartonCost: 0,
    unitsPerCarton: 0,
  } as any;
  const materials: ProductMaterial[] = [
    { productId: 'p-parent', materialName: 'مادة', quantityUsed: 1, unitCost: 10 },
  ];
  const withResolver = calculateProductCostBreakdown(
    product,
    materials,
    0,
    () => 12,
  );
  const fallback = calculateProductCostBreakdown(product, materials, 0);
  assert.equal(withResolver.rawMaterialCost, 12);
  assert.equal(fallback.rawMaterialCost, 10);
}

console.log('internal-manufactured-material-cost.test.ts: all assertions passed');
