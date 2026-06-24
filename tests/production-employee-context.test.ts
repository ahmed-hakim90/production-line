import assert from 'node:assert/strict';
import { buildProductionEmployeeContext } from '../modules/production/utils/productionEmployeeContext.ts';
import { ProductionLineStatus } from '../types.ts';
import type {
  FirestoreProductionLine,
  ProductionLineWorkerAssignment,
  ProductionWorker,
  SupervisorLineAssignment,
} from '../types.ts';

const workers: ProductionWorker[] = [
  {
    id: 'worker-1',
    employeeId: 'employee-1',
    name: 'Worker One',
    code: 'W001',
    isActive: true,
    workerType: 'production',
    lineIds: ['line-1'],
  },
  {
    id: 'inactive-worker',
    employeeId: 'employee-2',
    name: 'Inactive Worker',
    code: 'W002',
    isActive: false,
    workerType: 'production',
    lineIds: ['line-1'],
  },
];

const lineAssignments: ProductionLineWorkerAssignment[] = [
  {
    workerId: 'worker-1',
    lineId: 'line-old',
    isActive: true,
    startDate: '2026-06-01',
  },
  {
    workerId: 'worker-1',
    lineId: 'line-1',
    isActive: true,
    startDate: '2026-06-20',
  },
  {
    workerId: 'inactive-worker',
    lineId: 'line-1',
    isActive: true,
    startDate: '2026-06-20',
  },
];

const supervisorAssignments: SupervisorLineAssignment[] = [
  {
    lineId: 'line-1',
    supervisorId: 'supervisor-old',
    effectiveFrom: '2026-06-01',
    effectiveTo: '2026-06-19',
    isActive: false,
  },
  {
    lineId: 'line-1',
    supervisorId: 'supervisor-1',
    supervisorName: 'Supervisor One',
    effectiveFrom: '2026-06-20',
    isActive: true,
  },
];

const lines: FirestoreProductionLine[] = [
  {
    id: 'line-1',
    name: 'Assembly Line 1',
    dailyWorkingHours: 8,
    maxWorkers: 12,
    status: ProductionLineStatus.ACTIVE,
  },
];

const context = buildProductionEmployeeContext({
  workers,
  lineAssignments,
  supervisorAssignments,
  lines,
  date: '2026-06-24',
});

assert.deepEqual(context.get('employee-1'), {
  workerId: 'worker-1',
  lineId: 'line-1',
  lineName: 'Assembly Line 1',
  managerId: 'supervisor-1',
  supervisorName: 'Supervisor One',
});
assert.equal(context.has('employee-2'), false);

console.log('production-employee-context.test.ts: ok');
