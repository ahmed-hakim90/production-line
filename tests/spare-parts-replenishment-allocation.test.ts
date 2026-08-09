import assert from 'node:assert/strict';
import {
  allocateSparePartsReplenishmentFromLocations,
  normalizeSparePartsReplenishmentAllocations,
  scaleSparePartsReplenishmentAllocations,
} from '../modules/inventory/lib/sparePartsReplenishmentAllocation.ts';
import type { StockLocationBalance } from '../modules/inventory/types.ts';

const bal = (
  locationId: string,
  quantity: number,
  updatedAt: string,
): StockLocationBalance => ({
  warehouseId: 'wh1',
  locationId,
  locationCode: locationId,
  itemType: 'material',
  itemId: 'm1',
  itemName: 'Item',
  itemCode: 'M1',
  unit: 'piece',
  quantity,
  minStock: 0,
  updatedAt,
});

{
  const { allocations, availableQty, shortageQty } = allocateSparePartsReplenishmentFromLocations(
    [bal('B', 2, '2026-01-02'), bal('A', 5, '2026-01-01')],
    4,
  );
  assert.equal(availableQty, 7);
  assert.equal(shortageQty, 0);
  assert.equal(allocations.length, 1);
  assert.equal(allocations[0]?.locationId, 'A');
  assert.equal(allocations[0]?.quantity, 4);
}

{
  const { allocations, shortageQty } = allocateSparePartsReplenishmentFromLocations(
    [bal('A', 2, '2026-01-01')],
    5,
  );
  assert.equal(shortageQty, 3);
  assert.equal(allocations[0]?.quantity, 2);
}

assert.deepEqual(
  normalizeSparePartsReplenishmentAllocations({
    requestedQty: 3,
    locationId: 'LOC-1',
    locationCode: 'R1-S2',
  }),
  [{ locationId: 'LOC-1', locationCode: 'R1-S2', quantity: 3 }],
);

assert.deepEqual(
  scaleSparePartsReplenishmentAllocations(
    [
      { locationId: 'A', locationCode: 'A', quantity: 3 },
      { locationId: 'B', locationCode: 'B', quantity: 2 },
    ],
    4,
  ),
  [
    { locationId: 'A', locationCode: 'A', quantity: 3 },
    { locationId: 'B', locationCode: 'B', quantity: 1 },
  ],
);

console.log('spare-parts-replenishment-allocation tests passed');
