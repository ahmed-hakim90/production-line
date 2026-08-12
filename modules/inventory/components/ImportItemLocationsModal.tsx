import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './UI';
import { toast } from '../../../components/Toast';
import { ModalShell } from './departmentConsumables/ModalShell';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { warehouseLocationService } from '../services/warehouseLocationService';
import { stockService } from '../services/stockService';
import { defaultItemLocationService } from '../services/defaultItemLocationService';
import type { StockItemBalance, Warehouse } from '../types';
import {
  applyItemLocationImportRows,
  catalogItemsFromWarehouseBalances,
  downloadItemLocationImportTemplate,
  parseItemLocationImportSheet,
  type ItemLocationImportResult,
} from '../lib/itemLocationImport';
import { useAppStore } from '../../../store/useAppStore';

type WarehouseOption = {
  value: string;
  label: string;
  code?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  warehouses: WarehouseOption[] | Warehouse[];
  balances: StockItemBalance[];
  initialWarehouseId?: string;
  warehouseSelectLocked?: boolean;
  canMoveStock?: boolean;
  onApplied?: () => void | Promise<void>;
};

function toOptions(warehouses: Props['warehouses']): WarehouseOption[] {
  return warehouses
    .map((row) => {
      if ('value' in row) return row;
      return {
        value: String(row.id || ''),
        label: row.name,
        code: row.code,
      };
    })
    .filter((row) => row.value);
}

export const ImportItemLocationsModal: React.FC<Props> = ({
  open,
  onClose,
  warehouses,
  balances,
  initialWarehouseId,
  warehouseSelectLocked,
  canMoveStock = true,
  onApplied,
}) => {
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const inputRef = useRef<HTMLInputElement>(null);
  const options = useMemo(() => toOptions(warehouses), [warehouses]);
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId || options[0]?.value || '');
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ItemLocationImportResult | null>(null);

  useEffect(() => {
    if (!open) return;
    const next = initialWarehouseId || options[0]?.value || '';
    setWarehouseId(next);
    setParsed(null);
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
  }, [open, initialWarehouseId, options]);

  const selected = options.find((row) => row.value === warehouseId);

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
    if (!file) return;
    if (!warehouseId) {
      toast.error('اختر المخزن أولاً. اللوكيشن لا يُحفظ بدون مخزن.');
      return;
    }
    setParsing(true);
    setLoadingLookups(true);
    setFileName(file.name);
    setParsed(null);
    try {
      const [locations, locationBalances, defaults, warehouseBalances] = await Promise.all([
        warehouseLocationService.getActiveByWarehouse(warehouseId),
        stockService.getLocationBalances({ warehouseId }),
        defaultItemLocationService.getAll(warehouseId),
        stockService.getBalances(warehouseId),
      ]);
      const items = catalogItemsFromWarehouseBalances(
        warehouseBalances.length > 0 ? warehouseBalances : balances,
        warehouseId,
      );
      const data = await file.arrayBuffer();
      const result = parseItemLocationImportSheet(data, {
        warehouseId,
        warehouseCode: selected?.code,
        warehouseName: selected?.label,
        items,
        locations,
        locationBalances,
        defaults,
        canMoveStock,
      });
      setParsed(result);
      if (result.rows.length === 0) {
        toast.error('الملف لا يحتوي على صفوف مواقع.');
      } else if (result.errorCount > 0 && result.readyCount === 0) {
        toast.error(`لا يمكن الحفظ: ${result.errorCount} صف فيه خطأ.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر قراءة الملف.');
    } finally {
      setParsing(false);
      setLoadingLookups(false);
    }
  };

  const handleApply = async () => {
    if (!parsed || !warehouseId || confirming) return;
    if (parsed.readyCount === 0) {
      toast.error('لا توجد صفوف جاهزة للحفظ.');
      return;
    }
    setConfirming(true);
    try {
      const result = await applyItemLocationImportRows({
        warehouseId,
        warehouseName: selected?.label,
        createdBy: userDisplayName || 'Current User',
        rows: parsed.rows,
      });
      if (result.failed > 0 && result.saved === 0) {
        toast.error(result.errors[0] || 'تعذر حفظ المواقع.');
        return;
      }
      if (result.failed > 0) {
        toast.warning(
          `تم حفظ ${result.saved} موقع${result.moved ? ` ونقل ${result.moved}` : ''}، وفشل ${result.failed}.`,
        );
      } else {
        toast.success(
          result.moved > 0
            ? `تم تعيين ${result.saved} موقع، ونُقل الرصيد في ${result.moved} صنف.`
            : `تم تعيين ${result.saved} موقع افتراضي.`,
        );
      }
      await onApplied?.();
      reset();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تعذر حفظ المواقع.');
    } finally {
      setConfirming(false);
    }
  };

  if (!open) return null;

  const preview = (parsed?.rows || []).slice(0, 40);

  return (
    <ModalShell
      title="رفع مواقع الأصناف"
      onClose={handleClose}
      maxWidthClassName="max-w-3xl"
      footer={(
        <>
          <Button type="button" variant="secondary" disabled={confirming} onClick={handleClose}>
            إلغاء
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={confirming || parsing || !parsed || parsed.readyCount === 0}
            onClick={() => void handleApply()}
          >
            {confirming ? 'جاري الحفظ…' : `حفظ ${parsed?.readyCount || 0} موقع`}
          </Button>
        </>
      )}
    >
      <p className="text-sm text-[var(--color-text-muted)]">
        اللوكيشن تابع لمخزن واحد. اختر المخزن ثم ارفع Excel: كود المادة + كود اللوكيشن الجديد.
        إن كان الصنف على رف آخر يُنقل رصيده تلقائياً.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-bold text-[var(--color-text-muted)]" htmlFor="item-location-warehouse">
            المخزن
          </label>
          <Select
            value={warehouseId || 'none'}
            disabled={warehouseSelectLocked || confirming}
            onValueChange={(value) => {
              setWarehouseId(value === 'none' ? '' : value);
              setParsed(null);
              setFileName('');
              if (inputRef.current) inputRef.current.value = '';
            }}
          >
            <SelectTrigger
              id="item-location-warehouse"
              className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)]"
            >
              <SelectValue placeholder="اختر المخزن" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">اختر المخزن</SelectItem>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={confirming}
            onClick={() => downloadItemLocationImportTemplate(selected?.label)}
          >
            تحميل القالب
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={confirming || parsing || !warehouseId}
            onClick={() => inputRef.current?.click()}
          >
            {parsing || loadingLookups ? 'جاري القراءة…' : 'اختيار الملف'}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(event) => {
              void handleFile(event.target.files?.[0] || null);
            }}
          />
        </div>
      </div>

      {fileName ? (
        <p className="text-xs text-[var(--color-text-muted)]">الملف: {fileName}</p>
      ) : null}

      {parsed ? (
        <div className="space-y-2">
          <p className="text-sm font-bold">
            جاهز {parsed.readyCount} · تخطي {parsed.skipCount} · أخطاء {parsed.errorCount}
          </p>
          <div className="max-h-64 overflow-auto rounded-lg border border-[var(--color-border)]">
            <table className="w-full text-xs">
              <thead className="bg-[var(--color-bg)]">
                <tr>
                  <th className="p-2 text-start">صف</th>
                  <th className="p-2 text-start">الكود</th>
                  <th className="p-2 text-start">اللوكيشن</th>
                  <th className="p-2 text-start">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={`${row.rowNo}-${row.itemCode}`} className="border-t border-[var(--color-border)]">
                    <td className="p-2 font-mono">{row.rowNo}</td>
                    <td className="p-2 font-mono">{row.itemCode || '—'}</td>
                    <td className="p-2 font-mono">{row.locationCode || '—'}</td>
                    <td className="p-2">
                      {row.status === 'error' ? (
                        <span className="text-[rgb(var(--color-danger))]">{row.error}</span>
                      ) : row.status === 'skip' ? (
                        <span className="text-[var(--color-text-muted)]">{row.note}</span>
                      ) : (
                        <span className="text-[rgb(var(--color-success))]">{row.note}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.rows.length > preview.length ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              عرض أول {preview.length} من {parsed.rows.length} صف.
            </p>
          ) : null}
        </div>
      ) : null}
    </ModalShell>
  );
};
