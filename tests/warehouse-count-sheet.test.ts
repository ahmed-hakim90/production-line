import assert from 'node:assert/strict';
import {
  balancesToCountSheetRows,
  buildCountSheetRowsForScope,
  buildWarehouseLocationLabelMap,
  locationBelongsToRack,
  locationMatchesShelf,
  resolveWarehouseItemLocation,
} from '../modules/inventory/lib/warehouseCountSheet.ts';
import type {
  StockItemBalance,
  StockLocationBalance,
  WarehouseLocation,
} from '../modules/inventory/types.ts';

const rows: StockItemBalance[] = [
  {
    warehouseId: 'wh-1',
    itemType: 'raw_material',
    itemId: 'b',
    itemName: 'بلاستيك',
    itemCode: 'RM-2',
    quantity: 10,
    minStock: 0,
    updatedAt: '2026-01-01',
  },
  {
    warehouseId: 'wh-1',
    itemType: 'material',
    itemId: 'a',
    itemName: 'قاعدة',
    itemCode: 'SP-1',
    quantity: 3,
    minStock: 0,
    updatedAt: '2026-01-01',
  },
];

const locations = new Map([
  ['wh-1__material__a', 'A-1'],
  ['wh-1__raw_material__b', 'B-2'],
]);

const sheet = balancesToCountSheetRows(rows, locations);
assert.equal(sheet.length, 2);
assert.equal(sheet[0]?.location, 'A-1');
assert.equal(sheet[0]?.name, 'قاعدة');
assert.equal(sheet[1]?.code, 'RM-2');
assert.equal(balancesToCountSheetRows(rows)[0]?.location, '—');

{
  const map = buildWarehouseLocationLabelMap({
    warehouseId: 'wh-1',
    locationBalances: [
      { warehouseId: 'wh-1', itemType: 'material', itemId: 'a', locationCode: 'B-9', quantity: 2 },
      { warehouseId: 'wh-1', itemType: 'material', itemId: 'a', locationCode: 'B-10', quantity: 1 },
      { warehouseId: 'wh-1', itemType: 'material', itemId: 'z', locationCode: 'C-1', quantity: 0 },
    ],
    defaults: [
      { warehouseId: 'wh-1', itemType: 'material', itemId: 'a', locationCode: 'A-1' },
    ],
  });
  assert.equal(map.get('wh-1__material__a'), 'A-1');
  assert.equal(map.get('a'), 'A-1');
  assert.equal(map.has('z'), false);
  assert.equal(
    resolveWarehouseItemLocation(map, { warehouseId: 'wh-1', itemType: 'raw_material', itemId: 'a' }),
    'A-1',
  );
}

const rackA = { id: 'rack-a', code: 'R1', name: 'راك 1' };
const shelves: WarehouseLocation[] = [
  {
    id: 'loc-1',
    warehouseId: 'wh-1',
    rackId: 'rack-a',
    rack: 'R1',
    rackCode: 'R1',
    rackName: 'راك 1',
    shelf: 'S1',
    shelfName: 'رف 1',
    code: 'WH-R1-S1',
    isActive: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'loc-2',
    warehouseId: 'wh-1',
    rackId: 'rack-a',
    rack: 'R1',
    rackCode: 'R1',
    rackName: 'راك 1',
    shelf: 'S2',
    shelfName: 'رف 2',
    code: 'WH-R1-S2',
    isActive: true,
    createdAt: '2026-01-01',
  },
];
const locationBalances: StockLocationBalance[] = [
  {
    warehouseId: 'wh-1',
    locationId: 'loc-1',
    locationCode: 'WH-R1-S1',
    rackId: 'rack-a',
    rackCode: 'R1',
    rackName: 'راك 1',
    itemType: 'material',
    itemId: 'a',
    itemName: 'قاعدة',
    itemCode: 'SP-1',
    quantity: 3,
    minStock: 0,
    updatedAt: '2026-01-01',
  },
];

assert.equal(locationBelongsToRack(shelves[0]!, rackA), true);
assert.equal(locationBelongsToRack({ rackCode: 'R1' } as WarehouseLocation, rackA), true);
assert.equal(locationMatchesShelf(locationBalances[0]!, shelves[0]!), true);
assert.equal(locationMatchesShelf(locationBalances[0]!, shelves[1]!), false);

{
  const warehouse = buildCountSheetRowsForScope({
    scope: 'warehouse',
    itemBalances: rows,
    locationLabelMap: locations,
  });
  assert.equal(warehouse.scopeLabel, 'المخزن كله');
  assert.equal(warehouse.rows.length, 2);
  assert.equal(warehouse.rows[0]?.location, 'A-1');
}

{
  const rackSheet = buildCountSheetRowsForScope({
    scope: 'rack',
    itemBalances: rows,
    locationBalances,
    locations: shelves,
    rack: rackA,
  });
  assert.match(rackSheet.scopeLabel, /راك 1/);
  assert.equal(rackSheet.rows.length, 2);
  assert.equal(rackSheet.rows[0]?.name, 'قاعدة');
  assert.equal(rackSheet.rows[0]?.location, 'WH-R1-S1');
  assert.equal(rackSheet.rows[1]?.name, '—');
  assert.equal(rackSheet.rows[1]?.quantity, 0);
  assert.equal(rackSheet.rows[1]?.location, 'WH-R1-S2');
}

{
  const emptyShelf = buildCountSheetRowsForScope({
    scope: 'shelf',
    itemBalances: [],
    locationBalances,
    locations: shelves,
    shelf: shelves[1],
  });
  assert.match(emptyShelf.scopeLabel, /WH-R1-S2/);
  assert.equal(emptyShelf.rows.length, 1);
  assert.equal(emptyShelf.rows[0]?.code, '—');
  assert.equal(emptyShelf.rows[0]?.quantity, 0);
}

{
  const filledShelf = buildCountSheetRowsForScope({
    scope: 'shelf',
    itemBalances: [],
    locationBalances,
    locations: shelves,
    shelf: shelves[0],
  });
  assert.equal(filledShelf.rows.length, 1);
  assert.equal(filledShelf.rows[0]?.code, 'SP-1');
}

{
  const extras = buildCountSheetRowsForScope({
    scope: 'rack',
    itemBalances: [],
    locations: shelves,
    rack: rackA,
    locationBalances: [
      ...locationBalances,
      {
        warehouseId: 'wh-1',
        locationId: 'orphan',
        locationCode: 'WH-R1-ORPHAN',
        rackId: 'rack-a',
        rackCode: 'R1',
        itemType: 'material',
        itemId: 'x',
        itemName: 'يتيم',
        itemCode: 'OR-1',
        quantity: 1,
        minStock: 0,
        updatedAt: '2026-01-01',
      },
    ],
  });
  assert.equal(extras.rows.some((row) => row.code === 'OR-1'), true);
}

console.log('warehouse-count-sheet.test.ts: ok');
