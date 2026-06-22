import type { LineWorkerAssignment, LineWorkerLaborRole, ProductionWorker } from '@/types';
import { lineAssignmentService } from './lineAssignmentService';
import { productionLineWorkerAssignmentService } from './productionLineWorkerAssignmentService';
import { productionWorkerService, type LinkEmployeeInput } from './productionWorkerService';
import { DEFAULT_LINE_WORKER_LABOR_ROLE, filterProductionLaborWorkers } from '../utils/lineWorkerLaborRoles';

export type {
  WorkersCountAutoFillPatch,
  WorkersCountAutoFillTarget,
} from '../utils/lineAssignmentWorkersCount';
export {
  buildWorkersCountAutoFill,
  buildWorkersCountAutoFillFromAssignments,
  countLaborRolesFromAssignments,
  countOperatorsFromAssignments,
  shouldApplyWorkersCountAutoFill,
  sumWorkersCountPatch,
} from '../utils/lineAssignmentWorkersCount';

export type ResolvedLineWorker = {
  workerId: string;
  employeeId: string;
  employeeName: string;
  laborRole: LineWorkerLaborRole;
  isPresent: boolean;
  source: 'daily' | 'permanent';
};

const dedupeByWorkerId = (rows: ResolvedLineWorker[]): ResolvedLineWorker[] => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.workerId)) return false;
    seen.add(row.workerId);
    return true;
  });
};

const resolvePermanentRows = (
  lineId: string,
  daily: LineWorkerAssignment[],
  workersById: Map<string, ProductionWorker>,
  permanent: Awaited<ReturnType<typeof productionLineWorkerAssignmentService.getActiveByLineAndDate>>,
): ResolvedLineWorker[] => {
  const dailyByEmployeeId = new Map(
    daily
      .filter((row) => row.lineId === lineId && row.employeeId)
      .map((row) => [row.employeeId, row]),
  );

  return permanent
    .map((row): ResolvedLineWorker | null => {
      const worker = workersById.get(row.workerId);
      if (!worker || worker.isActive === false) return null;
      const employeeId = String(worker.employeeId || '').trim();
      const dailyRow = employeeId ? dailyByEmployeeId.get(employeeId) : undefined;

      return {
        workerId: row.workerId,
        employeeId,
        employeeName: worker.name,
        laborRole: dailyRow?.laborRole || DEFAULT_LINE_WORKER_LABOR_ROLE,
        isPresent: dailyRow?.isPresent ?? true,
        source: 'permanent',
      };
    })
    .filter((row): row is ResolvedLineWorker => Boolean(row));
};

export const lineAssignmentWorkerBridge = {
  async ensureProductionWorkerForEmployee(input: LinkEmployeeInput): Promise<string | null> {
    const id = await productionWorkerService.linkEmployee(input);
    return id || null;
  },

  async syncFromLineAssignment(
    assignment: Pick<LineWorkerAssignment, 'employeeId' | 'employeeName' | 'employeeCode' | 'lineId'>,
  ): Promise<string | null> {
    if (!assignment.employeeId) return null;
    return this.ensureProductionWorkerForEmployee({
      employeeId: assignment.employeeId,
      name: assignment.employeeName || assignment.employeeId,
      code: assignment.employeeCode,
      defaultLineId: assignment.lineId,
    });
  },

  /** Resolves permanent line workers with daily attendance/status overlay. */
  async resolveWorkersForLineDate(lineId: string, date: string): Promise<ResolvedLineWorker[]> {
    if (!lineId || !date) return [];

    const [daily, permanent, workers] = await Promise.all([
      lineAssignmentService.getByDate(date),
      productionLineWorkerAssignmentService.getActiveByLineAndDate(lineId, date),
      productionWorkerService.getAll(),
    ]);

    if (permanent.length > 0) {
      return dedupeByWorkerId(
        resolvePermanentRows(
          lineId,
          daily,
          new Map(workers.map((worker) => [String(worker.id || ''), worker])),
          permanent,
        ),
      );
    }

    const legacyDaily = await lineAssignmentService.getByLineAndDate(lineId, date);
    if (legacyDaily.length > 0) {
      const resolved: ResolvedLineWorker[] = [];
      for (const row of legacyDaily) {
        if (!row.employeeId) continue;
        const workerId = await this.syncFromLineAssignment(row);
        if (!workerId) continue;
        resolved.push({
          workerId,
          employeeId: row.employeeId,
          employeeName: row.employeeName || row.employeeId,
          laborRole: row.laborRole || DEFAULT_LINE_WORKER_LABOR_ROLE,
          isPresent: row.isPresent ?? true,
          source: 'daily',
        });
      }
      return dedupeByWorkerId(resolved);
    }

    return [];
  },

  async resolveWorkerIdsForReport(lineId: string, date: string): Promise<{ workerId: string }[]> {
    const allResolved = await this.resolveWorkersForLineDate(lineId, date);
    const resolved = filterProductionLaborWorkers<ResolvedLineWorker>(allResolved);
    return resolved.map((row) => ({ workerId: row.workerId }));
  },
};
