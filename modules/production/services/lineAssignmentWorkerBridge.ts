import type { LineWorkerAssignment, LineWorkerLaborRole } from '@/types';
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

  /**
   * Resolves production workers for a line on a date.
   * Daily line assignments are the primary source; permanent line-worker links are a fallback.
   */
  async resolveWorkersForLineDate(lineId: string, date: string): Promise<ResolvedLineWorker[]> {
    if (!lineId || !date) return [];

    const daily = await lineAssignmentService.getByLineAndDate(lineId, date);
    if (daily.length > 0) {
      const resolved: ResolvedLineWorker[] = [];
      for (const row of daily) {
        if (!row.employeeId) continue;
        const workerId = await this.syncFromLineAssignment(row);
        if (!workerId) continue;
        resolved.push({
          workerId,
          employeeId: row.employeeId,
          employeeName: row.employeeName || row.employeeId,
          laborRole: row.laborRole || DEFAULT_LINE_WORKER_LABOR_ROLE,
          source: 'daily',
        });
      }
      return dedupeByWorkerId(resolved);
    }

    const permanent = await productionLineWorkerAssignmentService.getActiveByLineAndDate(lineId, date);
    return dedupeByWorkerId(
      permanent.map((row) => ({
        workerId: row.workerId,
        employeeId: '',
        employeeName: '',
        laborRole: DEFAULT_LINE_WORKER_LABOR_ROLE,
        source: 'permanent' as const,
      })),
    );
  },

  async resolveWorkerIdsForReport(lineId: string, date: string): Promise<{ workerId: string }[]> {
    const allResolved = await this.resolveWorkersForLineDate(lineId, date);
    const resolved = filterProductionLaborWorkers<ResolvedLineWorker>(allResolved);
    return resolved.map((row) => ({ workerId: row.workerId }));
  },
};
