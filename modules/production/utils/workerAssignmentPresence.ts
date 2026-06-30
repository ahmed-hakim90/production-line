import type { LineWorkerAssignment, ProductionReport, ProductionWorker } from '@/types';
import {
  LINE_WORKER_LABOR_ROLE_LABELS,
  isProductionLaborRole,
  resolveLineWorkerLaborRole,
} from './lineWorkerLaborRoles';

export type WorkerAssignmentInfo = {
  workerName: string;
  workerCode: string;
  laborRoleLabels: Set<string>;
  lineLabels: Set<string>;
  presentDays: number;
  absentDays: number;
  noTargetDays: number;
  hasProductionTarget: boolean;
};

export const monthRange = (month: string): { start: string; end: string } => {
  const [year, rawMonth] = month.split('-').map(Number);
  const lastDay = new Date(year, rawMonth, 0).getDate();
  const mm = String(rawMonth).padStart(2, '0');
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
};

export const listDatesInRange = (start: string, end: string): string[] => {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  while (cursor <= endDate) {
    dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

export const buildAssignmentInfoByWorker = (
  assignments: LineWorkerAssignment[],
  workers: ProductionWorker[],
  reports: ProductionReport[],
  getLineName: (lineId?: string) => string,
): Map<string, WorkerAssignmentInfo> => {
  const workerByEmployeeId = new Map(
    workers
      .filter((worker) => worker.employeeId)
      .map((worker) => [worker.employeeId!, worker]),
  );
  const assignmentInfoByWorkerId = new Map<string, WorkerAssignmentInfo>();
  const dayPresenceByWorkerId = new Map<string, Map<string, {
    hasPresent: boolean;
    hasAbsent: boolean;
    hasTarget: boolean;
    hasNoTargetCandidate: boolean;
  }>>();

  assignments.forEach((assignment) => {
    const worker = workerByEmployeeId.get(assignment.employeeId);
    const workerId = worker?.id;
    const workerKey = workerId || `employee:${assignment.employeeId || assignment.id || assignment.employeeName}`;
    const role = resolveLineWorkerLaborRole(assignment.laborRole);
    const isPresent = assignment.isPresent !== false;
    const hasTargetOutput = Boolean(workerId) && reports.some((report) => (
      report.date === assignment.date
      && report.lineId === assignment.lineId
      && (report.workerOutputs ?? []).some((row) => (
        row.workerId === workerId
        && row.isPresent !== false
        && Number(row.dailyTargetQty || 0) > 0
      ))
    ));
    const noTarget = isPresent && (!isProductionLaborRole(role) || !hasTargetOutput);
    const current = assignmentInfoByWorkerId.get(workerKey) ?? {
      workerName: worker?.name || assignment.employeeName || assignment.employeeId || '—',
      workerCode: worker?.code || assignment.employeeCode || '',
      laborRoleLabels: new Set<string>(),
      lineLabels: new Set<string>(),
      presentDays: 0,
      absentDays: 0,
      noTargetDays: 0,
      hasProductionTarget: false,
    };
    current.workerName = current.workerName || worker?.name || assignment.employeeName || '—';
    current.workerCode = current.workerCode || worker?.code || assignment.employeeCode || '';
    current.laborRoleLabels.add(LINE_WORKER_LABOR_ROLE_LABELS[role]);
    current.lineLabels.add(getLineName(assignment.lineId));
    current.hasProductionTarget = current.hasProductionTarget || hasTargetOutput;
    assignmentInfoByWorkerId.set(workerKey, current);

    const workerDays = dayPresenceByWorkerId.get(workerKey) ?? new Map();
    const dateKey = assignment.date || assignment.id || `${workerKey}:${workerDays.size}`;
    const day = workerDays.get(dateKey) ?? {
      hasPresent: false,
      hasAbsent: false,
      hasTarget: false,
      hasNoTargetCandidate: false,
    };
    if (isPresent) day.hasPresent = true;
    else day.hasAbsent = true;
    day.hasTarget = day.hasTarget || hasTargetOutput;
    day.hasNoTargetCandidate = day.hasNoTargetCandidate || noTarget;
    workerDays.set(dateKey, day);
    dayPresenceByWorkerId.set(workerKey, workerDays);
  });

  dayPresenceByWorkerId.forEach((workerDays, workerKey) => {
    const current = assignmentInfoByWorkerId.get(workerKey);
    if (!current) return;
    workerDays.forEach((day) => {
      if (day.hasPresent) {
        current.presentDays += 1;
        if (!day.hasTarget && day.hasNoTargetCandidate) current.noTargetDays += 1;
      } else if (day.hasAbsent) {
        current.absentDays += 1;
      }
    });
  });

  return assignmentInfoByWorkerId;
};
