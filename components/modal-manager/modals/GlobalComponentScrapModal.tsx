import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Package2, Plus, Save, X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { productMaterialService } from '../../../modules/production/services/productMaterialService';
import { rawMaterialService } from '../../../modules/inventory/services/rawMaterialService';
import { stockService } from '../../../modules/inventory/services/stockService';
import { useAppStore } from '../../../store/useAppStore';
import type { ProductMaterial, ReportComponentScrapItem } from '../../../types';
import type { RawMaterial, StockItemBalance } from '../../../modules/inventory/types';
import { formatNumber } from '../../../utils/calculations';

type ModalPayload = {
  productId?: string;
  items?: ReportComponentScrapItem[];
  onSave?: (items: ReportComponentScrapItem[]) => void;
};

type MaterialOption = {
  materialId: string;
  materialName: string;
  quantityUsed: number;
  unitCost: number;
  balanceInDecomposed: number;
};

const normalizeText = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');

export const GlobalComponentScrapModal: React.FC = () => {
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.REPORTS_COMPONENT_SCRAP);
  const settings = useAppStore((s) => s.systemSettings.planSettings);
  const [options, setOptions] = useState<MaterialOption[]>([]);
  const [rows, setRows] = useState<ReportComponentScrapItem[]>([]);
  const [loading, setLoading] = useState(false);

  const typedPayload = (payload || {}) as ModalPayload;
  const productId = String(typedPayload.productId || '').trim();

  useEffect(() => {
    if (!isOpen) return;
    const initialItems = Array.isArray(typedPayload.items) ? typedPayload.items : [];
    setRows(
      initialItems
        .filter((item) => item && item.materialId && Number(item.quantity || 0) > 0)
        .map((item) => ({
          materialId: String(item.materialId),
          materialName: String(item.materialName || ''),
          quantity: Number(item.quantity || 0),
        })),
    );
  }, [isOpen, typedPayload.items]);

  useEffect(() => {
    if (!isOpen || !productId) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const decomposedWarehouseId = String(settings?.decomposedSourceWarehouseId || '').trim();
        const [linkedMaterials, rawMaterials, balances] = await Promise.all([
          productMaterialService.getByProduct(productId),
          rawMaterialService.getAll(),
          stockService.getBalances(),
        ]);
        if (cancelled) return;
        setOptions(resolveMaterialOptions(linkedMaterials, rawMaterials, balances, decomposedWarehouseId));
      } catch {
        if (cancelled) return;
        setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, productId, settings?.decomposedSourceWarehouseId]);

  const hasDuplicate = useMemo(() => {
    const ids = rows.map((row) => row.materialId).filter(Boolean);
    return new Set(ids).size !== ids.length;
  }, [rows]);

  if (!isOpen) return null;

  const addRow = () => {
    const usedIds = new Set(rows.map((row) => row.materialId));
    const next = options.find((opt) => !usedIds.has(opt.materialId));
    if (!next) return;
    setRows((prev) => [...prev, { materialId: next.materialId, materialName: next.materialName, quantity: 0 }]);
  };

  const updateRow = (index: number, patch: Partial<ReportComponentScrapItem>) => {
    setRows((prev) =>
      prev.map((row, idx) =>
        idx === index
          ? { ...row, ...patch }
          : row
      ),
    );
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const hasInvalidQty = rows.some((row) => Number(row.quantity || 0) <= 0);
  const canSave = !hasDuplicate && !hasInvalidQty;

  const handleSave = () => {
    if (!canSave) return;
    typedPayload.onSave?.(
      rows.map((row) => ({
        materialId: row.materialId,
        materialName: row.materialName,
        quantity: Number(row.quantity || 0),
      })),
    );
    close();
  };

  const modalContent = (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[95vw] max-w-3xl border border-[var(--color-border)] max-h-[90dvh] flex flex-col">
        <div className="px-5 sm:px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-50 rounded-[var(--border-radius-base)] flex items-center justify-center">
              <Package2 size={18} className="text-rose-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold">هالك المكونات</h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">اختر المكونات المرتبطة بالمنتج وحدد كمية الهالك لكل مكون.</p>
            </div>
          </div>
          <button onClick={close} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {loading && (
            <div className="text-sm font-bold text-[var(--color-text-muted)] flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              جاري تحميل مكونات المنتج...
            </div>
          )}
          {!loading && options.length === 0 && (
            <div className="text-sm font-bold text-[var(--color-text-muted)]">لا توجد مكونات مرتبطة بهذا المنتج.</div>
          )}
          {!loading && options.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-xs text-[var(--color-text-muted)]">
                  تم اختيار {rows.length} / {options.length} مكون
                </div>
                <Button
                  variant="outline"
                  onClick={addRow}
                  disabled={rows.length >= options.length}
                >
                  <Plus size={14} />
                  إضافة مكون
                </Button>
              </div>
              <div className="space-y-3">
                {rows.map((row, index) => {
                  const selectedIds = new Set(rows.map((r, idx) => (idx === index ? '' : r.materialId)));
                  const rowOptions = options.filter((opt) => !selectedIds.has(opt.materialId) || opt.materialId === row.materialId);
                  const selectedOption = options.find((opt) => opt.materialId === row.materialId);
                  return (
                    <div key={`${row.materialId}-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-3 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-3">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--color-text-muted)]">المكون</label>
                        <select
                          className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] text-sm p-2.5 outline-none"
                          value={row.materialId}
                          onChange={(e) => {
                            const option = options.find((opt) => opt.materialId === e.target.value);
                            if (!option) return;
                            updateRow(index, {
                              materialId: option.materialId,
                              materialName: option.materialName,
                            });
                          }}
                        >
                          <option value="">اختر المكون</option>
                          {rowOptions.map((opt) => (
                            <option key={opt.materialId} value={opt.materialId}>
                              {opt.materialName}
                            </option>
                          ))}
                        </select>
                        {selectedOption && (
                          <p className="text-[11px] text-[var(--color-text-muted)]">
                            للقطعة: {formatNumber(selectedOption.quantityUsed)} | تكلفة: {formatNumber(selectedOption.unitCost)} | رصيد المفكك: {formatNumber(selectedOption.balanceInDecomposed)}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--color-text-muted)]">كمية الهالك</label>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] text-sm p-2.5 outline-none"
                          value={row.quantity || ''}
                          onChange={(e) => updateRow(index, { quantity: Number(e.target.value) })}
                          placeholder="0"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          className="px-3 py-2.5 rounded-[var(--border-radius-base)] bg-rose-50 text-rose-600 hover:bg-rose-100 text-sm font-bold"
                          onClick={() => removeRow(index)}
                        >
                          حذف
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasDuplicate && (
                <div className="text-xs font-bold text-rose-600">لا يمكن تكرار نفس المكون أكثر من مرة.</div>
              )}
              {hasInvalidQty && (
                <div className="text-xs font-bold text-rose-600">كل كمية هالك يجب أن تكون أكبر من صفر.</div>
              )}
            </>
          )}
        </div>
        <div className="px-5 sm:px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={close}>
            إغلاق
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            <Save size={14} />
            حفظ هالك المكونات
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};

function resolveMaterialOptions(
  linkedMaterials: ProductMaterial[],
  rawMaterials: RawMaterial[],
  balances: StockItemBalance[],
  decomposedWarehouseId: string,
): MaterialOption[] {
  const rawById = new Map(rawMaterials.filter((rm) => Boolean(rm.id)).map((rm) => [String(rm.id), rm]));
  const rawByName = new Map(rawMaterials.map((rm) => [normalizeText(rm.name), rm]));
  const balanceKey = (materialId: string) => `${decomposedWarehouseId}__${materialId}`;
  const balanceByMaterial = new Map<string, number>();

  for (const row of balances) {
    if (row.itemType !== 'raw_material') continue;
    if (!row.itemId || !row.warehouseId) continue;
    balanceByMaterial.set(`${row.warehouseId}__${row.itemId}`, Number(row.quantity || 0));
  }

  const unique = new Map<string, MaterialOption>();
  for (const material of linkedMaterials) {
    const raw =
      (material.materialId ? rawById.get(material.materialId) : undefined)
      ?? rawByName.get(normalizeText(material.materialName || ''));
    if (!raw?.id) continue;
    if (unique.has(raw.id)) continue;
    unique.set(raw.id, {
      materialId: raw.id,
      materialName: raw.name,
      quantityUsed: Number(material.quantityUsed || 0),
      unitCost: Number(material.unitCost || 0),
      balanceInDecomposed: Number(balanceByMaterial.get(balanceKey(raw.id)) || 0),
    });
  }

  return Array.from(unique.values()).sort((a, b) => a.materialName.localeCompare(b.materialName, 'ar'));
}
