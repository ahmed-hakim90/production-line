/**
 * Status side-effects of technician assign / unassign.
 * Assignment is orthogonal to workflow, except:
 * - assign on وارد → جاري الفحص (diagnosing)
 * - unassign on diagnosing with no technician diagnosis → back to وارد
 */
import { mapLegacyRepairStatus } from '../utils/repairStatusIds';

export type RepairAssignmentStatusJobSlice = {
  status?: string | null;
  jobProducts?: Array<{ technicianDiagnosis?: string | null } | null> | null;
};

/** True when any line has a saved workshop technician diagnosis. */
export function jobHasTechnicianDiagnosis(job: RepairAssignmentStatusJobSlice): boolean {
  const products = Array.isArray(job.jobProducts) ? job.jobProducts : [];
  return products.some((row) => String(row?.technicianDiagnosis || '').trim().length > 0);
}

/**
 * Status to apply when a technician is assigned/claimed.
 * Returns null when status should stay unchanged.
 */
export function statusAfterTechnicianAssign(currentStatus: string | null | undefined): string | null {
  const canonical = mapLegacyRepairStatus(String(currentStatus || ''));
  if (canonical === 'received') return 'diagnosing';
  return null;
}

/**
 * Status to apply when a technician is unassigned (فك الإسناد).
 * Returns null when status should stay unchanged.
 */
export function statusAfterTechnicianUnassign(input: {
  currentStatus: string | null | undefined;
  hasTechnicianDiagnosis: boolean;
}): string | null {
  const canonical = mapLegacyRepairStatus(String(input.currentStatus || ''));
  if (canonical === 'diagnosing' && !input.hasTechnicianDiagnosis) return 'received';
  return null;
}

/** Resolve assign/unassign status patch in one call. */
export function resolveAssignmentStatusPatch(input: {
  action: 'assign' | 'unassign';
  currentStatus: string | null | undefined;
  jobProducts?: RepairAssignmentStatusJobSlice['jobProducts'];
}): string | null {
  if (input.action === 'assign') {
    return statusAfterTechnicianAssign(input.currentStatus);
  }
  return statusAfterTechnicianUnassign({
    currentStatus: input.currentStatus,
    hasTechnicianDiagnosis: jobHasTechnicianDiagnosis({
      status: input.currentStatus,
      jobProducts: input.jobProducts,
    }),
  });
}
