import assert from 'node:assert/strict';
import {
  buildWorkersCountAutoFill,
  buildWorkersCountAutoFillFromAssignments,
  countLaborRolesFromAssignments,
  countOperatorsFromAssignments,
  shouldApplyWorkersCountAutoFill,
  sumWorkersCountPatch,
} from '../modules/production/utils/lineAssignmentWorkersCount.ts';
import { filterProductionLaborWorkers } from '../modules/production/utils/lineWorkerLaborRoles.ts';
import {
  inheritLineAssignmentsForDate,
  resolveEffectiveLineAssignmentsForDate,
} from '../modules/production/utils/effectiveLineAssignments.ts';
import type { LineWorkerAssignment } from '../types';

assert.equal(
  countOperatorsFromAssignments(
    [{ employeeId: 'e1' }, { employeeId: 'e2' }, { employeeId: 'sup' }],
    'sup',
  ),
  2,
);

assert.deepEqual(
  buildWorkersCountAutoFill(12, { reportType: 'finished_product' }),
  {
    workersProductionCount: 12,
    workersPackagingCount: 0,
    workersQualityCount: 0,
    workersMaintenanceCount: 0,
    workersExternalCount: 0,
  },
);

assert.deepEqual(
  buildWorkersCountAutoFill(8, { reportType: 'component_injection' }),
  { workersCount: 8 },
);

assert.deepEqual(
  countLaborRolesFromAssignments(
    [
      { employeeId: 'e1', laborRole: 'production' },
      { employeeId: 'e2', laborRole: 'production' },
      { employeeId: 'e3', laborRole: 'production' },
      { employeeId: 'e4', laborRole: 'quality' },
      { employeeId: 'e5', laborRole: 'quality' },
      { employeeId: 'e6', laborRole: 'maintenance' },
      { employeeId: 'sup', laborRole: 'production' },
    ],
    'sup',
  ),
  {
    workersProductionCount: 3,
    workersPackagingCount: 0,
    workersQualityCount: 2,
    workersMaintenanceCount: 1,
    workersExternalCount: 0,
  },
);

assert.deepEqual(
  countLaborRolesFromAssignments(
    [{ employeeId: 'e1' }, { employeeId: 'e2', laborRole: 'quality' }],
  ),
  {
    workersProductionCount: 1,
    workersPackagingCount: 0,
    workersQualityCount: 1,
    workersMaintenanceCount: 0,
    workersExternalCount: 0,
  },
);

assert.deepEqual(
  buildWorkersCountAutoFillFromAssignments(
    [
      { employeeId: 'e1', laborRole: 'production' },
      { employeeId: 'e2', laborRole: 'quality' },
      { employeeId: 'e3', laborRole: 'maintenance' },
    ],
    { reportType: 'finished_product' },
  ),
  {
    workersProductionCount: 1,
    workersPackagingCount: 0,
    workersQualityCount: 1,
    workersMaintenanceCount: 1,
    workersExternalCount: 0,
  },
);

assert.deepEqual(
  buildWorkersCountAutoFillFromAssignments(
    [
      { employeeId: 'e1', laborRole: 'production' },
      { employeeId: 'e2', laborRole: 'quality' },
    ],
    { reportType: 'component_injection' },
  ),
  { workersCount: 2 },
);

assert.equal(sumWorkersCountPatch({ workersProductionCount: 10, workersQualityCount: 2 }), 12);
assert.equal(shouldApplyWorkersCountAutoFill(0, null), true);
assert.equal(shouldApplyWorkersCountAutoFill(15, 15), true);
assert.equal(shouldApplyWorkersCountAutoFill(12, 15), false);

assert.deepEqual(
  filterProductionLaborWorkers([
    { workerId: 'w1', laborRole: 'production' as const },
    { workerId: 'w2', laborRole: 'quality' as const },
    { workerId: 'w3' },
    { workerId: 'w4', laborRole: 'packaging' as const },
  ]).map((row) => row.workerId),
  ['w1', 'w3'],
);

const priorAssignments: LineWorkerAssignment[] = [
  {
    id: 'source-row',
    lineId: 'line-1',
    employeeId: 'emp-1',
    employeeCode: 'E001',
    employeeName: 'Worker One',
    laborRole: 'quality',
    date: '2026-06-21',
  },
];

assert.deepEqual(
  inheritLineAssignmentsForDate(priorAssignments, '2026-06-22'),
  [
    {
      lineId: 'line-1',
      employeeId: 'emp-1',
      employeeCode: 'E001',
      employeeName: 'Worker One',
      laborRole: 'quality',
      date: '2026-06-22',
    },
  ],
);

assert.equal(
  resolveEffectiveLineAssignmentsForDate(
    [
      {
        id: 'today-row',
        lineId: 'line-1',
        employeeId: 'emp-2',
        employeeCode: 'E002',
        employeeName: 'Worker Two',
        laborRole: 'production',
        date: '2026-06-22',
      },
    ],
    priorAssignments,
    '2026-06-22',
  )[0].employeeId,
  'emp-2',
);

assert.equal(
  resolveEffectiveLineAssignmentsForDate([], priorAssignments, '2026-06-22')[0].employeeId,
  'emp-1',
);

console.log('line-assignment-worker-bridge.test.ts: ok');
