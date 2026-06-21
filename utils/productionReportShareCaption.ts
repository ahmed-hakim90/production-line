/**
 * Plain-text captions for Web Share (WhatsApp image caption).
 * Minimal lines: product, quantity, date (single report); short summary for bulk.
 */
import type { PrintTemplateSettings } from '../types';
import type { ReportPrintRow } from '../modules/production/components/ProductionReportPrint';
import { getInjectionShiftLabel } from '../modules/production/utils/injectionReportShift';

function packagingQuantityAndLabel(report: ReportPrintRow): { qty: number; unit: string } {
  const rt = report.sourceReportType;
  const packagingLines = report.packagingPrintLines;
  const packagingPiecesTotal = packagingLines?.reduce((s, l) => s + Number(l.quantityPieces || 0), 0);
  if (
    rt === 'packaging'
    && packagingLines
    && packagingLines.length > 0
    && packagingPiecesTotal != null
  ) {
    return { qty: packagingPiecesTotal, unit: 'قطعة' };
  }
  return { qty: Number(report.quantityProduced || 0), unit: 'وحدة' };
}

function productLabelForCaption(report: ReportPrintRow): string {
  const rt = report.sourceReportType;
  const packagingLines = report.packagingPrintLines;
  if (rt === 'packaging' && packagingLines && packagingLines.length > 1) {
    const names = packagingLines
      .map((l) => String(l.productName || '').trim())
      .filter(Boolean);
    if (names.length > 0) return names.join('، ');
  }
  return String(report.productName || '—').trim() || '—';
}

/**
 * Three lines: product name, quantity, date.
 */
export function formatProductionReportShareCaption(
  report: ReportPrintRow,
  _printSettings?: PrintTemplateSettings,
): string {
  const { qty, unit } = packagingQuantityAndLabel(report);
  const qtyText = Number.isFinite(qty) ? qty.toLocaleString('ar-EG') : String(qty);
  const date = report.date?.trim() || '—';
  const shiftLine = report.sourceReportType === 'component_injection'
    ? [`الوردية: ${getInjectionShiftLabel(report.shift)}`]
    : [];
  return [
    `المنتج: ${productLabelForCaption(report)}`,
    `الكمية: ${qtyText} ${unit}`,
    ...shiftLine,
    `التاريخ: ${date}`,
  ].join('\n');
}

export function formatBulkProductionReportsShareCaption(input: {
  title: string;
  subtitle?: string;
  totals: {
    totalProduced: number;
    totalWaste: number;
    totalHours: number;
    totalWorkers: number;
    wasteRatio: string;
    reportsCount: number;
  };
  decimalPlaces?: number;
}): string {
  const n = input.totals.reportsCount;
  return `${input.title}\nعدد التقارير: ${n.toLocaleString('ar-EG')}`;
}
