import assert from 'node:assert/strict';
import { getDb } from '../functions/src/adminApp';
import { executeWorkOrderCycle } from '../functions/src/workOrderCycle';

if (!process.env.GCLOUD_PROJECT?.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local demo emulator required');
const db = getDb(); const suffix = Date.now().toString(); const tenantId = `plc-${suffix}`;
const users = {
  manager: { 'workOrders.create': true, 'workOrders.approve': true },
  quality: { 'workOrders.assignInspectors': true },
  inspector: { 'workOrders.inspect': true },
  supervisor: { 'workOrders.execute': true },
  otherSupervisor: { 'workOrders.execute': true },
  packaging: { 'productionHandover.approve': true },
};
const uid = (name: keyof typeof users) => `${tenantId}-${name}`;
for (const [name, permissions] of Object.entries(users)) {
  const person = `${tenantId}-${name}`;
  await db.doc(`roles/${person}`).set({ tenantId, permissions });
  await db.doc(`users/${person}`).set({ tenantId, roleId: person, isActive: true, displayName: name });
}
await db.doc(`employees/${tenantId}`).set({ tenantId, isActive: true });
const template = [{ id: 'w', label: 'وزن', inputType: 'number', required: true }];

function callFor(orderId: string) {
  return (person: keyof typeof users, action: Parameters<typeof executeWorkOrderCycle>[1]['action'], payload: Record<string, unknown> = {}, requestId: string = crypto.randomUUID()) =>
    executeWorkOrderCycle(uid(person), { orderId, action, payload, requestId });
}

// ---- Planning: suggestion based on this order's own actual rate, propose -> supersede -> apply -> stale re-apply rejected ----
{
  const productId = `${tenantId}-rate-product`; const lineId = `${tenantId}-rate-line`;
  await db.doc(`products/${productId}`).set({ tenantId, isActive: true, name: 'Rate Product', code: 'RATE-1' });
  await db.doc(`production_lines/${lineId}`).set({ tenantId, isActive: true });
  const orderId = `${tenantId}-rate-order`;
  const call = callFor(orderId);
  await call('manager', 'prepare', { productId, lineId, supervisorUid: uid('supervisor'), quantity: 100, workOrderNumber: orderId, slots: [{ date: '2026-09-13', startTime: '08:00', endTime: '09:00', targetQuantity: 50 }, { date: '2026-09-13', startTime: '09:00', endTime: '10:00', targetQuantity: 50 }] });
  await call('quality', 'defineQualityReport', { qualityReportTemplate: template });
  await call('quality', 'assignInspectors', { inspectorUids: [uid('inspector')] });
  await call('manager', 'approve');
  await call('supervisor', 'assignWorkers', { workerIds: [tenantId] });
  await call('supervisor', 'start', { slotId: 'hour-001' });
  await call('supervisor', 'submit', { slotId: 'hour-001', actualQuantity: 50, rejectedQuantity: 0 });
  await call('inspector', 'claimQualityInspection', { slotId: 'hour-001' });
  let slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  await call('inspector', 'submitQualityReport', { slotId: 'hour-001', claimId: slot.qualityClaim.id, inspectedQuantity: 50, acceptedQuantity: 40, rejectedQuantity: 10, qualityResults: [{ checkId: 'w', value: 1 }] });
  await call('quality', 'approveQualityReport', { slotId: 'hour-001' });

  // Only the production manager may propose or apply a plan revision.
  await assert.rejects(call('supervisor', 'proposePlanRevision'), 'Only workOrders.approve may propose a plan revision');

  await call('manager', 'proposePlanRevision');
  let revisions = (await db.collection(`work_orders/${orderId}/plan_revisions`).orderBy('proposedAt', 'desc').get()).docs;
  assert.equal(revisions.length, 1);
  const first = revisions[0].data();
  assert.equal(first.status, 'proposed');
  assert.equal(first.basis.rateSource, 'this_order', 'Rate is derived from this order\'s own completed hour, not a fallback');
  assert.equal(first.basis.ratePerHour, 40, '40 accepted units over 1 actual operating hour');
  assert.equal(first.remainingToTarget, 60, '100 target - 40 achieved');
  assert.equal(first.slots.length, 1);
  assert.equal(first.slots[0].slotId, 'hour-002');
  assert.equal(first.slots[0].previousTargetQuantity, 50);
  assert.equal(first.slots[0].proposedTargetQuantity, 60, 'Sole remaining planned hour absorbs the full remaining target');

  // Proposing again supersedes the previous proposal instead of leaving two live proposals.
  await call('manager', 'proposePlanRevision');
  revisions = (await db.collection(`work_orders/${orderId}/plan_revisions`).orderBy('proposedAt', 'desc').get()).docs;
  assert.equal(revisions.length, 2);
  const [second, supersededFirst] = revisions.map(doc => doc.data());
  assert.equal(supersededFirst.status, 'superseded');
  assert.equal(second.status, 'proposed');

  // Applying a superseded proposal is rejected; the target quantity is untouched before a real apply.
  await assert.rejects(call('manager', 'applyPlanRevision', { revisionId: revisions[1].id }), 'A superseded proposal can no longer be applied');
  await call('manager', 'applyPlanRevision', { revisionId: revisions[0].id });
  slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-002`).get()).data()!;
  assert.equal(slot.targetQuantity, 60, 'The not-yet-started hour\'s target was updated by the approved proposal');
  assert.equal(slot.status, 'planned', 'Applying a plan revision never changes the hour\'s date/time or starts it');

  // Re-applying the same (now-approved) revision is rejected — it is no longer "proposed".
  await assert.rejects(call('manager', 'applyPlanRevision', { revisionId: revisions[0].id }), 'An already-applied revision cannot be re-applied');

  console.log('PASS: planning proposal uses this order\'s own actual rate, supersedes prior proposals, and only a fresh manager approval changes an unstarted hour\'s target');
}

// ---- Planning: no historical data at all falls back to the originally approved plan, flagged low-confidence ----
{
  const productId = `${tenantId}-fresh-product`; const lineId = `${tenantId}-fresh-line`;
  await db.doc(`products/${productId}`).set({ tenantId, isActive: true, name: 'Fresh Product', code: 'FRESH-1' });
  await db.doc(`production_lines/${lineId}`).set({ tenantId, isActive: true });
  const orderId = `${tenantId}-fresh-order`;
  const call = callFor(orderId);
  await call('manager', 'prepare', { productId, lineId, supervisorUid: uid('supervisor'), quantity: 100, workOrderNumber: orderId, slots: [
    { date: '2026-09-13', startTime: '08:00', endTime: '09:00', targetQuantity: 30 },
    { date: '2026-09-13', startTime: '09:00', endTime: '10:00', targetQuantity: 30 },
    { date: '2026-09-13', startTime: '10:00', endTime: '11:00', targetQuantity: 40 },
  ] });
  await call('manager', 'approve');
  await call('manager', 'proposePlanRevision');
  const revision = (await db.collection(`work_orders/${orderId}/plan_revisions`).orderBy('proposedAt', 'desc').limit(1).get()).docs[0].data();
  assert.equal(revision.basis.rateSource, 'original_plan_fallback', 'No completed hour anywhere for this product/line yet');
  assert.equal(revision.basis.lowConfidence, true);
  assert.equal(revision.basis.ratePerHour, null);
  assert.deepEqual(revision.slots.map((s: { proposedTargetQuantity: number }) => s.proposedTargetQuantity), [30, 30, 40], 'Nothing achieved yet, so the fallback reproduces the originally approved plan');

  // A hand with no not-yet-started hours left has nothing to redistribute.
  await call('supervisor', 'assignWorkers', { workerIds: [tenantId] });
  await call('supervisor', 'start', { slotId: 'hour-001' });
  await call('supervisor', 'submit', { slotId: 'hour-001', actualQuantity: 30, rejectedQuantity: 0 });
  await db.doc(`work_orders/${orderId}/hourly_slots/hour-002`).update({ status: 'cancelled' });
  await db.doc(`work_orders/${orderId}/hourly_slots/hour-003`).update({ status: 'cancelled' });
  await assert.rejects(call('manager', 'proposePlanRevision'), 'No planned hours left to redistribute');

  console.log('PASS: with no performance data anywhere for a product/line, the plan proposal falls back to the approved plan and is explicitly flagged low-confidence');
}

// ---- Closing: every hard blocker rejects in turn; a resolved order closes with deficit + cancellation; packaging stays open ----
{
  const productId = `${tenantId}-close-product`; const lineId = `${tenantId}-close-line`;
  await db.doc(`products/${productId}`).set({ tenantId, isActive: true, name: 'Close Product', code: 'CLOSE-1' });
  await db.doc(`production_lines/${lineId}`).set({ tenantId, isActive: true });
  const orderId = `${tenantId}-close-order`;
  const call = callFor(orderId);
  const slotSpec = (n: number) => ({ date: '2026-09-13', startTime: `${String(7 + n).padStart(2, '0')}:00`, endTime: `${String(8 + n).padStart(2, '0')}:00`, targetQuantity: 25 });
  await call('manager', 'prepare', { productId, lineId, supervisorUid: uid('supervisor'), quantity: 100, workOrderNumber: orderId, slots: [slotSpec(1), slotSpec(2), slotSpec(3), slotSpec(4)] });
  await call('quality', 'defineQualityReport', { qualityReportTemplate: template });
  await call('quality', 'assignInspectors', { inspectorUids: [uid('inspector')] });

  // Cannot close a draft order — production has not even been approved yet.
  await assert.rejects(call('manager', 'closeProduction'), 'Cannot close a draft order');

  await call('manager', 'approve');
  await call('supervisor', 'assignWorkers', { workerIds: [tenantId] });
  await call('supervisor', 'start', { slotId: 'hour-001' });

  // Blocker: a currently running (open) hour.
  await assert.rejects(call('manager', 'closeProduction'), 'An open hour blocks closing');

  await call('supervisor', 'submit', { slotId: 'hour-001', actualQuantity: 25, rejectedQuantity: 5 });

  // Blocker: an hour awaiting quality approval.
  await assert.rejects(call('manager', 'closeProduction'), 'An hour pending quality approval blocks closing');

  await call('inspector', 'claimQualityInspection', { slotId: 'hour-001' });
  let slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  await call('inspector', 'submitQualityReport', { slotId: 'hour-001', claimId: slot.qualityClaim.id, inspectedQuantity: 25, acceptedQuantity: 20, rejectedQuantity: 5, qualityResults: [{ checkId: 'w', value: 1 }] });
  await call('quality', 'approveQualityReport', { slotId: 'hour-001' });

  // Blocker: an approved rejected quantity with no disposition decision yet.
  await assert.rejects(call('manager', 'closeProduction'), 'An undecided rejected quantity blocks closing');

  await call('quality', 'decideRejectedDisposition', { slotId: 'hour-001', reworkQuantity: 3, scrapQuantity: 2, reason: 'rework what can be saved' });
  const attempts = await db.collection(`work_orders/${orderId}/hourly_slots/hour-001/rework_attempts`).get();
  const attemptId = attempts.docs[0].id;

  // Blocker: a rework attempt still in flight (planned).
  await assert.rejects(call('manager', 'closeProduction'), 'A rework attempt awaiting production blocks closing');

  await call('supervisor', 'submitRework', { slotId: 'hour-001', attemptId, actualQuantity: 3 });

  // Blocker: a rework attempt awaiting quality re-inspection.
  await assert.rejects(call('manager', 'closeProduction'), 'A rework attempt awaiting re-inspection blocks closing');

  await call('inspector', 'claimReworkInspection', { slotId: 'hour-001', attemptId });
  const attempt = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001/rework_attempts/${attemptId}`).get()).data()!;
  await call('inspector', 'submitReworkQualityReport', { slotId: 'hour-001', attemptId, claimId: attempt.qualityClaim.id, inspectedQuantity: 3, acceptedQuantity: 3, rejectedQuantity: 0, qualityResults: [{ checkId: 'w', value: 1 }] });
  await call('quality', 'approveReworkQualityReport', { slotId: 'hour-001', attemptId });

  // All blockers resolved; hours 2-4 are still unstarted, and 23 of 100 units are achieved — closing now requires a reason.
  const order = (await db.doc(`work_orders/${orderId}`).get()).data()!;
  assert.equal(order.approvedAcceptedQuantity, 23, '20 from the original inspection + 3 from the accepted rework attempt, counted once');
  await assert.rejects(call('manager', 'closeProduction'), 'A reason is mandatory when there is a deficit or unstarted hours to cancel');

  // Only workOrders.approve may close production — a plain execute-permission supervisor, even one uninvolved in this order, cannot.
  await assert.rejects(call('otherSupervisor', 'closeProduction', { reason: 'End of shift; remaining demand cancelled' }), 'An execute-only supervisor cannot close production');

  await call('manager', 'closeProduction', { reason: 'End of shift; remaining demand cancelled' });
  const closed = (await db.doc(`work_orders/${orderId}`).get()).data()!;
  assert.equal(closed.productionStatus, 'closed');
  assert.equal(closed.productionClosedWithDeficit, true);
  assert.equal(closed.productionClosedCancelledSlotCount, 3);
  assert.equal(closed.productionClosedByName, 'manager');
  for (const id of ['hour-002', 'hour-003', 'hour-004']) {
    const cancelled = (await db.doc(`work_orders/${orderId}/hourly_slots/${id}`).get()).data()!;
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.cancelledReason, 'End of shift; remaining demand cancelled');
    assert.ok(cancelled.cancelledAt);
  }

  // Production status is independent of packaging/delivery: packaging still works after production is closed.
  await call('packaging', 'receivePackaging', { slotId: 'hour-001', quantity: 10 });
  slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  assert.equal(slot.packagingReceivedQuantity, 10, 'Packaging remains available after production is closed');

  // But production-side actions are now blocked.
  await assert.rejects(call('quality', 'lockQuality', { reason: 'too late' }), 'Production actions are blocked once the order is closed');
  await assert.rejects(call('manager', 'closeProduction', { reason: 'again' }), 'Cannot close an already-closed order');

  console.log('PASS: closing enforces every blocker in turn, requires a reason for deficit/early closure, cancels unstarted hours with a preserved reason and timestamp, and leaves packaging independently open while blocking further production actions');
}
