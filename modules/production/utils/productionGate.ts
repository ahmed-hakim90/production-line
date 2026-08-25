import type { ProductionGateSession } from '../services/productionGateService';

export const gateDate = (date = new Date()): string => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);

export const gateTimestampDate = (value: any): Date | null => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const gateTime = (value: any): string => {
  const date = gateTimestampDate(value);
  return date ? new Intl.DateTimeFormat('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' }).format(date) : '—';
};

export const liveDuration = (row: ProductionGateSession, now = Date.now()): number => {
  if (row.status !== 'open') return Number(row.durationMinutes || 0);
  const exit = gateTimestampDate(row.exitAt);
  return exit ? Math.max(0, Math.floor((now - exit.getTime()) / 60_000)) : 0;
};

export const formatDuration = (minutes: number): string => {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return hours ? `${hours} س ${rest} د` : `${rest} دقيقة`;
};

export const sortGateRows = (rows: ProductionGateSession[]): ProductionGateSession[] => [...rows].sort((a, b) => {
  if (a.status === 'open' && b.status !== 'open') return -1;
  if (b.status === 'open' && a.status !== 'open') return 1;
  const aTime = gateTimestampDate(a.exitAt)?.getTime() || 0;
  const bTime = gateTimestampDate(b.exitAt)?.getTime() || 0;
  return a.status === 'open' ? aTime - bTime : bTime - aTime;
});
