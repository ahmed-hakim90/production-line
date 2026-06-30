import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type {
  FirestoreProduct,
  LineProductConfig,
  ProductionLineWorkerAssignment,
  ProductionWorker,
  ProductionWorkerSettings,
  ProductionWorkerTarget,
  WorkerDailyAchievementStatus,
  WorkerMonthlyAchievement,
} from '@/types';
import { productionWorkerService } from '../services/productionWorkerService';
import { productionLineWorkerAssignmentService } from '../services/productionLineWorkerAssignmentService';
import { productionWorkerTargetService } from '../services/productionWorkerTargetService';
import { productionWorkerPerformanceService } from '../services/productionWorkerPerformanceService';
import { lineAssignmentService } from '../services/lineAssignmentService';
import { supervisorLineAssignmentService } from '../services/supervisorLineAssignmentService';
import {
  buildAssignmentInfoByWorker,
  listDatesInRange,
  monthRange,
  type WorkerAssignmentInfo,
} from '../utils/workerAssignmentPresence';
import { UNASSIGNED_LINE_FILTER_VALUE } from '../utils/productionWorkerVisibility';
import { getTodayDateString } from '@/utils/calculations';

const PRODUCTION_WORKERS_QUERY_KEY = ['productionWorkers'] as const;

export type ProductionWorkersStatsSnapshot = {
  monthStatsMap: Map<string, WorkerMonthlyAchievement>;
  todayStatsMap: Map<string, {
    output: number;
    achievement: number;
    status: WorkerDailyAchievementStatus;
  }>;
  assignmentInfoByWorkerId: Map<string, WorkerAssignmentInfo>;
};

type StatsQueryParams = {
  workers: ProductionWorker[];
  targets: ProductionWorkerTarget[];
  filterMonth: string;
  filterDate: string;
  filterLine: string;
  productionLines: Array<{ id?: string; name?: string }>;
  products: FirestoreProduct[];
  lineProductConfigs: LineProductConfig[];
  workerSettings: ProductionWorkerSettings;
};

async function fetchWorkersStats(params: StatsQueryParams): Promise<ProductionWorkersStatsSnapshot> {
  const {
    workers,
    targets,
    filterMonth,
    filterDate,
    filterLine,
    productionLines,
    products,
    lineProductConfigs,
    workerSettings,
  } = params;

  if (workers.length === 0) {
    return {
      monthStatsMap: new Map(),
      todayStatsMap: new Map(),
      assignmentInfoByWorkerId: new Map(),
    };
  }

  const { start, end } = monthRange(filterMonth);
  const today = getTodayDateString();
  const rangeEnd = end > today ? today : end;
  const periodDates = start <= rangeEnd ? listDatesInRange(start, rangeEnd) : [];

  const monthlyAssignmentsPromise = Promise.all(periodDates.map(async (periodDate) => {
    const assignments = productionLines.length > 0
      ? (await Promise.all(
        productionLines
          .filter((line) => line.id)
          .map((line) => lineAssignmentService.getByLineAndDate(line.id!, periodDate)),
      )).flat()
      : await lineAssignmentService.getByDate(periodDate);
    return assignments;
  })).then((groups) => groups.flat());

  const [{ monthlyByWorkerId, dailyByWorkerId, monthReports }, monthlyAssignments] = await Promise.all([
    productionWorkerPerformanceService.getWorkersListPerformanceSnapshot({
      workers,
      targets,
      month: filterMonth,
      date: filterDate,
      settings: workerSettings,
      products: products as never[],
      lineId: filterLine && filterLine !== UNASSIGNED_LINE_FILTER_VALUE ? filterLine : undefined,
      lineProductConfigs,
    }),
    monthlyAssignmentsPromise,
  ]);

  const assignmentInfo = buildAssignmentInfoByWorker(
    monthlyAssignments,
    workers,
    monthReports,
    (lineId) => productionLines.find((line) => line.id === lineId)?.name ?? lineId ?? '—',
  );

  return {
    monthStatsMap: monthlyByWorkerId,
    todayStatsMap: dailyByWorkerId,
    assignmentInfoByWorkerId: assignmentInfo,
  };
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useProductionWorkersPageQueries(params: {
  filterMonth: string;
  filterDate: string;
  filterLine: string;
  productionLines: Array<{ id?: string; name?: string }>;
  products: FirestoreProduct[];
  lineProductConfigs: LineProductConfig[];
  workerSettings: ProductionWorkerSettings;
  isSupervisorReporter: boolean;
  supervisorEmployeeId?: string;
}) {
  const queryClient = useQueryClient();
  const debouncedFilterMonth = useDebouncedValue(params.filterMonth, 300);
  const debouncedFilterDate = useDebouncedValue(params.filterDate, 300);
  const debouncedFilterLine = useDebouncedValue(params.filterLine, 300);

  const baseQuery = useQuery({
    queryKey: [...PRODUCTION_WORKERS_QUERY_KEY, 'base'],
    queryFn: async (): Promise<{
      workers: ProductionWorker[];
      assignments: ProductionLineWorkerAssignment[];
      targets: ProductionWorkerTarget[];
    }> => {
      const [workers, assignments, targets] = await Promise.all([
        productionWorkerService.getAll(),
        productionLineWorkerAssignmentService.getAll(),
        productionWorkerTargetService.getAll(),
      ]);
      return { workers, assignments, targets };
    },
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
  });

  const workers = baseQuery.data?.workers ?? [];
  const assignments = baseQuery.data?.assignments ?? [];
  const targets = baseQuery.data?.targets ?? [];

  const statsQuery = useQuery({
    queryKey: [
      ...PRODUCTION_WORKERS_QUERY_KEY,
      'stats',
      debouncedFilterMonth,
      debouncedFilterDate,
      debouncedFilterLine,
      workers.length,
      targets.length,
    ],
    queryFn: () => fetchWorkersStats({
      workers,
      targets,
      filterMonth: debouncedFilterMonth,
      filterDate: debouncedFilterDate,
      filterLine: debouncedFilterLine,
      productionLines: params.productionLines,
      products: params.products,
      lineProductConfigs: params.lineProductConfigs,
      workerSettings: params.workerSettings,
    }),
    enabled: workers.length > 0,
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous,
  });

  const supervisorQuery = useQuery({
    queryKey: [
      ...PRODUCTION_WORKERS_QUERY_KEY,
      'supervisorLines',
      params.supervisorEmployeeId ?? '',
      params.filterDate,
    ],
    queryFn: async (): Promise<Set<string>> => {
      const rows = await supervisorLineAssignmentService.getActiveByDate(params.filterDate);
      return new Set(
        rows
          .filter((row) => String(row.supervisorId || '').trim() === params.supervisorEmployeeId)
          .map((row) => String(row.lineId || '').trim())
          .filter(Boolean),
      );
    },
    enabled: params.isSupervisorReporter && Boolean(params.supervisorEmployeeId),
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
  });

  const supervisorLineIds = useMemo(() => {
    if (!params.isSupervisorReporter || !params.supervisorEmployeeId) return new Set<string>();
    return supervisorQuery.data ?? new Set<string>();
  }, [params.isSupervisorReporter, params.supervisorEmployeeId, supervisorQuery.data]);

  const supervisorLinesLoaded = !params.isSupervisorReporter
    || !params.supervisorEmployeeId
    || !supervisorQuery.isLoading;

  const statsSnapshot = statsQuery.data;
  const monthStatsMap = statsSnapshot?.monthStatsMap ?? new Map();
  const todayStatsMap = statsSnapshot?.todayStatsMap ?? new Map();
  const assignmentInfoByWorkerId = statsSnapshot?.assignmentInfoByWorkerId ?? new Map();

  const statsLoading = statsQuery.isPending || statsQuery.isPlaceholderData;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: PRODUCTION_WORKERS_QUERY_KEY });
  };

  return {
    workers,
    assignments,
    targets,
    monthStatsMap,
    todayStatsMap,
    assignmentInfoByWorkerId,
    loading: baseQuery.isLoading,
    statsLoading,
    supervisorLineIds,
    supervisorLinesLoaded,
    refresh,
  };
}
