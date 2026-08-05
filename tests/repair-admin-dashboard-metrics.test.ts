import assert from 'node:assert/strict';
import {
  countOpenComplaints,
  countOpenSparePartsReplenishments,
  countOpenTreasurySessions,
  countRepairJobQueues,
  countSubmittedSpareIssues,
  getWorkDaysElapsed,
  isOverdueRepairJob,
  isWaitingCustomerApproval,
  isWaitingPartsJob,
  resolveRepairJobQueueFlags,
  summarizeMonthCloses,
} from '../modules/repair/lib/repairAdminDashboardMetrics.ts';

const openStatuses = [
  'received',
  'diagnosing',
  'waiting_approval',
  'waiting_parts',
  'repairing',
  'testing',
  'ready',
];

const now = Date.parse('2026-08-04T12:00:00.000Z');

assert.equal(getWorkDaysElapsed('2026-07-28T12:00:00.000Z', now), 7);
assert.equal(getWorkDaysElapsed('2026-07-27T12:00:00.000Z', now), 8);
assert.equal(getWorkDaysElapsed('', now), 0);

assert.equal(
  isWaitingCustomerApproval({ status: 'waiting_approval', approvalStatus: 'not_required' }),
  true,
);
assert.equal(
  isWaitingCustomerApproval({ status: 'repairing', approvalStatus: 'pending' }),
  true,
);
assert.equal(
  isWaitingCustomerApproval({ status: 'repairing', approvalStatus: 'approved' }),
  false,
);

assert.equal(isWaitingPartsJob({ status: 'waiting_parts', partsUsed: [] }), true);
assert.equal(
  isWaitingPartsJob({
    status: 'repairing',
    partsUsed: [{ partId: 'p1', partName: 'قطعة', quantity: 1, unitCost: 0, fulfillmentStatus: 'pending_supply' }],
  }),
  true,
);
assert.equal(
  isWaitingPartsJob({
    status: 'repairing',
    partsUsed: [{ partId: 'p1', partName: 'قطعة', quantity: 1, unitCost: 0, fulfillmentStatus: 'issued' }],
  }),
  false,
);

assert.equal(
  isOverdueRepairJob(
    { status: 'repairing', createdAt: '2026-07-20T12:00:00.000Z' },
    openStatuses,
    now,
  ),
  true,
);
assert.equal(
  isOverdueRepairJob(
    { status: 'delivered', createdAt: '2026-07-20T12:00:00.000Z' },
    openStatuses,
    now,
  ),
  false,
);

const flags = resolveRepairJobQueueFlags(
  {
    status: 'waiting_approval',
    approvalStatus: 'pending',
    createdAt: '2026-07-20T12:00:00.000Z',
    partsUsed: [{ partId: 'p1', partName: 'قطعة', quantity: 1, unitCost: 0, fulfillmentStatus: 'ready_to_issue' }],
  },
  openStatuses,
  now,
);
assert.equal(flags.waitingApproval, true);
assert.equal(flags.readyToIssueParts, true);
assert.equal(flags.overdue, true);
assert.equal(flags.open, true);

const queues = countRepairJobQueues(
  [
    {
      status: 'waiting_approval',
      approvalStatus: 'pending',
      createdAt: '2026-08-01T12:00:00.000Z',
      partsUsed: [],
    },
    {
      status: 'waiting_parts',
      approvalStatus: 'approved',
      createdAt: '2026-07-20T12:00:00.000Z',
      partsUsed: [{ partId: 'p1', partName: 'قطعة', quantity: 1, unitCost: 0, fulfillmentStatus: 'pending_supply' }],
    },
    {
      status: 'ready',
      approvalStatus: 'approved',
      createdAt: '2026-08-02T12:00:00.000Z',
      partsUsed: [{ partId: 'p1', partName: 'قطعة', quantity: 1, unitCost: 0, fulfillmentStatus: 'ready_to_issue' }],
    },
    {
      status: 'delivered',
      approvalStatus: 'approved',
      createdAt: '2026-07-01T12:00:00.000Z',
      partsUsed: [],
    },
  ],
  openStatuses,
  now,
);
assert.equal(queues.waitingApproval, 1);
assert.equal(queues.waitingParts, 1);
assert.equal(queues.readyToIssueParts, 1);
assert.equal(queues.readyForDelivery, 1);
assert.equal(queues.overdue, 1);
assert.equal(queues.open, 3);

assert.deepEqual(
  countOpenSparePartsReplenishments(
    [
      { status: 'submitted', sourceBranchId: 'b1', openBasket: true },
      { status: 'approved', sourceBranchId: 'b1', openBasket: false },
      { status: 'received', sourceBranchId: 'b1' },
      { status: 'prepared', toWarehouseId: 'wh-b2' },
      { status: 'submitted', sourceBranchId: 'other' },
    ],
    ['b1', 'b2'],
    { b1: 'wh-b1', b2: 'wh-b2' },
  ),
  { open: 3, openBasket: 1 },
);

assert.equal(
  countSubmittedSpareIssues(
    [
      { status: 'submitted', branchId: 'b1' },
      { status: 'approved', branchId: 'b1' },
      { status: 'submitted', branchId: 'other' },
    ],
    ['b1'],
  ),
  1,
);

assert.equal(
  countOpenComplaints(
    [
      { status: 'open', branchId: 'b1' },
      { status: 'in_progress', branchId: 'b1' },
      { status: 'resolved', branchId: 'b1' },
      { status: 'open', branchId: 'other' },
    ],
    ['b1'],
  ),
  2,
);

assert.equal(
  countOpenTreasurySessions(
    [
      { status: 'open', branchId: 'b1' },
      { status: 'closed', branchId: 'b1' },
      { status: 'open', branchId: 'other' },
    ],
    ['b1', 'b2'],
  ),
  1,
);

assert.deepEqual(
  summarizeMonthCloses(
    ['b1', 'b2', 'b3'],
    [
      { branchId: 'b1', status: 'closed' },
      { branchId: 'b2', status: 'open' },
    ],
  ),
  { closedBranches: 1, openBranches: 2, totalBranches: 3 },
);

console.log('repair-admin-dashboard-metrics: ok');
