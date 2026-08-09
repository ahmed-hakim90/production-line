import type { ResolvedRepairStatus } from '../config/repairSettings';
import {
  LEGACY_REPAIR_STATUS_MAP,
  mapLegacyRepairStatus,
} from './repairStatusIds';

export { LEGACY_REPAIR_STATUS_MAP, mapLegacyRepairStatus };
export { isSameRepairStatus } from './repairStatusIds';

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
    return assignmentTriggerStatusIds.some((id) => mapLegacyRepairStatus(id) === canonical);
  }
  return DEFAULT_STATUSES_THAT_SET_ASSIGNED_AT.has(canonical);
}

/**
 * Firestore rejects `undefined` / `NaN`. Only include resolutionMinutes when assignedAt parses.
 */
export function buildRepairResolutionFields(
  assignedAt: string | undefined | null,
  at: string,
): { resolutionMinutes: number } | Record<string, never> {
  const assignedAtMs = Date.parse(String(assignedAt || ''));
  const atMs = Date.parse(String(at || ''));
  if (!Number.isFinite(assignedAtMs) || !Number.isFinite(atMs)) return {};
  return { resolutionMinutes: Math.max(0, Math.round((atMs - assignedAtMs) / 60000)) };
}

export function isTerminalFromSettings(
  status: string,
  statusMap: Record<string, ResolvedRepairStatus>,
): boolean {
  const canonical = mapLegacyRepairStatus(status);
  const row = statusMap[canonical] || statusMap[status] || Object.values(statusMap).find(
    (item) => mapLegacyRepairStatus(item.id) === canonical,
  );
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
