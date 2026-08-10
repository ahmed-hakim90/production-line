import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { Button } from '@/components/ui/button';
import { DetailPageStickyHeader, SectionSkeleton, SURFACE_CARD } from '@/src/components/erp/DetailPageChrome';
import { KPIBox, Badge } from '../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { useManagedPrint } from '@/utils/printManager';
import { usePermission } from '../../../utils/permissions';
import { reportService } from '@/modules/production/services/reportService';
import { workOrderService } from '@/modules/production/services/workOrderService';
import { productionWorkerService } from '@/modules/production/services/productionWorkerService';
import { employeeService } from '../../hr/employeeService';
import { calculateWorkOrderExecutionMetrics, getExecutionDeviationTone, formatNumber, calculateWasteRatio, getTodayDateString, getReportWaste, normalizeDateInputToYmd, sumMaxWorkHoursByDate } from '../../../utils/calculations';
import { JOB_LEVEL_LABELS, type JobLevel } from '../../hr/types';
import { EMPLOYMENT_TYPE_LABELS } from '../../../types';
import { DEFAULT_PRODUCTION_WORKER_SETTINGS, type ProductionReport, type ProductionPlan, type FirestoreEmployee, type WorkOrder, type ProductionWorker } from '../../../types';
import { calculateSupervisorTeamBonusEstimate } from '../services/productionBonusEngine';
import type { FirestoreDepartment, FirestoreJobPosition, FirestoreShift } from '../../hr/types';
import { getDocs } from 'firebase/firestore';
import { departmentsRef, jobPositionsRef, shiftsRef } from '../../hr/collections';
import { ProductionReportPrint, mapReportsToPrintRows, computePrintTotals } from '../components/ProductionReportPrint';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { fetchCachedPageData, peekPageDataCache } from '../../shared/lib/pageDataCache';
import { PRODUCTION_REPORT_CREATE_PATHS, PRODUCTION_REPORT_OPERATION_KEYS, isOperationPathEnabled } from '../../system/lib/operationPathSettings';

// â”€â”€â”€ Performance Score â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function countUniqueDaysInRange(reports: ProductionReport[], start: string, end: string): number {
  const dates = new Set<string>();
  for (const r of reports) {
    if (r.date >= start && r.date <= end) dates.add(r.date);
  }
  return dates.size;
}

function daysBetweenInclusive(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 1;
  const ms = endDate.getTime() - startDate.getTime();
  return Math.max(1, Math.floor(ms / (1000 * 60 * 60 * 24)) + 1);
}

function computeSupervisorLikePerformanceScore(
  reports: ProductionReport[],
  rangeStart: string,
  rangeEnd: string,
  productAvgDailyById: Map<string, number>,
): number {
  const totalDaysInRange = daysBetweenInclusive(rangeStart, rangeEnd);
  const activeDays = countUniqueDaysInRange(reports, rangeStart, rangeEnd);
  const totalProduced = reports.reduce((sum, r) => sum + Math.max(0, Number(r.quantityProduced ?? 0)), 0);
  const avgDailyActual = activeDays > 0 ? totalProduced / activeDays : 0;
  const benchmarkWeight = reports.reduce((sum, r) => sum + Math.max(0, Number(r.quantityProduced ?? 0)), 0);
  const benchmarkWeightedSum = reports.reduce((sum, r) => {
    const qty = Math.max(0, Number(r.quantityProduced ?? 0));
    const ref = productAvgDailyById.get(r.productId) || 0;
    return sum + (ref * qty);
  }, 0);
  const fallbackBenchmark = reports.length > 0
    ? reports.reduce((sum, r) => sum + (productAvgDailyById.get(r.productId) || 0), 0) / reports.length
    : 0;
  const benchmarkDaily = benchmarkWeight > 0 ? (benchmarkWeightedSum / benchmarkWeight) : fallbackBenchmark;
  const daysCommitmentPct = totalDaysInRange > 0 ? (activeDays / totalDaysInRange) * 100 : 0;
  const throughputPct = benchmarkDaily > 0 ? (avgDailyActual / benchmarkDaily) * 100 : (avgDailyActual > 0 ? 100 : 0);

  const lineReportsMap = new Map<string, ProductionReport[]>();
  for (const report of reports) {
    const lineId = String(report.lineId || '').trim();
    if (!lineId) continue;
    const arr = lineReportsMap.get(lineId) ?? [];
    arr.push(report);
    lineReportsMap.set(lineId, arr);
  }

  const performanceByLine = Array.from(lineReportsMap.values()).map((lineReports) => {
    const produced = lineReports.reduce((sum, r) => sum + Math.max(0, Number(r.quantityProduced ?? 0)), 0);
    const lineActiveDays = countUniqueDaysInRange(lineReports, rangeStart, rangeEnd);
    const lineAvgDailyActual = lineActiveDays > 0 ? produced / lineActiveDays : 0;
    const lineBenchmarkWeight = lineReports.reduce((sum, r) => sum + Math.max(0, Number(r.quantityProduced ?? 0)), 0);
    const lineBenchmarkSum = lineReports.reduce((sum, r) => {
      const qty = Math.max(0, Number(r.quantityProduced ?? 0));
      const ref = productAvgDailyById.get(r.productId) || 0;
      return sum + (ref * qty);
    }, 0);
    const lineFallbackBenchmark = lineReports.length > 0
      ? lineReports.reduce((sum, r) => sum + (productAvgDailyById.get(r.productId) || 0), 0) / lineReports.length
      : 0;
    const lineBenchmarkDaily = lineBenchmarkWeight > 0 ? (lineBenchmarkSum / lineBenchmarkWeight) : lineFallbackBenchmark;
    const lineDaysCommitmentPct = totalDaysInRange > 0 ? (lineActiveDays / totalDaysInRange) * 100 : 0;
    const lineThroughputPct = lineBenchmarkDaily > 0 ? (lineAvgDailyActual / lineBenchmarkDaily) * 100 : (lineAvgDailyActual > 0 ? 100 : 0);
    return clamp(Math.round((lineThroughputPct * 0.75) + (lineDaysCommitmentPct * 0.25)), 0, 100);
  });

  const weightedProduced = Array.from(lineReportsMap.values())
    .reduce((sum, lineReports) => sum + lineReports.reduce((s, r) => s + Math.max(0, Number(r.quantityProduced ?? 0)), 0), 0);
  const weightedLineScore = weightedProduced > 0
    ? Array.from(lineReportsMap.values()).reduce((sum, lineReports, idx) => {
        const lineProduced = lineReports.reduce((s, r) => s + Math.max(0, Number(r.quantityProduced ?? 0)), 0);
        return sum + ((performanceByLine[idx] || 0) * lineProduced);
      }, 0) / weightedProduced
    : (performanceByLine.length > 0
        ? performanceByLine.reduce((sum, score) => sum + score, 0) / performanceByLine.length
        : clamp(Math.round((throughputPct * 0.75) + (daysCommitmentPct * 0.25)), 0, 100));

  return clamp(Math.round(weightedLineScore), 0, 100);
}

// â”€â”€â”€ Chart Tab type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type ChartTab = 'production' | 'efficiency' | 'hours';
type DetailTab = 'production' | 'lines' | 'info';
type Period = 'all' | 'daily' | 'yesterday' | 'weekly' | 'monthly';

type SupervisorWorkerRow = {
  workerId: string;
  workerName: string;
  workerCode?: string;
  employeeId?: string;
  lineId?: string;
  targetQty: number;
  outputQty: number;
  cappedOutputQty: number;
  achievementPercent: number;
  productionTargetApplicable: boolean;
  achieved: boolean;
  worker?: ProductionWorker;
};

type SupervisorPlanRow = ProductionPlan & {
  producedSoFar: number;
  remainingQty: number;
  achievementPct: number;
  planDate: string;
  workOrderNumber?: string;
};

const CHART_TABS: { key: ChartTab; label: string; icon: string }[] = [
  { key: 'production', label: 'الإنتاج', icon: 'inventory' },
  { key: 'efficiency', label: 'الكفاءة', icon: 'speed' },
  { key: 'hours', label: 'الساعات', icon: 'schedule' },
];

const DETAIL_TABS: { id: DetailTab; label: string; icon: string }[] = [
  { id: 'production', label: 'الإنتاج', icon: 'inventory' },
  { id: 'lines', label: 'الخطوط', icon: 'precision_manufacturing' },
  { id: 'info', label: 'معلومات الموظف', icon: 'badge' },
];

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'all', label: 'كل البيانات' },
  { value: 'daily', label: 'اليوم' },
  { value: 'yesterday', label: 'أمس' },
  { value: 'weekly', label: 'أسبوعي' },
  { value: 'monthly', label: 'شهري' },
];

const PLAN_STATUS_LABELS: Record<ProductionPlan['status'], { label: string; variant: 'success' | 'warning' | 'info' | 'neutral' | 'danger' }> = {
  planned: { label: 'مخطط', variant: 'info' },
  in_progress: { label: 'قيد التنفيذ', variant: 'warning' },
  completed: { label: 'مكتمل', variant: 'success' },
  paused: { label: 'متوقف', variant: 'neutral' },
  cancelled: { label: 'ملغي', variant: 'danger' },
};

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

export const SupervisorDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();
  const isSelfSupervisorPage = !id;

  const uid = useAppStore((s) => s.uid);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const employees = useAppStore((s) => s.employees);
  const productionLines = useAppStore((s) => s.productionLines);
  const products = useAppStore((s) => s.products);
  const productionPlans = useAppStore((s) => s.productionPlans);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const systemSettings = useAppStore((s) => s.systemSettings);

  type SupervisorDetailsPageData = {
    employee: FirestoreEmployee | null;
    departments: FirestoreDepartment[];
    jobPositions: FirestoreJobPosition[];
    shifts: FirestoreShift[];
    reports: ProductionReport[];
    workOrders: WorkOrder[];
    productionWorkers: ProductionWorker[];
  };

  const supervisorLookupId = id ? decodeURIComponent(String(id)).trim() : String(uid || '').trim();
  const supervisorCacheKey = supervisorLookupId
    ? `production:supervisorDetails:${supervisorLookupId}`
    : null;
  const initialSupervisorCache = supervisorCacheKey
    ? peekPageDataCache<SupervisorDetailsPageData>(supervisorCacheKey)
    : null;

  const [employee, setEmployee] = useState<FirestoreEmployee | null>(() => initialSupervisorCache?.employee ?? null);
  const [departments, setDepartments] = useState<FirestoreDepartment[]>(() => initialSupervisorCache?.departments ?? []);
  const [jobPositions, setJobPositions] = useState<FirestoreJobPosition[]>(() => initialSupervisorCache?.jobPositions ?? []);
  const [shifts, setShifts] = useState<FirestoreShift[]>(() => initialSupervisorCache?.shifts ?? []);
  const [reports, setReports] = useState<ProductionReport[]>(() => initialSupervisorCache?.reports ?? []);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(() => initialSupervisorCache?.workOrders ?? []);
  const [productionWorkers, setProductionWorkers] = useState<ProductionWorker[]>(() => initialSupervisorCache?.productionWorkers ?? []);
  const [loading, setLoading] = useState(() => initialSupervisorCache == null);
  const [activeTab, setActiveTab] = useState<DetailTab>('production');
  const [chartTab, setChartTab] = useState<ChartTab>('production');
  const [period, setPeriod] = useState<Period>('all');

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useManagedPrint({ contentRef: printRef, printSettings: printTemplate });

  useEffect(() => {
    const lookupId = id ? decodeURIComponent(String(id)).trim() : String(uid || '').trim();
    if (!lookupId || !supervisorCacheKey) { setLoading(false); return; }
    const normalizedId = lookupId;
    let cancelled = false;
    const cached = peekPageDataCache<SupervisorDetailsPageData>(supervisorCacheKey);
    if (cached) {
      setEmployee(cached.employee);
      setDepartments(cached.departments);
      setJobPositions(cached.jobPositions);
      setShifts(cached.shifts);
      setReports(cached.reports);
      setWorkOrders(cached.workOrders);
      setProductionWorkers(cached.productionWorkers);
      setLoading(false);
    } else {
      setLoading(true);
    }
    (async () => {
      try {
        const { data } = await fetchCachedPageData(
          supervisorCacheKey,
          async (): Promise<SupervisorDetailsPageData> => {
            const [empById, empByUserId, deptSnap, posSnap, shiftSnap, workerRows] = await Promise.all([
              employeeService.getById(normalizedId),
              employeeService.getByUserId(normalizedId),
              getDocs(departmentsRef()),
              getDocs(jobPositionsRef()),
              getDocs(shiftsRef()),
              productionWorkerService.getAll().catch(() => [] as ProductionWorker[]),
            ]);
            const employeeFromStore = _rawEmployees.find((e) => e.id === normalizedId || e.userId === normalizedId || e.code === normalizedId) ?? null;
            const resolvedEmployee = empById ?? empByUserId ?? employeeFromStore;
            if (isSelfSupervisorPage && resolvedEmployee?.level !== 2) {
              return {
                employee: null,
                departments: [],
                jobPositions: [],
                shifts: [],
                reports: [],
                workOrders: [],
                productionWorkers: [],
              };
            }
            const resolvedEmployeeId = resolvedEmployee?.id ?? normalizedId;
            const supervisorIdsToTry = Array.from(new Set([normalizedId, resolvedEmployeeId].filter(Boolean)));

            const [directReports, supervisorOrderBuckets] = await Promise.all([
              reportService.getByEmployee(resolvedEmployeeId).catch(() => [] as ProductionReport[]),
              Promise.all(
                supervisorIdsToTry.map((sid) =>
                  workOrderService.getBySupervisor(sid).catch(() => []),
                ),
              ),
            ]);
            const supervisorOrders = Array.from(
              new Map(
                supervisorOrderBuckets
                  .flat()
                  .map((wo) => [wo.id || `${wo.workOrderNumber}__${wo.lineId}__${wo.productId}`, wo]),
              ).values(),
            );

            const departmentsData = deptSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreDepartment));
            const jobPositionsData = posSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreJobPosition));
            const shiftsData = shiftSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreShift));

            let reportsByWorkOrder: ProductionReport[][] = [];
            try {
              reportsByWorkOrder = await Promise.all(
                supervisorOrders
                  .map((wo) => wo.id)
                  .filter((woId): woId is string => !!woId)
                  .map((woId) => reportService.getByWorkOrderId(woId)),
              );
            } catch (reportsByWorkOrderError) {
              console.warn('SupervisorDetails workOrder reports fallback:', reportsByWorkOrderError);
            }

            const reportMap = new Map<string, ProductionReport>();
            const upsertReport = (report: ProductionReport) => {
              const key = report.id || `${report.date}__${report.lineId}__${report.productId}__${report.employeeId}__${report.workOrderId || ''}`;
              reportMap.set(key, report);
            };
            directReports.forEach(upsertReport);
            reportsByWorkOrder.flat().forEach(upsertReport);
            const mergedReports = Array.from(reportMap.values()).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            return {
              employee: resolvedEmployee,
              departments: departmentsData,
              jobPositions: jobPositionsData,
              shifts: shiftsData,
              reports: mergedReports,
              workOrders: supervisorOrders,
              productionWorkers: workerRows,
            };
          },
          { maxAgeMs: 60_000 },
        );
        if (cancelled) return;
        setEmployee(data.employee);
        setDepartments(data.departments);
        setJobPositions(data.jobPositions);
        setShifts(data.shifts);
        setProductionWorkers(data.productionWorkers);
        setWorkOrders(data.workOrders);
        setReports(data.reports);
      } catch (e) {
        console.error('SupervisorDetails load error:', e);
        if (!cancelled) {
          const employeeFromStore = _rawEmployees.find((emp) => emp.id === normalizedId || emp.userId === normalizedId || emp.code === normalizedId) ?? null;
          setEmployee(employeeFromStore);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isSelfSupervisorPage, uid, _rawEmployees, supervisorCacheKey]);

  const getDepartmentName = (dId: string) => departments.find((d) => d.id === dId)?.name ?? '—';
  const getJobPositionTitle = (pId: string) => jobPositions.find((j) => j.id === pId)?.title ?? '—';
  const getShiftName = (sId: string) => shifts.find((s) => s.id === sId)?.name ?? '—';
  const getLineName = (lId: string) => productionLines.find((l) => l.id === lId)?.name ?? '—';
  const getProductName = (pId: string) => products.find((p) => p.id === pId)?.name ?? '—';

  const lookups = useMemo(() => ({
    getLineName: (lid: string) => productionLines.find((l) => l.id === lid)?.name ?? '—',
    getProductName: (pid: string) => products.find((p) => p.id === pid)?.name ?? '—',
    getEmployeeName: (eid: string) => employees.find((e) => e.id === eid)?.name ?? '—',
    getUnitsPerCarton: (pid: string) => {
      const n = Number((products.find((p) => p.id === pid) as { unitsPerCarton?: number } | undefined)?.unitsPerCarton ?? 0);
      return n > 0 ? n : undefined;
    },
  }), [productionLines, products, employees]);

  const printRows = useMemo(() => mapReportsToPrintRows(reports, lookups), [reports, lookups]);
  const printTotals = useMemo(() => computePrintTotals(printRows), [printRows]);

  // â”€â”€ Core metrics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const today = getTodayDateString();
  const weekStart = useMemo(() => getWeekStart(), []);
  const periodReports = useMemo(() => {
    if (reports.length === 0) return [];
    if (period === 'all') return reports;

    if (period === 'daily') {
      return reports.filter((r) => r.date === today);
    }

    if (period === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const y = yesterday.getFullYear();
      const m = String(yesterday.getMonth() + 1).padStart(2, '0');
      const d = String(yesterday.getDate()).padStart(2, '0');
      const yesterdayStr = `${y}-${m}-${d}`;
      return reports.filter((r) => r.date === yesterdayStr);
    }

    if (period === 'weekly') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 6);
      const y = weekAgo.getFullYear();
      const m = String(weekAgo.getMonth() + 1).padStart(2, '0');
      const d = String(weekAgo.getDate()).padStart(2, '0');
      const start = `${y}-${m}-${d}`;
      return reports.filter((r) => r.date >= start && r.date <= today);
    }

    const monthPrefix = today.slice(0, 7);
    return reports.filter((r) => r.date.startsWith(monthPrefix));
  }, [reports, period, today]);

  const totalProduced = useMemo(() => periodReports.reduce((s, r) => s + (r.quantityProduced ?? 0), 0), [periodReports]);
  const totalWaste = useMemo(() => periodReports.reduce((s, r) => s + getReportWaste(r), 0), [periodReports]);
  const wasteRatio = useMemo(() => calculateWasteRatio(totalWaste, totalProduced + totalWaste), [totalProduced, totalWaste]);
  const totalWorkerHours = useMemo(() => periodReports.reduce((s, r) => s + (r.workersCount ?? 0) * (r.workHours ?? 0), 0), [periodReports]);
  const totalHours = useMemo(() => sumMaxWorkHoursByDate(periodReports), [periodReports]);
  const avgPerReport = useMemo(() => periodReports.length > 0 ? Math.round(totalProduced / periodReports.length) : 0, [totalProduced, periodReports.length]);
  const uniqueDays = useMemo(() => new Set(periodReports.map((r) => r.date)).size, [periodReports]);

  const todayProduced = useMemo(() => periodReports.filter((r) => r.date === today).reduce((s, r) => s + (r.quantityProduced ?? 0), 0), [periodReports, today]);
  const weekProduced = useMemo(() => periodReports.filter((r) => r.date >= weekStart && r.date <= today).reduce((s, r) => s + (r.quantityProduced ?? 0), 0), [periodReports, weekStart, today]);
  const productAvgDailyById = useMemo(
    () => new Map(products.filter((p) => Boolean(p.id)).map((p) => [String(p.id), Math.max(0, Number((p as any).avgDailyProduction || 0))])),
    [products],
  );

  const target = useMemo(() => {
    let t = 0;
    for (const plan of productionPlans) {
      if (plan.status === 'in_progress' || plan.status === 'planned') {
        const planReports = periodReports.filter((r) => r.lineId === plan.lineId);
        if (planReports.length > 0) t += plan.plannedQuantity ?? 0;
      }
    }
    return t;
  }, [productionPlans, periodReports]);

  const avgWorkersPerReport = useMemo(() => {
    if (periodReports.length === 0) return 0;
    return Math.round(periodReports.reduce((s, r) => s + (r.workersCount ?? 0), 0) / periodReports.length);
  }, [periodReports]);

  const periodRange = useMemo(() => {
    if (period === 'all') {
      return { start: '1900-01-01', end: '2999-12-31' };
    }
    if (period === 'daily') return { start: today, end: today };
    if (period === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const y = yesterday.getFullYear();
      const m = String(yesterday.getMonth() + 1).padStart(2, '0');
      const d = String(yesterday.getDate()).padStart(2, '0');
      const day = `${y}-${m}-${d}`;
      return { start: day, end: day };
    }
    if (period === 'weekly') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 6);
      const y = weekAgo.getFullYear();
      const m = String(weekAgo.getMonth() + 1).padStart(2, '0');
      const d = String(weekAgo.getDate()).padStart(2, '0');
      return { start: `${y}-${m}-${d}`, end: today };
    }
    const monthStart = `${today.slice(0, 7)}-01`;
    return { start: monthStart, end: today };
  }, [period, today]);

  const performanceScore = useMemo(
    () => computeSupervisorLikePerformanceScore(periodReports, periodRange.start, periodRange.end, productAvgDailyById),
    [periodReports, periodRange.start, periodRange.end, productAvgDailyById],
  );
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
  const workerById = useMemo(
    () => new Map(productionWorkers.filter((worker) => worker.id).map((worker) => [worker.id!, worker])),
    [productionWorkers],
  );
  const teamWorkerRows = useMemo<SupervisorWorkerRow[]>(() => {
    const rows = new Map<string, SupervisorWorkerRow>();

    supervisorBonus.workerContributions.forEach((row) => {
      const worker = workerById.get(row.workerId);
      rows.set(row.workerId, {
        ...row,
        workerName: worker?.name || row.workerName,
        workerCode: worker?.code,
        employeeId: worker?.employeeId,
        productionTargetApplicable: row.targetQty > 0,
        achieved: row.targetQty > 0 && row.achievementPercent >= 100,
        worker,
      });
    });

    return Array.from(rows.values()).sort((a, b) => {
      if (a.productionTargetApplicable !== b.productionTargetApplicable) return a.productionTargetApplicable ? -1 : 1;
      return b.achievementPercent - a.achievementPercent || a.workerName.localeCompare(b.workerName, 'ar');
    });
  }, [
    supervisorBonus.workerContributions,
    workerById,
  ]);
  const achievedWorkerRows = useMemo(
    () => teamWorkerRows.filter((row) => row.productionTargetApplicable && row.achieved),
    [teamWorkerRows],
  );
  const belowTargetWorkerRows = useMemo(
    () => teamWorkerRows.filter((row) => row.productionTargetApplicable && !row.achieved),
    [teamWorkerRows],
  );
  const productionTargetWorkerRows = useMemo(
    () => teamWorkerRows.filter((row) => row.productionTargetApplicable),
    [teamWorkerRows],
  );
  const topWorkerRows = useMemo(
    () => [...productionTargetWorkerRows].sort((a, b) => b.achievementPercent - a.achievementPercent).slice(0, 5),
    [productionTargetWorkerRows],
  );
  const bottomWorkerRows = useMemo(
    () => [...productionTargetWorkerRows].sort((a, b) => a.achievementPercent - b.achievementPercent).slice(0, 5),
    [productionTargetWorkerRows],
  );
  const canCreateReport = (
    can('reports.create') || can('reports.componentInjection.manage')
  ) && isOperationPathEnabled(
    systemSettings,
    PRODUCTION_REPORT_OPERATION_KEYS.create,
    PRODUCTION_REPORT_CREATE_PATHS.supervisorDetails,
  );

  const periodWorkOrders = useMemo(() => (
    workOrders.filter((wo) => {
      const createdDate = normalizeDateInputToYmd(wo.createdAt);
      const baseDate = createdDate || wo.targetDate || today;
      return baseDate >= periodRange.start && baseDate <= periodRange.end;
    })
  ), [workOrders, periodRange.start, periodRange.end, today]);

  const activePeriodWorkOrders = useMemo(() => (
    periodWorkOrders.filter((wo) => wo.status === 'pending' || wo.status === 'in_progress')
  ), [periodWorkOrders]);

  const activeExecutionRows = useMemo(() => (
    activePeriodWorkOrders.map((wo) => {
      const producedNow = wo.actualProducedFromScans ?? wo.producedQuantity ?? 0;
      const productAvgDaily = Math.max(0, Number(products.find((p) => p.id === wo.productId)?.avgDailyProduction || 0));
      const execution = calculateWorkOrderExecutionMetrics({
        quantity: wo.quantity,
        producedQuantity: producedNow,
        targetDate: wo.targetDate,
        createdAt: wo.createdAt,
        today,
        benchmarkDailyRate: productAvgDaily,
      });
      const deviationTone = getExecutionDeviationTone(execution.deviationPct);
      const isLateForecast = execution.forecastEndDate !== '—' && execution.forecastEndDate > wo.targetDate;
      return { wo, execution, deviationTone, producedNow, isLateForecast };
    })
  ), [activePeriodWorkOrders, today, products]);

  const executionSummary = useMemo(() => {
    if (activeExecutionRows.length === 0) {
      return {
        avgDailyActual: 0,
        weightedDeviation: null as number | null,
        delayedCount: 0,
        latestForecast: '—',
      };
    }
    const delayedCount = activeExecutionRows.filter((row) => row.isLateForecast).length;
    const totalAvgDaily = activeExecutionRows.reduce((sum, row) => sum + row.execution.avgDailyActual, 0);
    const weightedBase = activeExecutionRows.reduce((sum, row) => sum + row.execution.remainingQty, 0);
    const weightedDeviationRaw = weightedBase > 0
      ? activeExecutionRows.reduce((sum, row) => (
        sum + ((row.execution.deviationPct ?? 0) * row.execution.remainingQty)
      ), 0) / weightedBase
      : null;
    const validForecasts = activeExecutionRows
      .map((row) => row.execution.forecastEndDate)
      .filter((d) => d !== '—');
    const latestForecast = validForecasts.length > 0
      ? [...validForecasts].sort().at(-1) || '—'
      : '—';
    return {
      avgDailyActual: totalAvgDaily / activeExecutionRows.length,
      weightedDeviation: weightedDeviationRaw !== null ? Number(weightedDeviationRaw.toFixed(1)) : null,
      delayedCount,
      latestForecast,
    };
  }, [activeExecutionRows]);

  const supervisorIdentityIds = useMemo(() => (
    Array.from(new Set([
      id ? decodeURIComponent(String(id)).trim() : '',
      employee?.id ?? '',
      employee?.userId ?? '',
      employee?.code ?? '',
    ].filter(Boolean)))
  ), [id, employee?.id, employee?.userId, employee?.code]);

  const workOrderByPlanKey = useMemo(() => {
    const map = new Map<string, WorkOrder>();
    workOrders.forEach((wo) => {
      if (wo.planId) map.set(`plan:${wo.planId}`, wo);
      if (wo.id) map.set(`wo:${wo.id}`, wo);
    });
    return map;
  }, [workOrders]);

  const supervisorPlanRows = useMemo<SupervisorPlanRow[]>(() => {
    const supervisorIdSet = new Set(supervisorIdentityIds);
    return productionPlans
      .filter((plan) => {
        const linkedWorkOrder = (plan.id ? workOrderByPlanKey.get(`plan:${plan.id}`) : undefined)
          ?? (plan.workOrderId ? workOrderByPlanKey.get(`wo:${plan.workOrderId}`) : undefined);
        return Boolean(
          (plan.supervisorId && supervisorIdSet.has(plan.supervisorId))
          || (linkedWorkOrder?.supervisorId && supervisorIdSet.has(linkedWorkOrder.supervisorId)),
        );
      })
      .map((plan) => {
        const linkedWorkOrder = (plan.id ? workOrderByPlanKey.get(`plan:${plan.id}`) : undefined)
          ?? (plan.workOrderId ? workOrderByPlanKey.get(`wo:${plan.workOrderId}`) : undefined);
        const linkedReports = reports.filter((report) => (
          (plan.id && report.productionPlanId === plan.id)
          || (linkedWorkOrder?.id && report.workOrderId === linkedWorkOrder.id)
          || (plan.workOrderId && report.workOrderId === plan.workOrderId)
        ));
        const reportedProduced = linkedReports.reduce((sum, report) => sum + Math.max(0, Number(report.quantityProduced || 0)), 0);
        const producedSoFar = Math.max(
          Math.max(0, Number(plan.producedQuantity || 0)),
          linkedWorkOrder ? Math.max(0, Number(linkedWorkOrder.actualProducedFromScans ?? linkedWorkOrder.producedQuantity ?? 0)) : 0,
          reportedProduced,
        );
        const plannedQuantity = Math.max(0, Number(plan.plannedQuantity || 0));
        const remainingQty = Math.max(0, plannedQuantity - producedSoFar);
        const achievementPct = plannedQuantity > 0 ? Math.round((producedSoFar / plannedQuantity) * 100) : 0;
        const planDate = plan.startDate || plan.plannedStartDate || linkedWorkOrder?.startDate || linkedWorkOrder?.targetDate || today;
        return {
          ...plan,
          workOrderId: plan.workOrderId || linkedWorkOrder?.id,
          supervisorId: plan.supervisorId || linkedWorkOrder?.supervisorId,
          producedSoFar,
          remainingQty,
          achievementPct,
          planDate,
          workOrderNumber: linkedWorkOrder?.workOrderNumber,
        };
      })
      .filter((plan) => (
        period === 'all'
        || (plan.planDate >= periodRange.start && plan.planDate <= periodRange.end)
        || plan.status === 'planned'
        || plan.status === 'in_progress'
      ))
      .sort((a, b) => {
        const statusRank = (status: ProductionPlan['status']) => (
          status === 'in_progress' ? 0 : status === 'planned' ? 1 : status === 'paused' ? 2 : status === 'completed' ? 3 : 4
        );
        return statusRank(a.status) - statusRank(b.status) || b.planDate.localeCompare(a.planDate);
      });
  }, [productionPlans, reports, supervisorIdentityIds, workOrderByPlanKey, period, periodRange.start, periodRange.end, today]);

  const visibleSupervisorPlanRows = useMemo(() => supervisorPlanRows.slice(0, 20), [supervisorPlanRows]);

  const openCreateReportForSupervisorPlan = useCallback((plan: SupervisorPlanRow) => {
    if (!plan.id) return;
    openModal(MODAL_KEYS.REPORTS_CREATE, {
      source: 'supervisorDetails',
      reportType: plan.planType === 'component_injection' ? 'component_injection' : 'finished_product',
      productionPlanId: plan.id,
      productId: plan.productId,
      lineId: plan.lineId,
      supervisorId: plan.supervisorId || employee?.id,
      employeeId: plan.supervisorId || employee?.id,
      date: plan.planDate || today,
      shift: plan.shift,
      workOrderId: plan.workOrderId,
    });
  }, [employee?.id, openModal, today]);

  // â”€â”€ Alerts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const wasteThreshold = systemSettings?.alertSettings?.wasteThreshold ?? 5;

  const alerts = useMemo(() => {
    const result: { type: 'danger' | 'warning' | 'info'; icon: string; message: string }[] = [];
    if (wasteRatio > wasteThreshold) {
      result.push({ type: 'danger', icon: 'delete_sweep', message: `نسبة الهدر مرتفعة: ${wasteRatio}% (الحد المقبول ${wasteThreshold}%)` });
    } else if (wasteRatio > wasteThreshold * 0.6) {
      result.push({ type: 'warning', icon: 'warning', message: `نسبة الهدر تقترب من الحد: ${wasteRatio}%` });
    }
    if (performanceScore < 70) {
      result.push({ type: 'danger', icon: 'speed', message: `درجة الأداء منخفضة: ${performanceScore} من 100` });
    } else if (performanceScore < 85) {
      result.push({ type: 'warning', icon: 'trending_down', message: `درجة الأداء تحتاج تحسين: ${performanceScore} من 100` });
    }
    if (period === 'daily' && todayProduced === 0 && periodReports.length > 0) {
      result.push({ type: 'warning', icon: 'today', message: 'لا يوجد إنتاج مسجل اليوم' });
    }
    if (result.length === 0) {
      result.push({ type: 'info', icon: 'check_circle', message: 'المشرف يعمل بشكل جيد — لا توجد تنبيهات' });
    }
    return result;
  }, [wasteRatio, wasteThreshold, performanceScore, todayProduced, period, periodReports.length]);

  // â”€â”€ Chart data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const enrichedChartData = useMemo(() => {
    const byDate = new Map<string, { produced: number; waste: number; hours: number; workerHours: number; workers: number; count: number }>();
    periodReports.forEach((r) => {
      const prev = byDate.get(r.date) ?? { produced: 0, waste: 0, hours: 0, workerHours: 0, workers: 0, count: 0 };
      prev.produced += r.quantityProduced ?? 0;
      prev.waste += getReportWaste(r);
      prev.hours = Math.max(prev.hours, r.workHours ?? 0);
      prev.workerHours += (r.workersCount ?? 0) * (r.workHours ?? 0);
      prev.workers += r.workersCount ?? 0;
      prev.count++;
      byDate.set(r.date, prev);
    });
    return Array.from(byDate.entries())
      .map(([date, d]) => {
        const efficiency = d.produced > 0 && d.workerHours > 0
          ? Number(((d.produced / d.workerHours) * 10).toFixed(1))
          : 0;
        return {
          date: date.slice(5),
          fullDate: date,
          produced: d.produced,
          waste: d.waste,
          hours: Number(d.hours.toFixed(1)),
          efficiency,
        };
      })
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  }, [periodReports]);

  // â”€â”€ Lines breakdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const lineStats = useMemo(() => {
    const map = new Map<string, { reports: number; produced: number; waste: number; maxHoursByDate: Map<string, number> }>();
    periodReports.forEach((r) => {
      const prev = map.get(r.lineId) ?? { reports: 0, produced: 0, waste: 0, maxHoursByDate: new Map<string, number>() };
      prev.reports++;
      prev.produced += r.quantityProduced ?? 0;
      prev.waste += getReportWaste(r);
      const currentDateHours = prev.maxHoursByDate.get(r.date) ?? 0;
      prev.maxHoursByDate.set(r.date, Math.max(currentDateHours, r.workHours ?? 0));
      map.set(r.lineId, prev);
    });
    return Array.from(map.entries())
      .map(([lineId, stats]) => ({
        lineId,
        name: getLineName(lineId),
        reports: stats.reports,
        produced: stats.produced,
        waste: stats.waste,
        hours: Array.from(stats.maxHoursByDate.values()).reduce((sum, h) => sum + h, 0),
      }))
      .sort((a, b) => b.produced - a.produced);
  }, [periodReports, productionLines]);

  // â”€â”€ Products breakdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const productStats = useMemo(() => {
    const map = new Map<string, { produced: number; waste: number }>();
    periodReports.forEach((r) => {
      const prev = map.get(r.productId) ?? { produced: 0, waste: 0 };
      prev.produced += r.quantityProduced ?? 0;
      prev.waste += getReportWaste(r);
      map.set(r.productId, prev);
    });
    return Array.from(map.entries())
      .map(([productId, stats]) => ({ name: getProductName(productId), ...stats }))
      .sort((a, b) => b.produced - a.produced);
  }, [periodReports, products]);

  const supervisorPageSubtitle = useMemo(() => {
    if (!employee) return 'تفاصيل المشرف';
    const dept = departments.find((d) => d.id === employee.departmentId)?.name ?? '—';
    const job = jobPositions.find((j) => j.id === employee.jobPositionId)?.title ?? '—';
    return `${dept} آ· ${job} آ· ${lineStats.length} خط إنتاج`;
  }, [employee, departments, jobPositions, lineStats.length]);

  // â”€â”€ Chart tooltip â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const ChartTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-3 text-sm">
        <p className="font-bold text-[var(--color-text-muted)] mb-1">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-[var(--color-text-muted)]">{entry.name}:</span>
            <span className="font-bold">{typeof entry.value === 'number' && entry.value > 100 ? formatNumber(entry.value) : entry.value}</span>
          </div>
        ))}
      </div>
    );
  }, []);

  const managerName = useMemo(() => {
    if (!employee?.managerId) return '—';
    return employees.find((e) => e.id === employee.managerId)?.name ?? '—';
  }, [employee, employees]);
  const pageBackAction = isSelfSupervisorPage
    ? { to: '/', label: 'رجوع للوحة' }
    : { to: '/supervisors', label: 'رجوع' };
  const shellBackAction = (
    <Button type="button" variant="ghost" onClick={() => navigate(pageBackAction.to)}>
      {pageBackAction.label}
    </Button>
  );
  const notFoundMessage = isSelfSupervisorPage
    ? 'لا توجد بيانات مشرف مرتبطة بحسابك الحالي'
    : 'المشرف غير موجود';

  // â”€â”€ Loading / Not Found â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const supervisorShellActions = (
    <div className="flex flex-wrap items-center gap-2">
      {shellBackAction}
      {!isSelfSupervisorPage && employee ? (
        <Button type="button" variant="outline" onClick={() => navigate(`/hr/employees/${employee.id || id}`)}>
          الملف الشخصي
        </Button>
      ) : null}
      {can('print') ? (
        <Button type="button" variant="outline" onClick={() => { handlePrint(); }}>
          طباعة
        </Button>
      ) : null}
    </div>
  );

  if (loading) {
    return (
      <ModuleOpsPageShell
        eyebrow={isSelfSupervisorPage ? 'عمالتي وتقييماتهم' : 'تفاصيل المشرف'}
        rangeLabel="جاري التحميل"
        actions={supervisorShellActions}
      >
        <DetailPageStickyHeader>
          <OpsDashPanel title="جاري التحميل" accent="hr">
            <SectionSkeleton rows={2} height={38} />
          </OpsDashPanel>
        </DetailPageStickyHeader>
        <OpsDashPanel title="مؤشرات الأداء" accent="hr">
          <SectionSkeleton rows={6} height={68} />
        </OpsDashPanel>
      </ModuleOpsPageShell>
    );
  }

  if (!employee) {
    return (
      <ModuleOpsPageShell eyebrow={isSelfSupervisorPage ? 'عمالتي وتقييماتهم' : 'تفاصيل المشرف'} actions={shellBackAction}>
        <OpsDashPanel title={notFoundMessage} accent="hr">
          <div className="space-y-4 text-center">
            <span className="material-icons-round block text-6xl opacity-30 text-muted-foreground">person_off</span>
            <p className="text-lg font-bold text-destructive">{notFoundMessage}</p>
            <Button type="button" variant="outline" onClick={() => navigate(pageBackAction.to)}>
              {pageBackAction.label}
            </Button>
          </div>
        </OpsDashPanel>
      </ModuleOpsPageShell>
    );
  }

  const levelLabel = JOB_LEVEL_LABELS[(employee.level as JobLevel) ?? 1] ?? String(employee.level);
  const scoreBadge = performanceScore >= 85 ? { variant: 'success' as const, label: 'ممتاز' } : performanceScore >= 70 ? { variant: 'warning' as const, label: 'جيد' } : { variant: 'danger' as const, label: 'ضعيف' };

  return (
    <ModuleOpsPageShell
      eyebrow={isSelfSupervisorPage ? 'عمالتي وتقييماتهم' : 'تفاصيل المشرف'}
      rangeLabel={`${employee.name} — ${supervisorPageSubtitle} · متوسط ${avgWorkersPerReport} عامل`}
      actions={supervisorShellActions}
    >
      <DetailPageStickyHeader>
        <div className="flex flex-wrap items-center gap-2">
          {employee.code ? (
            <span className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
              {employee.code}
            </span>
          ) : null}
          <Badge variant={scoreBadge.variant}>{scoreBadge.label} ({performanceScore})</Badge>
          <Badge variant={employee.isActive ? 'success' : 'danger'}>
            {employee.isActive ? 'نشط' : 'غير نشط'}
          </Badge>
        </div>
        <OpsDashPanel title="الفترة" accent="hr">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200/90 bg-slate-100/80 p-1 dark:border-border dark:bg-muted/40">
              {PERIOD_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={period === opt.value ? 'default' : 'ghost'}
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => setPeriod(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
        </OpsDashPanel>
      </DetailPageStickyHeader>

      <OpsDashPanel title="مؤشرات الأداء" accent="hr">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* <KPIBox label="إنتاج اليوم" value={formatNumber(todayProduced)} icon="today" colorClass="bg-emerald-50 text-emerald-600" /> */}
        <KPIBox label="إنتاج الأسبوع" value={formatNumber(weekProduced)} icon="date_range" colorClass="bg-blue-50 text-blue-600 dark:bg-blue-900/20" />
        <KPIBox
          label="إجمالي الإنتاج"
          value={formatNumber(totalProduced)}
          unit={target > 0 ? `/ ${formatNumber(target)}` : 'وحدة'}
          icon="inventory"
          colorClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
          trend={target > 0 ? `${Math.min(Math.round((totalProduced / target) * 100), 100)}% من الهدف` : undefined}
          trendUp={target > 0 && totalProduced >= target * 0.5}
        />
        <KPIBox
          label="نسبة الهدر"
          value={`${wasteRatio}%`}
          icon="delete_sweep"
          colorClass={wasteRatio <= 2 ? 'bg-emerald-50 text-emerald-600' : wasteRatio <= 5 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}
          trend={`${formatNumber(totalWaste)} وحدة هالك`}
          trendUp={wasteRatio <= wasteThreshold}
        />
        <KPIBox label="ساعات العمل" value={formatNumber(totalHours)} unit="ساعة" icon="schedule" colorClass="bg-amber-50 text-amber-600" trend={`${uniqueDays} يوم عمل`} trendUp />
        <KPIBox label="متوسط الإنتاج/تقرير" value={formatNumber(avgPerReport)} icon="trending_up" colorClass="bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400" />
        <KPIBox label="عدد التقارير" value={formatNumber(periodReports.length)} icon="description" colorClass="bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400" />
        <KPIBox
          label="درجة الأداء"
          value={performanceScore}
          unit="/ 100"
          icon="speed"
          colorClass={performanceScore >= 85 ? 'bg-emerald-50 text-emerald-600' : performanceScore >= 70 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}
          trend={scoreBadge.label}
          trendUp={performanceScore >= 70}
        />
        <KPIBox
          label="تحقيق الفريق"
          value={`${supervisorBonus.cappedAchievementPercent}%`}
          unit={supervisorBonus.achievementPercent !== supervisorBonus.cappedAchievementPercent ? `قبل السقف ${supervisorBonus.achievementPercent}%` : undefined}
          icon="groups"
          colorClass={supervisorBonus.cappedAchievementPercent >= 95 ? 'bg-emerald-50 text-emerald-600' : supervisorBonus.cappedAchievementPercent >= 70 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}
          trend={`${formatNumber(supervisorBonus.totalAchieved)} / ${formatNumber(supervisorBonus.totalTarget)}`}
          trendUp={supervisorBonus.cappedAchievementPercent >= 70}
        />
        <KPIBox
          label="تقدير المكافأة"
          value={formatNumber(supervisorBonus.bonusEstimate)}
          icon="payments"
          colorClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
          trend={`معامل ${supervisorBonus.supervisorMultiplier}x · شريحة ${supervisorBonus.tierMultiplier}x`}
          trendUp={supervisorBonus.bonusEstimate > 0}
        />
        <KPIBox
          label="متوسط الإنتاج/يوم (أوامر)"
          value={formatNumber(Number(executionSummary.avgDailyActual.toFixed(1)))}
          unit="وحدة"
          icon="trending_up"
          colorClass="bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400"
        />
        <KPIBox
          label="الانتهاء المتوقع"
          value={executionSummary.latestForecast}
          icon="event_available"
          colorClass={executionSummary.latestForecast !== '—' && executionSummary.latestForecast > periodRange.end
            ? 'bg-amber-50 text-amber-600'
            : 'bg-emerald-50 text-emerald-600'}
        />
        <KPIBox
          label="انحراف التنفيذ"
          value={executionSummary.weightedDeviation === null
            ? '—'
            : `${executionSummary.weightedDeviation > 0 ? '+' : ''}${executionSummary.weightedDeviation}%`}
          icon="compare_arrows"
          colorClass={executionSummary.weightedDeviation === null
            ? 'bg-[#f0f2f5] text-[var(--color-text-muted)]'
            : executionSummary.weightedDeviation >= 0
              ? 'bg-emerald-50 text-emerald-600'
              : executionSummary.weightedDeviation <= -20
                ? 'bg-rose-50 text-rose-600'
                : 'bg-amber-50 text-amber-600'}
          trend={`أوامر متأخرة: ${executionSummary.delayedCount}`}
          trendUp={executionSummary.weightedDeviation !== null && executionSummary.weightedDeviation >= 0}
        />
      </div>
      </OpsDashPanel>

      <OpsDashPanel title="خطط إنتاج المشرف" accent="hr">
        {visibleSupervisorPlanRows.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-text-muted)]">
            <span className="material-icons-round text-4xl mb-2 block opacity-40">event_note</span>
            لا توجد خطط إنتاج مرتبطة بهذا المشرف في الفترة المختارة.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3 md:hidden">
              {visibleSupervisorPlanRows.map((plan) => {
                const statusConfig = PLAN_STATUS_LABELS[plan.status] ?? PLAN_STATUS_LABELS.planned;
                const canReportForPlan = canCreateReport && (plan.status === 'planned' || plan.status === 'in_progress');
                return (
                  <div key={plan.id || `${plan.productId}_${plan.lineId}_${plan.planDate}`} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="truncate text-base font-bold text-[var(--color-text)]">{getProductName(plan.productId)}</h4>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-[var(--color-text-muted)]">
                          <span className="rounded-full bg-slate-100 px-2 py-1">{getLineName(plan.lineId)}</span>
                          <span className="rounded-full bg-slate-100 px-2 py-1">{plan.planDate}</span>
                          {plan.workOrderNumber && <span className="rounded-full bg-slate-100 px-2 py-1">أمر {plan.workOrderNumber}</span>}
                        </div>
                      </div>
                      <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-xs font-bold text-[var(--color-text-muted)]">المخطط</div>
                        <div className="mt-1 font-bold">{formatNumber(plan.plannedQuantity)}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-xs font-bold text-[var(--color-text-muted)]">المنتج</div>
                        <div className="mt-1 font-bold text-emerald-600">{formatNumber(plan.producedSoFar)}</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <div className="text-xs font-bold text-[var(--color-text-muted)]">الإنجاز</div>
                        <div className="mt-1 font-bold">{plan.achievementPct}%</div>
                      </div>
                    </div>
                    {canReportForPlan && (
                      <Button type="button" size="sm" className="mt-3 h-10 w-full" onClick={() => openCreateReportForSupervisorPlan(plan)}>
                        إنشاء تقرير إنتاج
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="erp-table w-full text-sm">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">المنتج</th>
                  <th className="erp-th">الخط</th>
                  <th className="erp-th text-center">التاريخ / الوردية</th>
                  <th className="erp-th text-center">المخطط</th>
                  <th className="erp-th text-center">المنتج</th>
                  <th className="erp-th text-center">المتبقي</th>
                  <th className="erp-th text-center">الإنجاز</th>
                  <th className="erp-th text-center">الحالة</th>
                  <th className="erp-th text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {visibleSupervisorPlanRows.map((plan) => {
                  const statusConfig = PLAN_STATUS_LABELS[plan.status] ?? PLAN_STATUS_LABELS.planned;
                  const product = products.find((p) => p.id === plan.productId) as ({ assemblyMode?: 'individual' | 'team' } & typeof products[number]) | undefined;
                  const assemblyMode = product?.assemblyMode === 'team' ? 'team' : 'individual';
                  const canReportForPlan = canCreateReport && (plan.status === 'planned' || plan.status === 'in_progress');
                  return (
                    <tr key={plan.id || `${plan.productId}_${plan.lineId}_${plan.planDate}`} className="border-b border-[var(--color-border)]">
                      <td className="px-4 py-3">
                        <div className="font-bold text-[var(--color-text)]">{getProductName(plan.productId)}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-[var(--color-text-muted)]">
                          <span className={`rounded-full px-2 py-0.5 ${assemblyMode === 'team' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {assemblyMode === 'team' ? 'تجميع جماعي' : 'تجميع فردي'}
                          </span>
                          {plan.workOrderNumber && <span>أمر {plan.workOrderNumber}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-bold">{getLineName(plan.lineId)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="font-bold">{plan.planDate}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">
                          {plan.shift === 'morning' ? 'صباحي' : plan.shift === 'evening' ? 'مسائي' : '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold">{formatNumber(plan.plannedQuantity)}</td>
                      <td className="px-4 py-3 text-center font-bold text-emerald-600">{formatNumber(plan.producedSoFar)}</td>
                      <td className="px-4 py-3 text-center font-bold text-[var(--color-text-muted)]">{formatNumber(plan.remainingQty)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`font-black ${plan.achievementPct >= 100 ? 'text-emerald-600' : plan.achievementPct >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {plan.achievementPct}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {canReportForPlan ? (
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 gap-1.5 text-xs"
                            onClick={() => openCreateReportForSupervisorPlan(plan)}
                          >
                            <span className="material-icons-round text-sm">post_add</span>
                            إنشاء تقرير إنتاج
                          </Button>
                        ) : (
                          <span className="text-xs font-bold text-[var(--color-text-muted)]">غير متاح</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {supervisorPlanRows.length > visibleSupervisorPlanRows.length && (
              <div className="px-4 py-3 text-xs font-bold text-[var(--color-text-muted)]">
                عرض أحدث {visibleSupervisorPlanRows.length} خطة من إجمالي {supervisorPlanRows.length}.
              </div>
            )}
            </div>
          </div>
        )}
      </OpsDashPanel>

      <OpsDashPanel title="تقييم الفريق والمكافأة" accent="hr">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KPIBox
          label="عمالة مرتبطة"
          value={formatNumber(teamWorkerRows.length)}
          icon="groups"
          colorClass="bg-blue-50 text-blue-600 dark:bg-blue-900/20"
          trend={`${formatNumber(achievedWorkerRows.length)} حققوا الهدف`}
          trendUp={achievedWorkerRows.length >= belowTargetWorkerRows.length}
        />
        <KPIBox
          label="حققوا الأهداف"
          value={formatNumber(achievedWorkerRows.length)}
          icon="check_circle"
          colorClass="bg-emerald-50 text-emerald-600"
          trend={productionTargetWorkerRows.length > 0 ? `${Math.round((achievedWorkerRows.length / productionTargetWorkerRows.length) * 100)}% من عمال الإنتاج` : undefined}
          trendUp
        />
        <KPIBox
          label="لم يحققوا الأهداف"
          value={formatNumber(belowTargetWorkerRows.length)}
          icon="warning"
          colorClass="bg-amber-50 text-amber-600"
          trend={productionTargetWorkerRows.length > 0 ? `${Math.round((belowTargetWorkerRows.length / productionTargetWorkerRows.length) * 100)}% من عمال الإنتاج` : undefined}
          trendUp={belowTargetWorkerRows.length === 0}
        />
        <KPIBox
          label="متوسط تحقيق العمال"
          value={`${productionTargetWorkerRows.length > 0 ? Math.round(productionTargetWorkerRows.reduce((sum, row) => sum + row.achievementPercent, 0) / productionTargetWorkerRows.length) : 0}%`}
          icon="speed"
          colorClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
          trend={`${formatNumber(supervisorBonus.totalAchieved)} / ${formatNumber(supervisorBonus.totalTarget)}`}
          trendUp={supervisorBonus.achievementPercent >= 100}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
        <OpsDashPanel title="أعلى 5 عمال" accent="hr">
          {topWorkerRows.length === 0 ? (
            <p className="py-6 text-center text-sm font-medium text-[var(--color-text-muted)]">لا توجد بيانات أهداف عمال في الفترة.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="erp-table w-full text-sm">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">العامل</th>
                    <th className="erp-th text-center">الهدف</th>
                    <th className="erp-th text-center">المحقق</th>
                    <th className="erp-th text-center">النسبة</th>
                  </tr>
                </thead>
                <tbody>
                  {topWorkerRows.map((row) => (
                    <tr key={row.workerId} className="border-b border-[var(--color-border)]">
                      <td className="px-4 py-3 font-bold text-[var(--color-text)]">{row.workerName}</td>
                      <td className="px-4 py-3 text-center">{formatNumber(row.targetQty)}</td>
                      <td className="px-4 py-3 text-center">{formatNumber(row.outputQty)}</td>
                      <td className="px-4 py-3 text-center font-bold text-emerald-600">{row.achievementPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </OpsDashPanel>

        <OpsDashPanel title="أقل 5 عمال" accent="hr">
          {bottomWorkerRows.length === 0 ? (
            <p className="py-6 text-center text-sm font-medium text-[var(--color-text-muted)]">لا توجد بيانات أهداف عمال في الفترة.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="erp-table w-full text-sm">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">العامل</th>
                    <th className="erp-th text-center">الهدف</th>
                    <th className="erp-th text-center">المحقق</th>
                    <th className="erp-th text-center">النسبة</th>
                  </tr>
                </thead>
                <tbody>
                  {bottomWorkerRows.map((row) => (
                    <tr key={row.workerId} className="border-b border-[var(--color-border)]">
                      <td className="px-4 py-3 font-bold text-[var(--color-text)]">{row.workerName}</td>
                      <td className="px-4 py-3 text-center">{formatNumber(row.targetQty)}</td>
                      <td className="px-4 py-3 text-center">{formatNumber(row.outputQty)}</td>
                      <td className={`px-4 py-3 text-center font-bold ${row.achievementPercent >= 100 ? 'text-emerald-600' : 'text-rose-600'}`}>{row.achievementPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </OpsDashPanel>
      </div>

      <OpsDashPanel title="تقييم عمال المشرف" accent="hr">
        <div className="flex flex-col gap-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[#f8f9fa]/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="font-bold text-[var(--color-text)]">صفحة مستقلة لتقييم العمالة</h4>
            <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">
              تم نقل تقييم العمالة إلى صفحة منفصلة خاصة بالمشرف مع نفس تاريخ التقييم والنجوم والملاحظات.
            </p>
          </div>
          <Button
            type="button"
            className="h-10 w-full sm:w-auto"
            onClick={() => navigate(id ? `/supervisors/${encodeURIComponent(id)}/evaluation` : '/my-workers/evaluation')}
          >
            فتح صفحة التقييم
          </Button>
        </div>
      </OpsDashPanel>

      <OpsDashPanel title="حساب المكافأة من أهداف العمال" accent="hr">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] border border-[var(--color-border)] p-3 text-center">
            <p className="text-xs font-bold text-[var(--color-text-muted)]">إجمالي أهداف الفريق</p>
            <p className="text-lg font-black text-[var(--color-text)]">{formatNumber(supervisorBonus.totalTarget)}</p>
          </div>
          <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] border border-[var(--color-border)] p-3 text-center">
            <p className="text-xs font-bold text-[var(--color-text-muted)]">إجمالي المحقق</p>
            <p className="text-lg font-black text-[var(--color-text)]">{formatNumber(supervisorBonus.totalAchieved)}</p>
          </div>
          <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] border border-[var(--color-border)] p-3 text-center">
            <p className="text-xs font-bold text-[var(--color-text-muted)]">النسبة المعتمدة</p>
            <p className="text-lg font-black text-primary">{supervisorBonus.cappedAchievementPercent}%</p>
          </div>
          <div className="rounded-[var(--border-radius-base)] bg-[#f8f9fa] border border-[var(--color-border)] p-3 text-center">
            <p className="text-xs font-bold text-[var(--color-text-muted)]">مكافأة المشرف</p>
            <p className="text-lg font-black text-primary">{formatNumber(supervisorBonus.bonusEstimate)}</p>
          </div>
        </div>

        {supervisorBonus.workerContributions.length === 0 ? (
          <div className="text-center py-8 text-[var(--color-text-muted)]">
            <span className="material-icons-round text-4xl mb-2 block opacity-40">groups</span>
            لا توجد أهداف عمال مسجلة داخل تقارير هذه الفترة.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="erp-table w-full text-sm">
              <thead className="erp-thead">
                <tr>
                  <th className="erp-th">العامل</th>
                  <th className="erp-th text-center">الهدف</th>
                  <th className="erp-th text-center">المحقق</th>
                  <th className="erp-th text-center">المعتمد بعد السقف</th>
                  <th className="erp-th text-center">نسبة العامل</th>
                </tr>
              </thead>
              <tbody>
                {supervisorBonus.workerContributions.slice(0, 20).map((row) => (
                  <tr key={row.workerId} className="border-b border-[var(--color-border)]">
                    <td className="px-4 py-3 font-bold text-[var(--color-text)]">{row.workerName}</td>
                    <td className="px-4 py-3 text-center font-bold">{formatNumber(row.targetQty)}</td>
                    <td className="px-4 py-3 text-center font-bold">{formatNumber(row.outputQty)}</td>
                    <td className="px-4 py-3 text-center font-bold text-primary">{formatNumber(row.cappedOutputQty)}</td>
                    <td className="px-4 py-3 text-center font-bold">{row.achievementPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OpsDashPanel>
      </OpsDashPanel>

      <OpsDashPanel title="التقارير والتحليل" accent="hr">
      {/* â”€â”€ Detail Tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-wrap gap-1">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-[var(--border-radius-base)] font-bold text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-primary text-white shadow-primary/20'
                : 'bg-[var(--color-card)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f8f9fa]'
            }`}
          >
            <span className="material-icons-round text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* â”€â”€ Tab: Production â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activeTab === 'production' && (
        <div className="space-y-6">
          <OpsDashPanel title="انضباط تنفيذ أوامر الشغل" accent="hr">
            {activeExecutionRows.length === 0 ? (
              <div className="text-center py-8 text-[var(--color-text-muted)]">
                <span className="material-icons-round text-4xl mb-2 block opacity-40">assignment</span>
                لا توجد أوامر شغل نشطة في الفترة المختارة.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="erp-table w-full text-sm">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">رقم الأمر</th>
                      <th className="erp-th">الخط</th>
                      <th className="erp-th">المنتج</th>
                      <th className="erp-th">المتبقي</th>
                      <th className="erp-th">متوسط/يوم</th>
                      <th className="erp-th">انتهاء متوقع</th>
                      <th className="erp-th">الانحراف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeExecutionRows.map((row) => (
                      <tr key={row.wo.id} className="border-b border-[var(--color-border)]">
                        <td className="px-4 py-3 font-mono font-bold text-primary">{row.wo.workOrderNumber}</td>
                        <td className="px-4 py-3">{getLineName(row.wo.lineId)}</td>
                        <td className="px-4 py-3">{getProductName(row.wo.productId)}</td>
                        <td className="px-4 py-3 font-bold text-[var(--color-text-muted)]">
                          {formatNumber(row.execution.remainingQty)}
                        </td>
                        <td className="px-4 py-3 font-bold">
                          {formatNumber(Number(row.execution.avgDailyActual.toFixed(1)))}
                        </td>
                        <td className="px-4 py-3">
                          <span className={row.isLateForecast ? 'text-rose-600 font-bold' : 'text-[var(--color-text-muted)] font-bold'}>
                            {row.execution.forecastEndDate}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold">
                          {row.execution.deviationPct === null ? (
                            <span className="text-[var(--color-text-muted)]">—</span>
                          ) : (
                            <span className={
                              row.deviationTone === 'good'
                                ? 'text-emerald-600'
                                : row.deviationTone === 'danger'
                                  ? 'text-rose-600'
                                  : 'text-amber-600'
                            }>
                              {row.execution.deviationPct > 0 ? '+' : ''}{row.execution.deviationPct}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </OpsDashPanel>
          {/* Charts with tab switcher */}
          <OpsDashPanel accent="hr">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-primary">show_chart</span>
                <h3 className="text-lg font-bold">تحليل الأداء</h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CHART_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setChartTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--border-radius-base)] text-xs font-bold transition-all ${
                      chartTab === tab.key
                        ? 'bg-primary text-white shadow-primary/20'
                        : 'bg-[#f0f2f5] text-[var(--color-text-muted)] hover:bg-[#e8eaed]'
                    }`}
                  >
                    <span className="material-icons-round text-sm">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {enrichedChartData.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <span className="material-icons-round text-4xl mb-2 block opacity-30">show_chart</span>
                <p className="font-bold">لا توجد بيانات بعد</p>
              </div>
            ) : (
              <div style={{ width: '100%', height: 320 }} dir="ltr">
                <ResponsiveContainer>
                  {chartTab === 'production' ? (
                    <AreaChart data={enrichedChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="svColorProd" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1392ec" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#1392ec" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="svColorWaste" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      <Area type="monotone" dataKey="produced" name="الإنتاج" stroke="#1392ec" strokeWidth={2} fillOpacity={1} fill="url(#svColorProd)" />
                      <Area type="monotone" dataKey="waste" name="الهالك" stroke="#ef4444" strokeWidth={1.5} fillOpacity={1} fill="url(#svColorWaste)" />
                    </AreaChart>
                  ) : chartTab === 'efficiency' ? (
                    <BarChart data={enrichedChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      <Bar dataKey="efficiency" name="الكفاءة" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                    </BarChart>
                  ) : (
                    <BarChart data={enrichedChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      <Bar dataKey="hours" name="ساعات العمل" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={20} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            )}
          </OpsDashPanel>

          {/* Production by product */}
          {productStats.length > 0 && (
            <OpsDashPanel title="الإنتاج حسب المنتج" accent="hr">
              <div style={{ width: '100%', height: 280 }} dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={productStats} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#94a3b8' }} width={100} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Bar dataKey="produced" name="الإنتاج" fill="#10b981" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="waste" name="الهالك" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </OpsDashPanel>
          )}

          {/* Reports table */}
          <OpsDashPanel accent="hr" className="!p-0 border-none overflow-hidden " title="">
            <div className="px-6 py-4 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-bold">سجل التقارير</h3>
              {reports.length > 0 && periodReports.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  لا توجد تقارير داخل الفترة الحالية. جرظ‘ب تغيير الفترة إلى "كل البيانات".
                </p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="erp-table w-full text-right border-collapse">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">التاريخ</th>
                    <th className="erp-th">خط الإنتاج</th>
                    <th className="erp-th">المنتج</th>
                    <th className="erp-th text-center">الكمية</th>
                    <th className="erp-th text-center">الهالك</th>
                    <th className="erp-th text-center">عمال</th>
                    <th className="erp-th text-center">ساعات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {periodReports.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                        <span className="material-icons-round text-5xl mb-3 block opacity-30">description</span>
                        <p className="font-bold">لا توجد تقارير</p>
                      </td>
                    </tr>
                  )}
                  {periodReports.slice(0, 30).map((r) => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 text-sm font-bold text-[var(--color-text)]">{r.date}</td>
                      <td className="px-5 py-3 text-sm font-medium">{getLineName(r.lineId)}</td>
                      <td className="px-5 py-3 text-sm font-medium">{getProductName(r.productId)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className="px-2.5 py-1 rounded-[var(--border-radius-base)] bg-emerald-50 text-emerald-600 text-sm font-bold ring-1 ring-emerald-500/20">
                          {formatNumber(r.quantityProduced)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center text-rose-500 font-bold text-sm">{formatNumber(getReportWaste(r))}</td>
                      <td className="px-5 py-3 text-center text-sm font-bold">{r.workersCount}</td>
                      <td className="px-5 py-3 text-center text-sm font-bold">{r.workHours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {periodReports.length > 0 && (
              <div className="px-6 py-4 bg-[#f8f9fa]/50 border-t border-[var(--color-border)]">
                <span className="text-sm text-[var(--color-text-muted)] font-bold">
                  إجمالي <span className="text-primary">{periodReports.length}</span> تقرير
                  {periodReports.length > 30 && <span className="text-[var(--color-text-muted)] mr-2">— عرض أحدث 30</span>}
                </span>
              </div>
            )}
          </OpsDashPanel>
        </div>
      )}

      {/* â”€â”€ Tab: Lines â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activeTab === 'lines' && (
        <div className="space-y-6">
          {lineStats.length === 0 ? (
            <OpsDashPanel accent="hr">
              <div className="text-center py-12 text-slate-400">
                <span className="material-icons-round text-5xl mb-3 block opacity-30">precision_manufacturing</span>
                <p className="font-bold">لا توجد خطوط إنتاج مرتبطة</p>
              </div>
            </OpsDashPanel>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lineStats.map((line) => {
                const lineWasteRatio = calculateWasteRatio(line.waste, line.produced + line.waste);
                return (
                  <OpsDashPanel accent="hr" key={line.lineId}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[var(--border-radius-lg)] bg-primary/10 flex items-center justify-center">
                          <span className="material-icons-round text-primary">precision_manufacturing</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-[var(--color-text)]">{line.name}</h4>
                          <span className="text-xs text-slate-400">{formatNumber(line.reports)} تقرير آ· {formatNumber(Math.round(line.hours))} ساعة</span>
                        </div>
                      </div>
                      <button
                        onClick={() => navigate(`/lines/${line.lineId}`)}
                        className="p-2 text-[var(--color-text-muted)] hover:text-primary hover:bg-primary/10 rounded-[var(--border-radius-base)] transition-all"
                        title="عرض تفاصيل الخط"
                      >
                        <span className="material-icons-round">arrow_back</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-[var(--border-radius-base)] p-3 text-center">
                        <p className="text-xs text-emerald-600 font-medium mb-1">الإنتاج</p>
                        <p className="text-lg font-bold text-emerald-700">{formatNumber(line.produced)}</p>
                      </div>
                      <div className="bg-rose-50 dark:bg-rose-900/10 rounded-[var(--border-radius-base)] p-3 text-center">
                        <p className="text-xs text-rose-600 font-medium mb-1">الهالك</p>
                        <p className="text-lg font-bold text-rose-700">{formatNumber(line.waste)}</p>
                      </div>
                      <div className={`rounded-[var(--border-radius-base)] p-3 text-center ${lineWasteRatio > 5 ? 'bg-rose-50 dark:bg-rose-900/10' : 'bg-amber-50 dark:bg-amber-900/10'}`}>
                        <p className={`text-xs font-medium mb-1 ${lineWasteRatio > 5 ? 'text-rose-600' : 'text-amber-600'}`}>نسبة الهالك</p>
                        <p className={`text-lg font-bold ${lineWasteRatio > 5 ? 'text-rose-700' : 'text-amber-700'}`}>{lineWasteRatio}%</p>
                      </div>
                    </div>
                  </OpsDashPanel>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* â”€â”€ Tab: HR Info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {activeTab === 'info' && (
        <OpsDashPanel title="بيانات الموظف" accent="hr">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: 'القسم', value: getDepartmentName(employee.departmentId), icon: 'business' },
              { label: 'المنصب', value: getJobPositionTitle(employee.jobPositionId), icon: 'work' },
              { label: 'المستوى', value: levelLabel, icon: 'stairs' },
              { label: 'نوع التوظيف', value: EMPLOYMENT_TYPE_LABELS[employee.employmentType] ?? employee.employmentType, icon: 'badge' },
              { label: 'الراتب الأساسي', value: formatNumber(employee.baseSalary) + ' ج.م', icon: 'payments' },
              { label: 'الأجر بالساعة', value: formatNumber(employee.hourlyRate) + ' ج.م', icon: 'schedule' },
              { label: 'الوردية', value: employee.shiftId ? getShiftName(employee.shiftId) : '—', icon: 'access_time' },
              { label: 'المدير المباشر', value: managerName, icon: 'supervisor_account' },
              { label: 'الرمز', value: employee.code || '—', icon: 'tag' },
              { label: 'ساعات العمل الكلية', value: formatNumber(Math.round(totalWorkerHours)) + ' ساعة', icon: 'timer' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 p-4 bg-[#f8f9fa]/50 rounded-[var(--border-radius-lg)] border border-[var(--color-border)]/50">
                <div className="w-10 h-10 rounded-[var(--border-radius-base)] bg-[var(--color-card)] border border-[var(--color-border)] flex items-center justify-center shrink-0">
                  <span className="material-icons-round text-[var(--color-text-muted)] text-lg">{item.icon}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-[var(--color-text-muted)] font-medium">{item.label}</p>
                  <p className="font-bold text-[var(--color-text)] truncate">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </OpsDashPanel>
      )}

      </OpsDashPanel>

      <OpsDashPanel title="التنبيهات" accent="hr">
      <OpsDashPanel accent="hr">
        <div className="flex items-center gap-2 mb-4">
          <span className="material-icons-round text-amber-500">notifications_active</span>
          <h3 className="text-lg font-bold">التنبيهات</h3>
        </div>
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-start sm:items-center gap-3 px-4 py-3 rounded-[var(--border-radius-lg)] border text-sm font-medium ${
                alert.type === 'danger'
                  ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 text-rose-700'
                  : alert.type === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 text-amber-700'
                  : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 text-blue-700'
              }`}
            >
              <span className="material-icons-round text-lg">{alert.icon}</span>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      </OpsDashPanel>
      </OpsDashPanel>

      {/* Hidden print template */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <ProductionReportPrint
          ref={printRef}
          title={`تقارير المشرف: ${employee.name}`}
          subtitle={`${getDepartmentName(employee.departmentId)} — ${getJobPositionTitle(employee.jobPositionId)}`}
          rows={printRows}
          totals={printTotals}
          printSettings={printTemplate}
        />
      </div>
    </ModuleOpsPageShell>
  );
};

