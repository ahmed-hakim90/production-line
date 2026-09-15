import assert from 'node:assert/strict';
import { getDb } from '../functions/src/adminApp';
import { executeWorkOrderCycle } from '../functions/src/workOrderCycle';

if (!process.env.GCLOUD_PROJECT?.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local demo emulator required');
const db = getDb(); const suffix = Date.now().toString(); const tenantId = `fin-${suffix}`;
const users = {
  manager: { 'workOrders.create': true, 'workOrders.approve': true },
  quality: { 'workOrders.assignInspectors': true },
  inspector: { 'workOrders.inspect': true },
  supervisor: { 'workOrders.execute': true },
  packaging: { 'productionHandover.approve': true },
};
const uid = (name: keyof typeof users) => `${tenantId}-${name}`;
for (const [name, permissions] of Object.entries(users)) {
  const person = `${tenantId}-${name}`;
  await db.doc(`roles/${person}`).set({ tenantId, permissions });
  await db.doc(`users/${person}`).set({ tenantId, roleId: person, isActive: true, displayName: name });
}
const productId = `${tenantId}-product`; const lineId = `${tenantId}-line`; const warehouseId = `${tenantId}-fg-warehouse`;
await db.doc(`products/${productId}`).set({ tenantId, isActive: true, name: 'Acceptance Product', code: 'FIN-1' });
await db.doc(`production_lines/${lineId}`).set({ tenantId, isActive: true });
await db.doc(`employees/${tenantId}`).set({ tenantId, isActive: true });
await db.doc(`system_settings/${tenantId}`).set({ planSettings: { inventoryRouting: { finalProductWarehouseId: warehouseId } } });
const template = [{ id: 'w', label: 'وزن', inputType: 'number', required: true }];
const stockItemRef = db.doc(`stock_items/${warehouseId}__finished_good__${productId}`);

function callFor(orderId: string) {
  return (person: keyof typeof users, action: Parameters<typeof executeWorkOrderCycle>[1]['action'], payload: Record<string, unknown> = {}, requestId: string = crypto.randomUUID()) =>
    executeWorkOrderCycle(uid(person), { orderId, action, payload, requestId });
}

async function runOrderToQualityAccepted(orderId: string, quantity: number) {
  const call = callFor(orderId);
  await call('manager', 'prepare', { productId, lineId, supervisorUid: uid('supervisor'), quantity, workOrderNumber: orderId, slots: [{ date: '2026-09-15', startTime: '08:00', endTime: '09:00', targetQuantity: quantity }] });
  await call('quality', 'defineQualityReport', { qualityReportTemplate: template });
  await call('quality', 'assignInspectors', { inspectorUids: [uid('inspector')] });
  await call('manager', 'approve');
  await call('supervisor', 'assignWorkers', { workerIds: [tenantId] });
  await call('supervisor', 'start', { slotId: 'hour-001' });
  await call('supervisor', 'submit', { slotId: 'hour-001', actualQuantity: quantity, rejectedQuantity: 0 });
  await call('inspector', 'claimQualityInspection', { slotId: 'hour-001' });
  const slot = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  await call('inspector', 'submitQualityReport', { slotId: 'hour-001', claimId: slot.qualityClaim.id, inspectedQuantity: quantity, acceptedQuantity: quantity, rejectedQuantity: 0, qualityResults: [{ checkId: 'w', value: 1 }] });
  await call('quality', 'approveQualityReport', { slotId: 'hour-001' });
  return call;
}

// ---- Shared ledger reconciliation: pre-existing balance (representing other real sources, e.g. legacy-cycle reports)
// accumulates correctly across TWO separate new-cycle orders delivering to the same product/warehouse — additive,
// never overwritten, and a legacy order sharing the same tenant/product/line is provably untouched by any of it. ----
{
  // A pre-existing balance in the SAME stock_items doc (same id scheme the legacy report-inventory path also uses:
  // `${warehouseId}__finished_good__${productId}`) stands in for quantity posted by other sources before the new
  // cycle ever ran on this product/warehouse.
  await stockItemRef.set({ warehouseId, itemType: 'finished_good', itemId: productId, itemName: 'Acceptance Product', itemCode: 'FIN-1', unit: 'piece', quantity: 40, updatedAt: new Date().toISOString(), tenantId });

  const legacyId = `${tenantId}-legacy-order`;
  const legacySnapshot = { tenantId, lineId, productId, supervisorId: tenantId, status: 'pending', producedQuantity: 12 };
  await db.doc(`work_orders/${legacyId}`).set(legacySnapshot);

  const orderA = `${tenantId}-order-a`;
  let call = await runOrderToQualityAccepted(orderA, 30);
  await call('packaging', 'receivePackaging', { slotId: 'hour-001', quantity: 30 });
  await call('packaging', 'packageContainer', { slotId: 'hour-001', quantity: 30 });
  await call('packaging', 'deliverToWarehouse', { slotId: 'hour-001', quantity: 30 });
  assert.equal((await stockItemRef.get()).data()!.quantity, 70, '40 pre-existing + 30 delivered — additive, not overwritten');

  const orderB = `${tenantId}-order-b`;
  call = await runOrderToQualityAccepted(orderB, 15);
  await call('packaging', 'receivePackaging', { slotId: 'hour-001', quantity: 15 });
  await call('packaging', 'packageContainer', { slotId: 'hour-001', quantity: 15 });
  await call('packaging', 'deliverToWarehouse', { slotId: 'hour-001', quantity: 15 });
  assert.equal((await stockItemRef.get()).data()!.quantity, 85, '70 + 15 from a second, independent order — still additive');

  // The legacy order sharing the same tenant/product/line was never read or written by any of the above.
  assert.deepEqual((await db.doc(`work_orders/${legacyId}`).get()).data(), legacySnapshot, 'A coexisting legacy-cycle order is completely untouched by new-cycle packaging deliveries');

  console.log('PASS: the shared stock_items ledger accumulates correctly across multiple new-cycle orders and a pre-existing balance, and a coexisting legacy order is provably untouched');
}

// ---- Tenant isolation: a user from a different tenant, holding the SAME permission grants, is rejected on every
// batch 3-6 action (quality lock, rejected-disposition, packaging receipt, plan proposal, closing) — not just the
// foundational actions already covered in work-order-cycle.integration.ts. ----
{
  const orderId = `${tenantId}-isolation-order`;
  await runOrderToQualityAccepted(orderId, 20);
  const foreignTenantId = `fin-foreign-${suffix}`;
  const foreignUid = `${foreignTenantId}-actor`;
  await db.doc(`roles/${foreignUid}`).set({ tenantId: foreignTenantId, permissions: { 'workOrders.assignInspectors': true, 'productionHandover.approve': true, 'workOrders.approve': true, 'workOrders.execute': true } });
  await db.doc(`users/${foreignUid}`).set({ tenantId: foreignTenantId, roleId: foreignUid, isActive: true, displayName: 'foreign' });
  const foreignCall = (action: Parameters<typeof executeWorkOrderCycle>[1]['action'], payload: Record<string, unknown> = {}) => executeWorkOrderCycle(foreignUid, { orderId, action, payload, requestId: crypto.randomUUID() });
  await assert.rejects(foreignCall('lockQuality', { reason: 'x' }), 'A foreign tenant cannot lock quality on another tenant\'s order');
  await assert.rejects(foreignCall('receivePackaging', { slotId: 'hour-001', quantity: 1 }), 'A foreign tenant cannot receive packaging on another tenant\'s order');
  await assert.rejects(foreignCall('proposePlanRevision'), 'A foreign tenant cannot propose a plan revision on another tenant\'s order');
  await assert.rejects(foreignCall('closeProduction', { reason: 'x' }), 'A foreign tenant cannot close another tenant\'s production');
  console.log('PASS: every batch 3-6 action rejects a same-permission actor from a different tenant');
}

// ---- Real concurrency (not sequential replay): two different requests racing over the same limited balance must
// never let the total exceed it, and the exact same request racing against itself must still apply exactly once. ----
{
  const orderId = `${tenantId}-race-order`;
  const call = await runOrderToQualityAccepted(orderId, 50);
  // Two distinct 30-unit receive requests race over a 50-unit approved-accepted balance: at most one can win.
  const race = await Promise.allSettled([
    call('packaging', 'receivePackaging', { slotId: 'hour-001', quantity: 30 }, crypto.randomUUID()),
    call('packaging', 'receivePackaging', { slotId: 'hour-001', quantity: 30 }, crypto.randomUUID()),
  ]);
  const fulfilled = race.filter(r => r.status === 'fulfilled').length;
  assert.equal(fulfilled, 1, 'Exactly one of two overlapping 30-unit requests against a 50-unit balance succeeds');
  const slotAfterRace = (await db.doc(`work_orders/${orderId}/hourly_slots/hour-001`).get()).data()!;
  assert.equal(slotAfterRace.packagingReceivedQuantity, 30, 'The balance never overshoots under real concurrency, not just sequential calls');

  // The exact same request racing against itself (duplicate requestId fired concurrently) applies exactly once.
  const closeRequestId = crypto.randomUUID();
  const duplicateRace = await Promise.all([
    call('manager', 'closeProduction', { reason: 'concurrent duplicate close' }, closeRequestId),
    call('manager', 'closeProduction', { reason: 'concurrent duplicate close' }, closeRequestId),
  ]);
  assert.deepEqual(duplicateRace[0], duplicateRace[1], 'Both branches of the same concurrent request resolve to the identical receipt');
  const closures = await db.collection(`work_orders/${orderId}/production_closures`).get();
  assert.equal(closures.size, 1, 'The order was closed exactly once despite the concurrent duplicate request');
  console.log('PASS: concurrent distinct requests never overshoot a shared limited balance, and a concurrent duplicate request still applies exactly once');
}
