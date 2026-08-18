import type {
  SparePartsReplenishmentDemandLink,
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
  prepared: 'جاهز (مجهّز)',
  responsible_approved: 'خرج — بانتظار استلام المركز',
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

/**
 * Effective prepared qty for a line.
 * Explicit `preparedQty` (including 0 = excluded) wins; otherwise fall back to requested.
 */
export function resolvePreparedQty(
  line: Pick<SparePartsReplenishmentLine, 'requestedQty' | 'preparedQty'>,
): number {
  if (line.preparedQty != null) {
    const prepared = toNumber(line.preparedQty);
    return prepared < 0 ? 0 : prepared;
  }
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
  return resolvePreparedQty(line);
}

export type SparePartsPrepareLineInput = {
  lineId: string;
  preparedQty: number;
};

/** Client-side guard before calling prepare — CF is authoritative. */
export function validateSparePartsPrepareLines(lines: SparePartsPrepareLineInput[]): void {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('لا توجد بنود للتجهيز.');
  }
  for (const line of lines) {
    const qty = toNumber(line.preparedQty);
    if (qty < 0) throw new Error('كمية التجهيز لا يمكن أن تكون سالبة.');
  }
  if (!lines.some((line) => toNumber(line.preparedQty) > 0)) {
    throw new Error('يجب تجهيز بند واحد على الأقل بكمية أكبر من صفر.');
  }
}

/** Open basket may accept more job demands only while still submitted. */
export function canMergeIntoOpenBasket(
  doc: Pick<SparePartsReplenishmentRequest, 'status' | 'openBasket'>,
): boolean {
  return doc.status === 'submitted' && doc.openBasket !== false;
}

export type MergeDemandInput = {
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  quantity: number;
  unitCostSnapshot: number;
  jobId: string;
  usageId: string;
  availabilityAtRequest: 'central' | 'none';
};

/**
 * Merge a job demand into open-basket lines (same material → sum qty + append links).
 * Throws if resulting line count would exceed the max.
 */
export function mergeDemandIntoBasketLines(
  existingLines: SparePartsReplenishmentLine[],
  demand: MergeDemandInput,
): SparePartsReplenishmentLine[] {
  const itemId = String(demand.itemId || '').trim();
  const jobId = String(demand.jobId || '').trim();
  const usageId = String(demand.usageId || '').trim();
  const qty = toNumber(demand.quantity);
  if (!itemId || !jobId || !usageId || !(qty > 0)) {
    throw new Error('بيانات الطلب غير صالحة للدمج.');
  }

  const link: SparePartsReplenishmentDemandLink = { jobId, usageId, quantity: qty };
  const lines = existingLines.map((line) => ({ ...line }));
  const idx = lines.findIndex((line) => String(line.itemId || '').trim() === itemId);

  if (idx >= 0) {
    const line = lines[idx];
    const nextQty = toNumber(line.requestedQty) + qty;
    const sourceJobIds = Array.from(
      new Set([...(line.sourceJobIds || []), jobId].map((id) => String(id || '').trim()).filter(Boolean)),
    );
    const demandLinks = [...(line.demandLinks || []), link];
    const availabilityAtRequest =
      line.availabilityAtRequest === 'none' || demand.availabilityAtRequest === 'none'
        ? 'none'
        : 'central';
    lines[idx] = {
      ...line,
      requestedQty: nextQty,
      totalCostSnapshot: roundMoney(toNumber(line.unitCostSnapshot) * nextQty),
      sourceJobIds,
      demandLinks,
      availabilityAtRequest,
    };
    return lines;
  }

  if (lines.length >= MAX_SPARE_PARTS_REPLENISHMENT_LINES) {
    throw new Error(`الحد الأقصى لعدد البنود هو ${MAX_SPARE_PARTS_REPLENISHMENT_LINES}.`);
  }

  lines.push({
    lineId: sparePartsLineId(itemId),
    itemType: 'material',
    itemId,
    itemName: String(demand.itemName || itemId),
    itemCode: String(demand.itemCode || ''),
    unit: String(demand.unit || 'قطعة'),
    requestedQty: qty,
    unitCostSnapshot: toNumber(demand.unitCostSnapshot),
    totalCostSnapshot: roundMoney(toNumber(demand.unitCostSnapshot) * qty),
    sourceJobIds: [jobId],
    demandLinks: [link],
    availabilityAtRequest: demand.availabilityAtRequest,
  });
  return lines;
}

export function isStockoutDemandLine(
  line: Pick<SparePartsReplenishmentLine, 'availabilityAtRequest'>,
): boolean {
  return line.availabilityAtRequest === 'none';
}

export function isPendingReplenishmentStatus(status: SparePartsReplenishmentStatus): boolean {
  return (
    status === 'submitted'
    || status === 'approved'
    || status === 'prepared'
    || status === 'responsible_approved'
  );
}

const GENERIC_CALLABLE_LABEL =
  /^(internal|unknown|ok|cancelled|not-found|not found|unauthenticated|permission-denied|permission denied|failed-precondition|resource-exhausted|unavailable|deadline-exceeded|invalid-argument|already-exists|aborted|out-of-range|unimplemented|data-loss)$/i;

/** Recover Arabic business copy; hide Firebase INTERNAL/code labels. */
export function mapSparePartsCallableError(error: unknown, fallback: string): Error {
  const code = String((error as { code?: string })?.code || '').toLowerCase();
  const message = String((error as { message?: string })?.message || '').trim();
  const arabic = message.match(/[\u0600-\u06FF][^]*[\u0600-\u06FF0-9).]/);
  const business = arabic ? arabic[0].trim() : '';

  if (code.includes('unauthenticated') || message.toLowerCase() === 'unauthenticated') {
    return new Error('يجب تسجيل الدخول أولًا ثم إعادة المحاولة.');
  }
  if (
    code.includes('permission-denied')
    || message.toLowerCase().includes('missing or insufficient permissions')
  ) {
    return new Error(
      'ليس لديك صلاحية قراءة/تنفيذ تموين قطع الغيار. تأكد من صلاحية العرض في الدور، أو أن قواعد Firestore محدّثة.',
    );
  }
  if (business && business.length < 180) {
    return new Error(business);
  }
  if (code.includes('failed-precondition')) {
    return new Error(message && !GENERIC_CALLABLE_LABEL.test(message)
      ? message
      : 'لا يمكن تنفيذ العملية في الحالة الحالية.');
  }
  if (code.includes('invalid-argument')) {
    return new Error(message && !GENERIC_CALLABLE_LABEL.test(message) ? message : 'بيانات غير صالحة.');
  }
  if (code.includes('not-found')) {
    return new Error(message && !GENERIC_CALLABLE_LABEL.test(message) ? message : 'الطلب غير موجود.');
  }
  if (
    GENERIC_CALLABLE_LABEL.test(message)
    || code.includes('internal')
    || code.includes('unavailable')
    || message.toLowerCase().includes('failed to fetch')
  ) {
    return new Error(fallback);
  }
  if (message) return new Error(message);
  return new Error(fallback);
}

