export type TechnicianQrClaimDecision = 'claim' | 'already_self' | 'terminal' | 'assigned_other';

export function decideTechnicianQrClaim(input: {
  isClosed: boolean;
  status: string;
  currentTechnicianId: string;
  actorUid: string;
  actorIds: string[];
}): TechnicianQrClaimDecision {
  if (input.isClosed || ['ready', 'delivered', 'cancelled', 'unrepairable'].includes(input.status)) return 'terminal';
  if (!input.currentTechnicianId) return 'claim';
  if (!input.actorIds.includes(input.currentTechnicianId)) return 'assigned_other';
  return input.currentTechnicianId === input.actorUid ? 'already_self' : 'claim';
}
