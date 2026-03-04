import React, { useMemo, useRef, useState } from 'react';
import { Button } from '../../../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { ImportResult, parseExcelFile, toReportData } from '../../../utils/importExcel';
import { downloadReportsTemplate } from '../../../utils/downloadTemplates';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { getReportDuplicateMessage, isReportDuplicateError } from '../../../modules/production/utils/reportDuplicateError';

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
  const futureDateErrorRowsCount = useMemo(
    () =>
      (result?.rows || []).filter((row) =>
        row.errors.some((error) => error.includes('تاريخ مستقبلي غير مسموح'))
      ).length,
    [result],
  );
  const futureDateErrorRowIndexes = useMemo(
    () =>
      (result?.rows || [])
        .filter((row) => row.errors.some((error) => error.includes('تاريخ مستقبلي غير مسموح')))
        .map((row) => row.rowIndex),
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
      if (parsed.rows.length === 0) {
        setMessage('لا توجد بيانات صالحة داخل الملف');
      } else {
        const futureRows = parsed.rows
          .filter((row) => row.errors.some((error) => error.includes('تاريخ مستقبلي غير مسموح')))
          .map((row) => row.rowIndex);
        const hasFutureDates = futureRows.length > 0;
        if (hasFutureDates) {
          setMessage(
            `يوجد صفوف بتاريخ مستقبلي (${futureRows.join('، ')}). تم إلغاء حفظ الشيت بالكامل.`
          );
        }
      }
    } catch {
      setMessage('تعذر قراءة الملف');
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (futureDateErrorRowsCount > 0) {
      setMessage(
        `لا يمكن الحفظ: الصفوف (${futureDateErrorRowIndexes.join('، ')}) تحتوي على تاريخ مستقبلي. عدل التاريخ ثم أعد الرفع.`
      );
      return;
    }
    if (validRows.length === 0) return;
    setSaving(true);
    setMessage(null);
    setProgress({ done: 0, total: validRows.length });

    let done = 0;
    let failed = 0;
    let duplicate = 0;
    for (const row of validRows) {
      try {
        const created = await createReport(toReportData(row));
        if (!created) {
          const storeErr = useAppStore.getState().error;
          if (isReportDuplicateError(storeErr)) duplicate += 1;
          failed += 1;
        }
      } catch (error) {
        if (isReportDuplicateError(error)) duplicate += 1;
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
      const failedMsg =
        duplicate > 0
          ? `تم استيراد ${done - failed} تقرير وفشل ${failed} (${duplicate} مكرر).`
          : `تم استيراد ${done - failed} تقرير وفشل ${failed}.`;
      setMessage(getReportDuplicateMessage(null, failedMsg));
    }
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[95vw] max-w-3xl border border-[var(--color-border)] max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 sm:px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-[var(--border-radius-base)] flex items-center justify-center">
              <span className="material-icons-round text-emerald-600">upload_file</span>
            </div>
            <div>
              <h3 className="text-lg font-bold">استيراد تقارير من Excel</h3>
              {result && (
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {result.totalRows} صف — {result.validCount} صالح — {result.errorCount} خطأ
                </p>
              )}
            </div>
          </div>
          <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
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
              <div className="rounded-[var(--border-radius-base)] bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-blue-700 dark:text-blue-300">إجمالي: {result.totalRows}</div>
              <div className="rounded-[var(--border-radius-base)] bg-emerald-50 px-3 py-2 text-emerald-700">صالح: {result.validCount}</div>
              <div className="rounded-[var(--border-radius-base)] bg-rose-50 px-3 py-2 text-rose-700">أخطاء: {result.errorCount}</div>
              <div className="rounded-[var(--border-radius-base)] bg-orange-50 dark:bg-orange-900/20 px-3 py-2 text-orange-700 dark:text-orange-300">مكرر: {result.duplicateCount}</div>
            </div>
          )}

          {saving && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-[#f0f2f5] rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
              <span className="text-sm font-bold text-primary shrink-0">{progress.done}/{progress.total}</span>
            </div>
          )}

          {message && (
            <div className="rounded-[var(--border-radius-base)] border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs font-bold text-amber-700">
              {message}
            </div>
          )}
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={handleClose} disabled={saving}>إغلاق</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || validRows.length === 0 || futureDateErrorRowsCount > 0}
          >
            {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
            <span className="material-icons-round text-sm">save</span>
            حفظ {validRows.length} تقرير
          </Button>
        </div>
      </div>
    </div>
  );
};

