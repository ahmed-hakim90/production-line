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
