import { reportService } from '@/modules/production/services/reportService';
import type {
  CostAllocation,
  CostCenter,
  CostCenterValue,
  FirestoreProduct,
  ProductionReport,
  WorkOrder,
} from '../../../types';
import { estimateReportCost } from '../../../utils/costCalculations';

export interface WorkOrderCardMetricsData {
  reportsByWorkOrderId: Record<string, ProductionReport[]>;
}

export interface WorkOrderCardMetrics {
  estimatedUnitCost: number | null;
  estimatedDailyCost: number | null;
  estimatedTotalCost: number | null;
  estimatedWorkDays: number | null;
  actualUnitCostToDate: number | null;
  averageWorkers: number | null;
  remainingQty: number;
  remainingDaysByBenchmark: number | null;
  estimatedRemainingCost: number | null;
}

const EMPTY_DATA: WorkOrderCardMetricsData = {
  reportsByWorkOrderId: {},
};

export const emptyWorkOrderCardMetricsData = (): WorkOrderCardMetricsData => EMPTY_DATA;

export async function loadWorkOrderCardMetricsData(
  workOrders: WorkOrder[],
): Promise<WorkOrderCardMetricsData> {
  const uniqueWorkOrderIds = Array.from(
    new Set(workOrders.map((wo) => wo.id).filter((id): id is string => Boolean(id))),
  );

  const reportsEntries = await Promise.all(
    uniqueWorkOrderIds.map(async (workOrderId) => {
      try {
        const reports = await reportService.getByWorkOrderId(workOrderId);
        return [workOrderId, reports] as const;
      } catch {
        return [workOrderId, []] as const;
      }
    }),
  );

  const reportsByWorkOrderId: Record<string, ProductionReport[]> = {};
  reportsEntries.forEach(([workOrderId, reports]) => {
    reportsByWorkOrderId[workOrderId] = reports;
  });

  return {
    reportsByWorkOrderId,
  };
}

export function getWorkOrderCardMetrics(
  workOrder: WorkOrder,
  product: FirestoreProduct | undefined,
  data: WorkOrderCardMetricsData,
  options: {
    producedNowRaw?: number;
    lineDailyWorkingHours?: number;
    supervisorHourlyRate?: number;
    hourlyRate?: number;
    costCenters?: CostCenter[];
    costCenterValues?: CostCenterValue[];
    costAllocations?: CostAllocation[];
    reportDate?: string;
  } = {},
): WorkOrderCardMetrics {
  const producedNow = Math.max(0, Number(
    options.producedNowRaw ??
    workOrder.actualProducedFromScans ??
    workOrder.producedQuantity ??
    0,
  ));
  const actualUnitCostToDate =
    producedNow > 0 ? Number(workOrder.actualCost || 0) / producedNow : null;
  const remainingQty = Math.max(Number(workOrder.quantity || 0) - producedNow, 0);

  const reports = workOrder.id ? (data.reportsByWorkOrderId[workOrder.id] || []) : [];
  const reportsWithWorkers = reports.filter((r) => Number(r.workersCount || 0) > 0);
  const averageWorkers = reportsWithWorkers.length > 0
    ? reportsWithWorkers.reduce((sum, r) => sum + Number(r.workersCount || 0), 0) / reportsWithWorkers.length
    : null;

  const benchmarkDaily = Math.max(0, Number(product?.avgDailyProduction || 0));
  const estimatedWorkDays = benchmarkDaily > 0
    ? Math.ceil(Number(workOrder.quantity || 0) / benchmarkDaily)
    : null;
  const estimatedDailyCost = (
    benchmarkDaily > 0
    && Number(options.lineDailyWorkingHours || 0) > 0
    && Number(options.hourlyRate || 0) > 0
  )
    ? estimateReportCost(
      Number(workOrder.maxWorkers || 0),
      Number(options.lineDailyWorkingHours || 0),
      benchmarkDaily,
      Number(options.hourlyRate || 0),
      Number(options.supervisorHourlyRate || options.hourlyRate || 0),
      workOrder.lineId,
      options.reportDate,
      options.costCenters || [],
      options.costCenterValues || [],
      options.costAllocations || [],
    ).totalCost
    : null;
  const estimatedTotalCost = (
    estimatedDailyCost !== null && estimatedWorkDays !== null
      ? estimatedDailyCost * estimatedWorkDays
      : null
  );
  const estimatedUnitCost = (
    estimatedTotalCost !== null && Number(workOrder.quantity || 0) > 0
      ? estimatedTotalCost / Number(workOrder.quantity || 0)
      : (workOrder.quantity > 0 ? Number(workOrder.estimatedCost || 0) / Number(workOrder.quantity) : null)
  );
  const remainingDaysByBenchmark = benchmarkDaily > 0
    ? remainingQty / benchmarkDaily
    : null;
  const estimatedRemainingCost = estimatedUnitCost !== null
    ? remainingQty * estimatedUnitCost
    : null;

  return {
    estimatedUnitCost,
    estimatedDailyCost,
    estimatedTotalCost,
    estimatedWorkDays,
    actualUnitCostToDate,
    averageWorkers,
    remainingQty,
    remainingDaysByBenchmark,
    estimatedRemainingCost,
  };
}
