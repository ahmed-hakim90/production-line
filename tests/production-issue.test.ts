import assert from 'node:assert/strict';
import { allocateProductionIssueFromLocations } from '../modules/inventory/lib/productionIssueAllocation';
import type { StockLocationBalance } from '../modules/inventory/types';

const rows: StockLocationBalance[] = [
  {
    id: 'late',
    warehouseId: 'w1',
    locationId: 'loc-b',
    locationCode: 'W1-B-01',
    itemType: 'material',
    itemId: 'm1',
    itemName: 'M1',
    itemCode: 'M1',
    quantity: 7,
    minStock: 0,
    updatedAt: '2026-01-02T00:00:00.000Z',
    lastMovementAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: 'early',
    warehouseId: 'w1',
    locationId: 'loc-a',
    locationCode: 'W1-A-01',
    itemType: 'material',
    itemId: 'm1',
    itemName: 'M1',
    itemCode: 'M1',
    quantity: 5,
    minStock: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastMovementAt: '2026-01-01T00:00:00.000Z',
  },
];

const ok = allocateProductionIssueFromLocations(rows, 8);
assert.equal(ok.availableQty, 12);
assert.equal(ok.shortageQty, 0);
assert.deepEqual(
  ok.allocations.map((row) => ({ locationCode: row.locationCode, quantity: row.quantity })),
  [
    { locationCode: 'W1-A-01', quantity: 5 },
    { locationCode: 'W1-B-01', quantity: 3 },
  ],
);

const shortage = allocateProductionIssueFromLocations(rows, 20);
assert.equal(shortage.availableQty, 12);
assert.equal(shortage.shortageQty, 8);

const preferred = allocateProductionIssueFromLocations(rows, 8, 'loc-b');
assert.deepEqual(
  preferred.allocations.map((row) => ({ locationCode: row.locationCode, quantity: row.quantity })),
  [
    { locationCode: 'W1-B-01', quantity: 7 },
    { locationCode: 'W1-A-01', quantity: 1 },
  ],
);

console.log('production-issue.test.ts: OK');
