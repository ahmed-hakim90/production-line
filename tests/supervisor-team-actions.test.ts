import assert from 'node:assert/strict';
import {
  buildSupervisorTeamWorkers,
  isEmployeeInSupervisorTeam,
  resolveTeamRequestScope,
} from '../modules/production/utils/productionEmployeeContext.ts';
import {
  buildPenaltyDeductionInput,
  calculatePenaltyAmountFromDuration,
  formatPenaltyRequestSummary,
} from '../modules/hr/approval/penaltyApproval.ts';
import { ProductionLineStatus } from '../types.ts';

const employees = [
  {
    id: 'worker-1',
    name: 'Worker One',
    departmentId: 'prod',
    jobPositionId: 'worker',
    level: 1,
    employmentType: 'full_time' as const,
    baseSalary: 0,
    hourlyRate: 0,
    hasSystemAccess: false,
    isActive: true,
    code: '1001',
  },
  {
    id: 'worker-2',
    name: 'Worker Two',
    departmentId: 'prod',
    jobPositionId: 'worker',
    level: 1,
    employmentType: 'full_time' as const,
    baseSalary: 0,
    hourlyRate: 0,
    hasSystemAccess: false,
    isActive: true,
    code: '1002',
  },
];

const workers = [
  {
    id: 'pw-1',
    employeeId: 'worker-1',
    name: 'Worker One',
    code: '1001',
    isActive: true,
    workerType: 'production' as const,
    lineIds: ['line-1'],
  },
  {
    id: 'pw-2',
    employeeId: 'worker-2',
    name: 'Worker Two',
    code: '1002',
    isActive: true,
    workerType: 'production' as const,
    lineIds: ['line-2'],
  },
];

const lineAssignments = [
  { id: 'a-1', lineId: 'line-1', workerId: 'pw-1', startDate: '2026-01-01', isActive: true },
  { id: 'a-2', lineId: 'line-2', workerId: 'pw-2', startDate: '2026-01-01', isActive: true },
];

const lines = [
  { id: 'line-1', name: 'Line 1', dailyWorkingHours: 8, maxWorkers: 10, status: ProductionLineStatus.ACTIVE },
  { id: 'line-2', name: 'Line 2', dailyWorkingHours: 8, maxWorkers: 10, status: ProductionLineStatus.ACTIVE },
];

const supervisorAssignments = [
  { id: 's-1', lineId: 'line-1', supervisorId: 'sup-1', supervisorName: 'Supervisor', effectiveFrom: '2026-01-01', isActive: true },
  { id: 's-2', lineId: 'line-2', supervisorId: 'other-sup', supervisorName: 'Other', effectiveFrom: '2026-01-01', isActive: true },
];

const team = buildSupervisorTeamWorkers({
  supervisorId: 'sup-1',
  date: '2026-06-24',
  employees,
  workers,
  lineAssignments,
  supervisorAssignments,
  lines,
});

assert.equal(team.length, 1);
assert.equal(team[0].employeeId, 'worker-1');
assert.equal(team[0].lineName, 'Line 1');
assert.equal(isEmployeeInSupervisorTeam(team, 'worker-1'), true);
assert.equal(isEmployeeInSupervisorTeam(team, 'worker-2'), false);

const productionManagerTeam = buildSupervisorTeamWorkers({
  supervisorId: 'prod-manager',
  date: '2026-06-24',
  scope: 'production_all',
  employees,
  workers,
  lineAssignments,
  supervisorAssignments: [],
  lines,
});

assert.equal(productionManagerTeam.length, 2);
assert.equal(productionManagerTeam[0].employeeId, 'worker-1');
assert.equal(productionManagerTeam[1].employeeId, 'worker-2');

const supervisorWithProductionPermissionsScope = resolveTeamRequestScope({
  managesDepartment: false,
  currentEmployee: {
    id: 'sup-1',
    name: 'Supervisor',
    departmentId: 'prod',
    jobPositionId: 'line-supervisor',
    level: 2,
    employmentType: 'full_time',
    baseSalary: 0,
    hourlyRate: 0,
    hasSystemAccess: true,
    isActive: true,
  },
  department: { id: 'prod', name: 'Production', code: 'PROD', managerId: 'prod-manager', isActive: true },
  jobPosition: { id: 'line-supervisor', title: 'مشرف خط إنتاج', departmentId: 'prod', level: 2, hasSystemAccessDefault: true, isActive: true },
  hasAssignedLines: true,
  can: (permission) => ({
    'production.workerReports.view': true,
    'production.workers.view': true,
    'plans.view': true,
  })[permission] === true,
});

assert.equal(supervisorWithProductionPermissionsScope, 'assigned_lines');
assert.deepEqual(
  buildSupervisorTeamWorkers({
    supervisorId: 'sup-1',
    date: '2026-06-24',
    scope: supervisorWithProductionPermissionsScope,
    employees,
    workers,
    lineAssignments,
    supervisorAssignments,
    lines,
  }).map((row) => row.employeeId),
  ['worker-1'],
);

assert.equal(
  resolveTeamRequestScope({
    managesDepartment: false,
    currentEmployee: {
      id: 'prod-manager',
      name: 'Production Manager',
      departmentId: 'prod',
      jobPositionId: 'production-manager',
      level: 3,
      employmentType: 'full_time',
      baseSalary: 0,
      hourlyRate: 0,
      hasSystemAccess: true,
      isActive: true,
    },
    department: { id: 'prod', name: 'Production', code: 'PROD', managerId: 'prod-manager', isActive: true },
    jobPosition: { id: 'production-manager', title: 'Production Manager', departmentId: 'prod', level: 3, hasSystemAccessDefault: true, isActive: true },
    can: (permission) => ({
      'approval.manage': true,
      'production.workerReports.view': true,
    })[permission] === true,
  }),
  'production_all',
);

assert.equal(
  resolveTeamRequestScope({
    managesDepartment: false,
    can: (permission) => ({
      'leave.manage': true,
      'production.workers.view': true,
    })[permission] === true,
  }),
  'assigned_lines',
);

assert.equal(
  resolveTeamRequestScope({
    managesDepartment: false,
    can: (permission) => ({
      'approval.manage': true,
      'plans.view': true,
    })[permission] === true,
  }),
  'assigned_lines',
);

assert.equal(
  resolveTeamRequestScope({
    managesDepartment: false,
    can: (permission) => ({ 'approval.manage': true })[permission] === true,
  }),
  'assigned_lines',
);

assert.equal(
  resolveTeamRequestScope({
    managesDepartment: false,
    currentEmployee: {
      id: 'hr-1',
      name: 'HR Manager',
      departmentId: 'hr',
      jobPositionId: 'hr-manager',
      level: 3,
      employmentType: 'full_time',
      baseSalary: 0,
      hourlyRate: 0,
      hasSystemAccess: true,
      isActive: true,
    },
    department: { id: 'hr', name: 'Human Resources', code: 'HR', managerId: 'hr-1', isActive: true },
    jobPosition: { id: 'hr-manager', title: 'HR Manager', departmentId: 'hr', level: 3, hasSystemAccessDefault: true, isActive: true },
    can: (permission) => permission === 'leave.manage',
  }),
  'hr_all',
);

const hrTeam = buildSupervisorTeamWorkers({
  supervisorId: 'hr-1',
  date: '2026-06-24',
  scope: 'hr_all',
  employees: [
    {
      id: 'office-1',
      name: 'Office Employee',
      departmentId: 'admin',
      jobPositionId: 'admin',
      level: 1,
      employmentType: 'full_time',
      baseSalary: 0,
      hourlyRate: 0,
      hasSystemAccess: false,
      isActive: true,
      code: '2001',
    },
  ],
  workers: [],
  lineAssignments: [],
  supervisorAssignments: [],
  lines: [],
});

assert.equal(hrTeam.length, 1);
assert.equal(hrTeam[0].employeeId, 'office-1');

const departmentManagerTeam = buildSupervisorTeamWorkers({
  supervisorId: 'dept-manager-1',
  date: '2026-06-24',
  scope: 'department_manager',
  departments: [
    { id: 'prod', name: 'Production', code: 'PROD', managerId: 'dept-manager-1', isActive: true },
    { id: 'admin', name: 'Admin', code: 'ADM', managerId: 'other-manager', isActive: true },
  ],
  employees: [
    ...employees,
    {
      id: 'office-2',
      name: 'Office Two',
      departmentId: 'admin',
      jobPositionId: 'admin',
      level: 1,
      employmentType: 'full_time',
      baseSalary: 0,
      hourlyRate: 0,
      hasSystemAccess: false,
      isActive: true,
      code: '2002',
    },
  ],
  workers: [],
  lineAssignments: [],
  supervisorAssignments: [],
  lines: [],
});

assert.equal(departmentManagerTeam.length, 2);
assert.deepEqual(departmentManagerTeam.map((row) => row.employeeId).sort(), ['worker-1', 'worker-2']);

const deduction = buildPenaltyDeductionInput({
  id: 'approval-1',
  employeeId: 'worker-1',
  createdBy: 'sup-1',
  requestData: {
    penaltyName: 'جزاء تأخير',
    penaltyAmount: 125,
    startMonth: '2026-06',
    reason: 'تكرار التأخير',
    requestedByEmployeeId: 'sup-1',
  },
});

assert.deepEqual(deduction, {
  employeeId: 'worker-1',
  deductionTypeId: 'approval_penalty_approval-1',
  deductionTypeName: 'جزاء تأخير',
  amount: 125,
  isRecurring: false,
  startMonth: '2026-06',
  endMonth: null,
  reason: 'تكرار التأخير',
  category: 'disciplinary',
  status: 'active',
  createdBy: 'sup-1',
  penaltyAmountSource: 'legacy_amount',
});

const durationDeduction = buildPenaltyDeductionInput(
  {
    id: 'approval-2',
    employeeId: 'worker-1',
    createdBy: 'sup-1',
    requestData: {
      penaltyName: 'جزاء تأخير',
      penaltyDurationDays: 0.25,
      penaltyDurationLabel: 'ربع يوم',
      startMonth: '2026-06',
      reason: 'تكرار التأخير',
      requestedByEmployeeId: 'sup-1',
    },
  },
  { baseSalary: 6000 },
);

assert.deepEqual(durationDeduction, {
  employeeId: 'worker-1',
  deductionTypeId: 'approval_penalty_approval-2',
  deductionTypeName: 'جزاء تأخير',
  amount: 50,
  isRecurring: false,
  startMonth: '2026-06',
  endMonth: null,
  reason: 'تكرار التأخير',
  category: 'disciplinary',
  status: 'active',
  createdBy: 'sup-1',
  penaltyDurationDays: 0.25,
  penaltyDurationLabel: 'ربع يوم',
  penaltyDailyRate: 200,
  penaltyAmountSource: 'base_salary_daily_rate',
});

assert.deepEqual(calculatePenaltyAmountFromDuration(0.125, { baseSalary: 4800 }), {
  amount: 20,
  dailyRate: 160,
});

assert.equal(
  formatPenaltyRequestSummary({
    penaltyName: 'جزاء تأخير',
    penaltyDurationDays: 0.125,
  }),
  'جزاء تأخير — ١/٨ يوم',
);

assert.equal(
  buildPenaltyDeductionInput({
    id: 'approval-1',
    employeeId: 'worker-1',
    createdBy: 'sup-1',
    requestData: { deductionId: 'deduction-1', penaltyAmount: 125, startMonth: '2026-06' },
  }),
  null,
);

console.log('supervisor-team-actions.test.ts: ok');
