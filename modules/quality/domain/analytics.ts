import type { QualityDefectLine } from '../model';

export type QualityInspectionSource = 'line' | 'hourly' | 'pallet';
export type ProductChartSort = 'defects' | 'rate' | 'samples' | 'fewest-defects';

export interface QualityAnalyticsRecord {
  id: string;
  source: QualityInspectionSource;
  date: string;
  lineId: string;
  lineName: string;
  productId: string;
  productName: string;
  productCode?: string;
  sampleCount: number;
  defectCount: number;
  defects: QualityDefectLine[];
}

export interface QualityAnalyticsFilters {
  lineId?: string;
  productId?: string;
  reasonId?: string;
  minimumSamplesForBestLine?: number;
  productSort?: ProductChartSort;
}

export interface QualityAnalyticsGroup {
  key: string;
  name: string;
  code?: string;
  lineId?: string;
  lineName?: string;
  productId?: string;
  productName?: string;
  inspectionCount: number;
  sampleCount: number;
  defectCount: number;
  defectRate: number;
}

export interface QualityReasonMetric {
  reasonId: string;
  name: string;
  count: number;
  share: number;
  cumulativeShare: number;
}

export interface QualityHeatmapCell {
  lineKey: string;
  productKey: string;
  sampleCount: number;
  defectCount: number;
  defectRate: number;
}

export interface QualityAnalyticsResult {
  inspectionCount: number;
  sampleCount: number;
  defectCount: number;
  defectRate: number;
  defectOccurrenceCount: number;
  lines: QualityAnalyticsGroup[];
  products: QualityAnalyticsGroup[];
  lineProducts: QualityAnalyticsGroup[];
  reasons: QualityReasonMetric[];
  heatmap: QualityHeatmapCell[];
  bestLine: QualityAnalyticsGroup | null;
  bestProduct: QualityAnalyticsGroup | null;
}

const numeric = (value: number): number => Number.isFinite(value) && value > 0 ? value : 0;
const rate = (defects: number, samples: number): number => samples > 0 ? defects / samples * 100 : 0;
const normalizedName = (value: string): string =>
  value.trim().toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');

function groupBy<T>(
  records: QualityAnalyticsRecord[],
  getKey: (record: QualityAnalyticsRecord) => string,
  getName: (record: QualityAnalyticsRecord) => string,
  details: (record: QualityAnalyticsRecord) => Partial<QualityAnalyticsGroup>,
): QualityAnalyticsGroup[] {
  const grouped = new Map<string, QualityAnalyticsGroup>();
  for (const record of records) {
    const key = getKey(record);
    if (!key) continue;
    const existing = grouped.get(key) || {
      key,
      name: getName(record),
      inspectionCount: 0,
      sampleCount: 0,
      defectCount: 0,
      defectRate: 0,
    };
    existing.inspectionCount += 1;
    existing.sampleCount += numeric(record.sampleCount);
    existing.defectCount += numeric(record.defectCount);
    for (const [field, value] of Object.entries(details(record))) {
      if (value != null && value !== '' && !existing[field as keyof QualityAnalyticsGroup]) {
        Object.assign(existing, { [field]: value });
      }
    }
    existing.defectRate = rate(existing.defectCount, existing.sampleCount);
    grouped.set(key, existing);
  }
  return [...grouped.values()];
}

export function buildQualityAnalytics(
  records: QualityAnalyticsRecord[],
  filters: QualityAnalyticsFilters = {},
): QualityAnalyticsResult {
  const scoped = records.filter((record) =>
    (!filters.lineId || record.lineId === filters.lineId)
    && (!filters.productId || record.productId === filters.productId),
  ).map((record) => {
    const matchingDefects = filters.reasonId
      ? record.defects.filter((defect) => defect.reasonId === filters.reasonId)
      : record.defects;
    const defectCount = filters.reasonId
      ? matchingDefects.reduce((sum, defect) => sum + numeric(defect.count), 0)
      : numeric(record.defectCount);
    return { ...record, defectCount, defects: matchingDefects };
  });

  const sampleCount = scoped.reduce((sum, record) => sum + numeric(record.sampleCount), 0);
  const defectCount = scoped.reduce((sum, record) => sum + numeric(record.defectCount), 0);

  const lines = groupBy(
    scoped,
    (record) => record.lineId || `name:${normalizedName(record.lineName)}`,
    (record) => record.lineName,
    (record) => ({ lineId: record.lineId, lineName: record.lineName }),
  );
  const products = groupBy(
    scoped,
    (record) => record.productId || `name:${normalizedName(record.productCode || record.productName)}`,
    (record) => record.productName,
    (record) => ({ productId: record.productId, productName: record.productName, code: record.productCode }),
  );

  const tableGroups = groupBy(
    scoped,
    (record) => `${normalizedName(record.lineName)}|${record.productId || normalizedName(record.productCode || record.productName)}`,
    (record) => `${record.lineName} — ${record.productName}`,
    (record) => ({
      lineName: record.lineName,
      productName: record.productName,
      productId: record.productId,
      code: record.productCode,
    }),
  );

  const reasonCounts = new Map<string, { name: string; count: number }>();
  let defectOccurrenceCount = 0;
  scoped.forEach((record) => record.defects.forEach((defect) => {
    const count = numeric(defect.count);
    if (count === 0) return;
    defectOccurrenceCount += count;
    const current = reasonCounts.get(defect.reasonId) || {
      name: defect.reasonLabel || defect.reasonCode || 'سبب غير معروف',
      count: 0,
    };
    current.count += count;
    reasonCounts.set(defect.reasonId, current);
  }));
  const reasonEntries = [...reasonCounts.entries()]
    .map(([reasonId, metric]) => ({ reasonId, ...metric }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar'));
  let cumulative = 0;
  const reasons = reasonEntries.map((reason) => {
    const share = defectOccurrenceCount > 0 ? reason.count / defectOccurrenceCount : 0;
    cumulative += share;
    return { ...reason, share, cumulativeShare: cumulative };
  });

  const lineKeys = new Map<string, string>();
  const productKeys = new Map<string, string>();
  const heat = new Map<string, QualityHeatmapCell>();
  scoped.forEach((record) => {
    const lineKey = record.lineId || `name:${normalizedName(record.lineName)}`;
    const productKey = record.productId || `name:${normalizedName(record.productCode || record.productName)}`;
    lineKeys.set(lineKey, record.lineName);
    productKeys.set(productKey, record.productCode
      ? `${record.productName} (${record.productCode})`
      : record.productName);
    const key = `${lineKey}|${productKey}`;
    const cell = heat.get(key) || { lineKey, productKey, sampleCount: 0, defectCount: 0, defectRate: 0 };
    cell.sampleCount += numeric(record.sampleCount);
    cell.defectCount += numeric(record.defectCount);
    cell.defectRate = rate(cell.defectCount, cell.sampleCount);
    heat.set(key, cell);
  });

  const minimumSamples = filters.minimumSamplesForBestLine ?? 30;
  const bestLine = lines
    .filter((line) => line.sampleCount >= minimumSamples)
    .sort((a, b) => a.defectRate - b.defectRate || b.sampleCount - a.sampleCount)[0] || null;
  const bestProduct = products
    .filter((product) => product.sampleCount > 0)
    .sort((a, b) => a.defectRate - b.defectRate || b.sampleCount - a.sampleCount)[0] || null;

  const productSort = filters.productSort || 'defects';
  products.sort((a, b) => {
    if (productSort === 'rate') return b.defectRate - a.defectRate || b.sampleCount - a.sampleCount;
    if (productSort === 'samples') return b.sampleCount - a.sampleCount;
    if (productSort === 'fewest-defects') return a.defectCount - b.defectCount;
    return b.defectCount - a.defectCount;
  });

  return {
    inspectionCount: scoped.length,
    sampleCount,
    defectCount,
    defectRate: rate(defectCount, sampleCount),
    defectOccurrenceCount,
    lines,
    products,
    lineProducts: tableGroups,
    reasons,
    heatmap: [...heat.values()],
    bestLine,
    bestProduct,
  };
}

export function heatmapColor(defectRate: number): string {
  if (defectRate >= 10) return '#991b1b';
  if (defectRate >= 5) return '#f97316';
  if (defectRate >= 1) return '#facc15';
  return '#16a34a';
}

export function paretoTopCauseCount(reasons: QualityReasonMetric[], target = 0.8): number {
  if (reasons.length === 0) return 0;
  const index = reasons.findIndex((reason) => reason.cumulativeShare >= target);
  return index < 0 ? reasons.length : index + 1;
}
