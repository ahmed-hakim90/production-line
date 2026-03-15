import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../store/useAppStore';
import { useManagedPrint } from '@/utils/printManager';
import { Card, KPIBox, Badge, Button, LoadingSkeleton } from '../components/UI';
import { SelectableTable, type TableColumn, type TableBulkAction } from '../components/SelectableTable';
import { ProductionReportPrint, mapReportsToPrintRows, computePrintTotals } from '../components/ProductionReportPrint';
import {
  SupervisorPerformancePrint,
  type SupervisorPerformancePrintData,
  type SupervisorProductPerformancePrintRow,
  type SupervisorLinePerformancePrintRow,
} from '../components/SupervisorPerformancePrint';
import type { FirestoreEmployee, ProductionReport } from '../../../types';
import { getDocs } from 'firebase/firestore';
import { departmentsRef, jobPositionsRef } from '../../hr/collections';
import type { FirestoreDepartment, FirestoreJobPosition } from '../../hr/types';
import { formatNumber, calculateWasteRatio, getOperationalDateString, getReportWaste } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { getExportImportPageControl } from '../../../utils/exportImportControls';
import { supervisorLineAssignmentService } from '../services/supervisorLineAssignmentService';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { PageHeader } from '../../../components/PageHeader';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter, SlidersHorizontal, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Performance Score ────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function getScoreBadge(score: number): { variant: 'success' | 'warning' | 'danger'; label: string } {
  if (score >= 85) return { variant: 'success', label: 'ممتاز' };
  if (score >= 70) return { variant: 'warning', label: 'جيد' };
  return { variant: 'danger', label: 'ضعيف' };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const y = monday.getFullYear();
  const m = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function getLastWeekRange(): { start: string; end: string } {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const thisMonday = new Date(d);
  thisMonday.setDate(diff);
  const lastSunday = new Date(thisMonday);
  lastSunday.setDate(thisMonday.getDate() - 1);
  const lastMonday = new Date(lastSunday);
  lastMonday.setDate(lastSunday.getDate() - 6);
  const fmt = (dt: Date) => {
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  };
  return { start: fmt(lastMonday), end: fmt(lastSunday) };
}

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

// ─── SupervisorRow type ───────────────────────────────────────────────────────

interface SupervisorRow extends FirestoreEmployee {
  reports: ProductionReport[];
  reportCount: number;
  totalProduced: number;
  totalWaste: number;
  todayProduced: number;
  weekProduced: number;
  scrapRate: number;
  avgDailyActual: number;
  benchmarkDaily: number;
  deviationPct: number | null;
  activeDays: number;
  totalDaysInRange: number;
  performanceScore: number;
  performanceByLine: Array<{
    lineId: string;
    lineName: string;
    performanceScore: number;
    deviationPct: number | null;
  }>;
  assignedLines: string[];
  totalWorkers: number;
  lastActivity: string;
}

// ─── Active filter for stat cards ─────────────────────────────────────────────

type StatFilter = '' | 'today' | 'week' | 'highScrap' | 'lowScore' | 'active';
type ReportsViewMode = 'today' | 'range';

const toDateInputValue = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const Supervisors: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermission();

  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const productionReports = useAppStore((s) => s.productionReports);
  const productionLines = useAppStore((s) => s.productionLines);
  const products = useAppStore((s) => s.products);
  const employees = useAppStore((s) => s.employees);
  const workOrders = useAppStore((s) => s.workOrders);
  const fetchReportsFromStore = useAppStore((s) => s.fetchReports);
  const reportsLoading = useAppStore((s) => s.reportsLoading);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);

  const [departments, setDepartments] = useState<FirestoreDepartment[]>([]);
  const [jobPositions, setJobPositions] = useState<FirestoreJobPosition[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterLine, setFilterLine] = useState('');
  const today = getOperationalDateString(8);
  const [viewMode, setViewMode] = useState<ReportsViewMode>('today');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [assignmentMapBySupervisor, setAssignmentMapBySupervisor] = useState<Map<string, string[]>>(new Map());
  const [statFilter, setStatFilter] = useState<StatFilter>('');
  const [hoveredSupervisor, setHoveredSupervisor] = useState<string | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [bulkPrintReports, setBulkPrintReports] = useState<ProductionReport[] | null>(null);
  const bulkPrintRef = useRef<HTMLDivElement>(null);
  const handleBulkPrint = useManagedPrint({ contentRef: bulkPrintRef, printSettings: printTemplate });
  const [singleSupervisorPrintData, setSingleSupervisorPrintData] = useState<SupervisorPerformancePrintData | null>(null);
  const singleSupervisorPrintRef = useRef<HTMLDivElement>(null);
  const handleSingleSupervisorPrint = useManagedPrint({
    contentRef: singleSupervisorPrintRef,
    printSettings: printTemplate,
    documentTitle: ' ',
  });
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'supervisors'),
    [exportImportSettings]
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;

  const loadRefData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [deptSnap, posSnap] = await Promise.all([
        getDocs(departmentsRef()),
        getDocs(jobPositionsRef()),
      ]);
      setDepartments(deptSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreDepartment)));
      setJobPositions(posSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreJobPosition)));
    } catch (e) {
      console.error('loadRefData error:', e);
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => { loadRefData(); }, [loadRefData]);

  const loadReportsRange = useCallback(async (from: string, to: string) => {
    try {
      setRangeError(null);
      await fetchReportsFromStore(from, to);
      setViewMode('range');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر تحميل بيانات الفترة المحددة.';
      setRangeError(message);
    }
  }, [fetchReportsFromStore]);

  const loadAssignmentsForDate = useCallback(async (date: string) => {
    try {
      const active = await supervisorLineAssignmentService.getActiveByDate(date);
      const bySupervisor = new Map<string, Set<string>>();
      active.forEach((row) => {
        const supervisorId = String(row.supervisorId || '').trim();
        const lineId = String(row.lineId || '').trim();
        if (!supervisorId || !lineId) return;
        const lines = bySupervisor.get(supervisorId) || new Set<string>();
        lines.add(lineId);
        bySupervisor.set(supervisorId, lines);
      });
      const normalized = new Map<string, string[]>();
      bySupervisor.forEach((lineIds, supervisorId) => normalized.set(supervisorId, Array.from(lineIds)));
      setAssignmentMapBySupervisor(normalized);
    } catch (error) {
      console.error('loadAssignmentsForDate error:', error);
      setAssignmentMapBySupervisor(new Map());
    }
  }, []);

  const handleShowToday = useCallback(() => {
    const operationalToday = getOperationalDateString(8);
    setStartDate(operationalToday);
    setEndDate(operationalToday);
    setViewMode('today');
    setRangeError(null);
  }, []);

  const handleShowYesterday = useCallback(async () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = toDateInputValue(d);
    setStartDate(yesterday);
    setEndDate(yesterday);
    await loadReportsRange(yesterday, yesterday);
  }, [loadReportsRange]);

  const handleShowWeekly = useCallback(async () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    const from = toDateInputValue(start);
    const to = toDateInputValue(end);
    setStartDate(from);
    setEndDate(to);
    await loadReportsRange(from, to);
  }, [loadReportsRange]);

  const handleShowMonthly = useCallback(async () => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    const from = toDateInputValue(start);
    const to = toDateInputValue(end);
    setStartDate(from);
    setEndDate(to);
    await loadReportsRange(from, to);
  }, [loadReportsRange]);

  const handleApplyDateRange = useCallback(async () => {
    if (!startDate || !endDate) return;
    await loadReportsRange(startDate, endDate);
  }, [startDate, endDate, loadReportsRange]);

  const getDepartmentName = (id: string) => departments.find((d) => d.id === id)?.name ?? '—';
  const getJobPositionTitle = (id: string) => jobPositions.find((j) => j.id === id)?.title ?? '—';
  const getLineName = (id: string) => productionLines.find((l) => l.id === id)?.name ?? '—';

  const lookups = useMemo(() => ({
    getLineName: (id: string) => productionLines.find((l) => l.id === id)?.name ?? '—',
    getProductName: (id: string) => products.find((p) => p.id === id)?.name ?? '—',
    getEmployeeName: (id: string) => employees.find((e) => e.id === id)?.name ?? '—',
  }), [productionLines, products, employees]);

  const printRows = useMemo(
    () => mapReportsToPrintRows(bulkPrintReports ?? [], lookups),
    [bulkPrintReports, lookups]
  );
  const printTotals = useMemo(() => computePrintTotals(printRows), [printRows]);

  const weekStart = useMemo(() => getWeekStart(), []);
  const lastWeek = useMemo(() => getLastWeekRange(), []);

  const allReports = productionReports;
  const productAvgDailyById = useMemo(
    () => new Map(products.filter((p) => Boolean(p.id)).map((p) => [String(p.id), Math.max(0, Number((p as any).avgDailyProduction || 0))])),
    [products],
  );
  const rangeStart = viewMode === 'today' ? today : startDate;
  const rangeEnd = viewMode === 'today' ? today : endDate;
  const totalDaysInRange = useMemo(
    () => daysBetweenInclusive(rangeStart, rangeEnd),
    [rangeStart, rangeEnd],
  );

  const supervisorIdSet = useMemo(
    () => new Set(_rawEmployees.filter((e) => e.level === 2 && e.id).map((e) => e.id as string)),
    [_rawEmployees],
  );

  const workOrderSupervisorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const wo of workOrders) {
      if (!wo.id || !wo.supervisorId) continue;
      map.set(wo.id, wo.supervisorId);
    }
    return map;
  }, [workOrders]);

  const resolveSupervisorIdForReport = useCallback((report: ProductionReport): string => {
    if (report.employeeId && supervisorIdSet.has(report.employeeId)) return report.employeeId;
    if (report.workOrderId) return workOrderSupervisorById.get(report.workOrderId) ?? '';
    return '';
  }, [supervisorIdSet, workOrderSupervisorById]);

  const reportsBySupervisor = useMemo(() => {
    const map = new Map<string, ProductionReport[]>();
    for (const r of allReports) {
      const supervisorId = resolveSupervisorIdForReport(r);
      if (!supervisorId) continue;
      const list = map.get(supervisorId) ?? [];
      list.push(r);
      map.set(supervisorId, list);
    }
    return map;
  }, [allReports, resolveSupervisorIdForReport]);

  const supervisors = useMemo<SupervisorRow[]>(() => {
    return _rawEmployees
      .filter((e) => e.level === 2)
      .map((e) => {
        const reports = reportsBySupervisor.get(e.id!) ?? [];
        const totalProduced = reports.reduce((s, r) => s + (r.quantityProduced ?? 0), 0);
        const totalWaste = reports.reduce((s, r) => s + getReportWaste(r), 0);
        const todayProduced = reports
          .filter((r) => r.date === today)
          .reduce((s, r) => s + (r.quantityProduced ?? 0), 0);
        const weekProduced = reports
          .filter((r) => r.date >= weekStart && r.date <= today)
          .reduce((s, r) => s + (r.quantityProduced ?? 0), 0);
        const scrapRate = calculateWasteRatio(totalWaste, totalProduced + totalWaste);
        const activeDays = countUniqueDaysInRange(reports, rangeStart, rangeEnd);
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
        const deviationPct = benchmarkDaily > 0
          ? Number((((avgDailyActual - benchmarkDaily) / benchmarkDaily) * 100).toFixed(1))
          : null;
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
        const performanceByLine = Array.from(lineReportsMap.entries())
          .map(([lineId, lineReports]) => {
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
            const lineDeviationPct = lineBenchmarkDaily > 0
              ? Number((((lineAvgDailyActual - lineBenchmarkDaily) / lineBenchmarkDaily) * 100).toFixed(1))
              : null;
            const lineDaysCommitmentPct = totalDaysInRange > 0 ? (lineActiveDays / totalDaysInRange) * 100 : 0;
            const lineThroughputPct = lineBenchmarkDaily > 0 ? (lineAvgDailyActual / lineBenchmarkDaily) * 100 : (lineAvgDailyActual > 0 ? 100 : 0);
            const linePerformanceScore = clamp(Math.round((lineThroughputPct * 0.75) + (lineDaysCommitmentPct * 0.25)), 0, 100);
            return {
              lineId,
              lineName: getLineName(lineId),
              performanceScore: linePerformanceScore,
              deviationPct: lineDeviationPct,
            };
          })
          .sort((a, b) => b.performanceScore - a.performanceScore);
        const weightedProduced = Array.from(lineReportsMap.values())
          .reduce((sum, lineReports) => sum + lineReports.reduce((s, r) => s + Math.max(0, Number(r.quantityProduced ?? 0)), 0), 0);
        const weightedLineScore = weightedProduced > 0
          ? performanceByLine.reduce((sum, row) => {
              const lineProduced = (lineReportsMap.get(row.lineId) ?? []).reduce((s, r) => s + Math.max(0, Number(r.quantityProduced ?? 0)), 0);
              return sum + (row.performanceScore * lineProduced);
            }, 0) / weightedProduced
          : (performanceByLine.length > 0
              ? performanceByLine.reduce((sum, row) => sum + row.performanceScore, 0) / performanceByLine.length
              : clamp(Math.round((throughputPct * 0.75) + (daysCommitmentPct * 0.25)), 0, 100));
        const performanceScore = clamp(Math.round(weightedLineScore), 0, 100);
        const assignedLines = assignmentMapBySupervisor.get(String(e.id || '').trim())
          || [...new Set(reports.map((r) => r.lineId).filter(Boolean))];
        const totalWorkers = reports.length > 0
          ? Math.round(reports.reduce((s, r) => s + (r.workersCount ?? 0), 0) / reports.length)
          : 0;
        const lastActivity = reports.length > 0
          ? reports.reduce((latest, r) => (r.date > latest ? r.date : latest), reports[0].date)
          : '—';

        return {
          ...e,
          reports,
          reportCount: reports.length,
          totalProduced,
          totalWaste,
          todayProduced,
          weekProduced,
          scrapRate,
          avgDailyActual,
          benchmarkDaily,
          deviationPct,
          activeDays,
          totalDaysInRange,
          performanceScore,
          performanceByLine,
          assignedLines,
          totalWorkers,
          lastActivity,
        };
      });
  }, [_rawEmployees, reportsBySupervisor, today, rangeStart, rangeEnd, totalDaysInRange, productAvgDailyById, assignmentMapBySupervisor]);

  useEffect(() => {
    if (!rangeStart || !rangeEnd) return;
    void loadReportsRange(rangeStart, rangeEnd);
    void loadAssignmentsForDate(rangeEnd);
  }, [rangeStart, rangeEnd, loadReportsRange, loadAssignmentsForDate]);

  // ── Filtering ───────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = supervisors;

    if (statFilter === 'today') list = list.filter((s) => s.todayProduced > 0);
    else if (statFilter === 'week') list = list.filter((s) => s.weekProduced > 0);
    else if (statFilter === 'highScrap') list = list.filter((s) => s.scrapRate > 5);
    else if (statFilter === 'lowScore') list = list.filter((s) => s.performanceScore < 70);
    else if (statFilter === 'active') list = list.filter((s) => s.isActive !== false);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) => e.name?.toLowerCase().includes(q) || (e.code && e.code.toLowerCase().includes(q))
      );
    }
    if (filterLine) list = list.filter((e) => e.assignedLines.includes(filterLine));

    return list;
  }, [supervisors, search, filterLine, statFilter]);

  // ── Summary KPIs ────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const activeSupervisors = supervisors.filter((s) => s.isActive !== false).length;
    const todayTotal = supervisors.reduce((s, e) => s + e.todayProduced, 0);
    const weekTotal = supervisors.reduce((s, e) => s + e.weekProduced, 0);
    const overallWaste = supervisors.reduce((s, e) => s + e.totalWaste, 0);
    const overallProduced = supervisors.reduce((s, e) => s + e.totalProduced, 0);
    const overallScrapRate = calculateWasteRatio(overallWaste, overallProduced + overallWaste);
    const avgScore = supervisors.length > 0
      ? Math.round(supervisors.reduce((s, e) => s + e.performanceScore, 0) / supervisors.length)
      : 0;

    const yesterdayStr = (() => {
      const d = new Date(); d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    const supervisorIds = new Set(supervisors.map((s) => s.id));
    const yesterdayTotal = allReports
      .filter((r) => {
        if (r.date !== yesterdayStr) return false;
        const supervisorId = resolveSupervisorIdForReport(r);
        return !!supervisorId && supervisorIds.has(supervisorId);
      })
      .reduce((s, r) => s + (r.quantityProduced ?? 0), 0);
    const todayChange = yesterdayTotal > 0 ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100) : 0;

    const lastWeekTotal = allReports
      .filter((r) => {
        if (r.date < lastWeek.start || r.date > lastWeek.end) return false;
        const supervisorId = resolveSupervisorIdForReport(r);
        return !!supervisorId && supervisorIds.has(supervisorId);
      })
      .reduce((s, r) => s + (r.quantityProduced ?? 0), 0);
    const weekChange = lastWeekTotal > 0 ? Math.round(((weekTotal - lastWeekTotal) / lastWeekTotal) * 100) : 0;

    return { activeSupervisors, todayTotal, weekTotal, overallScrapRate, avgScore, todayChange, weekChange };
  }, [supervisors, allReports, lastWeek, resolveSupervisorIdForReport]);

  // ── Hover card ──────────────────────────────────────────────────────────────

  const handleMouseEnter = (id: string) => {
    clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoveredSupervisor(id), 400);
  };
  const handleMouseLeave = () => {
    clearTimeout(hoverTimeout.current);
    setHoveredSupervisor(null);
  };

  // ── Bulk actions ────────────────────────────────────────────────────────────

  const exportSelectedCSV = useCallback((items: SupervisorRow[]) => {
    const rows = items.map((s) => ({
      'الاسم': s.name,
      'الرمز': s.code ?? '',
      'القسم': getDepartmentName(s.departmentId ?? ''),
      'المنصب': getJobPositionTitle(s.jobPositionId ?? ''),
      'عدد التقارير': s.reportCount,
      'إجمالي الإنتاج': s.totalProduced,
      'إجمالي الهالك': s.totalWaste,
      'نسبة الهالك %': s.scrapRate,
      'المتوسط المرجعي / يوم': Number(s.benchmarkDaily.toFixed(1)),
      'الإنتاج اليومي الفعلي': Number(s.avgDailyActual.toFixed(1)),
      'الانحراف %': s.deviationPct ?? '—',
      'أيام النشاط': `${s.activeDays}/${s.totalDaysInRange}`,
      'نسبة الأداء %': s.performanceScore,
      'تقييم': getScoreBadge(s.performanceScore).label,
      'الأداء لكل خط': s.performanceByLine.map((line) => `${line.lineName}: ${line.performanceScore}%`).join(' | '),
      'إنتاج اليوم': s.todayProduced,
      'إنتاج الأسبوع': s.weekProduced,
      'آخر نشاط': s.lastActivity,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'المشرفين');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf], { type: 'application/octet-stream' }), `supervisors_${today}.xlsx`);
  }, [departments, jobPositions, today]);

  const printSelected = useCallback((items: SupervisorRow[]) => {
    const allSelectedReports = items.flatMap((s) => s.reports);
    setBulkPrintReports(allSelectedReports);
    setTimeout(() => handleBulkPrint(), 100);
  }, [handleBulkPrint]);

  const buildSupervisorLineRows = useCallback((sup: SupervisorRow): SupervisorLinePerformancePrintRow[] => {
    const byLine = new Map<string, { produced: number; waste: number; reports: number; workers: number; hours: number }>();
    sup.reports.forEach((r) => {
      const prev = byLine.get(r.lineId) ?? { produced: 0, waste: 0, reports: 0, workers: 0, hours: 0 };
      prev.produced += r.quantityProduced ?? 0;
      prev.waste += getReportWaste(r);
      prev.reports += 1;
      prev.workers += r.workersCount ?? 0;
      prev.hours += r.workHours ?? 0;
      byLine.set(r.lineId, prev);
    });
    return Array.from(byLine.entries())
      .map(([lineId, row]) => {
        const totalQty = row.produced + row.waste;
        return {
          lineName: getLineName(lineId),
          reportsCount: row.reports,
          produced: row.produced,
          waste: row.waste,
          wasteRatio: totalQty > 0 ? Number(((row.waste / totalQty) * 100).toFixed(1)) : 0,
          avgWorkers: row.reports > 0 ? Number((row.workers / row.reports).toFixed(1)) : 0,
          totalHours: Number(row.hours.toFixed(1)),
        };
      })
      .sort((a, b) => b.produced - a.produced);
  }, [getLineName]);

  const buildSupervisorProductRows = useCallback((sup: SupervisorRow): SupervisorProductPerformancePrintRow[] => {
    const byProduct = new Map<string, { produced: number; reports: number; activeDates: Set<string> }>();
    sup.reports.forEach((r) => {
      const productId = String(r.productId || '').trim();
      if (!productId) return;
      const prev = byProduct.get(productId) ?? { produced: 0, reports: 0, activeDates: new Set<string>() };
      prev.produced += Number(r.quantityProduced ?? 0);
      prev.reports += 1;
      if (r.date) prev.activeDates.add(r.date);
      byProduct.set(productId, prev);
    });
    return Array.from(byProduct.entries())
      .map(([productId, row]) => {
        const benchmarkDaily = Math.max(0, Number(products.find((p) => p.id === productId)?.avgDailyProduction || 0));
        const activeDays = row.activeDates.size;
        const requiredQty = Number((benchmarkDaily * activeDays).toFixed(1));
        const achievedQty = Number(row.produced.toFixed(1));
        const performanceRatio = requiredQty > 0
          ? Number(((achievedQty / requiredQty) * 100).toFixed(1))
          : (achievedQty > 0 ? 100 : 0);
        return {
          productName: products.find((p) => p.id === productId)?.name ?? '—',
          reportsCount: row.reports,
          requiredQty,
          achievedQty,
          performanceRatio,
        };
      })
      .sort((a, b) => b.achievedQty - a.achievedQty);
  }, [products]);

  const buildAppreciation = useCallback((sup: SupervisorRow, lineRows: SupervisorLinePerformancePrintRow[]) => {
    if (sup.performanceScore >= 90) {
      return {
        title: 'شكر وتقدير على الأداء المتميز',
        body: `نتقدم بالشكر للمشرف ${sup.name} على الحفاظ على أداء مرتفع وانضباط تشغيلي واضح خلال الفترة الحالية.`,
        recommendations: [
          'الاستمرار على نفس وتيرة المتابعة اليومية للخطوط.',
          'مشاركة أفضل ممارسات التشغيل مع باقي المشرفين.',
        ],
      };
    }
    if (sup.performanceScore >= 75) {
      return {
        title: 'أداء جيد مع فرص تطوير',
        body: `نشكر المشرف ${sup.name} على الأداء الجيد، مع وجود فرصة لرفع الكفاءة وتقليل الهالك على بعض الخطوط.`,
        recommendations: [
          'تركيز المتابعة على الخطوط ذات الهالك الأعلى.',
          'مراجعة توزيع العمالة خلال ساعات الذروة.',
          ...lineRows.filter((l) => l.wasteRatio > 3).slice(0, 2).map((l) => `الخط ${l.lineName}: تقليل الهالك الحالي (${l.wasteRatio}%).`),
        ],
      };
    }
    return {
      title: 'خطة تحسين أداء مطلوبة',
      body: `نقدّر مجهود المشرف ${sup.name}، ويوصى بتنفيذ خطة تحسين قصيرة المدى لرفع الإنتاجية وضبط الجودة.`,
      recommendations: [
        'وضع هدف أسبوعي واضح لرفع درجة الأداء تدريجيًا.',
        'تحليل أسباب التوقف والهالك يوميًا على مستوى كل خط.',
        'تطبيق متابعة دورية مع فريق الخط والجودة.',
      ],
    };
  }, []);

  const printSupervisorPerformance = useCallback((sup: SupervisorRow) => {
    const lineRows = buildSupervisorLineRows(sup);
    const productRows = buildSupervisorProductRows(sup);
    const appreciation = buildAppreciation(sup, lineRows);
    const periodLabel = viewMode === 'today' ? `اليوم (${today})` : `${startDate} إلى ${endDate}`;
    const requiredQty = Number((sup.benchmarkDaily * sup.totalDaysInRange).toFixed(1));
    const achievedQty = Number(sup.totalProduced.toFixed(1));
    const performanceRatio = requiredQty > 0
      ? Number(((achievedQty / requiredQty) * 100).toFixed(1))
      : Number(sup.performanceScore.toFixed(1));
    const costStatusHigh = sup.scrapRate > 5;
    const costStatusLabel = costStatusHigh ? 'مرتفعة' : 'طبيعية';
    const lineUtilizationRatio = Number(((sup.activeDays / Math.max(sup.totalDaysInRange, 1)) * 100).toFixed(1));
    const lineUtilizationHigh = lineUtilizationRatio >= 70;

    setSingleSupervisorPrintData({
      supervisorName: sup.name,
      supervisorCode: sup.code,
      departmentName: getDepartmentName(sup.departmentId ?? ''),
      jobTitle: getJobPositionTitle(sup.jobPositionId ?? ''),
      statusLabel: sup.isActive !== false ? 'نشط' : 'غير نشط',
      periodLabel,
      performanceScore: sup.performanceScore,
      totalProduced: sup.totalProduced,
      totalWaste: sup.totalWaste,
      wasteRatio: sup.scrapRate,
      reportsCount: sup.reportCount,
      workDays: sup.activeDays,
      todayProduced: sup.todayProduced,
      weekProduced: sup.weekProduced,
      linesCount: sup.assignedLines.length,
      avgWorkers: sup.totalWorkers,
      requiredQty,
      achievedQty,
      performanceRatio,
      costStatusLabel,
      costStatusHigh,
      lineUtilizationRatio,
      lineUtilizationHigh,
      appreciationTitle: appreciation.title,
      appreciationBody: appreciation.body,
      recommendations: appreciation.recommendations,
      productRows,
      lineRows,
    });
    setTimeout(() => handleSingleSupervisorPrint(), 120);
  }, [
    buildSupervisorLineRows,
    buildSupervisorProductRows,
    buildAppreciation,
    endDate,
    getDepartmentName,
    getJobPositionTitle,
    handleSingleSupervisorPrint,
    startDate,
    today,
    viewMode,
  ]);

  const exportSupervisorPerformance = useCallback((sup: SupervisorRow) => {
    if (!canExportFromPage) return;
    const lineRows = buildSupervisorLineRows(sup);
    const productRows = buildSupervisorProductRows(sup);
    const appreciation = buildAppreciation(sup, lineRows);
    const periodLabel = viewMode === 'today' ? `اليوم (${today})` : `${startDate} إلى ${endDate}`;

    const summarySheet = [
      { البند: 'اسم المشرف', القيمة: sup.name },
      { البند: 'الكود', القيمة: sup.code ?? '—' },
      { البند: 'القسم', القيمة: getDepartmentName(sup.departmentId ?? '') },
      { البند: 'الوظيفة', القيمة: getJobPositionTitle(sup.jobPositionId ?? '') },
      { البند: 'الفترة', القيمة: periodLabel },
      { البند: 'درجة الأداء', القيمة: sup.performanceScore },
      { البند: 'إجمالي الإنتاج', القيمة: sup.totalProduced },
      { البند: 'إجمالي الهالك', القيمة: sup.totalWaste },
      { البند: 'نسبة الهالك %', القيمة: sup.scrapRate },
      { البند: 'إنتاج اليوم', القيمة: sup.todayProduced },
      { البند: 'إنتاج الأسبوع', القيمة: sup.weekProduced },
      { البند: 'عدد التقارير', القيمة: sup.reportCount },
      { البند: 'عدد الخطوط', القيمة: sup.assignedLines.length },
      { البند: 'متوسط العمالة', القيمة: sup.totalWorkers },
      { البند: 'رسالة التقدير', القيمة: appreciation.title },
      { البند: 'ملخص التقييم', القيمة: appreciation.body },
    ];
    const lineSheet = lineRows.map((r) => ({
      'خط الإنتاج': r.lineName,
      'عدد التقارير': r.reportsCount,
      'الإنتاج': r.produced,
      'الهالك': r.waste,
      'نسبة الهالك %': r.wasteRatio,
      'متوسط العمالة': r.avgWorkers,
      'إجمالي الساعات': r.totalHours,
    }));
    const productSheet = productRows.map((r) => ({
      'المنتج': r.productName,
      'عدد التقارير': r.reportsCount,
      'الكمية المطلوبة': r.requiredQty,
      'الكمية المحققة': r.achievedQty,
      'نسبة الأداء %': r.performanceRatio,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet), 'ملخص التقييم');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productSheet), 'تفصيل المنتجات');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lineSheet), 'تفصيل الخطوط');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const safeName = (sup.name || 'supervisor').replace(/[\\/:*?"<>|]/g, '_');
    saveAs(new Blob([buf], { type: 'application/octet-stream' }), `supervisor_performance_${safeName}_${today}.xlsx`);
  }, [
    buildAppreciation,
    buildSupervisorLineRows,
    buildSupervisorProductRows,
    canExportFromPage,
    endDate,
    getDepartmentName,
    getJobPositionTitle,
    startDate,
    today,
    viewMode,
  ]);

  const bulkActions = useMemo<TableBulkAction<SupervisorRow>[]>(() => {
    const actions: TableBulkAction<SupervisorRow>[] = [
      { label: 'طباعة تقرير', icon: 'print', action: printSelected, variant: 'default' },
    ];
    if (canExportFromPage) {
      actions.unshift({
        label: 'تصدير Excel',
        icon: 'download',
        action: exportSelectedCSV,
        variant: pageControl.exportVariant === 'primary' ? 'primary' : 'default',
        permission: 'export',
      });
    }
    return actions;
  }, [exportSelectedCSV, printSelected, canExportFromPage, pageControl.exportVariant]);

  // ── Table columns ───────────────────────────────────────────────────────────

  const columns = useMemo<TableColumn<SupervisorRow>[]>(() => [
    {
      header: 'المشرف',
      render: (sup) => (
        <div
          className="flex items-center gap-3 relative"
          onMouseEnter={() => handleMouseEnter(sup.id!)}
          onMouseLeave={handleMouseLeave}
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-primary/20 to-primary/5 ring-2 ring-primary/10">
            <span className="material-icons-round text-lg text-primary">engineering</span>
          </div>
          <div className="min-w-0">
            <span className="font-bold text-[var(--color-text)] block truncate">{sup.name}</span>
            {sup.code && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-[var(--border-radius-sm)] bg-[#f0f2f5] text-[var(--color-text-muted)] text-[10px] font-mono font-bold mt-0.5">{sup.code}</span>
            )}
          </div>
          {/* Hover card */}
          {hoveredSupervisor === sup.id && (
            <div className="absolute top-full right-0 mt-2 z-50 bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] shadow-2xl p-4 w-64 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[var(--color-border)]">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="material-icons-round text-primary text-sm">engineering</span>
                </div>
                <div>
                  <p className="font-bold text-sm text-[var(--color-text)]">{sup.name}</p>
                  <p className="text-[10px] text-slate-400">{getDepartmentName(sup.departmentId ?? '')}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-[var(--border-radius-base)] p-2 text-center">
                  <p className="text-emerald-500 font-medium">إنتاج اليوم</p>
                  <p className="font-bold text-emerald-700 text-sm">{formatNumber(sup.todayProduced)}</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/10 rounded-[var(--border-radius-base)] p-2 text-center">
                  <p className="text-blue-500 font-medium">الأسبوع</p>
                  <p className="font-bold text-blue-700 dark:text-blue-300 text-sm">{formatNumber(sup.weekProduced)}</p>
                </div>
                <div className="bg-rose-50 dark:bg-rose-900/10 rounded-[var(--border-radius-base)] p-2 text-center">
                  <p className="text-rose-500 font-medium">الهالك</p>
                  <p className="font-bold text-rose-700 text-sm">{sup.scrapRate}%</p>
                </div>
                <div className={`rounded-[var(--border-radius-base)] p-2 text-center ${
                  (sup.deviationPct ?? 0) >= 0
                    ? 'bg-emerald-50 dark:bg-emerald-900/10'
                    : (sup.deviationPct ?? 0) <= -20
                      ? 'bg-rose-50 dark:bg-rose-900/10'
                      : 'bg-amber-50 dark:bg-amber-900/10'
                }`}>
                  <p className={`font-medium ${
                    (sup.deviationPct ?? 0) >= 0
                      ? 'text-emerald-500'
                      : (sup.deviationPct ?? 0) <= -20
                        ? 'text-rose-500'
                        : 'text-amber-500'
                  }`}>الانحراف</p>
                  <p className={`font-black text-sm ${
                    (sup.deviationPct ?? 0) >= 0
                      ? 'text-emerald-700'
                      : (sup.deviationPct ?? 0) <= -20
                        ? 'text-rose-700'
                        : 'text-amber-700'
                  }`}>
                    {sup.deviationPct === null ? '—' : `${sup.deviationPct > 0 ? '+' : ''}${sup.deviationPct}%`}
                  </p>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-[var(--color-text-muted)] flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1">
                  <span className="material-icons-round text-[10px]">calendar_month</span>
                  {sup.activeDays}/{sup.totalDaysInRange} يوم
                </span>
                <span className="material-icons-round text-[10px]">precision_manufacturing</span>
                <span>{sup.assignedLines.length} خط إنتاج</span>
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'القسم',
      render: (sup) => <span className="text-sm text-[var(--color-text-muted)]">{getDepartmentName(sup.departmentId ?? '')}</span>,
    },
    {
      header: 'الحالة',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (sup) => (
        <Badge variant={sup.isActive !== false ? 'success' : 'danger'}>
          {sup.isActive !== false ? 'نشط' : 'غير نشط'}
        </Badge>
      ),
    },
    {
      header: 'الخطوط',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (sup) => (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-[var(--border-radius-base)] bg-[#f0f2f5] text-[var(--color-text-muted)] text-sm font-bold">
          <span className="material-icons-round text-xs">precision_manufacturing</span>
          {sup.assignedLines.length}
        </span>
      ),
    },
    {
      header: 'العمال',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (sup) => <span className="text-sm font-bold text-[var(--color-text-muted)]">{sup.totalWorkers}</span>,
    },
    {
      header: 'إنتاج اليوم',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (sup) => (
        <span className={`text-sm font-bold ${sup.todayProduced > 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
          {formatNumber(sup.todayProduced)}
        </span>
      ),
    },
    {
      header: 'الهالك %',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (sup) => {
        const pct = sup.scrapRate;
        return (
          <div className="flex items-center gap-2 justify-center">
            <div className="w-16 h-2 bg-[#f0f2f5] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct > 5 ? 'bg-rose-500' : pct > 2 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min(pct * 5, 100)}%` }}
              />
            </div>
            <span className={`text-xs font-bold min-w-[32px] ${pct > 5 ? 'text-rose-500' : pct > 2 ? 'text-amber-500' : 'text-emerald-500'}`}>
              {pct}%
            </span>
          </div>
        );
      },
    },
    {
      header: 'الانحراف',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (sup) => {
        const deviation = sup.deviationPct;
        if (deviation === null) return <span className="text-xs text-[var(--color-text-muted)]">—</span>;
        const tone = deviation >= 0 ? 'text-emerald-600' : deviation <= -20 ? 'text-rose-600' : 'text-amber-600';
        return (
          <span className={`text-xs font-bold ${tone}`}>
            {deviation > 0 ? '+' : ''}{deviation}%
          </span>
        );
      },
    },
    {
      header: 'الأداء',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (sup) => {
        const { variant, label } = getScoreBadge(sup.performanceScore);
        const colorMap = { success: 'text-emerald-600', warning: 'text-amber-600', danger: 'text-rose-600' };
        const bgMap = { success: 'bg-emerald-500', warning: 'bg-amber-500', danger: 'bg-rose-500' };
        return (
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex flex-col items-center gap-1">
              <span className={`text-lg font-bold ${colorMap[variant]}`}>{sup.performanceScore}%</span>
              <div className="w-12 h-1.5 bg-[#f0f2f5] rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${bgMap[variant]}`} style={{ width: `${sup.performanceScore}%` }} />
              </div>
              <span className={`text-[10px] font-bold ${colorMap[variant]}`}>{label}</span>
            </div>
            <div className="flex flex-wrap justify-center gap-1 max-w-[180px]">
              {sup.performanceByLine.slice(0, 3).map((line) => {
                const lineBadge = getScoreBadge(line.performanceScore);
                const lineTone =
                  lineBadge.variant === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : lineBadge.variant === 'warning'
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200';
                return (
                  <span
                    key={`${sup.id}_${line.lineId}`}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--border-radius-sm)] border text-[10px] font-bold ${lineTone}`}
                    title={`${line.lineName}: ${line.performanceScore}%`}
                  >
                    <span>{line.lineName}</span>
                    <span>{line.performanceScore}%</span>
                  </span>
                );
              })}
              {sup.performanceByLine.length > 3 && (
                <span className="text-[10px] font-bold text-[var(--color-text-muted)]">+{sup.performanceByLine.length - 3}</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      header: 'آخر نشاط',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (sup) => (
        <span className="text-xs text-[var(--color-text-muted)] font-medium">
          {sup.lastActivity === '—' ? '—' : sup.lastActivity.slice(5)}
        </span>
      ),
    },
  ], [departments, jobPositions, hoveredSupervisor, productionLines]);

  // ── Row actions ─────────────────────────────────────────────────────────────

  const renderActions = useCallback((sup: SupervisorRow) => (
    <div className="flex items-center gap-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
      {can('print') && (
        <button
          onClick={() => printSupervisorPerformance(sup)}
          className="p-2 text-[var(--color-text-muted)] hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-[var(--border-radius-base)] transition-all"
          title="طباعة تقييم الأداء"
        >
          <span className="material-icons-round text-lg">print</span>
        </button>
      )}
      {canExportFromPage && (
        <button
          onClick={() => exportSupervisorPerformance(sup)}
          className="p-2 text-[var(--color-text-muted)] hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-[var(--border-radius-base)] transition-all"
          title="تصدير تقييم الأداء"
        >
          <span className="material-icons-round text-lg">download</span>
        </button>
      )}
      <button
        onClick={() => navigate(`/supervisors/${sup.id}`)}
        className="p-2 text-[var(--color-text-muted)] hover:text-primary hover:bg-primary/10 rounded-[var(--border-radius-base)] transition-all"
        title="عرض التفاصيل"
      >
        <span className="material-icons-round text-lg">visibility</span>
      </button>
      <button
        onClick={() => navigate(`/employees/${sup.id}`)}
        className="p-2 text-[var(--color-text-muted)] hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-[var(--border-radius-base)] transition-all"
        title="الملف الشخصي"
      >
        <span className="material-icons-round text-lg">person</span>
      </button>
    </div>
  ), [can, canExportFromPage, exportSupervisorPerformance, navigate, printSupervisorPerformance]);

  // ── Unique values for filters ───────────────────────────────────────────────

  const uniqueLines = useMemo(() => {
    const set = new Set<string>();
    supervisors.forEach((s) => s.assignedLines.forEach((l) => set.add(l)));
    return [...set];
  }, [supervisors]);

  const clearAllFilters = () => {
    setSearch('');
    setFilterLine('');
    setStatFilter('');
  };

  const hasActiveFilters = search || filterLine || statFilter;
  const periodValue = useMemo(() => {
    if (viewMode === 'today') return 'today';
    if (startDate === endDate && startDate !== today) return 'yesterday';
    if (startDate.endsWith('-01')) return 'month';
    return 'week';
  }, [viewMode, startDate, endDate, today]);

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (dataLoading) {
    return <div className="erp-ds-clean space-y-6"><LoadingSkeleton type="detail" /></div>;
  }

  const toggleStatFilter = (f: StatFilter) => setStatFilter((prev) => prev === f ? '' : f);

  return (
    <div className="erp-ds-clean erpnext-supervisors space-y-6">
      {/* Header */}
      <PageHeader
        title="المشرفين"
        subtitle="لوحة إدارة مشرفي خطوط الإنتاج وتحليل الأداء"
        icon="engineering"
        secondaryAction={hasActiveFilters ? {
          label: 'مسح الفلاتر',
          icon: 'filter_alt_off',
          onClick: clearAllFilters,
        } : undefined}
      />

      {/* ── Stat Cards (clickable) ──────────────────────────────────────────── */}
      <div className="erpnext-kpi-grid grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <button className="text-right erpnext-kpi-btn" onClick={() => toggleStatFilter('today')}>
          <KPIBox
            label="إنتاج اليوم"
            value={formatNumber(stats.todayTotal)}
            icon="today"
            colorClass={statFilter === 'today' ? 'bg-primary text-white' : 'bg-emerald-50 text-emerald-600'}
            trend={stats.todayChange !== 0 ? `${Math.abs(stats.todayChange)}% عن أمس` : undefined}
            trendUp={stats.todayChange >= 0}
          />
        </button>
        <button className="text-right erpnext-kpi-btn" onClick={() => toggleStatFilter('week')}>
          <KPIBox
            label="إنتاج الأسبوع"
            value={formatNumber(stats.weekTotal)}
            icon="date_range"
            colorClass={statFilter === 'week' ? 'bg-primary text-white' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20'}
            trend={stats.weekChange !== 0 ? `${Math.abs(stats.weekChange)}% عن الأسبوع الماضي` : undefined}
            trendUp={stats.weekChange >= 0}
          />
        </button>
        <button className="text-right erpnext-kpi-btn" onClick={() => toggleStatFilter('highScrap')}>
          <KPIBox
            label="نسبة الهالك الكلية"
            value={`${stats.overallScrapRate}%`}
            icon="delete_sweep"
            colorClass={statFilter === 'highScrap' ? 'bg-primary text-white' : stats.overallScrapRate > 5 ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}
          />
        </button>
        <button className="text-right erpnext-kpi-btn" onClick={() => toggleStatFilter('lowScore')}>
          <KPIBox
            label="متوسط درجة الأداء"
            value={stats.avgScore}
            icon="speed"
            colorClass={statFilter === 'lowScore' ? 'bg-primary text-white' : stats.avgScore >= 85 ? 'bg-emerald-50 text-emerald-600' : stats.avgScore >= 70 ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600'}
          />
        </button>
        <button className="text-right erpnext-kpi-btn" onClick={() => toggleStatFilter('active')}>
          <KPIBox
            label="المشرفين النشطين"
            value={stats.activeSupervisors}
            icon="engineering"
            unit={`/ ${supervisors.length}`}
            colorClass={statFilter === 'active' ? 'bg-primary text-white' : 'bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400'}
          />
        </button>
      </div>

      {/* ── Advanced Filters ────────────────────────────────────────────────── */}
      <Card className="erpnext-filter-card">
        <div className="erpnext-filter-head mb-4">
          <p className="erpnext-filter-title">فلترة المشرفين</p>
          <div className="flex items-center gap-2">
            <span className="erpnext-filter-chip">{filtered.length} نتيجة</span>
            {hasActiveFilters && (
              <Button variant="outline" className="text-xs !py-1.5 !px-2.5" onClick={clearAllFilters}>
                <span className="material-icons-round text-sm">filter_alt_off</span>
                مسح
              </Button>
            )}
          </div>
        </div>

        <SmartFilterBar
          searchPlaceholder="ابحث باسم المشرف أو الكود..."
          searchValue={search}
          onSearchChange={setSearch}
          periods={[
            { label: 'اليوم', value: 'today' },
            { label: 'أمس', value: 'yesterday' },
            { label: 'أسبوعي', value: 'week' },
            { label: 'شهري', value: 'month' },
          ]}
          activePeriod={periodValue}
          onPeriodChange={(value) => {
            if (value === 'today') handleShowToday();
            if (value === 'yesterday') handleShowYesterday();
            if (value === 'week') handleShowWeekly();
            if (value === 'month') handleShowMonthly();
          }}
          quickFilters={[
            {
              key: 'line',
              placeholder: 'كل الخطوط',
              options: uniqueLines.map((lineId) => ({ value: lineId, label: getLineName(lineId) })),
              width: 'w-[130px]',
            },
          ]}
          quickFilterValues={{ line: filterLine || 'all' }}
          onQuickFilterChange={(_, value) => setFilterLine(value === 'all' ? '' : value)}
          advancedFilters={[
            { key: 'dateFrom', label: 'من تاريخ', placeholder: '', options: [], type: 'date', width: 'w-[150px]' },
            { key: 'dateTo', label: 'إلى تاريخ', placeholder: '', options: [], type: 'date', width: 'w-[150px]' },
          ]}
          advancedFilterValues={{
            dateFrom: startDate,
            dateTo: endDate,
          }}
          onAdvancedFilterChange={(key, value) => {
            if (key === 'dateFrom') setStartDate(value);
            if (key === 'dateTo') setEndDate(value);
          }}
          onApply={handleApplyDateRange}
          applyLabel={reportsLoading ? 'جار التحميل...' : 'عرض'}
          className="mb-4"
        />

        <div className="mb-4 erpnext-date-scope">
          {rangeError && (
            <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-[var(--border-radius-base)] px-3 py-2">
              {rangeError}
            </div>
          )}
        </div>

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <SelectableTable<SupervisorRow>
          data={filtered}
          columns={columns}
          getId={(sup) => sup.id!}
          tableId="production-supervisors-table"
          bulkActions={bulkActions}
          renderActions={renderActions}
          emptyIcon="engineering"
          emptyTitle="لا يوجد مشرفين"
          emptySubtitle={hasActiveFilters ? 'جرب تغيير الفلاتر أو مسحها' : 'لم يتم العثور على مشرفين بمستوى "مشرف" (level 2)'}
          pageSize={15}
        />
      </Card>

      {/* Hidden print template */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <ProductionReportPrint
          ref={bulkPrintRef}
          title="تقرير المشرفين"
          subtitle={`${filtered.length} مشرف — ${today}`}
          rows={printRows}
          totals={printTotals}
          printSettings={printTemplate}
        />
      </div>

      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <SupervisorPerformancePrint
          ref={singleSupervisorPrintRef}
          data={singleSupervisorPrintData}
          printSettings={printTemplate}
        />
      </div>
    </div>
  );
};
