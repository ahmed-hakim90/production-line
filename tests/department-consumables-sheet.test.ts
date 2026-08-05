import assert from 'node:assert/strict';
import { parseDepartmentConsumablesSheetFromBuffer } from '../utils/importDepartmentConsumablesSheet.ts';
import * as XLSX from 'xlsx';

function toBuffer(rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'sheet');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
}

const materials = [
  { id: 'm1', code: 'CNS-1', name: 'قفازات', unit: 'piece', purchaseCost: 2 },
];
const warehouses = [
  { id: 'w1', code: 'WH1', name: 'مخزن أ' },
];
const locations: Array<{ id: string; code: string; warehouseId: string; isActive?: boolean }> = [];
const balances = [
  { warehouseId: 'w1', itemId: 'm1', quantity: 10 },
];

{
  const buf = toBuffer([
    {
      'كود الصنف': 'CNS-1',
      'كود المخزن': 'WH1',
      الرصيد: 15,
      'سعر الوحدة': 3.5,
    },
  ]);
  const result = parseDepartmentConsumablesSheetFromBuffer(buf, {
    materials,
    warehouses,
    locations,
    balances,
  });
  assert.equal(result.validCount, 1);
  assert.equal(result.rows[0].qtyDelta, 5);
  assert.equal(result.rows[0].willUpdatePrice, true);
  assert.equal(result.rows[0].targetPrice, 3.5);
  assert.equal(result.rows[0].willCreateItem, false);
}

{
  const buf = toBuffer([
    {
      'كود الصنف': 'CNS-1',
      'كود المخزن': 'WH1',
      الرصيد: 10,
      'سعر الوحدة': 2,
    },
  ]);
  const result = parseDepartmentConsumablesSheetFromBuffer(buf, {
    materials,
    warehouses,
    locations,
    balances,
  });
  assert.equal(result.validCount, 0);
  assert.match(result.rows[0].errors.join(' '), /لا تغيير/);
}

{
  const buf = toBuffer([
    {
      'كود الصنف': 'CNS-1',
      'كود المخزن': 'WH1',
      الرصيد: 8,
    },
  ]);
  const result = parseDepartmentConsumablesSheetFromBuffer(buf, {
    materials,
    warehouses,
    locations,
    balances,
    allowedWarehouseIds: ['other'],
  });
  assert.equal(result.validCount, 0);
  assert.match(result.rows[0].errors.join(' '), /نطاق/);
}

{
  // New items by name only — auto-generate codes and mark willCreateItem.
  const buf = toBuffer([
    {
      'اسم الصنف': 'بنطه مفك كبيره',
      'اسم المخزن': 'مخزن أ',
      الرصيد: 208,
    },
    {
      'اسم الصنف': 'بنطه مفك وسط',
      'اسم المخزن': 'مخزن أ',
      الرصيد: 224,
    },
    {
      // Same name twice should share one generated code.
      'اسم الصنف': 'بنطه مفك كبيره',
      'كود المخزن': 'WH1',
      الرصيد: 10,
    },
  ]);
  const result = parseDepartmentConsumablesSheetFromBuffer(buf, {
    materials,
    warehouses,
    locations,
    balances,
  });
  assert.equal(result.fileErrors.length, 0);
  assert.equal(result.validCount, 3);
  assert.equal(result.createCount, 3);
  assert.equal(result.rows[0].willCreateItem, true);
  assert.ok(result.rows[0].itemCode, 'expected generated item code');
  assert.equal(result.rows[0].itemName, 'بنطه مفك كبيره');
  assert.equal(result.rows[0].qtyDelta, 208);
  assert.equal(result.rows[1].willCreateItem, true);
  assert.notEqual(result.rows[0].itemCode, result.rows[1].itemCode);
  assert.equal(result.rows[0].itemCode, result.rows[2].itemCode);
}

{
  // Short Arabic header «الصنف» maps to item name and creates new items.
  const buf = toBuffer([
    {
      الصنف: 'مفك هواء',
      المخزن: 'مخزن أ',
      الرصيد: 57,
    },
  ]);
  const result = parseDepartmentConsumablesSheetFromBuffer(buf, {
    materials,
    warehouses,
    locations,
    balances,
  });
  assert.equal(result.validCount, 1);
  assert.equal(result.createCount, 1);
  assert.equal(result.rows[0].itemName, 'مفك هواء');
  assert.ok(result.rows[0].itemCode);
  assert.equal(result.rows[0].willCreateItem, true);
}

{
  // Match existing consumable by name when code is blank.
  const buf = toBuffer([
    {
      'اسم الصنف': 'قفازات',
      'كود المخزن': 'WH1',
      الرصيد: 20,
    },
  ]);
  const result = parseDepartmentConsumablesSheetFromBuffer(buf, {
    materials,
    warehouses,
    locations,
    balances,
  });
  assert.equal(result.validCount, 1);
  assert.equal(result.createCount, 0);
  assert.equal(result.rows[0].willCreateItem, false);
  assert.equal(result.rows[0].itemId, 'm1');
  assert.equal(result.rows[0].itemCode, 'CNS-1');
  assert.equal(result.rows[0].qtyDelta, 10);
}

{
  // Unknown code without name still fails closed.
  const buf = toBuffer([
    {
      'كود الصنف': 'MISSING',
      'كود المخزن': 'WH1',
      الرصيد: 5,
    },
  ]);
  const result = parseDepartmentConsumablesSheetFromBuffer(buf, {
    materials,
    warehouses,
    locations,
    balances,
  });
  assert.equal(result.validCount, 0);
  assert.match(result.rows[0].errors.join(' '), /غير موجود/);
}

console.log('department-consumables-sheet tests passed');
