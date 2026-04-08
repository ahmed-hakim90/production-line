/** Local calendar day bounds in ms for a YYYY-MM-DD string. */
export function parseYmdToLocalBounds(ymd: string): { startMs: number; endMs: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  const start = new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  const end = new Date(y!, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

export function todayYmd(): string {
  const n = new Date();
  const y = n.getFullYear();
  const mo = String(n.getMonth() + 1).padStart(2, '0');
  const da = String(n.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}
