import type { ResolvedRepairStatus } from '../config/repairSettings';
import {
  isCancelledStatus,
  isDeliveredStatus,
  isUnrepairableStatus,
  mapLegacyRepairStatus,
} from './repairWorkflowNormalize';

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

  const fromRow = enabled.find((s) => s.id === from);
  const toRow = enabled.find((s) => s.id === to);

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
    const readyId = enabled.find((s) => s.id === 'ready')?.id;
    if (readyId && from !== readyId) {
      throw new Error('التسليم مسموح فقط من حالة «جاهز للتسليم».');
    }
    if (!readyId) {
      const nonTerminal = enabled.filter((s) => !s.isTerminal);
      const lastOpen = nonTerminal[nonTerminal.length - 1];
      if (lastOpen && from !== lastOpen.id) {
        throw new Error('التسليم مسموح فقط من آخر حالة مفتوحة قبل التسليم.');
      }
    }
    return;
  }

  const fromIndex = enabled.findIndex((s) => s.id === from);
  const toIndex = enabled.findIndex((s) => s.id === to);
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
        return id !== from;
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
  const readyIndex = enabled.findIndex((s) => s.id === 'ready');
  const statusIndex = enabled.findIndex((s) => s.id === mapped);
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
