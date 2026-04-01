import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Plus, X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import type { FirestoreProduct } from '../../../types';
import { categoryService } from '../../../modules/catalog/services/categoryService';
import { useTranslation } from 'react-i18next';

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
  autoDeductComponentScrapFromDecomposed: false,
};

export const GlobalCreateProductModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.PRODUCTS_CREATE);
  const { can } = usePermission();
  const canViewCosts = can('costs.view');
  const createProduct = useAppStore((s) => s.createProduct);
  const rawProducts = useAppStore((s) => s._rawProducts);
  const [form, setForm] = useState(emptyForm);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fallbackCategoryOptions = useMemo(() => {
    const unique = new Set<string>();
    rawProducts.forEach((product) => {
      const name = String(product.model || '').trim();
      if (name) unique.add(name);
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [rawProducts]);

  const mergedCategoryOptions = useMemo(() => {
    const unique = new Set<string>([...categoryOptions, ...fallbackCategoryOptions]);
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [categoryOptions, fallbackCategoryOptions]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const loadCategoryOptions = async () => {
      try {
        await categoryService.seedFromProductsModel();
        const rows = await categoryService.getByType('product');
        if (cancelled) return;
        const names = rows
          .filter((row) => row.isActive !== false)
          .map((row) => String(row.name || '').trim())
          .filter(Boolean);
        setCategoryOptions(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'ar')));
      } catch {
        if (cancelled) return;
        setCategoryOptions([]);
      }
    };
    void loadCategoryOptions();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

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
      setMessage({ type: 'success', text: t('modalManager.createProduct.createSuccess') });
      setForm(emptyForm);
    } catch {
      setMessage({ type: 'error', text: t('modalManager.createProduct.saveError') });
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
          <h3 className="text-lg font-bold">{t('modalManager.createProduct.title')}</h3>
          <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <X size={20} />
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
              {message.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <p className="flex-1">{message.text}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createProduct.productNameRequired')}</label>
            <input
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('modalManager.createProduct.productNamePlaceholder')}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createProduct.codeRequired')}</label>
              <input
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="PRD-00001"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createProduct.categoryModelRequired')}</label>
              <input
                list="global-products-category-options"
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder={t('modalManager.createProduct.categoryModelPlaceholder')}
              />
              <datalist id="global-products-category-options">
                {mergedCategoryOptions.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createProduct.sellingPrice')}</label>
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

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-[var(--color-text-muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoDeductComponentScrapFromDecomposed === true}
                onChange={(e) => setForm({ ...form, autoDeductComponentScrapFromDecomposed: e.target.checked })}
              />
              {t('modalManager.createProduct.autoDeductScrap')}
            </label>
          </div>

          {canViewCosts && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createProduct.chineseUnitCost')}</label>
                <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium" type="number" min={0} step="any" placeholder="0" value={form.chineseUnitCost ?? ''} onChange={(e) => setForm({ ...form, chineseUnitCost: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createProduct.innerBoxCost')}</label>
                <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium" type="number" min={0} step="any" placeholder="0" value={form.innerBoxCost ?? ''} onChange={(e) => setForm({ ...form, innerBoxCost: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createProduct.outerCartonCost')}</label>
                <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium" type="number" min={0} step="any" placeholder="0" value={form.outerCartonCost ?? ''} onChange={(e) => setForm({ ...form, outerCartonCost: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createProduct.unitsPerCarton')}</label>
                <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium" type="number" min={0} step={1} placeholder="0" value={form.unitsPerCarton ?? ''} onChange={(e) => setForm({ ...form, unitsPerCarton: Number(e.target.value) })} />
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
          <Button variant="outline" onClick={handleClose}>{t('ui.cancel')}</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || !form.name || !form.code || !form.model}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {t('modalManager.createProduct.addProduct')}
          </Button>
        </div>
      </div>
    </div>
  );
};

