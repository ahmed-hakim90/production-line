export type WorkOrderCloseMode = 'operator' | 'quantity_reached';

export type QualityPolicyState = 'missing' | 'off' | 'on' | 'unreadable';

export type WorkOrderCloseDenial =
  | 'permission'
  | 'tenant'
  | 'cancelled'
  | 'hours'
  | 'sessions'
  | 'quantity'
  | 'policy-unreadable'
  | 'quality-not-released';

export interface WorkOrderCloseFact {
  actorTenantId: string;
  actorIsSuperAdmin: boolean;
  hasClosePermission: boolean;
  workOrderTenantId: string;
  workOrderStatus: string;
  mode: WorkOrderCloseMode;
  policyState: QualityPolicyState;
  legacyQualityStatus?: string;
  pallets: Array<{ inspectionStatus?: string; palletDecision?: string }>;
  palletReadFailed: boolean;
  actualWorkHours: number;
  openSessions: number;
  producedQuantity: number;
  targetQuantity: number;
}

export type WorkOrderCloseDecision =
  | { ok: true; alreadyClosed?: boolean }
  | { ok: false; reason: WorkOrderCloseDenial };

const clean = (value: unknown): string => String(value ?? '').trim();

export function policyStateFromSettings(
  exists: boolean,
  value: unknown,
): QualityPolicyState {
  if (!exists) return 'missing';
  if (value === undefined) return 'off';
  if (value === true) return 'on';
  if (value === false) return 'off';
  return 'unreadable';
}

export function countOpenScanSessions(
  events: Array<{ sessionId?: string; action?: string; timestampMs?: number }>,
): number {
  const ordered = [...events].sort((left, right) => (left.timestampMs || 0) - (right.timestampMs || 0));
  const open = new Set<string>();
  for (const event of ordered) {
    const sessionId = clean(event.sessionId);
    if (!sessionId) continue;
    if (event.action === 'IN') open.add(sessionId);
    if (event.action === 'OUT') open.delete(sessionId);
  }
  return open.size;
}

const legacyRelease = (status: string | undefined): boolean =>
  status === 'approved' || status === 'not_required';

const palletsReleased = (
  pallets: WorkOrderCloseFact['pallets'],
): boolean => pallets.length > 0 && pallets.every(
  (pallet) => pallet.inspectionStatus === 'تم الفحص' && pallet.palletDecision === 'مقبول',
);

/**
 * Authority for closing a work order. A missing settings document means the
 * policy is off. An unreadable policy, a failed pallet read, or a failed
 * permission check denies the close.
 */
export function evaluateWorkOrderClose(input: WorkOrderCloseFact): WorkOrderCloseDecision {
  if (!input.actorIsSuperAdmin && clean(input.actorTenantId) !== clean(input.workOrderTenantId)) {
    return { ok: false, reason: 'tenant' };
  }
  if (!input.actorIsSuperAdmin && !input.hasClosePermission) {
    return { ok: false, reason: 'permission' };
  }
  if (input.workOrderStatus === 'completed') return { ok: true, alreadyClosed: true };
  if (input.workOrderStatus === 'cancelled') return { ok: false, reason: 'cancelled' };

  if (input.mode === 'quantity_reached') {
    if (!(input.targetQuantity > 0) || input.producedQuantity < input.targetQuantity) {
      return { ok: false, reason: 'quantity' };
    }
  } else {
    if (!Number.isFinite(input.actualWorkHours) || input.actualWorkHours <= 0) {
      return { ok: false, reason: 'hours' };
    }
    if (input.openSessions > 0) return { ok: false, reason: 'sessions' };
  }

  if (input.policyState === 'unreadable') return { ok: false, reason: 'policy-unreadable' };
  if (input.policyState === 'on') {
    if (legacyRelease(input.legacyQualityStatus)) return { ok: true };
    if (input.palletReadFailed) return { ok: false, reason: 'policy-unreadable' };
    if (!palletsReleased(input.pallets)) return { ok: false, reason: 'quality-not-released' };
  }
  return { ok: true };
}
