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
  },
);

console.log('production-shift-service.test.ts: ok');
