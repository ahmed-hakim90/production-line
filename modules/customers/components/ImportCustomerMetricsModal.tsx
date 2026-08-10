import React, { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { CUSTOMER_SIZE_TIER_LABELS } from '../lib/customerSizeTier';
import {
  downloadCustomerMetricsTemplate,
  parseCustomerMetricsSheet,
  type CustomerMetricsParseResult,
  type ParsedCustomerMetricsRow,
} from '../lib/importCustomerMetricsSheet';
import type { Customer } from '../types';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (rows: ParsedCustomerMetricsRow[]) => void | Promise<void>;
  loadExistingByCode: () => Promise<Map<string, Customer>>;
  confirming?: boolean;
};

const fmt = (n: number | null | undefined) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(n);

export const ImportCustomerMetricsModal: React.FC<Props> = ({
  open,
  onClose,
  onConfirm,
  loadExistingByCode,
  confirming = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<CustomerMetricsParseResult | null>(null);

  const previewRows = useMemo(() => (result?.rows || []).slice(0, 100), [result]);

  const reset = () => {
    setParsing(false);
    setFileName('');
    setResult(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = () => {
    if (confirming) return;
    reset();
    onClose();
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setParsing(true);
    setFileName(file.name);
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const byCode = await loadExistingByCode();
      const parsed = parseCustomerMetricsSheet(buffer, byCode);
      setResult(parsed);
      if (parsed.errorCount > 0) {
        toast.warning(`تم اكتشاف ${parsed.errorCount} صفوف بها أخطاء.`);
      } else if (parsed.readyCount === 0) {
        toast.error('لا توجد صفوف صالحة في الملف.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر قراءة الملف.');
      setResult({ rows: [], readyCount: 0, errorCount: 0 });
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    const ready = (result?.rows || []).filter((r) => r.status === 'ready');
    if (ready.length === 0) {
      toast.error('لا توجد صفوف صالحة للاستيراد.');
      return;
    }
    await onConfirm(ready);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>استيراد مؤشرات العملاء</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            ارفع شيت Excel بالكود + حجم الشغل + الرصيد. يتم المطابقة على كود عميل موجود فقط.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => downloadCustomerMetricsTemplate()}>
              تنزيل القالب
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={parsing || confirming}
              onClick={() => inputRef.current?.click()}
            >
              {parsing ? 'جاري القراءة…' : 'اختيار ملف'}
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0] || null)}
            />
          </div>

          {fileName && (
            <p className="text-xs text-muted-foreground">
              الملف: {fileName}
              {result && (
                <>
                  {' · '}
                  جاهز: {result.readyCount} · أخطاء: {result.errorCount}
                </>
              )}
            </p>
          )}

          {result && result.rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="erp-table w-full text-sm">
                <thead className="erp-thead">
                  <tr>
                    <th className="erp-th">صف</th>
                    <th className="erp-th">الكود</th>
                    <th className="erp-th">الاسم (شيت)</th>
                    <th className="erp-th">العميل</th>
                    <th className="erp-th">حجم الشغل</th>
                    <th className="erp-th">التصنيف</th>
                    <th className="erp-th">الرصيد</th>
                    <th className="erp-th">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.rowNo} className={row.status === 'error' ? 'bg-[rgb(var(--color-danger)/0.1)]/60' : undefined}>
                      <td className="tabular-nums">{row.rowNo}</td>
                      <td className="tabular-nums font-medium">{row.code || '—'}</td>
                      <td>{row.name || '—'}</td>
                      <td>{row.existingName || '—'}</td>
                      <td className="tabular-nums">{fmt(row.businessVolume)}</td>
                      <td>{CUSTOMER_SIZE_TIER_LABELS[row.sizeTier]}</td>
                      <td className="tabular-nums">{fmt(row.balance)}</td>
                      <td>
                        {row.status === 'ready' ? (
                          <span className="text-[rgb(var(--color-success))]">جاهز</span>
                        ) : (
                          <span className="text-[rgb(var(--color-danger))]">{row.error || 'خطأ'}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(result.rows.length || 0) > previewRows.length && (
                <p className="p-2 text-xs text-muted-foreground">
                  عرض أول {previewRows.length} صف من أصل {result.rows.length}.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={handleClose} disabled={confirming}>
            إلغاء
          </Button>
          <Button
            type="button"
            disabled={confirming || parsing || !result || result.readyCount === 0}
            onClick={() => void handleConfirm()}
          >
            {confirming ? 'جاري الاستيراد…' : `تطبيق ${result?.readyCount || 0} صف`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
