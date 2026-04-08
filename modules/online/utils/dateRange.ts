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

export function todayYmd(): string {
  const n = new Date();
  const y = n.getFullYear();
  const mo = String(n.getMonth() + 1).padStart(2, '0');
  const da = String(n.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}
