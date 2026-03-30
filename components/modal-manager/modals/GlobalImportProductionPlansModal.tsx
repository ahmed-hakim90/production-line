import React, { useMemo, useRef, useState } from 'react';
import { FileUp, Loader2, Save, X } from 'lucide-react';
import { Button } from '../../../components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { addDaysToDate, calculateEstimatedDays } from '../../../utils/calculations';
import { parseProductionPlansExcel, type ProductionPlanImportResult } from '../../../utils/importProductionPlans';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';

export const GlobalImportProductionPlansModal: React.FC = () => {
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.PRODUCTION_PLANS_IMPORT);
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const createProductionPlan = useAppStore((s) => s.createProductionPlan);
  const products = useAppStore((s) => s._rawProducts);
  const lines = useAppStore((s) => s._rawLines);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ProductionPlanImportResult | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [message, setMessage] = useState<string | null>(null);

  const validRows = useMemo(
    () => (result?.rows || []).filter((row) => row.errors.length === 0),
    [result]
  );

  if (!isOpen) return null;
  if (!can('import') || !can('plans.create')) return null;

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
      const parsed = await parseProductionPlansExcel(file, { products, lines });
      setResult(parsed);
      if (parsed.rows.length === 0) setMessage('لا توجد بيانات صالحة داخل الملف');
    } catch {
      setMessage('تعذر قراءة ملف الاستيراد');
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (!uid) {
      setMessage('لا يمكن الاستيراد بدون مستخدم نشط');
      return;
    }
    if (validRows.length === 0) return;
    setSaving(true);
    setMessage(null);
    setProgress({ done: 0, total: validRows.length });

    let done = 0;
    let failed = 0;
    for (const row of validRows) {
      try {
        const product = products.find((p) => p.id === row.productId);
        const dailyRate = Number(product?.avgDailyProduction || 0);
        const estimatedDays = calculateEstimatedDays(row.plannedQuantity, dailyRate);
        const plannedEndDate = estimatedDays > 0 ? addDaysToDate(row.startDate, estimatedDays) : '';
        const avgDailyTarget = dailyRate > 0 ? Math.ceil(dailyRate) : 0;

        await createProductionPlan({
          productId: row.productId,
          lineId: row.lineId,
          plannedQuantity: row.plannedQuantity,
          producedQuantity: 0,
          startDate: row.startDate,
          plannedStartDate: row.startDate,
          plannedEndDate,
          estimatedDurationDays: estimatedDays,
          avgDailyTarget,
          priority: row.priority,
          estimatedCost: 0,
          actualCost: 0,
          status: 'planned',
          createdBy: uid,
        });
      } catch {
        failed += 1;
      } finally {
        done += 1;
        setProgress({ done, total: validRows.length });
      }
    }

    if (failed === 0) {
      setMessage(`تم استيراد ${done} خطة بنجاح`);
      setResult(null);
    } else {
      setMessage(`تم استيراد ${done - failed} خطة وفشل ${failed}`);
    }
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[95vw] max-w-4xl border border-[var(--color-border)] max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 sm:px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-[var(--border-radius-base)] flex items-center justify-center">
              <FileUp size={20} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold">استيراد خطط الإنتاج من Excel</h3>
              {result && (
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                  {result.totalRows} صف — {result.validCount} صالح — {result.errorCount} خطأ
                </p>
              )}
            </div>
          </div>
          <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <X size={20} />
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
              {parsing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
              اختيار ملف
            </Button>
          </div>

          {result && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-bold">
              <div className="rounded-[var(--border-radius-base)] bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-blue-700 dark:text-blue-300">إجمالي: {result.totalRows}</div>
              <div className="rounded-[var(--border-radius-base)] bg-emerald-50 px-3 py-2 text-emerald-700">صالح: {result.validCount}</div>
              <div className="rounded-[var(--border-radius-base)] bg-rose-50 px-3 py-2 text-rose-700">أخطاء: {result.errorCount}</div>
            </div>
          )}

          {result && (
            <div className="overflow-x-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
              <table className="erp-table w-full text-right border-collapse">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">#</th>
                    <th className="erp-th">المنتج</th>
                    <th className="erp-th">الخط</th>
                    <th className="erp-th">الكمية</th>
                    <th className="erp-th">تاريخ البدء</th>
                    <th className="erp-th">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {result.rows.map((row) => {
                    const productName = products.find((p) => p.id === row.productId)?.name || '—';
                    const lineName = lines.find((l) => l.id === row.lineId)?.name || '—';
                    return (
                      <tr key={`${row.rowIndex}-${row.productId}-${row.lineId}`}>
                        <td className="px-3 py-2 text-sm">{row.rowIndex}</td>
                        <td className="px-3 py-2 text-sm">{productName}</td>
                        <td className="px-3 py-2 text-sm">{lineName}</td>
                        <td className="px-3 py-2 text-sm">{row.plannedQuantity}</td>
                        <td className="px-3 py-2 text-sm">{row.startDate || '—'}</td>
                        <td className="px-3 py-2 text-sm">
                          {row.errors.length === 0 ? (
                            <span className="text-emerald-600 font-bold">صالح</span>
                          ) : (
                            <span className="text-rose-600 font-bold">{row.errors.join(' | ')}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
          <Button variant="primary" onClick={handleSave} disabled={saving || validRows.length === 0}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            <Save size={14} />
            حفظ {validRows.length} خطة
          </Button>
        </div>
      </div>
    </div>
  );
};

