import type { ProductionReport, WorkOrder } from '../../../types';
import { countsTowardProductManufacturingVolume, resolveReportType, workOrderMatchesReportType } from './reportTypes';

/** YYYY-MM-DD from Firestore Timestamp, Date, ISO string, or existing date string. */
export function toCalendarDateString(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const ms = Date.parse(trimmed);
    if (!Number.isNaN(ms)) {
      const d = new Date(ms);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return null;
  }
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    const d = (value as { toDate: () => Date }).toDate();
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (typeof (value as { seconds?: number }).seconds === 'number') {
    const d = new Date((value as { seconds: number }).seconds * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return null;
}

/** Prefer explicit startDate; else calendar day of createdAt. */
export function getWorkOrderEffectiveStartDate(wo: Pick<WorkOrder, 'startDate' | 'createdAt'>): string | null {
  const start = String(wo.startDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(start)) return start.slice(0, 10);
  return toCalendarDateString(wo.createdAt);
}

export function reportDateEligibleForWorkOrder(
  reportDate: string | undefined | null,
  wo: Pick<WorkOrder, 'startDate' | 'createdAt'>,
): boolean {
  const reportDay = String(reportDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDay)) return false;
  const start = getWorkOrderEffectiveStartDate(wo);
  if (!start) return true;
  return reportDay >= start;
}

function getSortableDateMs(value: unknown): number {
  if (!value) return 0;
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof (value as { seconds?: number }).seconds === 'number') {
    return (value as { seconds: number }).seconds * 1000;
  }
  const ms = new Date(value as string | number | Date).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export type AutoLinkWorkOrderCriteria = {
  lineId: string;
  productId: string;
  supervisorId?: string;
  reportType: NonNullable<ProductionReport['reportType']>;
  reportDate?: string;
  includeCompleted?: boolean;
};

export function pickBestAutoLinkedWorkOrder(
  workOrders: WorkOrder[],
  criteria: AutoLinkWorkOrderCriteria,
): WorkOrder | null {
  const allowedStatuses = criteria.includeCompleted
    ? new Set<WorkOrder['status']>(['pending', 'in_progress', 'completed'])
    : new Set<WorkOrder['status']>(['pending', 'in_progress']);
  const filtered = workOrders.filter((wo) => (
    Boolean(wo?.id)
    && allowedStatuses.has(wo.status)
    && wo.productId === criteria.productId
    && workOrderMatchesReportType(wo, criteria.reportType)
    && (
      !criteria.reportDate
      || reportDateEligibleForWorkOrder(criteria.reportDate, wo)
    )
  ));
  if (filtered.length === 0) return null;

  const supervisorId = String(criteria.supervisorId || '').trim();
  const ranked = [...filtered].sort((a, b) => {
    const score = (wo: WorkOrder) => {
      let value = 0;
      if (wo.lineId === criteria.lineId) value += 8;
      if (supervisorId && wo.supervisorId === supervisorId) value += 4;
      if (wo.status === 'in_progress') value += 2;
      if (wo.status === 'pending') value += 1;
      if (wo.status === 'completed') value += 0.5;
      return value;
    };
    const scoreDiff = score(b) - score(a);
    if (scoreDiff !== 0) return scoreDiff;
    const targetDateDiff = String(b.targetDate || '').localeCompare(String(a.targetDate || ''));
    if (targetDateDiff !== 0) return targetDateDiff;
    const createdAtDiff = getSortableDateMs(b.createdAt) - getSortableDateMs(a.createdAt);
    if (createdAtDiff !== 0) return createdAtDiff;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  return ranked[0] ?? null;
}

/** Reports that count toward manufacturing produced qty on a work order. */
export function filterReportsCountingTowardWorkOrder(
  workOrderId: string,
  reports: ProductionReport[],
): ProductionReport[] {
  const woId = String(workOrderId || '').trim();
  if (!woId) return [];
  return reports.filter((report) => {
    if (String(report.workOrderId || '').trim() !== woId) return false;
    if (!countsTowardProductManufacturingVolume(report)) return false;
    return true;
  });
}

export function sumProducedFromWorkOrderReports(
  workOrderId: string,
  reports: ProductionReport[],
): number {
  return filterReportsCountingTowardWorkOrder(workOrderId, reports).reduce(
    (sum, report) => sum + Number(report.quantityProduced || 0),
    0,
  );
}

export function countReportsLinkedToWorkOrder(
  workOrderId: string,
  reports: ProductionReport[],
): number {
  const woId = String(workOrderId || '').trim();
  if (!woId) return 0;
  return reports.filter((report) => String(report.workOrderId || '').trim() === woId).length;
}

export function deriveWorkOrderStatusFromProduced(
  producedQty: number,
  targetQty: number,
  previousStatus: WorkOrder['status'],
): WorkOrder['status'] {
  if (previousStatus === 'cancelled') return 'cancelled';
  if (producedQty <= 0) return 'pending';
  if (targetQty > 0 && producedQty >= targetQty) return 'completed';
  return 'in_progress';
}

/** Candidate unlinked reports that may attach to this work order from its start date onward. */
export function filterUnlinkedReportsEligibleForWorkOrder(
  wo: WorkOrder,
  reports: ProductionReport[],
): ProductionReport[] {
  const woId = String(wo.id || '').trim();
  if (!woId) return [];
  return reports.filter((report) => {
    if (String(report.workOrderId || '').trim()) return false;
    if (report.productId !== wo.productId) return false;
    const reportType = resolveReportType(report.reportType);
    if (reportType === 'component_waste') return false;
    if (!workOrderMatchesReportType(wo, reportType)) return false;
    if (!reportDateEligibleForWorkOrder(report.date, wo)) return false;
    if (wo.lineId && report.lineId && report.lineId !== wo.lineId) return false;
    return true;
  });
}
