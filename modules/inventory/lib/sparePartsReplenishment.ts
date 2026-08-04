import type {
  SparePartsReplenishmentLine,
  SparePartsReplenishmentRequest,
  SparePartsReplenishmentStatus,
} from '../types';

export const SPARE_PARTS_REPLENISHMENT_COLLECTION = 'spare_parts_replenishment_requests';
export const MAX_SPARE_PARTS_REPLENISHMENT_LINES = 40;
export const SPARE_PARTS_REPLENISHMENT_SOURCE = 'spare_parts_replenishment' as const;

export const SPARE_PARTS_REPLENISHMENT_STATUS_LABELS: Record<SparePartsReplenishmentStatus, string> = {
  submitted: 'مقدّم من المركز',
  approved: 'معتمد',
  prepared: 'مجهّز',
  responsible_approved: 'معتمد من المسؤول — بانتظار الاستلام',
  received: 'تم الاستلام',
  rejected: 'مرفوض',
  cancelled: 'ملغى',
};

const toNumber = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function roundMoney(value: number): number {
  return Math.round((toNumber(value) + Number.EPSILON) * 10000) / 10000;
}

export function materialPurchaseCostPerBaseUnit(material: {
  purchaseCost?: number;
  conversionRate?: number;
}): number {
  const cost = toNumber(material.purchaseCost);
  const rate = toNumber(material.conversionRate);
  if (rate > 0) return cost / rate;
  return cost;
}

export type SparePartsDraftLineInput = {
  itemId: string;
  quantity: number;
};

export function sparePartsLineId(itemId: string): string {
  return String(itemId || '').trim();
}

export function validateSparePartsDraftLines(lines: SparePartsDraftLineInput[]): void {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('أضف بند مكوّن واحد على الأقل.');
  }
  if (lines.length > MAX_SPARE_PARTS_REPLENISHMENT_LINES) {
    throw new Error(`الحد الأقصى لعدد البنود هو ${MAX_SPARE_PARTS_REPLENISHMENT_LINES}.`);
  }
  const seen = new Set<string>();
  for (const line of lines) {
    const itemId = String(line.itemId || '').trim();
    if (!itemId) throw new Error('حدد المكوّن لكل بند.');
    const qty = toNumber(line.quantity);
    if (!(qty > 0)) throw new Error('كمية كل بند يجب أن تكون أكبر من صفر.');
    if (seen.has(itemId)) throw new Error('لا يمكن تكرار نفس المكوّن في نفس الطلب.');
    seen.add(itemId);
  }
}

export function canApproveSparePartsRequest(
  doc: Pick<SparePartsReplenishmentRequest, 'status'>,
): boolean {
  return doc.status === 'submitted';
}

export function canPrepareSparePartsRequest(
  doc: Pick<SparePartsReplenishmentRequest, 'status'>,
): boolean {
  return doc.status === 'approved';
}

export function canResponsibleApproveSparePartsRequest(
  doc: Pick<SparePartsReplenishmentRequest, 'status'>,
): boolean {
  return doc.status === 'prepared';
}

export function canReceiveSparePartsRequest(
  doc: Pick<SparePartsReplenishmentRequest, 'status'>,
): boolean {
  return doc.status === 'responsible_approved';
}

export function canRejectSparePartsRequest(
  doc: Pick<SparePartsReplenishmentRequest, 'status'>,
): boolean {
  return doc.status === 'submitted' || doc.status === 'approved';
}

export function canCancelSparePartsRequest(
  doc: Pick<SparePartsReplenishmentRequest, 'status'>,
): boolean {
  return (
    doc.status === 'submitted'
    || doc.status === 'approved'
    || doc.status === 'prepared'
    || doc.status === 'responsible_approved'
  );
}

export function resolvePreparedQty(
  line: Pick<SparePartsReplenishmentLine, 'requestedQty' | 'preparedQty'>,
): number {
  const prepared = toNumber(line.preparedQty);
  if (prepared > 0) return prepared;
  return toNumber(line.requestedQty);
}

export function resolveReceiveQty(
  line: Pick<SparePartsReplenishmentLine, 'requestedQty' | 'preparedQty' | 'receivedQty'>,
  overrideQty?: number,
): number {
  if (overrideQty != null && Number.isFinite(overrideQty)) {
    const n = toNumber(overrideQty);
    if (!(n > 0)) throw new Error('كمية الاستلام يجب أن تكون أكبر من صفر.');
    return n;
  }
  const prepared = resolvePreparedQty(line);
  if (prepared > 0) return prepared;
  return toNumber(line.requestedQty);
}
