import type { QualityStatus } from '@/types';

export interface ReleasePallet {
  workOrderId?: string;
  inspectionStatus: string;
  palletDecision: string;
}

/**
 * Close is allowed when a legacy quality approval already exists,
 * or every pallet linked to the work order is finished and accepted.
 * No linked pallet means the new module has not released the order.
 */
export function workOrderMayCloseFromQuality(input: {
  legacyStatus?: QualityStatus;
  linkedPallets: ReleasePallet[];
}): boolean {
  if (input.legacyStatus === 'approved' || input.legacyStatus === 'not_required') return true;
  if (input.linkedPallets.length === 0) return false;
  return input.linkedPallets.every(
    (pallet) => pallet.inspectionStatus === 'تم الفحص' && pallet.palletDecision === 'مقبول',
  );
}
