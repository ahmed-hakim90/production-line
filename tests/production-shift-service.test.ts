import assert from 'node:assert/strict';
import {
  buildShiftClosePayload,
  findOpenGeneralShifts,
  findOpenProductionShift,
  mapLineAssignmentsToShiftWorkers,
} from '../modules/production/utils/productionShiftLifecycle.ts';
import type { LineWorkerAssignment, ProductionReport } from '../types.ts';

const assignments: LineWorkerAssignment[] = [
  {
    lineId: 'line-1',
    employeeId: 'emp-1',
    employeeCode: 'E001',
    employeeName: 'Worker One',
    date: '2026-06-24',
    laborRole: 'quality',
    isPresent: true,
  },
  {
    lineId: 'line-1',
    employeeId: 'emp-2',
    employeeCode: '',
    employeeName: 'Worker Two',
    date: '2026-06-24',
    laborRole: 'production',
    isPresent: false,
  },
];

assert.deepEqual(mapLineAssignmentsToShiftWorkers(assignments), [
  {
    employeeId: 'emp-1',
    employeeCode: 'E001',
    employeeName: 'Worker One',
    laborRole: 'quality',
    isPresent: true,
  },
  {
    employeeId: 'emp-2',
    employeeCode: undefined,
    employeeName: 'Worker Two',
    laborRole: 'production',
    isPresent: false,
  },
]);

const openReport = {
  id: 'shift-1',
  employeeId: 'sup-1',
  lineId: 'line-1',
  productId: 'prod-1',
  date: '2026-06-24',
  quantityProduced: 0,
  workersCount: 0,
  workHours: 0,
  lifecycleStatus: 'open',
  productionPlanId: 'plan-1',
} satisfies ProductionReport;

assert.equal(
  findOpenProductionShift([openReport], { lineId: 'line-1', planId: 'plan-1' })?.id,
  'shift-1',
);
assert.equal(
  findOpenProductionShift([openReport], { lineId: 'line-1', planId: 'other-plan' }),
  null,
);

const generalOpenReport = {
  ...openReport,
  id: 'shift-general-1',
  shiftStartContext: 'general' as const,
  productionPlanId: undefined,
};

assert.deepEqual(
  findOpenGeneralShifts([generalOpenReport, openReport], {
    employeeId: 'sup-1',
    lineIds: ['line-1', 'line-2'],
  }).map((row) => row.id),
  ['shift-general-1'],
);

assert.deepEqual(
  buildShiftClosePayload(
    {
      shiftStartedAt: '2026-06-24T06:00:00.000Z',
      shiftWorkers: mapLineAssignmentsToShiftWorkers(assignments),
    },
    {
      quantityProduced: 125,
      notes: 'تم الإغلاق',
      closedByUid: 'user-1',
      closedAtIso: '2026-06-24T14:30:00.000Z',
    },
  ),
  {
    lifecycleStatus: 'closed',
    shiftClosedAt: '2026-06-24T14:30:00.000Z',
    shiftClosedByUid: 'user-1',
    quantityProduced: 125,
    workHours: 8.5,
    notes: 'تم الإغلاق',
    workersCount: 1,
    workersProductionCount: 0,
    workersPackagingCount: 0,
    workersQualityCount: 1,
    workersMaintenanceCount: 0,
    workersExternalCount: 0,
    presentAssignments: 1,
    absentAssignments: 1,
  },
);

const teamClose = buildShiftClosePayload(
  {
    shiftStartedAt: '2026-06-24T06:00:00.000Z',
    shiftWorkers: mapLineAssignmentsToShiftWorkers(assignments),
  },
  {
    quantityProduced: 90,
    notes: 'إغلاق جماعي',
    closedByUid: 'user-1',
    closedAtIso: '2026-06-24T14:30:00.000Z',
    reportDate: '2026-06-24',
    assemblyModeSnapshot: 'team',
    workerTargetsApplied: true,
    workerTargetSource: 'plan_daily',
    planDailyTarget: 90,
    workerOutputs: [
      {
        workerId: 'emp-1',
        workerName: 'Worker One',
        productId: 'prod-1',
        productName: 'Team Product',
        lineId: 'line-1',
        lineName: 'Line 1',
        dailyTargetQty: 0,
        outputQty: 0,
        achievementPercent: 0,
        isPresent: true,
      },
      {
        workerId: 'emp-2',
        workerName: 'Worker Two',
        productId: 'prod-1',
        productName: 'Team Product',
        lineId: 'line-1',
        lineName: 'Line 1',
        dailyTargetQty: 0,
        outputQty: 0,
        achievementPercent: 0,
        isPresent: false,
      },
    ],
  },
);

assert.equal(teamClose.workerTargetsApplied, true);
assert.equal(teamClose.workerTargetSource, 'plan_daily');
assert.equal(teamClose.assemblyModeSnapshot, 'team');
assert.equal(teamClose.workerOutputs?.length, 2);
assert.equal(teamClose.workerOutputs?.[0].outputQty, 90);
assert.equal(teamClose.workerOutputs?.[0].dailyTargetQty, 90);
assert.equal(teamClose.workerOutputs?.[0].achievementPercent, 100);
assert.equal(teamClose.workerOutputs?.[1].outputQty, 0);
assert.equal(teamClose.workerOutputs?.[1].isPresent, false);
assert.equal(teamClose.presentAssignments, 1);
assert.equal(teamClose.absentAssignments, 1);

console.log('production-shift-service.test.ts: ok');
