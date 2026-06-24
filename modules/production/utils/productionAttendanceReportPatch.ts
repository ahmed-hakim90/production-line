import type {
  ProductionAttendanceRecord,
  ProductionReport,
  ProductionReportWorkerOutput,
  ProductionShiftWorkerSnapshot,
} from '../../../types';
import { countPresentShiftWorkers } from './productionShiftLifecycle';

const cleanText = (value: unknown): string => String(value || '').trim();

export function countPresentWorkerOutputs(
  workerOutputs: Pick<ProductionReportWorkerOutput, 'isPresent'>[],
): number {
  return workerOutputs.reduce((sum, worker) => (
    worker.isPresent === false ? sum : sum + 1
  ), 0);
}

export function summarizeWorkerOutputPresence(
  workerOutputs: Pick<ProductionReportWorkerOutput, 'isPresent'>[],
): Pick<ProductionReport, 'presentAssignments' | 'absentAssignments'> {
  return workerOutputs.reduce(
    (summary, worker) => {
      if (worker.isPresent === false) summary.absentAssignments += 1;
      else summary.presentAssignments += 1;
      return summary;
    },
    { presentAssignments: 0, absentAssignments: 0 },
  );
}

export function buildProductionAttendanceReportStatusPatch(
  report: ProductionReport,
  record: ProductionAttendanceRecord,
  status: ProductionAttendanceRecord['status'],
): Partial<ProductionReport> | null {
  const isPresent = status === 'present';

  if (record.source === 'shift_workers') {
    const employeeId = cleanText(record.employeeId);
    if (!employeeId) return null;

    let matched = false;
    const shiftWorkers: ProductionShiftWorkerSnapshot[] = (report.shiftWorkers || []).map((worker) => {
      if (cleanText(worker.employeeId) !== employeeId) return worker;
      matched = true;
      return { ...worker, isPresent };
    });

    if (!matched) return null;
    return {
      shiftWorkers,
      ...countPresentShiftWorkers(shiftWorkers),
    };
  }

  const workerId = cleanText(record.workerId);
  if (!workerId) return null;

  let matched = false;
  const workerOutputs: ProductionReportWorkerOutput[] = (report.workerOutputs || []).map((worker) => {
    if (cleanText(worker.workerId) !== workerId) return worker;
    matched = true;
    return { ...worker, isPresent };
  });

  if (!matched) return null;
  return {
    workerOutputs,
    workersCount: countPresentWorkerOutputs(workerOutputs),
    ...summarizeWorkerOutputPresence(workerOutputs),
  };
}
