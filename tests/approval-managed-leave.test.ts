import assert from 'node:assert/strict';
import { buildApprovalChain } from '../modules/hr/approval/approvalBuilder.ts';
import { validateCreate } from '../modules/hr/approval/approvalValidation.ts';
import type { ApprovalEmployeeInfo } from '../modules/hr/approval/types.ts';

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

console.log('approval-managed-leave.test.ts: ok');
