export const QUALITY_DASHBOARD_MIN_SAMPLES = 30;

export interface AnalyticsDefect {
  reasonLabel: string;
  count: number;
}

export interface AnalyticsInspection {
  id: string;
  date: string;
  lineId: string;
  lineName: string;
  productId: string;
  productName: string;
  productCode: string;
  inspected: number;
  defects: AnalyticsDefect[];
}

export interface AnalyticsFilters {
  month?: string;
  from?: string;
  to?: string;
  lineId?: string;
  productId?: string;
  reasonLabel?: string;
}

export interface AnalyticsRateRow {
  inspected: number;
  defects: number;
  rate: number | null;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function monthBounds(month: string): { from: string; to: string } {
  if (!MONTH.test(month)) throw new Error('الشهر المحدد غير صالح.');
  const [year, mon] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export function resolveAnalyticsRange(filters: AnalyticsFilters): { from: string; to: string } {
  const month = filters.month?.trim() || '';
  let from = filters.from?.trim() || '';
  let to = filters.to?.trim() || '';
  if (month) {
    const bounds = monthBounds(month);
    from = from && from > bounds.from ? from : bounds.from;
    to = to && to < bounds.to ? to : bounds.to;
  }
  if (!ISO.test(from) || !ISO.test(to) || to < from) throw new Error('نطاق التاريخ غير صالح.');
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const days = Math.round((end - start) / 86_400_000) + 1;
  if (days > 31) throw new Error('نطاق التحليل 31 يوماً كحد أقصى.');
  return { from, to };
}

function rate(defects: number, inspected: number): number | null {
  if (inspected <= 0) return null;
  return Number(((defects / inspected) * 100).toFixed(2));
}

function defectTotal(row: AnalyticsInspection): number {
  return row.defects.reduce((sum, defect) => sum + Number(defect.count || 0), 0);
}

function group<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = keyOf(row);
    grouped.set(key, [...(grouped.get(key) || []), row]);
  });
  return grouped;
}

function bestRows<T extends AnalyticsRateRow>(rows: T[]): T[] {
  const eligible = rows.filter((row) => row.inspected >= QUALITY_DASHBOARD_MIN_SAMPLES && row.rate != null);
  if (eligible.length === 0) return [];
  const best = Math.min(...eligible.map((row) => row.rate as number));
  return eligible.filter((row) => Math.abs((row.rate as number) - best) < 0.005);
}

export function buildQualityAnalytics(rows: AnalyticsInspection[], filters: AnalyticsFilters) {
  const range = resolveAnalyticsRange(filters);
  const reason = filters.reasonLabel?.trim() || '';
  const filtered = rows.filter((row) => {
    if (row.date < range.from || row.date > range.to) return false;
    if (filters.lineId && row.lineId !== filters.lineId) return false;
    if (filters.productId && row.productId !== filters.productId) return false;
    if (reason && !row.defects.some((defect) => defect.reasonLabel.trim() === reason)) return false;
    return row.inspected > 0;
  });

  const inspected = filtered.reduce((sum, row) => sum + row.inspected, 0);
  const defects = filtered.reduce((sum, row) => sum + defectTotal(row), 0);
  const daily = [...group(filtered, (row) => row.date).entries()]
    .map(([date, items]) => {
      const dayInspected = items.reduce((sum, row) => sum + row.inspected, 0);
      const dayDefects = items.reduce((sum, row) => sum + defectTotal(row), 0);
      return { date, inspected: dayInspected, defects: dayDefects, rate: rate(dayDefects, dayInspected) };
    })
    .sort((left, right) => left.date.localeCompare(right.date));

  const summarize = (items: AnalyticsInspection[]): AnalyticsRateRow => {
    const rowInspected = items.reduce((sum, row) => sum + row.inspected, 0);
    const rowDefects = items.reduce((sum, row) => sum + defectTotal(row), 0);
    return { inspected: rowInspected, defects: rowDefects, rate: rate(rowDefects, rowInspected) };
  };

  const lines = [...group(filtered, (row) => row.lineId).entries()].map(([lineId, items]) => ({
    lineId,
    lineName: items[0]?.lineName || '',
    ...summarize(items),
  })).sort((left, right) => (right.rate || 0) - (left.rate || 0) || right.defects - left.defects);

  const products = [...group(filtered, (row) => row.productId).entries()].map(([productId, items]) => ({
    productId,
    productName: items[0]?.productName || '',
    productCode: items[0]?.productCode || '',
    ...summarize(items),
  })).sort((left, right) => left.productName.localeCompare(right.productName, 'ar'));

  const lineProducts = [...group(filtered, (row) => `${row.lineId}:${row.productId}`).entries()].map(([, items]) => ({
    lineName: items[0]?.lineName || '',
    productName: items[0]?.productName || '',
    productCode: items[0]?.productCode || '',
    inspections: items.length,
    ...summarize(items),
  })).sort((left, right) => (right.rate || 0) - (left.rate || 0));

  const defectTotals = new Map<string, number>();
  const relations = new Map<string, { reasonLabel: string; lineName: string; productName: string; count: number }>();
  filtered.forEach((row) => {
    row.defects.forEach((defect) => {
      const label = defect.reasonLabel.trim();
      if (!label || (reason && label !== reason)) return;
      const count = Number(defect.count || 0);
      if (count <= 0) return;
      defectTotals.set(label, (defectTotals.get(label) || 0) + count);
      const relationKey = `${label}|${row.lineName}|${row.productName}`;
      const current = relations.get(relationKey);
      relations.set(relationKey, {
        reasonLabel: label,
        lineName: row.lineName,
        productName: row.productName,
        count: (current?.count || 0) + count,
      });
    });
  });
  const occurrenceTotal = [...defectTotals.values()].reduce((sum, count) => sum + count, 0);
  const pareto = [...defectTotals.entries()]
    .map(([reasonLabel, count]) => ({
      reasonLabel,
      count,
      share: occurrenceTotal > 0 ? Number(((count / occurrenceTotal) * 100).toFixed(2)) : null,
    }))
    .sort((left, right) => right.count - left.count || left.reasonLabel.localeCompare(right.reasonLabel, 'ar'));
  const topCount = pareto[0]?.count ?? 0;
  const lowCount = pareto[pareto.length - 1]?.count ?? 0;

  return {
    range,
    minimumSamples: QUALITY_DASHBOARD_MIN_SAMPLES,
    totals: {
      inspections: filtered.length,
      inspected,
      defects,
      rate: rate(defects, inspected),
      occurrences: occurrenceTotal,
    },
    daily,
    lines,
    products,
    lineProducts,
    pareto,
    relations: [...relations.values()].sort((left, right) => right.count - left.count),
    bestLines: bestRows(lines),
    bestProducts: bestRows(products),
    mostDefects: pareto.filter((item) => item.count === topCount && topCount > 0),
    leastDefects: pareto.filter((item) => item.count === lowCount && lowCount > 0),
  };
}

export function rejectionReasonRows(rows: Array<{ lineName: string; productName: string; defects?: Array<{ reasonLabel: string; reasonCode?: string; count: number }> }>) {
  const grouped = new Map<string, { reasonLabel: string; reasonCode: string; lineName: string; productName: string; defects: number; pallets: number }>();
  rows.forEach((row) => {
    (row.defects || []).forEach((defect) => {
      const count = Number(defect.count || 0);
      if (count <= 0) return;
      const key = `${defect.reasonLabel}|${row.lineName}|${row.productName}`;
      const current = grouped.get(key) || { reasonLabel: defect.reasonLabel, reasonCode: defect.reasonCode || '', lineName: row.lineName, productName: row.productName, defects: 0, pallets: 0 };
      current.defects += count;
      current.pallets += 1;
      grouped.set(key, current);
    });
  });
  return [...grouped.values()].sort((left, right) => right.defects - left.defects || left.reasonLabel.localeCompare(right.reasonLabel, 'ar'));
}

export function inspectorPerformanceRows(rows: Array<{ inspectorName?: string; inspectedQuantity: number; rejectedQuantity: number; palletDecision: string }>) {
  const grouped = new Map<string, { inspectorName: string; pallets: number; inspected: number; rejected: number; acceptedPallets: number; rejectedPallets: number }>();
  rows.forEach((row) => {
    const inspectorName = row.inspectorName?.trim() || 'بدون مراقب';
    const current = grouped.get(inspectorName) || { inspectorName, pallets: 0, inspected: 0, rejected: 0, acceptedPallets: 0, rejectedPallets: 0 };
    current.pallets += 1;
    current.inspected += Number(row.inspectedQuantity || 0);
    current.rejected += Number(row.rejectedQuantity || 0);
    if (row.palletDecision === 'مقبول') current.acceptedPallets += 1;
    if (row.palletDecision === 'مرفوض') current.rejectedPallets += 1;
    grouped.set(inspectorName, current);
  });
  return [...grouped.values()]
    .map((row) => ({ ...row, rate: row.inspected > 0 ? Number(((row.rejected / row.inspected) * 100).toFixed(2)) : null }))
    .sort((left, right) => right.pallets - left.pallets || left.inspectorName.localeCompare(right.inspectorName, 'ar'));
}

export function csvCell(value: string | number | null): string {
  const text = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
