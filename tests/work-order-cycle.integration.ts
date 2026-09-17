import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { getDb } from '../functions/src/adminApp';
import { executeWorkOrderCycle } from '../functions/src/workOrderCycle';
import { readWorkOrderCycle } from '../functions/src/workOrderCycleRead';

const projectId = process.env.GCLOUD_PROJECT || '';
if (!projectId.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local demo emulator required');
const db = getDb();
const tenantId = 'cycle-test';
const suffix = Date.now().toString();
const orderId = `cycle-${suffix}`;
const otherOrderId = `other-${suffix}`;
const env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
const call = (uid: string, action: Parameters<typeof executeWorkOrderCycle>[1]['action'], payload: Record<string, unknown> = {}, requestId = `${action}-${Math.random().toString(36).slice(2)}`, target = orderId) => executeWorkOrderCycle(uid, { action, orderId: target, payload, requestId });
try {
  const people: Record<string, Record<string, boolean>> = {
    manager: { 'workOrders.create': true, 'workOrders.approve': true, 'workOrders.edit': true },
    supervisor: { 'workOrders.execute': true },
    outsider: { 'workOrders.execute': true },
    qualityManager: { 'workOrders.assignInspectors': true },
    inspector1: { 'workOrders.inspect': true }, inspector2: { 'workOrders.inspect': true },
  };
  for (const [uid, permissions] of Object.entries(people)) {
    await db.collection('roles').doc(`cycle-${uid}`).set({ tenantId, permissions });
    await db.collection('users').doc(uid).set({ tenantId, roleId: `cycle-${uid}`, isActive: true });
  }
  await db.collection('roles').doc('foreign-role').set({ tenantId: 'foreign', permissions: { 'workOrders.approve': true } });
  await db.collection('users').doc('foreign').set({ tenantId: 'foreign', roleId: 'foreign-role', isActive: true });
  await db.collection('products').doc('cycle-product').set({ tenantId });
  await db.collection('production_lines').doc(`line-${suffix}`).set({ tenantId, isActive: true });
  await db.collection('employees').doc('cycle-worker').set({ tenantId, isActive: true });
  const prepare = { productId: 'cycle-product', lineId: `line-${suffix}`, supervisorUid: 'supervisor', quantity: 100, workOrderNumber: 'CYCLE-TEST', slots: [
    { date: '2026-09-08', startTime: '08:00', endTime: '09:00', targetQuantity: 50 },
    { date: '2026-09-09', startTime: '08:00', endTime: '09:00', targetQuantity: 50 },
  ] };
  await call('manager', 'prepare', prepare, 'prepare');
  const draftTarget = `draft-resize-${suffix}`;
  await call('manager', 'prepare', prepare, 'resize-prepare', draftTarget);
  await call('manager', 'editDraft', { ...prepare, expectedRevision: 1, slots: [{ ...prepare.slots[0], targetQuantity: 100 }] }, 'resize-save', draftTarget);
  assert.equal((await db.doc(`work_orders/${draftTarget}`).collection('hourly_slots').get()).size, 1);
  assert.equal((await db.doc(`work_orders/${draftTarget}/draft_versions/resize-save`).get()).data()?.slots.length, 2, 'Removed draft periods remain archived');
  await assert.rejects(call('manager', 'editDraft', { ...prepare, expectedRevision: 2, slots: [prepare.slots[0], prepare.slots[0]] }, 'overlap-save', draftTarget));
  assert.equal((await db.doc(`work_orders/${draftTarget}`).get()).data()?.cycleRevision, 2, 'Invalid edit changes nothing');
  const edit = { ...prepare, expectedRevision: 1 };
  await assert.rejects(call('supervisor', 'editDraft', edit));
  await assert.rejects(call('foreign', 'editDraft', edit));
  await assert.rejects(call('manager', 'editDraft', { ...edit, quantity: 101 }));
  const edits = await Promise.allSettled([call('manager', 'editDraft', edit, 'edit-a'), call('manager', 'editDraft', edit, 'edit-b')]);
  assert.equal(edits.filter(result => result.status === 'fulfilled').length, 1, 'Stale parallel draft edit rejected');
  assert.equal((await db.doc(`work_orders/${orderId}`).get()).data()?.cycleRevision, 2);
  assert.equal((await db.doc(`work_orders/${orderId}`).collection('draft_versions').get()).size, 1);
  assert.equal((await db.doc(`work_orders/${orderId}`).get()).data()?.preparedBy, 'manager');
  await assert.rejects(call('supervisor', 'approve'));
  await assert.rejects(call('foreign', 'approve'));
  await assert.rejects(call('supervisor', 'start', { slotId: 'hour-001' }));
  await call('manager', 'approve');
  await assert.rejects(call('manager', 'editDraft', { ...edit, expectedRevision: 3 }));
  await assert.rejects(call('manager', 'reassignSupervisor', { supervisorUid: 'outsider', expectedRevision: 3, reason: '' }));
  await assert.rejects(call('supervisor', 'reassignSupervisor', { supervisorUid: 'outsider', expectedRevision: 3, reason: 'test' }));
  await call('manager', 'reassignSupervisor', { supervisorUid: 'outsider', expectedRevision: 3, reason: 'تغيير التكليف' }, 'reassign');
  await assert.rejects(readWorkOrderCycle('supervisor', { orderId }));
  const transferred = await readWorkOrderCycle('outsider', { orderId });
  assert.deepEqual(transferred.orders[0].audit, [], 'A plain execute-permission supervisor cannot see the audit trail, only that they can open the order');
  const auditedByManager = await readWorkOrderCycle('manager', { orderId });
  assert.equal(auditedByManager.orders[0].audit[0].reason, 'تغيير التكليف');
  assert.equal(auditedByManager.orders[0].audit[0].previousSupervisorUid, 'supervisor', 'Falls back to the raw uid when the user document has no displayName');
  await assert.rejects(call('supervisor', 'assignWorkers', { workerIds: ['cycle-worker'] }));
  await call('manager', 'reassignSupervisor', { supervisorUid: 'supervisor', expectedRevision: 4, reason: 'استعادة المشرف' });
  await assert.rejects(call('manager', 'approve'));
  await call('qualityManager', 'assignInspectors', { inspectorUids: ['inspector1', 'inspector2'] });
  const inspectorView = await readWorkOrderCycle('inspector1', { orderId });
  assert.equal(inspectorView.orders[0].id, orderId);
  await assert.rejects(readWorkOrderCycle('outsider', { orderId }));
  await assert.rejects(readWorkOrderCycle('foreign', { orderId }));
  const managerDirectory = await readWorkOrderCycle('manager', { directory: true });
  assert.ok(managerDirectory.directory.supervisors.some(person => person.id === 'supervisor'));
  assert.deepEqual(Object.keys(managerDirectory.directory.supervisors[0]).sort(), ['id', 'name']);
  await assert.rejects(call('qualityManager', 'assignInspectors', { inspectorUids: ['manager'] }));
  await assert.rejects(call('outsider', 'assignWorkers', { workerIds: ['cycle-worker'] }));
  await call('supervisor', 'assignWorkers', { workerIds: ['cycle-worker'] });
  await assert.rejects(call('supervisor', 'start', { slotId: 'hour-002' }));
  const starts = await Promise.allSettled([call('supervisor', 'start', { slotId: 'hour-001' }), call('supervisor', 'start', { slotId: 'hour-001' })]);
  assert.equal(starts.filter(result => result.status === 'fulfilled').length, 1, 'Only one concurrent start succeeds');
  const slotRef = db.doc(`work_orders/${orderId}/hourly_slots/hour-001`);
  assert.deepEqual((await slotRef.get()).data()?.workerIdsSnapshot, ['cycle-worker']);
  assert.equal((await slotRef.get()).data()?.workersSnapshot.length, 1);
  await call('manager', 'prepare', prepare, 'prepare-other', otherOrderId);
  await call('manager', 'approve', {}, 'approve-other', otherOrderId);
  await call('supervisor', 'assignWorkers', { workerIds: ['cycle-worker'] }, 'workers-other', otherOrderId);
  await assert.rejects(call('supervisor', 'start', { slotId: 'hour-001' }, 'start-other', otherOrderId));
  await assert.rejects(call('supervisor', 'pause', { slotId: 'hour-001', reason: '' }));
  await call('supervisor', 'pause', { slotId: 'hour-001', reason: 'عطل تجريبي' }, 'pause');
  await assert.rejects(call('supervisor', 'submit', { slotId: 'hour-001', actualQuantity: 50, rejectedQuantity: 0 }));
  await call('supervisor', 'resume', { slotId: 'hour-001' });
  assert.ok((await slotRef.collection('stops').doc('pause').get()).data()?.endedAt);
  await assert.rejects(call('supervisor', 'submit', { slotId: 'hour-001', actualQuantity: 50, rejectedQuantity: 51 }));
  const submitted = await call('supervisor', 'submit', { slotId: 'hour-001', actualQuantity: 50, rejectedQuantity: 2 }, 'submit');
  assert.deepEqual(await call('supervisor', 'submit', { rejectedQuantity: 2, actualQuantity: 50, slotId: 'hour-001' }, 'submit'), submitted);
  await assert.rejects(call('supervisor', 'submit', { slotId: 'hour-001', actualQuantity: 60, rejectedQuantity: 2 }, 'submit'));
  const order = (await db.doc(`work_orders/${orderId}`).get()).data()!;
  assert.equal(order.producedQuantity, 50);
  assert.equal(order.approvedAcceptedQuantity, 0, 'Production is not quality-approved acceptance');
  const submittedSlot = (await slotRef.get()).data()!;
  const reassignPayload = { supervisorUid: 'outsider', reason: 'تسليم المتابعة', expectedRevision: order.cycleRevision };
  const reassigned = await call('manager', 'reassignSupervisor', reassignPayload, 'reassign-after-hour');
  assert.deepEqual(await call('manager', 'reassignSupervisor', reassignPayload, 'reassign-after-hour'), reassigned);
  assert.deepEqual((await slotRef.get()).data(), submittedSlot, 'Reassignment preserves historical hour records');
  await call('manager', 'reassignSupervisor', { supervisorUid: 'supervisor', reason: 'عودة المتابعة', expectedRevision: reassigned.revision });
  assert.equal(submittedSlot.productionDocumentId, `${orderId}--hour-001--production-v1`);
  const beforeRead = (await db.doc(`work_orders/${orderId}`).get()).data()!.cycleRevision;
  await readWorkOrderCycle('supervisor', { orderId });
  await readWorkOrderCycle('supervisor', { orderId });
  assert.equal((await db.doc(`work_orders/${orderId}`).get()).data()?.cycleRevision, beforeRead, 'Opening/printing a container does not mutate it');
  await call('supervisor', 'start', { slotId: 'hour-002' });
  assert.equal((await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()?.status, 'quality_pending', 'Pending quality does not block next day');
  const client = env.authenticatedContext('manager').firestore();
  await assertSucceeds(client.doc(`work_orders/${orderId}`).get());
  await assertFails(env.authenticatedContext('outsider').firestore().doc(`work_orders/${orderId}`).get());
  await assertSucceeds(env.authenticatedContext('inspector1').firestore().doc(`work_orders/${orderId}`).get());
  await assertSucceeds(client.doc(`work_orders/legacy-${suffix}`).set({ tenantId, status: 'pending' }));
  await assertSucceeds(client.doc(`production_reports/legacy-report-${suffix}`).set({ tenantId, workOrderId: `legacy-${suffix}`, quantityProduced: 1 }));
  await assertFails(client.doc(`production_reports/blocked-report-${suffix}`).set({ tenantId, workOrderId: orderId, quantityProduced: 1 }));
  await assertFails(client.doc(`production_reports/legacy-report-${suffix}`).update({ workOrderId: orderId }));
  await assertFails(client.doc(`work_orders/${orderId}/hourly_slots/hour-001/quality_contributions/fake`).set({ tenantId, acceptedQuantity: 99 }));
  await assertSucceeds(client.doc(`work_orders/legacy-${suffix}`).update({ status: 'in_progress' }));
  const legacySlot = client.doc(`work_orders/legacy-${suffix}/hourly_slots/hour-001`);
  await assertSucceeds(legacySlot.set({ tenantId, workOrderId: `legacy-${suffix}`, status: 'planned', targetQuantity: 10 }));
  await assertSucceeds(legacySlot.update({ status: 'open', workersSnapshotCount: 1 }));
  await assertFails(client.doc(`work_orders/legacy-${suffix}`).update({ cycleVersion: 2 }));
  await assertFails(client.doc(`work_orders/${orderId}`).update({ productionStatus: 'closed' }));
  await assertFails(client.doc(`work_orders/${orderId}`).update({ cycleVersion: 1 }));
  await assertFails(client.doc(`work_orders/${orderId}`).delete());
  await assertFails(client.doc(`work_orders/${orderId}/hourly_slots/hour-002`).update({ status: 'quality_pending', actualQuantity: 999 }));
  await assertFails(client.doc(`work_orders/${orderId}/cycle_audit/fake`).set({ tenantId }));
  await assertFails(client.doc(`work_orders/forged-${suffix}`).set({ tenantId, cycleVersion: 2 }));
  await assertFails(client.doc(`work_order_line_states/${tenantId}--line-${suffix}`).set({ tenantId, activeOrderId: null }));
  assert.equal((await db.doc(`work_orders/${orderId}/cycle_requests/submit`).get()).data()?.result.revision, submitted.revision);
  console.log('PASS: permissions, tenancy, approval, assignments, multi-day, concurrency, line lock, pauses, idempotency, and direct-write rejection');
} finally {
  await env.cleanup();
  await db.terminate();
}
