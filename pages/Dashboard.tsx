
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { KPIBox, Card, Badge, Button, LoadingSkeleton } from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import {
  formatNumber,
  buildDashboardKPIs,
  calculateAvgAssemblyTime,
  calculateDailyCapacity,
  calculateEstimatedDays,
} from '../utils/calculations';
import { buildLineCosts, buildProductCosts, buildProductAvgCost, formatCost, ProductCostData, buildDailyProductionCostChart, getCurrentMonth } from '../utils/costCalculations';
import { ProductionLineStatus, ProductionReport } from '../types';
import { usePermission } from '../utils/permissions';
import { reportService } from '../services/reportService';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const DailyChartTooltip: React.FC<any> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-lg text-right min-w-[180px]" dir="rtl">
      <p className="text-xs font-black text-slate-600 dark:text-slate-400 mb-2 border-b border-slate-100 dark:border-slate-800 pb-1.5">{data.date}</p>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-6">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 shrink-0"></span><span className="text-slate-500 font-bold">الإنتاج</span></span>
          <span className="font-black text-blue-600">{formatNumber(data.production)} وحدة</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-slate-500 font-bold">تكلفة العمالة</span>
          <span className="font-black text-slate-700 dark:text-slate-300">{formatCost(data.laborCost)} ج.م</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-slate-500 font-bold">غير مباشرة</span>
          <span className="font-black text-slate-700 dark:text-slate-300">{formatCost(data.indirectCost)} ج.م</span>
        </div>
        <div className="flex justify-between gap-6 pt-1.5 border-t border-slate-100 dark:border-slate-800">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-500 shrink-0"></span><span className="text-slate-500 font-bold">تكلفة الوحدة</span></span>
          <span className="font-black text-violet-600">{formatCost(data.costPerUnit)} ج.م</span>
        </div>
      </div>
    </div>
  );
};

export const Dashboard: React.FC = () => {
  const productionLines = useAppStore((s) => s.productionLines);
  const todayReports = useAppStore((s) => s.todayReports);
  const monthlyReports = useAppStore((s) => s.monthlyReports);
  const products = useAppStore((s) => s.products);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawLines = useAppStore((s) => s._rawLines);
  const lineStatuses = useAppStore((s) => s.lineStatuses);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const loading = useAppStore((s) => s.loading);
  const createLineStatus = useAppStore((s) => s.createLineStatus);
  const updateLineStatus = useAppStore((s) => s.updateLineStatus);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const navigate = useNavigate();

  const { can } = usePermission();
  const canViewCosts = can('costs.view');

  const [selectedProductId, setSelectedProductId] = useState('');
  const [planQuantity, setPlanQuantity] = useState<number>(0);

  const [costProductIds, setCostProductIds] = useState<string[]>([]);

  // ── Daily Production vs Cost Chart ──
  const [chartProductId, setChartProductId] = useState('');
  const [chartLineId, setChartLineId] = useState('');
  const [chartMonth, setChartMonth] = useState(getCurrentMonth);
  const [chartReports, setChartReports] = useState<ProductionReport[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  // ── Set Target Modal ──
  const [targetModal, setTargetModal] = useState<{ lineId: string; lineName: string } | null>(null);
  const [targetForm, setTargetForm] = useState({ currentProductId: '', targetTodayQty: 0 });
  const [targetSaving, setTargetSaving] = useState(false);

  const openTargetModal = (lineId: string, lineName: string) => {
    const existing = lineStatuses.find((s) => s.lineId === lineId);
    setTargetForm({
      currentProductId: existing?.currentProductId ?? '',
      targetTodayQty: existing?.targetTodayQty ?? 0,
    });
    setTargetModal({ lineId, lineName });
  };

  const handleSaveTarget = async () => {
    if (!targetModal) return;
    setTargetSaving(true);
    const existing = lineStatuses.find((s) => s.lineId === targetModal.lineId);
    if (existing?.id) {
      await updateLineStatus(existing.id, {
        currentProductId: targetForm.currentProductId,
        targetTodayQty: targetForm.targetTodayQty,
      });
    } else {
      await createLineStatus({
        lineId: targetModal.lineId,
        currentProductId: targetForm.currentProductId,
        targetTodayQty: targetForm.targetTodayQty,
      });
    }
    setTargetSaving(false);
    setTargetModal(null);
  };

  const kpis = buildDashboardKPIs(todayReports, monthlyReports);

  const lineCosts = useMemo(
    () => buildLineCosts(
      productionLines.map((l) => l.id),
      todayReports, laborSettings, costCenters, costCenterValues, costAllocations
    ),
    [productionLines, todayReports, laborSettings, costCenters, costCenterValues, costAllocations]
  );

  const productCosts = useMemo(() => {
    if (!canViewCosts) return {};
    const pids = [...new Set(productionLines.map((l) => l.currentProductId).filter(Boolean))];
    if (pids.length === 0) return {};
    return buildProductCosts(pids, todayReports, laborSettings, costCenters, costCenterValues, costAllocations);
  }, [canViewCosts, productionLines, todayReports, laborSettings, costCenters, costCenterValues, costAllocations]);

  const costAnalysisMap = useMemo(() => {
    if (!canViewCosts || costProductIds.length === 0) return {};
    const hourlyRate = laborSettings?.hourlyRate ?? 0;
    const allReports = monthlyReports.length > 0 ? monthlyReports : todayReports;
    const result: Record<string, ProductCostData> = {};
    for (const pid of costProductIds) {
      const avg = buildProductAvgCost(pid, allReports, hourlyRate, costCenters, costCenterValues, costAllocations);
      if (avg.quantityProduced > 0) result[pid] = avg;
    }
    return result;
  }, [canViewCosts, costProductIds, monthlyReports, todayReports, laborSettings, costCenters, costCenterValues, costAllocations]);

  const selectedProductCost = useMemo(() => {
    if (!canViewCosts || !selectedProductId) return null;
    const hourlyRate = laborSettings?.hourlyRate ?? 0;
    const allReports = monthlyReports.length > 0 ? monthlyReports : todayReports;
    const avg = buildProductAvgCost(selectedProductId, allReports, hourlyRate, costCenters, costCenterValues, costAllocations);
    if (avg.costPerUnit <= 0) return null;
    return avg;
  }, [canViewCosts, selectedProductId, monthlyReports, todayReports, laborSettings, costCenters, costCenterValues, costAllocations]);

  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' });
      options.push({ value, label });
    }
    return options;
  }, []);

  useEffect(() => {
    if (!canViewCosts) return;
    const currentMonth = getCurrentMonth();
    if (chartMonth === currentMonth) {
      setChartReports(monthlyReports);
      return;
    }
    let cancelled = false;
    setChartLoading(true);
    const [y, m] = chartMonth.split('-').map(Number);
    const dim = new Date(y, m, 0).getDate();
    const startDate = `${chartMonth}-01`;
    const endDate = `${chartMonth}-${String(dim).padStart(2, '0')}`;
    reportService.getByDateRange(startDate, endDate).then((reports) => {
      if (!cancelled) {
        setChartReports(reports);
        setChartLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setChartLoading(false);
    });
    return () => { cancelled = true; };
  }, [canViewCosts, chartMonth, monthlyReports]);

  const dailyChartData = useMemo(() => {
    if (!canViewCosts || chartReports.length === 0) return [];
    const hourlyRate = laborSettings?.hourlyRate ?? 0;
    return buildDailyProductionCostChart(
      chartReports, chartProductId, chartLineId, chartMonth,
      hourlyRate, costCenters, costCenterValues, costAllocations
    );
  }, [canViewCosts, chartReports, chartProductId, chartLineId, chartMonth, laborSettings, costCenters, costCenterValues, costAllocations]);

  const planResults = useMemo(() => {
    if (!selectedProductId || planQuantity <= 0) return null;

    const productReports = todayReports.filter(
      (r) => r.productId === selectedProductId
    );

    const avgTime = calculateAvgAssemblyTime(
      productReports.length > 0 ? productReports : todayReports
    );

    const config = lineProductConfigs.find(
      (c) => c.productId === selectedProductId
    );
    const standardTime = config?.standardAssemblyTime ?? avgTime;
    const effectiveTime = standardTime > 0 ? standardTime : avgTime;

    const activeLines = _rawLines.filter(
      (l) => l.status === ProductionLineStatus.ACTIVE || l.status === ProductionLineStatus.IDLE
    );

    let totalDailyCapacity = 0;
    activeLines.forEach((line) => {
      totalDailyCapacity += calculateDailyCapacity(
        line.maxWorkers,
        line.dailyWorkingHours,
        effectiveTime
      );
    });

    const perLineCapacity =
      activeLines.length > 0
        ? Math.round(totalDailyCapacity / activeLines.length)
        : 0;

    const estimatedDays = calculateEstimatedDays(planQuantity, totalDailyCapacity);

    return {
      avgAssemblyTime: effectiveTime,
      dailyCapacityPerLine: perLineCapacity,
      totalDailyCapacity,
      estimatedDays,
      activeLinesCount: activeLines.length,
    };
  }, [selectedProductId, planQuantity, todayReports, _rawLines, lineProductConfigs]);

  const getVariant = (status: ProductionLineStatus) => {
    switch (status) {
      case ProductionLineStatus.ACTIVE: return 'success';
      case ProductionLineStatus.WARNING: return 'warning';
      case ProductionLineStatus.MAINTENANCE: return 'neutral';
      case ProductionLineStatus.IDLE: return 'neutral';
      default: return 'neutral';
    }
  };

  const getStatusLabel = (status: ProductionLineStatus) => {
    switch (status) {
      case ProductionLineStatus.ACTIVE: return 'يعمل حالياً';
      case ProductionLineStatus.WARNING: return 'تنبيه: سرعة منخفضة';
      case ProductionLineStatus.MAINTENANCE: return 'متوقف (صيانة)';
      case ProductionLineStatus.IDLE: return 'جاهز للتشغيل';
      default: return 'غير معروف';
    }
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-800 dark:text-white">مؤسسة المغربي</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">جاري تحميل البيانات...</p>
        </div>
        <LoadingSkeleton type="card" rows={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* <div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-800 dark:text-white">مؤسسة المغربي</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium text-sm sm:text-base">نظرة عامة شاملة على أداء المصنع اليوم وتتبع حقيقي لخطوط الإنتاج.</p>
      </div> */}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
        {/* Production Card — Daily & Monthly */}
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm sm:col-span-2 md:col-span-1">
          <div className="flex items-center gap-3 sm:gap-4 mb-4 sm:mb-5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 rounded-lg flex items-center justify-center shrink-0">
              <span className="material-icons-round text-2xl sm:text-3xl">inventory</span>
            </div>
            <p className="text-slate-500 text-sm font-bold">إجمالي الإنتاج</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-blue-50/60 dark:bg-blue-900/10 rounded-xl p-3 sm:p-4 text-center border border-blue-100 dark:border-blue-900/20">
              <p className="text-[11px] font-bold text-slate-400 mb-1.5">إنتاج اليوم</p>
              <h3 className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400">{formatNumber(kpis.todayProduction)}</h3>
              <span className="text-[10px] font-medium text-slate-400">وحدة</span>
            </div>
            <div className="bg-indigo-50/60 dark:bg-indigo-900/10 rounded-xl p-3 sm:p-4 text-center border border-indigo-100 dark:border-indigo-900/20">
              <p className="text-[11px] font-bold text-slate-400 mb-1.5">إنتاج الشهر</p>
              <h3 className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400">{formatNumber(kpis.monthlyProduction)}</h3>
              <span className="text-[10px] font-medium text-slate-400">وحدة</span>
            </div>
          </div>
        </div>
        <KPIBox label="معدل الكفاءة" value={`${kpis.efficiency}%`} icon="bolt" trend="" trendUp={true} colorClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" />
        <KPIBox label="نسبة الهالك" value={`${kpis.wasteRatio}%`} icon="delete_sweep" trend="" trendUp={true} colorClass="bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400" />
      </div>

      {/* ── Product Cost Analysis Section ── */}
      {canViewCosts && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-50 dark:bg-violet-900/20 rounded-lg flex items-center justify-center shrink-0">
                <span className="material-icons-round text-violet-600 dark:text-violet-400">price_check</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white">تحليل تكلفة المنتجات</h3>
                <p className="text-[11px] text-slate-400 font-medium">اختر منتج أو أكثر لمقارنة متوسط التكلفة الشهرية</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 py-2.5 px-4 outline-none font-bold min-w-[200px] transition-all"
                value=""
                onChange={(e) => {
                  if (e.target.value && !costProductIds.includes(e.target.value)) {
                    setCostProductIds([...costProductIds, e.target.value]);
                  }
                }}
              >
                <option value="">إضافة منتج...</option>
                {products.filter((p) => !costProductIds.includes(p.id)).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {costProductIds.length > 0 && (
                <button
                  onClick={() => setCostProductIds([])}
                  className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-lg transition-all"
                  title="مسح الكل"
                >
                  <span className="material-icons-round text-sm">clear_all</span>
                </button>
              )}
            </div>
          </div>

          {costProductIds.length > 0 && (
            <div className="px-5 sm:px-6 pt-4 flex flex-wrap gap-2">
              {costProductIds.map((pid) => {
                const p = products.find((pr) => pr.id === pid);
                return (
                  <span key={pid} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 text-xs font-bold border border-violet-200 dark:border-violet-800">
                    {p?.name || pid}
                    <button
                      onClick={() => setCostProductIds(costProductIds.filter((id) => id !== pid))}
                      className="hover:text-rose-500 transition-colors"
                    >
                      <span className="material-icons-round text-sm">close</span>
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {Object.keys(costAnalysisMap).length > 0 ? (
            <div className="p-5 sm:p-6">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">المنتج</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">تكلفة الوحدة</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">تكلفة العمالة</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">غير مباشرة</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">إجمالي التكلفة</th>
                      <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الإنتاج</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {costProductIds.map((pid) => {
                      const data = costAnalysisMap[pid];
                      const p = products.find((pr) => pr.id === pid);
                      if (!data) return (
                        <tr key={pid} className="text-slate-400">
                          <td className="px-4 py-3 text-sm font-bold">{p?.name || '—'}</td>
                          <td colSpan={5} className="px-4 py-3 text-center text-xs">لا توجد بيانات</td>
                        </tr>
                      );
                      return (
                        <tr key={pid} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-300">{p?.name || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-2.5 py-1 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 text-sm font-black ring-1 ring-violet-500/20">
                              {formatCost(data.costPerUnit)} ج.م
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-slate-600 dark:text-slate-400">{formatCost(data.laborCost)} ج.م</td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-slate-600 dark:text-slate-400">{formatCost(data.indirectCost)} ج.م</td>
                          <td className="px-4 py-3 text-center text-sm font-black text-primary">{formatCost(data.totalCost)} ج.م</td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-emerald-600">{formatNumber(data.quantityProduced)} وحدة</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {Object.keys(costAnalysisMap).length > 1 && (
                    <tfoot>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-200 dark:border-slate-700">
                        <td className="px-4 py-3 text-sm font-black text-slate-800 dark:text-white">الإجمالي</td>
                        {(() => {
                          const vals = Object.values(costAnalysisMap) as ProductCostData[];
                          const sumLabor = vals.reduce((s, v) => s + v.laborCost, 0);
                          const sumIndirect = vals.reduce((s, v) => s + v.indirectCost, 0);
                          const sumTotal = vals.reduce((s, v) => s + v.totalCost, 0);
                          const sumQty = vals.reduce((s, v) => s + v.quantityProduced, 0);
                          const avgCPU = sumQty > 0 ? sumTotal / sumQty : 0;
                          return (
                            <>
                              <td className="px-4 py-3 text-center text-sm font-black text-violet-600">{avgCPU > 0 ? `${formatCost(avgCPU)} ج.م` : '—'}</td>
                              <td className="px-4 py-3 text-center text-sm font-black text-slate-600 dark:text-slate-400">{formatCost(sumLabor)} ج.م</td>
                              <td className="px-4 py-3 text-center text-sm font-black text-slate-600 dark:text-slate-400">{formatCost(sumIndirect)} ج.م</td>
                              <td className="px-4 py-3 text-center text-sm font-black text-primary">{formatCost(sumTotal)} ج.م</td>
                              <td className="px-4 py-3 text-center text-sm font-black text-emerald-600">{formatNumber(sumQty)} وحدة</td>
                            </>
                          );
                        })()}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          ) : costProductIds.length > 0 ? (
            <div className="p-8 text-center text-slate-400">
              <span className="material-icons-round text-3xl mb-2 block opacity-30">info</span>
              <p className="text-sm font-bold">لا توجد بيانات تكلفة للمنتجات المختارة في الشهر الحالي</p>
            </div>
          ) : null}
        </div>
      )}

      {/* ── Daily Production vs Cost Chart ── */}
      {canViewCosts && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center shrink-0">
                <span className="material-icons-round text-blue-600 dark:text-blue-400">insights</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800 dark:text-white">الإنتاج اليومي مقابل التكلفة</h3>
                <p className="text-[11px] text-slate-400 font-medium">تحليل يومي للإنتاج والتكاليف خلال الشهر المحدد</p>
              </div>
            </div>
          </div>

          <div className="px-5 sm:px-6 pt-4 flex flex-wrap gap-3">
            <select
              className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 py-2.5 px-4 outline-none font-bold min-w-[160px] transition-all"
              value={chartProductId}
              onChange={(e) => setChartProductId(e.target.value)}
            >
              <option value="">كل المنتجات</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <select
              className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 py-2.5 px-4 outline-none font-bold min-w-[160px] transition-all"
              value={chartLineId}
              onChange={(e) => setChartLineId(e.target.value)}
            >
              <option value="">كل الخطوط</option>
              {_rawLines.map((l) => (
                <option key={l.id} value={l.id!}>{l.name}</option>
              ))}
            </select>

            <select
              className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 py-2.5 px-4 outline-none font-bold min-w-[160px] transition-all"
              value={chartMonth}
              onChange={(e) => setChartMonth(e.target.value)}
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="p-5 sm:p-6">
            {chartLoading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <span className="material-icons-round animate-spin text-2xl">refresh</span>
                <span className="mr-2 text-sm font-bold">جاري تحميل البيانات...</span>
              </div>
            ) : dailyChartData.length > 0 ? (
              <div style={{ width: '100%', height: 380 }} dir="ltr">
                <ResponsiveContainer>
                  <ComposedChart data={dailyChartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 600 }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="production"
                      orientation="left"
                      tick={{ fontSize: 11, fill: '#3b82f6', fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                      label={{ value: 'الإنتاج', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 11, fill: '#3b82f6', fontWeight: 700 } }}
                    />
                    <YAxis
                      yAxisId="cost"
                      orientation="right"
                      tick={{ fontSize: 11, fill: '#8b5cf6', fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                      label={{ value: 'تكلفة الوحدة', angle: 90, position: 'insideRight', offset: 10, style: { fontSize: 11, fill: '#8b5cf6', fontWeight: 700 } }}
                    />
                    <Tooltip content={<DailyChartTooltip />} />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      iconType="square"
                      formatter={(value: string) => <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>{value}</span>}
                    />
                    <Bar
                      yAxisId="production"
                      dataKey="production"
                      name="الإنتاج اليومي"
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                      barSize={22}
                      opacity={0.85}
                    />
                    <Line
                      yAxisId="cost"
                      type="monotone"
                      dataKey="costPerUnit"
                      name="تكلفة الوحدة"
                      stroke="#8b5cf6"
                      strokeWidth={2.5}
                      dot={{ r: 3.5, fill: '#8b5cf6', strokeWidth: 0 }}
                      activeDot={{ r: 6, stroke: '#8b5cf6', strokeWidth: 2, fill: '#fff' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <span className="material-icons-round text-3xl mb-2 block opacity-30">bar_chart</span>
                <p className="text-sm font-bold">لا توجد بيانات للشهر المحدد</p>
                <p className="text-xs mt-1">اختر شهر يحتوي على تقارير إنتاج لعرض الرسم البياني</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 space-y-5 sm:space-y-6">
          <div className="flex items-center justify-between px-2 gap-3">
            <h3 className="text-lg sm:text-xl font-bold flex items-center gap-3">
              <span className="w-2 h-7 bg-primary rounded-full shrink-0"></span>
              مراقبة خطوط الإنتاج
            </h3>
            <Button variant="outline" className="text-xs py-1.5 h-auto shrink-0" onClick={() => navigate('/lines')}>عرض الكل</Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {productionLines.length === 0 && !loading && (
              <div className="col-span-2 text-center py-12 text-slate-400">
                <span className="material-icons-round text-5xl mb-3 block opacity-30">precision_manufacturing</span>
                <p className="font-bold">لا توجد خطوط إنتاج بعد</p>
                <p className="text-sm mt-1">أضف خطوط الإنتاج من صفحة "خطوط الإنتاج"</p>
              </div>
            )}
            {productionLines.map((line) => (
              <Card key={line.id} className="transition-all hover:ring-2 hover:ring-primary/10">
                <div className="cursor-pointer" onClick={() => navigate(`/lines/${line.id}`)}>
                  <div className="flex justify-between items-start mb-5">
                    <div>
                      <h4 className="font-bold text-lg text-slate-800 dark:text-white">{line.name}</h4>
                      <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">{line.supervisorName}</span>
                    </div>
                    <Badge variant={getVariant(line.status)} pulse={line.status === ProductionLineStatus.ACTIVE}>
                      {getStatusLabel(line.status)}
                    </Badge>
                  </div>

                  <div className="mb-6">
                    <p className="text-xs text-slate-400 font-bold mb-1 uppercase tracking-tight">المنتج الحالي</p>
                    <p className="text-base font-bold text-slate-700 dark:text-slate-200">{line.currentProduct}</p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-slate-500">الإنتاج: {formatNumber(line.achievement)} / {formatNumber(line.target)}</span>
                      <span className={`${line.efficiency > 80 ? 'text-emerald-600' : 'text-amber-600'}`}>{line.efficiency}%</span>
                    </div>
                    {line.target > 0 && (
                      <p className="text-[11px] font-bold text-slate-400">المتبقي: {formatNumber(Math.max(line.target - line.achievement, 0))}</p>
                    )}
                    <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${line.status === ProductionLineStatus.WARNING ? 'bg-amber-500' : 'bg-primary shadow-[0_0_10px_rgba(19,146,236,0.3)]'}`} 
                        style={{ width: `${Math.min(line.efficiency, 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {canViewCosts && lineCosts[line.id] && (lineCosts[line.id].laborCost > 0 || lineCosts[line.id].indirectCost > 0) && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400">تكلفة العمالة</p>
                        <p className="text-xs font-black text-slate-700 dark:text-slate-300">{formatCost(lineCosts[line.id].laborCost)} ج.م</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400">تكلفة غير مباشرة</p>
                        <p className="text-xs font-black text-slate-700 dark:text-slate-300">{formatCost(lineCosts[line.id].indirectCost)} ج.م</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400">إجمالي التكلفة</p>
                        <p className="text-xs font-black text-primary">{formatCost(lineCosts[line.id].totalCost)} ج.م</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400">تكلفة الوحدة (المنتج)</p>
                        <p className="text-xs font-black text-emerald-600">
                          {line.currentProductId && productCosts[line.currentProductId]?.costPerUnit > 0
                            ? `${formatCost(productCosts[line.currentProductId].costPerUnit)} ج.م`
                            : '—'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                {can("lineStatus.edit") && (
                  <button
                    onClick={(e) => { e.stopPropagation(); openTargetModal(line.id, line.name); }}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg transition-all"
                  >
                    <span className="material-icons-round text-sm">flag</span>
                    {line.target > 0 ? 'تعديل الهدف' : 'تعيين الهدف'}
                  </button>
                )}
              </Card>
            ))}
          </div>
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-24 border-primary/20 shadow-xl shadow-primary/5" title="التخطيط الذكي">
            <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">اختر المنتج</label>
                <select
                  className="w-full border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                >
                  <option value="">اختر المنتج...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الكمية المطلوبة</label>
                <input 
                  className="w-full border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all" 
                  placeholder="أدخل الكمية..." 
                  type="number"
                  min={0}
                  value={planQuantity || ''}
                  onChange={(e) => setPlanQuantity(Number(e.target.value))}
                />
              </div>

              <div className="p-5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 space-y-4">
                {planResults ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-500">متوسط وقت التجميع</span>
                      <span className="text-sm font-black text-primary">{planResults.avgAssemblyTime} دقيقة/وحدة</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-500">الطاقة اليومية لكل خط</span>
                      <span className="text-sm font-black text-primary">{formatNumber(planResults.dailyCapacityPerLine)} وحدة</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-500">إجمالي الطاقة اليومية</span>
                      <span className="text-sm font-black text-primary">
                        {formatNumber(planResults.totalDailyCapacity)} وحدة ({planResults.activeLinesCount} خط)
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-600">
                      <span className="text-xs font-bold text-slate-500">الأيام المقدرة للإنجاز</span>
                      <span className="text-sm font-black text-emerald-600">
                        {planResults.estimatedDays > 0 ? `${planResults.estimatedDays} يوم` : '—'}
                      </span>
                    </div>
                    {selectedProductCost && planQuantity > 0 && (
                      <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-600">
                        <span className="text-xs font-bold text-slate-500">التكلفة المتوقعة</span>
                        <span className="text-sm font-black text-primary">
                          {formatCost(selectedProductCost.costPerUnit * planQuantity)} ج.م
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center text-slate-400 py-2">
                    <span className="material-icons-round text-2xl mb-1 block opacity-40">calculate</span>
                    <p className="text-xs font-bold">اختر منتج وأدخل الكمية لعرض التقديرات</p>
                  </div>
                )}
              </div>
            </form>

            {canViewCosts && selectedProductCost && (
              <div className="mt-6 p-4 bg-violet-50 dark:bg-violet-900/10 rounded-xl border border-violet-200 dark:border-violet-800 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-icons-round text-violet-600 text-sm">price_check</span>
                  <h4 className="text-xs font-black text-violet-600">تحليل تكلفة المنتج (متوسط الشهر)</h4>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500">متوسط تكلفة الوحدة</span>
                  <span className="text-sm font-black text-violet-600">{formatCost(selectedProductCost.costPerUnit)} ج.م</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500">تكلفة العمالة</span>
                  <span className="text-sm font-black text-slate-700 dark:text-slate-300">{formatCost(selectedProductCost.laborCost)} ج.م</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500">تكلفة غير مباشرة</span>
                  <span className="text-sm font-black text-slate-700 dark:text-slate-300">{formatCost(selectedProductCost.indirectCost)} ج.م</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-violet-200 dark:border-violet-700">
                  <span className="text-xs font-bold text-slate-500">إجمالي الإنتاج</span>
                  <span className="text-sm font-black text-slate-700 dark:text-slate-300">{formatNumber(selectedProductCost.quantityProduced)} وحدة</span>
                </div>
              </div>
            )}

            <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">أهم تنبيهات النظام</h4>
              {productionLines.filter((l) => l.status === ProductionLineStatus.IDLE).length > 0 ? (
                <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg border border-amber-100 dark:border-amber-900/20">
                  <span className="material-icons-round text-amber-500 text-sm mt-0.5">info</span>
                  <p className="text-xs text-slate-600 dark:text-amber-200/80 leading-relaxed font-medium">
                    يوجد {productionLines.filter((l) => l.status === ProductionLineStatus.IDLE).length} خط إنتاج في وضع الاستعداد. يمكن تشغيلها لزيادة الطاقة الإنتاجية.
                  </p>
                </div>
              ) : productionLines.filter((l) => l.status === ProductionLineStatus.MAINTENANCE).length > 0 ? (
                <div className="flex items-start gap-3 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                  <span className="material-icons-round text-slate-400 text-sm mt-0.5">build</span>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                    يوجد {productionLines.filter((l) => l.status === ProductionLineStatus.MAINTENANCE).length} خط في وضع الصيانة.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-900/10 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/20">
                  <span className="material-icons-round text-emerald-500 text-sm mt-0.5">check_circle</span>
                  <p className="text-xs text-slate-600 dark:text-emerald-200/80 leading-relaxed font-medium">
                    جميع الخطوط تعمل بشكل طبيعي.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ── Set Target Modal ── */}

      {targetModal && can("lineStatus.edit") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setTargetModal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">تعيين هدف اليوم</h3>
                <p className="text-xs text-slate-400 font-medium mt-0.5">{targetModal.lineName}</p>
              </div>
              <button onClick={() => setTargetModal(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">المنتج الحالي *</label>
                <select
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={targetForm.currentProductId}
                  onChange={(e) => setTargetForm({ ...targetForm, currentProductId: e.target.value })}
                >
                  <option value="">اختر المنتج...</option>
                  {_rawProducts.map((p) => (
                    <option key={p.id} value={p.id!}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الهدف اليومي (كمية) *</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={targetForm.targetTodayQty || ''}
                  onChange={(e) => setTargetForm({ ...targetForm, targetTodayQty: Number(e.target.value) })}
                  placeholder="مثال: 500"
                />
              </div>
              {targetForm.currentProductId && targetForm.targetTodayQty > 0 && (
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex items-center gap-3">
                  <span className="material-icons-round text-primary text-lg">info</span>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    سيتم تعيين هدف <span className="font-black text-primary">{formatNumber(targetForm.targetTodayQty)}</span> وحدة
                    من <span className="font-black text-slate-800 dark:text-white">{_rawProducts.find(p => p.id === targetForm.currentProductId)?.name}</span> لهذا الخط
                  </p>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setTargetModal(null)}>إلغاء</Button>
              <Button
                variant="primary"
                onClick={handleSaveTarget}
                disabled={targetSaving || !targetForm.currentProductId || !targetForm.targetTodayQty}
              >
                {targetSaving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">flag</span>
                حفظ الهدف
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
