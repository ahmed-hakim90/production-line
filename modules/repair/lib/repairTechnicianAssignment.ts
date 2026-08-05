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
