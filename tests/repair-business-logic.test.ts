import assert from 'node:assert/strict';
import {
  computeRepairJobCost,
  resolveRepairJobActionState,
  summarizeRepairJobs,
} from '../modules/repair/utils/repairBusinessLogic';
import {
  assertRepairStatusTransition,
  listAllowedRepairStatusTargets,
} from '../modules/repair/utils/repairStatusTransitions';
import { sumServiceCatalogPrices } from '../modules/repair/config/repairSettings';
import type { RepairAccessContext } from '../modules/repair/utils/repairAccessContext';
import { canLoadRepairJobList } from '../modules/repair/utils/repairJobListScope';
import type { RepairJob } from '../modules/repair/types';
import type { ResolvedRepairStatus } from '../modules/repair/config/repairSettings';

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

const defaultStatuses: ResolvedRepairStatus[] = [
  { id: 'received', label: 'وارد', color: '#64748b', order: 1, isTerminal: false, isEnabled: true },
  { id: 'diagnosing', label: 'تشخيص', color: '#f59e0b', order: 2, isTerminal: false, isEnabled: true },
  { id: 'waiting_approval', label: 'بانتظار موافقة', color: '#a855f7', order: 3, isTerminal: false, isEnabled: true },
  { id: 'waiting_parts', label: 'قطع', color: '#ea580c', order: 4, isTerminal: false, isEnabled: true },
  { id: 'repairing', label: 'إصلاح', color: '#0ea5e9', order: 5, isTerminal: false, isEnabled: true },
  { id: 'testing', label: 'اختبار', color: '#6366f1', order: 6, isTerminal: false, isEnabled: true },
  { id: 'ready', label: 'جاهز', color: '#22c55e', order: 7, isTerminal: false, isEnabled: true },
  { id: 'delivered', label: 'تسليم', color: '#16a34a', order: 8, isTerminal: true, isEnabled: true },
  { id: 'cancelled', label: 'ملغى', color: '#78716c', order: 9, isTerminal: true, isEnabled: true },
  { id: 'unrepairable', label: 'غير قابل', color: '#ef4444', order: 10, isTerminal: true, isEnabled: true },
];

{
  const cost = computeRepairJobCost(baseJob({
    partsUsed: [
      { partId: 'p1', partName: 'Screen', quantity: 2, unitCost: 150 },
      { partId: 'p2', partName: 'Cable', quantity: 1, unitCost: 50 },
    ],
    laborCost: 100,
    serviceOnlyCost: 25,
    jobProducts: [{ itemId: 'i1', productName: 'Phone', quantity: 10, finalCost: 750 }],
  }));
  assert.equal(cost.partsCost, 350);
  assert.equal(cost.laborCost, 100);
  assert.equal(cost.serviceOnlyCost, 25);
  assert.equal(cost.productsFinalCost, 750);
  assert.equal(cost.finalCost, 1225);
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

{
  assert.equal(sumServiceCatalogPrices(['a', 'b'], [
    { id: 'a', name: 'A', price: 50, enabled: true },
    { id: 'b', name: 'B', price: 25, enabled: true },
  ]), 75);
}

{
  assertRepairStatusTransition({ fromStatus: 'received', toStatus: 'diagnosing', statuses: defaultStatuses });
  assertRepairStatusTransition({ fromStatus: 'ready', toStatus: 'delivered', statuses: defaultStatuses });
  assertRepairStatusTransition({ fromStatus: 'repairing', toStatus: 'cancelled', statuses: defaultStatuses });
  assert.throws(() => assertRepairStatusTransition({
    fromStatus: 'received',
    toStatus: 'delivered',
    statuses: defaultStatuses,
  }));
  assert.throws(() => assertRepairStatusTransition({
    fromStatus: 'delivered',
    toStatus: 'repairing',
    statuses: defaultStatuses,
  }));
  const allowedFromReady = listAllowedRepairStatusTargets({ fromStatus: 'ready', statuses: defaultStatuses });
  assert.ok(allowedFromReady.includes('delivered'));
  assert.ok(allowedFromReady.includes('cancelled'));
}

{
  assert.equal(canLoadRepairJobList({
    canViewAllBranches: false,
    branchIds: [],
    technicianOnly: false,
  }), false);
  assert.equal(canLoadRepairJobList({
    canViewAllBranches: true,
    branchIds: [],
    technicianOnly: false,
  }), true);
  assert.equal(canLoadRepairJobList({
    canViewAllBranches: false,
    branchIds: ['branch-1'],
    technicianOnly: false,
  }), true);
  assert.equal(canLoadRepairJobList({
    canViewAllBranches: false,
    branchIds: [],
    branchId: 'branch-1',
    technicianOnly: false,
  }), true);
  assert.equal(canLoadRepairJobList({
    technicianOnly: true,
    technicianIds: [],
  }), false);
  assert.equal(canLoadRepairJobList({
    technicianOnly: true,
    technicianIds: ['user-1'],
  }), true);
}

console.log('repair business logic tests passed');
