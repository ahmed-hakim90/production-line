import assert from 'node:assert/strict';
import { getDb } from '../functions/src/adminApp';
import { executeWorkOrderCycle } from '../functions/src/workOrderCycle';

if (!process.env.GCLOUD_PROJECT?.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local demo emulator required');
const db = getDb(); const suffix = Date.now().toString(); const tenantId = `pkg-${suffix}`;
const users = {
  manager: { 'workOrders.create': true, 'workOrders.approve': true },
  quality: { 'workOrders.assignInspectors': true },
  inspector: { 'workOrders.inspect': true },
  supervisor: { 'workOrders.execute': true },
  packaging: { 'productionHandover.approve': true },
  other: { 'workOrders.create': true },
};
const uid = (name: keyof typeof users) => `${tenantId}-${name}`;
for (const [name, permissions] of Object.entries(users)) {
  const person = `${tenantId}-${name}`;
  await db.doc(`roles/${person}`).set({ tenantId, permissions });
  await db.doc(`users/${person}`).set({ tenantId, roleId: person, isActive: true, displayName: name });
}
await db.doc(`products/${tenantId}`).set({ tenantId, isActive: true, name: 'Packaging Test Product', code: 'PKG-1' });
await db.doc(`production_lines/${tenantId}`).set({ tenantId, isActive: true });
await db.doc(`employees/${tenantId}`).set({ tenantId, isActive: true });
await db.doc(`system_settings/${tenantId}`).set({ planSettings: { inventoryRouting: { finalProductWarehouseId: `${tenantId}-fg-warehouse` } } });

const call = (person: keyof typeof users, action: Parameters<typeof executeWorkOrderCycle>[1]['action'], payload: Record<string, unknown> = {}, requestId: string = crypto.randomUUID()) =>
  executeWorkOrderCycle(uid(person), { orderId, action, payload, requestId });

const orderId = `pkg-order-${suffix}`;
await call('manager', 'prepare', { productId: tenantId, lineId: tenantId, supervisorUid: uid('supervisor'), quantity: 100, workOrderNumber: orderId, slots: [{ date: '2026-09-13', startTime: '08:00', endTime: '09:00', targetQuantity: 100 }] });
await call('quality', 'defineQualityReport', { qualityReportTemplate: [{ id: 'w', label: 'وزن', inputType: 'number', required: true }] });
await call('quality', 'assignInspectors', { inspectorUids: [uid('inspector')] });
await call('manager', 'approve');
await call('supervisor', 'assignWorkers', { workerIds: [tenantId] });
await call('supervisor', 'start', { slotId: 'hour-001' });
await call('supervisor', 'submit', { slotId: 'hour-001', actualQuantity: 100, rejectedQuantity: 0 });
await call('inspector', 'claimQualityInspection', { slotId: 'hour-001' });
const claimId = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!.qualityClaim.id;
await call('inspector', 'submitQualityReport', { slotId: 'hour-001', claimId, inspectedQuantity: 100, acceptedQuantity: 100, rejectedQuantity: 0, qualityResults: [{ checkId: 'w', value: 1 }] });
await call('quality', 'approveQualityReport', { slotId: 'hour-001' });

// Non-packaging roles cannot receive.
await assert.rejects(call('supervisor', 'receivePackaging', { slotId: 'hour-001', quantity: 10 }), 'Only the packaging role may receive');

// Receiving beyond the approved-accepted quantity is rejected.
await assert.rejects(call('packaging', 'receivePackaging', { slotId: 'hour-001', quantity: 101 }), 'Cannot receive more than the approved-accepted total');

// 100 approved -> receive 60 (partial).
await call('packaging', 'receivePackaging', { slotId: 'hour-001', quantity: 60 });
let slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
assert.equal(slot.packagingReceivedQuantity, 60);
assert.equal(slot.qualityApprovedAcceptedQuantity - slot.packagingReceivedQuantity, 40, 'approved-not-received == 40');

// Package cannot exceed received.
await assert.rejects(call('packaging', 'packageContainer', { slotId: 'hour-001', quantity: 61 }), 'Cannot package more than received');
await call('packaging', 'packageContainer', { slotId: 'hour-001', quantity: 40 });
slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
assert.equal(slot.packagingPackagedQuantity, 40);
assert.equal(slot.packagingReceivedQuantity - slot.packagingPackagedQuantity, 20, 'received-not-packaged == 20');

// Deliver cannot exceed packaged; delivery posts a real, deterministic, idempotent inventory movement.
await assert.rejects(call('packaging', 'deliverToWarehouse', { slotId: 'hour-001', quantity: 41 }), 'Cannot deliver more than packaged');
const deliverRequestId = crypto.randomUUID();
await call('packaging', 'deliverToWarehouse', { slotId: 'hour-001', quantity: 30 }, deliverRequestId);
slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
assert.equal(slot.packagingDeliveredQuantity, 30);
assert.equal(slot.packagingPackagedQuantity - slot.packagingDeliveredQuantity, 10, 'packaged-not-delivered == 10');

// The four balances match the acceptance scenario exactly: 100 approved, 60 received, 40 packaged, 30 delivered -> remaining 40/20/10.
assert.equal(slot.qualityApprovedAcceptedQuantity, 100);
assert.equal(slot.qualityApprovedAcceptedQuantity - slot.packagingReceivedQuantity, 40);
assert.equal(slot.packagingReceivedQuantity - slot.packagingPackagedQuantity, 20);
assert.equal(slot.packagingPackagedQuantity - slot.packagingDeliveredQuantity, 10);

// Retrying the exact same delivery request is idempotent: no double stock increment.
const stockItemRef = db.doc(`stock_items/${tenantId}-fg-warehouse__finished_good__${tenantId}`);
const stockAfterFirst = (await stockItemRef.get()).data()!;
assert.equal(stockAfterFirst.quantity, 30, 'Warehouse stock increased by exactly the delivered quantity, once');
await call('packaging', 'deliverToWarehouse', { slotId: 'hour-001', quantity: 30 }, deliverRequestId);
const stockAfterReplay = (await stockItemRef.get()).data()!;
assert.equal(stockAfterReplay.quantity, 30, 'Replaying the same request id does not re-post the movement');
const slotAfterReplay = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
assert.equal(slotAfterReplay.packagingDeliveredQuantity, 30, 'Delivered quantity is not double-counted on retry');

// A genuinely new delivery request beyond the remaining packaged-not-delivered balance (10) is still rejected.
await assert.rejects(call('packaging', 'deliverToWarehouse', { slotId: 'hour-001', quantity: 11 }), 'Cannot deliver more than the remaining packaged-not-delivered balance');

// The stock_transactions ledger entry uses the SAME shared collection/shape as the rest of the app (no parallel ledger).
const txSnap = await db.collection('stock_transactions').doc(deliverRequestId).get();
assert.ok(txSnap.exists, 'A single stock_transactions row was created, keyed by the request id');
const tx = txSnap.data()!;
assert.equal(tx.movementType, 'IN');
assert.equal(tx.quantity, 30);
assert.equal(tx.warehouseId, `${tenantId}-fg-warehouse`);
assert.equal(tx.itemType, 'finished_good');
assert.equal(tx.itemId, tenantId);

// A correction is blocked once packaging has already received against this container.
await assert.rejects(call('quality', 'correctQualityReport', { slotId: 'hour-001', acceptedQuantity: 90, rejectedQuantity: 10, reason: 'too late' }), 'Correction is locked once packaging receipt has started');

console.log('PASS: packaging receive/package/deliver — four balances match, deterministic idempotent warehouse posting, no parallel ledger, correction locked after receipt');
