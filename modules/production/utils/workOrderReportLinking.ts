import type { ProductionReport, WorkOrder, WorkOrderStatus } from '../../../types';
import { countsTowardProductManufacturingVolume, resolveReportType, workOrderMatchesReportType } from './reportTypes';

export const WORK_ORDER_STATUS_SORT_RANK: Record<WorkOrderStatus, number> = {
  in_progress: 0,
  pending: 1,
  paused: 2,
  completed: 3,
  cancelled: 4,
};

/** Idle threshold: 2 calendar days without producing reports → paused. */
export const WORK_ORDER_IDLE_DAYS_BEFORE_PAUSED = 2;

export const WORK_ORDER_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  in_progress: 'شغال',
  pending: 'مش شغال',
  paused: 'متوقف',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};

const daysBetweenCalendarDates = (fromDate: string, toDate: string): number => {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
};

export function isOpenWorkOrderStatus(status?: WorkOrderStatus | string | null): boolean {
  return status === 'pending' || status === 'in_progress' || status === 'paused';
}

export function lastProducingReportDateFromReports(reports: ProductionReport[]): string | null {
  const dates = reports
    .filter((report) => Number(report.quantityProduced || 0) > 0 && Boolean(report.date))
    .map((report) => String(report.date).slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort((a, b) => a.localeCompare(b));
  return dates[dates.length - 1] || null;
}

export function getWorkOrderStatusDetail(
  status: WorkOrderStatus,
  remainingDays?: number,
): string {
  if (status === 'completed') return 'تم بلوغ كمية أمر الشغل';
  if (status === 'cancelled') return 'أمر الشغل ملغي';
  if (status === 'paused') return 'مرّ يومان بدون إنتاج';
  if (status === 'pending') return 'بانتظار أول إنتاج';
  if (typeof remainingDays === 'number') {
    if (remainingDays > 0) return `${remainingDays} يوم متبقي`;
    if (remainingDays === 0) return 'آخر يوم في الأمر';
    return 'تجاوز تاريخ الانتهاء';
  }
  return 'شغال حالياً على الأمر';
}

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
    ? new Set<WorkOrder['status']>(['pending', 'in_progress', 'paused', 'completed'])
    : new Set<WorkOrder['status']>(['pending', 'in_progress', 'paused']);
  // Product + type + start-date are the hard join keys. Line is preferred when ranking
  // so a product that moved to another line still counts toward its open work order.
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
      if (criteria.lineId && wo.lineId === criteria.lineId) value += 8;
      if (supervisorId && wo.supervisorId === supervisorId) value += 4;
      if (wo.status === 'in_progress') value += 2;
      if (wo.status === 'paused') value += 1.5;
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
  lastProducingReportDate?: string | null,
  todayDate?: string,
): WorkOrder['status'] {
  if (previousStatus === 'cancelled') return 'cancelled';
  if (producedQty <= 0) return 'pending';
  if (targetQty > 0 && producedQty >= targetQty) return 'completed';

  const lastDate = String(lastProducingReportDate || '').trim().slice(0, 10);
  const today = String(todayDate || '').trim().slice(0, 10);
  if (lastDate && today) {
    const idleDays = daysBetweenCalendarDates(lastDate, today);
    if (idleDays >= WORK_ORDER_IDLE_DAYS_BEFORE_PAUSED) return 'paused';
  }
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
    // Line may change after WO creation — still attach same-product reports from start date.
    return true;
  });
}
