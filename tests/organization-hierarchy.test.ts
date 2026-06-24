import assert from 'node:assert/strict';
import {
  buildDepartmentPositionHierarchy,
  getDirectReportCounts,
  resolveEmployeeHierarchyId,
  resolveEmployeeManagerId,
  wouldCreateManagerCycle,
} from '../modules/hr/utils/organizationHierarchy.ts';

const employees = [
  { id: 'ceo' },
  { id: 'hr-manager', managerId: 'ceo' },
  { id: 'production-manager', managerId: 'ceo' },
  { id: 'supervisor', managerId: 'production-manager' },
  { id: 'worker', managerId: 'supervisor' },
];

assert.equal(wouldCreateManagerCycle(employees, 'ceo', 'worker'), true);
assert.equal(wouldCreateManagerCycle(employees, 'supervisor', 'worker'), true);
assert.equal(wouldCreateManagerCycle(employees, 'worker', 'production-manager'), false);
assert.equal(wouldCreateManagerCycle(employees, 'worker', ''), false);
assert.equal(wouldCreateManagerCycle(employees, 'worker', 'worker'), true);

assert.deepEqual(getDirectReportCounts(employees), {
  ceo: 2,
  'production-manager': 1,
  supervisor: 1,
});

const employeesWithUserReferences = [
  { id: 'ceo', userId: 'ceo-user' },
  { id: 'production-manager', userId: 'manager-user', reportsTo: 'ceo-user' },
  { id: 'supervisor', userId: 'supervisor-user', managerEmployeeId: 'manager-user' },
  { id: 'worker', userId: 'worker-user', managerId: 'supervisor-user' },
];

assert.equal(resolveEmployeeHierarchyId(employeesWithUserReferences, 'manager-user'), 'production-manager');
assert.equal(resolveEmployeeHierarchyId(employeesWithUserReferences, 'production-manager'), 'production-manager');
assert.equal(resolveEmployeeManagerId(employeesWithUserReferences, employeesWithUserReferences[1]), 'ceo');
assert.equal(resolveEmployeeManagerId(employeesWithUserReferences, employeesWithUserReferences[2]), 'production-manager');
assert.equal(wouldCreateManagerCycle(employeesWithUserReferences, 'production-manager', 'worker-user'), true);
assert.deepEqual(getDirectReportCounts(employeesWithUserReferences), {
  ceo: 1,
  'production-manager': 1,
  supervisor: 1,
});

const departments = [
  { id: 'production', name: 'الإنتاج', managerId: 'production-manager' },
  { id: 'hr', name: 'الموارد البشرية', managerId: 'hr-manager' },
];

const positions = [
  { id: 'worker-position', title: 'عامل إنتاج', departmentId: 'production', level: 1 },
  { id: 'supervisor-position', title: 'مشرف إنتاج', departmentId: 'production', level: 2 },
  { id: 'hr-position', title: 'أخصائي موارد بشرية', departmentId: 'hr', level: 2 },
];

const departmentEmployees = [
  { id: 'worker', name: 'عامل', departmentId: 'production', jobPositionId: 'worker-position', level: 1 },
  { id: 'supervisor', name: 'مشرف', departmentId: 'production', jobPositionId: 'supervisor-position', level: 2 },
  { id: 'trainee', name: 'متدرب', departmentId: 'production', jobPositionId: '', level: 1 },
  { id: 'hr-specialist', name: 'أخصائي', departmentId: 'hr', jobPositionId: 'hr-position', level: 2 },
  { id: 'unassigned', name: 'غير محدد', departmentId: '', jobPositionId: '', level: 1 },
];

const hierarchy = buildDepartmentPositionHierarchy(
  [
    { id: 'production', name: 'الإنتاج', managerId: 'manager-user' },
    departments[1],
  ],
  positions,
  [
    ...departmentEmployees,
    { id: 'production-manager', userId: 'manager-user', name: 'مدير الإنتاج', departmentId: '', jobPositionId: '', level: 3 },
  ],
);

assert.equal(hierarchy.length, 2);
assert.equal(hierarchy[0].department.id, 'production');
assert.equal(hierarchy[0].managerId, 'production-manager');
assert.equal(hierarchy[0].employeeCount, 3);
assert.deepEqual(hierarchy[0].positions.map((group) => group.position.id), ['supervisor-position', 'worker-position']);
assert.deepEqual(hierarchy[0].positions.map((group) => group.employees.map((employee) => employee.id)), [['supervisor'], ['worker']]);
assert.deepEqual(hierarchy[0].employeesWithoutPosition.map((employee) => employee.id), ['trainee']);
assert.equal(hierarchy[1].department.id, 'hr');
assert.deepEqual(hierarchy[1].positions[0].employees.map((employee) => employee.id), ['hr-specialist']);
