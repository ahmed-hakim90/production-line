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

console.log('department-consumables-sheet tests passed');
