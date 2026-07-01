import { getTodayDateString } from '@/utils/calculations';

/** Payroll-style production period starts on this day of the month. */
export const PRODUCTION_PERIOD_START_DAY = 26;

export function getProductionPeriodStartForDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  if (day >= PRODUCTION_PERIOD_START_DAY) {
    return `${year}-${String(month).padStart(2, '0')}-${String(PRODUCTION_PERIOD_START_DAY).padStart(2, '0')}`;
  }
  let prevMonth = month - 1;
  let prevYear = year;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(PRODUCTION_PERIOD_START_DAY).padStart(2, '0')}`;
}

export function getDefaultProductionWorkersPeriod(referenceDate?: string): { start: string; end: string } {
  const end = referenceDate || getTodayDateString();
  return {
    start: getProductionPeriodStartForDate(end),
    end,
  };
}
