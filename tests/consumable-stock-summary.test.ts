import assert from 'node:assert/strict';
import { buildConsumableStockSummary } from '../modules/inventory/lib/consumableStockSummary.ts';
import type { StockItemBalance, StockTransaction } from '../modules/inventory/types.ts';

const balances = [
  { warehouseId: 'w1', itemType: 'material', itemId: 'c1', quantity: 7 },
  { warehouseId: 'w2', itemType: 'material', itemId: 'c1', quantity: 4 },
] as StockItemBalance[];
const transactions = [
  { warehouseId: 'w1', itemType: 'material', itemId: 'c1', movementType: 'IN', quantity: 10 },
  { warehouseId: 'w1', itemType: 'material', itemId: 'c1', movementType: 'OUT', quantity: -3 },
  { warehouseId: 'w1', itemType: 'material', itemId: 'c1', movementType: 'ADJUSTMENT', quantity: -2 },
  { warehouseId: 'w2', itemType: 'material', itemId: 'c1', movementType: 'TRANSFER', transferDirection: 'IN', quantity: 4 },
] as StockTransaction[];

const all = buildConsumableStockSummary(balances, transactions).get('c1');
assert.deepEqual(all, { inbound: 14, outbound: 5, available: 11 });

const scoped = buildConsumableStockSummary(balances, transactions, new Set(['w1'])).get('c1');
assert.deepEqual(scoped, { inbound: 10, outbound: 5, available: 7 });

console.log('consumable-stock-summary.test.ts: ok');
