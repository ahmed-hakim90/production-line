import type { ResolvedRepairStatus } from '../config/repairSettings';
import {
  isCancelledStatus,
  isDeliveredStatus,
  isUnrepairableStatus,
  mapLegacyRepairStatus,
} from './repairWorkflowNormalize';

/** Match configured row by raw id or legacy alias (inspection↔diagnosing, repair↔repairing). */
function findEnabledStatusIndex(
  enabled: ResolvedRepairStatus[],
  statusId: string,
): number {
  const canonical = mapLegacyRepairStatus(statusId);
  const exact = enabled.findIndex((s) => s.id === statusId);
  if (exact >= 0) return exact;
  return enabled.findIndex((s) => mapLegacyRepairStatus(s.id) === canonical);
}

function findEnabledStatus(
  enabled: ResolvedRepairStatus[],
  statusId: string,
): ResolvedRepairStatus | undefined {
  const index = findEnabledStatusIndex(enabled, statusId);
  return index >= 0 ? enabled[index] : undefined;
}

/**
 * Allowed status transitions:
 * - forward to next enabled non-terminal status by order
 * - skip forward one step is allowed (operator may advance)
 * - always allow jump to cancelled / unrepairable from non-terminal
 * - delivered only from ready (or last open status before delivered)
 * - no transitions out of terminal statuses
 */
export function assertRepairStatusTransition(input: {
  fromStatus: string;
  toStatus: string;
  statuses: ResolvedRepairStatus[];
}): void {
  const from = mapLegacyRepairStatus(input.fromStatus);
  const to = mapLegacyRepairStatus(input.toStatus);
  if (from === to) return;

  const enabled = (input.statuses || [])
    .filter((s) => s.isEnabled !== false)
    .slice()
    .sort((a, b) => a.order - b.order);

  const fromIndex = findEnabledStatusIndex(enabled, input.fromStatus);
  const toIndex = findEnabledStatusIndex(enabled, input.toStatus);
  const fromRow = fromIndex >= 0 ? enabled[fromIndex] : undefined;
  const toRow = toIndex >= 0 ? enabled[toIndex] : undefined;

  if (!toRow) {
    throw new Error('الحالة المطلوبة غير معرّفة أو غير مفعّلة.');
  }

  if (fromRow?.isTerminal || isDeliveredStatus(from) || isCancelledStatus(from) || isUnrepairableStatus(from)) {
    throw new Error('لا يمكن تغيير حالة طلب مغلق أو منتهٍ.');
  }

  if (isCancelledStatus(to) || isUnrepairableStatus(to)) {
    return;
  }

  if (isDeliveredStatus(to)) {
    const readyRow = findEnabledStatus(enabled, 'ready');
    const readyCanonical = readyRow ? mapLegacyRepairStatus(readyRow.id) : '';
    if (readyRow && from !== readyCanonical && mapLegacyRepairStatus(fromRow?.id || from) !== readyCanonical) {
      throw new Error('التسليم مسموح فقط من حالة «جاهز للتسليم».');
    }
    if (!readyRow) {
      const nonTerminal = enabled.filter((s) => !s.isTerminal);
      const lastOpen = nonTerminal[nonTerminal.length - 1];
      if (lastOpen && fromIndex !== enabled.findIndex((s) => s.id === lastOpen.id)) {
        throw new Error('التسليم مسموح فقط من آخر حالة مفتوحة قبل التسليم.');
      }
    }
    return;
  }

  if (fromIndex < 0) {
    // Legacy/unknown source: allow move into any enabled non-terminal
    if (toRow.isTerminal) {
      throw new Error('انتقال الحالة غير مسموح.');
    }
    return;
  }

  // Allow same or next few forward steps among non-terminal (max +2) or any earlier open for correction (-1)
  const delta = toIndex - fromIndex;
  if (delta >= 1 && delta <= 2 && !toRow.isTerminal) return;
  if (delta === -1 && !toRow.isTerminal) return;

  throw new Error(
    `انتقال الحالة غير مسموح من «${fromRow?.label || from}» إلى «${toRow.label || to}».`,
  );
}

export function listAllowedRepairStatusTargets(input: {
  fromStatus: string;
  statuses: ResolvedRepairStatus[];
}): string[] {
  const from = mapLegacyRepairStatus(input.fromStatus);
  const enabled = (input.statuses || [])
    .filter((s) => s.isEnabled !== false)
    .slice()
    .sort((a, b) => a.order - b.order);
  return enabled
    .map((s) => s.id)
    .filter((id) => {
      try {
        assertRepairStatusTransition({ fromStatus: from, toStatus: id, statuses: input.statuses });
        return mapLegacyRepairStatus(id) !== from;
      } catch {
        return false;
      }
    });
}

/**
 * Workshop (technician) may advance only through open statuses up to «جاهز للتسليم»,
 * plus unrepairable. Customer approval, cancellation and delivery belong to reception.
 */
export function isWorkshopStatusWithinReadyCap(
  statusId: string,
  statuses: ResolvedRepairStatus[],
): boolean {
  const mapped = mapLegacyRepairStatus(statusId);
  if (isDeliveredStatus(mapped)) return false;
  if (isCancelledStatus(mapped) || mapped === 'waiting_approval') return false;
  if (isUnrepairableStatus(mapped)) return true;

  const enabled = (statuses || [])
    .filter((s) => s.isEnabled !== false)
    .slice()
    .sort((a, b) => a.order - b.order);
  const readyIndex = findEnabledStatusIndex(enabled, 'ready');
  const statusIndex = findEnabledStatusIndex(enabled, statusId);
  if (statusIndex < 0) return false;
  if (readyIndex < 0) return !Boolean(enabled[statusIndex]?.isTerminal);
  return statusIndex <= readyIndex;
}

export function listAllowedWorkshopStatusTargets(input: {
  fromStatus: string;
  statuses: ResolvedRepairStatus[];
}): string[] {
  return listAllowedRepairStatusTargets(input).filter((id) =>
    isWorkshopStatusWithinReadyCap(id, input.statuses),
  );
}
