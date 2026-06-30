import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { PageHeader } from '@/components/PageHeader';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { formatNumber, getTodayDateString } from '@/utils/calculations';
import { Badge, Button, Card, KPIBox, LoadingSkeleton } from '../components/UI';
import { SelectableTable, type TableBulkAction, type TableColumn } from '../components/SelectableTable';
import type {
  ProductionLineWorkerAssignment,
  ProductionWorker,
  ProductionWorkerTarget,
  WorkerDailyAchievementStatus,
  WorkerMonthlyAchievement,
} from '@/types';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS } from '@/types';
import { productionWorkerService } from '../services/productionWorkerService';
import { productionLineWorkerAssignmentService } from '../services/productionLineWorkerAssignmentService';
import { lineAssignmentService } from '../services/lineAssignmentService';
import { supervisorLineAssignmentService } from '../services/supervisorLineAssignmentService';
import { productionWorkerTargetService } from '../services/productionWorkerTargetService';
import { productionWorkerPerformanceService } from '../services/productionWorkerPerformanceService';
import { ProductionWorkerReports } from './ProductionWorkerReports';
import { ProductionWorkerRatingsReview } from './ProductionWorkerRatingsReview';
import { SupervisorWorkerEvaluation } from './SupervisorWorkerEvaluation';
import {
  matchesProductionWorkerLineFilter,
  normalizeWorkerLineIds,
  shouldShowProductionWorkerForSupervisor,
  UNASSIGNED_LINE_FILTER_VALUE,
} from '../utils/productionWorkerVisibility';
import {
  buildBulkWorkerLineTransferPlans,
  getPreviousDateString,
  getWorkersEligibleForLineTransfer,
  isProductionWorkerAssignmentActiveOnDate,
} from '../utils/productionWorkerLineTransfer';
import { DEFAULT_LINE_WORKER_LABOR_ROLE } from '../utils/lineWorkerLaborRoles';
import {
  buildAssignmentInfoByWorker,
  listDatesInRange,
  monthRange,
  type WorkerAssignmentInfo,
} from '../utils/workerAssignmentPresence';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

type WorkspaceTab = 'summary' | 'reports' | 'evaluation';

type WorkerRow = ProductionWorker & {
  assignedLineIds: string[];
  activeTargetsCount: number;
  todayOutput: number;
  todayAchievement: number;
  todayStatus?: WorkerDailyAchievementStatus;
  presentDays: number;
  absentDays: number;
  monthStats: WorkerMonthlyAchievement | null;
};

const currentMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const TODAY_STATUS_LABELS: Record<WorkerDailyAchievementStatus, string> = {
  achieved: 'حقق الهدف',
  below_target: 'أقل من الهدف',
  over_target: 'تجاوز الهدف',
  absent: 'غائب',
  no_output: 'لا يوجد إنتاج',
  no_target: 'غير مكلف بهدف',
  leave: 'إجازة',
};

const TODAY_STATUS_BADGE: Record<WorkerDailyAchievementStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  achieved: 'success',
  below_target: 'warning',
  over_target: 'success',
  absent: 'danger',
  no_output: 'warning',
  no_target: 'neutral',
  leave: 'info',
};

export const ProductionWorkers: React.FC = () => {
  const navigate = useTenantNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = usePermission();
  const canManage = can('production.workers.manage') || can('productionWorkers.view');
  const canManageTargets = can('production.workerTargets.manage') || canManage;
  const canViewReports = can('production.workerReports.view') || can('productionWorkers.view') || can('production.workers.view');
  const canViewRatingReview = can('production.workerRatings.view') || can('production.workerRatings.manage') || can('hr.evaluation.approve');
  const canUseSupervisorEvaluation = can('hr.evaluation.create') || can('production.workers.manage') || can('employeeDashboard.view') || can('quickAction.view');
  const productionLines = useAppStore((s) => s.productionLines);
  const products = useAppStore((s) => s.products);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const uid = useAppStore((s) => s.uid);
  const storeCurrentEmployee = useAppStore((s) => s.currentEmployee);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const rawWorkerSettings = useAppStore((s) => s.systemSettings.productionWorkerSettings);
  const workerSettings = useMemo(() => ({
    performance: {
      ...DEFAULT_PRODUCTION_WORKER_SETTINGS.performance,
      ...(rawWorkerSettings?.performance ?? {}),
    },
    bonus: {
      ...DEFAULT_PRODUCTION_WORKER_SETTINGS.bonus,
      ...(rawWorkerSettings?.bonus ?? {}),
    },
    supervisorBonus: {
      ...DEFAULT_PRODUCTION_WORKER_SETTINGS.supervisorBonus,
      ...(rawWorkerSettings?.supervisorBonus ?? {}),
      tiers: rawWorkerSettings?.supervisorBonus?.tiers?.length
        ? rawWorkerSettings.supervisorBonus.tiers
        : DEFAULT_PRODUCTION_WORKER_SETTINGS.supervisorBonus.tiers,
    },
  }), [rawWorkerSettings]);

  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [workers, setWorkers] = useState<ProductionWorker[]>([]);
  const [assignments, setAssignments] = useState<ProductionLineWorkerAssignment[]>([]);
  const [targets, setTargets] = useState<ProductionWorkerTarget[]>([]);
  const [monthStatsMap, setMonthStatsMap] = useState<Map<string, WorkerMonthlyAchievement>>(new Map());
  const [todayStatsMap, setTodayStatsMap] = useState<Map<string, { output: number; achievement: number; status: WorkerDailyAchievementStatus }>>(new Map());
  const [assignmentInfoByWorkerId, setAssignmentInfoByWorkerId] = useState<Map<string, WorkerAssignmentInfo>>(new Map());
  const [supervisorLineIds, setSupervisorLineIds] = useState<Set<string>>(new Set());
  const [supervisorLinesLoaded, setSupervisorLinesLoaded] = useState(true);

  const [search, setSearch] = useState('');
  const [filterLine, setFilterLine] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [filterMonth, setFilterMonth] = useState(currentMonth());
  const [filterDate, setFilterDate] = useState(getTodayDateString());
  const [filterActive, setFilterActive] = useState<'' | 'active' | 'inactive'>('');
  const [filterPerformance, setFilterPerformance] = useState<'' | 'below' | 'above' | 'missing_target'>('');

  const currentEmployee = useMemo(
    () => (storeCurrentEmployee?.id ? storeCurrentEmployee : _rawEmployees.find((e) => e.userId === uid)) ?? null,
    [storeCurrentEmployee, _rawEmployees, uid],
  );
  const isSupervisorReporter = useMemo(
    () => String(userRoleName || '').trim().includes('مشرف') || currentEmployee?.level === 2,
    [userRoleName, currentEmployee?.level],
  );

  const requestedTab = searchParams.get('tab');
  const activeWorkspaceTab: WorkspaceTab =
    requestedTab === 'reports' && canViewReports
      ? 'reports'
      : requestedTab === 'evaluation' && (canViewRatingReview || canUseSupervisorEvaluation)
        ? 'evaluation'
        : 'summary';

  const setWorkspaceTab = (tab: WorkspaceTab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'summary') next.delete('tab');
    else next.set('tab', tab);
    setSearchParams(next);
  };

  const [lineTransfer, setLineTransfer] = useState<{
    workers: WorkerRow[];
    sourceLineId?: string;
    targetLineId: string;
    transferDate: string;
    error: string | null;
  } | null>(null);
  const [lineTransferSaving, setLineTransferSaving] = useState(false);
  const [unlinkingWorkers, setUnlinkingWorkers] = useState(false);
  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    _rawEmployees.forEach((e) => {
      if (e.id) map.set(e.id, e.name);
    });
    return map;
  }, [_rawEmployees]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [w, a, t] = await Promise.all([
        productionWorkerService.getAll(),
        productionLineWorkerAssignmentService.getAll(),
        productionWorkerTargetService.getAll(),
      ]);
      setWorkers(w);
      setAssignments(a);
      setTargets(t);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  useEffect(() => {
    let mounted = true;
    if (!isSupervisorReporter || !currentEmployee?.id) {
      setSupervisorLineIds(new Set());
      setSupervisorLinesLoaded(true);
      return () => { mounted = false; };
    }

    setSupervisorLinesLoaded(false);
    supervisorLineAssignmentService
      .getActiveByDate(filterDate)
      .then((rows) => {
        if (!mounted) return;
        const ids = new Set(
          rows
            .filter((row) => String(row.supervisorId || '').trim() === currentEmployee.id)
            .map((row) => String(row.lineId || '').trim())
            .filter(Boolean),
        );
        setSupervisorLineIds(ids);
        setSupervisorLinesLoaded(true);
      })
      .catch(() => {
        if (!mounted) return;
        setSupervisorLineIds(new Set());
        setSupervisorLinesLoaded(true);
      });
    return () => { mounted = false; };
  }, [isSupervisorReporter, currentEmployee?.id, filterDate]);

  useEffect(() => {
    if (workers.length === 0) {
      setMonthStatsMap(new Map());
      setTodayStatsMap(new Map());
      setAssignmentInfoByWorkerId(new Map());
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setStatsLoading(true);
        try {
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
          if (!cancelled) {
            setMonthStatsMap(monthlyByWorkerId);
            setTodayStatsMap(dailyByWorkerId);
            setAssignmentInfoByWorkerId(assignmentInfo);
          }
        } finally {
          if (!cancelled) setStatsLoading(false);
        }
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [workers, filterMonth, filterDate, filterLine, targets, products, lineProductConfigs, workerSettings, productionLines]);

  const getLineName = (id: string) => productionLines.find((l) => l.id === id)?.name ?? id;
  const today = getTodayDateString();

  const rows: WorkerRow[] = useMemo(() => {
    return workers.map((worker) => {
      const workerAssignments = assignments.filter((a) => a.workerId === worker.id);
      const activeAssignmentLineIds = workerAssignments
        .filter((a) => isProductionWorkerAssignmentActiveOnDate(a, today))
        .map((a) => a.lineId);
      const lineIds = normalizeWorkerLineIds(
        workerAssignments.length > 0 ? activeAssignmentLineIds : (worker.lineIds || []),
      );
      const activeTargetsCount = targets.filter(
        (t) => t.workerId === worker.id && t.isActive,
      ).length;
      const monthStats = worker.id ? monthStatsMap.get(worker.id) ?? null : null;
      const todayStats = worker.id ? todayStatsMap.get(worker.id) : undefined;
      const assignmentInfo = worker.id ? assignmentInfoByWorkerId.get(worker.id) : undefined;
      const presentDays = assignmentInfo?.presentDays ?? monthStats?.presentDays ?? 0;
      const absentDays = assignmentInfo?.absentDays ?? monthStats?.absentDays ?? 0;
      return {
        ...worker,
        assignedLineIds: lineIds,
        activeTargetsCount,
        todayOutput: todayStats?.output ?? 0,
        todayAchievement: todayStats?.achievement ?? 0,
        todayStatus: todayStats?.status,
        presentDays,
        absentDays,
        monthStats,
      };
    });
  }, [workers, assignments, targets, monthStatsMap, todayStatsMap, assignmentInfoByWorkerId, today]);

  const scopedRows = useMemo(
    () => rows.filter((row) => shouldShowProductionWorkerForSupervisor(
      row.assignedLineIds,
      isSupervisorReporter,
      supervisorLineIds,
      { includeUnassigned: filterLine === UNASSIGNED_LINE_FILTER_VALUE },
    )),
    [rows, isSupervisorReporter, supervisorLineIds, filterLine],
  );

  const visibleProductionLines = useMemo(
    () => (
      isSupervisorReporter
        ? productionLines.filter((line) => supervisorLineIds.has(String(line.id || '').trim()))
        : productionLines
    ),
    [productionLines, isSupervisorReporter, supervisorLineIds],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedRows.filter((row) => {
      if (filterActive === 'active' && row.isActive === false) return false;
      if (filterActive === 'inactive' && row.isActive !== false) return false;
      if (!matchesProductionWorkerLineFilter(row.assignedLineIds, filterLine)) return false;
      if (filterProduct && !targets.some((t) => t.workerId === row.id && t.productId === filterProduct)) return false;
      if (filterPerformance === 'below' && (row.monthStats?.monthlyAchievement ?? 0) >= 100) return false;
      if (filterPerformance === 'above' && (row.monthStats?.monthlyAchievement ?? 0) <= 100) return false;
      if (filterPerformance === 'missing_target' && row.activeTargetsCount > 0) return false;
      if (!q) return true;
      const employeeName = row.employeeId ? employeeNameById.get(row.employeeId) ?? '' : '';
      return row.name.toLowerCase().includes(q)
        || row.code.toLowerCase().includes(q)
        || employeeName.toLowerCase().includes(q);
    });
  }, [scopedRows, search, filterActive, filterLine, filterProduct, filterPerformance, targets, employeeNameById]);

  const openLineTransfer = useCallback((selectedWorkers: WorkerRow[] | WorkerRow) => {
    const transferWorkers = Array.isArray(selectedWorkers) ? selectedWorkers.filter((worker) => worker.id) : [selectedWorkers];
    if (transferWorkers.length === 0) return;
    setLineTransfer({
      workers: transferWorkers,
      targetLineId: '',
      transferDate: filterDate || getTodayDateString(),
      error: null,
    });
  }, [filterDate]);

  const openLineTransferByLine = useCallback(() => {
    setLineTransfer({
      workers: [],
      sourceLineId: filterLine && filterLine !== UNASSIGNED_LINE_FILTER_VALUE ? filterLine : '',
      targetLineId: '',
      transferDate: filterDate || getTodayDateString(),
      error: null,
    });
  }, [filterDate, filterLine]);

  const closeLineTransfer = () => {
    if (lineTransferSaving) return;
    setLineTransfer(null);
  };

  const handleSaveLineTransfer = async () => {
    if (!lineTransfer || lineTransferSaving) return;
    const workersToTransfer = getLineTransferEligibleWorkers(lineTransfer);
    const validationError = getLineTransferValidationError(lineTransfer, workersToTransfer);
    if (validationError) {
      setLineTransfer((prev) => prev ? { ...prev, error: validationError } : prev);
      return;
    }
    setLineTransferSaving(true);
    try {
      const workerPlans = buildBulkWorkerLineTransferPlans({
        workers: workersToTransfer,
        assignments,
        targetLineId: lineTransfer.targetLineId,
        transferDate: lineTransfer.transferDate,
      });

      await Promise.all(workerPlans.flatMap(({ plan }) => (
        plan.assignmentsToClose
          .filter((row) => Boolean(row.id))
          .map((row) => productionLineWorkerAssignmentService.update(row.id!, {
            isActive: false,
            endDate: plan.closeEndDate,
          }))
      )));
      await Promise.all(workerPlans.map(async ({ worker, plan }) => {
        if (plan.shouldCreateTargetAssignment) {
          await productionLineWorkerAssignmentService.create({
            workerId: worker.id!,
            lineId: lineTransfer.targetLineId,
            startDate: lineTransfer.transferDate,
            laborRole: DEFAULT_LINE_WORKER_LABOR_ROLE,
            isActive: true,
          });
        }

        await productionWorkerService.update(worker.id!, {
          lineIds: plan.nextLineIds,
          defaultLineId: plan.nextDefaultLineId,
        });
      }));
      await loadData();
      setLineTransfer(null);
    } catch {
      setLineTransfer((prev) => prev ? { ...prev, error: 'تعذر نقل العامل الآن. حاول مرة أخرى.' } : prev);
    } finally {
      setLineTransferSaving(false);
    }
  };

  const getLineTransferSourceWorkers = (transfer: NonNullable<typeof lineTransfer>) => {
    if (transfer.sourceLineId === undefined) return transfer.workers;
    if (!transfer.sourceLineId) return [];
    return scopedRows.filter((worker) => worker.assignedLineIds.includes(transfer.sourceLineId!));
  };

  const getLineTransferEligibleWorkers = (transfer: NonNullable<typeof lineTransfer>) => {
    return getWorkersEligibleForLineTransfer(getLineTransferSourceWorkers(transfer), transfer.targetLineId);
  };

  const getLineTransferValidationError = (
    transfer: NonNullable<typeof lineTransfer>,
    workersToTransfer: WorkerRow[],
  ) => {
    if (transfer.sourceLineId !== undefined && !transfer.sourceLineId) return 'اختر الخط الحالي.';
    const sourceWorkers = getLineTransferSourceWorkers(transfer);
    if (sourceWorkers.length === 0) return 'لا يوجد عمال على الخط الحالي للنقل.';
    if (!transfer.targetLineId) return 'اختر الخط الجديد.';
    if (transfer.sourceLineId && transfer.sourceLineId === transfer.targetLineId) return 'اختر خطاً جديداً مختلفاً عن الخط الحالي.';
    if (transfer.sourceLineId === undefined && transfer.workers.length === 0) return 'اختر عاملاً واحداً على الأقل للنقل.';
    if (!transfer.transferDate) return 'اختر تاريخ بداية النقل.';
    if (workersToTransfer.length === 0) return 'كل العمال المختارين موجودون بالفعل على الخط الجديد.';
    return null;
  };

  const syncWorkerLineSnapshot = async (workerId: string) => {
    const [worker, workerAssignments] = await Promise.all([
      productionWorkerService.getById(workerId),
      productionLineWorkerAssignmentService.getByWorker(workerId),
    ]);
    if (!worker?.id) return;

    const activeLineIds = Array.from(new Set(
      workerAssignments
        .filter((row) => isProductionWorkerAssignmentActiveOnDate(row, getTodayDateString()))
        .map((row) => String(row.lineId || '').trim())
        .filter(Boolean),
    ));

    await productionWorkerService.update(worker.id, {
      lineIds: activeLineIds,
      defaultLineId: activeLineIds.includes(String(worker.defaultLineId || '').trim())
        ? worker.defaultLineId
        : activeLineIds[0] || '',
    });
  };

  const deleteTodayDailyRowsForWorkers = async (workersToUnlink: WorkerRow[]) => {
    const employeeIds = new Set(
      workersToUnlink
        .map((worker) => String(worker.employeeId || '').trim())
        .filter(Boolean),
    );
    if (employeeIds.size === 0) return;

    const dailyRows = await lineAssignmentService.getByDate(getTodayDateString());
    const idsToDelete = dailyRows
      .filter((row) => employeeIds.has(String(row.employeeId || '').trim()))
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id));

    await Promise.all(idsToDelete.map((id) => lineAssignmentService.delete(id)));
  };

  const handleBulkUnlinkWorkers = async (selectedWorkers: WorkerRow[]) => {
    const workersToUnlink = selectedWorkers.filter((worker) => worker.id && worker.assignedLineIds.length > 0);
    if (workersToUnlink.length === 0 || unlinkingWorkers) return;

    const confirmed = window.confirm(
      `سيتم فك الربط الدائم لعدد ${workersToUnlink.length} عامل من اليوم.\nسيتم حذف سجلات اليوم فقط إن وجدت، مع الحفاظ على كل السجلات القديمة. هل تريد المتابعة؟`,
    );
    if (!confirmed) return;

    setUnlinkingWorkers(true);
    try {
      const cancellationDate = getTodayDateString();
      const endDate = getPreviousDateString(cancellationDate);
      const workerIds = new Set(workersToUnlink.map((worker) => worker.id!));
      const activeAssignments = assignments.filter((assignment) => (
        workerIds.has(assignment.workerId)
        && isProductionWorkerAssignmentActiveOnDate(assignment, cancellationDate)
      ));

      await Promise.all(
        activeAssignments
          .filter((assignment) => Boolean(assignment.id))
          .map((assignment) => productionLineWorkerAssignmentService.update(assignment.id!, {
            isActive: false,
            endDate,
          })),
      );
      await deleteTodayDailyRowsForWorkers(workersToUnlink);
      await Promise.all(Array.from(workerIds).map((workerId) => syncWorkerLineSnapshot(workerId)));
      await loadData();
    } catch {
      window.alert('تعذر فك ربط العمال الآن. حاول مرة أخرى.');
    } finally {
      setUnlinkingWorkers(false);
    }
  };

  const workerBulkActions = useMemo<TableBulkAction<WorkerRow>[]>(() => {
    if (!canManage) return [];
    return [
      {
        label: 'نقل المحدد',
        icon: 'swap_horiz',
        action: (items) => openLineTransfer(items),
        disabled: lineTransferSaving || unlinkingWorkers,
      },
      {
        label: 'فك ربط المحدد',
        icon: 'link_off',
        variant: 'danger',
        action: (items) => void handleBulkUnlinkWorkers(items),
        disabled: lineTransferSaving || unlinkingWorkers,
      },
    ];
  }, [canManage, openLineTransfer, lineTransferSaving, unlinkingWorkers, assignments, loadData]);

  const lineTransferEligibleWorkers = lineTransfer ? getLineTransferEligibleWorkers(lineTransfer) : [];
  const lineTransferValidationError = lineTransfer
    ? getLineTransferValidationError(lineTransfer, lineTransferEligibleWorkers)
    : null;
  const lineTransferAlreadyOnTargetCount = lineTransfer?.targetLineId
    ? getLineTransferSourceWorkers(lineTransfer).length - lineTransferEligibleWorkers.length
    : 0;
  const lineTransferWorkerNames = lineTransfer
    ? getLineTransferSourceWorkers(lineTransfer).slice(0, 5).map((worker) => worker.name).join('، ')
    : '';
  const lineTransferSourceCount = lineTransfer ? getLineTransferSourceWorkers(lineTransfer).length : 0;

  const exportExcel = () => {
    const data = filtered.map((row) => ({
      العامل: row.name,
      الكود: row.code,
      الخطوط: row.assignedLineIds.map(getLineName).join('، '),
      'أهداف نشطة': row.activeTargetsCount,
      'إنتاج اليوم': row.todayOutput,
      'إنجاز اليوم %': row.todayAchievement,
      'حالة اليوم': row.todayStatus ? TODAY_STATUS_LABELS[row.todayStatus] : '—',
      'إنتاج الشهر': row.monthStats?.monthlyOutput ?? 0,
      'هدف الشهر': row.monthStats?.monthlyTarget ?? 0,
      'إنجاز الشهر %': row.monthStats?.monthlyAchievement ?? 0,
      'نسبة الحضور': row.presentDays + row.absentDays > 0
        ? Math.round((row.presentDays / (row.presentDays + row.absentDays)) * 1000) / 10
        : 0,
      'أيام حضور': row.presentDays,
      'أيام غياب': row.absentDays,
      الدرجة: row.monthStats?.performanceScore ?? 0,
      'تقدير المكافأة': row.monthStats?.bonusEstimate ?? 0,
      الحالة: row.isActive === false ? 'غير نشط' : 'نشط',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'عمال الإنتاج');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf]), `production_workers_${filterMonth}.xlsx`);
  };

  const statPlaceholder = statsLoading ? '…' : '0';
  const getBonusReason = useCallback((stats: WorkerMonthlyAchievement | null): string => {
    const bonus = workerSettings.bonus;
    if (!bonus.enabled) return 'المكافأة غير مفعلة من الإعدادات';
    if (!stats) return 'لم يتم حساب أداء الشهر بعد';
    if (stats.monthlyTarget <= 0) return 'لا يوجد هدف شهري محسوب';
    if (stats.monthlyAchievement < bonus.minimumAchievementPercent) {
      return `أقل من الحد الأدنى ${bonus.minimumAchievementPercent}%`;
    }
    if (stats.bonusEstimate > 0) return '';

    if (bonus.method === 'target_plus_extra') {
      const base = Number(bonus.targetBonusAmount || 0);
      const extra = Math.max(0, stats.monthlyOutput - stats.monthlyTarget);
      const extraMethod = bonus.extraBonusMethod ?? 'per_extra_unit';
      if (base <= 0 && extraMethod === 'none') return 'مكافأة الهدف = 0 ولا توجد زيادة بعد الهدف';
      if (base <= 0 && extra <= 0) return 'مكافأة الهدف = 0 ولا توجد كمية زائدة';
      if (base <= 0 && extraMethod === 'per_extra_unit' && Number(bonus.bonusPerExtraUnit || 0) <= 0) {
        return 'مكافأة الهدف وقيمة قطعة الزيادة = 0';
      }
      if (base <= 0 && extraMethod === 'per_extra_achievement_percent' && Number(bonus.bonusPerAchievementPercent || 0) <= 0) {
        return 'مكافأة الهدف وقيمة نسبة الزيادة = 0';
      }
      return 'راجع إعدادات الزيادة فوق الهدف';
    }
    if (bonus.method === 'per_extra_unit') {
      const extra = Math.max(0, stats.monthlyOutput - stats.monthlyTarget);
      if (extra <= 0) return 'لا توجد كمية زائدة فوق الهدف';
      if (Number(bonus.bonusPerExtraUnit || 0) <= 0) return 'قيمة مكافأة الوحدة الزائدة = 0';
      return 'الحد الأقصى للمكافأة مضبوط على 0';
    }
    if (bonus.method === 'per_achievement_percent') {
      if (Number(bonus.bonusPerAchievementPercent || 0) <= 0) return 'قيمة مكافأة نسبة الإنجاز = 0';
      return 'الحد الأقصى للمكافأة مضبوط على 0';
    }
    if (bonus.method === 'fixed_tier') {
      if (Number(bonus.bonusPerAchievementPercent || 0) <= 0) return 'قيمة المكافأة الثابتة = 0';
      return 'الحد الأقصى للمكافأة مضبوط على 0';
    }
    return 'راجع إعدادات المكافأة';
  }, [workerSettings.bonus]);

  const columns: TableColumn<WorkerRow>[] = [
    { header: 'العامل', render: (row) => row.name },
    { header: 'الكود', render: (row) => row.code },
    {
      header: 'الموظف',
      render: (row) => {
        if (!row.employeeId) {
          return <Badge variant="warning">يدوي</Badge>;
        }
        return employeeNameById.get(row.employeeId) ?? '—';
      },
    },
    {
      header: 'الخطوط',
      render: (row) => row.assignedLineIds.map(getLineName).join('، ') || '—',
    },
    { header: 'أهداف نشطة', render: (row) => row.activeTargetsCount, className: 'text-center' },
    {
      header: 'إنتاج اليوم',
      render: (row) => (statsLoading && !todayStatsMap.has(row.id ?? '') ? statPlaceholder : formatNumber(row.todayOutput)),
      className: 'text-center',
    },
    {
      header: 'إنجاز اليوم %',
      render: (row) => (statsLoading && !todayStatsMap.has(row.id ?? '') ? statPlaceholder : `${row.todayAchievement}%`),
      className: 'text-center',
    },
    {
      header: 'حالة اليوم',
      render: (row) => {
        if (statsLoading && !todayStatsMap.has(row.id ?? '')) return statPlaceholder;
        if (!row.todayStatus) return '—';
        return <Badge variant={TODAY_STATUS_BADGE[row.todayStatus]}>{TODAY_STATUS_LABELS[row.todayStatus]}</Badge>;
      },
      className: 'text-center',
    },
    {
      header: 'إنتاج الشهر',
      render: (row) => (statsLoading && !monthStatsMap.has(row.id ?? '') ? statPlaceholder : formatNumber(row.monthStats?.monthlyOutput ?? 0)),
      className: 'text-center',
    },
    {
      header: 'هدف الشهر',
      render: (row) => (statsLoading && !monthStatsMap.has(row.id ?? '') ? statPlaceholder : formatNumber(row.monthStats?.monthlyTarget ?? 0)),
      className: 'text-center',
    },
    {
      header: 'إنجاز الشهر %',
      render: (row) => (statsLoading && !monthStatsMap.has(row.id ?? '') ? statPlaceholder : `${row.monthStats?.monthlyAchievement ?? 0}%`),
      className: 'text-center',
    },
    {
      header: 'الحضور %',
      render: (row) => {
        if (statsLoading && !monthStatsMap.has(row.id ?? '')) return statPlaceholder;
        const denominator = row.presentDays + row.absentDays;
        return `${denominator > 0 ? Math.round((row.presentDays / denominator) * 1000) / 10 : 0}%`;
      },
      className: 'text-center',
    },
    {
      header: 'أيام حضور',
      render: (row) => (
        <span className="inline-flex min-w-10 justify-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700 tabular-nums">
          {formatNumber(row.presentDays)}
        </span>
      ),
      className: 'text-center',
    },
    {
      header: 'أيام غياب',
      render: (row) => (
        <span className="inline-flex min-w-10 justify-center rounded-full bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700 tabular-nums">
          {formatNumber(row.absentDays)}
        </span>
      ),
      className: 'text-center',
    },
    {
      header: 'الدرجة',
      render: (row) => (statsLoading && !monthStatsMap.has(row.id ?? '') ? statPlaceholder : (row.monthStats?.performanceScore ?? 0)),
      className: 'text-center',
    },
    {
      header: 'تقدير المكافأة',
      render: (row) => {
        if (statsLoading && !monthStatsMap.has(row.id ?? '')) return statPlaceholder;
        const reason = getBonusReason(row.monthStats);
        return (
          <div className="space-y-1">
            <p className="font-bold tabular-nums">{formatNumber(row.monthStats?.bonusEstimate ?? 0)}</p>
            {reason && (
              <p className="text-[10px] leading-snug text-[var(--color-text-muted)]">
                {reason}
              </p>
            )}
          </div>
        );
      },
      className: 'text-center',
    },
    {
      header: 'الحالة',
      render: (row) => (
        <Badge variant={row.isActive === false ? 'danger' : 'success'}>
          {row.isActive === false ? 'غير نشط' : 'نشط'}
        </Badge>
      ),
    },
  ];

  if (loading || !supervisorLinesLoaded) return <LoadingSkeleton rows={8} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="عمال الإنتاج"
        subtitle="مساحة موحدة لقائمة العمال والتقارير والتقييمات والتفاصيل"
        primaryAction={canManage && activeWorkspaceTab === 'summary' ? { label: 'نقل العمالة بين الخطوط', onClick: openLineTransferByLine } : undefined}
      />

      <Card>
        <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={activeWorkspaceTab === 'summary' ? 'primary' : 'outline'}
              onClick={() => setWorkspaceTab('summary')}
            >
              ملخص العمال
            </Button>
            {canViewReports ? (
              <Button
                type="button"
                variant={activeWorkspaceTab === 'reports' ? 'primary' : 'outline'}
                onClick={() => setWorkspaceTab('reports')}
              >
                تقرير الإنجاز
              </Button>
            ) : null}
            {canViewRatingReview || canUseSupervisorEvaluation ? (
              <Button
                type="button"
                variant={activeWorkspaceTab === 'evaluation' ? 'primary' : 'outline'}
                onClick={() => setWorkspaceTab('evaluation')}
              >
                تقييم العمالة
              </Button>
            ) : null}
          </div>
          <div className="text-xs font-medium text-[var(--color-text-muted)]">
            الروابط القديمة للتقارير والتقييمات ما زالت تعمل، وهذه الصفحة هي نقطة الدخول الأساسية.
          </div>
        </div>
      </Card>

      {activeWorkspaceTab === 'reports' ? (
        <ProductionWorkerReports embedded />
      ) : activeWorkspaceTab === 'evaluation' ? (
        canViewRatingReview ? <ProductionWorkerRatingsReview embedded /> : <SupervisorWorkerEvaluation embedded />
      ) : (
        <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPIBox label="إجمالي العمال" value={String(scopedRows.length)} icon="groups" />
        <KPIBox label="نشطون" value={String(scopedRows.filter((w) => w.isActive !== false).length)} icon="check_circle" />
        <KPIBox
          label="متوسط إنجاز الشهر"
          value={statsLoading ? '…' : `${filtered.length > 0 ? Math.round(filtered.reduce((s, r) => s + (r.monthStats?.monthlyAchievement ?? 0), 0) / filtered.length) : 0}%`}
          icon="speed"
        />
        <KPIBox
          label="تقدير المكافآت"
          value={statsLoading ? '…' : formatNumber(filtered.reduce((s, r) => s + (r.monthStats?.bonusEstimate ?? 0), 0))}
          icon="payments"
        />
      </div>

      <SmartFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="بحث بالاسم أو الكود..."
        quickFilters={[
          {
            key: 'line',
            placeholder: 'كل الخطوط',
            options: [
              { value: UNASSIGNED_LINE_FILTER_VALUE, label: 'بدون خط' },
              ...visibleProductionLines.map((l) => ({ value: l.id, label: l.name })),
            ],
          },
          {
            key: 'product',
            placeholder: 'كل المنتجات',
            options: products.map((p) => ({ value: p.id, label: p.name })),
          },
          {
            key: 'active',
            placeholder: 'الحالة',
            options: [
              { value: 'active', label: 'نشط' },
              { value: 'inactive', label: 'غير نشط' },
            ],
          },
          {
            key: 'perf',
            placeholder: 'الأداء',
            options: [
              { value: 'below', label: 'أقل من الهدف' },
              { value: 'above', label: 'أعلى من الهدف' },
              { value: 'missing_target', label: 'بدون هدف' },
            ],
          },
        ]}
        quickFilterValues={{
          line: filterLine,
          product: filterProduct,
          active: filterActive,
          perf: filterPerformance,
        }}
        onQuickFilterChange={(key, value) => {
          if (key === 'line') setFilterLine(value);
          if (key === 'product') setFilterProduct(value);
          if (key === 'active') setFilterActive(value as typeof filterActive);
          if (key === 'perf') setFilterPerformance(value as typeof filterPerformance);
        }}
        advancedFilters={[
          { key: 'month', label: 'الشهر', placeholder: 'الشهر', type: 'date', options: [] },
          { key: 'date', label: 'اليوم', placeholder: 'اليوم', type: 'date', options: [] },
        ]}
        advancedFilterValues={{ month: filterMonth, date: filterDate }}
        onAdvancedFilterChange={(key, value) => {
          if (key === 'month') setFilterMonth(value.slice(0, 7));
          if (key === 'date') setFilterDate(value);
        }}
        extra={(
          <div className="flex gap-2">
            {canManage ? (
              <Button variant="outline" onClick={openLineTransferByLine}>نقل من خط إلى خط</Button>
            ) : null}
            <Button variant="outline" onClick={exportExcel}>تصدير Excel</Button>
          </div>
        )}
      />

      <Card>
        <SelectableTable
          data={filtered}
          columns={columns}
          getId={(row) => row.id ?? row.code}
          bulkActions={workerBulkActions}
          onRowClick={(row) => row.id && navigate(`/production-workers/${row.id}`)}
          renderActions={(row) => (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => row.id && navigate(`/production-workers/${row.id}`)}>التفاصيل</Button>
              {canManageTargets && row.id ? (
                <Button variant="outline" onClick={() => navigate(`/production-workers/${row.id}?tab=targets`)}>الأهداف</Button>
              ) : null}
              {canManage && row.id ? (
                <Button
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    openLineTransfer(row);
                  }}
                >
                  نقل
                </Button>
              ) : null}
            </div>
          )}
        />
      </Card>

      {lineTransfer && canManage && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={closeLineTransfer}>
          <div
            className="bg-[var(--color-card)] rounded-xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-lg font-bold">
                {lineTransfer.sourceLineId !== undefined
                  ? 'نقل العمالة من خط إلى خط'
                  : lineTransfer.workers.length === 1 ? 'نقل عامل إلى خط آخر' : 'نقل مجموعة عمال إلى خط آخر'}
              </h3>
              {lineTransfer.sourceLineId !== undefined ? (
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  اختر الخط الحالي ثم الخط الجديد لنقل كل العمالة النشطة بينهما.
                </p>
              ) : (
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  المختارون ({lineTransfer.workers.length}): {lineTransferWorkerNames}
                  {lineTransfer.workers.length > 5 ? `، و${lineTransfer.workers.length - 5} آخرين` : ''}
                </p>
              )}
            </div>
            {lineTransfer.sourceLineId !== undefined ? (
              <div>
                <label className="block text-sm font-bold mb-2">الخط الحالي *</label>
                <select
                  className="w-full border rounded-lg p-3"
                  value={lineTransfer.sourceLineId}
                  onChange={(e) => setLineTransfer((prev) => prev ? { ...prev, sourceLineId: e.target.value, error: null } : prev)}
                >
                  <option value="">اختر الخط الحالي</option>
                  {visibleProductionLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  العمالة على الخط الحالي: {lineTransferSourceCount} عامل
                  {lineTransferWorkerNames ? ` — ${lineTransferWorkerNames}${lineTransferSourceCount > 5 ? `، و${lineTransferSourceCount - 5} آخرين` : ''}` : ''}.
                </p>
              </div>
            ) : null}
            <div>
              <label className="block text-sm font-bold mb-2">الخط الجديد *</label>
              <select
                className="w-full border rounded-lg p-3"
                value={lineTransfer.targetLineId}
                onChange={(e) => setLineTransfer((prev) => prev ? { ...prev, targetLineId: e.target.value, error: null } : prev)}
              >
                <option value="">اختر الخط الجديد</option>
                {visibleProductionLines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                سيتم نقل {lineTransferEligibleWorkers.length} عامل {lineTransfer.sourceLineId !== undefined ? 'من الخط الحالي' : 'من المختارين'}
                {lineTransferAlreadyOnTargetCount > 0 ? ` وتخطي ${lineTransferAlreadyOnTargetCount} موجودين بالفعل على هذا الخط` : ''}.
              </p>
            </div>
            <div>
              <label className="block text-sm font-bold mb-2">تاريخ بداية النقل *</label>
              <input
                type="date"
                className="w-full border rounded-lg p-3"
                value={lineTransfer.transferDate}
                onChange={(e) => setLineTransfer((prev) => prev ? { ...prev, transferDate: e.target.value, error: null } : prev)}
              />
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                سيتم إنهاء الربط الحالي قبل هذا التاريخ وربط العمال بالخط الجديد.
              </p>
            </div>
            {lineTransfer.error || lineTransferValidationError ? (
              <p className="text-sm font-medium text-rose-600">{lineTransfer.error ?? lineTransferValidationError}</p>
            ) : null}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={closeLineTransfer} disabled={lineTransferSaving}>إلغاء</Button>
              <Button
                disabled={lineTransferSaving || Boolean(lineTransferValidationError)}
                onClick={() => void handleSaveLineTransfer()}
              >
                {lineTransferSaving
                  ? 'جاري النقل...'
                  : `نقل ${lineTransferEligibleWorkers.length || lineTransfer.workers.length}`}
              </Button>
            </div>
          </div>
        </div>
      )}

        </>
      )}
    </div>
  );
};
