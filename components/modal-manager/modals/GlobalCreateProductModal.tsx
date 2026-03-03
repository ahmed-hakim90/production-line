import React, { useState } from 'react';
import { Button } from '../../../modules/production/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import type { FirestoreProduct } from '../../../types';

const emptyForm: Omit<FirestoreProduct, 'id'> = {
  name: '',
  model: '',
  code: '',
  openingBalance: 0,
  chineseUnitCost: 0,
  innerBoxCost: 0,
  outerCartonCost: 0,
  unitsPerCarton: 0,
  sellingPrice: 0,
};

export const GlobalCreateProductModal: React.FC = () => {
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.PRODUCTS_CREATE);
  const { can } = usePermission();
  const canViewCosts = can('costs.view');
  const createProduct = useAppStore((s) => s.createProduct);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;
  if (!can('products.create')) return null;

  const handleClose = () => {
    if (saving) return;
    setMessage(null);
    close();
  };

  const handleSave = async () => {
    if (!form.name || !form.code || !form.model) return;
    setSaving(true);
    setMessage(null);
    try {
      const id = await createProduct(form);
      if (!id) throw new Error('create failed');
      setMessage({ type: 'success', text: 'تم إضافة المنتج بنجاح' });
      setForm(emptyForm);
    } catch {
      setMessage({ type: 'error', text: 'تعذر حفظ المنتج. حاول مرة أخرى.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div
        className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[95vw] max-w-2xl border border-[var(--color-border)] max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold">إضافة منتج جديد</h3>
          <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {message && (
            <div
              className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              <span className="material-icons-round text-base">{message.type === 'success' ? 'check_circle' : 'error'}</span>
              <p className="flex-1">{message.text}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">اسم المنتج *</label>
            <input
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: محرك هيدروليكي H-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">الكود *</label>
              <input
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="PRD-00001"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">الفئة / الموديل *</label>
              <select
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              >
                <option value="">اختر الفئة</option>
                <option value="منزلي">منزلي</option>
                <option value="سريا">سريا</option>
                <option value="عناية">عناية</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">سعر البيع (ج.م)</label>
            <input
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium"
              type="number"
              min={0}
              step="any"
              value={form.sellingPrice ?? ''}
              placeholder="0"
              onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
            />
          </div>

          {canViewCosts && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">تكلفة الوحدة الصينية (ج.م)</label>
                <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium" type="number" min={0} step="any" placeholder="0" value={form.chineseUnitCost ?? ''} onChange={(e) => setForm({ ...form, chineseUnitCost: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">تكلفة العلبة الداخلية (ج.م)</label>
                <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium" type="number" min={0} step="any" placeholder="0" value={form.innerBoxCost ?? ''} onChange={(e) => setForm({ ...form, innerBoxCost: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">تكلفة الكرتونة الخارجية (ج.م)</label>
                <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium" type="number" min={0} step="any" placeholder="0" value={form.outerCartonCost ?? ''} onChange={(e) => setForm({ ...form, outerCartonCost: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">عدد الوحدات في الكرتونة</label>
                <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium" type="number" min={0} step={1} placeholder="0" value={form.unitsPerCarton ?? ''} onChange={(e) => setForm({ ...form, unitsPerCarton: Number(e.target.value) })} />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
          <Button variant="outline" onClick={handleClose}>إلغاء</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || !form.name || !form.code || !form.model}>
            {saving ? <span className="material-icons-round animate-spin text-sm">refresh</span> : <span className="material-icons-round text-sm">add</span>}
            إضافة المنتج
          </Button>
        </div>
      </div>
    </div>
  );
};

