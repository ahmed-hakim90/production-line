/**
 * Pure helpers for repair-job spare part availability and fulfillment labels.
 * Server recomputes availability; client uses the same rules for badges only.
 */

import type {
  RepairPartAvailabilityAtRequest,
  RepairPartFulfillmentStatus,
  RepairPartUsage,
} from '../types';

export const REPAIR_PART_FULFILLMENT_LABELS: Record<RepairPartFulfillmentStatus, string> = {
  pending_supply: 'بانتظار التوريد',
  ready_to_issue: 'جاهز للصرف',
  issued: 'تم الصرف',
  cancelled: 'ملغى',
};

export const REPAIR_PART_AVAILABILITY_LABELS: Record<RepairPartAvailabilityAtRequest, string> = {
  center: 'متاح في مخزن المركز',
  central: 'متاح في المركزي',
  none: 'غير متاح',
};

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Compact availability text for spare-part pickers (qty included when stock exists). */
export function formatPartAvailabilityPickerHint(
  availability: RepairPartAvailabilityAtRequest,
  centerQty: number,
  centralQty: number,
): string {
  if (availability === 'center') {
    return `مخزن المركز · ${toNumber(centerQty)}`;
  }
  if (availability === 'central') {
    return `المركزي · ${toNumber(centralQty)}`;
  }
  return 'غير متاح';
}

/**
 * Resolve where the needed qty can be fulfilled.
 * Center stock wins when it covers the full quantity; otherwise central if any; else none.
 */
export function resolvePartAvailabilityAtRequest(
  centerQty: number,
  centralQty: number,
  neededQty: number,
): RepairPartAvailabilityAtRequest {
  const need = toNumber(neededQty);
  if (!(need > 0)) return 'none';
  if (toNumber(centerQty) >= need) return 'center';
  if (toNumber(centralQty) > 0) return 'central';
  return 'none';
}

/** Badge bucket for picker UI (does not require needed qty). */
export function resolvePartAvailabilityBadge(
  centerQty: number,
  centralQty: number,
): RepairPartAvailabilityAtRequest {
  if (toNumber(centerQty) > 0) return 'center';
  if (toNumber(centralQty) > 0) return 'central';
  return 'none';
}

export function effectiveFulfillmentStatus(
  usage: Pick<RepairPartUsage, 'fulfillmentStatus' | 'issueId'>,
): RepairPartFulfillmentStatus {
  if (usage.fulfillmentStatus) return usage.fulfillmentStatus;
  if (usage.issueId) return 'issued';
  return 'issued';
}

export function isPendingSupplyUsage(usage: Pick<RepairPartUsage, 'fulfillmentStatus'>): boolean {
  return usage.fulfillmentStatus === 'pending_supply';
}

export function isReadyToIssueUsage(usage: Pick<RepairPartUsage, 'fulfillmentStatus'>): boolean {
  return usage.fulfillmentStatus === 'ready_to_issue';
}

export function newRepairPartUsageId(): string {
  return `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function replenishmentDurationMs(createdAt?: string, receivedAt?: string): number | null {
  const start = Date.parse(String(createdAt || ''));
  const end = Date.parse(String(receivedAt || ''));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start;
}

export function formatDurationArabic(ms: number | null): string {
  if (ms == null || !(ms >= 0)) return '—';
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes} دقيقة`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 48) {
    return minutes > 0 ? `${hours} ساعة و ${minutes} دقيقة` : `${hours} ساعة`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days} يوم و ${remHours} ساعة` : `${days} يوم`;
}
