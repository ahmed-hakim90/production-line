import assert from 'node:assert/strict';
import {
  buildBulkWorkerLineTransferPlans,
  buildWorkerLineTransferPlan,
  getPreviousDateString,
  getWorkersEligibleForLineTransfer,
  isProductionWorkerAssignmentActiveOnDate,
} from '../modules/production/utils/productionWorkerLineTransfer.ts';
import type { ProductionLineWorkerAssignment, ProductionWorker } from '../types.ts';

const worker: ProductionWorker = {
  id: 'worker-1',
  name: 'Worker One',
  code: 'W001',
  isActive: true,
  workerType: 'production',
  defaultLineId: 'line-1',
  lineIds: ['line-1'],
};

const assignments: ProductionLineWorkerAssignment[] = [
  {
    id: 'assignment-old',
    workerId: 'worker-1',
    lineId: 'line-1',
    startDate: '2026-06-01',
    isActive: true,
  },
  {
    id: 'assignment-ended',
    workerId: 'worker-1',
    lineId: 'line-ended',
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    isActive: true,
  },
  {
    id: 'assignment-other-worker',
    workerId: 'worker-2',
    lineId: 'line-9',
    startDate: '2026-06-01',
    isActive: true,
  },
];

assert.equal(isProductionWorkerAssignmentActiveOnDate(assignments[0], '2026-06-24'), true);
assert.equal(isProductionWorkerAssignmentActiveOnDate(assignments[1], '2026-06-24'), false);
assert.equal(getPreviousDateString('2026-03-01'), '2026-02-28');

const moveToNewLine = buildWorkerLineTransferPlan({
  worker,
  assignments,
  targetLineId: 'line-2',
  transferDate: '2026-06-24',
});

assert.deepEqual(moveToNewLine.assignmentsToClose.map((row) => row.id), ['assignment-old']);
assert.equal(moveToNewLine.shouldCreateTargetAssignment, true);
assert.deepEqual(moveToNewLine.nextLineIds, ['line-2']);
assert.equal(moveToNewLine.nextDefaultLineId, 'line-2');
assert.equal(moveToNewLine.closeEndDate, '2026-06-23');

const keepExistingTarget = buildWorkerLineTransferPlan({
  worker,
  assignments: [
    ...assignments,
    {
      id: 'assignment-target',
      workerId: 'worker-1',
      lineId: 'line-2',
      startDate: '2026-06-20',
      isActive: true,
    },
  ],
  targetLineId: 'line-2',
  transferDate: '2026-06-24',
});

assert.deepEqual(keepExistingTarget.assignmentsToClose.map((row) => row.id), ['assignment-old']);
assert.equal(keepExistingTarget.shouldCreateTargetAssignment, false);

const bulkPlans = buildBulkWorkerLineTransferPlans({
  workers: [
    worker,
    {
      ...worker,
      id: 'worker-2',
      code: 'W002',
      defaultLineId: 'line-9',
      lineIds: ['line-9'],
    },
    {
      ...worker,
      id: '',
      code: 'missing-id',
    },
  ],
  assignments,
  targetLineId: 'line-3',
  transferDate: '2026-06-24',
});

assert.deepEqual(bulkPlans.map(({ worker }) => worker.id), ['worker-1', 'worker-2']);
assert.deepEqual(
  bulkPlans.map(({ plan }) => plan.assignmentsToClose.map((row) => row.id)),
  [['assignment-old'], ['assignment-other-worker']],
);
assert.deepEqual(bulkPlans.map(({ plan }) => plan.nextLineIds), [['line-3'], ['line-3']]);
assert.equal(bulkPlans.every(({ plan }) => plan.shouldCreateTargetAssignment), true);

const eligibleWorkers = getWorkersEligibleForLineTransfer(
  [
    { id: 'worker-from-line-1', assignedLineIds: ['line-1'] },
    { id: 'worker-from-line-2', assignedLineIds: ['line-2'] },
    { id: 'worker-unassigned', assignedLineIds: [] },
    { id: 'worker-already-target', assignedLineIds: ['line-3'] },
  ],
  'line-3',
);

assert.deepEqual(
  eligibleWorkers.map((row) => row.id),
  ['worker-from-line-1', 'worker-from-line-2', 'worker-unassigned'],
);
assert.deepEqual(getWorkersEligibleForLineTransfer(eligibleWorkers, ''), []);

console.log('production-worker-line-transfer.test.ts: ok');
