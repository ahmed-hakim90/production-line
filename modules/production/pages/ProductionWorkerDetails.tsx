import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import { Card, KPIBox, Badge, Button, LoadingSkeleton } from '../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { reportService } from '../../../services/reportService';
import { employeeService } from '../../hr/employeeService';
import { formatNumber, calculateWasteRatio, getTodayDateString } from '../../../utils/calculations';
import { JOB_LEVEL_LABELS, type JobLevel } from '../../hr/types';
import { EMPLOYMENT_TYPE_LABELS } from '../../../types';
import type { ProductionReport, FirestoreEmployee } from '../../../types';
import type { FirestoreDepartment, FirestoreJobPosition, FirestoreShift } from '../../hr/types';
import { getDocs } from 'firebase/firestore';
import { departmentsRef, jobPositionsRef, shiftsRef } from '../../hr/collections';
import { ProductionReportPrint, mapReportsToPrintRows, computePrintTotals } from '../components/ProductionReportPrint';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function computePerformanceScore(produced: number, target: number, wasteRatio: number, activeDays: number, totalDays: number): number {
  const productionScore = target > 0 ? (produced / target) * 100 : (produced > 0 ? 75 : 0);
  const wastePenalty = wasteRatio;
  const consistencyBonus = totalDays > 0 ? (activeDays / totalDays) * 10 : 0;
  return clamp(Math.round(productionScore - wastePenalty + consistencyBonus), 0, 100);
}

type ChartTab = 'production' | 'efficiency' | 'hours';
type DetailTab = 'production' | 'lines' | 'info';

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

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

export const ProductionWorkerDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = usePermission();

  const employees = useAppStore((s) => s.employees);
  const productionLines = useAppStore((s) => s.productionLines);
  const products = useAppStore((s) => s.products);
  const productionPlans = useAppStore((s) => s.productionPlans);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);
  const systemSettings = useAppStore((s) => s.systemSettings);

  const [employee, setEmployee] = useState<FirestoreEmployee | null>(null);
  const [departments, setDepartments] = useState<FirestoreDepartment[]>([]);
  const [jobPositions, setJobPositions] = useState<FirestoreJobPosition[]>([]);
  const [shifts, setShifts] = useState<FirestoreShift[]>([]);
  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DetailTab>('production');
  const [chartTab, setChartTab] = useState<ChartTab>('production');

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ contentRef: printRef });

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [emp, deptSnap, posSnap, shiftSnap, empReports] = await Promise.all([
          employeeService.getById(id),
          getDocs(departmentsRef()),
          getDocs(jobPositionsRef()),
          getDocs(shiftsRef()),
          reportService.getByEmployee(id),
        ]);
        if (cancelled) return;
        setEmployee(emp ?? null);
        setDepartments(deptSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreDepartment)));
        setJobPositions(posSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreJobPosition)));
        setShifts(shiftSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreShift)));
        setReports(empReports);
      } catch (e) {
        console.error('ProductionWorkerDetails load error:', e);
        if (!cancelled) setEmployee(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const getDepartmentName = (dId: string) => departments.find((d) => d.id === dId)?.name ?? '—';
  const getJobPositionTitle = (pId: string) => jobPositions.find((j) => j.id === pId)?.title ?? '—';
  const getShiftName = (sId: string) => shifts.find((s) => s.id === sId)?.name ?? '—';
  const getLineName = (lId: string) => productionLines.find((l) => l.id === lId)?.name ?? '—';
  const getProductName = (pId: string) => products.find((p) => p.id === pId)?.name ?? '—';

  const lookups = useMemo(() => ({
    getLineName: (lid: string) => productionLines.find((l) => l.id === lid)?.name ?? '—',
    getProductName: (pid: string) => products.find((p) => p.id === pid)?.name ?? '—',
    getEmployeeName: (eid: string) => employees.find((e) => e.id === eid)?.name ?? '—',
  }), [productionLines, products, employees]);

  const printRows = useMemo(() => mapReportsToPrintRows(reports, lookups), [reports, lookups]);
  const printTotals = useMemo(() => computePrintTotals(printRows), [printRows]);

  const today = getTodayDateString();
  const weekStart = useMemo(() => getWeekStart(), []);

  const totalProduced = useMemo(() => reports.reduce((s, r) => s + (r.quantityProduced ?? 0), 0), [reports]);
  const totalWaste = useMemo(() => reports.reduce((s, r) => s + (r.quantityWaste ?? 0), 0), [reports]);
  const wasteRatio = useMemo(() => calculateWasteRatio(totalWaste, totalProduced + totalWaste), [totalProduced, totalWaste]);
  const totalWorkerHours = useMemo(() => reports.reduce((s, r) => s + (r.workersCount ?? 0) * (r.workHours ?? 0), 0), [reports]);
  const totalHours = useMemo(() => reports.reduce((s, r) => s + (r.workHours ?? 0), 0), [reports]);
  const avgPerReport = useMemo(() => reports.length > 0 ? Math.round(totalProduced / reports.length) : 0, [totalProduced, reports.length]);
  const uniqueDays = useMemo(() => new Set(reports.map((r) => r.date)).size, [reports]);

  const todayProduced = useMemo(() => reports.filter((r) => r.date === today).reduce((s, r) => s + (r.quantityProduced ?? 0), 0), [reports, today]);
  const weekProduced = useMemo(() => reports.filter((r) => r.date >= weekStart && r.date <= today).reduce((s, r) => s + (r.quantityProduced ?? 0), 0), [reports, weekStart, today]);

  const target = useMemo(() => {
    let t = 0;
    for (const plan of productionPlans) {
      if (plan.status === 'in_progress' || plan.status === 'planned') {
        const planReports = reports.filter((r) => r.lineId === plan.lineId);
        if (planReports.length > 0) t += plan.plannedQuantity ?? 0;
      }
    }
    return t;
  }, [productionPlans, reports]);

  const performanceScore = useMemo(() => {
    const totalDays = Math.max(1, Math.ceil((new Date().getTime() - new Date(weekStart).getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const activeDays = new Set(reports.filter((r) => r.date >= weekStart && r.date <= today).map((r) => r.date)).size;
    return computePerformanceScore(totalProduced, target, wasteRatio, activeDays, totalDays);
  }, [totalProduced, target, wasteRatio, reports, weekStart, today]);

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
    if (todayProduced === 0 && reports.length > 0) {
      result.push({ type: 'warning', icon: 'today', message: 'لا يوجد إنتاج مسجل اليوم' });
    }
    if (result.length === 0) {
      result.push({ type: 'info', icon: 'check_circle', message: 'العامل يعمل بشكل طبيعي — لا توجد تنبيهات' });
    }
    return result;
  }, [wasteRatio, wasteThreshold, performanceScore, todayProduced, reports.length]);

  const enrichedChartData = useMemo(() => {
    const byDate = new Map<string, { produced: number; waste: number; hours: number; workerHours: number; workers: number; count: number }>();
    reports.forEach((r) => {
      const prev = byDate.get(r.date) ?? { produced: 0, waste: 0, hours: 0, workerHours: 0, workers: 0, count: 0 };
      prev.produced += r.quantityProduced ?? 0;
      prev.waste += r.quantityWaste ?? 0;
      prev.hours += r.workHours ?? 0;
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
  }, [reports]);

  const lineStats = useMemo(() => {
    const map = new Map<string, { reports: number; produced: number; waste: number; hours: number }>();
    reports.forEach((r) => {
      const prev = map.get(r.lineId) ?? { reports: 0, produced: 0, waste: 0, hours: 0 };
      prev.reports++;
      prev.produced += r.quantityProduced ?? 0;
      prev.waste += r.quantityWaste ?? 0;
      prev.hours += r.workHours ?? 0;
      map.set(r.lineId, prev);
    });
    return Array.from(map.entries())
      .map(([lineId, stats]) => ({ lineId, name: getLineName(lineId), ...stats }))
      .sort((a, b) => b.produced - a.produced);
  }, [reports, productionLines]);

  const productStats = useMemo(() => {
    const map = new Map<string, { produced: number; waste: number }>();
    reports.forEach((r) => {
      const prev = map.get(r.productId) ?? { produced: 0, waste: 0 };
      prev.produced += r.quantityProduced ?? 0;
      prev.waste += r.quantityWaste ?? 0;
      map.set(r.productId, prev);
    });
    return Array.from(map.entries())
      .map(([productId, stats]) => ({ name: getProductName(productId), ...stats }))
      .sort((a, b) => b.produced - a.produced);
  }, [reports, products]);

  const ChartTooltip = useCallback(({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3 text-sm" dir="rtl">
        <p className="font-bold text-slate-600 dark:text-slate-300 mb-1">{label}</p>
        {payload.map((entry: any, i: number) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-500">{entry.name}:</span>
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

  if (loading) {
    return <div className="space-y-6"><LoadingSkeleton type="detail" /></div>;
  }

  if (!employee) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16 text-slate-400">
          <span className="material-icons-round text-6xl mb-4 block opacity-30">person_off</span>
          <p className="font-bold text-lg">العامل غير موجود</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/production-workers')}>
            <span className="material-icons-round text-sm">arrow_forward</span>
            العودة لعمال الإنتاج
          </Button>
        </div>
      </div>
    );
  }

  const levelLabel = JOB_LEVEL_LABELS[(employee.level as JobLevel) ?? 1] ?? String(employee.level);
  const scoreBadge = performanceScore >= 85 ? { variant: 'success' as const, label: 'ممتاز' } : performanceScore >= 70 ? { variant: 'warning' as const, label: 'جيد' } : { variant: 'danger' as const, label: 'ضعيف' };

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {alerts.length > 0 && alerts[0].type !== 'info' && (
        <div className="space-y-2">
          {alerts.filter((a) => a.type !== 'info').map((alert, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
                alert.type === 'danger'
                  ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400'
                  : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
              }`}
            >
              <span className="material-icons-round text-lg">{alert.icon}</span>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
          <button
            onClick={() => navigate('/production-workers')}
            className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-all shrink-0 mt-1 sm:mt-0"
          >
            <span className="material-icons-round">arrow_forward</span>
          </button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-teal-500/20 to-teal-500/5 ring-2 ring-teal-500/10 shrink-0">
                <span className="material-icons-round text-2xl text-teal-600">construction</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white truncate">
                {employee.name}
              </h2>
              {employee.code && (
                <span className="font-mono text-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  {employee.code}
                </span>
              )}
              <Badge variant={scoreBadge.variant}>{scoreBadge.label} ({performanceScore})</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
              <Badge variant="neutral">{getDepartmentName(employee.departmentId)}</Badge>
              <Badge variant="info">{getJobPositionTitle(employee.jobPositionId)}</Badge>
              <Badge variant={employee.isActive ? 'success' : 'danger'}>
                {employee.isActive ? 'نشط' : 'غير نشط'}
              </Badge>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-600">|</span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <span className="material-icons-round text-xs">precision_manufacturing</span>
                {lineStats.length} خط إنتاج
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {can('print') && (
            <Button variant="outline" onClick={() => handlePrint()}>
              <span className="material-icons-round text-lg">print</span>
              طباعة
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate(`/employees/${id}`)}>
            <span className="material-icons-round text-lg">person</span>
            الملف الشخصي
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <KPIBox label="إنتاج اليوم" value={formatNumber(todayProduced)} icon="today" colorClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" />
        <KPIBox label="إنتاج الأسبوع" value={formatNumber(weekProduced)} icon="date_range" colorClass="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" />
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
          colorClass={wasteRatio <= 2 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : wasteRatio <= 5 ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'}
          trend={`${formatNumber(totalWaste)} وحدة هالك`}
          trendUp={wasteRatio <= wasteThreshold}
        />
        <KPIBox label="ساعات العمل" value={formatNumber(totalHours)} unit="ساعة" icon="schedule" colorClass="bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400" trend={`${uniqueDays} يوم عمل`} trendUp />
        <KPIBox label="متوسط الإنتاج/تقرير" value={formatNumber(avgPerReport)} icon="trending_up" colorClass="bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400" />
        <KPIBox label="عدد التقارير" value={formatNumber(reports.length)} icon="description" colorClass="bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400" />
        <KPIBox
          label="درجة الأداء"
          value={performanceScore}
          unit="/ 100"
          icon="speed"
          colorClass={performanceScore >= 85 ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : performanceScore >= 70 ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400'}
          trend={scoreBadge.label}
          trendUp={performanceScore >= 70}
        />
      </div>

      {/* Detail Tabs */}
      <div className="flex flex-wrap gap-1">
        {DETAIL_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span className="material-icons-round text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Production */}
      {activeTab === 'production' && (
        <div className="space-y-6">
          <Card>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-teal-600">show_chart</span>
                <h3 className="text-lg font-bold">تحليل الأداء</h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CHART_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setChartTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      chartTab === tab.key
                        ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
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
                        <linearGradient id="pwColorProd" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="pwColorWaste" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      <Area type="monotone" dataKey="produced" name="الإنتاج" stroke="#0d9488" strokeWidth={2} fillOpacity={1} fill="url(#pwColorProd)" />
                      <Area type="monotone" dataKey="waste" name="الهالك" stroke="#ef4444" strokeWidth={1.5} fillOpacity={1} fill="url(#pwColorWaste)" />
                    </AreaChart>
                  ) : chartTab === 'efficiency' ? (
                    <BarChart data={enrichedChartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend />
                      <Bar dataKey="efficiency" name="الكفاءة" fill="#0d9488" radius={[4, 4, 0, 0]} barSize={20} />
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
          </Card>

          {productStats.length > 0 && (
            <Card title="الإنتاج حسب المنتج">
              <div style={{ width: '100%', height: 280 }} dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={productStats} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#94a3b8' }} width={100} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend />
                    <Bar dataKey="produced" name="الإنتاج" fill="#0d9488" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="waste" name="الهالك" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <Card className="!p-0 border-none overflow-hidden shadow-xl shadow-slate-200/50" title="">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-bold">سجل التقارير</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">التاريخ</th>
                    <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">خط الإنتاج</th>
                    <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">المنتج</th>
                    <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الكمية</th>
                    <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الهالك</th>
                    <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">ساعات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {reports.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                        <span className="material-icons-round text-5xl mb-3 block opacity-30">description</span>
                        <p className="font-bold">لا توجد تقارير</p>
                      </td>
                    </tr>
                  )}
                  {reports.slice(0, 30).map((r) => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-300">{r.date}</td>
                      <td className="px-5 py-3 text-sm font-medium">{getLineName(r.lineId)}</td>
                      <td className="px-5 py-3 text-sm font-medium">{getProductName(r.productId)}</td>
                      <td className="px-5 py-3 text-center">
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-sm font-black ring-1 ring-emerald-500/20">
                          {formatNumber(r.quantityProduced)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center text-rose-500 font-bold text-sm">{formatNumber(r.quantityWaste)}</td>
                      <td className="px-5 py-3 text-center text-sm font-bold">{r.workHours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reports.length > 0 && (
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
                <span className="text-sm text-slate-500 font-bold">
                  إجمالي <span className="text-teal-600">{reports.length}</span> تقرير
                  {reports.length > 30 && <span className="text-slate-400 mr-2">— عرض أحدث 30</span>}
                </span>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Tab: Lines */}
      {activeTab === 'lines' && (
        <div className="space-y-6">
          {lineStats.length === 0 ? (
            <Card>
              <div className="text-center py-12 text-slate-400">
                <span className="material-icons-round text-5xl mb-3 block opacity-30">precision_manufacturing</span>
                <p className="font-bold">لا توجد خطوط إنتاج مرتبطة</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {lineStats.map((line) => {
                const lineWasteRatio = calculateWasteRatio(line.waste, line.produced + line.waste);
                return (
                  <Card key={line.lineId}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center">
                          <span className="material-icons-round text-teal-600">precision_manufacturing</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 dark:text-white">{line.name}</h4>
                          <span className="text-xs text-slate-400">{formatNumber(line.reports)} تقرير · {formatNumber(Math.round(line.hours))} ساعة</span>
                        </div>
                      </div>
                      <button
                        onClick={() => navigate(`/lines/${line.lineId}`)}
                        className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-all"
                        title="عرض تفاصيل الخط"
                      >
                        <span className="material-icons-round">arrow_back</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-lg p-3 text-center">
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1">الإنتاج</p>
                        <p className="text-lg font-black text-emerald-700 dark:text-emerald-300">{formatNumber(line.produced)}</p>
                      </div>
                      <div className="bg-rose-50 dark:bg-rose-900/10 rounded-lg p-3 text-center">
                        <p className="text-xs text-rose-600 dark:text-rose-400 font-medium mb-1">الهالك</p>
                        <p className="text-lg font-black text-rose-700 dark:text-rose-300">{formatNumber(line.waste)}</p>
                      </div>
                      <div className={`rounded-lg p-3 text-center ${lineWasteRatio > 5 ? 'bg-rose-50 dark:bg-rose-900/10' : 'bg-amber-50 dark:bg-amber-900/10'}`}>
                        <p className={`text-xs font-medium mb-1 ${lineWasteRatio > 5 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>نسبة الهالك</p>
                        <p className={`text-lg font-black ${lineWasteRatio > 5 ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>{lineWasteRatio}%</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: HR Info */}
      {activeTab === 'info' && (
        <Card title="بيانات الموظف">
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
              <div key={item.label} className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
                <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                  <span className="material-icons-round text-slate-400 text-lg">{item.icon}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-400 font-medium">{item.label}</p>
                  <p className="font-bold text-slate-800 dark:text-white truncate">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Alerts Section */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <span className="material-icons-round text-amber-500">notifications_active</span>
          <h3 className="text-lg font-bold">التنبيهات</h3>
        </div>
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium ${
                alert.type === 'danger'
                  ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400'
                  : alert.type === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                  : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
              }`}
            >
              <span className="material-icons-round text-lg">{alert.icon}</span>
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Hidden print template */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <ProductionReportPrint
          ref={printRef}
          title={`تقارير العامل: ${employee.name}`}
          subtitle={`${getDepartmentName(employee.departmentId)} — ${getJobPositionTitle(employee.jobPositionId)}`}
          rows={printRows}
          totals={printTotals}
          printSettings={printTemplate}
        />
      </div>
    </div>
  );
};
