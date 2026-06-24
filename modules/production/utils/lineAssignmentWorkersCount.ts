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
  presentAssignments?: number;
  absentAssignments?: number;
};

type AssignmentForCount = Pick<LineWorkerAssignment, 'employeeId' | 'laborRole' | 'isPresent'>;

const isCountableAssignment = (
  assignment: Pick<LineWorkerAssignment, 'employeeId' | 'isPresent'>,
  supervisorEmployeeId?: string,
): boolean => {
  const supervisorId = String(supervisorEmployeeId || '').trim();
  if (assignment.isPresent === false) return false;
  return !supervisorId || String(assignment.employeeId || '') !== supervisorId;
};

/** Count present line workers, excluding the reporting supervisor when provided. */
export function countOperatorsFromAssignments(
  assignments: Pick<LineWorkerAssignment, 'employeeId' | 'isPresent'>[],
  supervisorEmployeeId?: string,
): number {
  return assignments.filter((assignment) => isCountableAssignment(assignment, supervisorEmployeeId)).length;
}

export function summarizeAssignmentPresence(
  assignments: Pick<LineWorkerAssignment, 'employeeId' | 'isPresent'>[],
  supervisorEmployeeId?: string,
): Pick<WorkersCountAutoFillPatch, 'presentAssignments' | 'absentAssignments'> {
  const supervisorId = String(supervisorEmployeeId || '').trim();
  return assignments.reduce(
    (summary, assignment) => {
      if (supervisorId && String(assignment.employeeId || '') === supervisorId) return summary;
      if (assignment.isPresent === false) summary.absentAssignments += 1;
      else summary.presentAssignments += 1;
      return summary;
    },
    { presentAssignments: 0, absentAssignments: 0 },
  );
}

export function countLaborRolesFromAssignments(
  assignments: AssignmentForCount[],
  supervisorEmployeeId?: string,
): WorkersCountAutoFillPatch {
  const filtered = assignments.filter((assignment) => isCountableAssignment(assignment, supervisorEmployeeId));

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
  const presence = summarizeAssignmentPresence(assignments, supervisorEmployeeId);
  const count = presence.presentAssignments;
  if (count <= 0 && presence.absentAssignments <= 0) return {};

  if (target.reportType === 'component_injection' || target.reportType === 'packaging') {
    return { workersCount: count, ...presence };
  }

  return {
    ...countLaborRolesFromAssignments(assignments, supervisorEmployeeId),
    ...presence,
  };
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
