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
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold">إضافة منتج جديد</h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {message && (
            <div
              className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold ${
                message.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
              }`}
            >
              <span className="material-icons-round text-base">{message.type === 'success' ? 'check_circle' : 'error'}</span>
              <p className="flex-1">{message.text}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">اسم المنتج *</label>
            <input
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3.5 outline-none font-medium"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: محرك هيدروليكي H-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الكود *</label>
              <input
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3.5 outline-none font-medium"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="PRD-00001"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الفئة / الموديل *</label>
              <select
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3.5 outline-none font-medium"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              >
                <option value="">اختر الفئة</option>
                <option value="منزلي">منزلي</option>
                <option value="سريا">سريا</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الرصيد الافتتاحي</label>
              <input
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3.5 outline-none font-medium"
                type="number"
                min={0}
                value={form.openingBalance}
                onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">سعر البيع (ج.م)</label>
              <input
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3.5 outline-none font-medium"
                type="number"
                min={0}
                step="any"
                value={form.sellingPrice ?? 0}
                onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
              />
            </div>
          </div>

          {canViewCosts && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">تكلفة الوحدة الصينية (ج.م)</label>
                <input className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3.5 outline-none font-medium" type="number" min={0} step="any" value={form.chineseUnitCost ?? 0} onChange={(e) => setForm({ ...form, chineseUnitCost: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">تكلفة العلبة الداخلية (ج.م)</label>
                <input className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3.5 outline-none font-medium" type="number" min={0} step="any" value={form.innerBoxCost ?? 0} onChange={(e) => setForm({ ...form, innerBoxCost: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">تكلفة الكرتونة الخارجية (ج.م)</label>
                <input className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3.5 outline-none font-medium" type="number" min={0} step="any" value={form.outerCartonCost ?? 0} onChange={(e) => setForm({ ...form, outerCartonCost: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">عدد الوحدات في الكرتونة</label>
                <input className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3.5 outline-none font-medium" type="number" min={0} step={1} value={form.unitsPerCarton ?? 0} onChange={(e) => setForm({ ...form, unitsPerCarton: Number(e.target.value) })} />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
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

