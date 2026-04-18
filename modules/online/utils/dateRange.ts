/** Local calendar day bounds in ms for a YYYY-MM-DD string. */
export function parseYmdToLocalBounds(ymd: string): { startMs: number; endMs: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  const start = new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const end = new Date(y!, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

/** Inclusive local range from first day 00:00:00 to last day 23:59:59. Swaps if fromYmd is after toYmd. */
export function parseYmdRangeToLocalBounds(fromYmd: string, toYmd: string): { startMs: number; endMs: number } {
  const a = parseYmdToLocalBounds(fromYmd);
  const b = parseYmdToLocalBounds(toYmd);
  if (a.startMs <= b.startMs) {
    return { startMs: a.startMs, endMs: b.endMs };
  }
  return { startMs: b.startMs, endMs: a.endMs };
}

/**
 * «يوم التشغيل» المحلي: يبدأ عند الساعة `boundaryHour` (افتراضي ٨) وينتهي قبل نفس الساعة من اليوم التالي.
 * نطاق متعدد الأيام: من أول يوم 08:00 حتى (آخر يوم + ١ يوم) 08:00 غير شامل — مطابق لـ `WAREHOUSE_DISPATCH_DAY_START_HOUR`.
 */
export function parseYmdRangeToDispatchDayLocalBounds(
  fromYmd: string,
  toYmd: string,
  boundaryHour: number = 8,
): { startMs: number; endMs: number } {
  const parseDayStart = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y!, (m ?? 1) - 1, d ?? 1, boundaryHour, 0, 0, 0);
  };
  let start = parseDayStart(fromYmd);
  let endDayStart = parseDayStart(toYmd);
  if (start.getTime() > endDayStart.getTime()) {
    const t = start;
    start = endDayStart;
    endDayStart = t;
  }
  const startMs = start.getTime();
  const endExclusive = new Date(endDayStart);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const endMs = endExclusive.getTime() - 1;
  return { startMs, endMs };
}

export function todayYmd(): string {
  const n = new Date();
  const y = n.getFullYear();
  const mo = String(n.getMonth() + 1).padStart(2, '0');
  const da = String(n.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}
