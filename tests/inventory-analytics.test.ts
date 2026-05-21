import assert from 'node:assert/strict';
import { classifyAbcInventory, estimateTurnover } from '../modules/inventory/engines/inventoryAnalyticsEngine.ts';
import type { StockItemBalance, StockTransaction } from '../modules/inventory/types.ts';
import { stockUnitCostKey } from '../modules/inventory/lib/stockValuation.ts';

function testAbc() {
  const balances: StockItemBalance[] = [
    {
      id: '1',
      warehouseId: 'w1',
      itemType: 'material',
      itemId: 'm1',
      itemName: 'A',
      itemCode: 'A1',
      quantity: 10,
      minStock: 0,
      updatedAt: '',
    },
    {
      id: '2',
      warehouseId: 'w1',
      itemType: 'material',
      itemId: 'm2',
      itemName: 'B',
      itemCode: 'B1',
      quantity: 1,
      minStock: 0,
      updatedAt: '',
    },
  ];
  const costs = new Map<string, number>([
    [stockUnitCostKey('material', 'm1'), 100],
    [stockUnitCostKey('material', 'm2'), 10],
  ]);
  const rows = classifyAbcInventory(balances, costs);
  assert.equal(rows[0]?.abcClass, 'A');
  assert.ok(rows[0]!.totalValue > rows[1]!.totalValue);
}

function testTurnover() {
  const balances: StockItemBalance[] = [
    {
      id: '1',
      warehouseId: 'w1',
      itemType: 'material',
      itemId: 'm1',
      itemName: 'A',
      quantity: 5,
      minStock: 0,
      updatedAt: '',
    },
  ];
  const txs: StockTransaction[] = [
    {
      id: 't1',
      warehouseId: 'w1',
      itemType: 'material',
      itemId: 'm1',
      itemName: 'A',
      movementType: 'OUT',
      quantity: 10,
      createdAt: '2026-01-01',
      createdBy: 'x',
      sourceModule: 'adjustment',
    },
  ];
  const rows = estimateTurnover(balances, txs);
  assert.equal(rows[0]?.outboundQty, 10);
}

testAbc();
testTurnover();
console.log('inventory-analytics.test.ts: ok');
