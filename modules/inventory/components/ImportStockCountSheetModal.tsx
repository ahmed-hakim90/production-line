import React, { useMemo, useRef, useState } from 'react';
import { Button } from './UI';
import { toast } from '../../../components/Toast';
import { ModalShell } from './departmentConsumables/ModalShell';
import {
  downloadStockCountErrors,
  downloadStockCountTemplate,
  parseStockCountSheet,
  type StockCountCatalogMaterial,
  type StockCountSheetResult,
} from '../lib/stockCountSheet';
import { ensureCenterItemsForStockCount } from '../lib/ensureCenterItemsForStockCount';
import { ensureCatalogBalancesForStockCount } from '../lib/ensureCatalogBalancesForStockCount';
import { stockService } from '../services/stockService';
import type { StockItemBalance } from '../types';
import type { RepairSparePart } from '../../repair/types';
import { useAppStore } from '../../../store/useAppStore';

type Props = {
  open: boolean;
  onClose: () => void;
  warehouseId: string;
  warehouseName: string;
  balances: StockItemBalance[];
  /** Maintenance-center: allow resolving unknown codes from materials master and add them. */
  centerCreate?: {
    branchId: string;
    catalogMaterials: StockCountCatalogMaterial[];
    existingParts: RepairSparePart[];
    canManageParts: boolean;
  };
  /** Central / catalog-only: seed zero stock_items from materials master (no repair parts). */
  catalogSeed?: {
    catalogMaterials: StockCountCatalogMaterial[];
  };
  onCreated?: (sessionId: string | null) => void | Promise<void>;
  onPartsChanged?: (parts: RepairSparePart[]) => void;
};

const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 2 }).format(Number(n || 0));

export const ImportStockCountSheetModal: React.FC<Props> = ({
  open,
  onClose,
  warehouseId,
  warehouseName,
  balances,
  centerCreate,
  catalogSeed,
  onCreated,
  onPartsChanged,
}) => {
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<StockCountSheetResult | null>(null);

  const allowCreate = Boolean(centerCreate?.branchId) || Boolean(catalogSeed);
  const isOpeningMode = allowCreate;
  const isCenterMode = Boolean(centerCreate?.branchId);
  const catalogMaterials = centerCreate?.catalogMaterials || catalogSeed?.catalogMaterials || [];
  const createCount = parsed?.createCandidates.length || 0;

  const previewDiffs = useMemo(() => {
    if (!parsed) return [];
    return parsed.lines
      .filter((line) => Math.abs(Number(line.countedQty || 0) - Number(line.expectedQty || 0)) > 0.00001)
      .slice(0, 60);
  }, [parsed]);

  const createMaterialIds = useMemo(
    () => new Set((parsed?.createCandidates || []).map((row) => row.materialId)),
    [parsed],
  );

  if (!open) return null;

  const reset = () => {
    setParsing(false);
    setConfirming(false);
    setFileName('');
    setParsed(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = () => {
    if (confirming) return;
    reset();
    onClose();
  };

  const handleFile = async (file: File | null) => {
    if (!file || !warehouseId) return;
    if (balances.length === 0 && !allowCreate) {
      toast.error('لا توجد أصناف في هذا المخزن لرفع الجرد.');
      return;
    }
    setParsing(true);
    setFileName(file.name);
    setParsed(null);
    try {
      const data = await file.arrayBuffer();
      const existingPartMaterialIds = new Set(
        (centerCreate?.existingParts || [])
          .map((part) => String(part.materialId || part.rawMaterialId || '').trim())
          .filter(Boolean),
      );
      const result = parseStockCountSheet(data, balances, {
        allowCreateFromCatalog: allowCreate,
        catalogMaterials,
        // Central catalog seed: treat materials as already "parts" so needsSparePart stays false.
        existingPartMaterialIds: isCenterMode
          ? existingPartMaterialIds
          : new Set(catalogMaterials.map((m) => String(m.id || '').trim()).filter(Boolean)),
      });
      setParsed(result);
      if (result.errors.length) {
        toast.error(`تمت القراءة مع ${result.errors.length} أخطاء مانعة.`);
      } else if (result.importedRows === 0) {
        toast.error('لم يتم العثور على كميات فعلية قابلة للاستيراد.');
      } else {
        const createMsg = result.createCandidates.length
          ? isCenterMode
            ? ` · ${result.createCandidates.length} صنف جديد للمركز`
            : ` · ${result.createCandidates.length} صنف جديد للمخزن`
          : '';
        toast.success(`جاهز للتأكيد: ${result.importedRows} صنف · ${result.changedRows} فرق${createMsg}.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر قراءة ملف الجرد.');
      setParsed(null);
    } finally {
      setParsing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const confirmImport = async () => {
    if (!parsed || !warehouseId || confirming) return;
    if (parsed.errors.length || parsed.importedRows === 0) {
      toast.error('المعاينة غير قابلة للتأكيد.');
      return;
    }
    setConfirming(true);
    try {
      if (parsed.createCandidates.length > 0) {
        if (centerCreate?.branchId) {
          const seeded = await ensureCenterItemsForStockCount({
            warehouseId,
            warehouseName,
            branchId: centerCreate.branchId,
            candidates: parsed.createCandidates,
            existingParts: centerCreate.existingParts,
            createdBy: userDisplayName || 'Current User',
            canManageParts: centerCreate.canManageParts,
          });
          onPartsChanged?.(seeded.parts);
          if (seeded.createdParts > 0 || seeded.createdBalances > 0) {
            toast.success(
              `تمت تهيئة ${seeded.createdParts} قطعة و${seeded.createdBalances} رصيد صفر قبل الجرد.`,
            );
          }
        } else if (catalogSeed) {
          const seeded = await ensureCatalogBalancesForStockCount({
            warehouseId,
            candidates: parsed.createCandidates,
          });
          if (seeded.createdBalances > 0) {
            toast.success(`تمت تهيئة ${seeded.createdBalances} رصيد صفر قبل الجرد.`);
          }
        } else {
          throw new Error('لا يمكن إضافة أصناف جديدة لهذا المخزن من الملف.');
        }
      }

      const sessionId = await stockService.createCountSession({
        warehouseId,
        warehouseName,
        note: `${isOpeningMode ? 'أول مدة' : 'جرد'} مرفوع من ${fileName || 'Excel'} — ${parsed.importedRows} صنف`
          + (parsed.createCandidates.length ? ` · ${parsed.createCandidates.length} جديد` : ''),
        createdBy: userDisplayName || 'Current User',
        lines: parsed.lines,
      });
      toast.success(
        parsed.changedRows > 0
          ? `تم إنشاء جلسة الجرد · ${parsed.changedRows} فرق — افتح «جرد ومطابقة» واختر هذا المخزن ثم اعتمد.`
          : 'تم إنشاء جلسة الجرد بدون فروق.',
      );
      reset();
      onClose();
      await onCreated?.(sessionId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر إنشاء جلسة الجرد.');
    } finally {
      setConfirming(false);
    }
  };

  const canConfirm = Boolean(parsed && parsed.errors.length === 0 && parsed.importedRows > 0);
  const newLabel = isCenterMode ? 'جديد للمركز' : 'جديد للمخزن';

  return (
    <ModalShell
      title={isOpeningMode
        ? `رفع أرصدة أول المدة — ${warehouseName}`
        : `رفع جرد Excel — ${warehouseName}`}
      onClose={handleClose}
      maxWidthClassName="max-w-4xl"
      footer={(
        <>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={confirming}>
            إلغاء
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              downloadStockCountTemplate(warehouseName, balances, {
                mode: isOpeningMode ? 'opening' : 'count',
                catalogMaterials,
              })
            }
            disabled={confirming}
          >
            {isOpeningMode ? 'تنزيل قالب أول المدة' : 'تنزيل القالب'}
          </Button>
          {parsed?.errors.length ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => downloadStockCountErrors(parsed.errors)}
              disabled={confirming}
            >
              تنزيل الأخطاء
            </Button>
          ) : null}
          <Button type="button" onClick={() => void confirmImport()} disabled={!canConfirm || confirming || parsing}>
            {confirming
              ? 'جاري التهيئة وإنشاء الجلسة…'
              : createCount > 0
                ? `تأكيد · إضافة ${createCount} ثم إنشاء الجرد`
                : 'تأكيد وإنشاء جلسة الجرد'}
          </Button>
        </>
      )}
    >
      <p className="text-sm text-[var(--color-text-muted)]">
        {isOpeningMode ? (
          <>
            لأول مدة المخزن: نزّل القالب واملأ <strong>كود الصنف</strong> و<strong>الكمية الافتتاحية</strong> فقط.
            الاسم للمساعدة. الأكواد تُطابق ماستر داتا المواد
            {isCenterMode ? ' وتُضاف للمركز تلقائياً إن لم تكن موجودة' : ' وتُهيَّأ أرصدة صفرية في المخزن إن لم تكن موجودة'}.
            {' '}لا يُرحَّل الرصيد إلا بعد اعتماد جلسة الجرد.
          </>
        ) : (
          <>
            نزّل القالب، املأ عمود «الكمية الفعلية»، ثم ارفع الملف. التأكيد ينشئ جلسة جرد للمراجعة والاعتماد
            (لا يُرحَّل الرصيد إلا بعد الاعتماد).
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
          className="block w-full max-w-md text-sm"
          disabled={parsing || confirming || !warehouseId}
          aria-label={isOpeningMode ? 'رفع ملف أرصدة أول المدة' : 'رفع ملف جرد المخزن'}
          onChange={(e) => void handleFile(e.target.files?.[0] || null)}
        />
        {parsing ? <span className="text-sm font-bold text-primary">جاري القراءة…</span> : null}
        {fileName && !parsing ? (
          <span className="text-xs text-[var(--color-text-muted)]">{fileName}</span>
        ) : null}
      </div>

      {parsed ? (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-4 text-sm">
            <div className="rounded-lg border border-[var(--color-border)] p-2">
              <div className="text-xs text-[var(--color-text-muted)]">أصناف معدودة</div>
              <div className="font-bold">{parsed.importedRows}</div>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-2">
              <div className="text-xs text-[var(--color-text-muted)]">فروقات</div>
              <div className="font-bold">{parsed.changedRows}</div>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-2">
              <div className="text-xs text-[var(--color-text-muted)]">{isCenterMode ? 'جديد للمركز' : 'جديد للمخزن'}</div>
              <div className="font-bold text-[rgb(var(--color-primary))]">{createCount}</div>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-2">
              <div className="text-xs text-[var(--color-text-muted)]">أخطاء</div>
              <div className={`font-bold ${parsed.errors.length ? 'text-[rgb(var(--color-danger))]' : ''}`}>
                {parsed.errors.length}
              </div>
            </div>
          </div>

          {parsed.warnings.length > 0 ? (
            <ul className="text-xs text-[rgb(var(--color-warning))] space-y-1 list-disc list-inside">
              {parsed.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          {parsed.errors.length > 0 ? (
            <ul className="text-xs text-[rgb(var(--color-danger))] space-y-1 max-h-28 overflow-y-auto list-disc list-inside">
              {parsed.errors.slice(0, 20).map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}

          {previewDiffs.length > 0 ? (
            <div className="overflow-x-auto max-h-64 rounded-lg border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--color-surface)] sticky top-0">
                  <tr>
                    <th className="text-start p-2">الصنف</th>
                    <th className="text-start p-2">الكود</th>
                    <th className="text-start p-2">النظام</th>
                    <th className="text-start p-2">الفعلي</th>
                    <th className="text-start p-2">الفرق</th>
                    <th className="text-start p-2">ملاحظة</th>
                  </tr>
                </thead>
                <tbody>
                  {previewDiffs.map((line) => {
                    const diff = Number(line.countedQty || 0) - Number(line.expectedQty || 0);
                    const isNew = createMaterialIds.has(String(line.itemId || ''));
                    return (
                      <tr key={`${line.itemType}:${line.itemId}`} className="border-t border-[var(--color-border)]/50">
                        <td className="p-2">{line.itemName}</td>
                        <td className="p-2">{line.itemCode || '—'}</td>
                        <td className="p-2 tabular-nums">{fmt(line.expectedQty)}</td>
                        <td className="p-2 tabular-nums">{fmt(line.countedQty)}</td>
                        <td className={`p-2 tabular-nums font-bold ${diff < 0 ? 'text-[rgb(var(--color-danger))]' : 'text-[rgb(var(--color-success))]'}`}>
                          {fmt(diff)}
                        </td>
                        <td className="p-2">{isNew ? newLabel : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : parsed.importedRows > 0 && parsed.errors.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">لا فروقات بين العد والنظام.</p>
          ) : null}
        </div>
      ) : null}
    </ModalShell>
  );
};
