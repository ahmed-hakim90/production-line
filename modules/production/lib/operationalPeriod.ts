/** Operational month helpers: e.g. day 26 → next month day 26 (exclusive end). */

export const DEFAULT_OPERATIONAL_MONTH_START_DAY = 26;

/** Friday is the default weekly off (matches addDaysToDate). */
export const DEFAULT_WEEKLY_OFF_DAY = 5;

export type OperationalPeriod = {
  /** Inclusive period start (YYYY-MM-DD) */
  startDate: string;
  /** Exclusive period end — start of next cycle (YYYY-MM-DD) */
  endDateExclusive: string;
  /** Inclusive last calendar day of the period (YYYY-MM-DD) */
  endDateInclusive: string;
  startDay: number;
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

export function toYmd(year: number, monthIndex0: number, day: number): string {
  return `${year}-${pad2(monthIndex0 + 1)}-${pad2(day)}`;
}

export function parseYmd(dateStr: string): { year: number; monthIndex0: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const monthIndex0 = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (!Number.isFinite(year) || monthIndex0 < 0 || monthIndex0 > 11 || day < 1 || day > 31) return null;
  return { year, monthIndex0, day };
}

export function normalizeOperationalMonthStartDay(day?: number | null): number {
  if (day == null) return DEFAULT_OPERATIONAL_MONTH_START_DAY;
  const n = Math.round(Number(day));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_OPERATIONAL_MONTH_START_DAY;
  return Math.min(28, n);
}

function addCalendarMonths(year: number, monthIndex0: number, delta: number): { year: number; monthIndex0: number } {
  const total = year * 12 + monthIndex0 + delta;
  return {
    year: Math.floor(total / 12),
    monthIndex0: ((total % 12) + 12) % 12,
  };
}

function shiftYmdByDays(dateStr: string, deltaDays: number): string {
  const parsed = parseYmd(dateStr);
  if (!parsed) return dateStr;
  const d = new Date(parsed.year, parsed.monthIndex0, parsed.day);
  d.setDate(d.getDate() + deltaDays);
  return toYmd(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Resolve the operational period that contains `anchorDate`.
 * Period is [startDay of cycle month, startDay of next cycle month) — non-overlapping.
 * Example startDay=26, anchor=2026-07-15 → 2026-06-26 .. 2026-07-26 (exclusive).
 */
export function resolveOperationalPeriod(
  anchorDate: string,
  startDayInput?: number | null,
): OperationalPeriod | null {
  const parsed = parseYmd(anchorDate);
  if (!parsed) return null;
  const startDay = normalizeOperationalMonthStartDay(startDayInput);

  const cycleMonth =
    parsed.day >= startDay
      ? { year: parsed.year, monthIndex0: parsed.monthIndex0 }
      : addCalendarMonths(parsed.year, parsed.monthIndex0, -1);
  const nextCycle = addCalendarMonths(cycleMonth.year, cycleMonth.monthIndex0, 1);

  const startDate = toYmd(cycleMonth.year, cycleMonth.monthIndex0, startDay);
  const endDateExclusive = toYmd(nextCycle.year, nextCycle.monthIndex0, startDay);
  const endDateInclusive = shiftYmdByDays(endDateExclusive, -1);

  return { startDate, endDateExclusive, endDateInclusive, startDay };
}

export function isWeeklyOffDay(dateStr: string, weeklyOffDay: number = DEFAULT_WEEKLY_OFF_DAY): boolean {
  const parsed = parseYmd(dateStr);
  if (!parsed) return false;
  const d = new Date(parsed.year, parsed.monthIndex0, parsed.day);
  return d.getDay() === weeklyOffDay;
}

/**
 * Count working days in [startInclusive, endExclusive).
 * Skips weekly off days (default Friday).
 */
export function countWorkingDaysInRange(
  startInclusive: string,
  endExclusive: string,
  weeklyOffDay: number = DEFAULT_WEEKLY_OFF_DAY,
): number {
  const start = parseYmd(startInclusive);
  const end = parseYmd(endExclusive);
  if (!start || !end) return 0;

  const cursor = new Date(start.year, start.monthIndex0, start.day);
  const endMs = new Date(end.year, end.monthIndex0, end.day).getTime();
  if (cursor.getTime() >= endMs) return 0;

  let count = 0;
  while (cursor.getTime() < endMs) {
    if (cursor.getDay() !== weeklyOffDay) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function countOperationalPeriodWorkingDays(
  anchorDate: string,
  startDayInput?: number | null,
  weeklyOffDay: number = DEFAULT_WEEKLY_OFF_DAY,
): number {
  const period = resolveOperationalPeriod(anchorDate, startDayInput);
  if (!period) return 0;
  return countWorkingDaysInRange(period.startDate, period.endDateExclusive, weeklyOffDay);
}

/**
 * Daily target = planned quantity ÷ working days in the operational period.
 * Returns 0 when quantity or working days are invalid.
 */
export function calculateOperationalPeriodDailyTarget(params: {
  plannedQuantity: number;
  anchorDate: string;
  startDay?: number | null;
  weeklyOffDay?: number;
}): { dailyTarget: number; workingDays: number; period: OperationalPeriod | null } {
  const plannedQuantity = Math.max(0, Number(params.plannedQuantity) || 0);
  const period = resolveOperationalPeriod(params.anchorDate, params.startDay);
  if (!period || plannedQuantity <= 0) {
    return { dailyTarget: 0, workingDays: 0, period };
  }
  const workingDays = countWorkingDaysInRange(
    period.startDate,
    period.endDateExclusive,
    params.weeklyOffDay ?? DEFAULT_WEEKLY_OFF_DAY,
  );
  if (workingDays <= 0) {
    return { dailyTarget: 0, workingDays: 0, period };
  }
  return {
    dailyTarget: Math.ceil(plannedQuantity / workingDays),
    workingDays,
    period,
  };
}
