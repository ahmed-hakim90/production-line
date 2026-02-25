import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useReactToPrint } from 'react-to-print';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Button, SearchableSelect } from '../components/UI';
import { usePermission } from '../../../utils/permissions';
import { exportToPDF, shareToWhatsApp, ShareResult } from '../../../utils/reportExport';
import { lineAssignmentService } from '../../../services/lineAssignmentService';
import { formatNumber } from '../../../utils/calculations';
import type { LineWorkerAssignment } from '../../../types';
import {
  SingleReportPrint,
  ReportPrintRow,
} from '../components/ProductionReportPrint';

export const QuickAction: React.FC = () => {
  const { canCreateReport } = usePermission();
  const createReport = useAppStore((s) => s.createReport);
  const _rawLines = useAppStore((s) => s._rawLines);
  const _rawProducts = useAppStore((s) => s._rawProducts);
  const employees = useAppStore((s) => s.employees);
  const printTemplate = useAppStore((s) => s.systemSettings.printTemplate);

  const [employeeId, setEmployeeId] = useState('');
  const [lineId, setLineId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [waste, setWaste] = useState('');
  const [workers, setWorkers] = useState('');
  const [hours, setHours] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [printReport, setPrintReport] = useState<ReportPrintRow | null>(null);
  const [lineWorkers, setLineWorkers] = useState<LineWorkerAssignment[]>([]);
  const [showLineWorkers, setShowLineWorkers] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!lineId) { setLineWorkers([]); return; }
    lineAssignmentService.getByLineAndDate(lineId, today).then((list) => {
      setLineWorkers(list);
      if (list.length > 0) setWorkers(String(list.length));
    }).catch(() => {});
  }, [lineId, today]);

  const getLineName = useCallback(
    (id: string) => _rawLines.find((l) => l.id === id)?.name ?? '—',
    [_rawLines]
  );
  const getProductName = useCallback(
    (id: string) => _rawProducts.find((p) => p.id === id)?.name ?? '—',
    [_rawProducts]
  );
  const getEmployeeName = useCallback(
    (id: string) => employees.find((s) => s.id === id)?.name ?? '—',
    [employees]
  );

  const handleSave = async () => {
    if (!lineId || !productId || !employeeId || !quantity || !workers || !hours) return;
    setSaving(true);

    const data = {
      employeeId,
      lineId,
      productId,
      date: today,
      quantityProduced: Number(quantity),
      quantityWaste: Number(waste) || 0,
      workersCount: Number(workers),
      workHours: Number(hours),
      notes: notes.trim(),
    };

    const id = await createReport(data);

    if (id) {
      const row: ReportPrintRow = {
        date: today,
        lineName: getLineName(lineId),
        productName: getProductName(productId),
        employeeName: getEmployeeName(employeeId),
        quantityProduced: data.quantityProduced,
        quantityWaste: data.quantityWaste,
        workersCount: data.workersCount,
        workHours: data.workHours,
        notes: data.notes,
      };
      setPrintReport(row);
      setSaved(true);
    }
    setSaving(false);
  };

  const handleReset = () => {
    setEmployeeId('');
    setLineId('');
    setProductId('');
    setQuantity('');
    setWaste('');
    setWorkers('');
    setHours('');
    setNotes('');
    setSaved(false);
    setPrintReport(null);
  };

  const handlePrint = useReactToPrint({ contentRef: printRef });

  const handleExportPDF = async () => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      await exportToPDF(printRef.current, `تقرير-سريع-${today}`, {
        paperSize: printTemplate?.paperSize,
        orientation: printTemplate?.orientation,
        copies: printTemplate?.copies,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportImage = async () => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `تقرير-سريع-${today}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      setExporting(false);
    }
  };

  const showShareFeedback = (result: ShareResult) => {
    if (result.method === 'native_share' || result.method === 'cancelled') return;
    const msg = result.copied
      ? 'تم تحميل الصورة ونسخها — افتح المحادثة والصق الصورة (Ctrl+V)'
      : 'تم تحميل صورة التقرير — أرفقها في محادثة واتساب';
    setShareToast(msg);
    setTimeout(() => setShareToast(null), 6000);
  };

  const handleShareWhatsApp = async () => {
    if (!printRef.current) return;
    setExporting(true);
    try {
      const result = await shareToWhatsApp(
        printRef.current,
        `تقرير إنتاج - ${getLineName(lineId)} - ${today}`
      );
      showShareFeedback(result);
    } finally {
      setExporting(false);
    }
  };

  const workOrders = useAppStore((s) => s.workOrders);
  const { can } = usePermission();
  const activeEmployees = employees.filter((s) => s.isActive && s.level === 2);
  const activeWOs = useMemo(
    () => workOrders.filter((w) => w.status === 'pending' || w.status === 'in_progress'),
    [workOrders],
  );

  const handleSelectWO = useCallback((woId: string) => {
    const wo = activeWOs.find((w) => w.id === woId);
    if (!wo) return;
    setLineId(wo.lineId);
    setProductId(wo.productId);
    setEmployeeId(wo.supervisorId);
  }, [activeWOs]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">إدخال سريع</h2>
        <p className="text-sm text-slate-500 font-medium">إدخال بيانات الإنتاج بسرعة — حفظ، طباعة، ومشاركة.</p>
      </div>

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

      {!saved ? (
        <Card title="بيانات التقرير">
          {/* Work Order Selector */}
          {can('workOrders.view') && activeWOs.length > 0 && (
            <div className="mb-5">
              <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-1">
                <span className="material-icons-round text-sm text-primary">assignment</span>
                أمر شغل (اختياري)
              </label>
              <select
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary"
                value=""
                onChange={(e) => handleSelectWO(e.target.value)}
              >
                <option value="">اختر أمر شغل لتعبئة البيانات تلقائياً</option>
                {activeWOs.map((wo) => {
                  const pName = _rawProducts.find((p) => p.id === wo.productId)?.name ?? '';
                  const lName = _rawLines.find((l) => l.id === wo.lineId)?.name ?? '';
                  const remaining = wo.quantity - (wo.producedQuantity || 0);
                  return (
                    <option key={wo.id} value={wo.id!}>
                      {wo.workOrderNumber} — {pName} — {lName} — متبقي: {formatNumber(remaining)} وحدة
                    </option>
                  );
                })}
              </select>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2 block">المشرف *</label>
              <SearchableSelect
                placeholder="اختر المشرف"
                options={activeEmployees.map((s) => ({ value: s.id, label: s.name }))}
                value={employeeId}
                onChange={setEmployeeId}
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2 block">خط الإنتاج *</label>
              <SearchableSelect
                placeholder="اختر الخط"
                options={_rawLines.map((l) => ({ value: l.id!, label: l.name }))}
                value={lineId}
                onChange={setLineId}
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2 block">المنتج *</label>
              <SearchableSelect
                placeholder="اختر المنتج"
                options={_rawProducts.map((p) => ({ value: p.id!, label: p.name }))}
                value={productId}
                onChange={setProductId}
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2 block">الكمية المنتجة *</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="0"
                min="0"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2 block">الهالك</label>
              <input
                type="number"
                value={waste}
                onChange={(e) => setWaste(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="0"
                min="0"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2 block">عدد العمال *</label>
              <input
                type="number"
                value={workers}
                onChange={(e) => setWorkers(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="0"
                min="1"
              />
              {lineWorkers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowLineWorkers(true)}
                  className="mt-1.5 text-xs text-primary font-bold hover:underline flex items-center gap-1"
                >
                  <span className="material-icons-round text-xs">groups</span>
                  تم جلب {lineWorkers.length} عامل مسجل — اضغط للعرض
                </button>
              )}
            </div>
            <div>
              <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2 block">ساعات العمل *</label>
              <input
                type="number"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary"
                placeholder="0"
                min="0"
                step="0.5"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-2 block">ملحوظة</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
                placeholder="اكتب أي ملحوظة إضافية للتقرير..."
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
            <Button
              onClick={handleSave}
              disabled={saving || !lineId || !productId || !employeeId || !quantity || !workers || !hours || !canCreateReport}
            >
              {saving ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  جاري الحفظ...
                </>
              ) : (
                <>
                  <span className="material-icons-round text-lg">save</span>
                  حفظ
                </>
              )}
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <span className="material-icons-round text-lg">refresh</span>
              مسح
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Success Banner */}
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl px-5 py-4 flex items-center gap-3">
            <span className="material-icons-round text-emerald-500 text-2xl">check_circle</span>
            <div>
              <p className="font-bold text-emerald-700 dark:text-emerald-400">تم حفظ التقرير بنجاح!</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-500">يمكنك الآن الطباعة أو التصدير أو المشاركة.</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => handlePrint()}>
              <span className="material-icons-round text-lg">print</span>
              طباعة
            </Button>
            <Button variant="secondary" disabled={exporting} onClick={handleExportPDF}>
              {exporting ? (
                <span className="material-icons-round animate-spin text-sm">refresh</span>
              ) : (
                <span className="material-icons-round text-lg">picture_as_pdf</span>
              )}
              تصدير PDF
            </Button>
            <Button variant="secondary" disabled={exporting} onClick={handleExportImage}>
              <span className="material-icons-round text-lg">image</span>
              تصدير كصورة
            </Button>
            <Button variant="outline" disabled={exporting} onClick={handleShareWhatsApp}>
              <span className="material-icons-round text-lg">share</span>
              مشاركة عبر WhatsApp
            </Button>
            <Button variant="outline" onClick={handleReset}>
              <span className="material-icons-round text-lg">add</span>
              تقرير جديد
            </Button>
          </div>

          {/* Preview (visible on screen) */}
          {printReport && (
            <Card className="!p-0 overflow-hidden">
              <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                <span className="material-icons-round text-sm text-slate-400">visibility</span>
                <span className="text-xs font-bold text-slate-500">معاينة التقرير</span>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-3 text-center border border-blue-100 dark:border-blue-900/20">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">خط الإنتاج</p>
                    <p className="text-sm font-black text-blue-600 dark:text-blue-400">{printReport.lineName}</p>
                  </div>
                  <div className="bg-violet-50 dark:bg-violet-900/10 rounded-xl p-3 text-center border border-violet-100 dark:border-violet-900/20">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">المنتج</p>
                    <p className="text-sm font-black text-violet-600 dark:text-violet-400">{printReport.productName}</p>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-3 text-center border border-emerald-100 dark:border-emerald-900/20">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">الكمية المنتجة</p>
                    <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{printReport.quantityProduced}</p>
                  </div>
                  <div className="bg-rose-50 dark:bg-rose-900/10 rounded-xl p-3 text-center border border-rose-100 dark:border-rose-900/20">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">الهالك</p>
                    <p className="text-sm font-black text-rose-500">{printReport.quantityWaste}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center border border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">الموظف</p>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{printReport.employeeName}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center border border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">عدد العمال</p>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{printReport.workersCount}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center border border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">ساعات العمل</p>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{printReport.workHours}</p>
                  </div>
                </div>
                {printReport.notes?.trim() && (
                  <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3 border border-amber-100 dark:border-amber-900/20">
                    <p className="text-[10px] font-bold text-slate-400 mb-1">ملحوظة</p>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{printReport.notes}</p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Line Workers Modal */}
      {showLineWorkers && lineWorkers.length > 0 && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowLineWorkers(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] border border-slate-200 dark:border-slate-800 flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-primary">groups</span>
                <h3 className="font-bold">عمالة {getLineName(lineId)} اليوم</h3>
                <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-bold rounded-lg">{lineWorkers.length}</span>
              </div>
              <button onClick={() => setShowLineWorkers(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-4 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800">
              {lineWorkers.map((w, i) => (
                <div key={w.id || i} className="flex items-center gap-3 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-primary text-sm">person</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-slate-800 dark:text-white truncate">{w.employeeName}</p>
                    <p className="text-xs text-slate-400 font-mono">{w.employeeCode}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hidden print component */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <SingleReportPrint ref={printRef} report={printReport} printSettings={printTemplate} />
      </div>
    </div>
  );
};
