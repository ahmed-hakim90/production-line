
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useAppStore } from '../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import { formatNumber, getTodayDateString } from '../utils/calculations';
import { ProductionReport } from '../types';
import { usePermission } from '../utils/permissions';
import { exportReportsByDateRange } from '../utils/exportExcel';
import { exportToPDF, shareToWhatsApp } from '../utils/reportExport';
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

  const { can } = usePermission();

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

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

  const triggerSinglePrint = useCallback(
    (report: ProductionReport) => {
      const row: ReportPrintRow = {
        date: report.date,
        lineName: getLineName(report.lineId),
        productName: getProductName(report.productId),
        supervisorName: getSupervisorName(report.supervisorId),
        quantityProduced: report.quantityProduced || 0,
        quantityWaste: report.quantityWaste || 0,
        workersCount: report.workersCount || 0,
        workHours: report.workHours || 0,
      };
      setPrintReport(row);
    },
    [getLineName, getProductName, getSupervisorName]
  );

  useEffect(() => {
    if (printReport && singlePrintRef.current) {
      const timer = setTimeout(async () => {
        try {
          await shareToWhatsApp(
            singlePrintRef.current!,
            `تقرير إنتاج - ${printReport.lineName} - ${printReport.date}`,
          );
        } catch (err) {
          console.error('Share failed:', err);
        }
        setTimeout(() => setPrintReport(null), 500);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [printReport]);

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

    // Auto-print after save
    const row: ReportPrintRow = {
      date: form.date,
      lineName: getLineName(form.lineId),
      productName: getProductName(form.productId),
      supervisorName: getSupervisorName(form.supervisorId),
      quantityProduced: form.quantityProduced || 0,
      quantityWaste: form.quantityWaste || 0,
      workersCount: form.workersCount || 0,
      workHours: form.workHours || 0,
    };
    setPrintReport(row);
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
      await shareToWhatsApp(bulkPrintRef.current, `تقارير الإنتاج ${startDate}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">تقارير الإنتاج</h2>
          <p className="text-sm text-slate-500 font-medium">إنشاء ومراجعة تقارير الإنتاج اليومية.</p>
        </div>
        <div className="flex items-center gap-2">
          {displayedReports.length > 0 && can("export") && (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  exportReportsByDateRange(displayedReports, startDate, endDate, lookups)
                }
              >
                <span className="material-icons-round text-sm">download</span>
                Excel
              </Button>
              <Button variant="outline" disabled={exporting} onClick={handlePDF}>
                {exporting ? (
                  <span className="material-icons-round animate-spin text-sm">refresh</span>
                ) : (
                  <span className="material-icons-round text-sm">picture_as_pdf</span>
                )}
                PDF
              </Button>
              <Button variant="outline" disabled={exporting} onClick={handleWhatsApp}>
                <span className="material-icons-round text-sm">share</span>
                واتساب
              </Button>
            </>
          )}
          {can("reports.create") && (
            <Button variant="primary" onClick={openCreate}>
              <span className="material-icons-round text-sm">note_add</span>
              إنشاء تقرير
            </Button>
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

      {/* Date Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap gap-4 items-center shadow-sm">
        <Button
          variant={viewMode === 'today' ? 'primary' : 'outline'}
          onClick={handleShowToday}
          className="text-xs py-2"
        >
          <span className="material-icons-round text-sm">today</span>
          اليوم
        </Button>
        <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-700"></div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500">من:</label>
            <input
              type="date"
              className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg py-2 px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-500">إلى:</label>
            <input
              type="date"
              className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg py-2 px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/20"
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
                <th className="px-5 py-4 text-xs font-black text-slate-500 uppercase tracking-[0.15em] text-left">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {displayedReports.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center text-slate-400">
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
                  <td className="px-5 py-4 text-left">
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      {can("print") && (
                        <button
                          onClick={() => triggerSinglePrint(report)}
                          className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                          title="طباعة التقرير"
                        >
                          <span className="material-icons-round text-lg">print</span>
                        </button>
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
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
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
                  <select
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.supervisorId}
                    onChange={(e) => setForm({ ...form, supervisorId: e.target.value })}
                  >
                    <option value="">اختر المشرف</option>
                    {supervisors.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">خط الإنتاج *</label>
                  <select
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.lineId}
                    onChange={(e) => setForm({ ...form, lineId: e.target.value })}
                  >
                    <option value="">اختر الخط</option>
                    {_rawLines.map((l) => (
                      <option key={l.id} value={l.id!}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">المنتج *</label>
                  <select
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={form.productId}
                    onChange={(e) => setForm({ ...form, productId: e.target.value })}
                  >
                    <option value="">اختر المنتج</option>
                    {_rawProducts.map((p) => (
                      <option key={p.id} value={p.id!}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-2 gap-4">
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
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => { setShowModal(false); setEditId(null); }}>إلغاء</Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={saving || !form.lineId || !form.productId || !form.supervisorId || !form.quantityProduced || !form.workersCount || !form.workHours}
              >
                {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">{editId ? 'save' : 'share'}</span>
                {editId ? 'حفظ ومشاركة' : 'حفظ ومشاركة'}
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
    </div>
  );
};
