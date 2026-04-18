/**
 * عرض حالة بوسطة في الجدول: تصنيف للّون + تسمية عربية للحالات الإنجليزية الشائعة.
 */

export type BostaStateCategory = 'delivered' | 'in_transit' | 'exception' | 'cancelled' | 'unknown';

const DELIVERED_RE = /delivered|delivery confirmed|picked up|returned to business/i;
const CANCELLED_RE = /cancel|canceled|terminated|lost|damaged/i;
const EXCEPTION_RE = /exception|investigation|problem|failed/i;
const TRANSIT_RE = /transit|route|pickup|warehouse|delivering|arrived|waiting|assigned|requested/i;

export function categorizeBostaStateLabel(stateLabel: string | null | undefined): BostaStateCategory {
  const s = String(stateLabel || '').trim();
  if (!s) return 'unknown';
  if (DELIVERED_RE.test(s)) return 'delivered';
  if (CANCELLED_RE.test(s)) return 'cancelled';
  if (EXCEPTION_RE.test(s)) return 'exception';
  if (TRANSIT_RE.test(s)) return 'in_transit';
  return 'unknown';
}

/** تسمية عربية قصيرة إن وُجدت مطابقة؛ وإلا النص الأصلي. */
export function arabicLabelForBostaState(stateLabel: string | null | undefined): string {
  const raw = String(stateLabel || '').trim();
  if (!raw) return '—';
  const lower = raw.toLowerCase();
  const map: Array<{ re: RegExp; ar: string }> = [
    { re: /^delivered$/i, ar: 'تم التسليم' },
    { re: /delivery confirmed/i, ar: 'تأكيد التسليم' },
    { re: /picked up/i, ar: 'تم الاستلام' },
    { re: /delivering/i, ar: 'جاري التوصيل' },
    { re: /arrived at customer/i, ar: 'وصل للعميل' },
    { re: /waiting for route/i, ar: 'في انتظار المسار' },
    { re: /route assigned/i, ar: 'تم تعيين المسار' },
    { re: /pickup requested/i, ar: 'طلب استلام' },
    { re: /received at warehouse/i, ar: 'وصل للمخزن' },
    { re: /in transit between hubs/i, ar: 'قيد النقل بين المراكز' },
    { re: /canceled|cancelled/i, ar: 'ملغاة' },
    { re: /exception/i, ar: 'استثناء' },
    { re: /returned to business/i, ar: 'عاد للتاجر' },
    { re: /terminated/i, ar: 'منتهية' },
  ];
  for (const { re, ar } of map) {
    if (re.test(lower)) return ar;
  }
  return raw;
}

export function bostaCategoryBadgeClass(category: BostaStateCategory): string {
  switch (category) {
    case 'delivered':
      return 'border-emerald-500/40 bg-emerald-500/15 text-emerald-900 dark:text-emerald-100';
    case 'in_transit':
      return 'border-sky-500/40 bg-sky-500/15 text-sky-900 dark:text-sky-100';
    case 'exception':
      return 'border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-100';
    case 'cancelled':
      return 'border-rose-500/40 bg-rose-500/15 text-rose-900 dark:text-rose-100';
    default:
      return 'border-border bg-muted/60 text-foreground';
  }
}
