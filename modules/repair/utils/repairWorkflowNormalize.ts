import type { ResolvedRepairStatus } from '../config/repairSettings';

/** خريطة الحالات القديمة في الداتا — بنعرّض للموظف الاسم الجديد من غير ما نلمس المستندات القديمة فورًا */
export const LEGACY_REPAIR_STATUS_MAP: Record<string, string> = {
  inspection: 'diagnosing',
  repair: 'repairing',
};

export function mapLegacyRepairStatus(status: string | undefined | null): string {
  const s = String(status || '').trim();
  return LEGACY_REPAIR_STATUS_MAP[s] || s;
}

/**
 * الحالات اللي نعتبرها «شغل ورشة فعلي» عشان نسجّل assignedAt — waiting_approval لسه العميل ما وافقش،
 * فما نحسبهاش بداية شغل فني.
 */
export const DEFAULT_STATUSES_THAT_SET_ASSIGNED_AT = new Set([
  'diagnosing',
  'waiting_parts',
  'repairing',
  'testing',
]);

export function statusSetsAssignedAt(
  status: string,
  assignmentTriggerStatusIds?: string[] | null,
): boolean {
  const canonical = mapLegacyRepairStatus(status);
  if (Array.isArray(assignmentTriggerStatusIds) && assignmentTriggerStatusIds.length > 0) {
    return assignmentTriggerStatusIds.includes(canonical);
  }
  return DEFAULT_STATUSES_THAT_SET_ASSIGNED_AT.has(canonical);
}

export function isTerminalFromSettings(
  status: string,
  statusMap: Record<string, ResolvedRepairStatus>,
): boolean {
  const canonical = mapLegacyRepairStatus(status);
  const row = statusMap[canonical];
  return Boolean(row?.isTerminal);
}

export function isDeliveredStatus(status: string): boolean {
  return mapLegacyRepairStatus(status) === 'delivered';
}

export function isUnrepairableStatus(status: string): boolean {
  return mapLegacyRepairStatus(status) === 'unrepairable';
}

export function isCancelledStatus(status: string): boolean {
  return mapLegacyRepairStatus(status) === 'cancelled';
}
