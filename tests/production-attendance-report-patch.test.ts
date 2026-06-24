import assert from 'node:assert/strict';
import { buildProductionAttendanceReportStatusPatch } from '../modules/production/utils/productionAttendanceReportPatch.ts';
import type { ProductionAttendanceRecord, ProductionReport } from '../types.ts';

const shiftReport = {
  id: 'report-shift',
  employeeId: 'sup-1',
  productId: 'prod-1',
  lineId: 'line-1',
  date: '2026-06-24',
  quantityProduced: 100,
  workersCount: 3,
  workersProductionCount: 2,
  workersQualityCount: 1,
  workHours: 8,
  lifecycleStatus: 'closed',
  shiftWorkers: [
    { employeeId: 'emp-1', employeeName: 'Worker One', laborRole: 'production', isPresent: true },
    { employeeId: 'emp-2', employeeName: 'Worker Two', laborRole: 'production', isPresent: true },
    { employeeId: 'emp-3', employeeName: 'Worker Three', laborRole: 'quality', isPresent: true },
  ],
} satisfies ProductionReport;

const shiftRecord = {
  id: 'report-shift_emp-2',
  reportId: 'report-shift',
  date: '2026-06-24',
  lineId: 'line-1',
  productId: 'prod-1',
  employeeId: 'emp-2',
  employeeName: 'Worker Two',
  source: 'shift_workers',
  status: 'present',
} satisfies ProductionAttendanceRecord;

const shiftPatch = buildProductionAttendanceReportStatusPatch(shiftReport, shiftRecord, 'absent');

assert.equal(shiftPatch?.workersCount, 2);
assert.equal(shiftPatch?.workersProductionCount, 1);
assert.equal(shiftPatch?.workersQualityCount, 1);
assert.equal(shiftPatch?.workersPackagingCount, 0);
assert.equal(shiftPatch?.presentAssignments, 2);
assert.equal(shiftPatch?.absentAssignments, 1);
assert.equal(shiftPatch?.shiftWorkers?.find((worker) => worker.employeeId === 'emp-2')?.isPresent, false);

const manualReport = {
  id: 'report-manual',
  employeeId: 'sup-1',
  productId: 'prod-1',
  lineId: 'line-1',
  date: '2026-06-24',
  quantityProduced: 50,
  workersCount: 2,
  workHours: 7,
  workerOutputs: [
    {
      workerId: 'worker-1',
      workerName: 'Manual Worker One',
      productId: 'prod-1',
      productName: 'Product',
      lineId: 'line-1',
      lineName: 'Line',
      dailyTargetQty: 40,
      outputQty: 50,
      achievementPercent: 125,
    },
    {
      workerId: 'worker-2',
      workerName: 'Manual Worker Two',
      productId: 'prod-1',
      productName: 'Product',
      lineId: 'line-1',
      lineName: 'Line',
      dailyTargetQty: 40,
      outputQty: 0,
      achievementPercent: 0,
      isPresent: true,
    },
  ],
} satisfies ProductionReport;

const manualRecord = {
  id: 'report-manual_worker-2',
  reportId: 'report-manual',
  date: '2026-06-24',
  lineId: 'line-1',
  productId: 'prod-1',
  workerId: 'worker-2',
  employeeName: 'Manual Worker Two',
  source: 'worker_outputs',
  status: 'present',
} satisfies ProductionAttendanceRecord;

const manualPatch = buildProductionAttendanceReportStatusPatch(manualReport, manualRecord, 'absent');

assert.equal(manualPatch?.workersCount, 1);
assert.equal(manualPatch?.presentAssignments, 1);
assert.equal(manualPatch?.absentAssignments, 1);
assert.equal(manualPatch?.workerOutputs?.find((worker) => worker.workerId === 'worker-2')?.isPresent, false);

console.log('production-attendance-report-patch.test.ts: ok');
