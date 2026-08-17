import assert from 'node:assert/strict';
import {
  buildVoucherLineLocationOptions,
  getLocationBalanceQty,
  pickPreferredVoucherLocationId,
} from '../modules/inventory/lib/voucherLineLocations.ts';
import type { StockLocationBalance } from '../modules/inventory/types.ts';

const locations = [
  {
    id: 'loc-a',
    warehouseId: 'wh-1',
    code: 'A-01',
    rackName: '1',
    shelfName: '2',
    isActive: true,
  },
  {
    id: 'loc-b',
    warehouseId: 'wh-1',
    code: 'B-02',
    rackName: '2',
    shelfName: '1',
    isActive: true,
  },
  {
    id: 'loc-empty',
    warehouseId: 'wh-1',
    code: 'C-03',
    rackName: '3',
    shelfName: '1',
    isActive: true,
  },
];

const balances: StockLocationBalance[] = [
  {
    warehouseId: 'wh-1',
    locationId: 'loc-a',
    locationCode: 'A-01',
    itemType: 'material',
    itemId: 'item-1',
    itemName: 'صنف',
    itemCode: 'C1',
    quantity: 5,
    minStock: 0,
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    warehouseId: 'wh-1',
    locationId: 'loc-b',
    locationCode: 'B-02',
    itemType: 'material',
    itemId: 'item-1',
    itemName: 'صنف',
    itemCode: 'C1',
    quantity: 12,
    minStock: 0,
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
];

{
  const outOpts = buildVoucherLineLocationOptions({
    locations,
    locationBalances: balances,
    warehouseId: 'wh-1',
    itemId: 'item-1',
    itemType: 'material',
    movementType: 'OUT',
  });
  assert.equal(outOpts.length, 2);
  assert.equal(outOpts[0]?.value, 'loc-b');
  assert.match(outOpts[0]?.label || '', /متاح/);
  assert.ok(!outOpts.some((o) => o.value === 'loc-empty'));
}

{
  const inOptsWithStock = buildVoucherLineLocationOptions({
    locations,
    locationBalances: balances,
    warehouseId: 'wh-1',
    itemId: 'item-1',
    movementType: 'IN',
  });
  assert.equal(inOptsWithStock.length, 2);

  const inOptsFallback = buildVoucherLineLocationOptions({
    locations,
    locationBalances: [],
    warehouseId: 'wh-1',
    itemId: 'brand-new',
    movementType: 'IN',
  });
  assert.equal(inOptsFallback.length, 3);
}

{
  const opts = buildVoucherLineLocationOptions({
    locations,
    locationBalances: balances,
    warehouseId: 'wh-1',
    itemId: 'item-1',
    movementType: 'OUT',
  });
  assert.equal(
    pickPreferredVoucherLocationId({ options: opts, preferredLocationId: 'loc-a' }),
    'loc-a',
  );
  assert.equal(
    pickPreferredVoucherLocationId({ options: opts, preferredLocationId: 'missing' }),
    'loc-b',
  );
}

assert.equal(
  getLocationBalanceQty({
    locationBalances: balances,
    warehouseId: 'wh-1',
    locationId: 'loc-a',
    itemId: 'item-1',
    itemType: 'material',
  }),
  5,
);

console.log('voucher-line-locations.test.ts: ok');
