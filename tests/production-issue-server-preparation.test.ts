import assert from 'node:assert/strict';
import { allocateServerProductionIssue } from '../functions/src/productionIssuePreparation';
import {
  productionIssueActorHasPermission,
  type ActorContext,
} from '../functions/src/productionIssueStock';

const actor = (permissions: Record<string, boolean>, isSuperAdmin = false): ActorContext => ({
  uid: 'user-a',
  tenantId: 'tenant-a',
  displayName: 'User A',
  isSuperAdmin,
  permissions,
  boundWarehouseId: null,
});

const balances = [
  {
    locationId: 'late',
    locationCode: 'LATE',
    quantity: 7,
    updatedAt: '2026-01-02T00:00:00.000Z',
  },
  {
    locationId: 'early',
    locationCode: 'EARLY',
    quantity: 5,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const fifo = allocateServerProductionIssue(balances, 8);
assert.equal(fifo.availableQty, 12);
assert.equal(fifo.shortageQty, 0);
assert.deepEqual(
  fifo.allocations.map((row) => [row.locationId, row.quantity]),
  [['early', 5], ['late', 3]],
);

const preferred = allocateServerProductionIssue(balances, 8, 'late');
assert.deepEqual(
  preferred.allocations.map((row) => [row.locationId, row.quantity]),
  [['late', 7], ['early', 1]],
);

const shortage = allocateServerProductionIssue(balances, 20);
assert.equal(shortage.availableQty, 12);
assert.equal(shortage.shortageQty, 8);

assert.equal(productionIssueActorHasPermission(actor({}, true), ['productionIssue.approve']), true);
assert.equal(
  productionIssueActorHasPermission(actor({ 'adminDashboard.view': true }), ['adminDashboard.view']),
  true,
);
assert.equal(
  productionIssueActorHasPermission(actor({ 'roles.manage': true }), ['roles.manage']),
  true,
);
assert.equal(
  productionIssueActorHasPermission(actor({ 'inventory.transactions.create': true }), ['productionIssue.create']),
  true,
);
assert.equal(
  productionIssueActorHasPermission(actor({ 'inventory.transfers.approve': true }), ['productionIssue.approve']),
  true,
);
assert.equal(productionIssueActorHasPermission(actor({}), ['productionIssue.create']), false);

console.log('production-issue-server-preparation.test.ts: OK');
