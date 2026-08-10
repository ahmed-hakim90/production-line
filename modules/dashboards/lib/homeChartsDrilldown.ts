import type { HomeChartsPeriod } from './homeChartsPeriod';

type DrillCtx = HomeChartsPeriod & {
  /** Optional bar/category name from the chart */
  barName?: string;
};

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') q.set(key, value);
  });
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * Maps a home-board chart bar to a destination route + filters.
 * Destinations that support the query keys apply them on load.
 */
export function resolveHomeChartDrilldown(
  module:
    | 'production'
    | 'inventory'
    | 'hr'
    | 'quality'
    | 'repair'
    | 'customers'
    | 'plans'
    | 'costs',
  ctx: DrillCtx,
): string {
  const { start, end, barName = '' } = ctx;

  switch (module) {
    case 'production':
      return withQuery('/production-plans', { dateFrom: start, dateTo: end });
    case 'costs':
      return '/accounting/monthly-costs';
    case 'plans': {
      const statusMap: Record<string, string> = {
        مخطط: 'planned',
        جاري: 'in_progress',
        مكتمل: 'completed',
        ملغي: 'cancelled',
      };
      return withQuery('/production-plans', {
        status: statusMap[barName] || '',
        dateFrom: start,
        dateTo: end,
      });
    }
    case 'inventory': {
      const map: Record<string, string> = {
        أصناف: '/inventory/balances',
        'تحت الحد': withQuery('/inventory/exceptions', { kind: 'low' }),
        سالب: withQuery('/inventory/exceptions', { kind: 'negative' }),
        تموين: '/inventory/raw-materials/alerts',
        'تحويل معلّق': '/inventory/transfer-approvals',
        'صرف مفتوح': '/inventory/production-issues',
        إيصالات: '/inventory/production-approvals',
      };
      return map[barName] || '/inventory';
    }
    case 'hr': {
      const statusMap: Record<string, string> = {
        حضور: 'present',
        غياب: 'absent',
        تأخير: 'late',
        'بدون سجل': '',
      };
      return withQuery('/hr/attendance/daily', {
        status: statusMap[barName] || '',
        dateFrom: start,
        dateTo: end,
      });
    }
    case 'quality':
      return withQuery('/quality/reports', { dateFrom: start, dateTo: end });
    case 'repair': {
      const focusMap: Record<string, string> = {
        مفتوح: 'open',
        جاهز: 'ready',
        متأخر: 'overdue',
        اليوم: 'today',
        'مُسلّم': 'delivered',
      };
      return withQuery('/repair/jobs', { focus: focusMap[barName] || 'open' });
    }
    case 'customers': {
      if (barName === 'يحتاج اتصال') {
        return withQuery('/customers/kpi', { followUp: 'needs_call' });
      }
      if (barName === 'نشط') {
        return withQuery('/customers/kpi', { active: '1' });
      }
      const sizeMap: Record<string, string> = {
        كبير: 'large',
        متوسط: 'medium',
        صغير: 'small',
      };
      return withQuery('/customers/kpi', { size: sizeMap[barName] || '' });
    }
    default:
      return '/';
  }
}
