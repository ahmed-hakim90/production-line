import React, { useMemo, useRef, useState } from 'react';
import { Button } from '../../../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { ImportResult, parseExcelFile, toReportData } from '../../../utils/importExcel';
import { downloadReportsTemplate } from '../../../utils/downloadTemplates';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';

export const GlobalImportReportsModal: React.FC = () => {
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.REPORTS_IMPORT);
  const { can } = usePermission();
  const createReport = useAppStore((s) => s.createReport);
  const products = useAppStore((s) => s._rawProducts);
  const lines = useAppStore((s) => s._rawLines);
  const employees = useAppStore((s) => s._rawEmployees);
  const reports = useAppStore((s) => s.productionReports);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [message, setMessage] = useState<string | null>(null);

  const validRows = useMemo(
    () => (result?.rows || []).filter((row) => row.errors.length === 0 && !row.isDuplicate),
    [result],
  );

  if (!isOpen) return null;
  if (!can('import')) return null;

  const handleClose = () => {
    if (saving) return;
    setResult(null);
    setMessage(null);
    setProgress({ done: 0, total: 0 });
    close();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setParsing(true);
    setMessage(null);
    try {
      const parsed = await parseExcelFile(file, {
        products,
        lines,
        employees,
        existingReports: reports,
      });
      setResult(parsed);
      if (parsed.rows.length === 0) setMessage('لا توجد بيانات صالحة داخل الملف');
    } catch {
      setMessage('تعذر قراءة الملف');
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (validRows.length === 0) return;
    setSaving(true);
    setMessage(null);
    setProgress({ done: 0, total: validRows.length });

    let done = 0;
    let failed = 0;
    for (const row of validRows) {
      try {
        await createReport(toReportData(row));
      } catch {
        failed += 1;
      } finally {
        done += 1;
        setProgress({ done, total: validRows.length });
      }
    }

    if (failed === 0) {
      setMessage(`تم استيراد ${done} تقرير بنجاح`);
      setResult(null);
    } else {
      setMessage(`تم استيراد ${done - failed} تقرير وفشل ${failed}`);
    }
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 sm:px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
              <span className="material-icons-round text-emerald-600 dark:text-emerald-400">upload_file</span>
            </div>
            <div>
              <h3 className="text-lg font-bold">استيراد تقارير من Excel</h3>
              {result && (
                <p className="text-xs text-slate-400 mt-0.5">
                  {result.totalRows} صف — {result.validCount} صالح — {result.errorCount} خطأ
                </p>
              )}
            </div>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <span className="material-icons-round">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={parsing || saving}>
              {parsing ? <span className="material-icons-round animate-spin text-sm">refresh</span> : <span className="material-icons-round text-sm">upload_file</span>}
              اختيار ملف
            </Button>
            <Button variant="outline" onClick={() => downloadReportsTemplate({ products, lines, employees })} disabled={parsing || saving}>
              <span className="material-icons-round text-sm">download</span>
              تحميل القالب
            </Button>
          </div>

          {result && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-bold">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-blue-700 dark:text-blue-300">إجمالي: {result.totalRows}</div>
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-emerald-700 dark:text-emerald-300">صالح: {result.validCount}</div>
              <div className="rounded-lg bg-rose-50 dark:bg-rose-900/20 px-3 py-2 text-rose-700 dark:text-rose-300">أخطاء: {result.errorCount}</div>
              <div className="rounded-lg bg-orange-50 dark:bg-orange-900/20 px-3 py-2 text-orange-700 dark:text-orange-300">مكرر: {result.duplicateCount}</div>
            </div>
          )}

          {saving && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
              <span className="text-sm font-bold text-primary shrink-0">{progress.done}/{progress.total}</span>
            </div>
          )}

          {message && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-900/20 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-300">
              {message}
            </div>
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={handleClose} disabled={saving}>إغلاق</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || validRows.length === 0}>
            {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
            <span className="material-icons-round text-sm">save</span>
            حفظ {validRows.length} تقرير
          </Button>
        </div>
      </div>
    </div>
  );
};

