import assert from 'node:assert/strict';
import {
  countOpenScanSessions,
  evaluateWorkOrderClose,
  policyStateFromSettings,
  type WorkOrderCloseFact,
} from '../functions/src/workOrderCloseCore.ts';

const base = (overrides: Partial<WorkOrderCloseFact> = {}): WorkOrderCloseFact => ({
  actorTenantId: 'tenant-a',
  actorIsSuperAdmin: false,
  hasClosePermission: true,
  workOrderTenantId: 'tenant-a',
  workOrderStatus: 'in_progress',
  mode: 'operator',
  policyState: 'off',
  pallets: [],
  palletReadFailed: false,
  actualWorkHours: 8,
  openSessions: 0,
  producedQuantity: 10,
  targetQuantity: 100,
  ...overrides,
});

assert.equal(policyStateFromSettings(false, undefined), 'missing');
assert.equal(policyStateFromSettings(true, undefined), 'off');
assert.equal(policyStateFromSettings(true, false), 'off');
assert.equal(policyStateFromSettings(true, true), 'on');
assert.equal(policyStateFromSettings(true, 'true'), 'unreadable');

assert.equal(evaluateWorkOrderClose(base()).ok, true);
assert.equal(evaluateWorkOrderClose(base({ policyState: 'missing' })).ok, true);

assert.deepEqual(
  evaluateWorkOrderClose(base({
    policyState: 'on',
    pallets: [{ inspectionStatus: 'في انتظار الفحص', palletDecision: 'قيد الفحص' }],
  })),
  { ok: false, reason: 'quality-not-released' },
);

assert.equal(evaluateWorkOrderClose(base({
  policyState: 'on',
  pallets: [{ inspectionStatus: 'تم الفحص', palletDecision: 'مقبول' }],
})).ok, true);

assert.equal(evaluateWorkOrderClose(base({
  policyState: 'on',
  legacyQualityStatus: 'approved',
  palletReadFailed: true,
})).ok, true);

assert.deepEqual(
  evaluateWorkOrderClose(base({ policyState: 'on', palletReadFailed: true })),
  { ok: false, reason: 'policy-unreadable' },
);
assert.deepEqual(
  evaluateWorkOrderClose(base({ policyState: 'unreadable' })),
  { ok: false, reason: 'policy-unreadable' },
);
assert.deepEqual(
  evaluateWorkOrderClose(base({ hasClosePermission: false })),
  { ok: false, reason: 'permission' },
);
assert.deepEqual(
  evaluateWorkOrderClose(base({ actorTenantId: 'tenant-b' })),
  { ok: false, reason: 'tenant' },
);
assert.equal(evaluateWorkOrderClose(base({
  actorTenantId: 'tenant-b',
  actorIsSuperAdmin: true,
})).ok, true);
assert.deepEqual(
  evaluateWorkOrderClose(base({ actualWorkHours: 0 })),
  { ok: false, reason: 'hours' },
);
assert.deepEqual(
  evaluateWorkOrderClose(base({ openSessions: 1 })),
  { ok: false, reason: 'sessions' },
);
const alreadyClosed = evaluateWorkOrderClose(base({ workOrderStatus: 'completed' }));
assert.equal(alreadyClosed.ok, true);
assert.equal(alreadyClosed.ok && alreadyClosed.alreadyClosed, true);
assert.deepEqual(
  evaluateWorkOrderClose(base({ workOrderStatus: 'cancelled' })),
  { ok: false, reason: 'cancelled' },
);

assert.equal(evaluateWorkOrderClose(base({
  mode: 'quantity_reached',
  actualWorkHours: 0,
  openSessions: 2,
  producedQuantity: 100,
  targetQuantity: 100,
})).ok, true);
assert.deepEqual(
  evaluateWorkOrderClose(base({
    mode: 'quantity_reached',
    producedQuantity: 99,
    targetQuantity: 100,
  })),
  { ok: false, reason: 'quantity' },
);
assert.deepEqual(
  evaluateWorkOrderClose(base({
    mode: 'quantity_reached',
    policyState: 'on',
    producedQuantity: 100,
    targetQuantity: 100,
    pallets: [{ inspectionStatus: 'في انتظار الفحص', palletDecision: 'قيد الفحص' }],
  })),
  { ok: false, reason: 'quality-not-released' },
);

assert.equal(countOpenScanSessions([
  { sessionId: 's1', action: 'IN', timestampMs: 1 },
  { sessionId: 's1', action: 'OUT', timestampMs: 2 },
  { sessionId: 's2', action: 'IN', timestampMs: 3 },
]), 1);

console.log('work order close decision passed');
