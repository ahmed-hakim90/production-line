import assert from 'node:assert/strict';
import { buildApprovalChain } from '../modules/hr/approval/approvalBuilder.ts';
import {
  resolveHrApproverEmployeeIdFromOrg,
  resolveHrApproverFromOrg,
} from '../modules/hr/approval/hrApproverResolution.ts';
import { validateAction, validateCancel, validateCreate } from '../modules/hr/approval/approvalValidation.ts';
import { getApprovalStatusDisplay } from '../modules/hr/approval/approvalStatusDisplay.ts';
import {
  normalizeApprovalSettings,
  type ApprovalEmployeeInfo,
  type ApprovalRequestType,
  type FirestoreApprovalRequest,
} from '../modules/hr/approval/types.ts';
import type { FirestoreDepartment, FirestoreJobPosition } from '../modules/hr/types.ts';
import type { FirestoreEmployee } from '../types.ts';

const employees: ApprovalEmployeeInfo[] = [
  {
    employeeId: 'worker-1',
    employeeName: 'Worker',
    managerId: 'sup-1',
    departmentId: 'prod',
    departmentName: 'Production',
    jobPositionId: 'worker',
    jobTitle: 'Worker',
    jobLevel: 1,
  },
  {
    employeeId: 'sup-1',
    employeeName: 'Supervisor',
    managerId: 'manager-1',
    departmentId: 'prod',
    departmentName: 'Production',
    jobPositionId: 'sup',
    jobTitle: 'Supervisor',
    jobLevel: 2,
  },
  {
    employeeId: 'manager-1',
    employeeName: 'Manager',
    managerId: 'exec-1',
    departmentId: 'prod',
    departmentName: 'Production',
    jobPositionId: 'manager',
    jobTitle: 'Manager',
    jobLevel: 3,
  },
  {
    employeeId: 'exec-1',
    employeeName: 'Executive',
    departmentId: 'prod',
    departmentName: 'Production',
    jobPositionId: 'exec',
    jobTitle: 'Executive',
    jobLevel: 4,
  },
  {
    employeeId: 'hr-1',
    employeeName: 'HR Manager',
    departmentId: 'hr',
    departmentName: 'HR',
    jobPositionId: 'hr-manager',
    jobTitle: 'HR Manager',
    jobLevel: 4,
  },
];

assert.equal(
  validateCreate(
    { employeeId: 'sup-1', employeeName: 'Supervisor', permissions: { 'leave.create': true } },
    'worker-1',
    employees,
  ).allowed,
  true,
);

assert.equal(
  validateCreate(
    { employeeId: 'sup-1', employeeName: 'Supervisor', permissions: { 'quickAction.view': true } },
    'worker-1',
    employees,
  ).allowed,
  true,
);

assert.equal(
  validateCreate(
    { employeeId: 'other-sup', employeeName: 'Other Supervisor', permissions: { 'leave.create': true } },
    'worker-1',
    employees,
  ).allowed,
  false,
);

const chain = buildApprovalChain({
  employee: employees[0],
  allEmployees: employees,
  requestType: 'leave',
  settings: {
    maxApprovalLevels: 2,
    hrAlwaysFinalLevel: true,
    escalationDays: 3,
    allowDelegation: false,
    autoApproveThresholds: [],
  },
  hrEmployeeId: 'hr-1',
});

assert.deepEqual(
  chain.chain.map((step) => step.approverEmployeeId),
  ['sup-1', 'hr-1'],
);

const supervisorCreatedChain = buildApprovalChain({
  employee: employees[0],
  allEmployees: employees,
  requestType: 'leave',
  settings: {
    maxApprovalLevels: 2,
    hrAlwaysFinalLevel: true,
    escalationDays: 3,
    allowDelegation: false,
    autoApproveThresholds: [],
  },
  hrEmployeeId: 'hr-1',
  requestCreatorEmployeeId: 'sup-1',
});

assert.deepEqual(
  supervisorCreatedChain.chain.map((step) => step.approverEmployeeId),
  ['manager-1', 'hr-1'],
  'Supervisor-created requests should route to the higher manager before HR',
);

const employeesWithDepartmentManagerFallback = employees.map((employee) =>
  employee.employeeId === 'sup-1'
    ? { ...employee, managerId: undefined, departmentManagerId: 'manager-1' }
    : employee,
);

const fallbackDepartmentManagerChain = buildApprovalChain({
  employee: employeesWithDepartmentManagerFallback[0],
  allEmployees: employeesWithDepartmentManagerFallback,
  requestType: 'leave',
  settings: {
    maxApprovalLevels: 2,
    hrAlwaysFinalLevel: true,
    escalationDays: 3,
    allowDelegation: false,
    autoApproveThresholds: [],
  },
  hrEmployeeId: 'hr-1',
  requestCreatorEmployeeId: 'sup-1',
});

assert.deepEqual(
  fallbackDepartmentManagerChain.chain.map((step) => step.approverEmployeeId),
  ['manager-1', 'hr-1'],
  'Department manager should be used when the supervisor manager link is missing',
);

const chainWithInconsistentLevels = buildApprovalChain({
  employee: employees[0],
  allEmployees: employees.map((employee) => {
    if (employee.employeeId === 'sup-1') return { ...employee, jobLevel: 4 };
    if (employee.employeeId === 'manager-1') return { ...employee, jobLevel: 3 };
    return employee;
  }),
  requestType: 'leave',
  settings: {
    maxApprovalLevels: 2,
    hrAlwaysFinalLevel: false,
    escalationDays: 3,
    allowDelegation: false,
    autoApproveThresholds: [],
  },
});

assert.deepEqual(
  chainWithInconsistentLevels.chain.map((step) => step.approverEmployeeId),
  ['sup-1', 'manager-1'],
  'Approval chain should follow the manager links instead of re-sorting by job level',
);

const supervisorCreatedRequestAtManager: FirestoreApprovalRequest = {
  requestType: 'leave',
  employeeId: 'worker-1',
  employeeName: 'Worker',
  departmentId: 'prod',
  requestData: {},
  approvalChain: supervisorCreatedChain.chain,
  currentStep: 0,
  status: 'pending',
  history: [],
  sourceRequestId: null,
  createdBy: 'sup-1',
};

assert.equal(
  validateAction(
    { employeeId: 'sup-1', employeeName: 'Supervisor', permissions: { 'approval.view': true } },
    supervisorCreatedRequestAtManager,
  ).allowed,
  false,
  'Supervisor should not approve a request they created',
);

assert.equal(
  validateAction(
    { employeeId: 'manager-1', employeeName: 'Manager', permissions: { 'approval.view': true } },
    supervisorCreatedRequestAtManager,
  ).allowed,
  true,
  'Higher manager should approve the supervisor-created request first',
);

assert.equal(
  validateCancel(
    { employeeId: 'sup-1', employeeName: 'Supervisor', permissions: { 'production.workerReports.view': true } },
    {
      ...supervisorCreatedRequestAtManager,
      requestData: { requestedByEmployeeId: 'sup-1' },
    },
  ).allowed,
  true,
  'Supervisor creator should cancel before approval starts',
);

assert.equal(
  validateCancel(
    { employeeId: 'other-sup', employeeName: 'Other Supervisor', permissions: { 'production.workerReports.view': true } },
    {
      ...supervisorCreatedRequestAtManager,
      requestData: { requestedByEmployeeId: 'sup-1' },
    },
  ).allowed,
  false,
  'Other supervisors should not cancel creator-owned requests',
);

const afterHigherManagerApproval = supervisorCreatedRequestAtManager.approvalChain.map((step, index) => ({
  ...step,
  status: index === 0 ? 'approved' : step.status,
}));
const supervisorCreatedNextStep = supervisorCreatedRequestAtManager.currentStep + 1;

assert.equal(supervisorCreatedNextStep, 1);
assert.equal(afterHigherManagerApproval[supervisorCreatedNextStep].approverEmployeeId, 'hr-1');
assert.equal(afterHigherManagerApproval[supervisorCreatedNextStep].status, 'pending');
assert.equal(
  afterHigherManagerApproval.every((step) => step.status === 'approved' || step.status === 'skipped'),
  false,
  'Supervisor-created request should not be final-approved before HR acts',
);

assert.equal(
  validateCancel(
    { employeeId: 'sup-1', employeeName: 'Supervisor', permissions: { 'production.workerReports.view': true } },
    {
      ...supervisorCreatedRequestAtManager,
      requestData: { requestedByEmployeeId: 'sup-1' },
      approvalChain: afterHigherManagerApproval,
      currentStep: supervisorCreatedNextStep,
      status: 'in_progress',
    },
  ).allowed,
  false,
  'Supervisor creator should not cancel after manager approval',
);

assert.equal(
  getApprovalStatusDisplay(supervisorCreatedRequestAtManager).label,
  'بانتظار موافقة المدير',
  'Supervisor-created requests should display the current higher-manager approval status',
);

assert.equal(
  getApprovalStatusDisplay({
    ...supervisorCreatedRequestAtManager,
    approvalChain: afterHigherManagerApproval,
    currentStep: supervisorCreatedNextStep,
    status: 'in_progress',
  }).label,
  'بانتظار موافقة الموارد البشرية',
  'Requests should display HR as the current pending approval step after manager approval',
);

assert.equal(
  getApprovalStatusDisplay({ ...supervisorCreatedRequestAtManager, status: 'approved' }).label,
  'مُعتمد',
);

assert.equal(
  getApprovalStatusDisplay({ ...supervisorCreatedRequestAtManager, status: 'rejected' }).label,
  'مرفوض',
);

const rawEmployees: FirestoreEmployee[] = employees.map((employee) => ({
  id: employee.employeeId,
  name: employee.employeeName,
  departmentId: employee.departmentId,
  jobPositionId: employee.jobPositionId,
  level: employee.jobLevel,
  managerId: employee.managerId,
  employmentType: 'full_time',
  baseSalary: 0,
  hourlyRate: 0,
  hasSystemAccess: employee.employeeId === 'hr-1',
  isActive: true,
  userId: employee.employeeId === 'hr-1' ? 'hr-user-1' : undefined,
}));

const departments: FirestoreDepartment[] = [
  { id: 'prod', name: 'Production', code: 'PROD', managerId: 'manager-1', isActive: true },
  { id: 'hr', name: 'Human Resources', code: 'HR', managerId: 'hr-1', isActive: true },
];

const jobPositions: FirestoreJobPosition[] = [
  { id: 'worker', title: 'Worker', departmentId: 'prod', level: 1, hasSystemAccessDefault: false, isActive: true },
  { id: 'sup', title: 'Supervisor', departmentId: 'prod', level: 2, hasSystemAccessDefault: true, isActive: true },
  { id: 'manager', title: 'Manager', departmentId: 'prod', level: 3, hasSystemAccessDefault: true, isActive: true },
  { id: 'exec', title: 'Executive', departmentId: 'prod', level: 4, hasSystemAccessDefault: true, isActive: true },
  { id: 'hr-manager', title: 'HR Manager', departmentId: 'hr', level: 4, hasSystemAccessDefault: true, isActive: true },
];

const structurallyResolvedHr = resolveHrApproverEmployeeIdFromOrg({
  allEmployees: employees,
  rawEmployees,
  departments,
  jobPositions,
  activeUserIds: ['hr-user-1'],
  configuredHrUserIds: [],
  hrUserIdsByPermission: [],
});

assert.equal(structurallyResolvedHr, 'hr-1');

const structurallyResolvedHrFromUserIdManager = resolveHrApproverFromOrg({
  allEmployees: employees,
  rawEmployees,
  departments: [
    { id: 'prod', name: 'Production', code: 'PROD', managerId: 'manager-1', isActive: true },
    { id: 'hr', name: 'الموارد البشرية', code: 'HR', managerId: 'hr-user-1', isActive: true },
  ],
  jobPositions,
  activeUserIds: ['hr-user-1'],
  configuredHrUserIds: [],
  hrUserIdsByPermission: [],
});

assert.equal(structurallyResolvedHrFromUserIdManager.employeeId, 'hr-1');
assert.equal(structurallyResolvedHrFromUserIdManager.source, 'structure');

const structurallyResolvedHrWithoutActiveUserLookup = resolveHrApproverFromOrg({
  allEmployees: employees,
  rawEmployees,
  departments,
  jobPositions,
  configuredHrUserIds: [],
  hrUserIdsByPermission: [],
});

assert.equal(structurallyResolvedHrWithoutActiveUserLookup.employeeId, 'hr-1');
assert.equal(structurallyResolvedHrWithoutActiveUserLookup.source, 'structure');

const structurallyResolvedHrWithoutUser = resolveHrApproverFromOrg({
  allEmployees: employees,
  rawEmployees: rawEmployees.map((employee) =>
    employee.id === 'hr-1'
      ? { ...employee, userId: undefined, hasSystemAccess: false }
      : employee,
  ),
  departments,
  jobPositions,
  activeUserIds: [],
  configuredHrUserIds: [],
  hrUserIdsByPermission: [],
});

assert.equal(structurallyResolvedHrWithoutUser.employeeId, undefined);
assert.match(
  structurallyResolvedHrWithoutUser.error || '',
  /غير مربوط بحساب مستخدم نشط/,
);

const structuralChain = buildApprovalChain({
  employee: employees[0],
  allEmployees: employees,
  requestType: 'leave',
  settings: {
    maxApprovalLevels: 3,
    hrAlwaysFinalLevel: true,
    escalationDays: 3,
    allowDelegation: false,
    autoApproveThresholds: [],
  },
  hrEmployeeId: structurallyResolvedHr,
});

assert.deepEqual(
  structuralChain.chain.map((step) => step.approverEmployeeId),
  ['sup-1', 'manager-1', 'hr-1'],
);

const legacyResolvedHr = resolveHrApproverEmployeeIdFromOrg({
  allEmployees: employees,
  rawEmployees,
  departments: departments.filter((department) => department.id !== 'hr'),
  jobPositions: jobPositions.filter((position) => position.departmentId !== 'hr' && position.id !== 'hr-manager'),
  configuredHrUserIds: ['hr-user-1'],
  hrUserIdsByPermission: [],
});

assert.equal(legacyResolvedHr, 'hr-1');

const normalizedLegacySettings = normalizeApprovalSettings({
  maxApprovalLevels: 3,
  escalationDays: 3,
  allowDelegation: false,
});

assert.equal(normalizedLegacySettings.hrAlwaysFinalLevel, true);
assert.deepEqual(normalizedLegacySettings.autoApproveThresholds, []);

for (const requestType of ['leave', 'loan', 'penalty'] as ApprovalRequestType[]) {
  const teamRequestChain = buildApprovalChain({
    employee: employees[0],
    allEmployees: employees,
    requestType,
    settings: normalizedLegacySettings,
    hrEmployeeId: 'hr-1',
  });

  assert.deepEqual(
    teamRequestChain.chain.map((step) => step.approverEmployeeId),
    ['sup-1', 'manager-1', 'hr-1'],
    `${requestType} chain should route Production Manager approvals to HR next`,
  );

  const requestAtProductionManager: FirestoreApprovalRequest = {
    requestType,
    employeeId: 'worker-1',
    employeeName: 'Worker',
    departmentId: 'prod',
    requestData: {},
    approvalChain: teamRequestChain.chain.map((step, index) => ({
      ...step,
      status: index === 0 ? 'approved' : 'pending',
    })),
    currentStep: 1,
    status: 'in_progress',
    history: [],
    sourceRequestId: null,
    createdBy: 'sup-1',
  };

  assert.equal(
    validateAction(
      { employeeId: 'manager-1', employeeName: 'Manager', permissions: { 'approval.view': true } },
      requestAtProductionManager,
    ).allowed,
    true,
    `${requestType} Production Manager should be allowed on the current step`,
  );

  const afterProductionManagerApproval = requestAtProductionManager.approvalChain.map((step, index) => ({
    ...step,
    status: index === 1 ? 'approved' : step.status,
  }));
  const nextStep = requestAtProductionManager.currentStep + 1;

  assert.equal(nextStep, 2);
  assert.equal(afterProductionManagerApproval[nextStep].approverEmployeeId, 'hr-1');
  assert.equal(afterProductionManagerApproval[nextStep].status, 'pending');
  assert.equal(
    afterProductionManagerApproval.every((step) => step.status === 'approved' || step.status === 'skipped'),
    false,
    `${requestType} should not be final-approved before HR acts`,
  );
}

console.log('approval-managed-leave.test.ts: ok');
