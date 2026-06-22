import type {
  FirestoreProduct,
  LineProductConfig,
  ProductionReport,
  ProductionWorker,
  ProductionWorkerPerformanceSettings,
  ProductionWorkerSettings,
  ProductionWorkerTarget,
  WorkerDailyAchievement,
  WorkerDailyAchievementStatus,
  WorkerMonthlyAchievement,
} from '@/types';
import {
  DEFAULT_PRODUCTION_WORKER_SETTINGS,
} from '@/types';
import { attendanceProcessingService } from '@/modules/hr/attendance/services/attendanceProcessingService';
import { leaveRequestService } from '@/modules/hr/leaveService';
import { reportService } from './reportService';
import { productionWorkerService } from './productionWorkerService';
import { productionWorkerTargetService } from './productionWorkerTargetService';
import { workerPerformanceSummaryService } from './workerPerformanceSummaryService';
import {
  computeAchievementPercent,
  hasLineSpecificWorkerTarget,
  resolveReportWorkerTarget,
  resolveWorkerTarget,
} from '../selectors/workerTargetSelector';
import { calculateBonusEstimate, computePerformanceScore } from './productionBonusEngine';
import { summarizeWorkerPresenceDays } from '../utils/workerPresence';

const monthRange = (month: string): { start: string; end: string } => {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, '0');
  return {
    start: `${y}-${mm}-01`,
    end: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
};

const listDatesInRange = (start: string, end: string): string[] => {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  while (cursor <= endDate) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const resolveDailyStatus = (
  targetQty: number,
  outputQty: number,
  flags: { absent: boolean; leave: boolean },
): WorkerDailyAchievementStatus => {
  if (flags.leave) return 'leave';
  if (flags.absent) return 'absent';
  if (targetQty <= 0) return 'no_target';
  if (outputQty <= 0) return 'no_output';
  const pct = computeAchievementPercent(outputQty, targetQty);
  if (pct > 100) return 'over_target';
  if (pct >= 100) return 'achieved';
  return 'below_target';
};

function aggregateWorkerOutputsFromReports(
  reports: ProductionReport[],
  workerId: string,
  date?: string,
): number {
  let total = 0;
  for (const report of reports) {
    if (date && report.date !== date) continue;
    const lines = report.workerOutputs ?? [];
    for (const line of lines) {
      if (line.workerId === workerId && line.isPresent !== false) {
        total += Number(line.outputQty || 0);
      }
    }
  }
  return total;
}

function primaryLineProductForDay(
  reports: ProductionReport[],
  workerId: string,
  date: string,
): { lineId?: string; productId?: string } {
  for (const report of reports) {
    if (report.date !== date) continue;
    const match = (report.workerOutputs ?? []).find((o) => o.workerId === workerId);
    if (match) return { lineId: match.lineId, productId: match.productId };
  }
  return {};
}

function workerPresenceForReports(
  reports: ProductionReport[],
  workerId: string,
  date?: string,
) {
  const rows = reports.flatMap((report) => {
    if (date && report.date !== date) return [];
    return (report.workerOutputs ?? [])
      .filter((line) => line.workerId === workerId)
      .map((line) => ({ workerId: line.workerId, date: report.date, isPresent: line.isPresent }));
  });
  const summary = summarizeWorkerPresenceDays(rows);
  const isPresent = summary.total === 0 ? undefined : summary.present > 0;
  return {
    ...summary,
    isPresent,
    operationalAbsent: summary.total > 0 && summary.present === 0 && summary.absent > 0,
  };
}

export const productionWorkerPerformanceService = {
  resolveSettings(settings?: ProductionWorkerSettings | null): ProductionWorkerSettings {
    return {
      performance: {
        ...DEFAULT_PRODUCTION_WORKER_SETTINGS.performance,
        ...(settings?.performance ?? {}),
      },
      bonus: {
        ...DEFAULT_PRODUCTION_WORKER_SETTINGS.bonus,
        ...(settings?.bonus ?? {}),
      },
      supervisorBonus: {
        ...DEFAULT_PRODUCTION_WORKER_SETTINGS.supervisorBonus,
        ...(settings?.supervisorBonus ?? {}),
        tiers: settings?.supervisorBonus?.tiers?.length
          ? settings.supervisorBonus.tiers
          : DEFAULT_PRODUCTION_WORKER_SETTINGS.supervisorBonus.tiers,
      },
    };
  },

  async getDailyAchievement(
    workerId: string,
    date: string,
    context?: {
      worker?: ProductionWorker | null;
      targets?: ProductionWorkerTarget[];
      products?: FirestoreProduct[];
      reports?: ProductionReport[];
      settings?: ProductionWorkerSettings;
      lineProductConfigs?: LineProductConfig[];
    },
  ): Promise<WorkerDailyAchievement> {
    const worker = context?.worker ?? await productionWorkerService.getById(workerId);
    const targets = context?.targets ?? await productionWorkerTargetService.getByWorker(workerId);
    const reports = context?.reports
      ?? await reportService.getByDateRange(date, date);
    const outputQty = aggregateWorkerOutputsFromReports(reports, workerId, date);
    const { lineId, productId } = primaryLineProductForDay(reports, workerId, date);
    const presence = workerPresenceForReports(reports, workerId, date);
    const product = context?.products?.find((p) => p.id === productId) ?? null;
    const resolved = productId
      ? resolveWorkerTarget({
        workerId,
        productId,
        lineId,
        date,
        targets,
        product,
        lineProductConfigs: context?.lineProductConfigs,
      })
      : { dailyTargetQty: 0, source: 'missing' as const };
    const targetQty = presence.operationalAbsent ? 0 : resolved.dailyTargetQty;
    const achievementPercent = presence.operationalAbsent ? 0 : computeAchievementPercent(outputQty, targetQty);

    let absent = false;
    let leave = false;
    if (worker?.employeeId) {
      const [attendanceRecords, leaveRequests] = await Promise.all([
        attendanceProcessingService.getRecordsByEmployee(worker.employeeId),
        leaveRequestService.getByEmployee(worker.employeeId),
      ]);
      const dayAttendance = attendanceRecords.find((r) => r.date === date);
      absent = dayAttendance?.status === 'absent';
      leave = leaveRequests.some(
        (req) =>
          (req.finalStatus === 'approved')
          && req.startDate <= date
          && req.endDate >= date,
      );
    }
    absent = absent || presence.operationalAbsent;

    return {
      workerId,
      date,
      lineId,
      productId,
      targetQty,
      outputQty,
      achievementPercent,
      status: resolveDailyStatus(targetQty, outputQty, { absent, leave }),
      isPresent: presence.isPresent,
      presentAssignments: presence.present,
      absentAssignments: presence.absent,
    };
  },

  async getMonthlyAchievement(
    workerId: string,
    month: string,
    options?: {
      settings?: ProductionWorkerSettings;
      worker?: ProductionWorker | null;
      targets?: ProductionWorkerTarget[];
      products?: FirestoreProduct[];
      reports?: ProductionReport[];
      /** When false, skip Firestore summary write (use for list/dashboard batch reads). */
      persistSummary?: boolean;
      lineProductConfigs?: LineProductConfig[];
    },
  ): Promise<WorkerMonthlyAchievement> {
    const settings = this.resolveSettings(options?.settings);
    const perf = settings.performance;
    const { start, end } = monthRange(month);
    const worker = options?.worker ?? await productionWorkerService.getById(workerId);
    const targets = options?.targets ?? await productionWorkerTargetService.getByWorker(workerId);
    const reports = options?.reports ?? await reportService.getByDateRange(start, end);

    const allDates = listDatesInRange(start, end);
    let attendanceRecords: Awaited<ReturnType<typeof attendanceProcessingService.getRecordsByEmployee>> = [];
    let leaveRequests: Awaited<ReturnType<typeof leaveRequestService.getByEmployee>> = [];
    if (worker?.employeeId) {
      [attendanceRecords, leaveRequests] = await Promise.all([
        attendanceProcessingService.getRecordsByEmployee(worker.employeeId),
        leaveRequestService.getByEmployee(worker.employeeId),
      ]);
    }

    let workingDays = 0;
    let presentDays = 0;
    let absentDays = 0;
    let leaveDays = 0;
    let noOutputDays = 0;
    let achievedDays = 0;
    let belowTargetDays = 0;
    let overTargetDays = 0;
    let monthlyTarget = 0;
    let monthlyOutput = 0;
    const monthlyPresence = workerPresenceForReports(reports, workerId);

    for (const date of allDates) {
      const dayAttendance = attendanceRecords.find((r) => r.date === date);
      const onLeave = leaveRequests.some(
        (req) =>
          (req.finalStatus === 'approved')
          && req.startDate <= date
          && req.endDate >= date,
      );
      const weeklyOff = dayAttendance?.isWorkDay === false
        || dayAttendance?.status === 'off_day'
        || dayAttendance?.status === 'holiday';
      if (perf.excludeWeeklyOff && weeklyOff) continue;
      if (perf.excludeApprovedLeave && onLeave) {
        leaveDays += 1;
        continue;
      }

      workingDays += 1;
      const outputQty = aggregateWorkerOutputsFromReports(reports, workerId, date);
      const { lineId, productId } = primaryLineProductForDay(reports, workerId, date);
      const dayPresence = workerPresenceForReports(reports, workerId, date);
      const product = options?.products?.find((p) => p.id === productId) ?? null;
      const targetQty = productId
        ? resolveWorkerTarget({
          workerId,
          productId,
          lineId,
          date,
          targets,
          product,
          lineProductConfigs: options?.lineProductConfigs,
        }).dailyTargetQty
        : 0;

      const absent = dayAttendance?.status === 'absent' || dayPresence.operationalAbsent;
      if (dayPresence.totalDays > 0) {
        if (dayPresence.operationalAbsent) absentDays += 1;
        else presentDays += 1;
      }

      if (dayPresence.operationalAbsent) {
        continue;
      }

      if (outputQty <= 0) {
        if (perf.countAbsentAsZero && absent) {
          monthlyTarget += targetQty;
        } else if (perf.countNoReportAsZero) {
          noOutputDays += 1;
          monthlyTarget += targetQty;
        } else if (!absent) {
          noOutputDays += 1;
          monthlyTarget += targetQty;
        }
        continue;
      }

      monthlyOutput += outputQty;
      monthlyTarget += targetQty;
      const status = resolveDailyStatus(targetQty, outputQty, { absent, leave: onLeave });
      if (status === 'achieved') achievedDays += 1;
      if (status === 'below_target') belowTargetDays += 1;
      if (status === 'over_target') overTargetDays += 1;
    }

    const monthlyAchievement = monthlyTarget > 0
      ? Math.round((monthlyOutput / monthlyTarget) * 1000) / 10
      : 0;
    const attendanceDenominator = presentDays + absentDays;
    const attendanceRate = attendanceDenominator > 0
      ? Math.round((presentDays / attendanceDenominator) * 1000) / 10
      : 0;
    const performanceScore = computePerformanceScore(monthlyAchievement, attendanceRate);
    const bonusEstimate = calculateBonusEstimate({
      settings: settings.bonus,
      monthlyTarget,
      monthlyOutput,
      monthlyAchievement,
    });

    const result: WorkerMonthlyAchievement = {
      workerId,
      month,
      workingDays,
      presentDays,
      absentDays,
      leaveDays,
      noOutputDays,
      achievedDays,
      belowTargetDays,
      overTargetDays,
      monthlyTarget,
      monthlyOutput,
      monthlyAchievement,
      attendanceRate,
      performanceScore,
      bonusEstimate,
      presentAssignments: monthlyPresence.present,
      absentAssignments: monthlyPresence.absent,
    };

    if (options?.persistSummary !== false) {
      await workerPerformanceSummaryService.upsert({
        ...result,
        workerName: worker?.name,
        workerCode: worker?.code,
        employeeId: worker?.employeeId,
      });
    }

    return result;
  },

  async getWorkerOutputRowsForReport(params: {
    lineId: string;
    productId: string;
    date: string;
    products: FirestoreProduct[];
    workers: ProductionWorker[];
    targets: ProductionWorkerTarget[];
    assignments: { workerId: string; isPresent?: boolean }[];
    lineName: string;
    productName: string;
    lineProductConfigs?: LineProductConfig[];
  }) {
    const {
      lineId,
      productId,
      workers,
      assignments,
      lineName,
      productName,
      lineProductConfigs,
    } = params;
    if (!hasLineSpecificWorkerTarget(lineProductConfigs, lineId, productId)) {
      return [];
    }

    const workerMap = new Map(workers.map((w) => [String(w.id), w]));
    const activeWorkerAssignments = assignments.map((assignment) => ({
      workerId: assignment.workerId,
      isPresent: assignment.isPresent ?? true,
    }));

    return activeWorkerAssignments.map(({ workerId, isPresent }) => {
      const worker = workerMap.get(workerId);
      const resolved = resolveReportWorkerTarget({
        productId,
        lineId,
        lineProductConfigs,
      });
      return {
        workerId,
        workerName: worker?.name ?? workerId,
        productId,
        productName,
        lineId,
        lineName,
        dailyTargetQty: resolved.dailyTargetQty,
        outputQty: 0,
        achievementPercent: 0,
        isPresent,
        notes: resolved.warning,
      };
    });
  },

  /** Batch snapshot for workers list — shares report fetches across workers. */
  async getWorkersListPerformanceSnapshot(params: {
    workers: ProductionWorker[];
    targets: ProductionWorkerTarget[];
    month: string;
    date: string;
    settings?: ProductionWorkerSettings;
    products?: FirestoreProduct[];
    workerIds?: string[];
    lineProductConfigs?: LineProductConfig[];
  }): Promise<{
    monthlyByWorkerId: Map<string, WorkerMonthlyAchievement>;
    dailyByWorkerId: Map<string, {
      output: number;
      achievement: number;
      status: WorkerDailyAchievementStatus;
      isPresent?: boolean;
      presentAssignments?: number;
      absentAssignments?: number;
    }>;
  }> {
    const settings = this.resolveSettings(params.settings);
    const { start, end } = monthRange(params.month);
    const idSet = params.workerIds ? new Set(params.workerIds) : null;
    const workers = params.workers.filter((w) => w.id && (!idSet || idSet.has(w.id)));

    const [monthReports, dayReports] = await Promise.all([
      reportService.getByDateRange(start, end),
      reportService.getByDateRange(params.date, params.date),
    ]);

    const monthlyByWorkerId = new Map<string, WorkerMonthlyAchievement>();
    const dailyByWorkerId = new Map<string, {
      output: number;
      achievement: number;
      status: WorkerDailyAchievementStatus;
      isPresent?: boolean;
      presentAssignments?: number;
      absentAssignments?: number;
    }>();

    // Sequential per-worker compute — avoids dozens of concurrent setDoc writes
    // that corrupt Firestore persistence batch state (INTERNAL ASSERTION b815/b7de).
    for (const worker of workers) {
      const workerId = worker.id!;
      const workerTargets = params.targets.filter((t) => t.workerId === workerId);
      const monthly = await this.getMonthlyAchievement(workerId, params.month, {
        settings,
        worker,
        targets: workerTargets,
        products: params.products,
        reports: monthReports,
        persistSummary: false,
        lineProductConfigs: params.lineProductConfigs,
      });
      const daily = await this.getDailyAchievement(workerId, params.date, {
        worker,
        targets: workerTargets,
        products: params.products,
        settings,
        reports: dayReports,
        lineProductConfigs: params.lineProductConfigs,
      });
      monthlyByWorkerId.set(workerId, monthly);
      dailyByWorkerId.set(workerId, {
        output: daily.outputQty,
        achievement: daily.achievementPercent,
        status: daily.status,
        isPresent: daily.isPresent,
        presentAssignments: daily.presentAssignments,
        absentAssignments: daily.absentAssignments,
      });
    }

    return { monthlyByWorkerId, dailyByWorkerId };
  },
};
