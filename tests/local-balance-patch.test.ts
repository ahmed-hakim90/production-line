import assert from 'node:assert/strict';
import { applyWarehouseBalanceDeltas } from '../modules/inventory/lib/localBalancePatch.ts';
import type { StockItemBalance } from '../modules/inventory/types.ts';

const base: StockItemBalance[] = [
  {
    warehouseId: 'wh1',
    itemType: 'finished_good',
    itemId: 'p1',
    itemName: 'منتج',
    itemCode: 'P1',
    quantity: 10,
    availableQty: 10,
    minStock: 2,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

{
  const next = applyWarehouseBalanceDeltas(base, [
    { warehouseId: 'wh1', itemType: 'finished_good', itemId: 'p1', delta: -3 },
  ]);
  assert.equal(next[0].quantity, 7);
  assert.equal(next[0].availableQty, 7);
  assert.equal(base[0].quantity, 10, 'original must stay immutable');
}

{
  const next = applyWarehouseBalanceDeltas(base, [
    {
      warehouseId: 'wh1',
      itemType: 'raw_material',
      itemId: 'rm1',
      delta: 5,
      itemName: 'مادة',
      itemCode: 'RM1',
      minStock: 1,
    },
  ]);
  assert.equal(next.length, 2);
  assert.equal(next[1].quantity, 5);
  assert.equal(next[1].itemName, 'مادة');
}

{
  const next = applyWarehouseBalanceDeltas(base, [
    { warehouseId: 'wh1', itemType: 'finished_good', itemId: 'missing', delta: -2 },
  ]);
  assert.equal(next.length, 1, 'do not create negative rows for unknown items');
}

{
  const next = applyWarehouseBalanceDeltas(base, []);
  assert.equal(next, base);
}

console.log('local-balance-patch.test.ts: ok');
