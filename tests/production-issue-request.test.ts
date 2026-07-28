import assert from 'node:assert/strict';
import {
  findBlockingOpenIssue,
  isBlockingOpenIssueStatus,
  requestRemainingQty,
  suggestRequestQuantity,
  summarizeOrdersForSource,
} from '../modules/inventory/lib/productionIssueRequest';

assert.equal(isBlockingOpenIssueStatus('requested'), true);
assert.equal(isBlockingOpenIssueStatus('draft'), true);
assert.equal(isBlockingOpenIssueStatus('submitted'), true);
assert.equal(isBlockingOpenIssueStatus('issued'), false);
assert.equal(isBlockingOpenIssueStatus('rejected'), false);
assert.equal(isBlockingOpenIssueStatus('cancelled'), false);

const blocking = findBlockingOpenIssue([
  { id: '1', status: 'issued', sourceType: 'production_plan' },
  { id: '2', status: 'requested', sourceType: 'production_plan' },
]);
assert.equal(blocking?.id, '2');

assert.equal(
  findBlockingOpenIssue([
    { id: '1', status: 'issued', sourceType: 'production_plan' },
    { id: '2', status: 'cancelled', sourceType: 'production_plan' },
  ]),
  undefined,
);

const summary = summarizeOrdersForSource([
  { status: 'issued', quantity: 100, requestedQuantity: 120, sourceType: 'production_plan' },
  { status: 'issued', quantity: 40, requestedQuantity: 40, sourceType: 'production_plan' },
  { status: 'requested', quantity: 50, requestedQuantity: 50, sourceType: 'production_plan' },
  { status: 'rejected', quantity: 10, requestedQuantity: 10, sourceType: 'production_plan' },
  { status: 'issued', quantity: 999, sourceType: 'production_report' },
]);
assert.equal(summary.issuedQty, 140);
assert.equal(summary.openRequestedQty, 50);
assert.equal(summary.rejectedQty, 10);
assert.equal(summary.orderCount, 4);

assert.equal(requestRemainingQty({ status: 'requested', quantity: 80, requestedQuantity: 80 }), 80);
assert.equal(requestRemainingQty({ status: 'issued', quantity: 80, requestedQuantity: 80 }), 0);
assert.equal(requestRemainingQty({ status: 'rejected', quantity: 80, requestedQuantity: 80 }), 0);

assert.equal(suggestRequestQuantity(1000, 90), 90);
assert.equal(suggestRequestQuantity(50, 90), 50);
assert.equal(suggestRequestQuantity(1000, 0), 0);
assert.equal(suggestRequestQuantity(0, 90), 0);

console.log('production-issue-request.test.ts: OK');
