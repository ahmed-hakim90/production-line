import { toEnglishDigits } from '@/lib/englishDigits';

/** أرقام فقط للمقارنة — بدون تنسيق (يقبل أرقام عربية/فارسية ويحوّلها أولاً) */
export function normalizeCustomerPhoneDigits(raw: string): string {
  return toEnglishDigits(String(raw || '')).replace(/\D/g, '');
}

/**
 * رقم واتساب دولي (بدون +) — مصر افتراضياً:
 * 01xxxxxxxxx → 201xxxxxxxxx ، ويبقي 20… كما هو.
 */
export function normalizeWhatsAppPhone(raw?: string, defaultCountryCode = '20'): string {
  let digits = normalizeCustomerPhoneDigits(raw || '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith(defaultCountryCode)) return digits;
  if (digits.startsWith('0') && digits.length >= 10) {
    return `${defaultCountryCode}${digits.slice(1)}`;
  }
  if (digits.length === 10 || digits.length === 9) {
    return `${defaultCountryCode}${digits}`;
  }
  return digits;
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
