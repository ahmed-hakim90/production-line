import type { PrintTemplateSettings } from '@/types';
import { DEFAULT_PRINT_TEMPLATE } from '@/utils/dashboardConfig';
import { checkPermission, type Permission } from '@/utils/permissions';
import { buildGlobalPrintPageStyle } from '@/utils/print/printPageStyle';
import { scrapCauseShares, type ScrapCauseShare } from '../domain/scrap';
import { primaryInspectorSampleCount } from '../domain/samples';
import type {
  QualityDefectLine,
  QualityHourlySample,
  QualityLinePull,
  QualityPallet,
  QualityPeriodStatus,
  QualityScrapReport,
} from '../model';

/**
 * Source second-sort handover is A5 landscape: 210mm wide by 148mm tall.
 * A portrait A5 sheet is 148mm wide. A portrait A4 sheet is 210mm wide.
 */
export const SECOND_SORT_PAPER = {
  labelAr: 'A5 أفقي',
  width: '210mm',
  height: '148mm',
  pageSize: 'A5 landscape',
} as const;

export const QUALITY_PRINT_EMPTY = 'لا توجد سجلات مطابقة للطباعة.';

export function secondSortPageStyle(settings?: PrintTemplateSettings): string {
  return buildGlobalPrintPageStyle({
    ...DEFAULT_PRINT_TEMPLATE,
    ...(settings || {}),
    paperSize: 'a5',
    orientation: 'landscape',
  });
}

export function qualityRecordPrintAllowed(
  permissions: Record<string, boolean> | null | undefined,
  view: Permission,
): boolean {
  if (!permissions) return false;
  return checkPermission(permissions, 'quality.print') && checkPermission(permissions, view);
}

export function rowsMatchingTenant<T extends { tenantId?: string }>(rows: T[], tenantId: string): T[] {
  const tenant = tenantId.trim();
  if (!tenant) return [];
  return rows.filter((row) => row.tenantId === tenant);
}

export function formatQualityCount(value: number): string {
  return Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 });
}

export function formatQualityShare(share: number): string {
  return `${(share * 100).toLocaleString('ar-EG', { maximumFractionDigits: 2 })}٪`;
}

export function formatQualityDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('ar-EG');
}

export function formatQualityRange(from: string, to: string): string {
  if (from === to) return formatQualityDate(from);
  return `${formatQualityDate(from)} – ${formatQualityDate(to)}`;
}

const defectRows = (defects: QualityDefectLine[] | undefined) =>
  (defects || [])
    .filter((defect) => defect.reasonLabel.trim() || defect.reasonCode.trim() || Number(defect.count) > 0)
    .map((defect) => ({
      code: defect.reasonCode.trim(),
      label: defect.reasonLabel.trim(),
      count: Number(defect.count || 0),
      notes: (defect.notes || '').trim(),
    }));

export function hourlyPrintRows(rows: QualityHourlySample[]) {
  return rows.map((row) => ({
    id: row.id,
    slotName: row.slotName,
    lineName: row.lineName,
    productName: row.productName,
    shiftName: row.shiftName,
    inspectorName: row.inspectorName,
    sampleCount: row.sampleCount,
    defectCount: row.defectCount,
    decision: row.decision,
    notes: (row.notes || '').trim(),
    defects: defectRows(row.defects),
  }));
}

export function linePullResultLabel(row: Pick<QualityLinePull, 'status' | 'palletRejected'>): string {
  if (row.status !== 'completed') return 'قيد الفحص';
  return row.palletRejected ? 'مرفوضة' : 'مقبولة';
}

export function linePullPrintRows(rows: QualityLinePull[]) {
  return rows.map((row) => ({
    id: row.id,
    period: `${row.startTime}–${row.endTime}`,
    lineName: row.lineName,
    productName: row.productName,
    stationName: row.stationName,
    inspectorName: row.inspectorName,
    additionalInspectorName: (row.additionalInspectorName || '').trim(),
    sampleCount: row.sampleCount,
    additionalSampleCount: row.additionalSampleCount,
    primarySampleCount: primaryInspectorSampleCount(row.sampleCount, row.additionalSampleCount),
    defectCount: row.defectCount,
    result: linePullResultLabel(row),
    notes: (row.notes || '').trim(),
    reopenReason: (row.reopenReason || '').trim(),
    defects: defectRows(row.defects),
  }));
}

export function periodStatusPrintRows(
  rows: QualityPeriodStatus[],
  lineNames: Record<string, string> = {},
) {
  return rows
    .filter((row) => row.isStopped || row.noSampleReason.trim())
    .map((row) => ({
      id: row.id,
      slotKey: row.slotKey,
      lineName: lineNames[row.lineId] || row.lineId,
      stopped: row.isStopped,
      reason: row.noSampleReason.trim(),
    }));
}

export interface ScrapPrintRow {
  id: string;
  reportDate: string;
  lineName: string;
  productName: string;
  reasonLabel: string;
  reasonCode: string;
  quantity: number;
  slotName: string;
}

export function scrapPrintModel(rows: ScrapPrintRow[]): {
  rows: ScrapPrintRow[];
  total: number;
  shares: ScrapCauseShare[];
} {
  const printable = rows.filter((row) => row.reasonLabel.trim() && Number.isFinite(row.quantity));
  const shares = scrapCauseShares(printable);
  const total = printable.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  return { rows: printable, total, shares };
}

export function scrapReasonCode(
  reasonId: string | undefined,
  catalog: Array<{ id: string; code: string }>,
): string {
  if (!reasonId) return '';
  return catalog.find((item) => item.id === reasonId)?.code || '';
}

export interface QualityReportFilters {
  lineId?: string;
  productId?: string;
  workOrderId?: string;
  inspectionStatus?: string;
  reasonId?: string;
}

export function filterQualityPallets(rows: QualityPallet[], filters: QualityReportFilters): QualityPallet[] {
  return rows.filter((row) => {
    if (filters.lineId && row.lineId !== filters.lineId) return false;
    if (filters.productId && row.productId !== filters.productId) return false;
    if (filters.workOrderId && row.workOrderId !== filters.workOrderId && row.workOrderNumber !== filters.workOrderId) return false;
    if (filters.inspectionStatus && row.inspectionStatus !== filters.inspectionStatus) return false;
    if (filters.reasonId) {
      const matched = (row.defects || []).some((defect) => defect.reasonId === filters.reasonId);
      if (!matched) return false;
    }
    return true;
  });
}

export interface QualityReportTotals {
  reportedProduction: number | null;
  lotUnits: number;
  inspected: number;
  defects: number;
  scrap: number | null;
}

/** These quantities stay separate. None of them is a sum of the others. */
export function qualityReportTotals(input: {
  pallets: QualityPallet[];
  reportedProduction: number | null;
  scrapQuantity: number | null;
}): QualityReportTotals {
  return {
    reportedProduction: input.reportedProduction,
    lotUnits: input.pallets.reduce((sum, row) => sum + Number(row.quantityOnPallet || 0), 0),
    inspected: input.pallets.reduce((sum, row) => sum + Number(row.inspectedQuantity || 0), 0),
    defects: input.pallets.reduce((sum, row) => sum + Number(row.rejectedQuantity || 0), 0),
    scrap: input.scrapQuantity,
  };
}

export function palletDefectSummary(rows: QualityPallet[]) {
  const totals = new Map<string, { code: string; label: string; count: number }>();
  rows.forEach((row) => {
    (row.defects || []).forEach((defect) => {
      const label = defect.reasonLabel.trim();
      const code = defect.reasonCode.trim();
      if (!label && !code) return;
      const key = `${code}:${label}`;
      const current = totals.get(key) || { code, label, count: 0 };
      current.count += Number(defect.count || 0);
      totals.set(key, current);
    });
  });
  return [...totals.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'ar'));
}
