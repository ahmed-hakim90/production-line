import assert from 'node:assert/strict';
import { resolveRepairJobPaymentCloseState } from '../modules/repair/lib/repairJobPaymentClose';
import type { RepairPaymentAuthorization } from '../modules/repair/types';

const auth = (patch: Partial<RepairPaymentAuthorization> = {}): RepairPaymentAuthorization => ({
  id: 'auth-1',
  tenantId: 't1',
  branchId: 'b1',
  jobId: 'j1',
  receiptNo: 'REP-1',
  authorizationNo: 'PAY-1',
  revision: 1,
  status: 'approved',
  grossAmount: 700,
  discountType: 'none',
  discountValue: 0,
  discountAmount: 0,
  netAmount: 700,
  paidAmount: 0,
  balanceDue: 700,
  serviceGross: 700,
  partsGross: 0,
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
  createdBy: 'u1',
  createdByName: 'User',
  ...patch,
});

{
  const state = resolveRepairJobPaymentCloseState({
    jobStatus: 'repairing',
    authorization: null,
    canPrepare: true,
    canCollect: true,
    canDeliver: true,
  });
  assert.equal(state.showPanel, false);
  assert.equal(state.step, 'hidden');
}

{
  const state = resolveRepairJobPaymentCloseState({
    jobStatus: 'ready',
    authorization: null,
    canPrepare: true,
    canCollect: true,
    canDeliver: true,
  });
  assert.equal(state.step, 'prepare');
  assert.equal(state.canPrepareAction, true);
  assert.equal(state.canCollectAction, false);
}

{
  const state = resolveRepairJobPaymentCloseState({
    jobStatus: 'ready',
    authorization: auth(),
    canPrepare: true,
    canCollect: true,
    canDeliver: true,
  });
  assert.equal(state.step, 'collect');
  assert.equal(state.canCollectAndDeliverAction, true);
  assert.equal(state.balanceDue, 700);
}

{
  const state = resolveRepairJobPaymentCloseState({
    jobStatus: 'ready',
    authorization: auth({ status: 'paid', paidAmount: 700, balanceDue: 0 }),
    canPrepare: false,
    canCollect: true,
    canDeliver: true,
  });
  assert.equal(state.step, 'deliver');
  assert.equal(state.canDeliverOnlyAction, true);
}

{
  const state = resolveRepairJobPaymentCloseState({
    jobStatus: 'delivered',
    authorization: auth({ status: 'paid', paidAmount: 700, balanceDue: 0 }),
    canPrepare: false,
    canCollect: false,
    canDeliver: false,
  });
  assert.equal(state.step, 'print');
  assert.equal(state.stepLabel, 'جاهز للطباعة');
  assert.equal(state.canPrintAction, true);
}

{
  const state = resolveRepairJobPaymentCloseState({
    jobStatus: 'ready',
    authorization: auth({ status: 'pending_approval' }),
    canPrepare: true,
    canCollect: true,
    canDeliver: true,
  });
  assert.equal(state.step, 'blocked');
  assert.equal(state.canCollectAction, false);
}

{
  const state = resolveRepairJobPaymentCloseState({
    jobStatus: 'ready',
    authorization: auth(),
    canPrepare: true,
    canCollect: true,
    canDeliver: true,
    allowPartialCollection: false,
  });
  assert.equal(state.step, 'collect');
  assert.equal(state.canCollectAndDeliverAction, true);
  assert.equal(state.canCollectAction, false);
}

{
  const state = resolveRepairJobPaymentCloseState({
    jobStatus: 'ready',
    authorization: auth({
      status: 'paid',
      grossAmount: 0,
      netAmount: 0,
      paidAmount: 0,
      balanceDue: 0,
      settlementType: 'warranty',
    }),
    canPrepare: true,
    canCollect: true,
    canDeliver: true,
    isManufacturerWarrantyJob: true,
  });
  assert.equal(state.isWarrantySettlement, true);
  assert.equal(state.step, 'deliver');
  assert.equal(state.canCollectAction, false);
  assert.equal(state.canCollectAndDeliverAction, false);
  assert.equal(state.canDeliverOnlyAction, true);
}

{
  const state = resolveRepairJobPaymentCloseState({
    jobStatus: 'ready',
    authorization: null,
    canPrepare: true,
    canCollect: true,
    canDeliver: true,
    isManufacturerWarrantyJob: true,
  });
  assert.equal(state.step, 'prepare');
  assert.equal(state.isWarrantySettlement, true);
  assert.match(state.stepLabel, /ضمان/);
}

{
  const state = resolveRepairJobPaymentCloseState({
    jobStatus: 'ready',
    authorization: auth({ status: 'paid', paidAmount: 0, balanceDue: 0, grossAmount: 0, netAmount: 0 }),
    canPrepare: true,
    canCollect: true,
    canDeliver: true,
  });
  // Zero gross without settlementType=warranty is not an active auth → still prepare
  assert.equal(state.step, 'prepare');
  assert.equal(state.canDeliverOnlyAction, false);
}

console.log('repair-job-payment-close.test.ts: ok');
