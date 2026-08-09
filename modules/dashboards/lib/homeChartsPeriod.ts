export type HomeChartsPeriodPreset = 'today' | 'week' | 'month' | '3months' | 'custom';

export type HomeChartsPeriod = {
  start: string;
  end: string;
};

export const HOME_CHARTS_PERIOD_LABELS: Record<HomeChartsPeriodPreset, string> = {
  today: 'اليوم',
  week: 'هذا الأسبوع',
  month: 'هذا الشهر',
  '3months': 'آخر 3 أشهر',
  custom: 'مخصص',
};

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getHomeChartsPresetRange(preset: HomeChartsPeriodPreset): HomeChartsPeriod {
  const now = new Date();
  const end = formatDateISO(now);

  switch (preset) {
    case 'today':
      return { start: end, end };
    case 'week': {
      const s = new Date(now);
      s.setDate(s.getDate() - 6);
      return { start: formatDateISO(s), end };
    }
    case 'month': {
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      return { start: `${y}-${m}-01`, end };
    }
    case '3months': {
      const s = new Date(now);
      s.setMonth(s.getMonth() - 3);
      return { start: formatDateISO(s), end };
    }
    default:
      return { start: end, end };
  }
}

export function inclusiveDayCount(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00`);
  const b = Date.parse(`${end}T00:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  return Math.floor((b - a) / 86_400_000) + 1;
}

export function monthsOverlappingPeriod(start: string, end: string): string[] {
  const months: string[] = [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  if (!sy || !sm || !ey || !em) return [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

export function formatLoadedAt(ts: number | null): string {
  if (!ts) return '—';
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleTimeString();
  }
}
