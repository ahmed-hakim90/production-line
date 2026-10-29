import type { QualityStaffAssignment } from '../model';

export interface StaffEmployeeRef {
  id: string;
  tenantId?: string;
  name: string;
  isActive: boolean;
  userId?: string;
}

export interface StaffAssignmentDraft {
  employeeId: string;
  stationIds: string[];
  lineIds: string[];
  isActive: boolean;
  userId?: string;
}

const clean = (value: unknown): string => String(value ?? '').trim();

export function staffAssignmentDocId(tenantId: string, employeeId: string): string {
  return `${clean(tenantId)}__${clean(employeeId)}`;
}

export function assertStaffDraft(input: StaffAssignmentDraft): StaffAssignmentDraft {
  const employeeId = clean(input.employeeId);
  if (!employeeId) throw new Error('اختر موظفاً من سجل الموظفين.');
  const stationIds = [...new Set((input.stationIds || []).map(clean).filter(Boolean))];
  const lineIds = [...new Set((input.lineIds || []).map(clean).filter(Boolean))];
  if (stationIds.length > 30 || lineIds.length > 30) throw new Error('عدد الخطوط أو المحطات أكبر من الحد المسموح.');
  if ('permissions' in (input as object) || 'roleId' in (input as object)) {
    throw new Error('تعيين الجودة لا يغيّر صلاحيات الدور.');
  }
  return {
    employeeId,
    stationIds,
    lineIds,
    isActive: input.isActive !== false,
    userId: clean(input.userId),
  };
}

export function assignmentAllowsScope(
  assignment: Pick<QualityStaffAssignment, 'isActive' | 'stationIds' | 'lineIds' | 'employeeId' | 'tenantId'>,
  scope: { tenantId: string; stationId?: string; lineId?: string },
): boolean {
  if (!assignment.isActive) return false;
  if (clean(assignment.tenantId) !== clean(scope.tenantId)) return false;
  const stationId = clean(scope.stationId);
  const lineId = clean(scope.lineId);
  if (stationId && assignment.stationIds.length > 0 && !assignment.stationIds.includes(stationId)) return false;
  if (!stationId && assignment.stationIds.length > 0 && scope.stationId === '') return false;
  if (lineId && assignment.lineIds.length > 0 && !assignment.lineIds.includes(lineId)) return false;
  return true;
}

export function inspectorMayBeSelected(input: {
  tenantId: string;
  employee: StaffEmployeeRef | null;
  assignment: QualityStaffAssignment | null;
  stationId?: string;
  lineId?: string;
  stationIsNew?: boolean;
}): boolean {
  const employee = input.employee;
  const assignment = input.assignment;
  if (!employee || employee.isActive !== true) return false;
  if (clean(employee.tenantId) !== clean(input.tenantId)) return false;
  if (!assignment || assignment.employeeId !== employee.id || !assignment.isActive) return false;
  if (assignment.tenantId !== input.tenantId) return false;
  if (input.stationIsNew && assignment.stationIds.length > 0) return false;
  return assignmentAllowsScope(assignment, {
    tenantId: input.tenantId,
    stationId: input.stationId,
    lineId: input.lineId,
  });
}

export function selectableInspectors<T extends StaffEmployeeRef>(
  employees: T[],
  assignments: QualityStaffAssignment[],
  scope: { tenantId: string; stationId?: string; lineId?: string; stationIsNew?: boolean },
): T[] {
  const byEmployee = new Map(assignments.map((assignment) => [assignment.employeeId, assignment]));
  return employees.filter((employee) => inspectorMayBeSelected({
    tenantId: scope.tenantId,
    employee,
    assignment: byEmployee.get(employee.id) || null,
    stationId: scope.stationId,
    lineId: scope.lineId,
    stationIsNew: scope.stationIsNew,
  }));
}
