
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import { Card, KPIBox, Button, Badge, LoadingSkeleton } from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import { reportService } from '../services/reportService';
import {
  formatNumber,
  calculateAvgAssemblyTime,
  calculateWasteRatio,
  findBestLine,
  groupReportsByDate,
  countUniqueDays,
} from '../utils/calculations';
import {
  buildProductCosts,
  buildProductAvgCost,
  buildProductCostByLine,
  buildProductCostHistory,
  formatCost,
} from '../utils/costCalculations';
import { usePermission } from '../utils/permissions';
import { ProductionReport } from '../types';
import { exportProductReports } from '../utils/exportExcel';
import { exportToPDF, shareToWhatsApp } from '../utils/reportExport';
import {
  ProductionReportPrint,
  mapReportsToPrintRows,
  computePrintTotals,
} from '../components/ProductionReportPrint';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export const ProductDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const products = useAppStore((s) => s.products);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawLines = useAppStore((s) => s._rawLines);
  const supervisors = useAppStore((s) => s.supervisors);
  const lineProductConfigs = useAppStore((s) => s.lineProductConfigs);
  const todayReports = useAppStore((s) => s.todayReports);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const laborSettings = useAppStore((s) => s.laborSettings);

  const { can } = usePermission();
  const canViewCosts = can('costs.view');

  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const printComponentRef = useRef<HTMLDivElement>(null);

  const product = products.find((p) => p.id === id);
  const rawProduct = _rawProducts.find((p) => p.id === id);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    reportService
      .getByProduct(id)
      .then((data) => {
        if (!cancelled) setReports(data);
      })
      .catch((err) => {
        console.error('Failed to fetch product reports:', err);
        if (!cancelled) setFetchError(err?.message || 'فشل تحميل التقارير');
      })
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

  const avgAssemblyTime = useMemo(
    () => calculateAvgAssemblyTime(reports),
    [reports]
  );

  const wasteRatio = useMemo(
    () => calculateWasteRatio(totalWaste, totalProduced + totalWaste),
    [totalWaste, totalProduced]
  );

  const bestLine = useMemo(
    () => findBestLine(reports, _rawLines),
    [reports, _rawLines]
  );

  const chartData = useMemo(() => groupReportsByDate(reports), [reports]);

  const uniqueDays = useMemo(() => countUniqueDays(reports), [reports]);

  const avgDailyProduction = useMemo(
    () => (uniqueDays > 0 ? Math.round(totalProduced / uniqueDays) : 0),
    [totalProduced, uniqueDays]
  );

  const standardTime = useMemo(() => {
    const config = lineProductConfigs.find((c) => c.productId === id);
    return config?.standardAssemblyTime ?? 0;
  }, [lineProductConfigs, id]);

  const currentBalance = useMemo(() => {
    if (!rawProduct) return 0;
    return rawProduct.openingBalance + totalProduced - totalWaste;
  }, [rawProduct, totalProduced, totalWaste]);

  const todayCost = useMemo(() => {
    if (!canViewCosts || !id) return null;
    const costs = buildProductCosts([id], todayReports, laborSettings, costCenters, costCenterValues, costAllocations);
    return costs[id] ?? null;
  }, [canViewCosts, id, todayReports, laborSettings, costCenters, costCenterValues, costAllocations]);

  const getLineName = (lineId: string) => _rawLines.find((l) => l.id === lineId)?.name ?? '—';

  const hourlyRate = laborSettings?.hourlyRate ?? 0;

  const historicalAvgCost = useMemo(() => {
    if (!canViewCosts || !id || reports.length === 0) return null;
    return buildProductAvgCost(id, reports, hourlyRate, costCenters, costCenterValues, costAllocations);
  }, [canViewCosts, id, reports, hourlyRate, costCenters, costCenterValues, costAllocations]);

  const costByLine = useMemo(() => {
    if (!canViewCosts || !id || reports.length === 0) return [];
    return buildProductCostByLine(id, reports, hourlyRate, costCenters, costCenterValues, costAllocations, getLineName);
  }, [canViewCosts, id, reports, hourlyRate, costCenters, costCenterValues, costAllocations, _rawLines]);

  const costHistory = useMemo(() => {
    if (!canViewCosts || !id || reports.length === 0) return [];
    return buildProductCostHistory(id, reports, hourlyRate, costCenters, costCenterValues, costAllocations);
  }, [canViewCosts, id, reports, hourlyRate, costCenters, costCenterValues, costAllocations]);

  const costTrend = useMemo(() => {
    if (costHistory.length < 2) return null;
    const half = Math.floor(costHistory.length / 2);
    const firstHalf = costHistory.slice(0, half);
    const secondHalf = costHistory.slice(half);
    const avgFirst = firstHalf.reduce((s, d) => s + d.costPerUnit, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, d) => s + d.costPerUnit, 0) / secondHalf.length;
    const pctChange = avgFirst > 0 ? Math.round(((avgSecond - avgFirst) / avgFirst) * 100) : 0;
    return { avgFirst, avgSecond, pctChange, improving: pctChange <= 0 };
  }, [costHistory]);

  const bestCostLine = useMemo(() => {
    if (costByLine.length === 0) return null;
    return costByLine.reduce((best, cur) => cur.costPerUnit < best.costPerUnit ? cur : best);
  }, [costByLine]);
  const getSupervisorName = (supId: string) => supervisors.find((s) => s.id === supId)?.name ?? '—';

  const lookups = useMemo(() => ({
    getLineName,
    getProductName: () => product?.name || rawProduct?.name || '—',
    getSupervisorName,
  }), [_rawLines, supervisors, product, rawProduct]);

  const printRows = useMemo(() => mapReportsToPrintRows(reports, lookups), [reports, lookups]);
  const printTotals = useMemo(() => computePrintTotals(printRows), [printRows]);
  const productDisplayName = product?.name || rawProduct?.name || '';

  const handlePrint = useReactToPrint({ contentRef: printComponentRef });

  const handlePDF = async () => {
    if (!printComponentRef.current) return;
    setExporting(true);
    try { await exportToPDF(printComponentRef.current, `تقرير-${productDisplayName}`); }
    finally { setExporting(false); }
  };

  const handleWhatsApp = async () => {
    if (!printComponentRef.current) return;
    setExporting(true);
    try { await shareToWhatsApp(printComponentRef.current, `تقرير ${productDisplayName}`); }
    finally { setExporting(false); }
  };

  if (!product && !rawProduct && !loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16 text-slate-400">
          <span className="material-icons-round text-6xl mb-4 block opacity-30">
            inventory_2
          </span>
          <p className="font-bold text-lg">المنتج غير موجود</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/products')}>
            <span className="material-icons-round text-sm">arrow_forward</span>
            العودة للمنتجات
          </Button>
        </div>
      </div>
    );
  }

  if (loading && !product) {
    return (
      <div className="space-y-6">
        <LoadingSkeleton type="detail" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <button
            onClick={() => navigate('/products')}
            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all shrink-0"
          >
            <span className="material-icons-round">arrow_forward</span>
          </button>
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="hidden sm:flex w-14 h-14 rounded-xl bg-primary/10 items-center justify-center shrink-0">
              <span className="material-icons-round text-primary text-3xl">inventory_2</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white truncate">
                {product?.name || rawProduct?.name}
              </h2>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1">
                <span className="text-xs sm:text-sm text-slate-400 font-mono">{product?.code || rawProduct?.code}</span>
                {(product?.category || rawProduct?.model) && (
                  <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2.5 py-0.5 rounded-full font-bold">
                    {product?.category || rawProduct?.model}
                  </span>
                )}
                {product && (
                  <Badge variant={product.stockStatus === 'available' ? 'success' : product.stockStatus === 'low' ? 'warning' : 'danger'}>
                    {product.stockStatus === 'available' ? 'متوفر' : product.stockStatus === 'low' ? 'منخفض' : 'نفذ'}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {reports.length > 0 && (
            <>
              <Button variant="secondary" onClick={() => exportProductReports(productDisplayName, reports, lookups)}>
                <span className="material-icons-round text-sm">download</span>Excel
              </Button>
              <Button variant="outline" disabled={exporting} onClick={() => handlePrint()}>
                <span className="material-icons-round text-sm">print</span>طباعة
              </Button>
              <Button variant="outline" disabled={exporting} onClick={handlePDF}>
                {exporting ? <span className="material-icons-round animate-spin text-sm">refresh</span> : <span className="material-icons-round text-sm">picture_as_pdf</span>}PDF
              </Button>
              <Button variant="outline" disabled={exporting} onClick={handleWhatsApp}>
                <span className="material-icons-round text-sm">share</span>واتساب
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Hidden Printable Report ── */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
        <ProductionReportPrint
          ref={printComponentRef}
          title={`تقرير إنتاج المنتج: ${productDisplayName}`}
          subtitle={`${product?.code || rawProduct?.code || ''} — ${uniqueDays} يوم عمل`}
          rows={printRows}
          totals={printTotals}
        />
      </div>

      {/* Error Banner */}
      {fetchError && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-4 flex items-center gap-3">
          <span className="material-icons-round text-rose-500">warning</span>
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{fetchError}</p>
        </div>
      )}

      {/* Basic Product Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5">
        <KPIBox
          label="الرصيد الافتتاحي"
          value={formatNumber(rawProduct?.openingBalance ?? product?.openingStock ?? 0)}
          unit="وحدة"
          icon="account_balance"
          colorClass="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
        />
        <KPIBox
          label="إجمالي الإنتاج"
          value={formatNumber(totalProduced || product?.totalProduction || 0)}
          unit="وحدة"
          icon="inventory"
          colorClass="bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
        />
        <KPIBox
          label="إجمالي الهالك"
          value={formatNumber(totalWaste || product?.wasteUnits || 0)}
          unit="وحدة"
          icon="delete_sweep"
          colorClass="bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400"
        />
        <KPIBox
          label="الرصيد الحالي"
          value={formatNumber(currentBalance || product?.stockLevel || 0)}
          unit="وحدة"
          icon="warehouse"
          colorClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
        />
        <KPIBox
          label="نسبة الهالك"
          value={`${wasteRatio}%`}
          icon="pie_chart"
          colorClass="bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400"
        />
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 dark:bg-amber-900/20 rounded-lg flex items-center justify-center">
              <span className="material-icons-round text-amber-600 text-2xl">schedule</span>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold mb-0.5">متوسط وقت التجميع الفعلي</p>
              <p className="text-lg font-black text-slate-800 dark:text-white">
                {reports.length > 0 ? `${avgAssemblyTime} دقيقة/وحدة` : (product?.avgAssemblyTime ? `${product.avgAssemblyTime} دقيقة/وحدة` : '—')}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
              <span className="material-icons-round text-primary text-2xl">timer</span>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold mb-0.5">وقت التجميع القياسي</p>
              <p className="text-lg font-black text-slate-800 dark:text-white">
                {standardTime > 0 ? `${standardTime} دقيقة/وحدة` : 'غير محدد'}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
              <span className="material-icons-round text-emerald-600 text-2xl">emoji_events</span>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold mb-0.5">أفضل خط إنتاج أداءً</p>
              <p className="text-lg font-black text-slate-800 dark:text-white">{bestLine}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <span className="material-icons-round text-blue-600 text-2xl">trending_up</span>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-bold mb-0.5">متوسط الإنتاج اليومي</p>
              <p className="text-lg font-black text-slate-800 dark:text-white">
                {avgDailyProduction > 0 ? `${formatNumber(avgDailyProduction)} وحدة` : '—'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Cost Data */}
      {canViewCosts && todayCost && (todayCost.laborCost > 0 || todayCost.indirectCost > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <KPIBox
            label="تكلفة العمالة اليوم"
            value={formatCost(todayCost.laborCost)}
            unit="ج.م"
            icon="groups"
            colorClass="bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400"
          />
          <KPIBox
            label="تكلفة غير مباشرة"
            value={formatCost(todayCost.indirectCost)}
            unit="ج.م"
            icon="account_tree"
            colorClass="bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400"
          />
          <KPIBox
            label="إجمالي التكلفة"
            value={formatCost(todayCost.totalCost)}
            unit="ج.م"
            icon="payments"
            colorClass="bg-primary/10 text-primary dark:bg-primary/20"
          />
          <KPIBox
            label="تكلفة الوحدة"
            value={todayCost.costPerUnit > 0 ? formatCost(todayCost.costPerUnit) : '—'}
            unit={todayCost.costPerUnit > 0 ? 'ج.م' : ''}
            icon="price_check"
            colorClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
          />
        </div>
      )}

      {/* Cost Analysis Section */}
      {canViewCosts && historicalAvgCost && historicalAvgCost.costPerUnit > 0 && (
        <>
          {/* Forecast Summary */}
          <Card title="ملخص التكلفة والتوقعات">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-primary/5 rounded-xl p-4 border border-primary/10 text-center">
                <p className="text-[10px] font-bold text-slate-400 mb-1">متوسط تكلفة الوحدة</p>
                <p className="text-xl font-black text-primary">{formatCost(historicalAvgCost.costPerUnit)}</p>
                <span className="text-[10px] font-medium text-slate-400">ج.م / وحدة</span>
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 text-center">
                <p className="text-[10px] font-bold text-slate-400 mb-1">إجمالي التكلفة التاريخية</p>
                <p className="text-xl font-black text-slate-700 dark:text-white">{formatCost(historicalAvgCost.totalCost)}</p>
                <span className="text-[10px] font-medium text-slate-400">ج.م</span>
              </div>
              {costTrend && (
                <div className={`rounded-xl p-4 border text-center ${costTrend.improving ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800'}`}>
                  <p className="text-[10px] font-bold text-slate-400 mb-1">اتجاه التكلفة</p>
                  <div className="flex items-center justify-center gap-1">
                    <span className={`material-icons-round text-lg ${costTrend.improving ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {costTrend.improving ? 'trending_down' : 'trending_up'}
                    </span>
                    <p className={`text-xl font-black ${costTrend.improving ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {Math.abs(costTrend.pctChange)}%
                    </p>
                  </div>
                  <span className="text-[10px] font-medium text-slate-400">{costTrend.improving ? 'تحسن' : 'ارتفاع'}</span>
                </div>
              )}
              {bestCostLine && costByLine.length > 1 && (
                <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-4 border border-emerald-200 dark:border-emerald-800 text-center">
                  <p className="text-[10px] font-bold text-slate-400 mb-1">أفضل خط من حيث التكلفة</p>
                  <p className="text-lg font-black text-emerald-600">{bestCostLine.lineName}</p>
                  <span className="text-[10px] font-medium text-slate-400">{formatCost(bestCostLine.costPerUnit)} ج.م/وحدة</span>
                </div>
              )}
            </div>
          </Card>

          {/* Cost by Line */}
          {costByLine.length > 0 && (
            <Card title="تكلفة الإنتاج حسب خط الإنتاج">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">خط الإنتاج</th>
                      <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الكمية المنتجة</th>
                      <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">إجمالي التكلفة</th>
                      <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">تكلفة الوحدة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {costByLine.map((lc) => (
                      <tr key={lc.lineId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-300">{lc.lineName}</td>
                        <td className="px-5 py-3 text-center text-sm font-bold">{formatNumber(lc.totalProduced)}</td>
                        <td className="px-5 py-3 text-center text-sm font-bold text-slate-600">{formatCost(lc.totalCost)} ج.م</td>
                        <td className="px-5 py-3 text-center">
                          <span className={`px-2.5 py-1 rounded-lg text-sm font-black ring-1 ${bestCostLine?.lineId === lc.lineId ? 'bg-emerald-50 text-emerald-600 ring-emerald-500/20' : 'bg-primary/5 text-primary ring-primary/20'}`}>
                            {formatCost(lc.costPerUnit)} ج.م
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Cost Trend Chart */}
          {costHistory.length > 1 && (
            <Card title="اتجاه تكلفة الوحدة">
              <div style={{ width: '100%', height: 280 }} dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={costHistory} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickFormatter={(v) => v.slice(5)}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontFamily: 'inherit' }}
                      formatter={(value: number) => [`${formatCost(value)} ج.م`, 'تكلفة الوحدة']}
                    />
                    <Bar dataKey="costPerUnit" name="تكلفة الوحدة" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Production History Chart */}
      <Card title="سجل الإنتاج">
        {loading ? (
          <div className="animate-pulse h-64 bg-slate-50 dark:bg-slate-800 rounded-lg"></div>
        ) : chartData.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <span className="material-icons-round text-4xl mb-2 block opacity-30">bar_chart</span>
            <p className="font-bold">لا توجد بيانات إنتاج بعد</p>
            <p className="text-sm mt-1">ستظهر البيانات هنا عند إضافة تقارير إنتاج لهذا المنتج</p>
          </div>
        ) : (
          <div style={{ width: '100%', height: 320 }} dir="ltr">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
                <Legend />
                <Bar
                  dataKey="produced"
                  name="الإنتاج"
                  fill="#1392ec"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="waste"
                  name="الهالك"
                  fill="#f43f5e"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Reports Table */}
      <Card className="!p-0 border-none overflow-hidden shadow-xl shadow-slate-200/50" title="">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-lg font-bold">التقارير التفصيلية</h3>
          {reports.length > 0 && (
            <span className="text-xs font-bold text-slate-400">
              {uniqueDays} يوم عمل مسجل
            </span>
          )}
        </div>
        {loading ? (
          <div className="animate-pulse space-y-3 p-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded flex-1"></div>
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-20"></div>
                <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-16"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">التاريخ</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">خط الإنتاج</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">المشرف</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الكمية</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الهالك</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">عمال</th>
                  <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">ساعات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                      <span className="material-icons-round text-4xl mb-2 block opacity-30">description</span>
                      <p className="font-bold">لا توجد تقارير لهذا المنتج</p>
                      <p className="text-sm mt-1">أضف تقارير إنتاج من صفحة "التقارير"</p>
                    </td>
                  </tr>
                )}
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-bold text-slate-700 dark:text-slate-300">{r.date}</td>
                    <td className="px-5 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">{getLineName(r.lineId)}</td>
                    <td className="px-5 py-3 text-sm font-medium text-slate-600 dark:text-slate-400">{getSupervisorName(r.supervisorId)}</td>
                    <td className="px-5 py-3 text-center">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-sm font-black ring-1 ring-emerald-500/20">
                        {formatNumber(r.quantityProduced)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center text-rose-500 font-bold text-sm">{formatNumber(r.quantityWaste)}</td>
                    <td className="px-5 py-3 text-center text-sm font-bold">{r.workersCount}</td>
                    <td className="px-5 py-3 text-center text-sm font-bold">{r.workHours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {reports.length > 0 && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-sm text-slate-500 font-bold">
              إجمالي <span className="text-primary">{reports.length}</span> تقرير
            </span>
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="text-emerald-600">
                إنتاج: {formatNumber(totalProduced)}
              </span>
              <span className="text-rose-500">
                هالك: {formatNumber(totalWaste)}
              </span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
