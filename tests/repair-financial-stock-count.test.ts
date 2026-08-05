import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { computeRepairJobCost } from '../modules/repair/utils/repairBusinessLogic.ts';
import { parseStockCountSheet } from '../modules/inventory/lib/stockCountSheet.ts';

const unpaid = computeRepairJobCost({
  partsUsed: [],
  laborCost: 100,
  paidAmount: 0,
  paymentStatus: 'paid',
});
assert.equal(unpaid.finalCost, 100);
assert.equal(unpaid.paymentStatus, 'unpaid');
assert.equal(unpaid.balanceDue, 100);

const partial = computeRepairJobCost({
  partsUsed: [],
  laborCost: 100,
  paidAmount: 40,
  paymentStatus: 'unpaid',
});
assert.equal(partial.paymentStatus, 'partial');
assert.equal(partial.balanceDue, 60);

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
  { 'كود الصنف': 'PART-1', 'الكمية الفعلية': 7 },
  { 'كود الصنف': 'PART-2', 'الكمية الفعلية': 3 },
]), 'الجرد');
const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
const parsed = parseStockCountSheet(buffer, [
  {
    warehouseId: 'wh-1',
    itemType: 'material',
    itemId: 'p1',
    itemName: 'قطعة 1',
    itemCode: 'PART-1',
    quantity: 5,
    minStock: 0,
    updatedAt: '',
  },
  {
    warehouseId: 'wh-1',
    itemType: 'material',
    itemId: 'p2',
    itemName: 'قطعة 2',
    itemCode: 'PART-2',
    quantity: 3,
    minStock: 0,
    updatedAt: '',
  },
]);
assert.deepEqual(parsed.errors, []);
assert.equal(parsed.importedRows, 2);
assert.equal(parsed.changedRows, 1);
assert.equal(parsed.createCandidates.length, 0);
assert.equal(parsed.lines.find((line) => line.itemId === 'p1')?.countedQty, 7);

const createWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(createWorkbook, XLSX.utils.json_to_sheet([
  { 'كود الصنف': 'NEW-99', 'الكمية الفعلية': 4 },
]), 'الجرد');
const createBuffer = XLSX.write(createWorkbook, { type: 'array', bookType: 'xlsx' });
const created = parseStockCountSheet(createBuffer, [], {
  allowCreateFromCatalog: true,
  catalogMaterials: [
    { id: 'mat-99', code: 'NEW-99', name: 'قطعة جديدة', unit: 'piece', categoryName: 'كهرباء' },
  ],
  existingPartMaterialIds: new Set(),
});
assert.deepEqual(created.errors, []);
assert.equal(created.createCandidates.length, 1);
assert.equal(created.createCandidates[0]?.materialId, 'mat-99');
assert.equal(created.createCandidates[0]?.needsSparePart, true);
assert.equal(created.lines[0]?.expectedQty, 0);
assert.equal(created.lines[0]?.countedQty, 4);

const rejected = parseStockCountSheet(createBuffer, [], { allowCreateFromCatalog: false });
assert.equal(rejected.errors.length, 1);

const openingWorkbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(openingWorkbook, XLSX.utils.json_to_sheet([
  { 'كود الصنف': 'NEW-99', 'الكمية الافتتاحية': 12 },
]), 'أول المدة');
const openingBuffer = XLSX.write(openingWorkbook, { type: 'array', bookType: 'xlsx' });
const opening = parseStockCountSheet(openingBuffer, [], {
  allowCreateFromCatalog: true,
  catalogMaterials: [
    { id: 'mat-99', code: 'NEW-99', name: 'قطعة جديدة', unit: 'piece' },
  ],
});
assert.equal(opening.errors.length, 0);
assert.equal(opening.lines[0]?.countedQty, 12);

// Central spare-parts warehouse: seed stock_items only (no repair spare-part rows).
const centralOpening = parseStockCountSheet(openingBuffer, [], {
  allowCreateFromCatalog: true,
  catalogMaterials: [
    { id: 'mat-99', code: 'NEW-99', name: 'قطعة جديدة', unit: 'piece', categoryName: 'قطع غيار' },
  ],
  existingPartMaterialIds: new Set(['mat-99']),
});
assert.deepEqual(centralOpening.errors, []);
assert.equal(centralOpening.createCandidates.length, 1);
assert.equal(centralOpening.createCandidates[0]?.needsSparePart, false);
assert.equal(centralOpening.createCandidates[0]?.needsStockBalance, true);
assert.equal(centralOpening.createCandidates[0]?.countedQty, 12);
assert.ok(centralOpening.warnings.some((w) => w.includes('سيُضاف إلى المخزن')));

console.log('repair-financial-stock-count.test.ts passed');
