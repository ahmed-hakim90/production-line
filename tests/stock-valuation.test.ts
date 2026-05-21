import assert from 'node:assert/strict';
import { estimateStockValue, stockUnitCostKey } from '../modules/inventory/lib/stockValuation';
import type { StockItemBalance } from '../modules/inventory/types';

function run() {
  const balances: StockItemBalance[] = [
    {
      warehouseId: 'w1',
      itemType: 'finished_good',
      itemId: 'p1',
      itemName: 'A',
      itemCode: 'A1',
      quantity: 10,
      minStock: 0,
      updatedAt: new Date().toISOString(),
    },
    {
      warehouseId: 'w1',
      itemType: 'raw_material',
      itemId: 'r1',
      itemName: 'B',
      itemCode: 'B1',
      quantity: 5,
      minStock: 0,
      updatedAt: new Date().toISOString(),
    },
  ];
  const costs = new Map<string, number>([
    [stockUnitCostKey('finished_good', 'p1'), 100],
    [stockUnitCostKey('raw_material', 'r1'), 0],
  ]);
  const result = estimateStockValue(balances, costs);
  assert.equal(result.totalValue, 1000);
  assert.equal(result.valuedLines, 1);
  assert.equal(result.unknownLines, 1);
  console.log('stock-valuation.test.ts: OK');
}

run();
