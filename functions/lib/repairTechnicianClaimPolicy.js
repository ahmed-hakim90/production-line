export function decideTechnicianQrClaim(input) {
    if (input.isClosed || ['ready', 'delivered', 'cancelled', 'unrepairable'].includes(input.status))
        return 'terminal';
    if (!input.currentTechnicianId)
        return 'claim';
    if (!input.actorIds.includes(input.currentTechnicianId))
        return 'assigned_other';
    return input.currentTechnicianId === input.actorUid ? 'already_self' : 'claim';
}
