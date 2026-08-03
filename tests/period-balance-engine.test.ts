import assert from 'node:assert/strict';
import { buildPeriodBalanceReport, buildDailyNetFromTransactions, periodBalanceKey } from '../modules/inventory/engines/periodBalanceEngine.ts';
import type { StockItemBalance, StockTransaction } from '../modules/inventory/types.ts';

function testPeriodBalanceOpeningClosing() {
  const balances: StockItemBalance[] = [{
    warehouseId: 'floor-1',
    itemType: 'material',
    itemId: 'm1',
    itemName: 'مكون أ',
    itemCode: 'M1',
    quantity: 80,
    minStock: 0,
    updatedAt: '2026-08-03T12:00:00.000Z',
  }];
  const txs: StockTransaction[] = [
    {
      warehouseId: 'floor-1',
      itemType: 'material',
      itemId: 'm1',
      itemName: 'مكون أ',
      itemCode: 'M1',
      movementType: 'TRANSFER',
      transferDirection: 'IN',
      quantity: 100,
      createdAt: '2026-08-01T10:00:00.000Z',
      createdBy: 'sys',
    },
    {
      warehouseId: 'floor-1',
      itemType: 'material',
      itemId: 'm1',
      itemName: 'مكون أ',
      itemCode: 'M1',
      movementType: 'OUT',
      quantity: 20,
      createdAt: '2026-08-02T10:00:00.000Z',
      createdBy: 'sys',
    },
  ];
  const report = buildPeriodBalanceReport({
    warehouseId: 'floor-1',
    startDate: '2026-08-01T00:00:00.000Z',
    endDate: '2026-08-03T23:59:59.000Z',
    currentBalances: balances,
    transactionsInPeriod: txs,
  });
  assert.equal(report.rows.length, 1);
  const row = report.rows[0];
  assert.equal(row.transferInQty, 100);
  assert.equal(row.outQty, 20);
  assert.equal(row.closingQty, 80);
  assert.equal(row.openingQty, 0);
  assert.equal(periodBalanceKey('floor-1', 'material', 'm1'), 'floor-1__material__m1');
}

function testDailyAggregation() {
  const txs: StockTransaction[] = [
    {
      warehouseId: 'w',
      itemType: 'finished_good',
      itemId: 'p1',
      itemName: 'منتج',
      itemCode: 'P1',
      movementType: 'IN',
      quantity: 10,
      createdAt: '2026-08-01T08:00:00.000Z',
      createdBy: 'a',
    },
    {
      warehouseId: 'w',
      itemType: 'finished_good',
      itemId: 'p1',
      itemName: 'منتج',
      itemCode: 'P1',
      movementType: 'TRANSFER',
      transferDirection: 'OUT',
      quantity: 4,
      createdAt: '2026-08-01T12:00:00.000Z',
      createdBy: 'a',
    },
  ];
  const daily = buildDailyNetFromTransactions(txs);
  assert.equal(daily.length, 1);
  assert.equal(daily[0].date, '2026-08-01');
  assert.equal(daily[0].inQty, 10);
  assert.equal(daily[0].transferOutQty, 4);
}

testPeriodBalanceOpeningClosing();
testDailyAggregation();
console.log('period-balance-engine.test.ts: OK');
