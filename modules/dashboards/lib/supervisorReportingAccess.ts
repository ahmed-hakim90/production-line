import type { FirestoreEmployee, ProductionReport, WorkOrder } from '@/types';

export function firstTwoSupervisorNames(value: string): string {
  const names = String(value || '').trim().split(/\s+/).filter(Boolean);
  return names.slice(0, 2).join(' ') || '—';
}

export function filterActiveWorkOrdersForReporter(
  workOrders: WorkOrder[],
  employee: FirestoreEmployee | null | undefined,
  canCreateForAnySupervisor: boolean,
): WorkOrder[] {
  if (!employee?.id) return [];
  const legacyEmployeeName = String(employee.name || '').trim().toLowerCase();
  return workOrders.filter((workOrder) => {
    if (!['pending', 'in_progress', 'paused'].includes(workOrder.status)) return false;
    if (canCreateForAnySupervisor) return true;
    if (workOrder.supervisorId === employee.id) return true;
    return String(workOrder.supervisorId || '').trim().toLowerCase() === legacyEmployeeName;
  });
}

export function reportWasEnteredByActor(
  report: ProductionReport,
  actorUid: string | null | undefined,
  actorEmployeeId: string | null | undefined,
  canCreateForAnySupervisor: boolean,
): boolean {
  const employeeId = String(actorEmployeeId || '').trim();
  if (!employeeId) return false;
  if (!canCreateForAnySupervisor) return report.employeeId === employeeId;
  const uid = String(actorUid || '').trim();
  return report.createdByUid === uid || (!report.createdByUid && report.employeeId === employeeId);
}

export type WorkOrderTodayReportState = {
  state: 'saved' | 'saving' | 'failed';
  reportId?: string;
};

/** One work order accepts one daily report; confirmed rows win over local queue rows. */
export function indexTodayReportStateByWorkOrder(
  reports: ProductionReport[],
): Map<string, WorkOrderTodayReportState> {
  const priority = { failed: 1, saving: 2, saved: 3 } as const;
  const result = new Map<string, WorkOrderTodayReportState>();
  for (const report of reports) {
    const workOrderId = String(report.workOrderId || '').trim();
    if (!workOrderId || report.lifecycleStatus === 'open') continue;
    const state: WorkOrderTodayReportState['state'] = report.clientSaveState || 'saved';
    const previous = result.get(workOrderId);
    if (previous && priority[previous.state] >= priority[state]) continue;
    result.set(workOrderId, { state, reportId: report.id });
  }
  return result;
}

/** Keep unfinished work at the top; confirmed daily reports move to the bottom. */
export function sortWorkOrdersByTodayReportState(
  workOrders: WorkOrder[],
  states: Map<string, WorkOrderTodayReportState>,
): WorkOrder[] {
  const priority = (workOrder: WorkOrder): number => {
    const state = workOrder.id ? states.get(workOrder.id)?.state : undefined;
    if (state === 'saved') return 2;
    if (state === 'saving') return 1;
    return 0;
  };
  return workOrders
    .map((workOrder, index) => ({ workOrder, index }))
    .sort((left, right) => (
      priority(left.workOrder) - priority(right.workOrder)
      || left.index - right.index
    ))
    .map(({ workOrder }) => workOrder);
}
