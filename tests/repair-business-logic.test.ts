import assert from 'node:assert/strict';
import {
  computeRepairJobCost,
  resolveRepairJobActionState,
  summarizeRepairJobs,
} from '../modules/repair/utils/repairBusinessLogic';
import type { RepairAccessContext } from '../modules/repair/utils/repairAccessContext';
import type { RepairJob } from '../modules/repair/types';

const baseJob = (patch: Partial<RepairJob> = {}): RepairJob => ({
  id: 'job-1',
  tenantId: 'tenant-1',
  receiptNo: 'REP-1',
  branchId: 'branch-1',
  customerName: 'Customer',
  customerPhone: '01000000000',
  deviceType: 'Phone',
  deviceBrand: 'Brand',
  deviceModel: 'Model',
  problemDescription: 'Problem',
  status: 'repairing',
  warranty: 'none',
  partsUsed: [],
  createdAt: '2026-05-01T10:00:00.000Z',
  updatedAt: '2026-05-01T10:00:00.000Z',
  ...patch,
});

const access = (patch: Partial<RepairAccessContext> = {}): RepairAccessContext => ({
  userBranchIds: ['branch-1'],
  canViewAllBranches: false,
  isRepairTechnician: true,
  managerScope: 'branch',
  adminSeesAllBranches: false,
  jobsTechnicianOnly: true,
  ...patch,
});

{
  const cost = computeRepairJobCost(baseJob({
    partsUsed: [
      { partId: 'p1', partName: 'Screen', quantity: 2, unitCost: 150 },
      { partId: 'p2', partName: 'Cable', quantity: 1, unitCost: 50 },
    ],
    laborCost: 100,
    serviceOnlyCost: 25,
    jobProducts: [{ itemId: 'i1', productName: 'Phone', finalCost: 75 }],
  }));
  assert.equal(cost.partsCost, 350);
  assert.equal(cost.laborCost, 100);
  assert.equal(cost.serviceOnlyCost, 25);
  assert.equal(cost.productsFinalCost, 75);
  assert.equal(cost.finalCost, 550);
  assert.equal(cost.paymentStatus, 'unpaid');
}

{
  const cost = computeRepairJobCost(baseJob({ finalCostOverride: 999, paymentStatus: 'paid' }));
  assert.equal(cost.finalCost, 999);
  assert.equal(cost.balanceDue, 0);
  assert.equal(cost.paymentStatus, 'paid');
}

{
  const state = resolveRepairJobActionState({
    job: baseJob({ technicianId: 'emp-1' }),
    access: access(),
    technicianIds: ['emp-1'],
    canEditByPermission: false,
  });
  assert.equal(state.canEdit, true);
  assert.equal(state.canUseParts, true);
}

{
  const state = resolveRepairJobActionState({
    job: baseJob({ status: 'delivered', isClosed: true, technicianId: 'emp-1' }),
    access: access(),
    technicianIds: ['emp-1'],
    canEditByPermission: true,
  });
  assert.equal(state.canEdit, false);
  assert.equal(state.isClosed, true);
  assert.ok(state.blockedReason);
}

{
  const rows = [
    baseJob({ id: 'a', status: 'received', createdAt: new Date().toISOString() }),
    baseJob({ id: 'b', status: 'ready', dueAt: '2020-01-01T00:00:00.000Z' }),
    baseJob({ id: 'c', status: 'delivered', finalCost: 250 }),
  ];
  const summary = summarizeRepairJobs(rows, ['received', 'repairing', 'ready']);
  assert.equal(summary.total, 3);
  assert.equal(summary.open, 2);
  assert.equal(summary.ready, 1);
  assert.equal(summary.delivered, 1);
  assert.equal(summary.overdue, 1);
  assert.equal(summary.revenue, 250);
}

console.log('repair business logic tests passed');
