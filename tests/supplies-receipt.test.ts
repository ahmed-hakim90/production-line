import assert from 'node:assert/strict';
import {
  collectExecutableLines,
  suggestedReceiptQty,
  validateSuppliesReceiptDraft,
} from '../modules/inventory/lib/suppliesReceipt';
import type { SuppliesReceiptLine, SuppliesReceiptProductGroup } from '../modules/inventory/types';

assert.equal(suggestedReceiptQty(2, 4500), 9000);
assert.equal(suggestedReceiptQty(1.5, 10), 15);
assert.equal(suggestedReceiptQty(0, 4500), 0);
assert.equal(suggestedReceiptQty(2, 0), 0);

const line = (
  partial: Partial<SuppliesReceiptLine> & Pick<SuppliesReceiptLine, 'itemId' | 'itemName'>,
): SuppliesReceiptLine => ({
  itemType: 'material',
  itemCode: partial.itemCode || partial.itemId,
  unit: 'pcs',
  quantity: 1,
  locationId: 'loc-1',
  locationCode: 'A1',
  ...partial,
});

const group = (
  partial: Partial<SuppliesReceiptProductGroup> & Pick<SuppliesReceiptProductGroup, 'productId' | 'productName'>,
): SuppliesReceiptProductGroup => ({
  quantity: 4500,
  lines: [line({ itemId: 'm1', itemName: 'وش', quantity: 4500 })],
  ...partial,
});

// Valid: product group with components
validateSuppliesReceiptDraft({
  warehouseId: 'wh-supplies',
  groups: [group({ productId: 'p1', productName: 'خلاط' })],
  standaloneLines: [],
  locationsRequired: true,
});

// Valid: standalone only
validateSuppliesReceiptDraft({
  warehouseId: 'wh-supplies',
  groups: [],
  standaloneLines: [line({ itemId: 'm2', itemName: 'مسمار', quantity: 100 })],
  locationsRequired: false,
});

// Collect executable lines — product itself is NOT included
const executable = collectExecutableLines({
  groups: [
    group({
      productId: 'p1',
      productName: 'خلاط',
      quantity: 4500,
      lines: [
        line({ itemId: 'm1', itemName: 'وش', quantity: 4500 }),
        line({ itemId: 'm2', itemName: 'يد', quantity: 4500 }),
      ],
    }),
  ],
  standaloneLines: [line({ itemId: 'm3', itemName: 'مسامير', quantity: 200 })],
});
assert.equal(executable.length, 3);
assert.ok(executable.every((l) => l.itemId.startsWith('m')));
assert.ok(!executable.some((l) => l.itemId === 'p1'));

// Reject empty
assert.throws(
  () => validateSuppliesReceiptDraft({ warehouseId: 'wh', groups: [], standaloneLines: [] }),
  /أضف/,
);

// Reject zero quantity line
assert.throws(
  () =>
    validateSuppliesReceiptDraft({
      warehouseId: 'wh',
      groups: [
        group({
          productId: 'p1',
          productName: 'خلاط',
          lines: [line({ itemId: 'm1', itemName: 'وش', quantity: 0 })],
        }),
      ],
      standaloneLines: [],
    }),
  /أكبر من صفر/,
);

// Reject group without lines
assert.throws(
  () =>
    validateSuppliesReceiptDraft({
      warehouseId: 'wh',
      groups: [{ productId: 'p1', productName: 'خلاط', quantity: 10, lines: [] }],
      standaloneLines: [],
    }),
  /لا يحتوي على مكونات/,
);

// Reject missing location when required
assert.throws(
  () =>
    validateSuppliesReceiptDraft({
      warehouseId: 'wh',
      groups: [],
      standaloneLines: [line({ itemId: 'm1', itemName: 'وش', locationId: '', locationCode: '' })],
      locationsRequired: true,
    }),
  /لوكيشن/,
);

// Reject duplicate item+location in same group
assert.throws(
  () =>
    validateSuppliesReceiptDraft({
      warehouseId: 'wh',
      groups: [
        group({
          productId: 'p1',
          productName: 'خلاط',
          lines: [
            line({ itemId: 'm1', itemName: 'وش', locationId: 'L1' }),
            line({ itemId: 'm1', itemName: 'وش', locationId: 'L1' }),
          ],
        }),
      ],
      standaloneLines: [],
      locationsRequired: true,
    }),
  /تكرار/,
);

console.log('supplies-receipt.test.ts: ok');
