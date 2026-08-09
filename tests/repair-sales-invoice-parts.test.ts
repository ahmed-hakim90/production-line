import assert from 'node:assert/strict';
import {
  buildRepairSalesInvoicePartOptions,
  parseRepairSalesInvoicePartOptionValue,
} from '../modules/repair/lib/repairSalesInvoicePartOptions';
import {
  buildInventoryMaterialMovements,
  buildPartQuantityDeltas,
  resolveInvoiceStockPath,
  stockItemsBalanceDocId,
} from '../functions/src/repairSalesInvoiceStock';

{
  const options = buildRepairSalesInvoicePartOptions({
    parts: [
      { id: 'p1', name: 'مقاومة', code: 'R1', materialId: 'm1', defaultSalePrice: 10 },
      { id: 'p2', name: 'قطعة قديمة', code: 'LEG', defaultSalePrice: 5 },
    ],
    materials: [
      { id: 'm1', name: 'مقاومة', code: 'MAT-1', defaultSalePrice: 12, isActive: true },
      { id: 'm2', name: 'مكثف', code: 'MAT-2', defaultSalePrice: 20, isActive: true },
      { id: 'm3', name: 'معطل', code: 'MAT-3', defaultSalePrice: 1, isActive: false },
    ],
    warehouseQtyByMaterialId: { m1: 3, m2: 7 },
    legacyQtyByPartId: { p2: 4 },
    formatQty: (n) => String(n),
  });

  assert.equal(options.length, 3);
  const byValue = new Map(options.map((o) => [o.value, o]));
  assert.ok(byValue.has('material:m1'));
  assert.ok(byValue.has('material:m2'));
  assert.ok(byValue.has('part:p2'));
  assert.equal(byValue.get('material:m1')?.availableQty, 3);
  assert.equal(byValue.get('material:m1')?.salePrice, 12);
  assert.equal(byValue.get('material:m2')?.availableQty, 7);
  assert.equal(byValue.get('part:p2')?.availableQty, 4);
  assert.equal(byValue.get('part:p2')?.source, 'legacy_part');
  assert.equal(options.some((o) => o.materialId === 'm3'), false);
}

{
  // Linked catalog part whose material is omitted (e.g. availableForSpareParts=false) must not appear.
  const options = buildRepairSalesInvoicePartOptions({
    parts: [
      { id: 'p-hidden', name: 'استرتش', code: 'CNS', materialId: 'm-hidden', defaultSalePrice: 3 },
      { id: 'p1', name: 'مقاومة', code: 'R1', materialId: 'm1', defaultSalePrice: 10 },
    ],
    materials: [
      { id: 'm1', name: 'مقاومة', code: 'MAT-1', defaultSalePrice: 12, isActive: true },
    ],
    warehouseQtyByMaterialId: { m1: 2, 'm-hidden': 9 },
    legacyQtyByPartId: {},
  });
  assert.equal(options.some((o) => o.materialId === 'm-hidden'), false);
  assert.ok(options.some((o) => o.materialId === 'm1'));
}

{
  const traderOptions = buildRepairSalesInvoicePartOptions({
    parts: [{ id: 'p1', name: 'مقاومة', code: 'R1', materialId: 'm1', defaultSalePrice: 10 }],
    materials: [
      {
        id: 'm1',
        name: 'مقاومة',
        code: 'MAT-1',
        defaultSalePrice: 12,
        traderSalePrice: 9,
        isActive: true,
      },
    ],
    customerType: 'trader',
    warehouseQtyByMaterialId: { m1: 3 },
    legacyQtyByPartId: {},
  });
  assert.equal(traderOptions[0]?.salePrice, 9);

  const consumerOptions = buildRepairSalesInvoicePartOptions({
    parts: [{ id: 'p1', name: 'مقاومة', materialId: 'm1', defaultSalePrice: 10 }],
    materials: [
      { id: 'm1', name: 'مقاومة', defaultSalePrice: 12, traderSalePrice: 9, isActive: true },
    ],
    customerType: 'consumer',
    warehouseQtyByMaterialId: { m1: 3 },
    legacyQtyByPartId: {},
  });
  assert.equal(consumerOptions[0]?.salePrice, 12);
}

{
  assert.deepEqual(parseRepairSalesInvoicePartOptionValue('material:abc'), {
    source: 'material',
    id: 'abc',
  });
  assert.deepEqual(parseRepairSalesInvoicePartOptionValue('part:xyz'), {
    source: 'legacy_part',
    id: 'xyz',
  });
  assert.equal(parseRepairSalesInvoicePartOptionValue('bad'), null);
}

{
  assert.equal(resolveInvoiceStockPath({ materialId: 'm1' }), 'inventory');
  assert.equal(resolveInvoiceStockPath({ rawMaterialId: 'm2' }), 'inventory');
  assert.equal(resolveInvoiceStockPath({}), 'legacy');
  assert.equal(stockItemsBalanceDocId('wh1', 'm1'), 'wh1__material__m1');
}

{
  const oldMap = new Map([['p1', { quantity: 2, partName: 'A' }]]);
  const newMap = new Map([['p1', { quantity: 5, partName: 'A' }]]);
  const deltas = buildPartQuantityDeltas(oldMap, newMap);
  assert.equal(deltas.length, 1);
  assert.equal(deltas[0].delta, -3);

  const movements = buildInventoryMaterialMovements(deltas, new Map([
    ['p1', { materialId: 'm1', partName: 'A' }],
  ]));
  assert.equal(movements.length, 1);
  assert.equal(movements[0].direction, 'OUT');
  assert.equal(movements[0].quantity, 3);
  assert.equal(movements[0].materialId, 'm1');
}

{
  const deltas = buildPartQuantityDeltas(
    new Map([['legacy', { quantity: 0, partName: 'L' }]]),
    new Map([['legacy', { quantity: 2, partName: 'L' }]]),
  );
  const movements = buildInventoryMaterialMovements(deltas, new Map([
    ['legacy', { partName: 'L' }],
  ]));
  assert.equal(movements.length, 0);
}

console.log('repair-sales-invoice-parts: ok');
