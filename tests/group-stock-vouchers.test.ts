import assert from 'node:assert/strict';
import {
  buildVoucherPrintDataFromTransactions,
  flattenRecentVoucherFeed,
  groupManualVoucherTransactions,
  isRepairStockSource,
  voucherMovementTitle,
  voucherPrintFilePrefix,
} from '../modules/inventory/lib/groupStockVouchers.ts';
import type { StockTransaction } from '../modules/inventory/types.ts';

function tx(partial: Partial<StockTransaction> & Pick<StockTransaction, 'id' | 'movementType' | 'referenceNo'>): StockTransaction {
  return {
    warehouseId: 'wh-1',
    itemType: 'material',
    itemId: partial.id || 'i1',
    itemName: partial.itemName || 'صنف',
    itemCode: partial.itemCode || 'C1',
    quantity: 1,
    createdAt: partial.createdAt || '2026-08-10T10:00:00.000Z',
    createdBy: 'tester',
    ...partial,
  } as StockTransaction;
}

{
  const { singles, vouchers } = groupManualVoucherTransactions([
    tx({ id: 'a', movementType: 'IN', referenceNo: 'INV-010', itemName: 'A', createdAt: '2026-08-10T12:00:00.000Z' }),
    tx({ id: 'b', movementType: 'IN', referenceNo: 'INV-010', itemName: 'B', createdAt: '2026-08-10T11:00:00.000Z' }),
    tx({ id: 'c', movementType: 'IN', referenceNo: 'INV-011', itemName: 'Solo' }),
    tx({ id: 'd', movementType: 'OUT', referenceNo: 'INV-010', itemName: 'OtherDir' }),
    tx({ id: 'e', movementType: 'ADJUSTMENT', referenceNo: 'INV-099', itemName: 'Adj' }),
  ]);

  assert.equal(vouchers.length, 1);
  assert.equal(vouchers[0]?.referenceNo, 'INV-010');
  assert.equal(vouchers[0]?.lines.length, 2);
  assert.equal(singles.length, 3);

  const printData = buildVoucherPrintDataFromTransactions({
    group: vouchers[0]!,
    warehouseName: 'مركزي',
    spareContext: true,
  });
  assert.equal(printData.statusLabel, 'إذن إضافة قطع غيار');
  assert.equal(printData.documentType, 'إذن إضافة قطع غيار');
  assert.equal(printData.items?.length, 2);
}

{
  const feed = flattenRecentVoucherFeed([
    tx({ id: 'a', movementType: 'IN', referenceNo: 'INV-020', itemName: 'A', createdAt: '2026-08-10T12:00:00.000Z', quantity: 2 }),
    tx({ id: 'b', movementType: 'IN', referenceNo: 'INV-020', itemName: 'B', createdAt: '2026-08-10T12:00:00.000Z', quantity: 3 }),
  ]);
  assert.equal(feed.length, 1);
  assert.equal(feed[0]?.kind, 'voucher');
}

assert.equal(voucherMovementTitle('IN', true), 'إذن إضافة قطع غيار');
assert.equal(voucherMovementTitle('IN', false), 'إذن إضافة');
assert.equal(voucherPrintFilePrefix('IN', true), 'اذن-اضافة');
assert.equal(isRepairStockSource('repair_spare_issue'), true);
assert.equal(isRepairStockSource('production_issue'), false);

console.log('group-stock-vouchers.test.ts: ok');
