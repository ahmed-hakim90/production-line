import assert from 'node:assert/strict';
import { getDb } from '../functions/src/adminApp';
import { executeWorkOrderCycle } from '../functions/src/workOrderCycle';
import { readWorkOrderCycle } from '../functions/src/workOrderCycleRead';

if (!process.env.GCLOUD_PROJECT?.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local demo emulator required');
const db = getDb(); const suffix = Date.now().toString(); const tenantId = `qlr-${suffix}`;
const users = {
  manager: { 'workOrders.create': true, 'workOrders.approve': true },
  quality: { 'workOrders.assignInspectors': true },
  inspector: { 'workOrders.inspect': true },
  supervisor: { 'workOrders.execute': true },
};
const uid = (name: keyof typeof users) => `${tenantId}-${name}`;
for (const [name, permissions] of Object.entries(users)) {
  const person = `${tenantId}-${name}`;
  await db.doc(`roles/${person}`).set({ tenantId, permissions });
  await db.doc(`users/${person}`).set({ tenantId, roleId: person, isActive: true, displayName: name });
}
await db.doc(`products/${tenantId}`).set({ tenantId, isActive: true });
// Separate lines per scenario: work_order_line_states is a per-line lock, and each block below
// deliberately leaves its hour mid-flight (paused/open) rather than submitted, so sharing one line
// across blocks would make a later block's 'start' fail on the earlier block's still-active hour.
for (const n of [1, 2, 3, 4]) await db.doc(`production_lines/${tenantId}-line${n}`).set({ tenantId, isActive: true });
await db.doc(`employees/${tenantId}`).set({ tenantId, isActive: true });

function makeCall(orderId: string) {
  return (person: keyof typeof users, action: Parameters<typeof executeWorkOrderCycle>[1]['action'], payload: Record<string, unknown> = {}, requestId: string = crypto.randomUUID()) =>
    executeWorkOrderCycle(uid(person), { orderId, action, payload, requestId });
}

// 1. Lock while the hour is running (no prior independent stop): pauses it with source 'quality_lock'; unlocking auto-resumes.
{
  const orderId = `qlr-auto-${suffix}`;
  const call = makeCall(orderId);
  await call('manager', 'prepare', { productId: tenantId, lineId: `${tenantId}-line1`, supervisorUid: uid('supervisor'), quantity: 10, workOrderNumber: orderId, slots: [{ date: '2026-09-13', startTime: '08:00', endTime: '09:00', targetQuantity: 10 }] });
  await call('manager', 'approve');
  await call('supervisor', 'assignWorkers', { workerIds: [tenantId] });
  await call('supervisor', 'start', { slotId: 'hour-001' });

  await assert.rejects(call('supervisor', 'lockQuality', { reason: 'x' }), 'Only the quality manager may lock');
  await assert.rejects(call('quality', 'lockQuality', {}), 'A lock reason is mandatory');
  await call('quality', 'lockQuality', { reason: 'شبهة عيب تصنيع' });
  let order = (await db.doc(`work_orders/${orderId}`).get()).data()!;
  let slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  assert.equal(order.qualityHold, true);
  assert.equal(slot.status, 'paused', 'The running hour is stopped immediately by the lock');
  const stops = await db.collection(`work_orders/${orderId}/hourly_slots/hour-001/stops`).get();
  assert.equal(stops.size, 1);
  assert.equal(stops.docs[0].data().source, 'quality_lock');

  await assert.rejects(call('supervisor', 'resume', { slotId: 'hour-001' }), 'Resume is blocked while the quality hold is active, regardless of who caused the stop');
  await assert.rejects(call('quality', 'lockQuality', { reason: 'مرة أخرى' }), 'Cannot lock an already-locked order');

  await call('quality', 'unlockQuality', {});
  order = (await db.doc(`work_orders/${orderId}`).get()).data()!;
  slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  assert.equal(order.qualityHold, false);
  assert.equal(slot.status, 'open', 'Unlock auto-resumes a stop it caused itself');
  const holds = await db.collection(`work_orders/${orderId}/quality_holds`).get();
  assert.equal(holds.size, 2, 'Both the lock and the unlock are logged');
}

// 2. Lock while an independent (supervisor) stop already exists: unlocking must NOT auto-resume it.
{
  const orderId = `qlr-independent-${suffix}`;
  const call = makeCall(orderId);
  await call('manager', 'prepare', { productId: tenantId, lineId: `${tenantId}-line2`, supervisorUid: uid('supervisor'), quantity: 10, workOrderNumber: orderId, slots: [{ date: '2026-09-13', startTime: '08:00', endTime: '09:00', targetQuantity: 10 }] });
  await call('manager', 'approve');
  await call('supervisor', 'assignWorkers', { workerIds: [tenantId] });
  await call('supervisor', 'start', { slotId: 'hour-001' });
  await call('supervisor', 'pause', { slotId: 'hour-001', reason: 'عطل ميكانيكي مستقل' });

  await call('quality', 'lockQuality', { reason: 'مراجعة جودة' });
  let slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  assert.equal(slot.status, 'paused');
  const stops = await db.collection(`work_orders/${orderId}/hourly_slots/hour-001/stops`).get();
  assert.equal(stops.size, 1, 'Locking over an already-paused hour does not create a second stop record');
  assert.equal(stops.docs[0].data().source, 'production', 'The original independent stop is preserved untouched');

  await call('quality', 'unlockQuality', {});
  slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  assert.equal(slot.status, 'paused', 'Unlock does not auto-resume an independent stop');
  await call('supervisor', 'resume', { slotId: 'hour-001' });
  slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  assert.equal(slot.status, 'open', 'Once unlocked, the supervisor can still resume their own independent stop manually');
}

// 3. Lock with no running hour: no crash, next hour can start manually but is not auto-started, and stays blocked while locked.
{
  const orderId = `qlr-idle-${suffix}`;
  const call = makeCall(orderId);
  await call('manager', 'prepare', { productId: tenantId, lineId: `${tenantId}-line3`, supervisorUid: uid('supervisor'), quantity: 10, workOrderNumber: orderId, slots: [{ date: '2026-09-13', startTime: '08:00', endTime: '09:00', targetQuantity: 10 }] });
  await call('manager', 'approve');
  await call('quality', 'lockQuality', { reason: 'قفل مبكر قبل التشغيل' });
  await call('supervisor', 'assignWorkers', { workerIds: [tenantId] });
  await assert.rejects(call('supervisor', 'start', { slotId: 'hour-001' }), 'Starting the next hour is blocked while locked, with no running hour to begin with');
  await call('quality', 'unlockQuality', {});
  await call('supervisor', 'start', { slotId: 'hour-001' });
  const slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  assert.equal(slot.status, 'open', 'Unlocking never auto-starts a slot itself — the supervisor must start it explicitly');
}

// 4. Rejected disposition + rework + inspect + approve: matching quantities, no double production count.
{
  const orderId = `qlr-rework-${suffix}`;
  const call = makeCall(orderId);
  await call('manager', 'prepare', { productId: tenantId, lineId: `${tenantId}-line4`, supervisorUid: uid('supervisor'), quantity: 100, workOrderNumber: orderId, slots: [{ date: '2026-09-13', startTime: '08:00', endTime: '09:00', targetQuantity: 100 }] });
  await call('quality', 'defineQualityReport', { qualityReportTemplate: [{ id: 'w', label: 'وزن', inputType: 'number', required: true }] });
  await call('quality', 'assignInspectors', { inspectorUids: [uid('inspector')] });
  await call('manager', 'approve');
  await call('supervisor', 'assignWorkers', { workerIds: [tenantId] });
  await call('supervisor', 'start', { slotId: 'hour-001' });
  await call('supervisor', 'submit', { slotId: 'hour-001', actualQuantity: 100, rejectedQuantity: 0 });
  await call('inspector', 'claimQualityInspection', { slotId: 'hour-001' });
  let claimId = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!.qualityClaim.id;
  // 80 accepted, 20 rejected on the first pass.
  await call('inspector', 'submitQualityReport', { slotId: 'hour-001', claimId, inspectedQuantity: 100, acceptedQuantity: 80, rejectedQuantity: 20, qualityResults: [{ checkId: 'w', value: 1 }] });
  await call('quality', 'approveQualityReport', { slotId: 'hour-001' });
  const orderAfterApproval = (await db.doc(`work_orders/${orderId}`).get()).data()!;
  assert.equal(orderAfterApproval.approvedAcceptedQuantity, 80);
  const producedBeforeRework = orderAfterApproval.producedQuantity;

  await assert.rejects(call('supervisor', 'decideRejectedDisposition', { slotId: 'hour-001', reworkQuantity: 12, scrapQuantity: 8, reason: 'x' }), 'Only the quality manager decides disposition');
  await assert.rejects(call('quality', 'decideRejectedDisposition', { slotId: 'hour-001', reworkQuantity: 10, scrapQuantity: 8, reason: 'x' }), 'Rework + scrap must equal the total rejected (20)');
  // Split the 20 rejected units: 12 to rework, 8 to final scrap.
  await call('quality', 'decideRejectedDisposition', { slotId: 'hour-001', reworkQuantity: 12, scrapQuantity: 8, reason: 'قابلة لإعادة الفرز' });
  await assert.rejects(call('quality', 'decideRejectedDisposition', { slotId: 'hour-001', reworkQuantity: 12, scrapQuantity: 8, reason: 'x' }), 'A disposition decision cannot be repeated for the same container');

  const withRework = await readWorkOrderCycle(uid('manager'), { orderId });
  const readSlot = withRework.orders[0].slots.find(row => row.id === 'hour-001')!;
  assert.equal(readSlot.reworkAttempts?.length, 1, 'The rework_attempts subcollection is fetched for a slot with a decided rework quantity, not skipped');

  const attempts = await db.collection(`work_orders/${orderId}/hourly_slots/hour-001/rework_attempts`).get();
  assert.equal(attempts.size, 1);
  const attemptId = attempts.docs[0].id;
  assert.equal(attempts.docs[0].data().requestedQuantity, 12);
  assert.equal(attempts.docs[0].data().status, 'planned');

  await assert.rejects(call('quality', 'submitRework', { slotId: 'hour-001', attemptId, actualQuantity: 12 }), 'Only the supervisor submits rework output');
  await assert.rejects(call('supervisor', 'submitRework', { slotId: 'hour-001', attemptId, actualQuantity: 13 }), 'Rework output cannot exceed the quantity sent for rework (12)');
  await call('supervisor', 'submitRework', { slotId: 'hour-001', attemptId, actualQuantity: 11, notes: 'خسرت وحدة أثناء إعادة التشغيل' });
  let orderMidRework = (await db.doc(`work_orders/${orderId}`).get()).data()!;
  assert.equal(orderMidRework.producedQuantity, producedBeforeRework, 'Rework output never counts as new production');

  await call('inspector', 'claimReworkInspection', { slotId: 'hour-001', attemptId });
  const attemptClaim = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001/rework_attempts/${attemptId}`).get()).data()!.qualityClaim;
  await call('inspector', 'submitReworkQualityReport', { slotId: 'hour-001', attemptId, claimId: attemptClaim.id, inspectedQuantity: 11, acceptedQuantity: 10, rejectedQuantity: 1, qualityResults: [{ checkId: 'w', value: 1 }] });
  await assert.rejects(call('quality', 'approveReworkQualityReport', { slotId: 'hour-001', attemptId: 'not-real' }), 'Approving an unknown attempt fails cleanly');
  await call('quality', 'approveReworkQualityReport', { slotId: 'hour-001', attemptId });

  const orderFinal = (await db.doc(`work_orders/${orderId}`).get()).data()!;
  assert.equal(orderFinal.approvedAcceptedQuantity, 90, 'Original 80 + rework-accepted 10, added exactly once');
  assert.equal(orderFinal.producedQuantity, producedBeforeRework, 'Rework never inflates the produced/new-production counter');
  await assert.rejects(call('quality', 'approveReworkQualityReport', { slotId: 'hour-001', attemptId }), 'A second approval on the same attempt is rejected, not re-applied');
  const finalOrderCheck = (await db.doc(`work_orders/${orderId}`).get()).data()!;
  assert.equal(finalOrderCheck.approvedAcceptedQuantity, 90, 'No double counting from the rejected replay attempt');
}

console.log('PASS: quality lock (auto-resume vs independent stop preserved), and rework-attempt inspect/approve without double counting');
