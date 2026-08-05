/**
 * Pure helpers for repair treasury monthly close.
 * Keep business guards testable without Firestore.
 */

export type RepairTreasuryMonthCloseStatus = 'closed' | 'open';

export function normalizeTreasuryMonth(month: string): string {
  const raw = String(month || '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const iso = new Date().toISOString().slice(0, 7);
  return iso;
}

export function monthKeyFromIso(isoLike: string): string {
  const s = String(isoLike || '').trim();
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  return normalizeTreasuryMonth('');
}

export function buildRepairTreasuryMonthCloseDocId(
  tenantId: string,
  branchId: string,
  month: string,
): string {
  const t = String(tenantId || '').trim();
  const b = String(branchId || '').trim();
  const m = normalizeTreasuryMonth(month);
  if (!t || !b) {
    throw new Error('معرّف المستأجر والفرع مطلوبان لإقفال الشهر.');
  }
  return `${t}_${b}_${m}`;
}

export function isRepairTreasuryMonthClosedStatus(
  status: RepairTreasuryMonthCloseStatus | string | null | undefined,
): boolean {
  return String(status || '').trim() === 'closed';
}

export function assertCanCloseRepairTreasuryMonth(input: {
  alreadyClosed: boolean;
  openSessionsCount: number;
}): void {
  if (input.alreadyClosed) {
    throw new Error('هذا الشهر مقفول بالفعل لهذا الفرع.');
  }
  if (Number(input.openSessionsCount || 0) > 0) {
    throw new Error('لا يمكن إقفال الشهر مع وجود جلسات خزينة مفتوحة. أقفل الجلسات اليومية أولًا.');
  }
}

export function assertCanReopenRepairTreasuryMonth(input: {
  currentlyClosed: boolean;
  reopenReason: string;
}): void {
  if (!input.currentlyClosed) {
    throw new Error('الشهر غير مقفول.');
  }
  if (!String(input.reopenReason || '').trim()) {
    throw new Error('سبب إعادة فتح الشهر إلزامي.');
  }
}

export function assertMonthWritableOrThrow(input: {
  monthClosed: boolean;
  month: string;
}): void {
  if (input.monthClosed) {
    throw new Error(`شهر ${input.month} مقفول لخزينة هذا الفرع. أعد فتح الشهر قبل تسجيل حركات.`);
  }
}
