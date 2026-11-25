import { inspectorPerformanceRows, rejectionReasonRows } from './qualityAnalytics';

export type QualityReportKind = 'all' | 'daily' | 'product' | 'waiting' | 'rejected' | 'reasons' | 'inspectors';

export interface QualityReportColumn {
  id: string;
  label: string;
}

export interface QualityReportPallet {
  id?: string;
  date: string;
  receivedTime?: string;
  lineId: string;
  lineName: string;
  productId: string;
  productName: string;
  productCode?: string;
  palletNumber: string | number;
  quantityOnPallet: number;
  inspectedQuantity: number;
  rejectedQuantity: number;
  sampleSizeRequired?: number;
  inspectionStatus: string;
  palletDecision: string;
  inspectorName?: string;
  workOrderNumber?: string;
  defects?: Array<{ reasonLabel: string; reasonCode?: string; count: number }>;
}

export interface QualityReportProduction {
  lineId: string;
  productId: string;
  lineName: string;
  productName: string;
  productCode: string;
  quantityProduced: number;
}

export interface QualityReportRecord {
  cells: Record<string, string | number>;
  palletId?: string;
}

const PALLET_COLUMNS: QualityReportColumn[] = [
  { id: 'palletNumber', label: 'البالتة' },
  { id: 'date', label: 'التاريخ' },
  { id: 'receivedTime', label: 'وقت الاستلام' },
  { id: 'lineName', label: 'الخط' },
  { id: 'productName', label: 'المنتج' },
  { id: 'quantityOnPallet', label: 'الكمية' },
  { id: 'sampleSizeRequired', label: 'عينة AQL المقررة' },
  { id: 'inspectedQuantity', label: 'العينة المفحوصة' },
  { id: 'rejectedQuantity', label: 'العيوب' },
  { id: 'rejectionSummary', label: 'أسباب الرفض' },
  { id: 'inspectionStatus', label: 'الحالة' },
  { id: 'palletDecision', label: 'القرار' },
  { id: 'inspectorName', label: 'المراقب' },
  { id: 'workOrderNumber', label: 'أمر الشغل' },
];

const DAILY_COLUMNS: QualityReportColumn[] = [
  { id: 'lineName', label: 'اسم الخط' },
  { id: 'inspectorName', label: 'مراقب الجودة' },
  { id: 'products', label: 'الجهاز' },
  { id: 'produced', label: 'الكمية المنتجة' },
  { id: 'inspected', label: 'كمية فحص AQL' },
  { id: 'rejected', label: 'الكمية المرفوضة' },
  { id: 'rejectionRate', label: 'نسبة الرفض' },
  { id: 'acceptedPallets', label: 'بلتات مقبولة' },
  { id: 'rejectedPallets', label: 'بلتات مرفوضة' },
];

const PRODUCT_COLUMNS: QualityReportColumn[] = [
  { id: 'productCode', label: 'كود الجهاز' },
  { id: 'productName', label: 'اسم الجهاز' },
  { id: 'lineName', label: 'الخط' },
  { id: 'totalPallets', label: 'إجمالي البلتات' },
  { id: 'produced', label: 'إجمالي الإنتاج' },
  { id: 'inspectedLot', label: 'المفحوص' },
  { id: 'waitingLot', label: 'في الانتظار' },
  { id: 'acceptedPallets', label: 'مقبول' },
  { id: 'rejectedPallets', label: 'مرفوض' },
  { id: 'rejectionRate', label: 'نسبة الرفض' },
];

export const QUALITY_REPORT_COLUMNS: Record<QualityReportKind, QualityReportColumn[]> = {
  all: PALLET_COLUMNS,
  daily: DAILY_COLUMNS,
  product: PRODUCT_COLUMNS,
  waiting: [
    { id: 'date', label: 'تاريخ الاستلام' },
    { id: 'receivedTime', label: 'وقت الاستلام' },
    { id: 'lineName', label: 'اسم الخط' },
    { id: 'palletNumber', label: 'رقم البالتة' },
    { id: 'productName', label: 'الجهاز' },
    { id: 'quantityOnPallet', label: 'الكمية' },
    { id: 'sampleSizeRequired', label: 'عينة AQL المقررة' },
    { id: 'inspectorName', label: 'المراقب' },
  ],
  rejected: [
    { id: 'date', label: 'التاريخ' },
    { id: 'lineName', label: 'اسم الخط' },
    { id: 'palletNumber', label: 'رقم البالتة' },
    { id: 'productName', label: 'الجهاز' },
    { id: 'quantityOnPallet', label: 'الكمية' },
    { id: 'rejectedQuantity', label: 'العيوب' },
    { id: 'rejectionSummary', label: 'أسباب الرفض التفصيلية' },
    { id: 'inspectorName', label: 'المراقب' },
  ],
  reasons: [
    { id: 'reason', label: 'السبب' },
    { id: 'lineName', label: 'الخط' },
    { id: 'productName', label: 'المنتج' },
    { id: 'defects', label: 'العيوب' },
    { id: 'pallets', label: 'البالتات' },
  ],
  inspectors: [
    { id: 'inspectorName', label: 'المراقب' },
    { id: 'pallets', label: 'البالتات' },
    { id: 'inspected', label: 'المفحوص' },
    { id: 'rejected', label: 'المرفوض' },
    { id: 'acceptedPallets', label: 'بلتات مقبولة' },
    { id: 'rejectedPallets', label: 'بلتات مرفوضة' },
    { id: 'rejectionRate', label: 'النسبة' },
  ],
};

export function reportColumnsFor(kind: QualityReportKind, selectedIds: readonly string[]): QualityReportColumn[] {
  const columns = QUALITY_REPORT_COLUMNS[kind];
  const chosen = columns.filter((column) => selectedIds.includes(column.id));
  return chosen.length > 0 ? chosen : columns;
}

function rateText(rejected: number, inspected: number): string {
  if (inspected <= 0) return '—';
  return `${Number(((rejected / inspected) * 100).toFixed(2))}٪`;
}

function defectSummary(row: QualityReportPallet): string {
  const parts = (row.defects || [])
    .filter((defect) => Number(defect.count || 0) > 0)
    .map((defect) => `${defect.reasonLabel} (${defect.count})`);
  return parts.join('، ') || '—';
}

function text(value: string | number | null | undefined, empty = '—'): string | number {
  if (value == null || value === '') return empty;
  return value;
}

function palletCells(row: QualityReportPallet): Record<string, string | number> {
  return {
    palletNumber: row.palletNumber,
    date: row.date,
    receivedTime: text(row.receivedTime),
    lineName: row.lineName,
    productName: row.productCode ? `${row.productName} (${row.productCode})` : row.productName,
    quantityOnPallet: row.quantityOnPallet,
    sampleSizeRequired: row.sampleSizeRequired ?? '—',
    inspectedQuantity: row.inspectedQuantity,
    rejectedQuantity: row.rejectedQuantity,
    rejectionSummary: defectSummary(row),
    inspectionStatus: row.inspectionStatus,
    palletDecision: row.palletDecision,
    inspectorName: text(row.inspectorName),
    workOrderNumber: text(row.workOrderNumber),
  };
}

function sumProduced(rows: QualityReportProduction[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + (Number(row.quantityProduced) || 0), 0);
}

function dailyRecords(pallets: QualityReportPallet[], production: QualityReportProduction[]): QualityReportRecord[] {
  const keys = new Map<string, { lineId: string; lineName: string }>();
  pallets.forEach((row) => keys.set(row.lineId, { lineId: row.lineId, lineName: row.lineName }));
  production.forEach((row) => {
    if (!keys.has(row.lineId)) keys.set(row.lineId, { lineId: row.lineId, lineName: row.lineName });
  });
  return [...keys.values()]
    .map((key) => {
      const related = pallets.filter((row) => row.lineId === key.lineId);
      const produced = sumProduced(production.filter((row) => row.lineId === key.lineId));
      const inspected = related.reduce((sum, row) => sum + row.inspectedQuantity, 0);
      const rejected = related.reduce((sum, row) => sum + row.rejectedQuantity, 0);
      const products = [...new Set(related.map((row) => row.productName).filter(Boolean))];
      const inspectors = [...new Set(related.map((row) => row.inspectorName?.trim()).filter(Boolean))];
      return {
        cells: {
          lineName: key.lineName,
          inspectorName: inspectors.join('، ') || '—',
          products: products.join('، ') || '—',
          produced: produced == null ? '—' : produced,
          inspected,
          rejected,
          rejectionRate: rateText(rejected, inspected),
          acceptedPallets: related.filter((row) => row.palletDecision === 'مقبول').length,
          rejectedPallets: related.filter((row) => row.palletDecision === 'مرفوض').length,
        },
      };
    })
    .sort((left, right) => String(left.cells.lineName).localeCompare(String(right.cells.lineName), 'ar'));
}

function productRecords(pallets: QualityReportPallet[], production: QualityReportProduction[]): QualityReportRecord[] {
  const keys = new Map<string, { lineId: string; productId: string; lineName: string; productName: string; productCode: string }>();
  pallets.forEach((row) => keys.set(`${row.lineId}:${row.productId}`, {
    lineId: row.lineId,
    productId: row.productId,
    lineName: row.lineName,
    productName: row.productName,
    productCode: row.productCode || '',
  }));
  production.forEach((row) => {
    const key = `${row.lineId}:${row.productId}`;
    if (!keys.has(key)) keys.set(key, row);
  });
  return [...keys.values()]
    .map((key) => {
      const related = pallets.filter((row) => row.lineId === key.lineId && row.productId === key.productId);
      const produced = sumProduced(production.filter((row) => row.lineId === key.lineId && row.productId === key.productId));
      const inspected = related.reduce((sum, row) => sum + row.inspectedQuantity, 0);
      const rejected = related.reduce((sum, row) => sum + row.rejectedQuantity, 0);
      return {
        cells: {
          productCode: key.productCode || '—',
          productName: key.productName,
          lineName: key.lineName,
          totalPallets: related.length,
          produced: produced == null ? '—' : produced,
          inspectedLot: related.filter((row) => row.inspectionStatus === 'تم الفحص').reduce((sum, row) => sum + row.quantityOnPallet, 0),
          waitingLot: related.filter((row) => row.inspectionStatus === 'في انتظار الفحص').reduce((sum, row) => sum + row.quantityOnPallet, 0),
          acceptedPallets: related.filter((row) => row.palletDecision === 'مقبول').length,
          rejectedPallets: related.filter((row) => row.palletDecision === 'مرفوض').length,
          rejectionRate: rateText(rejected, inspected),
        },
      };
    })
    .sort((left, right) => String(left.cells.productName).localeCompare(String(right.cells.productName), 'ar'));
}

export function qualityReportRecords(input: {
  kind: QualityReportKind;
  pallets: QualityReportPallet[];
  production: QualityReportProduction[];
}): QualityReportRecord[] {
  if (input.kind === 'daily') return dailyRecords(input.pallets, input.production);
  if (input.kind === 'product') return productRecords(input.pallets, input.production);
  if (input.kind === 'reasons') {
    return rejectionReasonRows(input.pallets).map((row) => ({
      cells: {
        reason: row.reasonCode ? `${row.reasonLabel} (${row.reasonCode})` : row.reasonLabel,
        lineName: row.lineName,
        productName: row.productName,
        defects: row.defects,
        pallets: row.pallets,
      },
    }));
  }
  if (input.kind === 'inspectors') {
    return inspectorPerformanceRows(input.pallets).map((row) => ({
      cells: {
        inspectorName: row.inspectorName,
        pallets: row.pallets,
        inspected: row.inspected,
        rejected: row.rejected,
        acceptedPallets: row.acceptedPallets,
        rejectedPallets: row.rejectedPallets,
        rejectionRate: row.rate == null ? '—' : `${row.rate}٪`,
      },
    }));
  }
  return input.pallets.map((row) => ({ palletId: row.id, cells: palletCells(row) }));
}
