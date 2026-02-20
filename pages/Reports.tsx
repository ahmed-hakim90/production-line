
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useAppStore } from '../store/useAppStore';
import { Card, Button, Badge, SearchableSelect } from '../components/UI';
import { formatNumber, getTodayDateString } from '../utils/calculations';
import { buildReportsCosts, estimateReportCost, formatCost } from '../utils/costCalculations';
import { ProductionReport } from '../types';
import { usePermission } from '../utils/permissions';
import { exportReportsByDateRange } from '../utils/exportExcel';
import { exportToPDF, shareToWhatsApp, ShareResult } from '../utils/reportExport';
import { parseExcelFile, toReportData, ImportResult, ParsedReportRow } from '../utils/importExcel';
import { downloadReportsTemplate } from '../utils/downloadTemplates';
import {
  ProductionReportPrint,
  SingleReportPrint,
  mapReportsToPrintRows,
  computePrintTotals,
  ReportPrintRow,
} from '../components/ProductionReportPrint';

const emptyForm = {
  supervisorId: '',
  productId: '',
  lineId: '',
  date: getTodayDateString(),
  quantityProduced: 0,
  quantityWaste: 0,
  workersCount: 0,
  workHours: 0,
};

export const Reports: React.FC = () => {
  const todayReports = useAppStore((s) => s.todayReports);
  const productionReports = useAppStore((s) => s.productionReports);
  const supervisors = useAppStore((s) => s.supervisors);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawSupervisors = useAppStore((s) => s._rawSupervisors);
  const uid = useAppStore((s) => s.uid);
  const createReport = useAppStore((s) => s.createReport);
  const updateReport = useAppStore((s) => s.updateReport);
  const deleteReport = useAppStore((s) => s.deleteReport);
  const fetchReports = useAppStore((s) => s.fetchReports);
  const reportsLoading = useAppStore((s) => s.reportsLoading);
  const error = useAppStore((s) => s.error);

  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const laborSettings = useAppStore((s) => s.laborSettings);

  const { can } = usePermission();
  const canViewCosts = can('costs.view');

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);

  // Import from Excel state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Single-report print state
  const [printReport, setPrintReport] = useState<ReportPrintRow | null>(null);
  const singlePrintRef = useRef<HTMLDivElement>(null);

  // Bulk print ref
  const bulkPrintRef = useRef<HTMLDivElement>(null);

  // Date range filter
  const [startDate, setStartDate] = useState(getTodayDateString());
  const [endDate, setEndDate] = useState(getTodayDateString());
  const [viewMode, setViewMode] = useState<'today' | 'range'>('today');

  // Supervisor-only filter: basic supervisors see only their own reports
  const mySupervisorId = useMemo(() => {
    if (can('reports.edit')) return null;
    const linked = _rawSupervisors.find((s) => s.userId === uid);
    return linked?.id ?? null;
  }, [_rawSupervisors, uid, can]);

  const allReports = viewMode === 'today' ? todayReports : productionReports;
  const displayedReports = mySupervisorId
    ? allReports.filter((r) => r.supervisorId === mySupervisorId)
    : allReports;

  const reportCosts = useMemo(() => {
    if (!canViewCosts) return new Map<string, number>();
    const hourlyRate = laborSettings?.hourlyRate ?? 0;
    return buildReportsCosts(displayedReports, hourlyRate, costCenters, costCenterValues, costAllocations);
  }, [canViewCosts, displayedReports, laborSettings, costCenters, costCenterValues, costAllocations]);

  // ── Lookups ────────────────────────────────────────────────────────────────

  const getProductName = useCallback(
    (pid: string) => _rawProducts.find((p) => p.id === pid)?.name ?? '—',
    [_rawProducts]
  );
  const getLineName = useCallback(
    (lid: string) => _rawLines.find((l) => l.id === lid)?.name ?? '—',
    [_rawLines]
  );
  const getSupervisorName = useCallback(
    (sid: string) => supervisors.find((s) => s.id === sid)?.name ?? '—',
    [supervisors]
  );

  const lookups = useMemo(
    () => ({ getLineName, getProductName, getSupervisorName }),
    [getLineName, getProductName, getSupervisorName]
  );

  // ── Bulk print data ────────────────────────────────────────────────────────

  const printRows = useMemo(
    () => mapReportsToPrintRows(displayedReports, lookups),
    [displayedReports, lookups]
  );
  const printTotals = useMemo(() => computePrintTotals(printRows), [printRows]);

  // ── Print handlers ─────────────────────────────────────────────────────────

  const handleBulkPrint = useReactToPrint({ contentRef: bulkPrintRef });

  const handleSinglePrint = useReactToPrint({ contentRef: singlePrintRef });

  const buildReportRow = useCallback(
    (report: ProductionReport | typeof emptyForm): ReportPrintRow => ({
      date: report.date,
      lineName: getLineName(report.lineId),
      productName: getProductName(report.productId),
      supervisorName: getSupervisorName(report.supervisorId),
      quantityProduced: report.quantityProduced || 0,
      quantityWaste: report.quantityWaste || 0,
      workersCount: report.workersCount || 0,
      workHours: report.workHours || 0,
    }),
    [getLineName, getProductName, getSupervisorName]
  );

  const triggerSinglePrint = useCallback(
    async (report: ProductionReport) => {
      setPrintReport(buildReportRow(report));
      await new Promise((r) => setTimeout(r, 300));
      handleSinglePrint();
      setTimeout(() => setPrintReport(null), 1000);
    },
    [buildReportRow, handleSinglePrint]
  );

  const showShareFeedback = useCallback((result: ShareResult) => {
    if (result.method === 'native_share' || result.method === 'cancelled') return;
    const msg = result.copied
      ? 'تم تحميل الصورة ونسخها — افتح المحادثة والصق الصورة (Ctrl+V)'
      : 'تم تحميل صورة التقرير — أرفقها في محادثة واتساب';
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 6000);
  }, []);

  const triggerSingleShare = useCallback(
    async (report: ProductionReport) => {
      const row = buildReportRow(report);
      setPrintReport(row);
      await new Promise((r) => setTimeout(r, 300));
      if (!singlePrintRef.current) return;
      setExporting(true);
      try {
        const result = await shareToWhatsApp(
          singlePrintRef.current,
          `تقرير إنتاج - ${row.lineName} - ${row.date}`,
        );
        showShareFeedback(result);
      } finally {
        setExporting(false);
        setTimeout(() => setPrintReport(null), 500);
      }
    },
    [buildReportRow, showShareFeedback]
  );

  // ── CRUD handlers ──────────────────────────────────────────────────────────

  const handleFetchRange = async () => {
    if (startDate && endDate) {
      await fetchReports(startDate, endDate);
      setViewMode('range');
    }
  };

  const handleShowToday = () => {
    setViewMode('today');
    setStartDate(getTodayDateString());
    setEndDate(getTodayDateString());
  };

  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm, date: getTodayDateString() });
    setShowModal(true);
  };

  const openEdit = (report: ProductionReport) => {
    setEditId(report.id!);
    setForm({
      supervisorId: report.supervisorId,
      productId: report.productId,
      lineId: report.lineId,
      date: report.date,
      quantityProduced: report.quantityProduced,
      quantityWaste: report.quantityWaste,
      workersCount: report.workersCount,
      workHours: report.workHours,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.lineId || !form.productId || !form.supervisorId) return;
    setSaving(true);

    if (editId) {
      await updateReport(editId, form);
    } else {
      await createReport(form);
    }
    setSaving(false);
    setShowModal(false);
    setEditId(null);
  };

  const handleDelete = async (id: string) => {
    await deleteReport(id);
    setDeleteConfirmId(null);
  };

  const handlePDF = async () => {
    if (!bulkPrintRef.current) return;
    setExporting(true);
    try {
      await exportToPDF(bulkPrintRef.current, `تقارير-الإنتاج-${startDate}`);
    } finally {
      setExporting(false);
    }
  };

  const handleWhatsApp = async () => {
    if (!bulkPrintRef.current) return;
    setExporting(true);
    try {
      const result = await shareToWhatsApp(bulkPrintRef.current, `تقارير الإنتاج ${startDate}`);
      showShareFeedback(result);
    } finally {
      setExporting(false);
    }
  };

  // ── Import from Excel ────────────────────────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportParsing(true);
    setShowImportModal(true);
    setImportResult(null);
    try {
      const result = await parseExcelFile(file, {
        products: _rawProducts,
        lines: _rawLines,
        supervisors: _rawSupervisors,
      });
      setImportResult(result);
    } catch {
      setImportResult({ rows: [], totalRows: 0, validCount: 0, errorCount: 0 });
    } finally {
      setImportParsing(false);
    }
  };

  const handleImportSave = async () => {
    if (!importResult) return;
    const validRows = importResult.rows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) return;

    setImportSaving(true);
    setImportProgress({ done: 0, total: validRows.length });

    let done = 0;
    for (const row of validRows) {
      try {
        await createReport(toReportData(row));
      } catch {
        // skip failed row
      }
      done++;
      setImportProgress({ done, total: validRows.length });
    }

    setImportSaving(false);
    setShowImportModal(false);
    setImportResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">تقارير الإنتاج</h2>
          <p className="text-sm text-slate-500 font-medium">إنشاء ومراجعة تقارير الإنتاج اليومية.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {displayedReports.length > 0 && can("export") && (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  exportReportsByDateRange(displayedReports, startDate, endDate, lookups)
                }
              >
                <span className="material-icons-round text-sm">download</span>
                <span className="hidden sm:inline">Excel</span>
              </Button>
              <Button variant="outline" disabled={exporting} onClick={handlePDF}>
                {exporting ? (
                  <span className="material-icons-round animate-spin text-sm">refresh</span>
                ) : (
                  <span className="material-icons-round text-sm">picture_as_pdf</span>
                )}
                <span className="hidden sm:inline">PDF</span>
              </Button>
              <Button variant="outline" disabled={exporting} onClick={handleWhatsApp}>
                <span className="material-icons-round text-sm">share</span>
                <span className="hidden sm:inline">واتساب</span>
              </Button>
            </>
          )}
          {can("reports.create") && (
            <>
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <span className="material-icons-round text-sm">upload_file</span>
                <span className="hidden sm:inline">رفع Excel</span>
              </Button>
              <Button variant="primary" onClick={openCreate}>
                <span className="material-icons-round text-sm">note_add</span>
                إنشاء تقرير
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-4 flex items-center gap-3">
          <span className="material-icons-round text-rose-500">warning</span>
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {/* WhatsApp Share Feedback Toast */}
      {shareToast && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 flex items-center gap-3 animate-in fade-in duration-300">
          <span className="material-icons-round text-emerald-500">image</span>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 flex-1">{shareToast}</p>
          <button onClick={() => setShareToast(null)} className="p-1 text-emerald-400 hover:text-emerald-600 transition-colors shrink-0">
            <span className="material-icons-round text-sm">close</span>
          </button>
        </div>
      )}

      {/* Date Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap gap-3 sm:gap-4 items-center shadow-sm">
        <Button
          variant={viewMode === 'today' ? 'primary' : 'outline'}
          onClick={handleShowToday}
          className="text-xs py-2"
        >
          <span className="material-icons-round text-sm">today</span>
          اليوم
        </Button>
        <div className="hidden sm:block h-8 w-[1px] bg-slate-200 dark:bg-slate-700"></div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500">من:</label>
            <input
              type="date"
              className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg py-2 px-2 sm:px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 w-[130px] sm:w-auto"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500">إلى:</label>
            <input
              type="date"
              className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg py-2 px-2 sm:px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20 w-[130px] sm:w-auto"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={handleFetchRange} className="text-xs py-2">
            {reportsLoading ? (
              <span className="material-icons-round animate-spin text-sm">refresh</span>
            ) : (
              <span className="material-icons-round text-sm">search</span>
            )}
            عرض
          </Button>
        </div>
      </div>

      {/* Reports Table */}
      <Card className="!p-0 border-none overflow-hidden shadow-xl shadow-slate-200/50">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">التاريخ</th>
                <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">خط الإنتاج</th>
                <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">المنتج</th>
                <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-[0.15em]">المشرف</th>
                <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الكمية المنتجة</th>
                <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">الهالك</th>
                <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">عمال</th>
                <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">ساعات</th>
                {canViewCosts && (
                  <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-center">تكلفة الوحدة</th>
                )}
                <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {displayedReports.length === 0 && (
                <tr>
                  <td colSpan={canViewCosts ? 10 : 9} className="px-6 py-16 text-center text-slate-400">
                    <span className="material-icons-round text-5xl mb-3 block opacity-30">bar_chart</span>
                    <p className="font-bold text-lg">لا توجد تقارير{viewMode === 'today' ? ' لهذا اليوم' : ' في هذه الفترة'}</p>
                    <p className="text-sm mt-1">
                      {can("reports.create")
                        ? 'اضغط "إنشاء تقرير" لإضافة تقرير جديد'
                        : 'لا توجد تقارير لعرضها حالياً'}
                    </p>
                  </td>
                </tr>
              )}
              {displayedReports.map((report) => (
                <tr key={report.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-5 py-4 text-sm font-bold text-slate-700 dark:text-slate-300">{report.date}</td>
                  <td className="px-5 py-4 text-sm font-medium">{getLineName(report.lineId)}</td>
                  <td className="px-5 py-4 text-sm font-medium">{getProductName(report.productId)}</td>
                  <td className="px-5 py-4 text-sm font-medium">{getSupervisorName(report.supervisorId)}</td>
                  <td className="px-5 py-4 text-center">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 text-sm font-black ring-1 ring-emerald-500/20">
                      {formatNumber(report.quantityProduced)}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center text-rose-500 font-bold text-sm">{formatNumber(report.quantityWaste)}</td>
                  <td className="px-5 py-4 text-center text-sm font-bold">{report.workersCount}</td>
                  <td className="px-5 py-4 text-center text-sm font-bold">{report.workHours}</td>
                  {canViewCosts && (
                    <td className="px-5 py-4 text-center">
                      {report.id && reportCosts.get(report.id) ? (
                        <span className="text-sm font-black text-primary">{formatCost(reportCosts.get(report.id)!)} ج.م</span>
                      ) : (
                        <span className="text-sm text-slate-300">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-5 py-4 text-left">
                    <div className="flex items-center gap-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      {can("print") && (
                        <>
                          <button
                            onClick={() => triggerSingleShare(report)}
                            className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 rounded-lg transition-all"
                            title="مشاركة عبر واتساب"
                            disabled={exporting}
                          >
                            <span className="material-icons-round text-lg">share</span>
                          </button>
                          <button
                            onClick={() => triggerSinglePrint(report)}
                            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                            title="طباعة التقرير"
                          >
                            <span className="material-icons-round text-lg">print</span>
                          </button>
                        </>
                      )}
                      {can("reports.edit") && (
                        <button
                          onClick={() => openEdit(report)}
                          className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                          title="تعديل التقرير"
                        >
                          <span className="material-icons-round text-lg">edit</span>
                        </button>
                      )}
                      {can("reports.delete") && (
                        <button
                          onClick={() => setDeleteConfirmId(report.id!)}
                          className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-lg transition-all"
                          title="حذف التقرير"
                        >
                          <span className="material-icons-round text-lg">delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-sm text-slate-500 font-bold">إجمالي <span className="text-primary">{displayedReports.length}</span> تقرير</span>
          {displayedReports.length > 0 && (
            <div className="flex items-center gap-4 text-xs font-bold">
              <span className="text-emerald-600">
                إنتاج: {formatNumber(displayedReports.reduce((s, r) => s + r.quantityProduced, 0))}
              </span>
              <span className="text-rose-500">
                هالك: {formatNumber(displayedReports.reduce((s, r) => s + r.quantityWaste, 0))}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* ══ Hidden print components (off-screen, only rendered for print) ══ */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <ProductionReportPrint
          ref={bulkPrintRef}
          title={viewMode === 'today' ? `تقارير إنتاج اليوم — ${getTodayDateString()}` : `تقارير الإنتاج — ${startDate} إلى ${endDate}`}
          subtitle={`${printRows.length} تقرير`}
          rows={printRows}
          totals={printTotals}
        />
        <SingleReportPrint ref={singlePrintRef} report={printReport} />
      </div>

      {/* ══ Create / Edit Report Modal ══ */}
      {showModal && (can("reports.create") || can("reports.edit")) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowModal(false); setEditId(null); }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editId ? 'تعديل تقرير إنتاج' : 'إنشاء تقرير إنتاج'}</h3>
              <button onClick={() => { setShowModal(false); setEditId(null); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-4 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">التاريخ *</label>
                  <input
                    type="date"
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">المشرف *</label>
                  <SearchableSelect
                    placeholder="اختر المشرف"
                    options={supervisors.map((s) => ({ value: s.id, label: s.name }))}
                    value={form.supervisorId}
                    onChange={(v) => setForm({ ...form, supervisorId: v })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">خط الإنتاج *</label>
                  <SearchableSelect
                    placeholder="اختر الخط"
                    options={_rawLines.map((l) => ({ value: l.id!, label: l.name }))}
                    value={form.lineId}
                    onChange={(v) => setForm({ ...form, lineId: v })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">المنتج *</label>
                  <SearchableSelect
                    placeholder="اختر المنتج"
                    options={_rawProducts.map((p) => ({ value: p.id!, label: p.name }))}
                    value={form.productId}
                    onChange={(v) => setForm({ ...form, productId: v })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الكمية المنتجة *</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.quantityProduced || ''}
                    onChange={(e) => setForm({ ...form, quantityProduced: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الهالك</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.quantityWaste || ''}
                    onChange={(e) => setForm({ ...form, quantityWaste: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">عدد العمال *</label>
                  <input
                    type="number"
                    min={1}
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.workersCount || ''}
                    onChange={(e) => setForm({ ...form, workersCount: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">ساعات العمل *</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.workHours || ''}
                    onChange={(e) => setForm({ ...form, workHours: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>
              </div>
            </div>
            {canViewCosts && form.workersCount > 0 && form.workHours > 0 && form.quantityProduced > 0 && form.lineId && (
              (() => {
                const est = estimateReportCost(
                  form.workersCount, form.workHours, form.quantityProduced,
                  laborSettings?.hourlyRate ?? 0, form.lineId,
                  costCenters, costCenterValues, costAllocations
                );
                return (
                  <div className="mx-4 sm:mx-6 mb-2 bg-primary/5 border border-primary/10 rounded-xl p-4 flex flex-wrap items-center gap-4 sm:gap-6">
                    <div className="flex items-center gap-2">
                      <span className="material-icons-round text-primary text-lg">price_check</span>
                      <span className="text-xs font-bold text-slate-500">تكلفة تقديرية:</span>
                    </div>
                    <div className="flex items-center gap-4 sm:gap-6 text-xs font-bold">
                      <span className="text-slate-600 dark:text-slate-400">عمالة: <span className="text-slate-800 dark:text-white">{formatCost(est.laborCost)} ج.م</span></span>
                      <span className="text-slate-600 dark:text-slate-400">غير مباشرة: <span className="text-slate-800 dark:text-white">{formatCost(est.indirectCost)} ج.م</span></span>
                      <span className="text-primary font-black">الوحدة: {formatCost(est.costPerUnit)} ج.م</span>
                    </div>
                  </div>
                );
              })()
            )}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowModal(false); setEditId(null); }}>إلغاء</Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={saving || !form.lineId || !form.productId || !form.supervisorId || !form.quantityProduced || !form.workersCount || !form.workHours}
              >
                {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">{editId ? 'save' : 'add'}</span>
                {editId ? 'حفظ التعديلات' : 'حفظ التقرير'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Delete Confirmation ══ */}
      {deleteConfirmId && can("reports.delete") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-rose-500 text-3xl">delete_forever</span>
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد حذف التقرير</h3>
            <p className="text-sm text-slate-500 mb-6">هل أنت متأكد من حذف هذا التقرير؟</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>إلغاء</Button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2.5 rounded-lg font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/20 transition-all flex items-center gap-2"
              >
                <span className="material-icons-round text-sm">delete</span>
                نعم، احذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Import from Excel Modal ══ */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { if (!importSaving) { setShowImportModal(false); setImportResult(null); } }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="px-5 sm:px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
                  <span className="material-icons-round text-emerald-600 dark:text-emerald-400">upload_file</span>
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold">استيراد تقارير من Excel</h3>
                    <button onClick={downloadReportsTemplate} className="text-primary hover:text-primary/80 text-xs font-bold flex items-center gap-1 underline">
                      <span className="material-icons-round text-sm">download</span>
                      تحميل نموذج
                    </button>
                  </div>
                  {importResult && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {importResult.totalRows} صف — {importResult.validCount} صالح — {importResult.errorCount} خطأ
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => { if (!importSaving) { setShowImportModal(false); setImportResult(null); } }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                disabled={importSaving}
              >
                <span className="material-icons-round">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {importParsing ? (
                <div className="text-center py-12">
                  <span className="material-icons-round text-4xl text-primary animate-spin block mb-3">refresh</span>
                  <p className="font-bold text-slate-600 dark:text-slate-400">جاري قراءة الملف...</p>
                </div>
              ) : importResult && importResult.rows.length === 0 ? (
                <div className="text-center py-12">
                  <span className="material-icons-round text-5xl text-slate-300 block mb-3">warning</span>
                  <p className="font-bold text-slate-600 dark:text-slate-400">لا توجد بيانات في الملف</p>
                  <p className="text-sm text-slate-400 mt-1">تأكد أن الملف يحتوي على أعمدة: التاريخ، خط الإنتاج، المنتج، المشرف، الكمية المنتجة، الهالك، عدد العمال، ساعات العمل</p>
                  <button onClick={downloadReportsTemplate} className="text-primary hover:text-primary/80 text-sm font-bold flex items-center gap-1 underline mt-3 mx-auto">
                    <span className="material-icons-round text-sm">download</span>
                    تحميل نموذج التقارير
                  </button>
                </div>
              ) : importResult ? (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm font-bold text-blue-600 dark:text-blue-400">
                      <span className="material-icons-round text-sm">description</span>
                      {importResult.totalRows} صف
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      <span className="material-icons-round text-sm">check_circle</span>
                      {importResult.validCount} صالح للحفظ
                    </div>
                    {importResult.errorCount > 0 && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 dark:bg-rose-900/20 rounded-lg text-sm font-bold text-rose-500">
                        <span className="material-icons-round text-sm">error</span>
                        {importResult.errorCount} يحتاج تعديل
                      </div>
                    )}
                  </div>

                  {/* Preview Table */}
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-right border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500">#</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500">الحالة</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500">التاريخ</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500">خط الإنتاج</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500">المنتج</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500">المشرف</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500 text-center">الكمية</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500 text-center">الهالك</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500 text-center">عمال</th>
                          <th className="px-3 py-2.5 text-xs font-black text-slate-500 text-center">ساعات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {importResult.rows.map((row) => {
                          const isValid = row.errors.length === 0;
                          return (
                            <tr key={row.rowIndex} className={isValid ? '' : 'bg-rose-50/50 dark:bg-rose-900/5'}>
                              <td className="px-3 py-2 text-slate-400 font-mono text-xs">{row.rowIndex}</td>
                              <td className="px-3 py-2">
                                {isValid ? (
                                  <span className="material-icons-round text-emerald-500 text-sm">check_circle</span>
                                ) : (
                                  <span className="material-icons-round text-rose-500 text-sm" title={row.errors.join('\n')}>error</span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-medium">{row.date}</td>
                              <td className={`px-3 py-2 ${row.lineId ? '' : 'text-rose-500'}`}>{row.lineName || '—'}</td>
                              <td className={`px-3 py-2 ${row.productId ? '' : 'text-rose-500'}`}>{row.productName || '—'}</td>
                              <td className={`px-3 py-2 ${row.supervisorId ? '' : 'text-rose-500'}`}>{row.supervisorName || '—'}</td>
                              <td className="px-3 py-2 text-center font-bold">{row.quantityProduced}</td>
                              <td className="px-3 py-2 text-center text-rose-500">{row.quantityWaste}</td>
                              <td className="px-3 py-2 text-center">{row.workersCount}</td>
                              <td className="px-3 py-2 text-center">{row.workHours}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Error details */}
                  {importResult.errorCount > 0 && (
                    <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-xl p-4">
                      <p className="text-sm font-bold text-rose-600 dark:text-rose-400 mb-2">
                        <span className="material-icons-round text-sm align-middle ml-1">info</span>
                        الصفوف التالية تحتاج تعديل ولن يتم حفظها:
                      </p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {importResult.rows.filter((r) => r.errors.length > 0).map((row) => (
                          <p key={row.rowIndex} className="text-xs text-rose-600 dark:text-rose-400">
                            صف {row.rowIndex}: {row.errors.join(' · ')}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            {importResult && importResult.validCount > 0 && (
              <div className="px-5 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
                {importSaving ? (
                  <div className="flex items-center gap-3 flex-1">
                    <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${importProgress.total > 0 ? (importProgress.done / importProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-primary shrink-0">
                      {importProgress.done}/{importProgress.total}
                    </span>
                  </div>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => { setShowImportModal(false); setImportResult(null); }}>إلغاء</Button>
                    <Button variant="primary" onClick={handleImportSave}>
                      <span className="material-icons-round text-sm">save</span>
                      حفظ {importResult.validCount} تقرير
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
