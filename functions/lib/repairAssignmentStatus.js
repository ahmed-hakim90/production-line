/**
 * Mirror of modules/repair/lib/repairAssignmentStatus.ts — keep in sync.
 * Status side-effects of technician assign / QR claim.
 */
import { mapLegacyRepairStatus } from './repairStatusIds.js';
export function jobHasTechnicianDiagnosis(job) {
    const products = Array.isArray(job.jobProducts) ? job.jobProducts : [];
    return products.some((row) => String(row?.technicianDiagnosis || '').trim().length > 0);
}
export function statusAfterTechnicianAssign(currentStatus) {
    const canonical = mapLegacyRepairStatus(String(currentStatus || ''));
    if (canonical === 'received')
        return 'diagnosing';
    return null;
}
export function statusAfterTechnicianUnassign(input) {
    const canonical = mapLegacyRepairStatus(String(input.currentStatus || ''));
    if (canonical === 'diagnosing' && !input.hasTechnicianDiagnosis)
        return 'received';
    return null;
}
export function resolveAssignmentStatusPatch(input) {
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
