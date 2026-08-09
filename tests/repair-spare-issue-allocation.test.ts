import assert from 'node:assert/strict';
import {
  allocateRepairSpareIssueFromLocations,
  normalizeRepairSpareIssueAllocations,
} from '../modules/repair/lib/repairSpareIssueAllocation.ts';
import type { StockLocationBalance } from '../modules/inventory/types.ts';

const balances: StockLocationBalance[] = [
  {
    warehouseId: 'wh1',
    locationId: 'loc-b',
    locationCode: 'B-1',
    itemType: 'material',
    itemId: 'm1',
    itemName: 'محرك',
    itemCode: 'M1',
    quantity: 2,
    minStock: 0,
    updatedAt: '2026-01-02T00:00:00.000Z',
    lastMovementAt: '2026-01-02T00:00:00.000Z',
  },
  {
    warehouseId: 'wh1',
    locationId: 'loc-a',
    locationCode: 'A-1',
    itemType: 'material',
    itemId: 'm1',
    itemName: 'محرك',
    itemCode: 'M1',
    quantity: 5,
    minStock: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastMovementAt: '2026-01-01T00:00:00.000Z',
  },
];

{
  const result = allocateRepairSpareIssueFromLocations(balances, 6);
  assert.equal(result.availableQty, 7);
  assert.equal(result.shortageQty, 0);
  assert.equal(result.allocations.length, 2);
  assert.equal(result.allocations[0].locationId, 'loc-a');
  assert.equal(result.allocations[0].quantity, 5);
  assert.equal(result.allocations[1].locationId, 'loc-b');
  assert.equal(result.allocations[1].quantity, 1);
}

{
  const preferred = allocateRepairSpareIssueFromLocations(balances, 3, 'loc-b');
  assert.equal(preferred.allocations[0].locationId, 'loc-b');
  assert.equal(preferred.allocations[0].quantity, 2);
  assert.equal(preferred.allocations[1].locationId, 'loc-a');
  assert.equal(preferred.allocations[1].quantity, 1);
}

{
  const short = allocateRepairSpareIssueFromLocations(balances, 20);
  assert.equal(short.shortageQty, 13);
  assert.equal(short.allocations.reduce((sum, row) => sum + row.quantity, 0), 7);
}

assert.deepEqual(
  normalizeRepairSpareIssueAllocations({
    quantity: 4,
    locationId: 'loc-x',
    locationCode: 'X-1',
  }),
  [{ locationId: 'loc-x', locationCode: 'X-1', quantity: 4 }],
);

assert.deepEqual(
  normalizeRepairSpareIssueAllocations({
    quantity: 5,
    allocations: [
      { locationId: 'a', locationCode: 'A', quantity: 3 },
      { locationId: 'b', locationCode: 'B', quantity: 2 },
    ],
  }).map((row) => row.quantity),
  [3, 2],
);

console.log('repair-spare-issue-allocation.test.ts: ok');
