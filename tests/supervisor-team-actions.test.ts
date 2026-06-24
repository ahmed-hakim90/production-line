import assert from 'node:assert/strict';
import {
  buildSupervisorTeamWorkers,
  isEmployeeInSupervisorTeam,
  resolveTeamRequestScope,
} from '../modules/production/utils/productionEmployeeContext.ts';
import { buildApprovalChain, buildConfiguredApprovalChain } from '../modules/hr/approval/approvalBuilder.ts';
import { resolveEmployeeManagerId } from '../modules/hr/utils/organizationHierarchy.ts';
import { MENU_CONFIG } from '../config/menu.config.ts';
import { PRODUCTION_ROUTES } from '../modules/production/routes/index.ts';
import {
  buildPenaltyDeductionInput,
  calculatePenaltyAmountFromDuration,
  formatPenaltyRequestSummary,
} from '../modules/hr/approval/penaltyApproval.ts';
import { getApprovalStatusDisplay } from '../modules/hr/approval/approvalStatusDisplay.ts';
import {
  buildSupervisorApprovalExportRows,
  canSupervisorActOnApprovalRequest,
  getProductionApprovalStatusDisplay,
  isApprovalRequestCreatedBySupervisor,
  mergeSupervisorVisibleApprovalRequests,
} from '../modules/production/utils/supervisorApprovalVisibility.ts';
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

const employeesWithUserLinkedHierarchy = [
  {
    id: 'worker-linked',
    name: 'Linked Worker',
    departmentId: 'prod',
    jobPositionId: 'worker',
    level: 1,
    employmentType: 'full_time' as const,
    baseSalary: 0,
    hourlyRate: 0,
    hasSystemAccess: false,
    isActive: true,
    code: '1101',
  },
  {
    id: 'sup-linked',
    userId: 'sup-user',
    name: 'Linked Supervisor',
    departmentId: 'prod',
    jobPositionId: 'line-supervisor',
    level: 2,
    managerEmployeeId: 'manager-user',
    employmentType: 'full_time' as const,
    baseSalary: 0,
    hourlyRate: 0,
    hasSystemAccess: true,
    isActive: true,
    code: '2101',
  },
  {
    id: 'manager-linked',
    userId: 'manager-user',
    name: 'Linked Manager',
    departmentId: 'prod',
    jobPositionId: 'production-manager',
    level: 3,
    employmentType: 'full_time' as const,
    baseSalary: 0,
    hourlyRate: 0,
    hasSystemAccess: true,
    isActive: true,
    code: '3101',
  },
];
const linkedTeam = buildSupervisorTeamWorkers({
  supervisorId: 'sup-linked',
  date: '2026-06-24',
  employees: employeesWithUserLinkedHierarchy,
  workers: [
    {
      id: 'pw-linked',
      employeeId: 'worker-linked',
      name: 'Linked Worker',
      code: '1101',
      isActive: true,
      workerType: 'production' as const,
      lineIds: ['line-1'],
    },
  ],
  lineAssignments: [{ id: 'a-linked', lineId: 'line-1', workerId: 'pw-linked', startDate: '2026-01-01', isActive: true }],
  supervisorAssignments: [{ id: 's-linked', lineId: 'line-1', supervisorId: 'sup-user', supervisorName: 'Linked Supervisor', effectiveFrom: '2026-01-01', isActive: true }],
  lines,
});

assert.equal(linkedTeam.length, 1);
assert.equal(linkedTeam[0].supervisorId, 'sup-linked');
assert.equal(
  buildSupervisorTeamWorkers({
    supervisorId: 'sup-user',
    date: '2026-06-24',
    employees: employeesWithUserLinkedHierarchy,
    workers: linkedTeam.map((row) => row.worker),
    lineAssignments: [{ id: 'a-linked', lineId: 'line-1', workerId: 'pw-linked', startDate: '2026-01-01', isActive: true }],
    supervisorAssignments: [{ id: 's-linked', lineId: 'line-1', supervisorId: 'sup-user', supervisorName: 'Linked Supervisor', effectiveFrom: '2026-01-01', isActive: true }],
    lines,
  })[0]?.supervisorId,
  'sup-linked',
);

const toApprovalInfo = (employee: typeof employeesWithUserLinkedHierarchy[number]) => ({
  employeeId: employee.id,
  employeeName: employee.name,
  managerId: employee.id === 'worker-linked'
    ? linkedTeam[0].supervisorId
    : resolveEmployeeManagerId(employeesWithUserLinkedHierarchy, employee),
  departmentId: employee.departmentId,
  departmentName: employee.departmentId,
  jobPositionId: employee.jobPositionId,
  jobTitle: employee.jobPositionId,
  jobLevel: Math.min(4, Math.max(1, Number(employee.level || 1))) as 1 | 2 | 3 | 4,
});
const linkedApprovalEmployees = employeesWithUserLinkedHierarchy.map(toApprovalInfo);
const linkedProductionChain = buildApprovalChain({
  employee: linkedApprovalEmployees[0],
  allEmployees: linkedApprovalEmployees,
  requestType: 'leave',
  settings: {
    maxApprovalLevels: 2,
    hrAlwaysFinalLevel: false,
    escalationDays: 3,
    allowDelegation: false,
    autoApproveThresholds: [],
  },
  requestCreatorEmployeeId: 'sup-linked',
});

assert.deepEqual(linkedProductionChain.chain.map((step) => step.approverEmployeeId), ['manager-linked']);

const configuredProductionChain = buildConfiguredApprovalChain(
  {
    employee: linkedApprovalEmployees[0],
    allEmployees: linkedApprovalEmployees,
    requestType: 'leave',
    settings: {
      maxApprovalLevels: 2,
      hrAlwaysFinalLevel: true,
      escalationDays: 3,
      allowDelegation: false,
      autoApproveThresholds: [],
    },
    requestCreatorEmployeeId: 'sup-linked',
  },
  ['manager-linked', 'sup-linked'],
);

assert.deepEqual(configuredProductionChain.errors, []);
assert.deepEqual(
  configuredProductionChain.chain.map((step) => step.approverEmployeeId),
  ['manager-linked', 'sup-linked'],
);
assert.equal(configuredProductionChain.chain[0].approverName, 'Linked Manager');

const missingConfiguredApproverChain = buildConfiguredApprovalChain(
  {
    employee: linkedApprovalEmployees[0],
    allEmployees: linkedApprovalEmployees,
    requestType: 'loan',
    settings: {
      maxApprovalLevels: 2,
      hrAlwaysFinalLevel: true,
      escalationDays: 3,
      allowDelegation: false,
      autoApproveThresholds: [],
    },
    requestCreatorEmployeeId: 'sup-linked',
  },
  ['missing-approver'],
);

assert.equal(missingConfiguredApproverChain.chain.length, 0);
assert.match(missingConfiguredApproverChain.errors.join(' | '), /لم يتم العثور على الموافق المحدد/);

const missingManagerApprovalEmployees = linkedApprovalEmployees.map((employee) =>
  employee.employeeId === 'sup-linked' ? { ...employee, managerId: '' } : employee,
);
const missingManagerChain = buildApprovalChain({
  employee: missingManagerApprovalEmployees[0],
  allEmployees: missingManagerApprovalEmployees,
  requestType: 'leave',
  settings: {
    maxApprovalLevels: 2,
    hrAlwaysFinalLevel: false,
    escalationDays: 3,
    allowDelegation: false,
    autoApproveThresholds: [],
  },
  requestCreatorEmployeeId: 'sup-linked',
});

assert.equal(missingManagerChain.chain.length, 0);
assert.match(
  missingManagerChain.errors.join(' | '),
  /لم يتم العثور على مديرين في التسلسل الوظيفي.+المشرف منشئ الطلب ولا يوجد مدير أعلى/,
);

const dashboardGroup = MENU_CONFIG.find((group) => group.key === 'dashboards');
const productionGroup = MENU_CONFIG.find((group) => group.key === 'production');
const productionRequestsItem = productionGroup?.children.find((item) => item.key === 'production-requests');

assert.equal(dashboardGroup?.children.some((item) => item.key === 'team-requests'), false);
assert.equal(productionRequestsItem?.label, 'طلبات الإنتاج');
assert.equal(productionRequestsItem?.path, '/production/requests');
assert.equal(
  PRODUCTION_ROUTES.some((route) => route.path === '/production/requests' && !route.redirectTo),
  true,
);
assert.equal(
  PRODUCTION_ROUTES.find((route) => route.path === '/production/my-team-actions')?.redirectTo,
  '/production/requests',
);

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

const arbitraryDepartmentManagerTeam = buildSupervisorTeamWorkers({
  supervisorId: 'dept-manager-2',
  date: '2026-06-24',
  scope: 'department_manager',
  departments: [
    { id: 'quality', name: 'Quality', code: 'QA', managerId: 'dept-manager-2', isActive: true },
    { id: 'finance', name: 'Finance', code: 'FIN', managerId: 'other-manager', isActive: true },
  ],
  employees: [
    {
      id: 'quality-1',
      name: 'Quality One',
      departmentId: 'quality',
      jobPositionId: 'quality-specialist',
      level: 1,
      employmentType: 'full_time',
      baseSalary: 0,
      hourlyRate: 0,
      hasSystemAccess: false,
      isActive: true,
      code: '3001',
    },
    {
      id: 'finance-1',
      name: 'Finance One',
      departmentId: 'finance',
      jobPositionId: 'finance-specialist',
      level: 1,
      employmentType: 'full_time',
      baseSalary: 0,
      hourlyRate: 0,
      hasSystemAccess: false,
      isActive: true,
      code: '3002',
    },
  ],
  workers: [],
  lineAssignments: [],
  supervisorAssignments: [],
  lines: [],
});

assert.deepEqual(arbitraryDepartmentManagerTeam.map((row) => row.employeeId), ['quality-1']);

const multiDepartmentManagerTeam = buildSupervisorTeamWorkers({
  supervisorId: 'dept-manager-3',
  date: '2026-06-24',
  scope: 'department_manager',
  departments: [
    { id: 'quality', name: 'Quality', code: 'QA', managerId: 'dept-manager-3', isActive: true },
    { id: 'finance', name: 'Finance', code: 'FIN', managerId: 'dept-manager-3', isActive: true },
    { id: 'inactive', name: 'Inactive', code: 'OFF', managerId: 'dept-manager-3', isActive: false },
  ],
  employees: [
    {
      id: 'quality-2',
      name: 'Quality Two',
      departmentId: 'quality',
      jobPositionId: 'quality-specialist',
      level: 1,
      employmentType: 'full_time',
      baseSalary: 0,
      hourlyRate: 0,
      hasSystemAccess: false,
      isActive: true,
      code: '3003',
    },
    {
      id: 'finance-2',
      name: 'Finance Two',
      departmentId: 'finance',
      jobPositionId: 'finance-specialist',
      level: 1,
      employmentType: 'full_time',
      baseSalary: 0,
      hourlyRate: 0,
      hasSystemAccess: false,
      isActive: true,
      code: '3004',
    },
    {
      id: 'inactive-1',
      name: 'Inactive Department Worker',
      departmentId: 'inactive',
      jobPositionId: 'inactive-specialist',
      level: 1,
      employmentType: 'full_time',
      baseSalary: 0,
      hourlyRate: 0,
      hasSystemAccess: false,
      isActive: true,
      code: '3005',
    },
  ],
  workers: [],
  lineAssignments: [],
  supervisorAssignments: [],
  lines: [],
});

assert.deepEqual(multiDepartmentManagerTeam.map((row) => row.employeeId).sort(), ['finance-2', 'quality-2']);

assert.equal(
  resolveTeamRequestScope({
    managesDepartment: true,
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
    jobPosition: { id: 'line-supervisor', title: 'مشرف خط إنتاج', departmentId: 'prod', level: 2, hasSystemAccessDefault: true, isActive: true },
    hasAssignedLines: true,
    can: () => false,
  }),
  'department_manager_assigned_lines',
);

const supervisorAndDepartmentManagerTeam = buildSupervisorTeamWorkers({
  supervisorId: 'sup-1',
  date: '2026-06-24',
  scope: 'department_manager_assigned_lines',
  departments: [
    { id: 'quality', name: 'Quality', code: 'QA', managerId: 'sup-1', isActive: true },
  ],
  employees: [
    ...employees,
    {
      id: 'quality-3',
      name: 'Quality Three',
      departmentId: 'quality',
      jobPositionId: 'quality-specialist',
      level: 1,
      employmentType: 'full_time',
      baseSalary: 0,
      hourlyRate: 0,
      hasSystemAccess: false,
      isActive: true,
      code: '3006',
    },
  ],
  workers,
  lineAssignments,
  supervisorAssignments,
  lines,
});

assert.deepEqual(supervisorAndDepartmentManagerTeam.map((row) => row.employeeId).sort(), ['quality-3', 'worker-1']);

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

const actionableApproval = {
  id: 'approval-actionable',
  requestType: 'leave',
  employeeId: 'worker-1',
  employeeName: 'Worker One',
  departmentId: 'prod',
  requestData: {
    requestedByEmployeeId: 'other-supervisor',
    leaveType: 'sick',
    leaveTypeLabel: 'مرضية',
  },
  approvalChain: [{ approverEmployeeId: 'sup-1', delegatedTo: '', level: 2, status: 'pending' }],
  currentStep: 0,
  status: 'pending',
  history: [],
  sourceRequestId: null,
  createdAt: { seconds: 30 },
  createdBy: 'other-user',
} as any;

const supervisorCreatedApproval = {
  id: 'approval-created-by-supervisor',
  requestType: 'loan',
  employeeId: 'worker-2',
  employeeName: 'Worker Two',
  departmentId: 'prod',
  requestData: { requestedByEmployeeId: 'sup-1', requestedByName: 'Supervisor' },
  approvalChain: [
    { approverEmployeeId: 'sup-1', delegatedTo: '', level: 2, status: 'approved' },
    { approverEmployeeId: 'manager-1', delegatedTo: '', level: 3, status: 'pending' },
  ],
  currentStep: 1,
  status: 'in_progress',
  history: [],
  sourceRequestId: null,
  createdAt: { seconds: 20 },
  createdBy: 'supervisor-user',
} as any;

const supervisorEmployeeLinkedApproval = {
  id: 'approval-created-by-supervisor-employee',
  requestType: 'penalty',
  employeeId: 'worker-5',
  employeeName: 'Worker Five',
  departmentId: 'prod',
  requestData: {
    requestedByEmployeeId: 'sup-1',
    requestedByName: 'Supervisor',
    penaltyDurationLabel: 'ربع يوم',
    productionLineName: 'Line A',
    reason: 'Configured approver test',
  },
  approvalChain: [
    { approverEmployeeId: 'manager-1', approverName: 'Manager One', approverJobTitle: 'Production Manager', delegatedTo: '', level: 3, status: 'pending' },
  ],
  currentStep: 0,
  status: 'pending',
  history: [],
  sourceRequestId: null,
  createdAt: { seconds: 25 },
  createdBy: 'sup-1',
} as any;

const unrelatedApproval = {
  id: 'approval-unrelated',
  requestType: 'penalty',
  employeeId: 'worker-3',
  employeeName: 'Worker Three',
  departmentId: 'prod',
  requestData: { requestedByEmployeeId: 'other-supervisor' },
  approvalChain: [{ approverEmployeeId: 'manager-1', delegatedTo: '', level: 3, status: 'pending' }],
  currentStep: 0,
  status: 'pending',
  history: [],
  sourceRequestId: null,
  createdAt: { seconds: 10 },
  createdBy: 'other-user',
} as any;

const hrPendingApproval = {
  id: 'approval-hr-pending',
  requestType: 'penalty',
  employeeId: 'worker-4',
  employeeName: 'Worker Four',
  departmentId: 'prod',
  requestData: { requestedByEmployeeId: 'sup-1', requestedByName: 'Supervisor' },
  approvalChain: [
    { approverEmployeeId: 'hr-1', approverName: 'HR Manager', approverJobTitle: 'HR Manager', departmentName: 'Human Resources', delegatedTo: '', level: 3, status: 'pending' },
  ],
  currentStep: 0,
  status: 'in_progress',
  history: [],
  sourceRequestId: null,
  createdAt: { seconds: 40 },
  createdBy: 'supervisor-user',
} as any;

const visibleApprovals = mergeSupervisorVisibleApprovalRequests({
  pendingApprovals: [actionableApproval],
  allRequests: [unrelatedApproval, supervisorCreatedApproval, supervisorEmployeeLinkedApproval, actionableApproval],
  supervisorEmployeeId: 'sup-1',
  supervisorUserId: 'supervisor-user',
});

assert.deepEqual(
  visibleApprovals.map((request) => request.id),
  ['approval-actionable', 'approval-created-by-supervisor-employee', 'approval-created-by-supervisor'],
);
assert.equal(isApprovalRequestCreatedBySupervisor(supervisorCreatedApproval, 'sup-1'), true);
assert.equal(isApprovalRequestCreatedBySupervisor(supervisorEmployeeLinkedApproval, 'sup-1', 'supervisor-user'), true);
assert.equal(canSupervisorActOnApprovalRequest(actionableApproval, 'sup-1'), true);
assert.equal(canSupervisorActOnApprovalRequest(supervisorCreatedApproval, 'sup-1'), false);
assert.equal(
  getApprovalStatusDisplay(actionableApproval).label,
  'بانتظار موافقة المشرف',
  'Actionable supervisor approvals should show the current approver status',
);
assert.equal(
  getApprovalStatusDisplay(supervisorCreatedApproval).label,
  'بانتظار موافقة المدير',
  'Supervisor-created requests should show the higher-manager pending status',
);
assert.equal(
  getApprovalStatusDisplay(hrPendingApproval).label,
  'بانتظار موافقة الموارد البشرية',
);
assert.equal(
  getProductionApprovalStatusDisplay(hrPendingApproval).label,
  'بانتظار موافقة الإدارة',
  'Production team requests should not expose HR terminology in status labels',
);
const exportRows = buildSupervisorApprovalExportRows(visibleApprovals);
assert.deepEqual(
  exportRows.map((row) => ({
    type: row['نوع الطلب'],
    leaveType: row['نوع الإجازة'],
    worker: row['العامل'],
    status: row['الحالة'],
    currentStage: row['مرحلة الاعتماد'],
    requester: row['مقدم الطلب'],
  })),
  [
    {
      type: 'إجازة',
      leaveType: 'مرضية',
      worker: 'Worker One',
      status: 'بانتظار موافقة المشرف',
      currentStage: '',
      requester: 'other-user',
    },
    {
      type: 'جزاء',
      leaveType: '',
      worker: 'Worker Five',
      status: 'بانتظار موافقة المدير',
      currentStage: 'Manager One',
      requester: 'Supervisor',
    },
    {
      type: 'سلفة',
      leaveType: '',
      worker: 'Worker Two',
      status: 'بانتظار موافقة المدير',
      currentStage: '',
      requester: 'Supervisor',
    },
  ],
);
assert.ok(
  Object.keys(exportRows[0]).includes('نوع الإجازة'),
  'PDF/Excel export rows should include a leave type column',
);
assert.equal(
  buildSupervisorApprovalExportRows([{
    ...actionableApproval,
    requestData: { requestedByEmployeeId: 'other-supervisor', leaveType: 'annual' },
  } as any])[0]['نوع الإجازة'],
  'سنوية',
  'Leave export rows should fall back to the configured Arabic label for stored leaveType keys',
);
assert.equal(
  buildSupervisorApprovalExportRows([hrPendingApproval])[0]['الحالة'],
  'بانتظار موافقة الإدارة',
);

console.log('supervisor-team-actions.test.ts: ok');
