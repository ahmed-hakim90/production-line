import assert from 'node:assert/strict';
import { buildApprovalChain } from '../modules/hr/approval/approvalBuilder.ts';
import { validateAction, validateCreate } from '../modules/hr/approval/approvalValidation.ts';
import {
  normalizeApprovalSettings,
  type ApprovalEmployeeInfo,
  type ApprovalRequestType,
  type FirestoreApprovalRequest,
} from '../modules/hr/approval/types.ts';

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
