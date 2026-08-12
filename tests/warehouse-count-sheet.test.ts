import assert from 'node:assert/strict';
import {
  balancesToCountSheetRows,
  buildWarehouseLocationLabelMap,
  resolveWarehouseItemLocation,
} from '../modules/inventory/lib/warehouseCountSheet.ts';
import type { StockItemBalance } from '../modules/inventory/types.ts';

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

console.log('warehouse-count-sheet.test.ts: ok');
