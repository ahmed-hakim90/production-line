import type { FirestoreEmployee } from '../../../types';
import type { FirestoreDepartment, FirestoreJobPosition } from '../types';
import type { ApprovalEmployeeInfo } from './types';

interface HrApproverResolutionInput {
  allEmployees: ApprovalEmployeeInfo[];
  rawEmployees: FirestoreEmployee[];
  departments: FirestoreDepartment[];
  jobPositions: FirestoreJobPosition[];
  activeUserIds?: Iterable<string>;
  configuredHrUserIds?: Iterable<string>;
  hrUserIdsByPermission?: Iterable<string>;
  explicitHrEmployeeId?: string;
}

export interface HrApproverResolutionResult {
  employeeId?: string;
  error?: string;
  source?: 'explicit' | 'structure' | 'configured' | 'permission';
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
    (normalized.includes('مدير') && (normalized.includes('موارد') || normalized.includes('شئون') || normalized.includes('شؤون')))
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

function hasLinkedActiveUser(employee: FirestoreEmployee, activeUserIds?: Set<string>): boolean {
  const userId = String(employee.userId || '').trim();
  if (!userId) return false;
  return !activeUserIds || activeUserIds.has(userId);
}

function getEmployeeName(employee: FirestoreEmployee | undefined): string {
  return String(employee?.name || employee?.id || '').trim();
}

function getStructuralError(options: {
  hrDepartmentCount: number;
  hasHrTitlePosition: boolean;
  hasDepartmentManagerReference: boolean;
  unresolvedDepartmentManagerReferences: string[];
  structuralCandidates: FirestoreEmployee[];
}): string {
  const {
    hrDepartmentCount,
    hasHrTitlePosition,
    hasDepartmentManagerReference,
    unresolvedDepartmentManagerReferences,
    structuralCandidates,
  } = options;

  if (structuralCandidates.length > 0) {
    const candidateNames = structuralCandidates.map(getEmployeeName).filter(Boolean);
    const suffix = candidateNames.length ? ` (${candidateNames.join('، ')})` : '';
    return `تم تحديد مسؤول موارد بشرية من الهيكل التنظيمي لكنه غير مربوط بحساب مستخدم نشط${suffix}`;
  }

  if (unresolvedDepartmentManagerReferences.length > 0) {
    return 'مدير قسم الموارد البشرية المحدد غير مرتبط بسجل موظف نشط';
  }

  if (hrDepartmentCount > 0 && !hasDepartmentManagerReference && !hasHrTitlePosition) {
    return 'تم العثور على قسم الموارد البشرية لكن لم يتم تعيين مدير للقسم أو منصب مدير موارد بشرية نشط';
  }

  if (hrDepartmentCount === 0 && !hasHrTitlePosition) {
    return 'لم يتم العثور على قسم موارد بشرية أو منصب مدير موارد بشرية نشط في الهيكل التنظيمي';
  }

  return 'لم يتم العثور على مسؤول موارد بشرية نشط في الهيكل التنظيمي';
}

export function resolveHrApproverFromOrg(
  input: HrApproverResolutionInput,
): HrApproverResolutionResult {
  const {
    allEmployees,
    rawEmployees,
    departments,
    jobPositions,
    activeUserIds,
    configuredHrUserIds = [],
    hrUserIdsByPermission = [],
    explicitHrEmployeeId,
  } = input;

  if (explicitHrEmployeeId) return { employeeId: explicitHrEmployeeId, source: 'explicit' };

  const activeEmployees = rawEmployees.filter((employee) => employee.isActive !== false && Boolean(employee.id));
  const employeesById = new Map(activeEmployees.map((employee) => [String(employee.id), employee]));
  const employeesByUserId = new Map(
    activeEmployees
      .map((employee) => [String(employee.userId || '').trim(), employee] as const)
      .filter(([userId]) => Boolean(userId)),
  );
  const activeUserIdSet = activeUserIds
    ? new Set(Array.from(activeUserIds).map((id) => String(id || '').trim()).filter(Boolean))
    : undefined;
  const resolveEmployeeReference = (referenceId: string): FirestoreEmployee | undefined =>
    employeesById.get(referenceId) || employeesByUserId.get(referenceId);

  const hrDepartments = departments.filter((department) => {
    if (department.isActive === false) return false;
    const code = normalize(department.code);
    const id = normalize(department.id);
    const name = normalize(department.name);
    const rawName = String(department.name || '');
    return (
      code === 'hr' ||
      code === 'humanresources' ||
      id === 'hr' ||
      id === 'humanresources' ||
      name === 'hr' ||
      name === 'humanresources' ||
      rawName.includes('الموارد البشرية') ||
      (rawName.includes('موارد') && rawName.includes('بشر')) ||
      rawName.includes('شئون العاملين') ||
      rawName.includes('شؤون العاملين')
    );
  });

  const hrDepartmentIds = new Set(
    hrDepartments
      .map((department) => String(department.id || '').trim())
      .filter(Boolean),
  );

  const departmentManagerReferences = hrDepartments
    .map((department) => String(department.managerId || '').trim())
    .filter(Boolean);
  const departmentManagerCandidates = departmentManagerReferences
    .map((managerId) => resolveEmployeeReference(managerId))
    .filter((employee): employee is FirestoreEmployee => Boolean(employee));
  const unresolvedDepartmentManagerReferences = departmentManagerReferences.filter(
    (managerId) => !resolveEmployeeReference(managerId),
  );

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

  const linkedStructuralCandidates = structuralCandidates.filter((employee) =>
    hasLinkedActiveUser(employee, activeUserIdSet),
  );
  const structuralCandidateId = pickBestCandidate(linkedStructuralCandidates, allEmployees);
  if (structuralCandidateId) return { employeeId: structuralCandidateId, source: 'structure' };

  const hasStructuralHrSetup =
    hrDepartments.length > 0 ||
    titleMatchedPositionIds.size > 0 ||
    departmentManagerReferences.length > 0;
  if (hasStructuralHrSetup) {
    return {
      error: getStructuralError({
        hrDepartmentCount: hrDepartments.length,
        hasHrTitlePosition: titleMatchedPositionIds.size > 0,
        hasDepartmentManagerReference: departmentManagerReferences.length > 0,
        unresolvedDepartmentManagerReferences,
        structuralCandidates,
      }),
    };
  }

  const configuredUserIds = new Set(
    Array.from(configuredHrUserIds)
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  const configuredCandidates = activeEmployees.filter(
    (employee) => (
      hasLinkedActiveUser(employee, activeUserIdSet) &&
      configuredUserIds.has(String(employee.userId || '').trim())
    ),
  );
  const configuredCandidateId = pickBestCandidate(configuredCandidates, allEmployees);
  if (configuredCandidateId) return { employeeId: configuredCandidateId, source: 'configured' };

  const permissionUserIds = new Set(
    Array.from(hrUserIdsByPermission)
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  const permissionCandidates = activeEmployees.filter(
    (employee) => (
      hasLinkedActiveUser(employee, activeUserIdSet) &&
      permissionUserIds.has(String(employee.userId || '').trim())
    ),
  );
  const permissionCandidateId = pickBestCandidate(permissionCandidates, allEmployees);
  if (permissionCandidateId) return { employeeId: permissionCandidateId, source: 'permission' };

  return {
    error: getStructuralError({
      hrDepartmentCount: hrDepartments.length,
      hasHrTitlePosition: titleMatchedPositionIds.size > 0,
      hasDepartmentManagerReference: departmentManagerReferences.length > 0,
      unresolvedDepartmentManagerReferences,
      structuralCandidates,
    }),
  };
}

export function resolveHrApproverEmployeeIdFromOrg(
  input: HrApproverResolutionInput,
): string | undefined {
  return resolveHrApproverFromOrg(input).employeeId;
}
