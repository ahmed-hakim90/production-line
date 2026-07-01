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
  WorkerDailyPerformanceLog,
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
import { workerDailyPerformanceLogService } from './workerDailyPerformanceLogService';
import { workerPerformanceSummaryService } from './workerPerformanceSummaryService';
import {
  computeAchievementPercent,
  hasLineSpecificWorkerTarget,
  resolveWorkerTarget,
} from '../selectors/workerTargetSelector';
import { calculateBonusEstimate, computePerformanceScore } from './productionBonusEngine';
import { buildWorkerPresenceRowsFromReports, summarizeWorkerPresenceDays } from '../utils/workerPresence';
import { isOnApprovedLeave } from '../utils/productionLeaveAvailability';
import { getTodayDateString } from '@/utils/calculations';

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
  employeeId?: string,
  date?: string,
) {
  const rows = buildWorkerPresenceRowsFromReports(reports, workerId, employeeId, date);
  const summary = summarizeWorkerPresenceDays(rows);
  const isPresent = summary.total === 0 ? undefined : summary.present > 0;
  return {
    ...summary,
    isPresent,
    operationalAbsent: summary.total > 0 && summary.present === 0 && summary.absent > 0,
  };
}

function aggregateDailyFromLogs(logs: WorkerDailyPerformanceLog[]): {
  targetQty: number;
  outputQty: number;
  lineId?: string;
  productId?: string;
} {
  if (!logs.length) {
    return { targetQty: 0, outputQty: 0 };
  }

  let targetQty = 0;
  let outputQty = 0;
  let primary = logs[0];
  for (const log of logs) {
    if (log.isPresent === false) continue;
    targetQty += Number(log.targetQty || 0);
    outputQty += Number(log.outputQty || 0);
    if (Number(log.outputQty || 0) > Number(primary.outputQty || 0)) {
      primary = log;
    }
  }

  return {
    targetQty,
    outputQty,
    lineId: primary.lineId,
    productId: primary.productId,
  };
}

function groupLogsByDate(logs: WorkerDailyPerformanceLog[]): Map<string, WorkerDailyPerformanceLog[]> {
  const grouped = new Map<string, WorkerDailyPerformanceLog[]>();
  for (const log of logs) {
    const date = String(log.date || '').trim();
    if (!date) continue;
    const bucket = grouped.get(date) ?? [];
    bucket.push(log);
    grouped.set(date, bucket);
  }
  return grouped;
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

  computeDailyAchievement(
    workerId: string,
    date: string,
    context: {
      worker?: ProductionWorker | null;
      targets?: ProductionWorkerTarget[];
      products?: FirestoreProduct[];
      reports: ProductionReport[];
      lineProductConfigs?: LineProductConfig[];
      attendanceRecords?: Awaited<ReturnType<typeof attendanceProcessingService.getRecordsByEmployee>>;
      leaveRequests?: Awaited<ReturnType<typeof leaveRequestService.getByEmployee>>;
      dailyLogs?: WorkerDailyPerformanceLog[];
    },
  ): WorkerDailyAchievement {
    const worker = context.worker ?? null;
    const reports = context.reports;
    const presence = workerPresenceForReports(reports, workerId, worker?.employeeId, date);
    const dailyLogs = context.dailyLogs ?? [];

    let absent = false;
    let leave = false;
    if (worker?.employeeId) {
      const dayAttendance = context.attendanceRecords?.find((r) => r.date === date);
      absent = dayAttendance?.status === 'absent';
      leave = isOnApprovedLeave(context.leaveRequests ?? [], date);
    }
    absent = absent || presence.operationalAbsent;

    if (dailyLogs.length > 0) {
      const aggregated = aggregateDailyFromLogs(dailyLogs);
      const targetQty = presence.operationalAbsent ? 0 : aggregated.targetQty;
      const outputQty = presence.operationalAbsent ? 0 : aggregated.outputQty;
      const achievementPercent = presence.operationalAbsent
        ? 0
        : computeAchievementPercent(outputQty, targetQty);

      return {
        workerId,
        date,
        lineId: aggregated.lineId,
        productId: aggregated.productId,
        targetQty,
        outputQty,
        achievementPercent,
        status: resolveDailyStatus(targetQty, outputQty, { absent, leave }),
        isPresent: presence.isPresent,
        presentAssignments: presence.present,
        absentAssignments: presence.absent,
      };
    }

    const targets = context.targets ?? [];
    const outputQty = aggregateWorkerOutputsFromReports(reports, workerId, date);
    const { lineId, productId } = primaryLineProductForDay(reports, workerId, date);
    const product = context.products?.find((p) => p.id === productId) ?? null;
    const resolved = productId
      ? resolveWorkerTarget({
        workerId,
        productId,
        lineId,
        date,
        targets,
        product,
        lineProductConfigs: context.lineProductConfigs,
      })
      : { dailyTargetQty: 0, source: 'missing' as const };
    const targetQty = presence.operationalAbsent ? 0 : resolved.dailyTargetQty;
    const achievementPercent = presence.operationalAbsent ? 0 : computeAchievementPercent(outputQty, targetQty);

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
      attendanceRecords?: Awaited<ReturnType<typeof attendanceProcessingService.getRecordsByEmployee>>;
      leaveRequests?: Awaited<ReturnType<typeof leaveRequestService.getByEmployee>>;
      dailyLogs?: WorkerDailyPerformanceLog[];
    },
  ): Promise<WorkerDailyAchievement> {
    const worker = context?.worker ?? await productionWorkerService.getById(workerId);
    const reports = context?.reports
      ?? await reportService.getByDateRange(date, date);
    const dailyLogs = context?.dailyLogs
      ?? await workerDailyPerformanceLogService.getByWorkerAndDate(workerId, date);

    let attendanceRecords = context?.attendanceRecords;
    let leaveRequests = context?.leaveRequests;
    if (worker?.employeeId && (!attendanceRecords || !leaveRequests)) {
      [attendanceRecords, leaveRequests] = await Promise.all([
        attendanceRecords ?? attendanceProcessingService.getRecordsByEmployee(worker.employeeId),
        leaveRequests ?? leaveRequestService.getByEmployee(worker.employeeId),
      ]);
    }

    const targets = context?.targets ?? await productionWorkerTargetService.getByWorker(workerId);

    return this.computeDailyAchievement(workerId, date, {
      worker,
      targets,
      products: context?.products,
      reports,
      lineProductConfigs: context?.lineProductConfigs,
      attendanceRecords,
      leaveRequests,
      dailyLogs,
    });
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
      /** Override period start instead of calendar month day 1. */
      startDate?: string;
      /** Cap aggregation to this date (e.g. today) instead of full calendar month end. */
      endDate?: string;
      attendanceRecords?: Awaited<ReturnType<typeof attendanceProcessingService.getRecordsByEmployee>>;
      leaveRequests?: Awaited<ReturnType<typeof leaveRequestService.getByEmployee>>;
    },
  ): Promise<WorkerMonthlyAchievement> {
    const settings = this.resolveSettings(options?.settings);
    const perf = settings.performance;
    const { start, end } = monthRange(month);
    const effectiveStart = options?.startDate ?? start;
    const effectiveEnd = options?.endDate ?? end;
    const worker = options?.worker ?? await productionWorkerService.getById(workerId);
    const targets = options?.targets ?? await productionWorkerTargetService.getByWorker(workerId);
    const reports = options?.reports ?? await reportService.getByDateRange(effectiveStart, effectiveEnd);
    const monthLogs = await workerDailyPerformanceLogService.getByWorkerAndDateRange(
      workerId,
      effectiveStart,
      effectiveEnd,
    );
    const logsByDate = groupLogsByDate(monthLogs);

    const allDates = listDatesInRange(effectiveStart, effectiveEnd);
    let attendanceRecords: Awaited<ReturnType<typeof attendanceProcessingService.getRecordsByEmployee>> = [];
    let leaveRequests: Awaited<ReturnType<typeof leaveRequestService.getByEmployee>> = [];
    if (worker?.employeeId) {
      if (options?.attendanceRecords) {
        attendanceRecords = options.attendanceRecords;
      } else {
        attendanceRecords = await attendanceProcessingService.getRecordsByEmployee(worker.employeeId);
      }
      if (options?.leaveRequests) {
        leaveRequests = options.leaveRequests;
      } else {
        leaveRequests = await leaveRequestService.getByEmployee(worker.employeeId);
      }
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
    const monthlyPresence = workerPresenceForReports(reports, workerId, worker?.employeeId);

    for (const date of allDates) {
      const dayAttendance = attendanceRecords.find((r) => r.date === date);
      const onLeave = isOnApprovedLeave(leaveRequests, date);
      const weeklyOff = dayAttendance?.isWorkDay === false
        || dayAttendance?.status === 'off_day'
        || dayAttendance?.status === 'holiday';
      if (perf.excludeWeeklyOff && weeklyOff) continue;
      if (perf.excludeApprovedLeave && onLeave) {
        leaveDays += 1;
        continue;
      }

      workingDays += 1;
      const dayLogs = logsByDate.get(date) ?? [];
      const dayPresence = workerPresenceForReports(reports, workerId, worker?.employeeId, date);
      let outputQty = 0;
      let targetQty = 0;
      let lineId: string | undefined;
      let productId: string | undefined;

      if (dayLogs.length > 0) {
        const aggregated = aggregateDailyFromLogs(dayLogs);
        outputQty = aggregated.outputQty;
        targetQty = aggregated.targetQty;
        lineId = aggregated.lineId;
        productId = aggregated.productId;
      } else {
        outputQty = aggregateWorkerOutputsFromReports(reports, workerId, date);
        const primary = primaryLineProductForDay(reports, workerId, date);
        lineId = primary.lineId;
        productId = primary.productId;
        const product = options?.products?.find((p) => p.id === productId) ?? null;
        targetQty = productId
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
      }

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
      date,
      products,
      workers,
      targets,
      assignments,
      lineName,
      productName,
      lineProductConfigs,
    } = params;
    if (!hasLineSpecificWorkerTarget(lineProductConfigs, lineId, productId)) {
      return [];
    }

    const workerMap = new Map(workers.map((w) => [String(w.id), w]));
    const product = products.find((item) => item.id === productId) ?? null;
    const activeWorkerAssignments = assignments.map((assignment) => ({
      workerId: assignment.workerId,
      isPresent: assignment.isPresent ?? true,
    }));

    return activeWorkerAssignments.map(({ workerId, isPresent }) => {
      const worker = workerMap.get(workerId);
      const resolved = resolveWorkerTarget({
        workerId,
        productId,
        lineId,
        date,
        targets: targets.filter((target) => target.workerId === workerId),
        product,
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
    lineId?: string;
    lineProductConfigs?: LineProductConfig[];
    startDate?: string;
    endDate?: string;
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
    monthReports: ProductionReport[];
  }> {
    const settings = this.resolveSettings(params.settings);
    const calendarRange = monthRange(params.month);
    const periodStart = params.startDate ?? calendarRange.start;
    const periodEnd = params.endDate ?? calendarRange.end;
    const today = getTodayDateString();
    const rangeEnd = periodEnd > today ? today : periodEnd;
    const idSet = params.workerIds ? new Set(params.workerIds) : null;
    const workers = params.workers.filter((w) => w.id && (!idSet || idSet.has(w.id)));

    const [monthReports, dayReports] = await Promise.all([
      reportService.getByDateRange(periodStart, rangeEnd),
      reportService.getByDateRange(params.date, params.date),
    ]);
    const scopedMonthReports = params.lineId
      ? monthReports.filter((report) => report.lineId === params.lineId)
      : monthReports;
    const scopedDayReports = params.lineId
      ? dayReports.filter((report) => report.lineId === params.lineId)
      : dayReports;

    const monthlyByWorkerId = new Map<string, WorkerMonthlyAchievement>();
    const dailyByWorkerId = new Map<string, {
      output: number;
      achievement: number;
      status: WorkerDailyAchievementStatus;
      isPresent?: boolean;
      presentAssignments?: number;
      absentAssignments?: number;
    }>();

    const uniqueEmployeeIds = Array.from(new Set(
      workers.map((worker) => String(worker.employeeId || '').trim()).filter(Boolean),
    ));
    const [attendanceEntries, leaveEntries] = await Promise.all([
      Promise.all(uniqueEmployeeIds.map(async (employeeId) => [
        employeeId,
        await attendanceProcessingService.getRecordsByEmployee(employeeId),
      ] as const)),
      Promise.all(uniqueEmployeeIds.map(async (employeeId) => [
        employeeId,
        await leaveRequestService.getByEmployee(employeeId),
      ] as const)),
    ]);
    const attendanceByEmployeeId = new Map(attendanceEntries);
    const leaveByEmployeeId = new Map(leaveEntries);

    const BATCH_SIZE = 20;
    for (let index = 0; index < workers.length; index += BATCH_SIZE) {
      const batch = workers.slice(index, index + BATCH_SIZE);
      await Promise.all(batch.map(async (worker) => {
        const workerId = worker.id!;
        const workerTargets = params.targets.filter((t) => t.workerId === workerId);
        const employeeId = String(worker.employeeId || '').trim();
        const attendanceRecords = employeeId ? attendanceByEmployeeId.get(employeeId) : undefined;
        const leaveRequests = employeeId ? leaveByEmployeeId.get(employeeId) : undefined;
        const monthly = await this.getMonthlyAchievement(workerId, params.month, {
          settings,
          worker,
          targets: workerTargets,
          products: params.products,
          reports: scopedMonthReports,
          persistSummary: false,
          lineProductConfigs: params.lineProductConfigs,
          startDate: periodStart,
          endDate: rangeEnd,
          attendanceRecords,
          leaveRequests,
        });
        const daily = await this.getDailyAchievement(workerId, params.date, {
          worker,
          targets: workerTargets,
          products: params.products,
          settings,
          reports: scopedDayReports,
          lineProductConfigs: params.lineProductConfigs,
          attendanceRecords,
          leaveRequests,
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
      }));
    }

    return { monthlyByWorkerId, dailyByWorkerId, monthReports: scopedMonthReports };
  },
};
