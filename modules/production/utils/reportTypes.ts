import type { ProductionReport, WorkOrder } from '../../../types';

export function resolveReportType(
  value?: ProductionReport['reportType'],
): NonNullable<ProductionReport['reportType']> {
  if (value === 'component_injection') return 'component_injection';
  if (value === 'packaging') return 'packaging';
  if (value === 'component_waste') return 'component_waste';
  return 'finished_product';
}

/**
 * Packaging reports track wrapped quantities for KPI/trace only — they must not inflate
 * product manufacturing volume, avg daily production, or cost allocation denominators.
 */
export function countsTowardProductManufacturingVolume(
  report: Pick<ProductionReport, 'reportType'>,
): boolean {
  const reportType = resolveReportType(report.reportType);
  return reportType !== 'packaging' && reportType !== 'component_waste';
}

export function resolveWorkOrderReportType(
  workOrderType?: WorkOrder['workOrderType'],
): 'finished_product' | 'component_injection' {
  return workOrderType === 'component_injection' ? 'component_injection' : 'finished_product';
}

/** Finished-goods work orders (non-injection) can be linked to packaging reports. */
export function workOrderMatchesReportType(
  wo: Pick<WorkOrder, 'workOrderType'>,
  reportType: NonNullable<ProductionReport['reportType']>,
): boolean {
  if (reportType === 'component_waste') return false;
  const woRt = resolveWorkOrderReportType(wo.workOrderType);
  if (reportType === 'packaging') return woRt === 'finished_product';
  return woRt === reportType;
}

/** Plan / supply-cycle matching: packaging behaves like finished_product for active plans. */
export function effectivePlanReportType(
  reportType: NonNullable<ProductionReport['reportType']>,
): 'finished_product' | 'component_injection' {
  return reportType === 'component_injection' ? 'component_injection' : 'finished_product';
}
