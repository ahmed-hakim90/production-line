import React, { useState, useMemo, useEffect } from 'react';
import { Card, Badge, LoadingSkeleton } from './UI';
import { useShallowStore } from '../store/useAppStore';
import {
  formatNumber,
  calculateWasteRatio,
  calculatePlanProgress,
  countUniqueDays,
} from '../utils/calculations';
import { reportService } from '../modules/production/services/reportService';
import type { ProductionReport, ProductionPlan } from '../types';

// ─── Period Filter ───────────────────────────────────────────────────────────

type Period = 'daily' | 'yesterday' | 'weekly' | 'monthly';

const PERIOD_OPTIONS: { value: Period; label: string; icon: string }[] = [
  { value: 'daily',     label: 'اليوم',   icon: 'today' },
  { value: 'yesterday', label: 'أمس',     icon: 'history' },
  { value: 'weekly',    label: 'أسبوعي',  icon: 'date_range' },
  { value: 'monthly',   label: 'شهري',    icon: 'calendar_month' },
];

const DashboardPeriodFilter: React.FC<{ value: Period; onChange: (p: Period) => void }> = ({ value, onChange }) => (
  <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1">
    {PERIOD_OPTIONS.map((opt) => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
          value === opt.value
            ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
        }`}
      >
        <span className="material-icons-round text-sm">{opt.icon}</span>
        {opt.label}
      </button>
    ))}
  </div>
);

// ─── Date helpers ────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return fmtDate(d);
}

function getWeekDateRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return { start: fmtDate(start), end: fmtDate(end) };
}

// ─── Employee Dashboard Widget ───────────────────────────────────────────────

interface Props {
  employeeId: string;
  employeeName: string;
}

export const EmployeeDashboardWidget: React.FC<Props> = ({ employeeId, employeeName }) => {
  const {
    todayReports, monthlyReports, productionPlans, planReports,
    _rawProducts, _rawLines, loading,
  } = useShallowStore((s) => ({
    todayReports: s.todayReports,
    monthlyReports: s.monthlyReports,
    productionPlans: s.productionPlans,
    planReports: s.planReports,
    _rawProducts: s._rawProducts,
    _rawLines: s._rawLines,
    loading: s.loading,
  }));

  const [period, setPeriod] = useState<Period>('daily');
  const [yesterdayReports, setYesterdayReports] = useState<ProductionReport[]>([]);
  const [yesterdayLoading, setYesterdayLoading] = useState(false);
  const [weeklyReports, setWeeklyReports] = useState<ProductionReport[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  useEffect(() => {
    if (period !== 'yesterday') return;
    let cancelled = false;
    setYesterdayLoading(true);
    const date = getYesterdayDate();
    reportService.getByDateRange(date, date).then((reports) => {
      if (!cancelled) { setYesterdayReports(reports); setYesterdayLoading(false); }
    }).catch(() => { if (!cancelled) setYesterdayLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  useEffect(() => {
    if (period !== 'weekly') return;
    let cancelled = false;
    setWeeklyLoading(true);
    const { start, end } = getWeekDateRange();
    reportService.getByDateRange(start, end).then((reports) => {
      if (!cancelled) { setWeeklyReports(reports); setWeeklyLoading(false); }
    }).catch(() => { if (!cancelled) setWeeklyLoading(false); });
    return () => { cancelled = true; };
  }, [period]);

  const allPeriodReports = useMemo((): ProductionReport[] => {
    switch (period) {
      case 'daily':     return todayReports;
      case 'yesterday': return yesterdayReports;
      case 'weekly':    return weeklyReports;
      case 'monthly':   return monthlyReports;
    }
  }, [period, todayReports, yesterdayReports, weeklyReports, monthlyReports]);

  const myReports = useMemo(
    () => allPeriodReports.filter((r) => r.employeeId === employeeId),
    [allPeriodReports, employeeId]
  );

  // ── KPIs ──
  const kpis = useMemo(() => {
    const totalProduction = myReports.reduce((s, r) => s + (r.quantityProduced || 0), 0);
    const totalWaste = myReports.reduce((s, r) => s + (r.quantityWaste || 0), 0);
    const wasteRatio = calculateWasteRatio(totalWaste, totalProduction + totalWaste);
    const totalHours = myReports.reduce((s, r) => s + (r.workHours || 0), 0);
    const uniqueDays = countUniqueDays(myReports);
    const avgPerDay = uniqueDays > 0 ? Math.round(totalProduction / uniqueDays) : 0;
    const avgPerHour = totalHours > 0 ? Number((totalProduction / totalHours).toFixed(1)) : 0;

    return { totalProduction, totalWaste, wasteRatio, totalHours, uniqueDays, avgPerDay, avgPerHour, reportsCount: myReports.length };
  }, [myReports]);

  // ── Active plan (find plans on lines where this supervisor works) ──
  const activePlan = useMemo((): { plan: ProductionPlan; actualProduced: number; progress: number; remaining: number } | null => {
    const myLineIds = [...new Set(myReports.map((r) => r.lineId))];

    const allMyLineReports = [...todayReports, ...monthlyReports].filter(
      (r) => r.employeeId === employeeId
    );
    const allLineIds = [...new Set([...myLineIds, ...allMyLineReports.map((r) => r.lineId)])];

    const plan = productionPlans.find(
      (p) => allLineIds.includes(p.lineId) && (p.status === 'in_progress' || p.status === 'planned')
    );
    if (!plan) return null;

    const key = `${plan.lineId}_${plan.productId}`;
    const historical = planReports[key] || [];
    const todayForPlan = todayReports.filter(
      (r) => r.lineId === plan.lineId && r.productId === plan.productId
    );
    const historicalIds = new Set(historical.map((r) => r.id));
    const merged = [...historical, ...todayForPlan.filter((r) => !historicalIds.has(r.id))];
    const actualProduced = merged.reduce((s, r) => s + (r.quantityProduced || 0), 0);
    const progress = calculatePlanProgress(actualProduced, plan.plannedQuantity);
    const remaining = Math.max(plan.plannedQuantity - actualProduced, 0);

    return { plan, actualProduced, progress, remaining };
  }, [myReports, todayReports, monthlyReports, productionPlans, planReports, employeeId]);

  // ── Period-scoped plan production (only this supervisor's contribution in selected period) ──
  const periodPlanProduced = useMemo(() => {
    if (!activePlan) return 0;
    const periodMy = myReports.filter(
      (r) => r.lineId === activePlan.plan.lineId && r.productId === activePlan.plan.productId
    );
    return periodMy.reduce((s, r) => s + (r.quantityProduced || 0), 0);
  }, [activePlan, myReports]);

  // ── Alerts ──
  const alerts = useMemo(() => {
    const items: { type: 'warning' | 'danger'; icon: string; text: string }[] = [];

    if (activePlan && activePlan.progress < 100) {
      const startDate = new Date(activePlan.plan.startDate);
      const now = new Date();
      const elapsedDays = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const totalDaysEstimate = activePlan.plan.plannedQuantity > 0
        ? Math.ceil(activePlan.plan.plannedQuantity / Math.max(kpis.avgPerDay || 1, 1))
        : elapsedDays;
      const expectedProgress = Math.min(Math.round((elapsedDays / Math.max(totalDaysEstimate, 1)) * 100), 100);
      if (activePlan.progress < expectedProgress - 10) {
        items.push({
          type: 'warning',
          icon: 'schedule',
          text: `التقدم متأخر عن الجدول الزمني — المتوقع ${expectedProgress}% والفعلي ${activePlan.progress}%`,
        });
      }
    }

    if (kpis.wasteRatio > 5) {
      items.push({
        type: 'danger',
        icon: 'warning',
        text: `نسبة الهالك مرتفعة (${kpis.wasteRatio}%) — تحقق من جودة المواد أو إعدادات الخط`,
      });
    }

    return items;
  }, [activePlan, kpis]);

  const periodLabel = period === 'daily' ? 'اليوم' : period === 'weekly' ? 'هذا الأسبوع' : 'هذا الشهر';
  const isLoadingData = (period === 'yesterday' && yesterdayLoading) || (period === 'weekly' && weeklyLoading);

  if (loading) {
    return (
      <div className="space-y-8">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-white">لوحة المشرف</h2>
        <LoadingSkeleton type="card" rows={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header + Period Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-white">لوحة المشرف</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium text-sm">
            مرحباً <span className="font-bold text-primary">{employeeName}</span> — متابعة أدائك وإنتاجك
          </p>
        </div>
        <DashboardPeriodFilter value={period} onChange={setPeriod} />
      </div>

      {isLoadingData && (
        <div className="flex items-center justify-center gap-2 py-4 text-slate-400">
          <span className="material-icons-round animate-spin text-lg">refresh</span>
          <span className="text-sm font-bold">جاري تحميل البيانات...</span>
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <span className="material-icons-round text-blue-600 dark:text-blue-400 text-xl">inventory</span>
            </div>
            <p className="text-[11px] font-bold text-slate-400">إجمالي الإنتاج</p>
          </div>
          <h3 className="text-2xl font-black text-blue-600 dark:text-blue-400">{formatNumber(kpis.totalProduction)}</h3>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">وحدة — {periodLabel}</p>
        </div>

        {activePlan && (
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
                <span className="material-icons-round text-emerald-600 dark:text-emerald-400 text-xl">task_alt</span>
              </div>
              <p className="text-[11px] font-bold text-slate-400">تحقيق الخطة</p>
            </div>
            <h3 className={`text-2xl font-black ${activePlan.progress >= 80 ? 'text-emerald-600' : activePlan.progress >= 50 ? 'text-blue-600' : 'text-amber-600'}`}>
              {activePlan.progress}%
            </h3>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">من الخطة الحالية</p>
          </div>
        )}

        {activePlan && (
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg flex items-center justify-center">
                <span className="material-icons-round text-indigo-600 dark:text-indigo-400 text-xl">pending_actions</span>
              </div>
              <p className="text-[11px] font-bold text-slate-400">الكمية المتبقية</p>
            </div>
            <h3 className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{formatNumber(activePlan.remaining)}</h3>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">وحدة متبقية</p>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-10 h-10 bg-rose-50 dark:bg-rose-900/20 rounded-lg flex items-center justify-center">
              <span className="material-icons-round text-rose-600 dark:text-rose-400 text-xl">delete_sweep</span>
            </div>
            <p className="text-[11px] font-bold text-slate-400">نسبة الهالك</p>
          </div>
          <h3 className={`text-2xl font-black ${kpis.wasteRatio > 5 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>
            {kpis.wasteRatio}%
          </h3>
          <p className="text-[10px] text-slate-400 font-medium mt-0.5">{formatNumber(kpis.totalWaste)} وحدة هالك</p>
        </div>

        {period !== 'daily' && (
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center justify-center">
                <span className="material-icons-round text-amber-600 dark:text-amber-400 text-xl">speed</span>
              </div>
              <p className="text-[11px] font-bold text-slate-400">متوسط يومي</p>
            </div>
            <h3 className="text-2xl font-black text-amber-600 dark:text-amber-400">{formatNumber(kpis.avgPerDay)}</h3>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">وحدة/يوم ({kpis.uniqueDays} يوم)</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Active Plan Card (takes 2 cols) ── */}
        <div className="lg:col-span-2 space-y-6">
          {activePlan ? (
            <Card className="border-primary/20 shadow-lg shadow-primary/5">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <span className="material-icons-round text-primary">event_note</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">الخطة النشطة</h3>
                  <p className="text-xs text-slate-400 font-medium">تتبع تقدم خطة الإنتاج الحالية</p>
                </div>
                <div className="mr-auto">
                  <Badge variant={activePlan.plan.status === 'in_progress' ? 'warning' : 'info'}>
                    {activePlan.plan.status === 'in_progress' ? 'قيد التنفيذ' : 'مخطط'}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3.5 text-center border border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] font-bold text-slate-400 mb-1">المنتج</p>
                  <p className="text-sm font-black text-slate-800 dark:text-white">
                    {_rawProducts.find((p) => p.id === activePlan.plan.productId)?.name ?? '—'}
                  </p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3.5 text-center border border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] font-bold text-slate-400 mb-1">الكمية المخططة</p>
                  <p className="text-sm font-black text-primary">{formatNumber(activePlan.plan.plannedQuantity)}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3.5 text-center border border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] font-bold text-slate-400 mb-1">تم إنتاج ({periodLabel})</p>
                  <p className="text-sm font-black text-blue-600">{formatNumber(periodPlanProduced)}</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3.5 text-center border border-slate-100 dark:border-slate-700">
                  <p className="text-[10px] font-bold text-slate-400 mb-1">المتبقي (إجمالي)</p>
                  <p className="text-sm font-black text-indigo-600">{formatNumber(activePlan.remaining)}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-500">التقدم الإجمالي</span>
                  <span className={activePlan.progress >= 80 ? 'text-emerald-600' : activePlan.progress >= 50 ? 'text-blue-600' : 'text-amber-600'}>
                    {activePlan.progress}%
                  </span>
                </div>
                <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      activePlan.progress >= 80 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' :
                      activePlan.progress >= 50 ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)]' :
                      'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                    }`}
                    style={{ width: `${Math.min(activePlan.progress, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                  <span>تم إنتاج {formatNumber(activePlan.actualProduced)} من {formatNumber(activePlan.plan.plannedQuantity)}</span>
                  <span>الخط: {_rawLines.find((l) => l.id === activePlan.plan.lineId)?.name ?? '—'}</span>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <div className="text-center py-8 text-slate-400">
                <span className="material-icons-round text-4xl mb-2 block opacity-30">event_note</span>
                <p className="font-bold">لا توجد خطة إنتاج نشطة حالياً</p>
                <p className="text-sm mt-1">سيتم عرض تفاصيل الخطة عند تفعيلها</p>
              </div>
            </Card>
          )}

          {/* ── Alerts ── */}
          {alerts.length > 0 && (
            <Card>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center justify-center">
                  <span className="material-icons-round text-amber-600 dark:text-amber-400">notifications_active</span>
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white">تنبيهات</h3>
              </div>
              <div className="space-y-3">
                {alerts.map((alert, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-3 p-3.5 rounded-xl border ${
                      alert.type === 'danger'
                        ? 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-900/20'
                        : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-900/20'
                    }`}
                  >
                    <span className={`material-icons-round text-lg mt-0.5 ${
                      alert.type === 'danger' ? 'text-rose-500' : 'text-amber-500'
                    }`}>{alert.icon}</span>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed">{alert.text}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ── Personal Performance (right sidebar) ── */}
        <div className="lg:col-span-1">
          <Card className="sticky top-24 border-emerald-500/20 shadow-lg shadow-emerald-500/5">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
                <span className="material-icons-round text-emerald-600 dark:text-emerald-400">person</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white">الأداء الشخصي</h3>
                <p className="text-[11px] text-slate-400 font-medium">{periodLabel}</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Reports count */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2.5">
                  <span className="material-icons-round text-blue-500 text-lg">description</span>
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-400">عدد التقارير</span>
                </div>
                <span className="text-lg font-black text-blue-600">{kpis.reportsCount}</span>
              </div>

              {/* Avg production per hour */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2.5">
                  <span className="material-icons-round text-emerald-500 text-lg">speed</span>
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-400">متوسط إنتاج/ساعة</span>
                </div>
                <span className="text-lg font-black text-emerald-600">{kpis.avgPerHour > 0 ? formatNumber(kpis.avgPerHour) : '—'}</span>
              </div>

              {/* Total work hours */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2.5">
                  <span className="material-icons-round text-amber-500 text-lg">schedule</span>
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-400">ساعات العمل</span>
                </div>
                <span className="text-lg font-black text-amber-600">{kpis.totalHours > 0 ? `${kpis.totalHours} س` : '—'}</span>
              </div>

              {/* Total production */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2.5">
                  <span className="material-icons-round text-primary text-lg">inventory</span>
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-400">إجمالي الإنتاج</span>
                </div>
                <span className="text-lg font-black text-primary">{formatNumber(kpis.totalProduction)}</span>
              </div>

              {/* Waste */}
              <div className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2.5">
                  <span className="material-icons-round text-rose-500 text-lg">delete_sweep</span>
                  <span className="text-sm font-bold text-slate-600 dark:text-slate-400">الهالك</span>
                </div>
                <div className="text-left">
                  <span className={`text-lg font-black ${kpis.wasteRatio > 5 ? 'text-rose-600' : 'text-slate-600 dark:text-slate-400'}`}>
                    {formatNumber(kpis.totalWaste)}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium mr-1">({kpis.wasteRatio}%)</span>
                </div>
              </div>
            </div>

            {/* No data state */}
            {kpis.reportsCount === 0 && !isLoadingData && (
              <div className="mt-6 text-center py-4 text-slate-400">
                <span className="material-icons-round text-2xl mb-1 block opacity-40">info</span>
                <p className="text-xs font-bold">لا توجد تقارير {periodLabel}</p>
              </div>
            )}

            {/* Alerts summary at bottom */}
            {alerts.length === 0 && kpis.reportsCount > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-900/10 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/20">
                  <span className="material-icons-round text-emerald-500 text-sm mt-0.5">check_circle</span>
                  <p className="text-xs text-slate-600 dark:text-emerald-200/80 leading-relaxed font-medium">
                    أداؤك جيد — لا توجد تنبيهات حالياً.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};


