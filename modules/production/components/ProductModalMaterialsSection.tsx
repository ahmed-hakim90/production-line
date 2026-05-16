import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from './UI';
import { rawMaterialService } from '../../inventory/services/rawMaterialService';
import type { RawMaterial } from '../../inventory/types';
import { productMaterialService } from '../services/productMaterialService';
import type { ProductMaterial } from '../../../types';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { usePermission } from '../../../utils/permissions';

export type ProductModalMaterialsSectionProps = {
  productId: string | null;
  enabled: boolean;
  onMaterialsChanged?: (productId: string) => void;
};

export const ProductModalMaterialsSection: React.FC<ProductModalMaterialsSectionProps> = ({
  productId,
  enabled,
  onMaterialsChanged,
}) => {
  const { openModal } = useGlobalModalManager();
  const { can } = usePermission();
  const canManageMaterials = can('costs.manage') || can('products.edit');
  const canCreateRawMaterial = can('inventory.items.manage');

  const [catalog, setCatalog] = useState<RawMaterial[]>([]);
  const [rows, setRows] = useState<ProductMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProductMaterial | null>(null);
  const [form, setForm] = useState({ materialId: '', quantityUsed: 0, unitCost: 0 });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const onMaterialsChangedRef = useRef(onMaterialsChanged);
  onMaterialsChangedRef.current = onMaterialsChanged;

  const loadCatalog = useCallback(async () => {
    try {
      const list = await rawMaterialService.getAll();
      setCatalog(list.filter((r) => r.isActive !== false && Boolean(r.id)));
    } catch {
      setCatalog([]);
    }
  }, []);

  const loadRows = useCallback(async () => {
    if (!productId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const m = await productMaterialService.getByProduct(productId);
      setRows(m);
      onMaterialsChangedRef.current?.(productId);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    if (!enabled || !canManageMaterials) return;
    if (!productId) return;
    void loadCatalog();
  }, [enabled, canManageMaterials, productId, loadCatalog]);

  useEffect(() => {
    if (!enabled || !canManageMaterials || !productId) {
      setRows([]);
      setShowForm(false);
      setEditing(null);
      setError(null);
      return;
    }
    void loadRows();
  }, [enabled, canManageMaterials, productId, loadRows]);

  const openDefineRawMaterial = useCallback(() => {
    if (!canCreateRawMaterial) return;
    openModal(MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE, {
      mode: 'create',
      onSaved: () => {
        void loadCatalog();
      },
    });
  }, [canCreateRawMaterial, openModal, loadCatalog]);

  const openAdd = useCallback(() => {
    setError(null);
    setEditing(null);
    if (catalog.length === 0 && canCreateRawMaterial) {
      const opened = openModal(MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE, {
        mode: 'create',
        onSaved: async () => {
          await loadCatalog();
          setForm({ materialId: '', quantityUsed: 0, unitCost: 0 });
          setEditing(null);
          setShowForm(true);
        },
      });
      if (opened) return;
    }
    setForm({ materialId: '', quantityUsed: 0, unitCost: 0 });
    setShowForm(true);
  }, [catalog.length, canCreateRawMaterial, openModal, loadCatalog]);

  const openEditRow = useCallback((row: ProductMaterial) => {
    setError(null);
    setEditing(row);
    setForm({
      materialId: row.materialId || '',
      quantityUsed: Number(row.quantityUsed || 0),
      unitCost: Number(row.unitCost || 0),
    });
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    if (saving) return;
    setShowForm(false);
    setEditing(null);
    setError(null);
    setForm({ materialId: '', quantityUsed: 0, unitCost: 0 });
  }, [saving]);

  const handleSave = useCallback(async () => {
    if (!productId || saving) return;
    const selected = catalog.find((r) => r.id === form.materialId);
    if (!selected) {
      setError('اختر مادة خام من القائمة.');
      return;
    }
    if (form.quantityUsed <= 0) {
      setError('أدخل كمية أكبر من صفر.');
      return;
    }
    if (form.unitCost < 0) {
      setError('سعر الوحدة لا يمكن أن يكون سالبًا.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        materialId: selected.id,
        materialName: selected.name,
        quantityUsed: Number(form.quantityUsed || 0),
        unitCost: Number(form.unitCost || 0),
      };
      if (editing?.id) {
        await productMaterialService.update(editing.id, payload);
      } else {
        await productMaterialService.create({
          productId,
          ...payload,
        });
      }
      await loadRows();
      closeForm();
    } catch {
      setError('تعذر حفظ المادة الخام. حاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  }, [productId, saving, catalog, form, editing, loadRows, closeForm]);

  const handleDelete = useCallback(
    async (row: ProductMaterial) => {
      if (!row.id || !productId) return;
      const ok = window.confirm(`هل تريد حذف المادة الخام «${row.materialName}» من هذا المنتج؟`);
      if (!ok) return;
      try {
        await productMaterialService.delete(row.id);
        await loadRows();
      } catch {
        setError('تعذر حذف المادة.');
      }
    },
    [productId, loadRows],
  );

  if (!enabled || !canManageMaterials) return null;

  /** لا يوجد productId بعد — الربط يحتاج منتجاً محفوظاً؛ نعرض نفس الإطار معطّلاً كما في التعديل */
  if (!productId) {
    const saveFirstTitle = 'احفظ المنتج أولاً لتفعيل ربط المواد وتعريف مادة جديدة من هنا.';
    return (
      <div className="space-y-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-[var(--color-text)]">المواد الخام للمنتج</p>
          <div className="flex flex-wrap items-center gap-2">
            {canCreateRawMaterial && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                disabled
                title={saveFirstTitle}
              >
                <Plus size={14} />
                تعريف مادة جديدة
              </Button>
            )}
            <Button type="button" variant="secondary" size="sm" className="gap-1 text-xs" disabled title={saveFirstTitle}>
              <Plus size={14} />
              ربط مادة
            </Button>
          </div>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          ربط المواد الخام يتطلب حفظ المنتج أولاً. بعد الضغط على «إضافة المنتج» سيُفعّل الجدول هنا مثل وضع التعديل.
        </p>
        <div className="overflow-x-auto rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-card)]/50">
          <table className="w-full min-w-[320px] text-right text-xs">
            <thead className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
              <tr>
                <th className="px-2 py-2 font-bold text-[var(--color-text-muted)]">المادة</th>
                <th className="px-2 py-2 font-bold text-[var(--color-text-muted)]">الكمية</th>
                <th className="px-2 py-2 font-bold text-[var(--color-text-muted)]">سعر الوحدة</th>
                <th className="px-2 py-2 font-bold text-[var(--color-text-muted)] w-[72px]">إجراء</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-[var(--color-text-muted)] font-medium">
                  لم يُحفظ المنتج بعد — لا توجد مواد مربوطة
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-[var(--color-text)]">المواد الخام للمنتج</p>
        <div className="flex flex-wrap items-center gap-2">
          {canCreateRawMaterial && (
            <Button type="button" variant="outline" size="sm" className="gap-1 text-xs" onClick={openDefineRawMaterial}>
              <Plus size={14} />
              تعريف مادة جديدة
            </Button>
          )}
          <Button type="button" variant="secondary" size="sm" className="gap-1 text-xs" onClick={openAdd}>
            <Plus size={14} />
            ربط مادة
          </Button>
        </div>
      </div>
      {!canCreateRawMaterial && catalog.length === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          لا توجد مواد خام في الكتالوج. يتطلب تعريف مادة جديدة من هنا صلاحية إدارة أصناف المخزن.
        </p>
      )}
      {error && !showForm && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 border border-rose-200">{error}</div>
      )}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] py-2">
          <Loader2 className="size-4 animate-spin" />
          جاري تحميل المواد…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-[var(--color-text-muted)]">لا توجد مواد مربوطة بعد. اختر مادة من القائمة وحدد الكمية وسعر الوحدة.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full min-w-[320px] text-right text-xs">
            <thead className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
              <tr>
                <th className="px-2 py-2 font-bold text-[var(--color-text-muted)]">المادة</th>
                <th className="px-2 py-2 font-bold text-[var(--color-text-muted)]">الكمية</th>
                <th className="px-2 py-2 font-bold text-[var(--color-text-muted)]">سعر الوحدة</th>
                <th className="px-2 py-2 font-bold text-[var(--color-text-muted)] w-[72px]">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id || `${row.materialId}-${row.materialName}`} className="border-b border-[var(--color-border)]/80">
                  <td className="px-2 py-2 font-medium">{row.materialName}</td>
                  <td className="px-2 py-2 tabular-nums">{row.quantityUsed}</td>
                  <td className="px-2 py-2 tabular-nums">{row.unitCost} ج.م</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        type="button"
                        className="p-1 rounded text-[var(--color-text-muted)] hover:text-primary hover:bg-primary/10"
                        title="تعديل"
                        onClick={() => openEditRow(row)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        className="p-1 rounded text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-50"
                        title="حذف"
                        onClick={() => void handleDelete(row)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={closeForm}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
              <h4 className="text-sm font-bold text-[var(--color-text)]">{editing ? 'تعديل مادة خام' : 'ربط مادة خام'}</h4>
              <button type="button" className="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]" onClick={closeForm}>
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 px-4 py-4">
              {error && (
                <div className="rounded-md bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 border border-rose-200">{error}</div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-bold text-[var(--color-text-muted)]">المادة الخام</label>
                <select
                  value={form.materialId}
                  onChange={(e) => setForm((p) => ({ ...p, materialId: e.target.value }))}
                  className="h-10 w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm"
                >
                  <option value="">اختر مادة خام</option>
                  {catalog.map((r) => (
                    <option key={r.id} value={r.id!}>
                      {r.name}
                      {r.code ? ` (${r.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--color-text-muted)]">الكمية المستخدمة</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={form.quantityUsed || ''}
                    onChange={(e) => setForm((p) => ({ ...p, quantityUsed: Number(e.target.value || 0) }))}
                    className="h-10 w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[var(--color-text-muted)]">سعر الوحدة (ج.م)</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={form.unitCost || ''}
                    onChange={(e) => setForm((p) => ({ ...p, unitCost: Number(e.target.value || 0) }))}
                    className="h-10 w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 text-sm"
                  />
                </div>
              </div>
              {canCreateRawMaterial && (
                <button
                  type="button"
                  className="text-xs font-bold text-primary hover:underline text-right"
                  onClick={openDefineRawMaterial}
                >
                  المادة غير موجودة؟ افتح نموذج تعريف مادة جديدة ثم ارجع واخترها من القائمة.
                </button>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3">
              <Button type="button" variant="outline" onClick={closeForm}>
                إلغاء
              </Button>
              <Button type="button" variant="primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : editing ? <Pencil size={14} /> : <Plus size={14} />}
                {editing ? 'حفظ التعديل' : 'حفظ الربط'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
