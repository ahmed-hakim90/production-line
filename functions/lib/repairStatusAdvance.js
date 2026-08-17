/** Keep in sync with modules/repair/lib/repairStatusAdvance.ts */
import { mapLegacyRepairStatus } from './repairStatusIds.js';
export const REPAIR_STATUS_ROLES = [
    'intake',
    'in_diagnosis',
    'diagnosis',
    'estimate_review',
    'awaiting_customer',
    'awaiting_parts',
    'in_repair',
    'ready_delivery',
    'delivered',
    'cancelled',
    'unrepairable',
    'none',
];
const DEFAULT_ROLE_BY_STATUS_ID = {
    received: 'intake',
    diagnosing: 'in_diagnosis',
    inspection: 'in_diagnosis',
    diagnosed: 'diagnosis',
    estimate_ready: 'estimate_review',
    waiting_approval: 'awaiting_customer',
    waiting_parts: 'awaiting_parts',
    repairing: 'in_repair',
    repair: 'in_repair',
    testing: 'none',
    ready: 'ready_delivery',
    delivered: 'delivered',
    cancelled: 'cancelled',
    unrepairable: 'unrepairable',
};
const ROLE_FLOW_ORDER = [
    'intake',
    'in_diagnosis',
    'diagnosis',
    'estimate_review',
    'awaiting_customer',
    'awaiting_parts',
    'in_repair',
    'ready_delivery',
    'delivered',
];
export function isRepairStatusRole(value) {
    return typeof value === 'string' && REPAIR_STATUS_ROLES.includes(value);
}
export function defaultRoleForStatusId(statusId) {
    const canonical = mapLegacyRepairStatus(statusId);
    return DEFAULT_ROLE_BY_STATUS_ID[canonical] || 'none';
}
export function resolveStatusRole(statusId, rows) {
    const canonical = mapLegacyRepairStatus(statusId);
    const row = (rows || []).find((s) => mapLegacyRepairStatus(s.id) === canonical);
    if (row && isRepairStatusRole(row.role) && row.role !== 'none')
        return row.role;
    if (row && row.role === 'none')
        return 'none';
    return defaultRoleForStatusId(canonical);
}
export function statusIdForRole(role, rows) {
    if (role === 'none')
        return null;
    const enabled = (rows || [])
        .filter((s) => s.isEnabled !== false)
        .slice()
        .sort((a, b) => a.order - b.order);
    const byRole = enabled.find((s) => {
        const r = isRepairStatusRole(s.role) ? s.role : defaultRoleForStatusId(s.id);
        return r === role;
    });
    if (byRole)
        return mapLegacyRepairStatus(byRole.id);
    const fallback = Object.entries(DEFAULT_ROLE_BY_STATUS_ID).find(([, r]) => r === role)?.[0];
    return fallback || null;
}
export function roleFlowIndex(role) {
    const idx = ROLE_FLOW_ORDER.indexOf(role);
    return idx >= 0 ? idx : -1;
}
export function partsAwaitingFulfillment(partsUsed) {
    return (partsUsed || []).some((row) => ['pending_supply', 'ready_to_issue'].includes(String(row.fulfillmentStatus || '')));
}
function healDiagnosisRoleSplit(rows) {
    const next = rows.map((row) => ({ ...row }));
    const diagnosing = next.find((row) => row.id === 'diagnosing');
    const diagnosed = next.find((row) => row.id === 'diagnosed');
    if (diagnosing && diagnosing.role === 'diagnosis') {
        diagnosing.role = 'in_diagnosis';
    }
    if (diagnosed && (diagnosed.role === 'none' || !diagnosed.role)) {
        diagnosed.role = 'diagnosis';
    }
    if (!diagnosed) {
        next.push({
            id: 'diagnosed',
            order: (diagnosing?.order || 2) + 0.5,
            isEnabled: true,
            isTerminal: false,
            role: 'diagnosis',
        });
        next.sort((a, b) => a.order - b.order);
    }
    return next;
}
export function loadWorkflowStatusRows(rawStatuses) {
    if (!Array.isArray(rawStatuses) || rawStatuses.length === 0) {
        return Object.entries(DEFAULT_ROLE_BY_STATUS_ID)
            .filter(([id]) => !['inspection', 'repair'].includes(id))
            .map(([id, role], index) => ({
            id,
            order: index + 1,
            isEnabled: true,
            isTerminal: ['delivered', 'cancelled', 'unrepairable'].includes(id),
            role,
        }));
    }
    const mapped = rawStatuses.map((raw, index) => {
        const row = (raw && typeof raw === 'object' ? raw : {});
        const id = mapLegacyRepairStatus(String(row.id || '').trim());
        const roleRaw = row.role;
        const role = isRepairStatusRole(roleRaw) ? roleRaw : defaultRoleForStatusId(id);
        return {
            id,
            order: Number.isFinite(Number(row.order)) ? Number(row.order) : index + 1,
            isTerminal: Boolean(row.isTerminal),
            isEnabled: row.isEnabled !== false,
            role,
        };
    }).filter((row) => row.id);
    return healDiagnosisRoleSplit(mapped);
}
export async function loadTenantWorkflowStatuses(db, tenantId) {
    const snap = await db.collection('system_settings').doc(tenantId).get();
    const repairSettings = (snap.data()?.repairSettings || {});
    const workflow = (repairSettings.workflow || {});
    return loadWorkflowStatusRows(workflow.statuses);
}
export function resolveNextStatusForAction(input) {
    const current = mapLegacyRepairStatus(input.currentStatus);
    const currentRole = resolveStatusRole(current, input.statuses);
    if (currentRole === 'delivered'
        || currentRole === 'cancelled'
        || currentRole === 'unrepairable') {
        return null;
    }
    const currentIdx = roleFlowIndex(currentRole);
    const pick = (role) => {
        const targetId = statusIdForRole(role, input.statuses);
        if (!targetId)
            return null;
        const targetRole = resolveStatusRole(targetId, input.statuses);
        const targetIdx = roleFlowIndex(targetRole);
        if (targetIdx < 0)
            return mapLegacyRepairStatus(targetId) === current ? null : targetId;
        if (currentIdx >= 0 && targetIdx < currentIdx)
            return null;
        if (mapLegacyRepairStatus(targetId) === current)
            return null;
        return targetId;
    };
    const afterCustomerGate = () => (input.waitsForParts ? (pick('awaiting_parts') || pick('in_repair')) : pick('in_repair'));
    switch (input.action) {
        case 'diagnosis_saved': {
            if (!input.hasDiagnosis)
                return null;
            // Diagnosis text saved → تم الفحص. With part/service already on the job,
            // advance straight to estimate review (still may pass through diagnosed if estimate role missing).
            // Full warranty skips pricing approval and starts repair (or waits for parts).
            if (input.hasServiceOrPartSignal) {
                if (input.skipCustomerApproval) {
                    return afterCustomerGate() || pick('estimate_review') || pick('diagnosis');
                }
                return pick('estimate_review') || pick('diagnosis');
            }
            return pick('diagnosis');
        }
        case 'part_or_service_linked': {
            if (currentRole === 'in_repair'
                || currentRole === 'awaiting_parts'
                || currentRole === 'awaiting_customer'
                || currentRole === 'ready_delivery') {
                if (input.waitsForParts) {
                    const targetId = statusIdForRole('awaiting_parts', input.statuses);
                    if (!targetId || mapLegacyRepairStatus(targetId) === current)
                        return null;
                    return targetId;
                }
                if (input.skipCustomerApproval && currentRole === 'awaiting_customer') {
                    return pick('in_repair');
                }
                return null;
            }
            if (input.skipCustomerApproval) {
                return afterCustomerGate() || pick('estimate_review');
            }
            return pick('estimate_review');
        }
        case 'estimate_sent':
            return pick('awaiting_customer');
        case 'customer_approved':
            return input.waitsForParts ? pick('awaiting_parts') : pick('in_repair');
        case 'parts_ready':
            if (currentRole === 'awaiting_parts')
                return pick('in_repair');
            return null;
        case 'repair_done': {
            const warrantyMayFinish = Boolean(input.skipCustomerApproval)
                && (currentRole === 'estimate_review'
                    || currentRole === 'awaiting_customer'
                    || currentRole === 'diagnosis');
            if (currentRole !== 'in_repair'
                && currentRole !== 'awaiting_parts'
                && currentRole !== 'none'
                && !warrantyMayFinish) {
                return null;
            }
            if (currentRole === 'awaiting_parts' && input.waitsForParts)
                return null;
            return pick('ready_delivery');
        }
        default:
            return null;
    }
}
export function isStatusRole(statusId, role, rows) {
    return resolveStatusRole(statusId, rows) === role;
}
