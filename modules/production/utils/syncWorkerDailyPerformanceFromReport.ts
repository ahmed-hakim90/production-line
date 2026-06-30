import type { ProductionReport } from '@/types';
import { productionWorkerService } from '../services/productionWorkerService';
import { workerDailyPerformanceLogService } from '../services/workerDailyPerformanceLogService';
import { productionWorkerPerformanceService } from '../services/productionWorkerPerformanceService';

/** Persist per-worker daily target/output snapshot after report save. */
export async function syncWorkerDailyPerformanceFromReport(
  reportId: string,
  report: ProductionReport,
): Promise<void> {
  const workerIds = (report.workerOutputs ?? []).map((row) => row.workerId).filter(Boolean);
  const workers = workerIds.length > 0 ? await productionWorkerService.getAll() : [];
  const workerMeta = new Map(
    workers
      .filter((worker) => worker.id && workerIds.includes(worker.id))
      .map((worker) => [worker.id!, { code: worker.code, employeeId: worker.employeeId }]),
  );

  const touchedWorkerIds = await workerDailyPerformanceLogService.syncFromReport(
    reportId,
    report,
    workerMeta,
  );

  if (touchedWorkerIds.length === 0) return;

  const month = String(report.date || '').slice(0, 7);
  if (!month) return;

  await Promise.all(
    touchedWorkerIds.map((workerId) =>
      productionWorkerPerformanceService.getMonthlyAchievement(workerId, month, {
        persistSummary: true,
      }).catch(() => undefined),
    ),
  );
}

export async function removeWorkerDailyPerformanceForReport(reportId: string): Promise<void> {
  await workerDailyPerformanceLogService.removeByReportId(reportId);
}
