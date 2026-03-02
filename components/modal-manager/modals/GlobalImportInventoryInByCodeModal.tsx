import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, SearchableSelect } from '../../../modules/inventory/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { warehouseService } from '../../../modules/inventory/services/warehouseService';
import { stockService } from '../../../modules/inventory/services/stockService';
import type { Warehouse } from '../../../modules/inventory/types';
import { parseInventoryInByCodeExcel, type InventoryInImportResult } from '../../../utils/importInventoryInByCode';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';

type ImportInByCodePayload = {
  warehouseId?: string;
  onSaved?: () => void;
};

const asImportPayload = (payload: Record<string, unknown> | undefined): ImportInByCodePayload => {
  if (!payload) return {};
  const next: ImportInByCodePayload = {};
  if (typeof payload.warehouseId === 'string') next.warehouseId = payload.warehouseId;
  if (typeof payload.onSaved === 'function') next.onSaved = payload.onSaved as () => void;
  return next;
};

export const GlobalImportInventoryInByCodeModal: React.FC = () => {
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.INVENTORY_IMPORT_IN_BY_CODE);
  const products = useAppStore((s) => s._rawProducts);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [importParsing, setImportParsing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importResult, setImportResult] = useState<InventoryInImportResult | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedPayload = useMemo(() => asImportPayload(payload), [payload]);

  useEffect(() => {
    if (!isOpen) return;
    const nextWarehouseId = parsedPayload.warehouseId || '';
    setWarehouseId(nextWarehouseId);
    setImportFileName('');
    setImportResult(null);
    setMessage(null);
    void (async () => {
      const rows = await warehouseService.getAll();
      setWarehouses(rows.filter((w) => w.isActive !== false));
    })();
  }, [isOpen, parsedPayload.warehouseId]);

  const warehouseSelectOptions = useMemo(
    () =>
      warehouses.map((w) => ({
        value: w.id || '',
        label: `${w.name} (${w.code})`,
      })),
    [warehouses],
  );

  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === warehouseId) || null,
    [warehouses, warehouseId],
  );

  if (!isOpen) return null;

  const handleClose = () => {
    if (importSaving) return;
    close();
  };

  const openImportFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleImportFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportFileName(file.name);
    setImportParsing(true);
    setImportResult(null);
    setMessage(null);
    try {
      const result = await parseInventoryInByCodeExcel(file, products);
      setImportResult(result);
    } catch (error: any) {
      setImportResult({ rows: [], totalRows: 0, validCount: 0, errorCount: 0 });
      setMessage({ type: 'error', text: error?.message || 'تعذر قراءة ملف الاستيراد.' });
    } finally {
      setImportParsing(false);
    }
  };

  const handleImportSave = async () => {
    if (!importResult) return;
    if (!warehouseId) {
      setMessage({ type: 'error', text: 'اختر المخزن أولاً قبل حفظ الاستيراد.' });
      return;
    }
    const validRows = importResult.rows.filter((row) => row.errors.length === 0);
    if (validRows.length === 0) {
      setMessage({ type: 'error', text: 'لا توجد صفوف صالحة للحفظ.' });
      return;
    }
    setImportSaving(true);
    setMessage(null);
    try {
      const actor = userDisplayName || 'Current User';
      const baseRef = `IM-${Date.now()}`;
      // Merge duplicate product rows to reduce Firestore document hot-spot reads/writes.
      type MergedImportRow = {
        productId: string;
        productCode: string;
        productName: string;
        quantity: number;
        count: number;
      };
      const mergedByProductId: Record<string, MergedImportRow> = {};
      for (const row of validRows) {
        const existing = mergedByProductId[row.productId];
        if (existing) {
          existing.quantity += Number(row.quantity || 0);
          existing.count += 1;
          continue;
        }
        mergedByProductId[row.productId] = {
          productId: row.productId,
          productCode: row.productCode,
          productName: row.productName,
          quantity: Number(row.quantity || 0),
          count: 1,
        };
      }
      const mergedRows: MergedImportRow[] = Object.values(mergedByProductId);

      for (let i = 0; i < mergedRows.length; i++) {
        const row = mergedRows[i];
        await stockService.createMovement({
          warehouseId,
          itemType: 'finished_good',
          itemId: row.productId,
          itemName: row.productName,
          itemCode: row.productCode,
          movementType: 'IN',
          quantity: Number(row.quantity || 0),
          referenceNo: `${baseRef}-${i + 1}`,
          note: row.count > 1
            ? `Imported from file: ${importFileName} (${row.count} rows merged)`
            : `Imported from file: ${importFileName}`,
          createdBy: actor,
        });
      }
      parsedPayload.onSaved?.();
      setImportResult(null);
      setImportFileName('');
      setMessage({
        type: 'success',
        text: `تم استيراد ${validRows.length} صف بنجاح (${mergedRows.length} حركة مخزنية).`,
      });
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'تعذر حفظ بيانات الاستيراد.' });
    } finally {
      setImportSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleImportFileSelected}
        />

        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">استيراد منتج نهائي بالكود</h3>
            <p className="text-xs text-slate-500 mt-1">{importFileName || '—'}</p>
          </div>
          {/* <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openImportFilePicker} disabled={importSaving || importParsing}>
              <span className="material-icons-round text-sm">upload_file</span>
              اختيار ملف
            </Button>
            <button onClick={handleClose} className="text-slate-400 hover:text-slate-600" disabled={importSaving}>
              <span className="material-icons-round">close</span>
            </button>
          </div> */}
        </div>

        <div className="p-6 overflow-auto flex-1 space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <p className="text-xs text-slate-500 mb-2">المخزن المستهدف</p>
            <SearchableSelect
              options={warehouseSelectOptions}
              value={warehouseId}
              onChange={(value) => setWarehouseId(value)}
              placeholder="ابحث واختر المخزن"
            />
            <p className="text-xs text-slate-500 mt-2">
              المخزن الحالي: <span className="font-bold text-slate-700 dark:text-slate-300">{selectedWarehouse?.name || 'غير محدد'}</span>
            </p>
          </div>

          {importParsing ? (
            <p className="text-sm text-slate-500">جاري تحليل الملف...</p>
          ) : !importResult ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">اختر ملف Excel للبدء في الاستيراد.</p>
              <Button variant="primary" onClick={openImportFilePicker} disabled={importSaving || importParsing}>
                <span className="material-icons-round text-sm">upload_file</span>
                اختيار ملف الاستيراد
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                  <p className="text-xs text-slate-500">إجمالي الصفوف</p>
                  <p className="text-lg font-black">{importResult.totalRows}</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-900/10 p-3">
                  <p className="text-xs text-emerald-700">صفوف صالحة</p>
                  <p className="text-lg font-black text-emerald-700">{importResult.validCount}</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 dark:bg-rose-900/10 p-3">
                  <p className="text-xs text-rose-700">صفوف بها أخطاء</p>
                  <p className="text-lg font-black text-rose-700">{importResult.errorCount}</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <th className="px-3 py-2 text-xs font-black text-slate-500">#</th>
                      <th className="px-3 py-2 text-xs font-black text-slate-500">كود المنتج</th>
                      <th className="px-3 py-2 text-xs font-black text-slate-500">اسم المنتج</th>
                      <th className="px-3 py-2 text-xs font-black text-slate-500">الكمية</th>
                      <th className="px-3 py-2 text-xs font-black text-slate-500">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {importResult.rows.map((row) => (
                      <tr key={`${row.rowIndex}-${row.productCode}`}>
                        <td className="px-3 py-2 text-sm">{row.rowIndex}</td>
                        <td className="px-3 py-2 text-sm font-bold">{row.productCode || '—'}</td>
                        <td className="px-3 py-2 text-sm">{row.productName || '—'}</td>
                        <td className="px-3 py-2 text-sm">{row.quantity || 0}</td>
                        <td className="px-3 py-2 text-sm">
                          {row.errors.length === 0 ? (
                            <span className="text-emerald-600 font-bold">صالح</span>
                          ) : (
                            <span className="text-rose-600 font-bold">{row.errors.join(' | ')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {message && (
            <div
              className={`rounded-xl px-4 py-3 text-sm font-bold ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={importSaving}>
            إغلاق
          </Button>
          <Button variant="primary" onClick={() => void handleImportSave()} disabled={importSaving || importParsing || !importResult}>
            <span className="material-icons-round text-sm">{importSaving ? 'hourglass_top' : 'save'}</span>
            حفظ الصفوف الصالحة
          </Button>
        </div>
      </div>
    </div>
  );
};

