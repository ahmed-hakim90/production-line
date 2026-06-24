import type { ProductionPlan, ProductionReport } from '../../../types';
import {
  countsTowardProductManufacturingVolume,
  effectivePlanReportType,
  resolveReportType,
} from './reportTypes';

export const planAcceptsDirectReportProduction = (
  plan: Pick<ProductionPlan, 'acceptsProductionFromReports'>,
): boolean => plan.acceptsProductionFromReports !== false;

export const filterReportsForProductionPlan = (
  plan: Pick<ProductionPlan, 'id' | 'lineId' | 'productId' | 'planType' | 'acceptsProductionFromReports'>,
  reports: ProductionReport[],
): ProductionReport[] => {
  const planType = plan.planType === 'component_injection' ? 'component_injection' : 'finished_product';
  const planId = String(plan.id || '').trim();
  const acceptsDirectReports = planAcceptsDirectReportProduction(plan);
  if (!acceptsDirectReports) return [];

  return reports.filter((report) => {
    if (!countsTowardProductManufacturingVolume(report)) return false;
    if (report.lineId !== plan.lineId || report.productId !== plan.productId) return false;
    if (effectivePlanReportType(resolveReportType(report.reportType)) !== planType) return false;

    const reportPlanId = String(report.productionPlanId || '').trim();
    if (planId && reportPlanId) return reportPlanId === planId;

    const hasIndependentWorkOrder = Boolean(String(report.workOrderId || '').trim());
    return acceptsDirectReports && !hasIndependentWorkOrder;
  });
};
