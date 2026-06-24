import type {
  LineWorkerAssignment,
  LineWorkerLaborRole,
  ProductionReport,
  ProductionShiftWorkerSnapshot,
} from '@/types';
import { resolveLineWorkerLaborRole } from './lineWorkerLaborRoles';

export type ShiftStartContext = 'plan' | 'general';

const PRESENT_ROLE_KEYS: Record<LineWorkerLaborRole, keyof Pick<
  ProductionReport,
  | 'workersProductionCount'
  | 'workersPackagingCount'
  | 'workersQualityCount'
  | 'workersMaintenanceCount'
  | 'workersExternalCount'
>> = {
  production: 'workersProductionCount',
  packaging: 'workersPackagingCount',
  quality: 'workersQualityCount',
  maintenance: 'workersMaintenanceCount',
  external: 'workersExternalCount',
};

export function countPresentShiftWorkers(workers: ProductionShiftWorkerSnapshot[]): Pick<
  ProductionReport,
  | 'workersCount'
  | 'workersProductionCount'
  | 'workersPackagingCount'
  | 'workersQualityCount'
  | 'workersMaintenanceCount'
  | 'workersExternalCount'
> {
  const counts = {
    workersCount: 0,
    workersProductionCount: 0,
    workersPackagingCount: 0,
    workersQualityCount: 0,
    workersMaintenanceCount: 0,
    workersExternalCount: 0,
  };

  workers.forEach((worker) => {
    if (worker.isPresent === false) return;
    counts.workersCount += 1;
    counts[PRESENT_ROLE_KEYS[resolveLineWorkerLaborRole(worker.laborRole)]] += 1;
  });

  return counts;
}

export function mapLineAssignmentsToShiftWorkers(
  assignments: LineWorkerAssignment[],
): ProductionShiftWorkerSnapshot[] {
  return assignments
    .filter((assignment) => String(assignment.employeeId || '').trim())
    .map((assignment) => ({
      employeeId: String(assignment.employeeId || '').trim(),
      employeeCode: String(assignment.employeeCode || '').trim() || undefined,
      employeeName: String(assignment.employeeName || assignment.employeeId || '').trim(),
      laborRole: resolveLineWorkerLaborRole(assignment.laborRole),
      isPresent: assignment.isPresent ?? true,
    }));
}

export function findOpenProductionShift(
  reports: ProductionReport[],
  criteria: { lineId: string; planId?: string; productId?: string },
): ProductionReport | null {
  const lineId = String(criteria.lineId || '').trim();
  const planId = String(criteria.planId || '').trim();
  const productId = String(criteria.productId || '').trim();
  if (!lineId) return null;

  return reports.find((report) => {
    if (report.lifecycleStatus !== 'open') return false;
    if (report.lineId !== lineId) return false;
    if (planId) return report.productionPlanId === planId;
    if (productId) return report.productId === productId;
    return true;
  }) ?? null;
}

export function buildShiftClosePayload(
  shift: Pick<ProductionReport, 'shiftStartedAt' | 'shiftWorkers'>,
  input: {
    quantityProduced: number;
    notes?: string;
    closedByUid?: string | null;
    closedAtIso?: string;
    workHours?: number;
  },
): Partial<ProductionReport> {
  const closedAtIso = input.closedAtIso || new Date().toISOString();
  const startedMs = shift.shiftStartedAt ? new Date(shift.shiftStartedAt).getTime() : Number.NaN;
  const closedMs = new Date(closedAtIso).getTime();
  const derivedHours = Number.isFinite(startedMs) && Number.isFinite(closedMs) && closedMs > startedMs
    ? Number(((closedMs - startedMs) / 3_600_000).toFixed(2))
    : 0;
  const workers = shift.shiftWorkers || [];

  return {
    lifecycleStatus: 'closed',
    shiftClosedAt: closedAtIso,
    shiftClosedByUid: input.closedByUid || undefined,
    quantityProduced: Number(input.quantityProduced || 0),
    workHours: Number(input.workHours || 0) > 0 ? Number(input.workHours) : derivedHours,
    notes: String(input.notes || '').trim(),
    ...countPresentShiftWorkers(workers),
  };
}
