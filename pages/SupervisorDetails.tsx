
import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useReactToPrint } from 'react-to-print';
import { Card, KPIBox, Button, Badge, LoadingSkeleton } from '../components/UI';
import { useAppStore } from '../store/useAppStore';
import { reportService } from '../services/reportService';
import {
  formatNumber,
  calculateAvgAssemblyTime,
  calculateWasteRatio,
  calculateEfficiency,
  groupReportsByDate,
  countUniqueDays,
  getTodayDateString,
} from '../utils/calculations';
import { ProductionReport } from '../types';
import { exportSupervisorReports } from '../utils/exportExcel';
import { exportToPDF, shareToWhatsApp } from '../utils/reportExport';
import {
  ProductionReportPrint,
  SingleReportPrint,
  mapReportsToPrintRows,
  computePrintTotals,
  ReportPrintRow,
} from '../components/ProductionReportPrint';

export const SupervisorDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const supervisors = useAppStore((s) => s.supervisors);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawLines = useAppStore((s) => s._rawLines);
  const productionLines = useAppStore((s) => s.productionLines);

  const [reports, setReports] = useState<ProductionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllReports, setShowAllReports] = useState(false);
  const [exporting, setExporting] = useState(false);

  const printComponentRef = useRef<HTMLDivElement>(null);

  const supervisor = supervisors.find((s) => s.id === id);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    reportService
      .getBySupervisor(id)
      .then((data) => { if (!cancelled) setReports(data); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // ── Single-report print state ──

  const [printReport, setPrintReport] = useState<ReportPrintRow | null>(null);
  const singlePrintRef = useRef<HTMLDivElement>(null);

  // ── Derived KPIs ──

  const totalProduced = useMemo(() => reports.reduce((sum, r) => sum + (r.quantityProduced || 0), 0), [reports]);
  const totalWaste = useMemo(() => reports.reduce((sum, r) => sum + (r.quantityWaste || 0), 0), [reports]);
  const totalHours = useMemo(() => reports.reduce((sum, r) => sum + (r.workHours || 0), 0), [reports]);
  const uniqueDays = useMemo(() => countUniqueDays(reports), [reports]);
  const avgDailyProduction = useMemo(() => (uniqueDays > 0 ? Math.round(totalProduced / uniqueDays) : 0), [totalProduced, uniqueDays]);
  const avgAssemblyTime = useMemo(() => calculateAvgAssemblyTime(reports), [reports]);
  const wasteRatio = useMemo(() => calculateWasteRatio(totalWaste, totalProduced + totalWaste), [totalWaste, totalProduced]);
  const chartData = useMemo(() => groupReportsByDate(reports), [reports]);

  // ── Today & Month totals ──

  const todayStr = useMemo(() => getTodayDateString(), []);
  const currentMonth = useMemo(() => todayStr.slice(0, 7), [todayStr]);

  const todayProduced = useMemo(
    () => reports.filter((r) => r.date === todayStr).reduce((sum, r) => sum + (r.quantityProduced || 0), 0),
    [reports, todayStr]
  );
  const todayWaste = useMemo(
    () => reports.filter((r) => r.date === todayStr).reduce((sum, r) => sum + (r.quantityWaste || 0), 0),
    [reports, todayStr]
  );

  const monthProduced = useMemo(
    () => reports.filter((r) => r.date.startsWith(currentMonth)).reduce((sum, r) => sum + (r.quantityProduced || 0), 0),
    [reports, currentMonth]
  );
  const monthWaste = useMemo(
    () => reports.filter((r) => r.date.startsWith(currentMonth)).reduce((sum, r) => sum + (r.quantityWaste || 0), 0),
    [reports, currentMonth]
  );

  // ── Lookups (shared between table + print) ──

  const lookups = useMemo(() => ({
    getLineName: (lineId: string) => _rawLines.find((l) => l.id === lineId)?.name ?? '—',
    getProductName: (productId: string) => _rawProducts.find((p) => p.id === productId)?.name ?? '—',
    getSupervisorName: () => supervisor?.name ?? '—',
  }), [_rawLines, _rawProducts, supervisor]);

  // ── Printable rows ──

  const printRows = useMemo(() => mapReportsToPrintRows(reports, lookups), [reports, lookups]);
  const printTotals = useMemo(() => computePrintTotals(printRows), [printRows]);

  // ── react-to-print ──

  const handlePrint = useReactToPrint({ contentRef: printComponentRef });

  // ── PDF / WhatsApp handlers ──

  const handlePDF = async () => {
    if (!printComponentRef.current) return;
    setExporting(true);
    try { await exportToPDF(printComponentRef.current, `تقرير-${supervisor?.name ?? ''}`); }
    finally { setExporting(false); }
  };

  const handleWhatsApp = async () => {
    if (!printComponentRef.current) return;
    setExporting(true);
    try { await shareToWhatsApp(printComponentRef.current, `تقرير ${supervisor?.name ?? ''}`); }
    finally { setExporting(false); }
  };

  // ── Single report print ──

  const handleSinglePrint = useReactToPrint({ contentRef: singlePrintRef });

  const triggerSinglePrint = useCallback(
    (report: ProductionReport) => {
      const row: ReportPrintRow = {
        date: report.date,
        lineName: lookups.getLineName(report.lineId),
        productName: lookups.getProductName(report.productId),
        supervisorName: supervisor?.name ?? '—',
        quantityProduced: report.quantityProduced || 0,
        quantityWaste: report.quantityWaste || 0,
        workersCount: report.workersCount || 0,
        workHours: report.workHours || 0,
      };
      setPrintReport(row);
    },
    [lookups, supervisor]
  );

  useEffect(() => {
    if (printReport && singlePrintRef.current) {
      const timer = setTimeout(() => {
        handleSinglePrint();
        setTimeout(() => setPrintReport(null), 500);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [printReport]);

  // ── Summaries by line / product ──

  const linesSummary = useMemo(() => {
    const map = new Map<string, { produced: number; waste: number; hours: number; count: number }>();
    reports.forEach((r) => {
      const prev = map.get(r.lineId) || { produced: 0, waste: 0, hours: 0, count: 0 };
      prev.produced += r.quantityProduced || 0;
      prev.waste += r.quantityWaste || 0;
      prev.hours += r.workHours || 0;
      prev.count += 1;
      map.set(r.lineId, prev);
    });
    return Array.from(map.entries()).map(([lineId, data]) => ({
      lineId,
      name: _rawLines.find((l) => l.id === lineId)?.name ?? '—',
      ...data,
    })).sort((a, b) => b.produced - a.produced);
  }, [reports, _rawLines]);

  const productsSummary = useMemo(() => {
    const map = new Map<string, { produced: number; waste: number; count: number }>();
    reports.forEach((r) => {
      const prev = map.get(r.productId) || { produced: 0, waste: 0, count: 0 };
      prev.produced += r.quantityProduced || 0;
      prev.waste += r.quantityWaste || 0;
      prev.count += 1;
      map.set(r.productId, prev);
    });
    return Array.from(map.entries()).map(([productId, data]) => ({
      productId,
      name: _rawProducts.find((p) => p.id === productId)?.name ?? '—',
      ...data,
    })).sort((a, b) => b.produced - a.produced);
  }, [reports, _rawProducts]);

  const supervisedLines = useMemo(
    () => productionLines.filter((l) => l.supervisorName === supervisor?.name),
    [productionLines, supervisor]
  );

  const displayedReports = showAllReports ? reports : reports.slice(0, 15);

  // ── Not found ──

  if (!supervisor && !loading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-16 text-slate-400">
          <span className="material-icons-round text-6xl mb-4 block opacity-30">person</span>
          <p className="font-bold text-lg">المشرف غير موجود</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/supervisors')}>
            <span className="material-icons-round text-sm">arrow_forward</span>
            العودة لفريق العمل
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <LoadingSkeleton type="detail" />;
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/supervisors')} className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all">
            <span className="material-icons-round">arrow_forward</span>
          </button>
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center ring-4 ring-primary/5">
            <span className="material-icons-round text-primary text-3xl">person</span>
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 dark:text-white">{supervisor?.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <Badge variant={reports.length > 0 ? 'success' : 'neutral'}>
                {reports.length > 0 ? 'نشط' : 'لا توجد تقارير'}
              </Badge>
              <span className="text-sm text-slate-400 font-medium">{uniqueDays} يوم عمل · {reports.length} تقرير</span>
            </div>
          </div>
        </div>

        {/* ── Action Buttons ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="primary" disabled={reports.length === 0}
            onClick={() => exportSupervisorReports(supervisor?.name ?? '', reports, lookups)}>
            <span className="material-icons-round text-sm">download</span>Excel
          </Button>
          <Button variant="outline" disabled={reports.length === 0} onClick={() => handlePrint()}>
            <span className="material-icons-round text-sm">print</span>طباعة
          </Button>
          <Button variant="outline" disabled={reports.length === 0 || exporting} onClick={handlePDF}>
            {exporting ? <span className="material-icons-round animate-spin text-sm">refresh</span> : <span className="material-icons-round text-sm">picture_as_pdf</span>}PDF
          </Button>
          <Button variant="outline" disabled={reports.length === 0 || exporting} onClick={handleWhatsApp}>
            <span className="material-icons-round text-sm">share</span>واتساب
          </Button>
        </div>
      </div>

      {/* ── Hidden Printable Reports (off-screen for react-to-print / html2canvas) ── */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <ProductionReportPrint
          ref={printComponentRef}
          title={`تقرير إنتاج المشرف: ${supervisor?.name ?? ''}`}
          subtitle={`${uniqueDays} يوم عمل — ${reports.length} تقرير`}
          rows={printRows}
          totals={printTotals}
        />
        <SingleReportPrint ref={singlePrintRef} report={printReport} />
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 rounded-lg flex items-center justify-center">
              <span className="material-icons-round text-xl">inventory</span>
            </div>
            <p className="text-slate-500 text-xs font-bold">إجمالي الإنتاج</p>
          </div>
          <h3 className="text-xl font-black mb-2">{formatNumber(totalProduced)} <span className="text-xs font-normal text-slate-400">وحدة</span></h3>
          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold">اليوم</span>
              <span className="font-black text-blue-600">{formatNumber(todayProduced)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold">الشهر</span>
              <span className="font-black text-primary">{formatNumber(monthProduced)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400 rounded-lg flex items-center justify-center">
              <span className="material-icons-round text-xl">delete_sweep</span>
            </div>
            <p className="text-slate-500 text-xs font-bold">إجمالي الهالك</p>
          </div>
          <h3 className="text-xl font-black mb-2">{formatNumber(totalWaste)} <span className="text-xs font-normal text-slate-400">وحدة</span></h3>
          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold">اليوم</span>
              <span className="font-black text-rose-500">{formatNumber(todayWaste)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold">الشهر</span>
              <span className="font-black text-rose-500">{formatNumber(monthWaste)}</span>
            </div>
          </div>
        </div>

        <KPIBox label="نسبة الهالك" value={`${wasteRatio}%`} icon="pie_chart" colorClass="bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400" />
        <KPIBox label="متوسط يومي" value={formatNumber(avgDailyProduction)} unit="وحدة/يوم" icon="trending_up" colorClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" />
        <KPIBox label="إجمالي الساعات" value={formatNumber(totalHours)} unit="ساعة" icon="schedule" colorClass="bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400" />
        <KPIBox label="وقت التجميع" value={avgAssemblyTime} unit="دقيقة/وحدة" icon="timer" colorClass="bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Lines Summary ── */}
        <Card title="خطوط الإنتاج">
          {linesSummary.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <span className="material-icons-round text-3xl mb-2 block opacity-30">precision_manufacturing</span>
              <p className="text-sm font-bold">لم يعمل على أي خط بعد</p>
            </div>
          ) : (
            <div className="space-y-3">
              {linesSummary.map((line) => {
                const eff = line.produced + line.waste > 0 ? calculateEfficiency(line.produced, line.produced + line.waste) : 0;
                return (
                  <div key={line.lineId} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-slate-800 dark:text-white">{line.name}</span>
                      <Badge variant="info">{line.count} تقرير</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div><p className="text-slate-400 mb-0.5">إنتاج</p><p className="font-black text-emerald-600">{formatNumber(line.produced)}</p></div>
                      <div><p className="text-slate-400 mb-0.5">هالك</p><p className="font-black text-rose-500">{formatNumber(line.waste)}</p></div>
                      <div><p className="text-slate-400 mb-0.5">ساعات</p><p className="font-black text-primary">{line.hours}</p></div>
                    </div>
                    <div className="mt-2 w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(eff, 100)}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── Products Summary ── */}
        <Card title="المنتجات">
          {productsSummary.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <span className="material-icons-round text-3xl mb-2 block opacity-30">inventory_2</span>
              <p className="text-sm font-bold">لم ينتج أي منتج بعد</p>
            </div>
          ) : (
            <div className="space-y-3">
              {productsSummary.map((prod) => {
                const ratio = totalProduced > 0 ? Math.round((prod.produced / totalProduced) * 100) : 0;
                return (
                  <div key={prod.productId} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-slate-800 dark:text-white truncate">{prod.name}</span>
                      <span className="text-xs font-black text-primary mr-2">{ratio}%</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                      <div><p className="text-slate-400 mb-0.5">إنتاج</p><p className="font-black text-emerald-600">{formatNumber(prod.produced)}</p></div>
                      <div><p className="text-slate-400 mb-0.5">هالك</p><p className="font-black text-rose-500">{formatNumber(prod.waste)}</p></div>
                    </div>
                    <div className="mt-2 w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${ratio}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── Performance Chart ── */}
        <Card title="سجل الأداء اليومي">
          {chartData.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <span className="material-icons-round text-3xl mb-2 block opacity-30">bar_chart</span>
              <p className="text-sm font-bold">لا توجد بيانات بعد</p>
            </div>
          ) : (
            <div className="space-y-3">
              {chartData.slice(-10).map((day) => {
                const maxVal = Math.max(...chartData.map((d) => d.produced), 1);
                const barWidth = Math.round((day.produced / maxVal) * 100);
                return (
                  <div key={day.date} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400 w-16 shrink-0">{day.date.slice(5)}</span>
                    <div className="flex-1 relative">
                      <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden">
                        <div className="h-full bg-primary/80 rounded-md flex items-center justify-end px-2" style={{ width: `${Math.max(barWidth, 5)}%` }}>
                          <span className="text-[10px] font-black text-white">{formatNumber(day.produced)}</span>
                        </div>
                      </div>
                      {day.waste > 0 && (
                        <div className="h-1.5 bg-rose-400 rounded-full mt-0.5" style={{ width: `${Math.max(Math.round((day.waste / maxVal) * 100), 2)}%` }}></div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center gap-4 text-[10px] font-bold text-slate-400 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 bg-primary/80 rounded"></span>الإنتاج</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-1.5 bg-rose-400 rounded-full"></span>الهالك</div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── Currently Supervised Lines ── */}
      {supervisedLines.length > 0 && (
        <Card title="الخطوط المشرف عليها حالياً">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {supervisedLines.map((line) => (
              <div key={line.id} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-sm">{line.name}</h4>
                  <Badge variant={line.status === 'active' ? 'success' : 'neutral'}>{line.status === 'active' ? 'يعمل' : line.status}</Badge>
                </div>
                <p className="text-xs text-slate-400 mb-2">المنتج: <span className="text-slate-600 dark:text-slate-300 font-bold">{line.currentProduct}</span></p>
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-500">الإنجاز: {formatNumber(line.achievement)} / {formatNumber(line.target)}</span>
                  <span className={line.efficiency > 80 ? 'text-emerald-600' : 'text-amber-600'}>{line.efficiency}%</span>
                </div>
                <div className="mt-2 w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(line.efficiency, 100)}%` }}></div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Reports Table ── */}
      <Card className="!p-0 border-none overflow-hidden shadow-xl shadow-slate-200/50">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-lg font-bold">التقارير التفصيلية</h3>
          <span className="text-sm text-slate-400 font-bold">{reports.length} تقرير</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">التاريخ</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">خط الإنتاج</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">المنتج</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الكمية المنتجة</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الهالك</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">نسبة الهالك</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">عمال</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">ساعات</th>
                <th className="px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-left">طباعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {reports.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center text-slate-400">
                    <span className="material-icons-round text-5xl mb-3 block opacity-30">description</span>
                    <p className="font-bold text-lg">لا توجد تقارير لهذا المشرف</p>
                    <p className="text-sm mt-1">ستظهر التقارير هنا بعد إنشاء تقارير إنتاج مرتبطة بهذا المشرف</p>
                  </td>
                </tr>
              )}
              {displayedReports.map((r) => {
                const productName = _rawProducts.find((p) => p.id === r.productId)?.name ?? '—';
                const lineName = _rawLines.find((l) => l.id === r.lineId)?.name ?? '—';
                const rWaste = calculateWasteRatio(r.quantityWaste, r.quantityProduced + r.quantityWaste);
                return (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-5 py-3.5 text-sm font-bold text-slate-700 dark:text-slate-300">{r.date}</td>
                    <td className="px-5 py-3.5 text-sm font-medium">{lineName}</td>
                    <td className="px-5 py-3.5 text-sm font-medium">{productName}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-sm font-black ring-1 ring-emerald-500/20">
                        {formatNumber(r.quantityProduced)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center text-rose-500 font-bold text-sm">{formatNumber(r.quantityWaste)}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`text-sm font-bold ${rWaste > 5 ? 'text-rose-500' : rWaste > 2 ? 'text-amber-500' : 'text-emerald-600'}`}>{rWaste}%</span>
                    </td>
                    <td className="px-5 py-3.5 text-center text-sm font-bold">{r.workersCount}</td>
                    <td className="px-5 py-3.5 text-center text-sm font-bold">{r.workHours}</td>
                    <td className="px-5 py-3.5 text-left">
                      <button
                        onClick={() => triggerSinglePrint(r)}
                        className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        title="طباعة التقرير"
                      >
                        <span className="material-icons-round text-lg">print</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {reports.length > 0 && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="text-emerald-600">إنتاج: {formatNumber(totalProduced)}</span>
              <span className="text-rose-500">هالك: {formatNumber(totalWaste)}</span>
              <span className="text-primary">ساعات: {formatNumber(totalHours)}</span>
            </div>
            {reports.length > 15 && (
              <Button variant="outline" className="text-xs py-1.5" onClick={() => setShowAllReports(!showAllReports)}>
                {showAllReports ? 'عرض أقل' : `عرض الكل (${reports.length})`}
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
