import type { ProductionReport } from '../../../types';

export type WorkerPresenceRow = {
  workerId?: string;
  date?: string;
  isPresent?: boolean;
};

export type WorkerPresenceSummary = {
  total: number;
  present: number;
  absent: number;
};

export type WorkerPresenceDaySummary = WorkerPresenceSummary & {
  totalDays: number;
  presentDays: number;
  absentDays: number;
};

export const isWorkerPresent = (row: Pick<WorkerPresenceRow, 'isPresent'>): boolean => row.isPresent !== false;

export function summarizeWorkerPresenceRows(rows: WorkerPresenceRow[] = []): WorkerPresenceSummary {
  return rows.reduce(
    (acc, row) => {
      acc.total += 1;
      if (isWorkerPresent(row)) acc.present += 1;
      else acc.absent += 1;
      return acc;
    },
    { total: 0, present: 0, absent: 0 },
  );
}

export function summarizeWorkerPresenceByWorker(rows: WorkerPresenceRow[] = []): Map<string, WorkerPresenceSummary> {
  const byWorker = new Map<string, WorkerPresenceSummary>();
  rows.forEach((row) => {
    const workerId = String(row.workerId || '').trim();
    if (!workerId) return;
    const current = byWorker.get(workerId) ?? { total: 0, present: 0, absent: 0 };
    current.total += 1;
    if (isWorkerPresent(row)) current.present += 1;
    else current.absent += 1;
    byWorker.set(workerId, current);
  });
  return byWorker;
}

export function summarizeWorkerPresenceDays(rows: WorkerPresenceRow[] = []): WorkerPresenceDaySummary {
  const byWorkerDate = new Map<string, { hasPresent: boolean; hasAbsent: boolean }>();

  rows.forEach((row, index) => {
    const workerId = String(row.workerId || '').trim() || '__worker__';
    const date = String(row.date || '').trim() || `__row_${index}`;
    const key = `${workerId}::${date}`;
    const current = byWorkerDate.get(key) ?? { hasPresent: false, hasAbsent: false };
    if (isWorkerPresent(row)) current.hasPresent = true;
    else current.hasAbsent = true;
    byWorkerDate.set(key, current);
  });

  let presentDays = 0;
  let absentDays = 0;
  byWorkerDate.forEach((day) => {
    if (day.hasPresent) presentDays += 1;
    else if (day.hasAbsent) absentDays += 1;
  });

  return {
    total: presentDays + absentDays,
    present: presentDays,
    absent: absentDays,
    totalDays: presentDays + absentDays,
    presentDays,
    absentDays,
  };
}

export function summarizeWorkerPresenceDaysByWorker(rows: WorkerPresenceRow[] = []): Map<string, WorkerPresenceDaySummary> {
  const byWorkerRows = new Map<string, WorkerPresenceRow[]>();

  rows.forEach((row) => {
    const workerId = String(row.workerId || '').trim();
    if (!workerId) return;
    byWorkerRows.set(workerId, [...(byWorkerRows.get(workerId) ?? []), row]);
  });

  return new Map(Array.from(byWorkerRows.entries()).map(([workerId, workerRows]) => [
    workerId,
    summarizeWorkerPresenceDays(workerRows),
  ]));
}

export function buildWorkerPresenceRowsFromReports(
  reports: Pick<ProductionReport, 'date' | 'workerOutputs' | 'shiftWorkers'>[],
  workerId: string,
  employeeId?: string,
  date?: string,
): WorkerPresenceRow[] {
  return reports.flatMap((report) => {
    if (date && report.date !== date) return [];
    const outputRows = (report.workerOutputs ?? [])
      .filter((line) => line.workerId === workerId)
      .map((line) => ({ workerId: line.workerId, date: report.date, isPresent: line.isPresent }));
    const shiftRows = employeeId
      ? (report.shiftWorkers ?? [])
        .filter((line) => line.employeeId === employeeId)
        .map((line) => ({ workerId, date: report.date, isPresent: line.isPresent }))
      : [];
    return [...outputRows, ...shiftRows];
  });
}

export const getPresenceLabel = (isPresent: boolean): string => (isPresent ? 'حاضر' : 'غائب');
