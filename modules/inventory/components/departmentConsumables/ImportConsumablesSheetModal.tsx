import React, { useMemo, useRef, useState } from 'react';
import { Button } from '../../components/UI';
import { toast } from '../../../../components/Toast';
import { ModalShell } from './ModalShell';
import {
  downloadDepartmentConsumablesSheetTemplate,
  parseDepartmentConsumablesSheet,
  type ConsumableSheetParseResult,
  type ParsedConsumableSheetRow,
} from '../../../../utils/importDepartmentConsumablesSheet';

type ParseContext = Parameters<typeof parseDepartmentConsumablesSheet>[1];

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (rows: ParsedConsumableSheetRow[], fileName: string) => void;
  loadParseContext: () => Promise<ParseContext>;
  confirming?: boolean;
};

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 4 }).format(Number(n || 0));

function rowStatusLabel(row: ParsedConsumableSheetRow): string {
  if (row.errors.length) return row.errors.join(' · ');
  const parts: string[] = [];
  if (row.willCreateItem) parts.push('إنشاء صنف');
  if (row.willUpdateQty) parts.push('كمية');
  if (row.willCreateItem && row.targetPrice !== null) parts.push('سعر');
  else if (row.willUpdatePrice) parts.push('سعر');
  return parts.join(' + ') || '—';
}

export const ImportConsumablesSheetModal: React.FC<Props> = ({
  open,
  onClose,
  onConfirm,
  loadParseContext,
  confirming = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ConsumableSheetParseResult | null>(null);

  const previewRows = useMemo(
    () => (result?.rows || []).slice(0, 80),
    [result],
  );

  if (!open) return null;

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
      const context = await loadParseContext();
      const parsed = await parseDepartmentConsumablesSheet(file, context);
      setResult(parsed);
      if (parsed.fileErrors.length) {
        toast.error(parsed.fileErrors[0]);
      } else if (!parsed.totalRows) {
        toast.error('لا توجد صفوف في الملف.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر قراءة الشيت.');
      setResult({
        rows: [],
        totalRows: 0,
        validCount: 0,
        errorCount: 0,
        qtyUpdateCount: 0,
        priceUpdateCount: 0,
        createCount: 0,
        fileErrors: [error instanceof Error ? error.message : 'تعذر قراءة الشيت.'],
      });
    } finally {
      setParsing(false);
    }
  };

  const validRows = (result?.rows || []).filter((r) => r.errors.length === 0);

  return (
    <ModalShell
      title="رفع شيت مستهلكات (أرصدة وأسعار)"
      onClose={handleClose}
      maxWidthClassName="max-w-5xl"
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={confirming}>
            إلغاء
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => downloadDepartmentConsumablesSheetTemplate()}
            disabled={confirming}
          >
            تحميل القالب
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!validRows.length) {
                toast.error('لا توجد صفوف صالحة للتطبيق.');
                return;
              }
              onConfirm(validRows, fileName || 'consumables-sheet.xlsx');
              reset();
            }}
            disabled={confirming || parsing || !validRows.length}
          >
            {confirming ? 'جاري الإرسال للمهام...' : `تطبيق ${validRows.length} صف عبر المهام`}
          </Button>
        </>
      )}
    >
      <p className="text-sm text-[var(--color-text-muted)]">
        ارفع شيت Excel فيه اسم أو كود الصنف والمخزن والرصيد و/أو سعر الوحدة.
        الأصناف الجديدة بدون كود تُنشأ تلقائياً بكود مولَّد، ثم يُنفَّذ التطبيق في «المهام».
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="block w-full max-w-md text-sm"
          disabled={parsing || confirming}
          onChange={(e) => void handleFile(e.target.files?.[0] || null)}
        />
        {parsing ? <span className="text-sm font-bold text-primary">جاري القراءة...</span> : null}
        {fileName ? <span className="text-xs text-[var(--color-text-muted)]">{fileName}</span> : null}
      </div>

      {result ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3 text-xs font-bold">
            <span>صفوف: {result.totalRows}</span>
            <span className="text-[rgb(var(--color-success))]">صالح: {result.validCount}</span>
            <span className="text-[rgb(var(--color-danger))]">أخطاء: {result.errorCount}</span>
            <span className="text-[rgb(var(--color-primary))]">إنشاء أصناف: {result.createCount}</span>
            <span>تحديث كمية: {result.qtyUpdateCount}</span>
            <span>تحديث سعر: {result.priceUpdateCount}</span>
          </div>
          {result.fileErrors.length > 0 ? (
            <ul className="text-sm text-[rgb(var(--color-danger))] list-disc pe-5">
              {result.fileErrors.map((err) => <li key={err}>{err}</li>)}
            </ul>
          ) : null}
          <div className="overflow-auto border border-[var(--color-border)] rounded-lg max-h-[50vh]">
            <table className="min-w-full text-xs">
              <thead className="bg-[var(--color-surface)] sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-start">#</th>
                  <th className="px-2 py-2 text-start">الصنف</th>
                  <th className="px-2 py-2 text-start">المخزن</th>
                  <th className="px-2 py-2 text-start">الرف</th>
                  <th className="px-2 py-2 text-start">رصيد حالي</th>
                  <th className="px-2 py-2 text-start">رصيد جديد</th>
                  <th className="px-2 py-2 text-start">فرق</th>
                  <th className="px-2 py-2 text-start">سعر حالي</th>
                  <th className="px-2 py-2 text-start">سعر جديد</th>
                  <th className="px-2 py-2 text-start">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row) => (
                  <tr
                    key={`${row.rowIndex}-${row.itemCode}-${row.warehouseId}-${row.locationCode}`}
                    className={row.errors.length ? 'bg-[rgb(var(--color-danger)/0.1)]' : row.willCreateItem ? 'bg-[rgb(var(--color-primary)/0.1)]' : ''}
                  >
                    <td className="px-2 py-1.5 border-t border-[var(--color-border)]">{row.rowIndex}</td>
                    <td className="px-2 py-1.5 border-t border-[var(--color-border)]">
                      <div className="font-bold">{row.itemName || '—'}</div>
                      <div className="text-[var(--color-text-muted)] font-mono">
                        {row.itemCode || '—'}
                        {row.willCreateItem ? ' (جديد)' : ''}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 border-t border-[var(--color-border)]">
                      {row.warehouseName || row.warehouseCode || '—'}
                    </td>
                    <td className="px-2 py-1.5 border-t border-[var(--color-border)]">{row.locationCode || '—'}</td>
                    <td className="px-2 py-1.5 border-t border-[var(--color-border)]">{fmt(row.currentQty)}</td>
                    <td className="px-2 py-1.5 border-t border-[var(--color-border)]">
                      {row.targetQty === null ? '—' : fmt(row.targetQty)}
                    </td>
                    <td className="px-2 py-1.5 border-t border-[var(--color-border)]">
                      {row.willUpdateQty ? fmt(row.qtyDelta) : '—'}
                    </td>
                    <td className="px-2 py-1.5 border-t border-[var(--color-border)]">{fmt(row.currentPrice)}</td>
                    <td className="px-2 py-1.5 border-t border-[var(--color-border)]">
                      {row.targetPrice === null ? '—' : fmt(row.targetPrice)}
                    </td>
                    <td className="px-2 py-1.5 border-t border-[var(--color-border)]">
                      {rowStatusLabel(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(result.rows.length || 0) > previewRows.length ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              عرض أول {previewRows.length} صف للمعاينة — سيتم تطبيق كل الصفوف الصالحة.
            </p>
          ) : null}
        </div>
      ) : null}
    </ModalShell>
  );
};
