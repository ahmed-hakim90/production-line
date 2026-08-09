import assert from 'node:assert/strict';
import {
  defaultItemLocationKey,
  indexDefaultItemLocations,
  resolveManualTransferDestinationLocation,
  resolveManualTransferSourceLocations,
} from '../modules/inventory/lib/manualTransferLocations.ts';
import type { StockLocationBalance } from '../modules/inventory/types.ts';

function run() {
  assert.equal(defaultItemLocationKey('material', 'sp-1'), 'material__sp-1');

  const defaults = indexDefaultItemLocations([
    { itemType: 'material', itemId: 'sp-1', locationId: 'loc-a', locationCode: 'A-1' },
    { itemType: 'material', itemId: 'sp-2', locationId: 'loc-b', locationCode: 'B-2' },
  ]);
  assert.equal(defaults.get('material__sp-1')?.locationCode, 'A-1');

  const destLinked = resolveManualTransferDestinationLocation({
    itemType: 'material',
    itemId: 'sp-1',
    defaultsByKey: defaults,
  });
  assert.deepEqual(destLinked, { toLocationId: 'loc-a', toLocationCode: 'A-1' });

  const destOpen = resolveManualTransferDestinationLocation({
    itemType: 'material',
    itemId: 'missing',
    defaultsByKey: defaults,
  });
  assert.deepEqual(destOpen, {});

  const balances: StockLocationBalance[] = [
    {
      warehouseId: 'wh-1',
      locationId: 'loc-a',
      locationCode: 'A-1',
      itemType: 'material',
      itemId: 'sp-1',
      itemName: 'قطعة',
      itemCode: 'SP-1',
      quantity: 5,
      minStock: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      warehouseId: 'wh-1',
      locationId: 'loc-c',
      locationCode: 'C-3',
      itemType: 'material',
      itemId: 'sp-1',
      itemName: 'قطعة',
      itemCode: 'SP-1',
      quantity: 2,
      minStock: 0,
      updatedAt: '2026-01-02T00:00:00.000Z',
    },
  ];

  const fromDefault = resolveManualTransferSourceLocations({
    itemName: 'قطعة',
    itemType: 'material',
    itemId: 'sp-1',
    quantity: 3,
    warehouseHasLocations: true,
    defaultLocation: defaults.get('material__sp-1'),
    locationBalances: balances,
  });
  assert.equal(fromDefault.ok, true);
  if (fromDefault.ok) {
    assert.equal(fromDefault.slices.length, 1);
    assert.equal(fromDefault.slices[0].locationId, 'loc-a');
    assert.equal(fromDefault.slices[0].quantity, 3);
  }

  const split = resolveManualTransferSourceLocations({
    itemName: 'قطعة',
    itemType: 'material',
    itemId: 'sp-1',
    quantity: 6,
    warehouseHasLocations: true,
    defaultLocation: defaults.get('material__sp-1'),
    locationBalances: balances,
  });
  assert.equal(split.ok, true);
  if (split.ok) {
    assert.equal(split.slices.length, 2);
    assert.equal(split.slices[0].locationId, 'loc-a');
    assert.equal(split.slices[0].quantity, 5);
    assert.equal(split.slices[1].locationId, 'loc-c');
    assert.equal(split.slices[1].quantity, 1);
  }

  const noLocations = resolveManualTransferSourceLocations({
    itemName: 'قطعة',
    itemType: 'material',
    itemId: 'sp-1',
    quantity: 2,
    warehouseHasLocations: false,
    locationBalances: [],
  });
  assert.equal(noLocations.ok, true);
  if (noLocations.ok) {
    assert.equal(noLocations.slices[0].quantity, 2);
    assert.equal(noLocations.slices[0].locationId, undefined);
  }

  const unlinkedNoStock = resolveManualTransferSourceLocations({
    itemName: 'قطعة',
    itemType: 'material',
    itemId: 'sp-x',
    quantity: 1,
    warehouseHasLocations: true,
    locationBalances: balances,
  });
  assert.equal(unlinkedNoStock.ok, false);

  console.log('manual-transfer-locations.test.ts: ok');
}

run();
