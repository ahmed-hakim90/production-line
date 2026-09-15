import assert from 'node:assert/strict';
import { getDb } from '../functions/src/adminApp';
import { executeWorkOrderCycle } from '../functions/src/workOrderCycle';

if (!process.env.GCLOUD_PROJECT?.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local demo emulator required');
const db = getDb(); const suffix = Date.now().toString(); const tenantId = `qa-${suffix}`;
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
await db.doc(`production_lines/${tenantId}`).set({ tenantId, isActive: true });
await db.doc(`employees/${tenantId}`).set({ tenantId, isActive: true });

async function freshOrder(orderId: string, quantity: number) {
  const call = (person: keyof typeof users, action: Parameters<typeof executeWorkOrderCycle>[1]['action'], payload: Record<string, unknown> = {}, requestId: string = crypto.randomUUID()) => executeWorkOrderCycle(uid(person), { orderId, action, payload, requestId });
  await call('manager', 'prepare', { productId: tenantId, lineId: tenantId, supervisorUid: uid('supervisor'), quantity, workOrderNumber: orderId, slots: [{ date: '2026-09-13', startTime: '08:00', endTime: '09:00', targetQuantity: quantity }] });
  await call('quality', 'defineQualityReport', { qualityReportTemplate: [{ id: 'w', label: 'وزن', inputType: 'number', required: true }] });
  await call('quality', 'assignInspectors', { inspectorUids: [uid('inspector')] });
  await call('manager', 'approve');
  await call('supervisor', 'assignWorkers', { workerIds: [tenantId] });
  await call('supervisor', 'start', { slotId: 'hour-001' });
  await call('supervisor', 'submit', { slotId: 'hour-001', actualQuantity: quantity, rejectedQuantity: 0 });
  await call('inspector', 'claimQualityInspection', { slotId: 'hour-001' });
  const claimId = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!.qualityClaim.id;
  await call('inspector', 'submitQualityReport', { slotId: 'hour-001', claimId, inspectedQuantity: quantity, acceptedQuantity: quantity - 5, rejectedQuantity: 5, qualityResults: [{ checkId: 'w', value: 1 }] });
  return { call };
}

// 1. Approval path: updates order total, locks slot, blocks a second approval, blocks correction before approval boundary conditions.
{
  const orderId = `qa-approve-${suffix}`;
  const { call } = await freshOrder(orderId, 100);
  await assert.rejects(call('manager', 'approveQualityReport', { slotId: 'hour-001' }), 'Only the quality manager may approve');
  await call('quality', 'approveQualityReport', { slotId: 'hour-001' });
  let order = (await db.doc(`work_orders/${orderId}`).get()).data()!;
  let slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  assert.equal(order.approvedAcceptedQuantity, 95, 'Approval posts the inspected-accepted total once');
  assert.equal(slot.status, 'quality_accepted');
  assert.equal(slot.qualityApprovedAcceptedQuantity, 95);
  assert.equal(slot.qualityApprovedRejectedQuantity, 5);
  await assert.rejects(call('quality', 'approveQualityReport', { slotId: 'hour-001' }), 'Approving an already-accepted slot is rejected, not re-applied');
  order = (await db.doc(`work_orders/${orderId}`).get()).data()!;
  assert.equal(order.approvedAcceptedQuantity, 95, 'No double counting from the rejected replay attempt');

  // 2. Correction: reallocates accepted/rejected without touching the original inspected total, delta-applied to order total, history kept.
  await assert.rejects(call('quality', 'correctQualityReport', { slotId: 'hour-001', acceptedQuantity: 90, rejectedQuantity: 5, reason: 'x' }), 'Accepted+rejected must still equal the inspected total (100)');
  await call('quality', 'correctQualityReport', { slotId: 'hour-001', acceptedQuantity: 90, rejectedQuantity: 10, reason: 'إعادة عد فعلية' });
  order = (await db.doc(`work_orders/${orderId}`).get()).data()!;
  slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  assert.equal(order.approvedAcceptedQuantity, 90, 'Order total moves by the correction delta only');
  assert.equal(slot.qualityApprovedAcceptedQuantity, 90);
  assert.equal(slot.qualityCorrectionCount, 1);
  const corrections = await db.collection(`work_orders/${orderId}/hourly_slots/hour-001/quality_corrections`).get();
  assert.equal(corrections.size, 1);
  assert.equal(corrections.docs[0].data().previousAcceptedQuantity, 95, 'Original approval value preserved in the correction log, not overwritten');
  await assert.rejects(call('quality', 'correctQualityReport', { slotId: 'hour-001', acceptedQuantity: 90, rejectedQuantity: 10, reason: 'no-op' }), 'A correction that changes nothing is rejected');
  await assert.rejects(call('quality', 'correctQualityReport', { slotId: 'hour-001', acceptedQuantity: 5, rejectedQuantity: 5, reason: 'x' }), 'A correction must still sum to the inspected total');
}

// 3. Return path: clears contributions for re-inspection, never touches order.approvedAcceptedQuantity (nothing was approved yet).
{
  const orderId = `qa-return-${suffix}`;
  const { call } = await freshOrder(orderId, 50);
  await assert.rejects(call('supervisor', 'returnQualityReport', { slotId: 'hour-001', reason: 'x' }), 'Only the quality manager may return');
  await assert.rejects(call('quality', 'returnQualityReport', { slotId: 'hour-001' }), 'Reason is mandatory for a return');
  await call('quality', 'returnQualityReport', { slotId: 'hour-001', reason: 'خطأ في القراءة' });
  const order = (await db.doc(`work_orders/${orderId}`).get()).data()!;
  const slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  assert.equal(order.approvedAcceptedQuantity, 0, 'A return before approval never touches the approved total');
  assert.equal(slot.status, 'quality_pending', 'Slot stays open for a fresh inspection pass');
  assert.equal(slot.inspectedQuantity, 0);
  assert.equal(slot.inspectedAcceptedQuantity, 0);
  const liveContributions = await db.collection(`work_orders/${orderId}/hourly_slots/hour-001/quality_contributions`).get();
  assert.equal(liveContributions.size, 0, 'Prior contributions are removed from the live collection after a return');
  const returns = await db.collection(`work_orders/${orderId}/hourly_slots/hour-001/quality_returns`).get();
  assert.equal(returns.size, 1, 'The returned contributions are preserved in a separate audit log');
  assert.equal(returns.docs[0].data().contributions.length, 1);
  assert.equal(returns.docs[0].data().reason, 'خطأ في القراءة');
  // Re-inspection after return works cleanly and can still be approved.
  await call('inspector', 'claimQualityInspection', { slotId: 'hour-001' });
  const claimId = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!.qualityClaim.id;
  await call('inspector', 'submitQualityReport', { slotId: 'hour-001', claimId, inspectedQuantity: 50, acceptedQuantity: 50, rejectedQuantity: 0, qualityResults: [{ checkId: 'w', value: 1 }] });
  await call('quality', 'approveQualityReport', { slotId: 'hour-001' });
  assert.equal((await db.doc(`work_orders/${orderId}`).get()).data()!.approvedAcceptedQuantity, 50, 'No leftover count from the discarded pre-return contribution');
}

// 4. Approving before inspection is complete is rejected.
{
  const orderId = `qa-incomplete-${suffix}`;
  const call = (person: keyof typeof users, action: Parameters<typeof executeWorkOrderCycle>[1]['action'], payload: Record<string, unknown> = {}, requestId: string = crypto.randomUUID()) => executeWorkOrderCycle(uid(person), { orderId, action, payload, requestId });
  await call('manager', 'prepare', { productId: tenantId, lineId: tenantId, supervisorUid: uid('supervisor'), quantity: 20, workOrderNumber: orderId, slots: [{ date: '2026-09-13', startTime: '08:00', endTime: '09:00', targetQuantity: 20 }] });
  await call('quality', 'defineQualityReport', { qualityReportTemplate: [{ id: 'w', label: 'وزن', inputType: 'number', required: true }] });
  await call('quality', 'assignInspectors', { inspectorUids: [uid('inspector')] });
  await call('manager', 'approve');
  await call('supervisor', 'assignWorkers', { workerIds: [tenantId] });
  await call('supervisor', 'start', { slotId: 'hour-001' });
  await call('supervisor', 'submit', { slotId: 'hour-001', actualQuantity: 20, rejectedQuantity: 0 });
  await call('inspector', 'claimQualityInspection', { slotId: 'hour-001' });
  const claimId = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!.qualityClaim.id;
  await call('inspector', 'submitQualityReport', { slotId: 'hour-001', claimId, inspectedQuantity: 12, acceptedQuantity: 12, rejectedQuantity: 0, qualityResults: [{ checkId: 'w', value: 1 }] });
  await assert.rejects(call('quality', 'approveQualityReport', { slotId: 'hour-001' }), 'Cannot approve while 8 units remain uninspected');
  // Return remains available even mid-inspection (clears the partial contribution too, no silent loss).
  await call('quality', 'returnQualityReport', { slotId: 'hour-001', reason: 'إعادة توزيع الفحص' });
  const slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  assert.equal(slot.inspectedQuantity, 0, 'Return clears partial progress too, not just completed inspections');
}

console.log('PASS: quality approval, return-for-reinspection, and documented correction — no double counting');
