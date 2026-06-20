import type { LineWorkerAssignment } from '@/types';
import { resolveLineWorkerLaborRole } from './lineWorkerLaborRoles';

export type WorkersCountAutoFillTarget = {
  reportType: 'finished_product' | 'component_injection' | 'packaging';
  isPackagingLine?: boolean;
};

export type WorkersCountAutoFillPatch = {
  workersCount?: number;
  workersProductionCount?: number;
  workersPackagingCount?: number;
  workersQualityCount?: number;
  workersMaintenanceCount?: number;
  workersExternalCount?: number;
};

type AssignmentForCount = Pick<LineWorkerAssignment, 'employeeId' | 'laborRole'>;

/** Count line workers, excluding the reporting supervisor when provided. */
export function countOperatorsFromAssignments(
  assignments: Pick<LineWorkerAssignment, 'employeeId'>[],
  supervisorEmployeeId?: string,
): number {
  const supervisorId = String(supervisorEmployeeId || '').trim();
  if (!supervisorId) return assignments.length;
  return assignments.filter((a) => String(a.employeeId || '') !== supervisorId).length;
}

export function countLaborRolesFromAssignments(
  assignments: AssignmentForCount[],
  supervisorEmployeeId?: string,
): WorkersCountAutoFillPatch {
  const supervisorId = String(supervisorEmployeeId || '').trim();
  const filtered = supervisorId
    ? assignments.filter((a) => String(a.employeeId || '') !== supervisorId)
    : assignments;

  const patch: WorkersCountAutoFillPatch = {
    workersProductionCount: 0,
    workersPackagingCount: 0,
    workersQualityCount: 0,
    workersMaintenanceCount: 0,
    workersExternalCount: 0,
  };

  for (const assignment of filtered) {
    const role = resolveLineWorkerLaborRole(assignment.laborRole);
    if (role === 'production') patch.workersProductionCount = (patch.workersProductionCount || 0) + 1;
    else if (role === 'packaging') patch.workersPackagingCount = (patch.workersPackagingCount || 0) + 1;
    else if (role === 'quality') patch.workersQualityCount = (patch.workersQualityCount || 0) + 1;
    else if (role === 'maintenance') patch.workersMaintenanceCount = (patch.workersMaintenanceCount || 0) + 1;
    else if (role === 'external') patch.workersExternalCount = (patch.workersExternalCount || 0) + 1;
  }

  return patch;
}

export function buildWorkersCountAutoFill(
  count: number,
  target: WorkersCountAutoFillTarget,
): WorkersCountAutoFillPatch {
  if (count <= 0) return {};

  if (target.reportType === 'component_injection' || target.reportType === 'packaging') {
    return { workersCount: count };
  }

  if (target.isPackagingLine) {
    return { workersPackagingCount: count };
  }

  return {
    workersProductionCount: count,
    workersPackagingCount: 0,
    workersQualityCount: 0,
    workersMaintenanceCount: 0,
    workersExternalCount: 0,
  };
}

export function buildWorkersCountAutoFillFromAssignments(
  assignments: AssignmentForCount[],
  target: WorkersCountAutoFillTarget,
  supervisorEmployeeId?: string,
): WorkersCountAutoFillPatch {
  const count = countOperatorsFromAssignments(assignments, supervisorEmployeeId);
  if (count <= 0) return {};

  if (target.reportType === 'component_injection' || target.reportType === 'packaging') {
    return { workersCount: count };
  }

  return countLaborRolesFromAssignments(assignments, supervisorEmployeeId);
}

export function sumWorkersCountPatch(patch: WorkersCountAutoFillPatch): number {
  return (
    Number(patch.workersCount || 0)
    + Number(patch.workersProductionCount || 0)
    + Number(patch.workersPackagingCount || 0)
    + Number(patch.workersQualityCount || 0)
    + Number(patch.workersMaintenanceCount || 0)
    + Number(patch.workersExternalCount || 0)
  );
}

export function shouldApplyWorkersCountAutoFill(
  currentTotal: number,
  lastAutoFilledTotal: number | null,
): boolean {
  if (currentTotal <= 0) return true;
  if (lastAutoFilledTotal === null) return true;
  return currentTotal === lastAutoFilledTotal;
}
