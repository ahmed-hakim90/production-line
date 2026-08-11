export type TechnicianQrClaimDecision = 'claim' | 'already_self' | 'terminal' | 'assigned_other';

const TERMINAL_STATUSES = new Set(['ready', 'delivered', 'cancelled', 'unrepairable']);

/** Closed / terminal jobs cannot be newly claimed — but the assigned tech may reopen for view. */
export function decideTechnicianQrClaim(input: {
  isClosed: boolean;
  status: string;
  currentTechnicianId: string;
  actorUid: string;
  actorIds: string[];
}): TechnicianQrClaimDecision {
  const assigned = String(input.currentTechnicianId || '').trim();
  const isSelf = Boolean(assigned) && input.actorIds.includes(assigned);
  const isTerminal = input.isClosed || TERMINAL_STATUSES.has(String(input.status || ''));
  if (isTerminal) return isSelf ? 'already_self' : 'terminal';
  if (!assigned) return 'claim';
  if (!isSelf) return 'assigned_other';
  return assigned === input.actorUid ? 'already_self' : 'claim';
}
