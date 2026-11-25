import type { QualityScrapPeriod } from '../model';

export function normalizeHourlyScrapPeriods(value: unknown): QualityScrapPeriod[] {
  if (!Array.isArray(value)) throw new Error('فترات الهالك الساعي غير صالحة.');
  const periods = value.map((row) => {
    const period = row && typeof row === 'object' ? row as Partial<QualityScrapPeriod> : {};
    const quantity = Number(period.quantity);
    return {
      slotName: String(period.slotName || '').trim(),
      reasonId: String(period.reasonId || '').trim(),
      reasonLabel: String(period.reasonLabel || '').trim(),
      quantity,
    };
  }).filter((period) => period.quantity > 0);
  if (periods.length === 0) throw new Error('أدخل كمية في فترة واحدة على الأقل.');
  if (periods.some((period) => !period.slotName || !period.reasonId || !period.reasonLabel || !Number.isSafeInteger(period.quantity))) {
    throw new Error('كل فترة تحتاج اسم الفترة وسبب الهالك وكمية صحيحة.');
  }
  return periods;
}

export function hourlyScrapQuantity(periods: QualityScrapPeriod[]): number {
  return periods.reduce((sum, period) => sum + period.quantity, 0);
}
