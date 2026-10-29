const clean = (value) => String(value ?? '').trim();
export function policyStateFromSettings(exists, value) {
    if (!exists)
        return 'missing';
    if (value === undefined)
        return 'off';
    if (value === true)
        return 'on';
    if (value === false)
        return 'off';
    return 'unreadable';
}
export function countOpenScanSessions(events) {
    const ordered = [...events].sort((left, right) => (left.timestampMs || 0) - (right.timestampMs || 0));
    const open = new Set();
    for (const event of ordered) {
        const sessionId = clean(event.sessionId);
        if (!sessionId)
            continue;
        if (event.action === 'IN')
            open.add(sessionId);
        if (event.action === 'OUT')
            open.delete(sessionId);
    }
    return open.size;
}
const legacyRelease = (status) => status === 'approved' || status === 'not_required';
const palletsReleased = (pallets) => pallets.length > 0 && pallets.every((pallet) => pallet.inspectionStatus === 'تم الفحص' && pallet.palletDecision === 'مقبول');
/**
 * Authority for closing a work order. A missing settings document means the
 * policy is off. An unreadable policy, a failed pallet read, or a failed
 * permission check denies the close.
 */
export function evaluateWorkOrderClose(input) {
    if (!input.actorIsSuperAdmin && clean(input.actorTenantId) !== clean(input.workOrderTenantId)) {
        return { ok: false, reason: 'tenant' };
    }
    if (!input.actorIsSuperAdmin && !input.hasClosePermission) {
        return { ok: false, reason: 'permission' };
    }
    if (input.workOrderStatus === 'completed')
        return { ok: true, alreadyClosed: true };
    if (input.workOrderStatus === 'cancelled')
        return { ok: false, reason: 'cancelled' };
    if (input.mode === 'quantity_reached') {
        if (!(input.targetQuantity > 0) || input.producedQuantity < input.targetQuantity) {
            return { ok: false, reason: 'quantity' };
        }
    }
    else {
        if (!Number.isFinite(input.actualWorkHours) || input.actualWorkHours <= 0) {
            return { ok: false, reason: 'hours' };
        }
        if (input.openSessions > 0)
            return { ok: false, reason: 'sessions' };
    }
    if (input.policyState === 'unreadable')
        return { ok: false, reason: 'policy-unreadable' };
    if (input.policyState === 'on') {
        if (legacyRelease(input.legacyQualityStatus))
            return { ok: true };
        if (input.palletReadFailed)
            return { ok: false, reason: 'policy-unreadable' };
        if (!palletsReleased(input.pallets))
            return { ok: false, reason: 'quality-not-released' };
    }
    return { ok: true };
}
