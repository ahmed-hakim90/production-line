import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Package2, Plus, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './UI';
import { productMaterialService } from '../services/productMaterialService';
import { rawMaterialService } from '../../inventory/services/rawMaterialService';
import { stockService } from '../../inventory/services/stockService';
import { useAppStore } from '../../../store/useAppStore';
import type { ProductMaterial, ReportComponentScrapItem } from '../../../types';
import type { RawMaterial, StockItemBalance } from '../../inventory/types';
import { formatNumber } from '../../../utils/calculations';
import { useTranslation } from 'react-i18next';

export type ComponentScrapModalProps = {
  open: boolean;
  onClose: () => void;
  productId: string;
  initialItems: ReportComponentScrapItem[];
  onSave: (items: ReportComponentScrapItem[]) => void;
};

type MaterialOption = {
  materialId: string;
  materialName: string;
  quantityUsed: number;
  unitCost: number;
  balanceInDecomposed: number;
};

const getModalPortalContainer = (): HTMLElement | null => {
  if (typeof document === 'undefined') return null;
  return document.getElementById('erp-modal-root') ?? document.body;
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

export const ComponentScrapModal: React.FC<ComponentScrapModalProps> = ({
  open,
  onClose,
  productId,
  initialItems,
  onSave,
}) => {
  const { t } = useTranslation();
  const settings = useAppStore((s) => s.systemSettings.planSettings);
  const [options, setOptions] = useState<MaterialOption[]>([]);
  const [rows, setRows] = useState<ReportComponentScrapItem[]>([]);
  const [loading, setLoading] = useState(false);

  const trimmedProductId = String(productId || '').trim();

  useEffect(() => {
    if (!open) return;
    const items = Array.isArray(initialItems) ? initialItems : [];
    setRows(
      items
        .filter((item) => item && item.materialId && Number(item.quantity || 0) > 0)
        .map((item) => ({
          materialId: String(item.materialId),
          materialName: String(item.materialName || ''),
          quantity: Number(item.quantity || 0),
        })),
    );
  }, [open, initialItems]);

  useEffect(() => {
    if (!open || !trimmedProductId) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const decomposedWarehouseId = String(settings?.decomposedSourceWarehouseId || '').trim();
        const [linkedMaterials, rawMaterials, balances] = await Promise.all([
          productMaterialService.getByProduct(trimmedProductId),
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
  }, [open, trimmedProductId, settings?.decomposedSourceWarehouseId]);

  const hasDuplicate = useMemo(() => {
    const ids = rows.map((row) => row.materialId).filter(Boolean);
    return new Set(ids).size !== ids.length;
  }, [rows]);

  if (!open) return null;

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
    onSave(
      rows.map((row) => ({
        materialId: row.materialId,
        materialName: row.materialName,
        quantity: Number(row.quantity || 0),
      })),
    );
    onClose();
  };

  const modalContent = (
    <div className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="component-scrap-modal-title"
        className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[95vw] max-w-3xl border border-[var(--color-border)] max-h-[90dvh] flex flex-col"
      >
        <div className="px-5 sm:px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-[var(--border-radius-base)] bg-rose-500/15 dark:bg-rose-500/20 flex items-center justify-center">
              <Package2 size={18} className="text-rose-600 dark:text-rose-400" aria-hidden />
            </div>
            <div className="min-w-0">
              <h3 id="component-scrap-modal-title" className="text-lg font-bold truncate">
                {t('modalManager.componentScrap.title')}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5 leading-snug">{t('modalManager.componentScrap.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
            aria-label={t('ui.close')}
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {loading && (
            <div className="text-sm font-bold text-[var(--color-text-muted)] flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              {t('modalManager.componentScrap.loading')}
            </div>
          )}
          {!loading && options.length === 0 && (
            <div className="text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.componentScrap.empty')}</div>
          )}
          {!loading && options.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-xs text-[var(--color-text-muted)]">
                  {t('modalManager.componentScrap.selectedCount', { selected: rows.length, total: options.length })}
                </div>
                <Button
                  variant="outline"
                  onClick={addRow}
                  disabled={rows.length >= options.length}
                >
                  <Plus size={14} />
                  {t('modalManager.componentScrap.addComponent')}
                </Button>
              </div>
              <div className="space-y-3">
                {rows.map((row, index) => {
                  const selectedIds = new Set(rows.map((r, idx) => (idx === index ? '' : r.materialId)));
                  const rowOptions = options.filter((opt) => !selectedIds.has(opt.materialId) || opt.materialId === row.materialId);
                  const selectedOption = options.find((opt) => opt.materialId === row.materialId);
                  return (
                    <div
                      key={`${row.materialId}-${index}`}
                      className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-3 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-3 bg-[var(--color-muted)]/20"
                    >
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.componentScrap.component')}</label>
                        <select
                          className={cn(
                            'w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground',
                            'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          )}
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
                          <option value="">{t('modalManager.componentScrap.selectComponent')}</option>
                          {rowOptions.map((opt) => (
                            <option key={opt.materialId} value={opt.materialId}>
                              {opt.materialName}
                            </option>
                          ))}
                        </select>
                        {selectedOption && (
                          <p className="text-[11px] text-[var(--color-text-muted)]">
                            {t('modalManager.componentScrap.componentMeta', {
                              quantityUsed: formatNumber(selectedOption.quantityUsed),
                              unitCost: formatNumber(selectedOption.unitCost),
                              balanceInDecomposed: formatNumber(selectedOption.balanceInDecomposed),
                            })}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.componentScrap.scrapQuantity')}</label>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className={cn(
                            'w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm tabular-nums text-foreground',
                            'ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          )}
                          value={row.quantity || ''}
                          onChange={(e) => updateRow(index, { quantity: Number(e.target.value) })}
                          placeholder="0"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          className="px-3 py-2.5 rounded-md bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-400 dark:hover:bg-rose-500/20 text-sm font-bold transition-colors"
                          onClick={() => removeRow(index)}
                        >
                          {t('modalManager.componentScrap.remove')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {hasDuplicate && (
                <div className="text-xs font-bold text-rose-600">{t('modalManager.componentScrap.duplicateError')}</div>
              )}
              {hasInvalidQty && (
                <div className="text-xs font-bold text-rose-600">{t('modalManager.componentScrap.quantityError')}</div>
              )}
            </>
          )}
        </div>
        <div className="px-5 sm:px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={onClose}>
            {t('ui.close')}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            <Save size={14} />
            {t('modalManager.componentScrap.save')}
          </Button>
        </div>
      </div>
    </div>
  );

  const portalTarget = getModalPortalContainer();
  if (!portalTarget) return null;
  return createPortal(modalContent, portalTarget);
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
