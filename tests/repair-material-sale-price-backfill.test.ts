import assert from 'node:assert/strict';
import { planMaterialSalePriceBackfill } from '../modules/repair/lib/repairMaterialSalePriceBackfill.ts';

{
  const plan = planMaterialSalePriceBackfill({
    materials: [
      { id: 'm1', defaultSalePrice: 0 },
      { id: 'm2', defaultSalePrice: 80 },
      { id: 'm3', defaultSalePrice: undefined },
      { id: 'm4', defaultSalePrice: 0 },
    ],
    parts: [
      { materialId: 'm1', defaultSalePrice: 100 },
      { materialId: 'm1', defaultSalePrice: 140 },
      { materialId: 'm2', defaultSalePrice: 200 },
      { rawMaterialId: 'm3', defaultSalePrice: 55 },
      { materialId: 'm4', defaultSalePrice: 0 },
      { materialId: '', defaultSalePrice: 99 },
    ],
  });

  assert.deepEqual(plan, [
    { materialId: 'm1', nextSalePrice: 140, sourcePartCount: 2 },
    { materialId: 'm3', nextSalePrice: 55, sourcePartCount: 1 },
  ]);
}

{
  const plan = planMaterialSalePriceBackfill({
    materials: [{ id: 'm1', defaultSalePrice: 0 }],
    parts: [],
  });
  assert.equal(plan.length, 0);
}

console.log('repair-material-sale-price-backfill.test.ts: ok');
