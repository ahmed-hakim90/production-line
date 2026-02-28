import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../store/useAppStore';
import { useManagedPrint } from '@/utils/printManager';
import { Card, KPIBox, Badge, Button, LoadingSkeleton } from '../components/UI';
import { SelectableTable, type TableColumn, type TableBulkAction } from '../components/SelectableTable';
import { ProductionReportPrint, mapReportsToPrintRows, computePrintTotals } from '../components/ProductionReportPrint';
import type { FirestoreEmployee, ProductionReport } from '../../../types';
import { getDocs } from 'firebase/firestore';
import { departmentsRef, jobPositionsRef } from '../../hr/collections';
import type { FirestoreDepartment, FirestoreJobPosition } from '../../hr/types';
import { formatNumber, calculateWasteRatio, getTodayDateString } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { getExportImportPageControl } from '../../../utils/exportImportControls';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

// ─── Performance Score ────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function computePerformanceScore(
  produced: number,
  target: number,
  wasteRatio: number,
  activeDays: number,
  totalDays: number,
): number {
  const productionScore = target > 0 ? (produced / target) * 100 : (produced > 0 ? 75 : 0);
  const wastePenalty = wasteRatio;
  const consistencyBonus = totalDays > 0 ? (activeDays / totalDays) * 10 : 0;
  return clamp(Math.round(productionScore - wastePenalty + consistencyBonus), 0, 100);
}

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

// ─── SupervisorRow type ───────────────────────────────────────────────────────

interface SupervisorRow extends FirestoreEmployee {
  reports: ProductionReport[];
  reportCount: number;
  totalProduced: number;
  totalWaste: number;
  todayProduced: number;
  weekProduced: number;
  scrapRate: number;
  performanceScore: number;
  assignedLines: string[];
  totalWorkers: number;
  lastActivity: string;
}

// ─── Active filter for stat cards ─────────────────────────────────────────────

type StatFilter = '' | 'today' | 'week' | 'highScrap' | 'lowScore' | 'active';

export const Supervisors: React.FC = () => {
  const navigate = useNavigate();
  const { can } = usePermission();

  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const productionReports = useAppStore((s) => s.productionReports);
  const todayReports = useAppStore((s) => s.todayReports);
  const productionLines = useAppStore((s) => s.productionLines);
  const products = useAppStore((s) => s.products);
  const employees = useAppStore((s) => s.employees);
  const productionPlans = useAppStore((s) => s.productionPlans);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);

  const [departments, setDepartments] = useState<FirestoreDepartment[]>([]);
  const [jobPositions, setJobPositions] = useState<FirestoreJobPosition[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterLine, setFilterLine] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | 'active' | 'inactive'>('');
  const [filterScoreRange, setFilterScoreRange] = useState<'' | 'high' | 'mid' | 'low'>('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [statFilter, setStatFilter] = useState<StatFilter>('');
  const [hoveredSupervisor, setHoveredSupervisor] = useState<string | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [bulkPrintReports, setBulkPrintReports] = useState<ProductionReport[] | null>(null);
  const bulkPrintRef = useRef<HTMLDivElement>(null);
  const handleBulkPrint = useManagedPrint({ contentRef: bulkPrintRef, printSettings: printTemplate });
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

  const today = getTodayDateString();
  const weekStart = useMemo(() => getWeekStart(), []);
  const lastWeek = useMemo(() => getLastWeekRange(), []);

  const allReports = productionReports.length > 0 ? productionReports : todayReports;

  const reportsByEmployee = useMemo(() => {
    const map = new Map<string, ProductionReport[]>();
    for (const r of allReports) {
      const list = map.get(r.employeeId) ?? [];
      list.push(r);
      map.set(r.employeeId, list);
    }
    return map;
  }, [allReports]);

  const targetByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    for (const plan of productionPlans) {
      if (plan.status === 'in_progress' || plan.status === 'planned') {
        const lineReports = allReports.filter((r) => r.lineId === plan.lineId);
        const empIds = new Set(lineReports.map((r) => r.employeeId));
        empIds.forEach((empId) => {
          map.set(empId, (map.get(empId) ?? 0) + (plan.plannedQuantity ?? 0));
        });
      }
    }
    return map;
  }, [productionPlans, allReports]);

  const supervisors = useMemo<SupervisorRow[]>(() => {
    const totalDaysInRange = Math.max(1, Math.ceil((new Date().getTime() - new Date(weekStart).getTime()) / (1000 * 60 * 60 * 24)) + 1);

    return _rawEmployees
      .filter((e) => e.level === 2)
      .map((e) => {
        const reports = reportsByEmployee.get(e.id!) ?? [];
        const totalProduced = reports.reduce((s, r) => s + (r.quantityProduced ?? 0), 0);
        const totalWaste = reports.reduce((s, r) => s + (r.quantityWaste ?? 0), 0);
        const todayProduced = reports
          .filter((r) => r.date === today)
          .reduce((s, r) => s + (r.quantityProduced ?? 0), 0);
        const weekProduced = reports
          .filter((r) => r.date >= weekStart && r.date <= today)
          .reduce((s, r) => s + (r.quantityProduced ?? 0), 0);
        const scrapRate = calculateWasteRatio(totalWaste, totalProduced + totalWaste);
        const target = targetByEmployee.get(e.id!) ?? 0;
        const activeDays = countUniqueDaysInRange(reports, weekStart, today);
        const performanceScore = computePerformanceScore(totalProduced, target, scrapRate, activeDays, totalDaysInRange);
        const assignedLines = [...new Set(reports.map((r) => r.lineId))];
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
          performanceScore,
          assignedLines,
          totalWorkers,
          lastActivity,
        };
      });
  }, [_rawEmployees, reportsByEmployee, targetByEmployee, today, weekStart]);

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
    if (filterDepartment) list = list.filter((e) => e.departmentId === filterDepartment);
    if (filterLine) list = list.filter((e) => e.assignedLines.includes(filterLine));
    if (filterStatus === 'active') list = list.filter((e) => e.isActive !== false);
    if (filterStatus === 'inactive') list = list.filter((e) => e.isActive === false);
    if (filterScoreRange === 'high') list = list.filter((e) => e.performanceScore >= 85);
    if (filterScoreRange === 'mid') list = list.filter((e) => e.performanceScore >= 70 && e.performanceScore < 85);
    if (filterScoreRange === 'low') list = list.filter((e) => e.performanceScore < 70);

    if (filterDateFrom || filterDateTo) {
      list = list.filter((s) => {
        const hasReportsInRange = s.reports.some((r) => {
          if (filterDateFrom && r.date < filterDateFrom) return false;
          if (filterDateTo && r.date > filterDateTo) return false;
          return true;
        });
        return hasReportsInRange;
      });
    }

    return list;
  }, [supervisors, search, filterDepartment, filterLine, filterStatus, filterScoreRange, filterDateFrom, filterDateTo, statFilter]);

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
    const yesterdayTotal = allReports
      .filter((r) => r.date === yesterdayStr && supervisors.some((s) => s.id === r.employeeId))
      .reduce((s, r) => s + (r.quantityProduced ?? 0), 0);
    const todayChange = yesterdayTotal > 0 ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100) : 0;

    const lastWeekTotal = allReports
      .filter((r) => r.date >= lastWeek.start && r.date <= lastWeek.end && supervisors.some((s) => s.id === r.employeeId))
      .reduce((s, r) => s + (r.quantityProduced ?? 0), 0);
    const weekChange = lastWeekTotal > 0 ? Math.round(((weekTotal - lastWeekTotal) / lastWeekTotal) * 100) : 0;

    return { activeSupervisors, todayTotal, weekTotal, overallScrapRate, avgScore, todayChange, weekChange };
  }, [supervisors, allReports, lastWeek]);

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
      'درجة الأداء': s.performanceScore,
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
            <span className="font-bold text-slate-800 dark:text-white block truncate">{sup.name}</span>
            {sup.code && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-mono font-bold mt-0.5">{sup.code}</span>
            )}
          </div>
          {/* Hover card */}
          {hoveredSupervisor === sup.id && (
            <div className="absolute top-full right-0 mt-2 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-4 w-64 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100 dark:border-slate-700">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="material-icons-round text-primary text-sm">engineering</span>
                </div>
                <div>
                  <p className="font-bold text-sm text-slate-800 dark:text-white">{sup.name}</p>
                  <p className="text-[10px] text-slate-400">{getDepartmentName(sup.departmentId ?? '')}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-lg p-2 text-center">
                  <p className="text-emerald-500 font-medium">إنتاج اليوم</p>
                  <p className="font-black text-emerald-700 dark:text-emerald-300 text-sm">{formatNumber(sup.todayProduced)}</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-2 text-center">
                  <p className="text-blue-500 font-medium">الأسبوع</p>
                  <p className="font-black text-blue-700 dark:text-blue-300 text-sm">{formatNumber(sup.weekProduced)}</p>
                </div>
                <div className="bg-rose-50 dark:bg-rose-900/10 rounded-lg p-2 text-center">
                  <p className="text-rose-500 font-medium">الهالك</p>
                  <p className="font-black text-rose-700 dark:text-rose-300 text-sm">{sup.scrapRate}%</p>
                </div>
                <div className={`rounded-lg p-2 text-center ${sup.performanceScore >= 85 ? 'bg-emerald-50 dark:bg-emerald-900/10' : sup.performanceScore >= 70 ? 'bg-amber-50 dark:bg-amber-900/10' : 'bg-rose-50 dark:bg-rose-900/10'}`}>
                  <p className={`font-medium ${sup.performanceScore >= 85 ? 'text-emerald-500' : sup.performanceScore >= 70 ? 'text-amber-500' : 'text-rose-500'}`}>الأداء</p>
                  <p className={`font-black text-sm ${sup.performanceScore >= 85 ? 'text-emerald-700 dark:text-emerald-300' : sup.performanceScore >= 70 ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'}`}>{sup.performanceScore}</p>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-1">
                <span className="material-icons-round text-[10px]">precision_manufacturing</span>
                {sup.assignedLines.length} خط إنتاج
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'القسم',
      render: (sup) => <span className="text-sm text-slate-600 dark:text-slate-400">{getDepartmentName(sup.departmentId ?? '')}</span>,
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
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-sm font-bold">
          <span className="material-icons-round text-xs">precision_manufacturing</span>
          {sup.assignedLines.length}
        </span>
      ),
    },
    {
      header: 'العمال',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (sup) => <span className="text-sm font-bold text-slate-600 dark:text-slate-400">{sup.totalWorkers}</span>,
    },
    {
      header: 'إنتاج اليوم',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (sup) => (
        <span className={`text-sm font-bold ${sup.todayProduced > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
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
            <div className="w-16 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
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
      header: 'الأداء',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (sup) => {
        const { variant } = getScoreBadge(sup.performanceScore);
        const colorMap = { success: 'text-emerald-600 dark:text-emerald-400', warning: 'text-amber-600 dark:text-amber-400', danger: 'text-rose-600 dark:text-rose-400' };
        const bgMap = { success: 'bg-emerald-500', warning: 'bg-amber-500', danger: 'bg-rose-500' };
        return (
          <div className="flex flex-col items-center gap-1">
            <span className={`text-lg font-black ${colorMap[variant]}`}>{sup.performanceScore}</span>
            <div className="w-12 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${bgMap[variant]}`} style={{ width: `${sup.performanceScore}%` }} />
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
        <span className="text-xs text-slate-400 font-medium">
          {sup.lastActivity === '—' ? '—' : sup.lastActivity.slice(5)}
        </span>
      ),
    },
  ], [departments, jobPositions, hoveredSupervisor, productionLines]);

  // ── Row actions ─────────────────────────────────────────────────────────────

  const renderActions = useCallback((sup: SupervisorRow) => (
    <div className="flex items-center gap-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
      <button
        onClick={() => navigate(`/supervisors/${sup.id}`)}
        className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
        title="عرض التفاصيل"
      >
        <span className="material-icons-round text-lg">visibility</span>
      </button>
      <button
        onClick={() => navigate(`/employees/${sup.id}`)}
        className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-all"
        title="الملف الشخصي"
      >
        <span className="material-icons-round text-lg">person</span>
      </button>
    </div>
  ), [navigate]);

  // ── Unique values for filters ───────────────────────────────────────────────

  const uniqueDepartments = useMemo(
    () => [...new Set(supervisors.map((s) => s.departmentId).filter(Boolean))],
    [supervisors]
  );
  const uniqueLines = useMemo(() => {
    const set = new Set<string>();
    supervisors.forEach((s) => s.assignedLines.forEach((l) => set.add(l)));
    return [...set];
  }, [supervisors]);

  const clearAllFilters = () => {
    setSearch('');
    setFilterDepartment('');
    setFilterLine('');
    setFilterStatus('');
    setFilterScoreRange('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setStatFilter('');
  };

  const hasActiveFilters = search || filterDepartment || filterLine || filterStatus || filterScoreRange || filterDateFrom || filterDateTo || statFilter;

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (dataLoading) {
    return <div className="space-y-6"><LoadingSkeleton type="detail" /></div>;
  }

  const toggleStatFilter = (f: StatFilter) => setStatFilter((prev) => prev === f ? '' : f);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">المشرفين</h2>
          <p className="text-sm text-slate-500 font-medium">لوحة إدارة مشرفي خطوط الإنتاج وتحليل الأداء</p>
        </div>
        {hasActiveFilters && (
          <Button variant="outline" onClick={clearAllFilters}>
            <span className="material-icons-round text-sm">filter_alt_off</span>
            مسح الفلاتر
          </Button>
        )}
      </div>

      {/* ── Stat Cards (clickable) ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <button className="text-right" onClick={() => toggleStatFilter('today')}>
          <KPIBox
            label="إنتاج اليوم"
            value={formatNumber(stats.todayTotal)}
            icon="today"
            colorClass={statFilter === 'today' ? 'bg-primary text-white' : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'}
            trend={stats.todayChange !== 0 ? `${Math.abs(stats.todayChange)}% عن أمس` : undefined}
            trendUp={stats.todayChange >= 0}
          />
        </button>
        <button className="text-right" onClick={() => toggleStatFilter('week')}>
          <KPIBox
            label="إنتاج الأسبوع"
            value={formatNumber(stats.weekTotal)}
            icon="date_range"
            colorClass={statFilter === 'week' ? 'bg-primary text-white' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'}
            trend={stats.weekChange !== 0 ? `${Math.abs(stats.weekChange)}% عن الأسبوع الماضي` : undefined}
            trendUp={stats.weekChange >= 0}
          />
        </button>
        <button className="text-right" onClick={() => toggleStatFilter('highScrap')}>
          <KPIBox
            label="نسبة الهالك الكلية"
            value={`${stats.overallScrapRate}%`}
            icon="delete_sweep"
            colorClass={statFilter === 'highScrap' ? 'bg-primary text-white' : stats.overallScrapRate > 5 ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'}
          />
        </button>
        <button className="text-right" onClick={() => toggleStatFilter('lowScore')}>
          <KPIBox
            label="متوسط درجة الأداء"
            value={stats.avgScore}
            icon="speed"
            colorClass={statFilter === 'lowScore' ? 'bg-primary text-white' : stats.avgScore >= 85 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : stats.avgScore >= 70 ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'}
          />
        </button>
        <button className="text-right" onClick={() => toggleStatFilter('active')}>
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
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-4">
          {/* Search */}
          <div className="relative sm:col-span-2">
            <span className="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
            <input
              type="text"
              placeholder="بحث بالاسم أو الرمز..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
          {/* Department */}
          <select value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
            <option value="">كل الأقسام</option>
            {uniqueDepartments.map((dId) => <option key={dId} value={dId}>{getDepartmentName(dId)}</option>)}
          </select>
          {/* Production line */}
          <select value={filterLine} onChange={(e) => setFilterLine(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
            <option value="">كل الخطوط</option>
            {uniqueLines.map((lId) => <option key={lId} value={lId}>{getLineName(lId)}</option>)}
          </select>
          {/* Status */}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
            <option value="">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">غير نشط</option>
          </select>
          {/* Performance range */}
          <select value={filterScoreRange} onChange={(e) => setFilterScoreRange(e.target.value as any)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all">
            <option value="">كل مستويات الأداء</option>
            <option value="high">ممتاز (85+)</option>
            <option value="mid">جيد (70–84)</option>
            <option value="low">ضعيف (&lt;70)</option>
          </select>
        </div>
        {/* Date range */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="material-icons-round text-lg">calendar_month</span>
            <span className="font-medium">فترة التقارير:</span>
          </div>
          <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
          <span className="text-slate-400">—</span>
          <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" />
          {hasActiveFilters && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
              {filtered.length} نتيجة
            </span>
          )}
        </div>

        {/* ── Table ─────────────────────────────────────────────────────────── */}
        <SelectableTable
          data={filtered}
          columns={columns}
          getId={(sup) => sup.id!}
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
    </div>
  );
};
