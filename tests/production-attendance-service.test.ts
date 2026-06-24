import assert from 'node:assert/strict';
import { buildProductionAttendanceRecords } from '../modules/production/utils/productionAttendanceRecords.ts';
import type { ProductionReport } from '../types.ts';

const openShift = {
  id: 'report-open',
  employeeId: 'sup-1',
  productId: 'prod-1',
  lineId: 'line-1',
  date: '2026-06-24',
  quantityProduced: 0,
  workersCount: 2,
  workHours: 0,
  lifecycleStatus: 'open',
  shiftWorkers: [
    {
      employeeId: 'emp-1',
      employeeCode: 'E001',
      employeeName: 'Worker One',
      laborRole: 'production',
      isPresent: true,
    },
  ],
} satisfies ProductionReport;

assert.deepEqual(buildProductionAttendanceRecords(openShift), []);

const closedShift = {
  ...openShift,
  id: 'report-closed',
  reportCode: 'PR-2026-0001',
  lifecycleStatus: 'closed',
  quantityProduced: 120,
  workHours: 8,
  shiftWorkers: [
    {
      employeeId: 'emp-1',
      employeeCode: 'E001',
      employeeName: 'Worker One',
      laborRole: 'quality',
      isPresent: true,
    },
    {
      employeeId: 'emp-2',
      employeeCode: 'E002',
      employeeName: 'Worker Two',
      laborRole: 'production',
      isPresent: false,
    },
  ],
} satisfies ProductionReport;

assert.deepEqual(
  buildProductionAttendanceRecords(closedShift).map((row) => ({
    id: row.id,
    reportId: row.reportId,
    employeeId: row.employeeId,
    status: row.status,
    source: row.source,
    laborRole: row.laborRole,
    quantityProduced: row.quantityProduced,
  })),
  [
    {
      id: 'report-closed_emp-1',
      reportId: 'report-closed',
      employeeId: 'emp-1',
      status: 'present',
      source: 'shift_workers',
      laborRole: 'quality',
      quantityProduced: 120,
    },
    {
      id: 'report-closed_emp-2',
      reportId: 'report-closed',
      employeeId: 'emp-2',
      status: 'absent',
      source: 'shift_workers',
      laborRole: 'production',
      quantityProduced: 120,
    },
  ],
);

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
      isPresent: true,
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
      isPresent: false,
    },
  ],
} satisfies ProductionReport;

assert.deepEqual(
  buildProductionAttendanceRecords(manualReport).map((row) => ({
    id: row.id,
    workerId: row.workerId,
    status: row.status,
    source: row.source,
    quantityProduced: row.quantityProduced,
  })),
  [
    {
      id: 'report-manual_worker-1',
      workerId: 'worker-1',
      status: 'present',
      source: 'worker_outputs',
      quantityProduced: 50,
    },
    {
      id: 'report-manual_worker-2',
      workerId: 'worker-2',
      status: 'absent',
      source: 'worker_outputs',
      quantityProduced: 0,
    },
  ],
);

console.log('production-attendance-service.test.ts: ok');
