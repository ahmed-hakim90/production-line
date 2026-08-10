/**
 * Mirror of modules/repair/lib/repairAssignmentStatus.ts — keep in sync.
 * Status side-effects of technician assign / QR claim.
 */
import { mapLegacyRepairStatus } from './repairStatusIds.js';

export type RepairAssignmentStatusJobSlice = {
  status?: string | null;
  jobProducts?: Array<{ technicianDiagnosis?: string | null } | null> | null;
};

export function jobHasTechnicianDiagnosis(job: RepairAssignmentStatusJobSlice): boolean {
  const products = Array.isArray(job.jobProducts) ? job.jobProducts : [];
  return products.some((row) => String(row?.technicianDiagnosis || '').trim().length > 0);
}

export function statusAfterTechnicianAssign(currentStatus: string | null | undefined): string | null {
  const canonical = mapLegacyRepairStatus(String(currentStatus || ''));
  if (canonical === 'received') return 'diagnosing';
  return null;
}

export function statusAfterTechnicianUnassign(input: {
  currentStatus: string | null | undefined;
  hasTechnicianDiagnosis: boolean;
}): string | null {
  const canonical = mapLegacyRepairStatus(String(input.currentStatus || ''));
  if (canonical === 'diagnosing' && !input.hasTechnicianDiagnosis) return 'received';
  return null;
}

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
