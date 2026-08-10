import assert from 'node:assert/strict';
import type { WorkOrder } from '../types.ts';
import {
  buildReportPrefillFromWorkOrder,
  hasDistributedLineLabor,
} from '../modules/production/utils/workOrderReportPrefill.ts';

const wo = (overrides: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'wo-1',
  workOrderNumber: 'WO-1',
  productId: 'product-1',
  lineId: 'line-1',
  supervisorId: 'sup-1',
  quantity: 100,
  producedQuantity: 20,
  maxWorkers: 5,
  workHours: 8,
  targetDate: '2026-08-10',
  estimatedCost: 0,
  actualCost: 0,
  status: 'in_progress',
  createdBy: 'user-1',
  workOrderType: 'finished_product',
  ...overrides,
});

const prefill = buildReportPrefillFromWorkOrder(wo());
assert.ok(prefill);
assert.equal(prefill.workOrderId, 'wo-1');
assert.equal(prefill.lineId, 'line-1');
assert.equal(prefill.productId, 'product-1');
assert.equal(prefill.employeeId, 'sup-1');
assert.equal(prefill.reportType, 'finished_product');
assert.equal(prefill.remainingQuantity, 80);
assert.equal(prefill.workHours, 8);
assert.equal(prefill.workersCount, 5);
assert.equal(prefill.workersPatch.workersProductionCount, 5);

const injection = buildReportPrefillFromWorkOrder(wo({
  workOrderType: 'component_injection',
  actualWorkHours: 7.5,
  actualWorkersCount: 3,
  maxWorkers: 9,
}));
assert.ok(injection);
assert.equal(injection.reportType, 'component_injection');
assert.equal(injection.workHours, 7.5);
assert.equal(injection.workersCount, 3);
assert.equal(injection.workersPatch.workersCount, 3);

assert.equal(buildReportPrefillFromWorkOrder(wo({ id: '' })), null);
assert.equal(hasDistributedLineLabor(0), false);
assert.equal(hasDistributedLineLabor(2), true);

console.log('work-order-report-prefill.test.ts: ok');
