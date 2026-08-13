import assert from 'node:assert/strict';
import {
  resolveItemLabelCode,
  resolveWarehouseScanLookup,
} from '../modules/inventory/lib/warehouseScanLookup.ts';
import type {
  StockItemBalance,
  StockLocationBalance,
  WarehouseLocation,
} from '../modules/inventory/types.ts';

const balances: StockItemBalance[] = [
  {
    warehouseId: 'wh-1',
    itemType: 'material',
    itemId: 'mat-1',
    itemName: 'قاعدة SK',
    itemCode: 'SP-2477',
    quantity: 12,
    minStock: 2,
    updatedAt: '2026-01-01',
  },
  {
    warehouseId: 'wh-1',
    itemType: 'material',
    itemId: 'mat-2',
    itemName: 'محرك مروحة',
    itemCode: 'SP-1102',
    quantity: 0,
    minStock: 1,
    updatedAt: '2026-01-01',
  },
];

const locations: WarehouseLocation[] = [
  {
    id: 'loc-1',
    warehouseId: 'wh-1',
    rack: 'A1',
    shelf: '1',
    code: 'CENTRAL-A1-1',
    rackName: 'راك A1',
    isActive: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'loc-2',
    warehouseId: 'wh-1',
    rack: 'B2',
    shelf: '3',
    code: 'CENTRAL-B2-3',
    rackName: 'راك B2',
    isActive: true,
    createdAt: '2026-01-01',
  },
];

const locationBalances: StockLocationBalance[] = [
  {
    warehouseId: 'wh-1',
    locationId: 'loc-1',
    locationCode: 'CENTRAL-A1-1',
    itemType: 'material',
    itemId: 'mat-1',
    itemName: 'قاعدة SK',
    itemCode: 'SP-2477',
    quantity: 8,
    minStock: 0,
    updatedAt: '2026-01-01',
  },
  {
    warehouseId: 'wh-1',
    locationId: 'loc-2',
    locationCode: 'CENTRAL-B2-3',
    itemType: 'material',
    itemId: 'mat-1',
    itemName: 'قاعدة SK',
    itemCode: 'SP-2477',
    quantity: 4,
    minStock: 0,
    updatedAt: '2026-01-01',
  },
];

const catalogItems = [
  { id: 'mat-1', code: 'SP-2477', name: 'قاعدة SK', barcode: '6221111111111', itemType: 'material' as const },
  { id: 'mat-3', code: 'SP-9999', name: 'قطعة بدون رصيد', barcode: '6229999999999', itemType: 'material' as const },
];

{
  const empty = resolveWarehouseScanLookup({
    query: '',
    balances,
    locationBalances,
    locations,
    catalogItems,
  });
  assert.equal(empty.status, 'empty');
}

{
  const byLocation = resolveWarehouseScanLookup({
    query: 'CENTRAL-A1-1',
    exact: true,
    balances,
    locationBalances,
    locations,
    catalogItems,
  });
  assert.equal(byLocation.status, 'location');
  if (byLocation.status === 'location') {
    assert.equal(byLocation.hit.locationCode, 'CENTRAL-A1-1');
    assert.equal(byLocation.hit.contents.length, 1);
    assert.equal(byLocation.hit.contents[0]?.itemCode, 'SP-2477');
    assert.equal(byLocation.hit.contents[0]?.quantity, 8);
  }
}

{
  const byItemCode = resolveWarehouseScanLookup({
    query: 'SP-2477',
    exact: true,
    balances,
    locationBalances,
    locations,
    catalogItems,
  });
  assert.equal(byItemCode.status, 'item');
  if (byItemCode.status === 'item') {
    assert.equal(byItemCode.hit.itemId, 'mat-1');
    assert.equal(byItemCode.hit.locations.length, 2);
    assert.equal(byItemCode.hit.barcode, '6221111111111');
  }
}

{
  const byBarcode = resolveWarehouseScanLookup({
    query: '6221111111111',
    exact: true,
    balances,
    locationBalances,
    locations,
    catalogItems,
  });
  assert.equal(byBarcode.status, 'item');
  if (byBarcode.status === 'item') {
    assert.equal(byBarcode.hit.itemCode, 'SP-2477');
  }
}

{
  // Location wins over item when codes collide — location checked first.
  const collidedLocations: WarehouseLocation[] = [
    {
      id: 'loc-x',
      warehouseId: 'wh-1',
      rack: 'X',
      shelf: '1',
      code: 'SP-2477',
      isActive: true,
      createdAt: '2026-01-01',
    },
  ];
  const priority = resolveWarehouseScanLookup({
    query: 'SP-2477',
    exact: true,
    balances,
    locationBalances: [],
    locations: collidedLocations,
    catalogItems,
  });
  assert.equal(priority.status, 'location');
}

{
  const search = resolveWarehouseScanLookup({
    query: 'قاعدة',
    balances,
    locationBalances,
    locations,
    catalogItems,
  });
  assert.equal(search.status, 'matches');
  if (search.status === 'matches') {
    assert.equal(search.items.length, 1);
    assert.equal(search.items[0]?.itemId, 'mat-1');
  }
}

{
  const catalogOnly = resolveWarehouseScanLookup({
    query: 'بدون رصيد',
    balances,
    locationBalances,
    locations,
    catalogItems,
  });
  assert.equal(catalogOnly.status, 'catalog_only');
  if (catalogOnly.status === 'catalog_only') {
    assert.equal(catalogOnly.items[0]?.itemId, 'mat-3');
    assert.equal(catalogOnly.items[0]?.catalogOnly, true);
  }
}

{
  const missing = resolveWarehouseScanLookup({
    query: 'NO-SUCH-CODE',
    exact: true,
    balances,
    locationBalances,
    locations,
    catalogItems,
  });
  assert.equal(missing.status, 'not_found');
}

{
  assert.equal(resolveItemLabelCode({ barcode: '622', itemCode: 'SP-1' }), '622');
  assert.equal(resolveItemLabelCode({ itemCode: 'SP-1' }), 'SP-1');
  assert.equal(resolveItemLabelCode({ code: 'SP-2' }), 'SP-2');
}

console.log('warehouse-scan-lookup.test.ts: ok');
