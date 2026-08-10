/**
 * Prefer Auth uid when assigning a branch employee to a job.
 * Branch technicianIds are employee ids; "طلباتي" matches the logged-in uid
 * (and linked employee id). Storing only an unlinked employee id hides the job.
 */
export function resolveTechnicianIdForJobAssignment(input: {
  selectedBranchTechnicianId: string;
  branchTechnicians: Array<{ id: string; userId?: string | null }>;
}): { assignId: string; hasLinkedUser: boolean } {
  const selectedId = String(input.selectedBranchTechnicianId || '').trim();
  if (!selectedId) return { assignId: '', hasLinkedUser: false };
  const match = (input.branchTechnicians || []).find((row) => {
    const id = String(row.id || '').trim();
    const userId = String(row.userId || '').trim();
    return id === selectedId || userId === selectedId;
  });
  const linkedUserId = String(match?.userId || '').trim();
  if (linkedUserId) return { assignId: linkedUserId, hasLinkedUser: true };
  return { assignId: selectedId, hasLinkedUser: false };
}

/**
 * «إسناد لي» is for branch technicians only — reception/admin may assign
 * someone from the technician list, but must not self-assign as the job tech.
 */
export function isActorBranchTechnician(input: {
  actorUserId?: string | null;
  actorEmployeeId?: string | null;
  branchTechnicians: Array<{ id: string; userId?: string | null }>;
}): boolean {
  const uid = String(input.actorUserId || '').trim();
  const empId = String(input.actorEmployeeId || '').trim();
  if (!uid && !empId) return false;
  return (input.branchTechnicians || []).some((row) => {
    const id = String(row.id || '').trim();
    const userId = String(row.userId || '').trim();
    return (uid && (id === uid || userId === uid)) || (empId && id === empId);
  });
}

/**
 * Any non-empty technicianId written on a job must resolve to a branch technician
 * (employee id and/or linked Auth uid stored on repair_branches.technicianIds).
 * Empty assigneeId = desk unassign (always allowed by this check).
 */
export function isAssignableBranchTechnicianId(input: {
  assigneeId: string;
  originalId?: string | null;
  linkedEmployeeId?: string | null;
  branchTechnicianIds: Array<string | null | undefined>;
}): boolean {
  const assigneeId = String(input.assigneeId || '').trim();
  if (!assigneeId) return true;
  const allowed = new Set(
    (input.branchTechnicianIds || []).map((id) => String(id || '').trim()).filter(Boolean),
  );
  if (allowed.size === 0) return false;
  const candidates = [
    assigneeId,
    String(input.originalId || '').trim(),
    String(input.linkedEmployeeId || '').trim(),
  ].filter(Boolean);
  return candidates.some((id) => allowed.has(id));
}
