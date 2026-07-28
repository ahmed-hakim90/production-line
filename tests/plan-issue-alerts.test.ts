import assert from 'node:assert/strict';
import {
  aggregateOpenPlanDemand,
  buildPlanIssueAlerts,
  planIssueAlertHref,
  planReplenishAlertHref,
  planRemainingQuantity,
} from '../modules/inventory/lib/planIssueAlerts';

assert.equal(
  planRemainingQuantity({
    productId: 'p1',
    plannedQuantity: 100,
    producedQuantity: 40,
  }),
  60,
);
assert.equal(
  planRemainingQuantity({
    productId: 'p1',
    plannedQuantity: 100,
    producedQuantity: 40,
    remainingQuantity: 55,
  }),
  55,
);

const demands = aggregateOpenPlanDemand([
  {
    id: 'plan-a',
    productId: 'p1',
    productName: 'Product A',
    productCode: 'PA',
    status: 'in_progress',
    remainingQuantity: 40,
  },
  {
    id: 'plan-b',
    productId: 'p1',
    productName: 'Product A',
    productCode: 'PA',
    status: 'planned',
    remainingQuantity: 20,
  },
  {
    id: 'plan-done',
    productId: 'p2',
    status: 'completed',
    remainingQuantity: 99,
  },
  {
    id: 'plan-c',
    productId: 'p3',
    productName: 'Product C',
    status: 'in_progress',
    remainingQuantity: 10,
  },
  {
    id: 'plan-d',
    productId: 'p4',
    productName: 'Product D',
    status: 'in_progress',
    remainingQuantity: 50,
  },
]);

assert.equal(demands.length, 3);
assert.equal(demands[0].productId, 'p1');
assert.equal(demands[0].remainingQuantity, 60);
assert.deepEqual(demands[0].planIds, ['plan-a', 'plan-b']);
assert.deepEqual(demands[0].planRemainings, [40, 20]);

const capacity = new Map([
  ['p1', { maxAssemblable: 25, productName: 'Product A', productCode: 'PA' }],
  ['p3', { maxAssemblable: 10 }],
  ['p4', { maxAssemblable: 0 }],
]);

const alerts = buildPlanIssueAlerts(demands, capacity);
assert.equal(alerts.length, 2);

const p1 = alerts.find((row) => row.productId === 'p1');
assert.ok(p1);
assert.equal(p1!.action, 'issue');
assert.equal(p1!.shortfall, 35);
assert.equal(p1!.maxAssemblable, 25);
// Suggest only what stock can cover — not full plan remaining.
assert.equal(p1!.suggestedIssueQuantity, 25);

const p4 = alerts.find((row) => row.productId === 'p4');
assert.ok(p4);
assert.equal(p4!.action, 'replenish');
assert.equal(p4!.suggestedIssueQuantity, 0);
assert.equal(planIssueAlertHref(p4!), null);
assert.ok(planReplenishAlertHref(p4!, 'wh-1').includes('raw-materials/control'));

const tight = buildPlanIssueAlerts(demands, capacity, { safetyRatio: 1.5 });
assert.ok(tight.some((row) => row.productId === 'p3'));

const href = planIssueAlertHref(p1!, 'wh-supplies');
assert.ok(href);
assert.ok(href!.includes('productId=p1'));
assert.ok(href!.includes('planId=plan-a'));
assert.ok(href!.includes('warehouseId=wh-supplies'));
assert.ok(href!.includes('quantity=25'));

console.log('plan-issue-alerts.test.ts: OK');
