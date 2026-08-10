import type { WorkOrder } from '@/types';
import { buildWorkersCountAutoFill, type WorkersCountAutoFillPatch } from './lineAssignmentWorkersCount';

export type WorkOrderReportPrefill = {
  workOrderId: string;
  lineId: string;
  productId: string;
  employeeId: string;
  reportType: 'finished_product' | 'component_injection';
  /** Suggested remaining qty (hint only — not auto-written as today's produced). */
  remainingQuantity: number;
  /** Planned / actual hours from the work order when available. */
  workHours: number | null;
  /** Planned / actual headcount when labor is not role-distributed on the line. */
  workersCount: number | null;
  workersPatch: WorkersCountAutoFillPatch;
};

function positiveOrNull(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Build report form defaults from a work order master record.
 * Quantity produced for the day stays empty for the operator to enter.
 */
export function buildReportPrefillFromWorkOrder(
  wo: Pick<
    WorkOrder,
    | 'id'
    | 'lineId'
    | 'productId'
    | 'supervisorId'
    | 'quantity'
    | 'producedQuantity'
    | 'workOrderType'
    | 'workHours'
    | 'actualWorkHours'
    | 'maxWorkers'
    | 'actualWorkersCount'
  >,
  options?: { isPackagingLine?: boolean },
): WorkOrderReportPrefill | null {
  const workOrderId = String(wo.id || '').trim();
  const lineId = String(wo.lineId || '').trim();
  const productId = String(wo.productId || '').trim();
  const employeeId = String(wo.supervisorId || '').trim();
  if (!workOrderId || !lineId || !productId || !employeeId) return null;

  const reportType: WorkOrderReportPrefill['reportType'] =
    wo.workOrderType === 'component_injection' ? 'component_injection' : 'finished_product';

  const remainingQuantity = Math.max(
    0,
    Number(wo.quantity || 0) - Number(wo.producedQuantity || 0),
  );

  const workHours =
    positiveOrNull(wo.actualWorkHours)
    ?? positiveOrNull(wo.workHours);

  const workersCount =
    positiveOrNull(wo.actualWorkersCount)
    ?? positiveOrNull(wo.maxWorkers);

  const workersPatch = workersCount
    ? buildWorkersCountAutoFill(workersCount, {
      reportType,
      isPackagingLine: Boolean(options?.isPackagingLine),
    })
    : {};

  return {
    workOrderId,
    lineId,
    productId,
    employeeId,
    reportType,
    remainingQuantity,
    workHours,
    workersCount,
    workersPatch,
  };
}

/** True when line assignments already provide a distributed labor breakdown. */
export function hasDistributedLineLabor(
  assignmentCount: number,
): boolean {
  return assignmentCount > 0;
}
