import type { SparePartsRecallRequest, SparePartsRecallStatus } from '../types';

export const SPARE_PARTS_RECALL_COLLECTION = 'spare_parts_recall_requests';
export const MAX_SPARE_PARTS_RECALL_LINES = 40;

export const SPARE_PARTS_RECALL_STATUS_LABELS: Record<SparePartsRecallStatus, string> = {
  submitted: 'بانتظار تأكيد المركز',
  confirmed: 'تم السحب للرئيسي',
  cancelled: 'ملغى',
};

export function canConfirmSparePartsRecall(
  doc: Pick<SparePartsRecallRequest, 'status'>,
): boolean {
  return doc.status === 'submitted';
}

export function canCancelSparePartsRecall(
  doc: Pick<SparePartsRecallRequest, 'status'>,
): boolean {
  return doc.status === 'submitted';
}
