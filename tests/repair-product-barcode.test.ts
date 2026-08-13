import assert from 'node:assert/strict';
import {
  findRepairProductByBarcode,
  normalizeRepairProductBarcode,
  repairProductScanKeys,
} from '../modules/repair/lib/repairProductBarcode.ts';

const products = [
  { id: 'p1', name: 'منتج 1', code: 'P-1', barcode: ' 62210001 ', model: '', openingBalance: 0,
    chineseUnitCost: 0, innerBoxCost: 0, outerCartonCost: 0, unitsPerCarton: 1, sellingPrice: 0 },
  { id: 'p2', name: 'منتج 2', code: 'P-2', barcode: 'AbC-22', model: '', openingBalance: 0,
    chineseUnitCost: 0, innerBoxCost: 0, outerCartonCost: 0, unitsPerCarton: 1, sellingPrice: 0 },
];

assert.equal(normalizeRepairProductBarcode(' abc-22 '), 'ABC-22');
assert.deepEqual(repairProductScanKeys(products[0]!), ['62210001', 'P-1']);
assert.equal(findRepairProductByBarcode(products, '62210001')?.id, 'p1');
assert.equal(findRepairProductByBarcode(products, 'p-1')?.id, 'p1');
assert.equal(findRepairProductByBarcode(products, 'abc-22')?.id, 'p2');
assert.equal(findRepairProductByBarcode(products, 'unknown'), undefined);
assert.equal(
  findRepairProductByBarcode(
    [
      { ...products[0]!, id: 'dup-a', barcode: 'SHARED' },
      { ...products[1]!, id: 'dup-b', barcode: 'SHARED' },
    ],
    'SHARED',
  ),
  undefined,
);

console.log('repair-product-barcode.test.ts: ok');
