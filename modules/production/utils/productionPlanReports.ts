import type { PlanStatus, ProductionPlan, ProductionReport } from '../../../types';
import {
  countsTowardProductManufacturingVolume,
  effectivePlanReportType,
  resolveReportType,
} from './reportTypes';

export const planAcceptsDirectReportProduction = (
  plan: Pick<ProductionPlan, 'acceptsProductionFromReports'>,
): boolean => plan.acceptsProductionFromReports !== false;

/** Calendar day `YYYY-MM-DD` from Firestore Timestamp / Date / ISO / date string. */
export const toPlanCalendarDate = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return '';
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'object') {
    const maybeTs = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTs.toDate === 'function') {
      try {
        return toPlanCalendarDate(maybeTs.toDate());
      } catch {
        return '';
      }
    }
    if (typeof maybeTs.seconds === 'number' && Number.isFinite(maybeTs.seconds)) {
      return toPlanCalendarDate(new Date(maybeTs.seconds * 1000));
    }
  }
  return '';
};

export const resolveProductionPlanQuantityStartDate = (
  plan: Pick<ProductionPlan, 'createdAt' | 'startDate' | 'plannedStartDate'>,
): string => (
  toPlanCalendarDate(plan.createdAt)
  || String(plan.startDate || '').trim().slice(0, 10)
  || String(plan.plannedStartDate || '').trim().slice(0, 10)
);

const daysBetweenCalendarDates = (fromDate: string, toDate: string): number => {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
};

export const PLAN_STATUS_SORT_RANK: Record<PlanStatus, number> = {
  in_progress: 0,
  planned: 1,
  paused: 2,
  completed: 3,
  cancelled: 4,
};

/** Idle threshold: 2 calendar days without producing reports → paused. */
export const PRODUCTION_PLAN_IDLE_DAYS_BEFORE_PAUSED = 2;

export const deriveProductionPlanAutoStatus = (
  plan: Pick<ProductionPlan, 'status' | 'plannedQuantity'>,
  producedQty: number,
  lastProducingReportDate: string | null,
  todayDate: string,
): PlanStatus => {
  if (plan.status === 'cancelled') return 'cancelled';

  const plannedQty = Number(plan.plannedQuantity || 0);
  if (plannedQty > 0 && producedQty >= plannedQty) return 'completed';

  const hasProgress = producedQty > 0;
  if (!hasProgress) return 'planned';

  const lastDate = String(lastProducingReportDate || '').trim().slice(0, 10);
  if (!lastDate) return 'in_progress';

  const idleDays = daysBetweenCalendarDates(lastDate, todayDate);
  if (idleDays >= PRODUCTION_PLAN_IDLE_DAYS_BEFORE_PAUSED) return 'paused';
  return 'in_progress';
};

export const filterReportsForProductionPlan = (
  plan: Pick<
    ProductionPlan,
    'id' | 'productId' | 'planType' | 'acceptsProductionFromReports' | 'createdAt' | 'startDate' | 'plannedStartDate'
  >,
  reports: ProductionReport[],
): ProductionReport[] => {
  const planType = plan.planType === 'component_injection' ? 'component_injection' : 'finished_product';
  const planId = String(plan.id || '').trim();
  const acceptsDirectReports = planAcceptsDirectReportProduction(plan);
  if (!acceptsDirectReports) return [];

  const quantityStartDate = resolveProductionPlanQuantityStartDate(plan);

  return reports.filter((report) => {
    if (!countsTowardProductManufacturingVolume(report)) return false;
    if (report.productId !== plan.productId) return false;
    if (effectivePlanReportType(resolveReportType(report.reportType)) !== planType) return false;

    const reportDate = String(report.date || '').trim().slice(0, 10);
    if (quantityStartDate && reportDate && reportDate < quantityStartDate) return false;

    const reportPlanId = String(report.productionPlanId || '').trim();
    if (planId && reportPlanId) return reportPlanId === planId;

    const hasIndependentWorkOrder = Boolean(String(report.workOrderId || '').trim());
    return acceptsDirectReports && !hasIndependentWorkOrder;
  });
};
