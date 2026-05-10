/** أرقام فقط للمقارنة — بدون تنسيق */
export function normalizeCustomerPhoneDigits(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

/**
 * مطابقة مرنة: تطابق كامل، أو لاحقة (لأرقام محلية vs دولية) عندما يكون الطلب 7 أرقام فأكثر.
 */
export function customerPhonesMatch(storedPhone: string, queryPhone: string): boolean {
  const a = normalizeCustomerPhoneDigits(storedPhone);
  const b = normalizeCustomerPhoneDigits(queryPhone);
  if (!b || !a) return false;
  if (a === b) return true;
  if (b.length >= 7 && a.endsWith(b)) return true;
  if (a.length >= 7 && b.endsWith(a)) return true;
  return false;
}
