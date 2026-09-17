import assert from 'node:assert/strict';
import { getDb } from '../functions/src/adminApp';
import { executeWorkOrderCycle } from '../functions/src/workOrderCycle';
import { readWorkOrderCycle } from '../functions/src/workOrderCycleRead';

if (!process.env.GCLOUD_PROJECT?.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local demo emulator required');
const db = getDb(); const suffix = Date.now().toString(); const tenantId = `wc-${suffix}`;
const uid = (name: string) => `${tenantId}-${name}`;
async function seedUser(name: string, permissions: Record<string, boolean>) {
  const person = uid(name);
  await db.doc(`roles/${person}`).set({ tenantId, permissions });
  await db.doc(`users/${person}`).set({ tenantId, roleId: person, isActive: true, displayName: name });
}
await seedUser('manager', { 'workOrders.create': true, 'workOrders.approve': true });
await seedUser('supervisor', { 'workOrders.execute': true });

const productId = `${tenantId}-product`;
const linkedLineId = `${tenantId}-linked-line`;
const unlinkedLineId = `${tenantId}-unlinked-line`;
await db.doc(`products/${productId}`).set({ tenantId, isActive: true, name: 'Worker Count Product', code: 'WC-1' });
await db.doc(`production_lines/${linkedLineId}`).set({ tenantId, isActive: true });
await db.doc(`production_lines/${unlinkedLineId}`).set({ tenantId, isActive: true });

// Two active employees tenant-wide; only one is linked to `linkedLineId` via the permanent roster.
const linkedEmployeeId = `${tenantId}-linked-employee`;
const unlinkedEmployeeId = `${tenantId}-unlinked-employee`;
await db.doc(`employees/${linkedEmployeeId}`).set({ tenantId, isActive: true, name: 'Linked Worker' });
await db.doc(`employees/${unlinkedEmployeeId}`).set({ tenantId, isActive: true, name: 'Unlinked Worker' });

const productionWorkerId = `${tenantId}-production-worker`;
await db.doc(`production_workers/${productionWorkerId}`).set({ tenantId, employeeId: linkedEmployeeId, name: 'Linked Worker', code: 'PW-1', isActive: true, workerType: 'permanent', lineIds: [linkedLineId] });
await db.doc(`production_line_worker_assignments/${tenantId}-assignment`).set({ tenantId, lineId: linkedLineId, workerId: productionWorkerId, isActive: true, startDate: '2026-01-01' });

function callFor(orderId: string) {
  return (person: string, action: Parameters<typeof executeWorkOrderCycle>[1]['action'], payload: Record<string, unknown> = {}, requestId: string = crypto.randomUUID()) =>
    executeWorkOrderCycle(uid(person), { orderId, action, payload, requestId });
}

// ---- Case A: line has a linked roster — directory.workers is scoped to it, named assignment works as before ----
{
  const orderId = `${tenantId}-linked-order`;
  const call = callFor(orderId);
  await call('manager', 'prepare', { productId, lineId: linkedLineId, supervisorUid: uid('supervisor'), quantity: 50, workOrderNumber: orderId, slots: [{ date: '2026-09-17', startTime: '08:00', endTime: '09:00', targetQuantity: 50 }] });
  await call('manager', 'approve');

  const view = await readWorkOrderCycle(uid('supervisor'), { orderId, directory: true });
  assert.deepEqual(view.directory.workers.map(w => w.id).sort(), [linkedEmployeeId], 'Only the roster-linked employee is offered, not every active employee tenant-wide');

  await assert.rejects(call('supervisor', 'assignWorkers', { workerIds: [linkedEmployeeId], workerCount: 1 }), 'workerIds and workerCount together are rejected');
  await assert.rejects(call('supervisor', 'assignWorkers', {}), 'Neither workerIds nor workerCount is rejected');

  await call('supervisor', 'assignWorkers', { workerIds: [linkedEmployeeId] });
  await call('supervisor', 'start', { slotId: 'hour-001' });
  const slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  assert.deepEqual(slot.workerIdsSnapshot, [linkedEmployeeId]);
  assert.equal(slot.workersSnapshot.length, 1);
  assert.equal(slot.workersSnapshotCount, 1);

  console.log('PASS: a line with a linked permanent roster scopes directory.workers to it and keeps the named-assignment path working');
}

// ---- Case B: line has no linked roster — directory.workers is empty, a plain count is accepted instead ----
{
  const orderId = `${tenantId}-unlinked-order`;
  const call = callFor(orderId);
  await call('manager', 'prepare', { productId, lineId: unlinkedLineId, supervisorUid: uid('supervisor'), quantity: 50, workOrderNumber: orderId, slots: [{ date: '2026-09-17', startTime: '08:00', endTime: '09:00', targetQuantity: 50 }] });
  await call('manager', 'approve');

  const view = await readWorkOrderCycle(uid('supervisor'), { orderId, directory: true });
  assert.deepEqual(view.directory.workers, [], 'No roster linked to this line, so no names are offered (not a fallback to the whole company)');

  await assert.rejects(call('supervisor', 'assignWorkers', { workerCount: 0 }), 'Zero is not a valid worker count');
  await assert.rejects(call('supervisor', 'assignWorkers', { workerCount: 1.5 }), 'A non-integer worker count is rejected');
  await assert.rejects(call('supervisor', 'assignWorkers', { workerCount: 501 }), 'A worker count above the cap is rejected');

  await call('supervisor', 'assignWorkers', { workerCount: 4 });
  const order = (await db.doc(`work_orders/${orderId}`).get()).data()!;
  assert.equal(order.workerCount, 4);
  assert.deepEqual(order.workerIds, []);

  await call('supervisor', 'start', { slotId: 'hour-001' });
  const slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  assert.deepEqual(slot.workerIdsSnapshot, []);
  assert.deepEqual(slot.workersSnapshot, []);
  assert.equal(slot.workersSnapshotCount, 4, 'The count-only path still records how many worked the hour, just without names');

  console.log('PASS: a line with no linked roster accepts a plain worker count and carries it through to the hour\'s snapshot without names');
}

// ---- Switching back from a count to named workers clears the stale count ----
{
  const orderId = `${tenantId}-switch-order`;
  const call = callFor(orderId);
  await call('manager', 'prepare', { productId, lineId: unlinkedLineId, supervisorUid: uid('supervisor'), quantity: 50, workOrderNumber: orderId, slots: [{ date: '2026-09-17', startTime: '08:00', endTime: '09:00', targetQuantity: 50 }] });
  await call('manager', 'approve');
  await call('supervisor', 'assignWorkers', { workerCount: 2 });
  await call('supervisor', 'assignWorkers', { workerIds: [linkedEmployeeId] });
  const order = (await db.doc(`work_orders/${orderId}`).get()).data()!;
  assert.equal(order.workerCount, undefined, 'Switching to named workers clears the stale workerCount');
  assert.deepEqual(order.workerIds, [linkedEmployeeId]);

  console.log('PASS: re-assigning by name after a count clears the stale count field');
}
