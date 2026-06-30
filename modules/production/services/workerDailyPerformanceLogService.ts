import {
  deleteDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { isConfigured } from '@/services/firebase';
import { getCurrentTenantId } from '@/lib/currentTenant';
import type {
  ProductionReport,
  WorkerDailyAchievementStatus,
  WorkerDailyPerformanceLog,
} from '@/types';
import {
  workerDailyPerformanceLogDocRef,
  workerDailyPerformanceLogsRef,
} from '../collections';
import { computeAchievementPercent } from '../selectors/workerTargetSelector';

const eqTenant = () => where('tenantId', '==', getCurrentTenantId());

const stripUndefined = <T extends Record<string, unknown>>(obj: T) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

const resolveLogStatus = (
  targetQty: number,
  outputQty: number,
  isPresent: boolean,
): WorkerDailyAchievementStatus => {
  if (!isPresent) return 'absent';
  if (targetQty <= 0) return 'no_target';
  if (outputQty <= 0) return 'no_output';
  const pct = computeAchievementPercent(outputQty, targetQty);
  if (pct > 100) return 'over_target';
  if (pct >= 100) return 'achieved';
  return 'below_target';
};

const mapDoc = (id: string, data: Record<string, unknown>): WorkerDailyPerformanceLog => ({
  id,
  ...(data as WorkerDailyPerformanceLog),
});

export const workerDailyPerformanceLogService = {
  async getByDateRange(start: string, end: string): Promise<WorkerDailyPerformanceLog[]> {
    if (!isConfigured || !start || !end) return [];
    try {
      const snap = await getDocs(
        query(
          workerDailyPerformanceLogsRef(),
          eqTenant(),
          where('date', '>=', start),
          where('date', '<=', end),
        ),
      );
      return snap.docs.map((d) => mapDoc(d.id, d.data()));
    } catch (error) {
      console.error('workerDailyPerformanceLogService.getByDateRange error:', error);
      return [];
    }
  },

  async getByWorkerAndDateRange(
    workerId: string,
    start: string,
    end: string,
  ): Promise<WorkerDailyPerformanceLog[]> {
    if (!isConfigured || !workerId) return [];
    const snap = await getDocs(
      query(
        workerDailyPerformanceLogsRef(),
        eqTenant(),
        where('workerId', '==', workerId),
        where('date', '>=', start),
        where('date', '<=', end),
      ),
    );
    return snap.docs.map((d) => mapDoc(d.id, d.data()));
  },

  async getByWorkerAndDate(workerId: string, date: string): Promise<WorkerDailyPerformanceLog[]> {
    if (!isConfigured || !workerId || !date) return [];
    try {
      const snap = await getDocs(
        query(
          workerDailyPerformanceLogsRef(),
          eqTenant(),
          where('workerId', '==', workerId),
          where('date', '==', date),
        ),
      );
      return snap.docs.map((d) => mapDoc(d.id, d.data()));
    } catch (error) {
      console.error('workerDailyPerformanceLogService.getByWorkerAndDate error:', error);
      return [];
    }
  },

  async removeByReportId(reportId: string): Promise<void> {
    if (!isConfigured || !reportId) return;
    const snap = await getDocs(
      query(workerDailyPerformanceLogsRef(), eqTenant(), where('reportId', '==', reportId)),
    );
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  },

  async syncFromReport(
    reportId: string,
    report: Pick<
      ProductionReport,
      'date' | 'workerTargetsApplied' | 'workerOutputs' | 'reportCode'
    >,
    workerMeta?: Map<string, { code?: string; employeeId?: string }>,
  ): Promise<string[]> {
    if (!isConfigured || !reportId) return [];
    await this.removeByReportId(reportId);

    if (!report.workerOutputs?.length) {
      return [];
    }

    const tenantId = getCurrentTenantId();
    const touchedWorkerIds = new Set<string>();

    await Promise.all(
      report.workerOutputs.map(async (row) => {
        if (!row.workerId) return;
        const isPresent = row.isPresent ?? true;
        const outputQty = isPresent ? Number(row.outputQty || 0) : 0;
        const targetQty = Number(row.dailyTargetQty || 0);
        const meta = workerMeta?.get(row.workerId);
        const payload: WorkerDailyPerformanceLog = {
          tenantId,
          reportId,
          reportCode: report.reportCode,
          workerId: row.workerId,
          workerName: row.workerName,
          workerCode: meta?.code,
          employeeId: meta?.employeeId,
          date: report.date,
          lineId: row.lineId,
          lineName: row.lineName,
          productId: row.productId,
          productName: row.productName,
          targetQty,
          outputQty,
          achievementPercent: computeAchievementPercent(outputQty, targetQty),
          isPresent,
          status: resolveLogStatus(targetQty, outputQty, isPresent),
        };
        await setDoc(workerDailyPerformanceLogDocRef(reportId, row.workerId), stripUndefined({
          ...payload,
          id: `${reportId}_${row.workerId}`,
          updatedAt: serverTimestamp(),
        }));
        touchedWorkerIds.add(row.workerId);
      }),
    );

    return Array.from(touchedWorkerIds);
  },
};
