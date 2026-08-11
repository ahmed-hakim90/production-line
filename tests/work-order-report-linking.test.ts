import assert from 'node:assert/strict';
import type { ProductionReport, WorkOrder } from '../types.ts';
import {
  countReportsLinkedToWorkOrder,
  deriveWorkOrderStatusFromProduced,
  filterUnlinkedReportsEligibleForWorkOrder,
  getWorkOrderEffectiveStartDate,
  pickBestAutoLinkedWorkOrder,
  reportDateEligibleForWorkOrder,
  sumProducedFromWorkOrderReports,
} from '../modules/production/utils/workOrderReportLinking.ts';

const wo = (overrides: Partial<WorkOrder> = {}): WorkOrder => ({
  workOrderNumber: 'WO-1',
  productId: 'product-1',
  lineId: 'line-1',
  supervisorId: 'sup-1',
  quantity: 100,
  producedQuantity: 0,
  maxWorkers: 4,
  targetDate: '2026-07-31',
  estimatedCost: 0,
  actualCost: 0,
  status: 'in_progress',
  createdBy: 'user-1',
  id: 'wo-1',
  startDate: '2026-07-10',
  createdAt: '2026-07-10T08:00:00.000Z',
  workOrderType: 'finished_product',
  ...overrides,
});

const report = (overrides: Partial<ProductionReport> = {}): ProductionReport => ({
  id: 'r-1',
  employeeId: 'sup-1',
  productId: 'product-1',
  lineId: 'line-1',
  date: '2026-07-12',
  quantityProduced: 10,
  workersCount: 2,
  workHours: 8,
  reportType: 'finished_product',
  ...overrides,
});

assert.equal(getWorkOrderEffectiveStartDate(wo()), '2026-07-10');
assert.equal(getWorkOrderEffectiveStartDate(wo({ startDate: '', createdAt: '2026-07-11T15:00:00.000Z' })), '2026-07-11');
assert.equal(reportDateEligibleForWorkOrder('2026-07-09', wo()), false);
assert.equal(reportDateEligibleForWorkOrder('2026-07-10', wo()), true);
assert.equal(reportDateEligibleForWorkOrder('2026-07-15', wo()), true);

const picked = pickBestAutoLinkedWorkOrder(
  [
    wo({ id: 'wo-old', startDate: '2026-07-20', status: 'in_progress' }),
    wo({ id: 'wo-ok', startDate: '2026-07-10', status: 'in_progress' }),
  ],
  {
    lineId: 'line-1',
    productId: 'product-1',
    supervisorId: 'sup-1',
    reportType: 'finished_product',
    reportDate: '2026-07-12',
  },
);
assert.equal(picked?.id, 'wo-ok');

const none = pickBestAutoLinkedWorkOrder(
  [wo({ id: 'wo-future', startDate: '2026-07-20' })],
  {
    lineId: 'line-1',
    productId: 'product-1',
    reportType: 'finished_product',
    reportDate: '2026-07-12',
  },
);
assert.equal(none, null);

const wrongLine = pickBestAutoLinkedWorkOrder(
  [wo({ id: 'wo-other-line', lineId: 'line-2' })],
  {
    lineId: 'line-1',
    productId: 'product-1',
    reportType: 'finished_product',
    reportDate: '2026-07-12',
  },
);
assert.equal(wrongLine, null);

const linkedReports = [
  report({ id: 'a', workOrderId: 'wo-1', quantityProduced: 10 }),
  report({ id: 'b', workOrderId: 'wo-1', quantityProduced: 15 }),
  report({ id: 'c', workOrderId: 'wo-1', quantityProduced: 5, reportType: 'packaging' }),
  report({ id: 'd', workOrderId: 'other', quantityProduced: 50 }),
];
assert.equal(sumProducedFromWorkOrderReports('wo-1', linkedReports), 25);
assert.equal(countReportsLinkedToWorkOrder('wo-1', linkedReports), 3);
assert.equal(sumProducedFromWorkOrderReports('wo-1', linkedReports), 25); // idempotent sum

assert.equal(deriveWorkOrderStatusFromProduced(0, 100, 'pending'), 'pending');
assert.equal(deriveWorkOrderStatusFromProduced(40, 100, 'pending'), 'in_progress');
assert.equal(deriveWorkOrderStatusFromProduced(100, 100, 'in_progress'), 'completed');
assert.equal(deriveWorkOrderStatusFromProduced(40, 100, 'cancelled'), 'cancelled');
assert.equal(deriveWorkOrderStatusFromProduced(40, 100, 'in_progress', '2026-06-10', '2026-06-10'), 'in_progress');
assert.equal(deriveWorkOrderStatusFromProduced(40, 100, 'in_progress', '2026-06-09', '2026-06-10'), 'in_progress');
assert.equal(deriveWorkOrderStatusFromProduced(40, 100, 'in_progress', '2026-06-08', '2026-06-10'), 'paused');
assert.equal(deriveWorkOrderStatusFromProduced(40, 100, 'paused', '2026-06-10', '2026-06-10'), 'in_progress');
assert.equal(deriveWorkOrderStatusFromProduced(100, 100, 'paused', '2026-06-01', '2026-06-10'), 'completed');
assert.equal(deriveWorkOrderStatusFromProduced(40, 100, 'cancelled', '2026-06-01', '2026-06-10'), 'cancelled');

const candidates = filterUnlinkedReportsEligibleForWorkOrder(wo(), [
  report({ id: 'before', date: '2026-07-01', workOrderId: '' }),
  report({ id: 'ok', date: '2026-07-12', workOrderId: '' }),
  report({ id: 'already', date: '2026-07-12', workOrderId: 'wo-1' }),
  report({ id: 'other-line', date: '2026-07-12', workOrderId: '', lineId: 'line-2' }),
]);
assert.deepEqual(candidates.map((r) => r.id), ['ok']);

console.log('work-order-report-linking.test.ts: ok');
