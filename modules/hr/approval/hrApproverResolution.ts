import type { FirestoreEmployee } from '../../../types';
import type { FirestoreDepartment, FirestoreJobPosition } from '../types';
import type { ApprovalEmployeeInfo } from './types';

interface HrApproverResolutionInput {
  allEmployees: ApprovalEmployeeInfo[];
  rawEmployees: FirestoreEmployee[];
  departments: FirestoreDepartment[];
  jobPositions: FirestoreJobPosition[];
  configuredHrUserIds?: Iterable<string>;
  hrUserIdsByPermission?: Iterable<string>;
  explicitHrEmployeeId?: string;
}

function normalize(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function hasHrManagerTitle(value: unknown): boolean {
  const normalized = normalize(value);
  if (!normalized) return false;

  return (
    normalized.includes('hrmanager') ||
    normalized.includes('humanresourcesmanager') ||
    (normalized.includes('مدير') && normalized.includes('موارد'))
  );
}

function pickBestCandidate(
  candidates: FirestoreEmployee[],
  allEmployees: ApprovalEmployeeInfo[],
): string | undefined {
  const infoById = new Map(allEmployees.map((employee) => [employee.employeeId, employee]));
  const uniqueCandidates = candidates
    .filter((employee) => employee.isActive !== false && Boolean(employee.id))
    .filter((employee, index, rows) => rows.findIndex((row) => row.id === employee.id) === index);

  const inCurrentGraph = uniqueCandidates
    .filter((employee) => infoById.has(String(employee.id)))
    .sort((a, b) => {
      const aInfo = infoById.get(String(a.id));
      const bInfo = infoById.get(String(b.id));
      return (bInfo?.jobLevel ?? Number(b.level || 0)) - (aInfo?.jobLevel ?? Number(a.level || 0));
    });

  return String((inCurrentGraph[0] || uniqueCandidates[0])?.id || '') || undefined;
}

export function resolveHrApproverEmployeeIdFromOrg(
  input: HrApproverResolutionInput,
): string | undefined {
  const {
    allEmployees,
    rawEmployees,
    departments,
    jobPositions,
    configuredHrUserIds = [],
    hrUserIdsByPermission = [],
    explicitHrEmployeeId,
  } = input;

  if (explicitHrEmployeeId) return explicitHrEmployeeId;

  const activeEmployees = rawEmployees.filter((employee) => employee.isActive !== false && Boolean(employee.id));
  const employeesById = new Map(activeEmployees.map((employee) => [String(employee.id), employee]));

  const hrDepartments = departments.filter((department) => {
    if (department.isActive === false) return false;
    const code = normalize(department.code);
    const id = normalize(department.id);
    const name = normalize(department.name);
    return (
      code === 'hr' ||
      id === 'hr' ||
      id === 'humanresources' ||
      name === 'hr' ||
      name === 'humanresources' ||
      String(department.name || '').includes('الموارد البشرية')
    );
  });

  const hrDepartmentIds = new Set(
    hrDepartments
      .map((department) => String(department.id || '').trim())
      .filter(Boolean),
  );

  const departmentManagerCandidates = hrDepartments
    .map((department) => String(department.managerId || '').trim())
    .filter(Boolean)
    .map((managerId) => employeesById.get(managerId))
    .filter((employee): employee is FirestoreEmployee => Boolean(employee));

  const hrDepartmentPositionIds = new Set(
    jobPositions
      .filter((position) => position.isActive !== false)
      .filter((position) => hrDepartmentIds.has(String(position.departmentId || '').trim()))
      .filter((position) => Number(position.level || 0) >= 3 || hasHrManagerTitle(position.title))
      .map((position) => String(position.id || '').trim())
      .filter(Boolean),
  );

  const titleMatchedPositionIds = new Set(
    jobPositions
      .filter((position) => position.isActive !== false)
      .filter((position) => hasHrManagerTitle(position.title) || hasHrManagerTitle(position.id))
      .map((position) => String(position.id || '').trim())
      .filter(Boolean),
  );

  const structuralCandidates = [
    ...departmentManagerCandidates,
    ...activeEmployees.filter((employee) => {
      const departmentId = String(employee.departmentId || '').trim();
      const jobPositionId = String(employee.jobPositionId || '').trim();
      return (
        hrDepartmentPositionIds.has(jobPositionId) ||
        titleMatchedPositionIds.has(jobPositionId) ||
        (hrDepartmentIds.has(departmentId) && Number(employee.level || 0) >= 3)
      );
    }),
  ];

  const structuralCandidateId = pickBestCandidate(structuralCandidates, allEmployees);
  if (structuralCandidateId) return structuralCandidateId;

  const configuredUserIds = new Set(
    Array.from(configuredHrUserIds)
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  const configuredCandidates = activeEmployees.filter(
    (employee) => Boolean(employee.userId) && configuredUserIds.has(String(employee.userId || '').trim()),
  );
  const configuredCandidateId = pickBestCandidate(configuredCandidates, allEmployees);
  if (configuredCandidateId) return configuredCandidateId;

  const permissionUserIds = new Set(
    Array.from(hrUserIdsByPermission)
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  const permissionCandidates = activeEmployees.filter(
    (employee) => Boolean(employee.userId) && permissionUserIds.has(String(employee.userId || '').trim()),
  );
  return pickBestCandidate(permissionCandidates, allEmployees);
}
