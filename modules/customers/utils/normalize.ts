/**
 * عرض كود العميل في الواجهة: بدون فواصل آلاف (1,636 → 1636) وبدون تنسيق عملة.
 * يدعم قيم Firestore كنص أو رقم صحيح.
 */
export function displayCustomerCode(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return String(value)
    .trim()
    .replace(/[,،٬']/g, '')
    .replace(/[\u00A0\u202F\u2009]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** تطبيع كود العميل للبحث والمطابقة (بدون مسافات داخلية). */
export function normalizeCustomerCode(raw: string): string {
  return displayCustomerCode(raw).replace(/\s+/g, '');
}

/** Normalize bank account number: digits only. */
export function normalizeBankAccountNumber(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

/**
 * عرض رقم الحساب في الواجهة كنص ثابت (بدون .00) حتى لو وُجد في Firestore/Excel كرقم عشري.
 */
export function displayBankAccountNumber(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  let s = String(value).trim().replace(/,/g, '').replace(/\s/g, '');
  if (!s) return '';
  const wholeWithTrailingZeros = s.match(/^(\d+)\.(0+)$/);
  if (wholeWithTrailingZeros) return wholeWithTrailingZeros[1];
  return s;
}
