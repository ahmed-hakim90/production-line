import type { ProductionLineWorkerAssignment, ProductionWorker } from '@/types';

export type WorkerLineTransferPlan = {
  assignmentsToClose: ProductionLineWorkerAssignment[];
  shouldCreateTargetAssignment: boolean;
  nextLineIds: string[];
  nextDefaultLineId: string;
  closeEndDate: string;
};

export type BulkWorkerLineTransferPlan<TWorker> = {
  worker: TWorker;
  plan: WorkerLineTransferPlan;
};

export const getWorkersEligibleForLineTransfer = <
  TWorker extends { assignedLineIds?: string[] },
>(
  workers: TWorker[],
  targetLineId: string,
): TWorker[] => {
  const target = targetLineId.trim();
  if (!target) return [];
  return workers.filter((worker) => !(worker.assignedLineIds || []).includes(target));
};

export const isProductionWorkerAssignmentActiveOnDate = (
  row: ProductionLineWorkerAssignment,
  date: string,
): boolean => {
  if (!row.isActive) return false;
  if (row.startDate > date) return false;
  if (row.endDate && row.endDate < date) return false;
  return true;
};

export const getPreviousDateString = (date: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const [, year, month, day] = match;
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export const buildWorkerLineTransferPlan = ({
  worker,
  assignments,
  targetLineId,
  transferDate,
}: {
  worker: Pick<ProductionWorker, 'id' | 'lineIds' | 'defaultLineId'>;
  assignments: ProductionLineWorkerAssignment[];
  targetLineId: string;
  transferDate: string;
}): WorkerLineTransferPlan => {
  const workerId = String(worker.id || '').trim();
  const target = targetLineId.trim();
  const activeAssignments = assignments.filter((row) => (
    row.workerId === workerId && isProductionWorkerAssignmentActiveOnDate(row, transferDate)
  ));
  const keptTargetAssignment = activeAssignments.find((row) => row.lineId === target);

  return {
    assignmentsToClose: activeAssignments.filter((row) => row !== keptTargetAssignment),
    shouldCreateTargetAssignment: !keptTargetAssignment,
    nextLineIds: target ? [target] : [],
    nextDefaultLineId: target,
    closeEndDate: getPreviousDateString(transferDate),
  };
};

export const buildBulkWorkerLineTransferPlans = <
  TWorker extends Pick<ProductionWorker, 'id' | 'lineIds' | 'defaultLineId'>,
>({
  workers,
  assignments,
  targetLineId,
  transferDate,
}: {
  workers: TWorker[];
  assignments: ProductionLineWorkerAssignment[];
  targetLineId: string;
  transferDate: string;
}): BulkWorkerLineTransferPlan<TWorker>[] => (
  workers
    .filter((worker) => Boolean(String(worker.id || '').trim()))
    .map((worker) => ({
      worker,
      plan: buildWorkerLineTransferPlan({
        worker,
        assignments,
        targetLineId,
        transferDate,
      }),
    }))
);
