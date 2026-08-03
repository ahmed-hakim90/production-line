/** Calendar helpers for the factory general monthly report preview. */

const toDateInputValue = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const getMonthInputValueFromDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

/** First/last day in range for a calendar month (YYYY-MM); null if invalid or month is entirely in the future. */
export const getDateRangeForCalendarMonth = (ym: string): { startStr: string; endStr: string } | null => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym || '').trim());
  if (!m) return null;
  const year = Number(m[1]);
  const monthNum = Number(m[2]);
  if (monthNum < 1 || monthNum > 12) return null;
  const monthIndex = monthNum - 1;
  const start = new Date(year, monthIndex, 1);
  const startStr = toDateInputValue(start);
  const todayStr = toDateInputValue(new Date());
  if (startStr > todayStr) return null;
  const lastDayOfMonth = new Date(year, monthIndex + 1, 0);
  const lastStr = toDateInputValue(lastDayOfMonth);
  const endStr = lastStr < todayStr ? lastStr : todayStr;
  return { startStr, endStr };
};
