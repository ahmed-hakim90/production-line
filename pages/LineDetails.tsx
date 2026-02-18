
import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, KPIBox, Button, LoadingSkeleton } from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import { reportService } from '../services/reportService';
import {
  formatNumber,
  calculateAvgAssemblyTime,
  calculateWasteRatio,
  calculateTimeEfficiency,
  calculateUtilization,
  groupReportsByDate,
  countUniqueDays,
} from '../utils/calculations';
import { ProductionReport } from '../types';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export const LineDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const productionLines = useAppStore((s) => s.productionLines);
  const _rawLines = useAppStore((s) => s._rawLines);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const supervisors = useAppStore((s) => s.supervisors);

  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [loading, setLoading] = useState(true);

  const line = productionLines.find((l) => l.id === id);
  const rawLine = _rawLines.find((l) => l.id === id);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    reportService
      .getByLine(id)
      .then((data) => {
        if (!cancelled) setReports(data);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const totalProduced = useMemo(
    () => reports.reduce((sum, r) => sum + (r.quantityProduced || 0), 0),
    [reports]
  );

  const totalWaste = useMemo(
    () => reports.reduce((sum, r) => sum + (r.quantityWaste || 0), 0),
    [reports]
  );

  const totalHours = useMemo(
    () => reports.reduce((sum, r) => sum + (r.workHours || 0), 0),
    [reports]
  );

  const avgAssemblyTime = useMemo(
    () => calculateAvgAssemblyTime(reports),
    [reports]
  );

  const wasteRatio = useMemo(
    () => calculateWasteRatio(totalWaste, totalProduced + totalWaste),
    [totalWaste, totalProduced]
  );

  const standardTime = useMemo(() => {
    const config = lineProductConfigs.find((c) => c.lineId === id);
    return config?.standardAssemblyTime ?? 0;
  }, [lineProductConfigs, id]);

  const efficiency = useMemo(
    () => calculateTimeEfficiency(standardTime, avgAssemblyTime),
    [standardTime, avgAssemblyTime]
  );

  const uniqueDays = useMemo(() => countUniqueDays(reports), [reports]);

  const utilization = useMemo(() => {
    if (!rawLine || uniqueDays === 0) return 0;
    const availableHours = uniqueDays * rawLine.dailyWorkingHours;
    return calculateUtilization(totalHours, availableHours);
  }, [rawLine, uniqueDays, totalHours]);

  const chartData = useMemo(() => groupReportsByDate(reports), [reports]);

  if (!line && !loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16 text-slate-400">
          <span className="material-icons-round text-6xl mb-4 block opacity-30">
            precision_manufacturing
          </span>
          <p className="font-bold text-lg">خط الإنتاج غير موجود</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/lines')}>
            <span className="material-icons-round text-sm">arrow_forward</span>
            العودة لخطوط الإنتاج
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton type="detail" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
          <button
            onClick={() => navigate('/lines')}
            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all shrink-0 mt-1 sm:mt-0"
          >
            <span className="material-icons-round">arrow_forward</span>
          </button>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white truncate">
              {line?.name}
            </h2>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
              <span className="text-xs sm:text-sm text-slate-400 font-medium">
                المشرف: {line?.supervisorName}
              </span>
              {rawLine && (
                <>
                  <span className="hidden sm:inline text-slate-300">|</span>
                  <span className="text-xs sm:text-sm text-slate-400">
                    {rawLine.dailyWorkingHours} ساعة يومياً · {rawLine.maxWorkers} عامل
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <KPIBox
          label="إجمالي الإنتاج"
          value={formatNumber(totalProduced)}
          unit="وحدة"
          icon="inventory"
          colorClass="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
        />
        <KPIBox
          label="الكفاءة"
          value={standardTime > 0 ? `${efficiency}%` : '—'}
          icon="bolt"
          colorClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
        />
        <KPIBox
          label="نسبة الهالك"
          value={`${wasteRatio}%`}
          icon="delete_sweep"
          colorClass="bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400"
        />
        <KPIBox
          label="نسبة الاستخدام"
          value={`${utilization}%`}
          icon="speed"
          colorClass="bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
        />
      </div>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Card>
          <div className="text-center">
            <p className="text-xs text-slate-400 font-bold mb-1">متوسط وقت التجميع</p>
            <p className="text-2xl font-black text-primary">{avgAssemblyTime}</p>
            <p className="text-xs text-slate-400 mt-0.5">دقيقة/وحدة</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-xs text-slate-400 font-bold mb-1">إجمالي الهالك</p>
            <p className="text-2xl font-black text-rose-500">{formatNumber(totalWaste)}</p>
            <p className="text-xs text-slate-400 mt-0.5">وحدة</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-xs text-slate-400 font-bold mb-1">إجمالي ساعات العمل</p>
            <p className="text-2xl font-black text-amber-500">{formatNumber(totalHours)}</p>
            <p className="text-xs text-slate-400 mt-0.5">ساعة</p>
          </div>
        </Card>
      </div>

      {/* Production Chart */}
      <Card title="سجل الإنتاج">
        {chartData.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <span className="material-icons-round text-4xl mb-2 block opacity-30">
              show_chart
            </span>
            <p className="font-bold">لا توجد بيانات بعد</p>
          </div>
        ) : (
          <div style={{ width: '100%', height: 320 }} dir="ltr">
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorProduced" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1392ec" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#1392ec" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontFamily: 'inherit',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="produced"
                  name="الإنتاج"
                  stroke="#1392ec"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorProduced)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Reports Table */}
      <Card className="!p-0 border-none overflow-hidden shadow-xl shadow-slate-200/50" title="">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-bold">سجل التقارير</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">التاريخ</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">المنتج</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الكمية</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الهالك</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">عمال</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">ساعات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {reports.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    <p className="font-bold">لا توجد تقارير لهذا الخط</p>
                  </td>
                </tr>
              )}
              {reports.slice(0, 20).map((r) => {
                const productName = _rawProducts.find((p) => p.id === r.productId)?.name ?? '—';
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-300">{r.date}</td>
                    <td className="px-5 py-3 text-sm font-medium">{productName}</td>
                    <td className="px-5 py-3 text-center">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-sm font-black ring-1 ring-emerald-500/20">
                        {formatNumber(r.quantityProduced)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center text-rose-500 font-bold text-sm">{formatNumber(r.quantityWaste)}</td>
                    <td className="px-5 py-3 text-center text-sm font-bold">{r.workersCount}</td>
                    <td className="px-5 py-3 text-center text-sm font-bold">{r.workHours}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {reports.length > 0 && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
            <span className="text-sm text-slate-500 font-bold">
              إجمالي <span className="text-primary">{reports.length}</span> تقرير
            </span>
          </div>
        )}
      </Card>
    </div>
  );
};
