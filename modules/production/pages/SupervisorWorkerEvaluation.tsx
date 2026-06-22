import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Star } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { getTodayDateString } from '@/utils/calculations';
import { employeeService } from '@/modules/hr/employeeService';
import { reportService } from '@/modules/production/services/reportService';
import { workOrderService } from '@/modules/production/services/workOrderService';
import { productionWorkerService } from '@/modules/production/services/productionWorkerService';
import { productionWorkerRatingService } from '@/modules/production/services/productionWorkerRatingService';
import { lineAssignmentWorkerBridge } from '@/modules/production/services/lineAssignmentWorkerBridge';
import { calculateSupervisorTeamBonusEstimate } from '@/modules/production/services/productionBonusEngine';
import { lineAssignmentService } from '@/services/lineAssignmentService';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS } from '@/types';
import { Card, Button, Badge, LoadingSkeleton } from '../components/UI';
import {
  LINE_WORKER_LABOR_ROLE_LABELS,
  resolveLineWorkerLaborRole,
} from '../utils/lineWorkerLaborRoles';
import type {
  FirestoreEmployee,
  LineWorkerAssignment,
  LineWorkerLaborRole,
  ProductionReport,
  ProductionWorker,
  ProductionWorkerRatingRecord,
  ProductionWorkerStarRating,
  WorkOrder,
} from '@/types';

type Period = 'daily' | 'yesterday' | 'weekly' | 'monthly' | 'all';

type SupervisorWorkerRatingRow = {
  workerId: string;
  workerName: string;
  workerCode?: string;
  employeeId?: string;
  lineId?: string;
  lineName?: string;
  laborRole?: LineWorkerLaborRole;
  targetQty: number;
  outputQty: number;
  cappedOutputQty: number;
  achievementPercent: number;
  productionTargetApplicable: boolean;
  achieved: boolean;
  rating?: ProductionWorkerStarRating;
  ratingRecord?: ProductionWorkerRatingRecord;
  worker?: ProductionWorker;
};

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'daily', label: 'يوم التقييم' },
  { value: 'yesterday', label: 'أمس' },
  { value: 'weekly', label: 'آخر 7 أيام' },
  { value: 'monthly', label: 'الشهر الحالي' },
  { value: 'all', label: 'كل البيانات' },
];

const RATING_FIELDS: { key: keyof Pick<ProductionWorkerStarRating, 'behavior' | 'ethics' | 'work'>; label: string }[] = [
  { key: 'behavior', label: 'سلوكياً' },
  { key: 'ethics', label: 'أخلاقياً' },
  { key: 'work', label: 'عملياً' },
];

const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: 'بانتظار المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
};

const emptyRating = (): ProductionWorkerStarRating => ({
  behavior: 0,
  ethics: 0,
  work: 0,
});

const ratingRecordToStarRating = (record?: ProductionWorkerRatingRecord): ProductionWorkerStarRating | undefined => {
  if (!record) return undefined;
  return {
    behavior: record.behavioralRating,
    ethics: record.ethicalRating,
    work: record.practicalRating,
    notes: record.notes,
    ratedBySupervisorId: record.supervisorId,
    ratedBySupervisorName: record.supervisorName,
    updatedAt: record.updatedAt,
  };
};

const getPeriodRange = (period: Period, ratingDate: string) => {
  const today = getTodayDateString();
  if (period === 'all') return { start: '1900-01-01', end: '2999-12-31' };
  if (period === 'daily') return { start: ratingDate || today, end: ratingDate || today };
  if (period === 'yesterday') {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const day = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    return { start: day, end: day };
  }
  if (period === 'weekly') {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    return {
      start: `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`,
      end: today,
    };
  }
  return { start: `${today.slice(0, 7)}-01`, end: today };
};

function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const normalizedValue = Math.max(0, Math.min(5, Number.isFinite(value) ? value : 0));
  const label = `التقييم ${normalizedValue} من 5`;

  return (
    <div className="inline-flex flex-row-reverse items-center gap-1 sm:gap-0.5" aria-label={label} title={label}>
      {[1, 2, 3, 4, 5].map((star) => {
        const fillPercent = Math.max(0, Math.min(100, (normalizedValue - (star - 1)) * 100));

        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onChange(star)}
            className={`relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors sm:h-5 sm:w-5 sm:rounded-none ${
              disabled ? 'cursor-default opacity-80' : 'hover:text-amber-500'
            }`}
            aria-label={`تقييم ${star} من 5`}
            title={`تقييم ${star} من 5`}
          >
            <Star aria-hidden="true" className="h-5 w-5 text-slate-300 sm:h-4 sm:w-4" strokeWidth={2.2} />
            <span
              aria-hidden="true"
              className="absolute inset-0 inline-flex items-center justify-center overflow-hidden text-amber-400"
              style={{ clipPath: `inset(0 0 0 ${100 - fillPercent}%)` }}
            >
              <Star className="h-5 w-5 fill-current sm:h-4 sm:w-4" strokeWidth={2.2} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export const SupervisorWorkerEvaluation: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const productionPlans = useAppStore((s) => s.productionPlans);
  const productionLines = useAppStore((s) => s.productionLines);
  const systemSettings = useAppStore((s) => s.systemSettings);

  const isSelfSupervisorPage = !id;
  const [employee, setEmployee] = useState<FirestoreEmployee | null>(null);
  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [productionWorkers, setProductionWorkers] = useState<ProductionWorker[]>([]);
  const [workerRatings, setWorkerRatings] = useState<ProductionWorkerRatingRecord[]>([]);
  const [ratingDrafts, setRatingDrafts] = useState<Record<string, ProductionWorkerStarRating>>({});
  const [ratingLineAssignments, setRatingLineAssignments] = useState<LineWorkerAssignment[]>([]);
  const [ratingDate, setRatingDate] = useState(getTodayDateString());
  const [period, setPeriod] = useState<Period>('daily');
  const [loading, setLoading] = useState(true);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [savingRatingWorkerId, setSavingRatingWorkerId] = useState<string | null>(null);

  const canRateWorkers = can('production.workers.manage') || can('hr.evaluation.create') || (isSelfSupervisorPage && employee?.level === 2);
  const supervisorRatingKey = employee?.id || (id ? decodeURIComponent(String(id)).trim() : '');
  const supervisorIdentityIds = useMemo(() => (
    Array.from(new Set([
      id ? decodeURIComponent(String(id)).trim() : '',
      employee?.id ?? '',
      employee?.userId ?? '',
      employee?.code ?? '',
    ].filter(Boolean)))
  ), [employee?.code, employee?.id, employee?.userId, id]);

  const getLineName = useCallback((lineId?: string) => (
    productionLines.find((line) => line.id === lineId)?.name ?? lineId ?? '—'
  ), [productionLines]);

  useEffect(() => {
    const lookupId = id ? decodeURIComponent(String(id)).trim() : String(uid || '').trim();
    if (!lookupId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [empById, empByUserId, workerRows] = await Promise.all([
          employeeService.getById(lookupId),
          employeeService.getByUserId(lookupId),
          productionWorkerService.getAll().catch(() => [] as ProductionWorker[]),
        ]);
        if (cancelled) return;

        const employeeFromStore = _rawEmployees.find((emp) => emp.id === lookupId || emp.userId === lookupId || emp.code === lookupId) ?? null;
        const resolvedEmployee = empById ?? empByUserId ?? employeeFromStore;
        if (isSelfSupervisorPage && resolvedEmployee?.level !== 2) {
          setEmployee(null);
          setLoading(false);
          return;
        }

        const resolvedEmployeeId = resolvedEmployee?.id ?? lookupId;
        const supervisorIdsToTry = Array.from(new Set([lookupId, resolvedEmployeeId].filter(Boolean)));
        const [directReports, supervisorOrderBuckets] = await Promise.all([
          reportService.getByEmployee(resolvedEmployeeId).catch(() => [] as ProductionReport[]),
          Promise.all(supervisorIdsToTry.map((sid) => workOrderService.getBySupervisor(sid).catch(() => [] as WorkOrder[]))),
        ]);
        if (cancelled) return;

        const supervisorOrders = Array.from(
          new Map(
            supervisorOrderBuckets
              .flat()
              .map((wo) => [wo.id || `${wo.workOrderNumber}__${wo.lineId}__${wo.productId}`, wo]),
          ).values(),
        );

        let reportsByWorkOrder: ProductionReport[][] = [];
        try {
          reportsByWorkOrder = await Promise.all(
            supervisorOrders
              .map((wo) => wo.id)
              .filter((woId): woId is string => !!woId)
              .map((woId) => reportService.getByWorkOrderId(woId)),
          );
        } catch (reportsByWorkOrderError) {
          console.warn('SupervisorWorkerEvaluation workOrder reports fallback:', reportsByWorkOrderError);
        }
        if (cancelled) return;

        const reportMap = new Map<string, ProductionReport>();
        const upsertReport = (report: ProductionReport) => {
          const key = report.id || `${report.date}__${report.lineId}__${report.productId}__${report.employeeId}__${report.workOrderId || ''}`;
          reportMap.set(key, report);
        };
        directReports.forEach(upsertReport);
        reportsByWorkOrder.flat().forEach(upsertReport);

        setEmployee(resolvedEmployee);
        setProductionWorkers(workerRows);
        setWorkOrders(supervisorOrders);
        setReports(Array.from(reportMap.values()).sort((a, b) => (b.date || '').localeCompare(a.date || '')));
      } catch (error) {
        console.error('SupervisorWorkerEvaluation load error:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [id, isSelfSupervisorPage, uid, _rawEmployees]);

  const periodRange = useMemo(() => getPeriodRange(period, ratingDate), [period, ratingDate]);
  const periodReports = useMemo(() => (
    reports.filter((report) => report.date >= periodRange.start && report.date <= periodRange.end)
  ), [periodRange.end, periodRange.start, reports]);
  const periodPlans = useMemo(() => {
    const supervisorIdSet = new Set(supervisorIdentityIds);
    const workOrderSupervisorById = new Map(workOrders.filter((wo) => wo.id).map((wo) => [wo.id!, wo.supervisorId]));
    return productionPlans.filter((plan) => {
      const planDate = plan.startDate || plan.plannedStartDate || '';
      const workOrderSupervisorId = plan.workOrderId ? workOrderSupervisorById.get(plan.workOrderId) : undefined;
      return (
        planDate >= periodRange.start
        && planDate <= periodRange.end
        && (
          Boolean(plan.supervisorId && supervisorIdSet.has(plan.supervisorId))
          || Boolean(workOrderSupervisorId && supervisorIdSet.has(workOrderSupervisorId))
        )
      );
    });
  }, [periodRange.end, periodRange.start, productionPlans, supervisorIdentityIds, workOrders]);

  const workerById = useMemo(
    () => new Map(productionWorkers.filter((worker) => worker.id).map((worker) => [worker.id!, worker])),
    [productionWorkers],
  );
  const workerByEmployeeId = useMemo(
    () => new Map(productionWorkers.filter((worker) => worker.employeeId).map((worker) => [worker.employeeId!, worker])),
    [productionWorkers],
  );
  const workerRatingByWorkerId = useMemo(
    () => new Map(workerRatings.map((rating) => [rating.workerId, rating])),
    [workerRatings],
  );

  const ratingAssignmentLineIds = useMemo(() => {
    const lineIds = new Set<string>();
    periodReports
      .filter((report) => report.date === ratingDate)
      .forEach((report) => {
        if (report.lineId) lineIds.add(report.lineId);
      });
    productionPlans
      .filter((plan) => (plan.startDate || plan.plannedStartDate) === ratingDate && supervisorIdentityIds.includes(plan.supervisorId || ''))
      .forEach((plan) => {
        if (plan.lineId) lineIds.add(plan.lineId);
      });
    return Array.from(lineIds);
  }, [periodReports, productionPlans, ratingDate, supervisorIdentityIds]);

  useEffect(() => {
    if (!ratingDate || ratingAssignmentLineIds.length === 0) {
      setRatingLineAssignments([]);
      return;
    }

    let cancelled = false;
    Promise.all(ratingAssignmentLineIds.map((lineId) => (
      lineAssignmentService.getByLineAndDate(lineId, ratingDate).catch(() => [] as LineWorkerAssignment[])
    )))
      .then((buckets) => {
        if (!cancelled) setRatingLineAssignments(buckets.flat());
      });
    return () => { cancelled = true; };
  }, [ratingAssignmentLineIds, ratingDate]);

  useEffect(() => {
    if (!supervisorRatingKey || !ratingDate) {
      setWorkerRatings([]);
      setRatingDrafts({});
      return;
    }

    let cancelled = false;
    setRatingsLoading(true);
    productionWorkerRatingService.getBySupervisorAndDate(supervisorRatingKey, ratingDate)
      .then((rows) => {
        if (cancelled) return;
        setWorkerRatings(rows);
        setRatingDrafts(Object.fromEntries(
          rows.map((row) => [row.workerId, ratingRecordToStarRating(row) ?? emptyRating()]),
        ));
      })
      .finally(() => {
        if (!cancelled) setRatingsLoading(false);
      });
    return () => { cancelled = true; };
  }, [ratingDate, supervisorRatingKey]);

  const supervisorBonusSettings = useMemo(() => ({
    ...DEFAULT_PRODUCTION_WORKER_SETTINGS.supervisorBonus,
    ...(systemSettings.productionWorkerSettings?.supervisorBonus ?? {}),
    tiers: systemSettings.productionWorkerSettings?.supervisorBonus?.tiers?.length
      ? systemSettings.productionWorkerSettings.supervisorBonus.tiers
      : DEFAULT_PRODUCTION_WORKER_SETTINGS.supervisorBonus.tiers,
  }), [systemSettings.productionWorkerSettings?.supervisorBonus]);
  const supervisorBonus = useMemo(
    () => calculateSupervisorTeamBonusEstimate({
      settings: supervisorBonusSettings,
      reports: periodReports,
    }),
    [periodReports, supervisorBonusSettings],
  );

  const teamWorkerRows = useMemo<SupervisorWorkerRatingRow[]>(() => {
    const rows = new Map<string, SupervisorWorkerRatingRow>();

    const applyRating = (row: SupervisorWorkerRatingRow): SupervisorWorkerRatingRow => {
      const ratingRecord = workerRatingByWorkerId.get(row.workerId);
      const historicalRating = ratingRecordToStarRating(ratingRecord);
      return {
        ...row,
        lineName: row.lineName || getLineName(row.lineId),
        rating: ratingDrafts[row.workerId]
          ?? historicalRating
          ?? (supervisorRatingKey ? row.worker?.supervisorRatings?.[supervisorRatingKey] : undefined),
        ratingRecord,
      };
    };

    supervisorBonus.workerContributions.forEach((row) => {
      const worker = workerById.get(row.workerId);
      rows.set(row.workerId, applyRating({
        ...row,
        workerName: worker?.name || row.workerName,
        workerCode: worker?.code,
        employeeId: worker?.employeeId,
        productionTargetApplicable: row.targetQty > 0,
        achieved: row.targetQty > 0 && row.achievementPercent >= 100,
        worker,
      }));
    });

    ratingLineAssignments.forEach((assignment) => {
      const worker = workerByEmployeeId.get(assignment.employeeId);
      const workerId = worker?.id || assignment.employeeId || assignment.employeeCode || assignment.employeeName;
      if (!workerId || rows.has(workerId)) {
        const existing = rows.get(workerId);
        if (existing && !existing.laborRole) {
          rows.set(workerId, applyRating({
            ...existing,
            employeeId: existing.employeeId || assignment.employeeId,
            lineId: existing.lineId || assignment.lineId,
            lineName: existing.lineName || getLineName(assignment.lineId),
            laborRole: resolveLineWorkerLaborRole(assignment.laborRole),
          }));
        }
        return;
      }

      rows.set(workerId, applyRating({
        workerId,
        workerName: worker?.name || assignment.employeeName || assignment.employeeId,
        workerCode: worker?.code || assignment.employeeCode,
        employeeId: assignment.employeeId,
        lineId: assignment.lineId,
        lineName: getLineName(assignment.lineId),
        laborRole: resolveLineWorkerLaborRole(assignment.laborRole),
        targetQty: 0,
        outputQty: 0,
        cappedOutputQty: 0,
        achievementPercent: 0,
        productionTargetApplicable: false,
        achieved: false,
        worker,
      }));
    });

    workerRatings.forEach((ratingRecord) => {
      if (rows.has(ratingRecord.workerId)) return;
      const worker = workerById.get(ratingRecord.workerId);
      rows.set(ratingRecord.workerId, applyRating({
        workerId: ratingRecord.workerId,
        workerName: worker?.name || ratingRecord.workerName || ratingRecord.workerId,
        workerCode: worker?.code || ratingRecord.workerCode,
        employeeId: worker?.employeeId || ratingRecord.employeeId,
        laborRole: ratingRecord.laborRole,
        targetQty: 0,
        outputQty: 0,
        cappedOutputQty: 0,
        achievementPercent: 0,
        productionTargetApplicable: false,
        achieved: false,
        worker,
      }));
    });

    return Array.from(rows.values()).sort((a, b) => {
      if (a.productionTargetApplicable !== b.productionTargetApplicable) return a.productionTargetApplicable ? -1 : 1;
      return b.achievementPercent - a.achievementPercent || a.workerName.localeCompare(b.workerName, 'ar');
    });
  }, [
    getLineName,
    ratingDrafts,
    ratingLineAssignments,
    supervisorBonus.workerContributions,
    supervisorRatingKey,
    workerByEmployeeId,
    workerById,
    workerRatingByWorkerId,
    workerRatings,
  ]);

  const saveWorkerRating = useCallback(async (
    row: SupervisorWorkerRatingRow,
    ratingInput: ProductionWorkerStarRating,
  ) => {
    if (!canRateWorkers || !supervisorRatingKey) return;
    const nextRating: ProductionWorkerStarRating = {
      ...emptyRating(),
      ...ratingInput,
      ratedBySupervisorId: supervisorRatingKey,
      ratedBySupervisorName: employee?.name,
      updatedAt: new Date().toISOString(),
    };

    setSavingRatingWorkerId(row.worker?.id || row.workerId);
    try {
      let worker = row.worker;
      let workerId = worker?.id;
      if (!workerId && row.employeeId) {
        workerId = await lineAssignmentWorkerBridge.ensureProductionWorkerForEmployee({
          employeeId: row.employeeId,
          name: row.workerName || row.employeeId,
          code: row.workerCode,
          defaultLineId: row.lineId,
        }) ?? undefined;
        worker = workerId ? await productionWorkerService.getById(workerId) ?? undefined : undefined;
      }
      if (!workerId || !worker) return;

      const ratingId = await productionWorkerRatingService.upsertSupervisorRating({
        workerId,
        workerName: worker.name || row.workerName,
        workerCode: worker.code || row.workerCode,
        employeeId: worker.employeeId || row.employeeId,
        laborRole: row.laborRole,
        supervisorId: supervisorRatingKey,
        supervisorName: employee?.name,
        date: ratingDate,
        period: ratingDate,
        behavioralRating: Number(nextRating.behavior || 0),
        ethicalRating: Number(nextRating.ethics || 0),
        practicalRating: Number(nextRating.work || 0),
        notes: nextRating.notes,
      });
      const supervisorRatings = {
        ...(worker.supervisorRatings ?? {}),
        [supervisorRatingKey]: nextRating,
      };
      await productionWorkerService.update(workerId, { supervisorRatings });

      const nextRecord: ProductionWorkerRatingRecord = {
        id: ratingId || row.ratingRecord?.id,
        workerId,
        workerName: worker.name || row.workerName,
        workerCode: worker.code || row.workerCode,
        employeeId: worker.employeeId || row.employeeId,
        laborRole: row.laborRole,
        supervisorId: supervisorRatingKey,
        supervisorName: employee?.name,
        date: ratingDate,
        period: ratingDate,
        behavioralRating: nextRating.behavior,
        ethicalRating: nextRating.ethics,
        practicalRating: nextRating.work,
        notes: nextRating.notes,
        managementReview: row.ratingRecord?.managementReview ?? { status: 'pending' },
        updatedAt: nextRating.updatedAt,
      };
      setWorkerRatings((prev) => [...prev.filter((rating) => rating.workerId !== workerId), nextRecord]);
      setRatingDrafts((prev) => ({ ...prev, [row.workerId]: nextRating, [workerId]: nextRating }));
      setProductionWorkers((prev) => {
        const nextWorker = { ...worker, supervisorRatings };
        return prev.some((current) => current.id === workerId)
          ? prev.map((current) => (current.id === workerId ? nextWorker : current))
          : [...prev, nextWorker];
      });
    } finally {
      setSavingRatingWorkerId(null);
    }
  }, [canRateWorkers, employee?.name, ratingDate, supervisorRatingKey]);

  const handleWorkerRatingChange = useCallback((
    row: SupervisorWorkerRatingRow,
    field: keyof Pick<ProductionWorkerStarRating, 'behavior' | 'ethics' | 'work'>,
    value: number,
  ) => {
    const nextRating = {
      ...emptyRating(),
      ...(row.rating ?? {}),
      [field]: value,
    };
    setRatingDrafts((prev) => ({ ...prev, [row.workerId]: nextRating }));
    void saveWorkerRating(row, nextRating);
  }, [saveWorkerRating]);

  const handleWorkerRatingNotesChange = useCallback((workerId: string, notes: string) => {
    setRatingDrafts((prev) => ({
      ...prev,
      [workerId]: {
        ...emptyRating(),
        ...(prev[workerId] ?? {}),
        notes,
      },
    }));
  }, []);

  if (loading) return <LoadingSkeleton rows={8} />;

  if (!employee) {
    return (
      <Card>
        <div className="p-6 text-center text-sm font-medium text-[var(--color-text-muted)]">
          لم يتم العثور على بيانات المشرف.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="تقييم عمال المشرف"
        subtitle={employee.name ? `صفحة مستقلة لتقييم العمالة - ${employee.name}` : 'صفحة مستقلة لتقييم العمالة'}
        secondaryAction={{
          label: 'رجوع للمشرف',
          onClick: () => navigate(id ? `/supervisors/${encodeURIComponent(id)}` : '/my-workers'),
        }}
      />

      <Card>
        <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-base font-bold text-[var(--color-text)]">تقييم يومي / دوري</h3>
            <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">
              اختر تاريخ التقييم وفترة بيانات الأهداف. حفظ نفس العامل في نفس اليوم من نفس المشرف يحدث السجل الحالي.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm font-bold text-[var(--color-text-muted)]">
              تاريخ التقييم
              <input
                type="date"
                className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm font-bold text-[var(--color-text)]"
                value={ratingDate}
                onChange={(event) => setRatingDate(event.target.value)}
              />
            </label>
            <label className="text-sm font-bold text-[var(--color-text-muted)]">
              فترة بيانات الهدف
              <select
                className="mt-1 block w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm font-bold text-[var(--color-text)]"
                value={period}
                onChange={(event) => setPeriod(event.target.value as Period)}
              >
                {PERIOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-[var(--color-border)] p-4 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <div className="text-xs font-bold text-[var(--color-text-muted)]">العمالة المعروضة</div>
            <div className="mt-1 text-xl font-black text-[var(--color-text)]">{teamWorkerRows.length}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <div className="text-xs font-bold text-[var(--color-text-muted)]">تقارير الفترة</div>
            <div className="mt-1 text-xl font-black text-[var(--color-text)]">{periodReports.length}</div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <div className="text-xs font-bold text-[var(--color-text-muted)]">خطط الفترة</div>
            <div className="mt-1 text-xl font-black text-[var(--color-text)]">{periodPlans.length}</div>
          </div>
        </div>

        {teamWorkerRows.length === 0 ? (
          <div className="p-8 text-center text-[var(--color-text-muted)]">
            <span className="material-icons-round mb-2 block text-4xl opacity-40">groups</span>
            لا توجد عمالة مرتبطة بهذا المشرف في التاريخ أو الفترة المختارة.
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="space-y-3 md:hidden">
              {teamWorkerRows.map((row) => {
                const rating = row.rating ?? emptyRating();
                const disabled = !canRateWorkers || savingRatingWorkerId === (row.worker?.id || row.workerId);
                const reviewStatus = row.ratingRecord?.managementReview?.status ?? 'pending';
                return (
                  <div key={row.workerId} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="truncate text-base font-bold text-[var(--color-text)]">{row.workerName}</h4>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-[var(--color-text-muted)]">
                          {row.workerCode && <span className="rounded-full bg-slate-100 px-2 py-1">{row.workerCode}</span>}
                          {row.laborRole && (
                            <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
                              {LINE_WORKER_LABOR_ROLE_LABELS[row.laborRole]}
                            </span>
                          )}
                          {row.lineId && <span className="rounded-full bg-slate-100 px-2 py-1">{row.lineName || getLineName(row.lineId)}</span>}
                        </div>
                      </div>
                      <Badge variant={reviewStatus === 'approved' ? 'success' : reviewStatus === 'rejected' ? 'danger' : 'warning'}>
                        {REVIEW_STATUS_LABELS[reviewStatus] ?? REVIEW_STATUS_LABELS.pending}
                      </Badge>
                    </div>
                    {!row.worker?.id && (
                      <p className="mt-2 text-xs font-bold text-amber-600">سيتم إنشاء/ربط ملف العامل عند الحفظ</p>
                    )}
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-xs font-bold text-[var(--color-text-muted)]">حالة الهدف</div>
                        <div className="mt-1">
                          <Badge variant={!row.productionTargetApplicable ? 'neutral' : row.achieved ? 'success' : 'warning'}>
                            {!row.productionTargetApplicable ? 'غير مطبق' : row.achieved ? 'حقق الهدف' : 'لم يحقق'}
                          </Badge>
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-xs font-bold text-[var(--color-text-muted)]">نسبة الهدف</div>
                        <div className="mt-1 text-lg font-bold text-[var(--color-text)]">
                          {row.productionTargetApplicable ? `${row.achievementPercent}%` : '-'}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3 rounded-xl border border-[var(--color-border)] p-3">
                      <div className="text-sm font-bold text-[var(--color-text)]">تقييم المشرف</div>
                      {RATING_FIELDS.map((field) => (
                        <div key={field.key} className="flex flex-col gap-2">
                          <span className="text-xs font-bold text-[var(--color-text-muted)]">{field.label}</span>
                          <StarRating
                            value={Number(rating[field.key] || 0)}
                            disabled={disabled}
                            onChange={(value) => void handleWorkerRatingChange(row, field.key, value)}
                          />
                        </div>
                      ))}
                    </div>
                    <label className="mt-4 block text-xs font-bold text-[var(--color-text-muted)]">
                      ملاحظات المشرف
                      <textarea
                        rows={3}
                        disabled={disabled}
                        className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm font-medium text-[var(--color-text)] disabled:opacity-60"
                        placeholder="ملاحظة اختيارية"
                        value={rating.notes ?? ''}
                        onChange={(event) => handleWorkerRatingNotesChange(row.workerId, event.target.value)}
                      />
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-2 h-10 w-full text-sm"
                      disabled={disabled}
                      onClick={() => void saveWorkerRating(row, rating)}
                    >
                      حفظ الملاحظة
                    </Button>
                    {ratingsLoading && (
                      <div className="mt-2 text-[10px] font-bold text-primary">تحميل...</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="erp-table w-full text-sm">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">العامل</th>
                    <th className="erp-th text-center">الحالة</th>
                    <th className="erp-th text-center">نسبة الهدف</th>
                    {RATING_FIELDS.map((field) => (
                      <th key={field.key} className="erp-th text-center">{field.label}</th>
                    ))}
                    <th className="erp-th">ملاحظات المشرف</th>
                    <th className="erp-th text-center">مراجعة الإدارة</th>
                  </tr>
                </thead>
                <tbody>
                  {teamWorkerRows.map((row) => {
                    const rating = row.rating ?? emptyRating();
                    const disabled = !canRateWorkers || savingRatingWorkerId === (row.worker?.id || row.workerId);
                    const reviewStatus = row.ratingRecord?.managementReview?.status ?? 'pending';
                    return (
                      <tr key={row.workerId} className="border-b border-[var(--color-border)]">
                        <td className="px-4 py-3">
                          <div className="font-bold text-[var(--color-text)]">{row.workerName}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-[var(--color-text-muted)]">
                            {row.workerCode && <span>{row.workerCode}</span>}
                            {row.laborRole && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                                {LINE_WORKER_LABOR_ROLE_LABELS[row.laborRole]}
                              </span>
                            )}
                            {row.lineId && <span>{row.lineName || getLineName(row.lineId)}</span>}
                            {!row.worker?.id && <span className="text-amber-600">سيتم إنشاء/ربط ملف العامل عند الحفظ</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={!row.productionTargetApplicable ? 'neutral' : row.achieved ? 'success' : 'warning'}>
                            {!row.productionTargetApplicable ? 'غير مطبق' : row.achieved ? 'حقق الهدف' : 'لم يحقق'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center font-bold">
                          {row.productionTargetApplicable ? `${row.achievementPercent}%` : '-'}
                        </td>
                        {RATING_FIELDS.map((field) => (
                          <td key={field.key} className="px-4 py-3 text-center">
                            <StarRating
                              value={Number(rating[field.key] || 0)}
                              disabled={disabled}
                              onChange={(value) => void handleWorkerRatingChange(row, field.key, value)}
                            />
                          </td>
                        ))}
                        <td className="min-w-[220px] px-4 py-3">
                          <textarea
                            rows={2}
                            disabled={disabled}
                            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-xs font-medium text-[var(--color-text)] disabled:opacity-60"
                            placeholder="ملاحظة اختيارية"
                            value={rating.notes ?? ''}
                            onChange={(event) => handleWorkerRatingNotesChange(row.workerId, event.target.value)}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-2 h-8 text-xs"
                            disabled={disabled}
                            onClick={() => void saveWorkerRating(row, rating)}
                          >
                            حفظ الملاحظة
                          </Button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={reviewStatus === 'approved' ? 'success' : reviewStatus === 'rejected' ? 'danger' : 'warning'}>
                            {REVIEW_STATUS_LABELS[reviewStatus] ?? REVIEW_STATUS_LABELS.pending}
                          </Badge>
                          {ratingsLoading && (
                            <div className="mt-1 text-[10px] font-bold text-primary">تحميل...</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!canRateWorkers && (
              <p className="text-xs font-medium text-[var(--color-text-muted)]">
                تحتاج صلاحية إدارة عمال الإنتاج أو إنشاء تقييم موظف لتعديل النجوم.
              </p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
