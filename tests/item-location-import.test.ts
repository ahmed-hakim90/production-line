import { describe, expect, it } from './assertHarness.ts';
import * as XLSX from 'xlsx';
import {
  parseItemLocationImportSheet,
  type ParseItemLocationImportOptions,
} from '../modules/inventory/lib/itemLocationImport.ts';

function makeBuffer(rows: (string | number)[][], sheetName = 'مواقع الأصناف'): Uint8Array {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

const baseOptions = (): ParseItemLocationImportOptions => ({
  warehouseId: 'wh1',
  warehouseCode: 'WH-01',
  warehouseName: 'المخزن المركزي',
  canMoveStock: true,
  items: [
    { itemId: 'm1', itemCode: 'SP-0001', itemName: 'فلتر', itemType: 'material', unit: 'piece' },
    { itemId: 'm2', itemCode: 'SP-0002', itemName: 'سير', itemType: 'material', unit: 'piece' },
  ],
  locations: [
    { id: 'loc-a', code: 'A1-1', warehouseId: 'wh1', isActive: true },
    { id: 'loc-b', code: 'B-03', warehouseId: 'wh1', isActive: true },
    { id: 'loc-old', code: 'A-02', warehouseId: 'wh1', isActive: true },
    { id: 'loc-off', code: 'Z-99', warehouseId: 'wh1', isActive: false },
    { id: 'loc-other', code: 'C-01', warehouseId: 'wh2', isActive: true },
  ],
  locationBalances: [
    {
      warehouseId: 'wh1',
      itemId: 'm1',
      itemType: 'material',
      locationId: 'loc-old',
      locationCode: 'A-02',
      quantity: 12,
    },
  ],
  defaults: [
    { itemId: 'm1', itemType: 'material', locationId: 'loc-old', locationCode: 'A-02' },
  ],
});

describe('parseItemLocationImportSheet', () => {
  it('rejects import without warehouse', () => {
    const result = parseItemLocationImportSheet(
      makeBuffer([['كود المادة', 'كود اللوكيشن'], ['SP-0001', 'A1-1']]),
      { ...baseOptions(), warehouseId: '' },
    );
    expect(result.errorCount).toBe(1);
    expect(result.rows[0].error?.includes('اختر المخزن')).toBe(true);
  });

  it('plans a transfer from the only other location', () => {
    const result = parseItemLocationImportSheet(
      makeBuffer([['كود المادة', 'كود اللوكيشن'], ['SP-0001', 'A1-1']]),
      baseOptions(),
    );
    expect(result.readyCount).toBe(1);
    expect(result.rows[0].locationId).toBe('loc-a');
    expect(result.rows[0].previousLocationId).toBe('loc-old');
    expect(result.rows[0].transferQty).toBe(12);
  });

  it('requires previous location when stock sits on multiple shelves', () => {
    const options = baseOptions();
    options.locationBalances = [
      {
        warehouseId: 'wh1',
        itemId: 'm1',
        itemType: 'material',
        locationId: 'loc-old',
        locationCode: 'A-02',
        quantity: 5,
      },
      {
        warehouseId: 'wh1',
        itemId: 'm1',
        itemType: 'material',
        locationId: 'loc-b',
        locationCode: 'B-03',
        quantity: 7,
      },
    ];
    const missing = parseItemLocationImportSheet(
      makeBuffer([['كود المادة', 'كود اللوكيشن'], ['SP-0001', 'A1-1']]),
      options,
    );
    expect(missing.errorCount).toBe(1);
    expect(missing.rows[0].error?.includes('أكثر من رف')).toBe(true);

    const withPrevious = parseItemLocationImportSheet(
      makeBuffer([
        ['كود المادة', 'كود اللوكيشن', 'كود اللوكيشن السابق'],
        ['SP-0001', 'A1-1', 'A-02'],
      ]),
      options,
    );
    expect(withPrevious.readyCount).toBe(1);
    expect(withPrevious.rows[0].previousLocationId).toBe('loc-old');
    expect(withPrevious.rows[0].transferQty).toBe(5);
  });

  it('sets default only when item has no location qty', () => {
    const options = baseOptions();
    options.locationBalances = [];
    options.defaults = [];
    const result = parseItemLocationImportSheet(
      makeBuffer([['كود المادة', 'كود اللوكيشن'], ['SP-0002', 'B-03']]),
      options,
    );
    expect(result.readyCount).toBe(1);
    expect(result.rows[0].transferQty).toBeUndefined();
    expect(result.rows[0].locationId).toBe('loc-b');
  });

  it('skips when default is already the new location', () => {
    const options = baseOptions();
    options.locationBalances = [];
    options.defaults = [
      { itemId: 'm2', itemType: 'material', locationId: 'loc-b', locationCode: 'B-03' },
    ];
    const result = parseItemLocationImportSheet(
      makeBuffer([['كود المادة', 'كود اللوكيشن'], ['SP-0002', 'B-03']]),
      options,
    );
    expect(result.skipCount).toBe(1);
    expect(result.readyCount).toBe(0);
  });

  it('rejects unknown item, unknown location, and other-warehouse location', () => {
    const unknownItem = parseItemLocationImportSheet(
      makeBuffer([['كود المادة', 'كود اللوكيشن'], ['XX-9', 'A1-1']]),
      baseOptions(),
    );
    expect(unknownItem.rows[0].error?.includes('غير موجود في أرصدة')).toBe(true);

    const unknownLoc = parseItemLocationImportSheet(
      makeBuffer([['كود المادة', 'كود اللوكيشن'], ['SP-0001', 'NOPE']]),
      baseOptions(),
    );
    expect(unknownLoc.rows[0].error?.includes('غير موجود في هذا المخزن')).toBe(true);

    const otherWh = parseItemLocationImportSheet(
      makeBuffer([['كود المادة', 'كود اللوكيشن'], ['SP-0001', 'C-01']]),
      baseOptions(),
    );
    expect(otherWh.rows[0].error?.includes('غير موجود في هذا المخزن')).toBe(true);
  });

  it('rejects inactive location and stock move without permission', () => {
    const inactive = parseItemLocationImportSheet(
      makeBuffer([['كود المادة', 'كود اللوكيشن'], ['SP-0001', 'Z-99']]),
      baseOptions(),
    );
    expect(inactive.rows[0].error?.includes('موقوف')).toBe(true);

    const noMove = parseItemLocationImportSheet(
      makeBuffer([['كود المادة', 'كود اللوكيشن'], ['SP-0001', 'A1-1']]),
      { ...baseOptions(), canMoveStock: false },
    );
    expect(noMove.rows[0].error?.includes('صلاحية')).toBe(true);
  });

  it('rejects a warehouse column that does not match the selected warehouse', () => {
    const result = parseItemLocationImportSheet(
      makeBuffer([
        ['كود المادة', 'كود اللوكيشن', 'كود المخزن'],
        ['SP-0001', 'A1-1', 'WH-99'],
      ]),
      baseOptions(),
    );
    expect(result.errorCount).toBe(1);
    expect(result.rows[0].error?.includes('لا يطابق المخزن')).toBe(true);
  });
});

console.log('item-location-import tests passed');
