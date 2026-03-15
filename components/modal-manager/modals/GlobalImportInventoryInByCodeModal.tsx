import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Loader2, Save } from 'lucide-react';
import { Button, SearchableSelect } from '../../../modules/inventory/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { warehouseService } from '../../../modules/inventory/services/warehouseService';
import { stockService } from '../../../modules/inventory/services/stockService';
import { rawMaterialService } from '../../../modules/inventory/services/rawMaterialService';
import type { Warehouse, RawMaterial } from '../../../modules/inventory/types';
import { parseInventoryInByCodeExcel, type InventoryInImportResult } from '../../../utils/importInventoryInByCode';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';

type ImportInByCodePayload = {
  warehouseId?: string;
  itemType?: 'finished_good' | 'raw_material';
  onSaved?: () => void;
};

const asImportPayload = (payload: Record<string, unknown> | undefined): ImportInByCodePayload => {
  if (!payload) return {};
  const next: ImportInByCodePayload = {};
  if (typeof payload.warehouseId === 'string') next.warehouseId = payload.warehouseId;
  if (payload.itemType === 'finished_good' || payload.itemType === 'raw_material') next.itemType = payload.itemType;
  if (typeof payload.onSaved === 'function') next.onSaved = payload.onSaved as () => void;
  return next;
};

export const GlobalImportInventoryInByCodeModal: React.FC = () => {
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.INVENTORY_IMPORT_IN_BY_CODE);
  const products = useAppStore((s) => s._rawProducts);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [itemType, setItemType] = useState<'finished_good' | 'raw_material'>('finished_good');
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
    setItemType(parsedPayload.itemType || 'finished_good');
    setImportFileName('');
    setImportResult(null);
    setMessage(null);
    void (async () => {
      const [warehouseRows, rawRows] = await Promise.all([
        warehouseService.getAll(),
        rawMaterialService.getAll(),
      ]);
      setWarehouses(warehouseRows.filter((w) => w.isActive !== false));
      setRawMaterials(rawRows.filter((m) => m.isActive !== false));
    })();
  }, [isOpen, parsedPayload.warehouseId, parsedPayload.itemType]);

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
  const importItems = useMemo(
    () =>
      itemType === 'raw_material'
        ? rawMaterials.map((m) => ({ id: m.id, code: m.code, name: m.name }))
        : products.map((p) => ({ id: p.id, code: p.code, name: p.name })),
    [itemType, products, rawMaterials],
  );
  const itemTypeLabel = itemType === 'raw_material' ? 'مادة خام' : 'منتج نهائي';

  if (!isOpen) return null;

  const handleClose = () => {
    if (importSaving) return;
    close();
  };

  const openImportFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleItemTypeChange = (nextType: 'finished_good' | 'raw_material') => {
    if (nextType === itemType) return;
    setItemType(nextType);
    setImportResult(null);
    setImportFileName('');
    setMessage(null);
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
      const result = await parseInventoryInByCodeExcel(file, importItems, { itemLabel: itemTypeLabel });
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
          itemType,
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
        className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[95vw] max-w-4xl border border-[var(--color-border)] max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleImportFileSelected}
        />

        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">استيراد {itemTypeLabel} بالكود</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{importFileName || '—'}</p>
          </div>
          {/* Optional header actions intentionally disabled. */}
        </div>

        <div className="p-6 overflow-auto flex-1 space-y-4">
          <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
            <p className="text-xs text-[var(--color-text-muted)] mb-2">نوع الصنف</p>
            <div className="flex items-center gap-2">
              <Button
                variant={itemType === 'finished_good' ? 'primary' : 'outline'}
                onClick={() => handleItemTypeChange('finished_good')}
                disabled={importSaving || importParsing}
              >
                منتج نهائي
              </Button>
              <Button
                variant={itemType === 'raw_material' ? 'primary' : 'outline'}
                onClick={() => handleItemTypeChange('raw_material')}
                disabled={importSaving || importParsing}
              >
                مادة خام
              </Button>
            </div>
          </div>

          <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
            <p className="text-xs text-[var(--color-text-muted)] mb-2">المخزن المستهدف</p>
            <SearchableSelect
              options={warehouseSelectOptions}
              value={warehouseId}
              onChange={(value) => setWarehouseId(value)}
              placeholder="ابحث واختر المخزن"
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-2">
              المخزن الحالي: <span className="font-bold text-[var(--color-text)]">{selectedWarehouse?.name || 'غير محدد'}</span>
            </p>
          </div>

          {importParsing ? (
            <p className="text-sm text-slate-500">جاري تحليل الملف...</p>
          ) : !importResult ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">اختر ملف Excel للبدء في استيراد {itemTypeLabel}.</p>
              <Button variant="primary" onClick={openImportFilePicker} disabled={importSaving || importParsing}>
                <FileUp size={14} />
                اختيار ملف الاستيراد
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3">
                  <p className="text-xs text-slate-500">إجمالي الصفوف</p>
                  <p className="text-lg font-black">{importResult.totalRows}</p>
                </div>
                <div className="rounded-[var(--border-radius-lg)] border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-900/10 p-3">
                  <p className="text-xs text-emerald-700">صفوف صالحة</p>
                  <p className="text-lg font-bold text-emerald-700">{importResult.validCount}</p>
                </div>
                <div className="rounded-[var(--border-radius-lg)] border border-rose-200 bg-rose-50/60 dark:bg-rose-900/10 p-3">
                  <p className="text-xs text-rose-700">صفوف بها أخطاء</p>
                  <p className="text-lg font-bold text-rose-700">{importResult.errorCount}</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-[var(--border-radius-lg)] border border-[var(--color-border)]">
                <table className="w-full text-right border-collapse">
                  <thead className="erp-thead">
                    <tr>
                      <th className="erp-th">#</th>
                      <th className="erp-th">الكود</th>
                      <th className="erp-th">اسم الصنف</th>
                      <th className="erp-th">الكمية</th>
                      <th className="erp-th">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
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
              className={`rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-bold ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleClose} disabled={importSaving}>
            إغلاق
          </Button>
          <Button variant="primary" onClick={() => void handleImportSave()} disabled={importSaving || importParsing || !importResult}>
            {importSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            حفظ الصفوف الصالحة
          </Button>
        </div>
      </div>
    </div>
  );
};

