import type { LineWorkerAssignment } from '@/types';

export function inheritLineAssignmentsForDate(
  assignments: LineWorkerAssignment[],
  targetDate: string,
): LineWorkerAssignment[] {
  return assignments.map(({ id: _id, ...assignment }) => ({
    ...assignment,
    date: targetDate,
  }));
}

export function resolveEffectiveLineAssignmentsForDate(
  exactAssignments: LineWorkerAssignment[],
  inheritedAssignments: LineWorkerAssignment[],
  targetDate: string,
): LineWorkerAssignment[] {
  if (exactAssignments.length > 0) return exactAssignments;
  return inheritLineAssignmentsForDate(inheritedAssignments, targetDate);
}
