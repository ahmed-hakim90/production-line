import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteField } from 'firebase/firestore';
import { AlertCircle, CheckCircle2, Loader2, Lock, Plus, Save, Unlock, X } from 'lucide-react';
import { Button } from '../../../modules/production/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import type { FirestoreProduct } from '../../../types';
import { CategoryTreeSelect } from '../../../modules/catalog/components/CategoryTreeSelect';
import {
  categoryService,
  isProductCategoryRow,
} from '../../../modules/catalog/services/categoryService';
import { formatCategoryBreadcrumb, normalizeCategoryName } from '../../../modules/catalog/lib/categoryTree';
import { useTranslation } from 'react-i18next';
import {
  chineseUnitCostEgpFromYuanUnitPrice,
  yuanUnitPriceInputFromChineseUnitCostEgp,
} from '../../../utils/chineseUnitCostCny';
import { formatCost } from '../../../utils/costCalculations';
import { productService } from '../../../modules/production/services/productService';
import { useAutoEntityCode } from '../../../modules/shared/hooks/useAutoEntityCode';
import { DUPLICATE_ENTITY_CODE } from '../../../modules/shared/services/entityCodeSequenceService';
import { ProductModalMaterialsSection } from '../../../modules/production/components/ProductModalMaterialsSection';

function isDuplicateEntityCodeError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.message === DUPLICATE_ENTITY_CODE || (e as Error & { code?: string }).code === DUPLICATE_ENTITY_CODE)
  );
}

const emptyForm: Omit<FirestoreProduct, 'id'> = {
  name: '',
  model: '',
  categoryId: null,
  categoryName: '',
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
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.PRODUCTS_CREATE);
  const { can } = usePermission();
  const canCreate = can('products.create');
  const canEditPerm = can('products.edit');
  const canViewCosts = can('costs.view');
  const createProduct = useAppStore((s) => s.createProduct);
  const updateProduct = useAppStore((s) => s.updateProduct);
  const fetchProducts = useAppStore((s) => s.fetchProducts);
  const products = useAppStore((s) => s.products);
  const productsLoading = useAppStore((s) => s.productsLoading);
  const rawProducts = useAppStore((s) => s._rawProducts);
  const laborSettings = useAppStore((s) => s.laborSettings);

  const modalPayload = payload as { mode?: string; productId?: string; source?: string } | undefined;
  const isEditFlow = modalPayload?.mode === 'edit' && typeof modalPayload?.productId === 'string';
  const editProductId = isEditFlow ? String(modalPayload!.productId) : null;

  const editingProduct = useMemo(
    () => (editProductId ? products.find((p) => p.id === editProductId) : null),
    [editProductId, products],
  );
  const editingRaw = useMemo(
    () => (editProductId ? rawProducts.find((p) => p.id === editProductId) : null),
    [editProductId, rawProducts],
  );

  const [form, setForm] = useState(emptyForm);
  const [chineseUnitPriceYuan, setChineseUnitPriceYuan] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryBreadcrumb, setCategoryBreadcrumb] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  /** بعد حفظ منتج جديد — لربط المواد الخام داخل نفس المودال */
  const [justCreatedProductId, setJustCreatedProductId] = useState<string | null>(null);

  const peekProduct = useCallback(() => productService.peekNextCode(), []);

  const {
    code: productCode,
    setCode: setProductCode,
    locked: codeLocked,
    toggleLock: toggleCodeLock,
    isLoading: codePreviewLoading,
  } = useAutoEntityCode({
    enabled: isOpen,
    isEditMode: isEditFlow,
    initialCode: editingProduct?.code ?? '',
    peek: peekProduct,
  });

  useEffect(() => {
    if (!isOpen) return;
    setSelectedCategoryId(null);
    setCategoryBreadcrumb('');
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isEditFlow) return;
    setForm(emptyForm);
    setSelectedCategoryId(null);
    setCategoryBreadcrumb('');
    setJustCreatedProductId(null);
    setMessage(null);
    setChineseUnitPriceYuan('');
  }, [isOpen, isEditFlow]);

  useEffect(() => {
    if (!isOpen || !isEditFlow || !editProductId || !editingProduct || !editingRaw) return;
    const resolveCategoryId = async (): Promise<string | null> => {
      const fromDoc = editingRaw.categoryId?.trim();
      if (fromDoc) return fromDoc;
      const legacy = String(editingRaw.model || editingProduct.category || '').trim();
      if (!legacy) return null;
      const cats = (await categoryService.getAll()).filter(isProductCategoryRow);
      const match = cats.find(
        (c) => normalizeCategoryName(c.name) === normalizeCategoryName(legacy),
      );
      return match?.id ?? null;
    };
    void resolveCategoryId().then((resolved) => setSelectedCategoryId(resolved));
    setForm({
      name: editingProduct.name,
      model: editingProduct.category,
      categoryId: editingRaw.categoryId ?? null,
      categoryName: editingRaw.categoryName ?? editingProduct.category,
      code: editingProduct.code,
      openingBalance: editingProduct.openingStock,
      chineseUnitCost: editingRaw.chineseUnitCost ?? 0,
      innerBoxCost: editingRaw.innerBoxCost ?? 0,
      outerCartonCost: editingRaw.outerCartonCost ?? 0,
      unitsPerCarton: editingRaw.unitsPerCarton ?? 0,
      sellingPrice: editingRaw.sellingPrice ?? 0,
      autoDeductComponentScrapFromDecomposed: editingRaw.autoDeductComponentScrapFromDecomposed === true,
      routingTargetUnitSeconds:
        editingRaw.routingTargetUnitSeconds != null && Number(editingRaw.routingTargetUnitSeconds) > 0
          ? Math.round(Number(editingRaw.routingTargetUnitSeconds))
          : undefined,
    });
    const rate = Number(laborSettings?.cnyToEgpRate ?? 0);
    setChineseUnitPriceYuan(yuanUnitPriceInputFromChineseUnitCostEgp(editingRaw.chineseUnitCost ?? 0, rate));
  }, [isOpen, isEditFlow, editProductId, editingProduct, editingRaw, laborSettings?.cnyToEgpRate]);

  useEffect(() => {
    if (!isOpen || !selectedCategoryId) return;
    let cancelled = false;
    (async () => {
      const cats = await categoryService.getAll();
      if (cancelled) return;
      setCategoryBreadcrumb(formatCategoryBreadcrumb(cats, selectedCategoryId));
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedCategoryId]);

  useEffect(() => {
    if (!isOpen) setJustCreatedProductId(null);
  }, [isOpen]);

  const cnyToEgpRate = Number(laborSettings?.cnyToEgpRate ?? 0);

  if (!isOpen) return null;
  if (isEditFlow) {
    if (!canEditPerm) return null;
  } else if (!canCreate) {
    return null;
  }

  const materialsProductId = justCreatedProductId ?? (isEditFlow ? editProductId : null);

  const resolveChineseUnitCost = (): number => {
    if (!canViewCosts) return form.chineseUnitCost ?? 0;
    if (cnyToEgpRate > 0) {
      const yuan = Number(String(chineseUnitPriceYuan).replace(',', '.')) || 0;
      return chineseUnitCostEgpFromYuanUnitPrice(yuan, cnyToEgpRate);
    }
    return form.chineseUnitCost ?? 0;
  };

  const handleClose = () => {
    if (saving) return;
    setMessage(null);
    setJustCreatedProductId(null);
    setForm(emptyForm);
    close();
  };

  const handleSave = async () => {
    if (!form.name || !selectedCategoryId) return;
    setSaving(true);
    setMessage(null);
    try {
      if (isEditFlow && editProductId) {
        const codeForSave = productCode.trim().toUpperCase();
        if (!codeForSave) {
          setMessage({ type: 'error', text: t('modalManager.createProduct.manualCodeRequired') });
          setSaving(false);
          return;
        }
        const tSec = form.routingTargetUnitSeconds;
        const hasTarget = typeof tSec === 'number' && Number.isFinite(tSec) && tSec > 0;
        const payloadUpdate: Record<string, unknown> = {
          ...form,
          categoryId: selectedCategoryId,
          categoryName: categoryBreadcrumb.split(' > ').pop() || form.categoryName,
          code: codeForSave,
          chineseUnitCost: resolveChineseUnitCost(),
        };
        payloadUpdate.routingTargetUnitSeconds = hasTarget ? Math.round(tSec) : deleteField();
        await updateProduct(editProductId, payloadUpdate as Partial<FirestoreProduct>);
        setMessage({ type: 'success', text: t('modalManager.createProduct.editSuccess') });
      } else {
        const codeToSend = codeLocked ? '' : productCode.trim().toUpperCase();
        if (!codeLocked && !codeToSend) {
          setMessage({ type: 'error', text: t('modalManager.createProduct.manualCodeRequired') });
          setSaving(false);
          return;
        }
        const createData: Omit<FirestoreProduct, 'id'> = {
          ...form,
          categoryId: selectedCategoryId,
          categoryName: categoryBreadcrumb.split(' > ').pop() || '',
          code: codeToSend,
        };
        if (canViewCosts) {
          if (cnyToEgpRate > 0) {
            const yuan = Number(String(chineseUnitPriceYuan).replace(',', '.')) || 0;
            createData.chineseUnitCost = chineseUnitCostEgpFromYuanUnitPrice(yuan, cnyToEgpRate);
          }
        }
        if (
          typeof createData.routingTargetUnitSeconds !== 'number' ||
          !Number.isFinite(createData.routingTargetUnitSeconds) ||
          createData.routingTargetUnitSeconds <= 0
        ) {
          delete (createData as { routingTargetUnitSeconds?: number }).routingTargetUnitSeconds;
        } else {
          createData.routingTargetUnitSeconds = Math.round(createData.routingTargetUnitSeconds);
        }
        const id = await createProduct(createData);
        if (!id) throw new Error('create failed');
        setJustCreatedProductId(id);
        setMessage({
          type: 'success',
          text: `${t('modalManager.createProduct.createSuccess')} — يمكنك أدناه ربط المواد الخام والكمية وسعر الوحدة، أو تعريف مادة جديدة من نفس المودال.`,
        });
        setForm(emptyForm);
        setChineseUnitPriceYuan('');
      }
    } catch (e) {
      if (isDuplicateEntityCodeError(e)) {
        setMessage({ type: 'error', text: t('entityCode.duplicateError') });
      } else {
        setMessage({ type: 'error', text: t('modalManager.createProduct.saveError') });
      }
    } finally {
      setSaving(false);
    }
  };

  const editMissing =
    isEditFlow && editProductId && !productsLoading && (!editingProduct || !editingRaw);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div
        className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[95vw] max-w-2xl border border-[var(--color-border)] max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold">
            {isEditFlow ? t('modalManager.createProduct.editTitle') : t('modalManager.createProduct.title')}
          </h3>
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

          {editMissing && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold bg-rose-50 text-rose-700 border border-rose-200">
              <AlertCircle size={16} />
              <p>{t('modalManager.createProduct.editNotFound')}</p>
            </div>
          )}

          {isEditFlow && !editingProduct && productsLoading && !editMissing && (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-[var(--color-text-muted)]">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p className="text-sm font-bold">جاري التحميل...</p>
            </div>
          )}

          {!editMissing && !(isEditFlow && !editingProduct && productsLoading) && (
            <>
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
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createProduct.codeLabel')}</label>
              <div className="flex gap-2 items-start">
                <div className="relative flex-1 min-w-0">
                  <input
                    readOnly={codeLocked}
                    className={`w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium font-mono ${codeLocked ? 'opacity-90' : ''}`}
                    value={productCode}
                    onChange={(e) => setProductCode(e.target.value.toUpperCase())}
                    placeholder="PRD-00001"
                  />
                  {codePreviewLoading && (
                    <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[var(--color-text-muted)]" />
                  )}
                </div>
                <button
                  type="button"
                  className="shrink-0 p-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] hover:bg-[var(--color-bg)]"
                  onClick={toggleCodeLock}
                  title={codeLocked ? t('entityCode.unlockTitle') : t('entityCode.lockTitle')}
                >
                  {codeLocked ? <Lock size={18} /> : <Unlock size={18} />}
                </button>
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                {codeLocked ? t('entityCode.lockHint') : t('entityCode.unlockedHint')}
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createProduct.categoryModelRequired')}</label>
              <CategoryTreeSelect
                value={selectedCategoryId}
                required
                onChange={(id, breadcrumb) => {
                  setSelectedCategoryId(id);
                  setCategoryBreadcrumb(breadcrumb);
                  const leaf = breadcrumb.split(' > ').pop() || '';
                  setForm({ ...form, categoryId: id, categoryName: leaf, model: leaf });
                }}
              />
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

          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">
              تارجت المتوقع في التقارير (ثانية/وحدة)
            </label>
            <input
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium"
              type="number"
              min={1}
              step={1}
              value={form.routingTargetUnitSeconds ?? ''}
              placeholder="اختياري — بدون مسار"
              onChange={(e) => {
                const v = e.target.value.trim();
                if (v === '') setForm({ ...form, routingTargetUnitSeconds: undefined });
                else setForm({ ...form, routingTargetUnitSeconds: Math.round(Number(v)) });
              }}
            />
          </div>

          {canViewCosts && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                {cnyToEgpRate > 0 ? (
                  <>
                    <label className="block text-sm font-bold text-[var(--color-text-muted)]">
                      {t('modalManager.createProduct.chineseUnitPriceYuan')}
                    </label>
                    <input
                      className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium"
                      type="number"
                      min={0}
                      step="any"
                      placeholder="0"
                      value={chineseUnitPriceYuan}
                      onChange={(e) => setChineseUnitPriceYuan(e.target.value)}
                    />
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {t('modalManager.createProduct.chineseUnitCostPreview', {
                        rate: formatCost(cnyToEgpRate),
                        egp: formatCost(
                          chineseUnitCostEgpFromYuanUnitPrice(
                            Number(String(chineseUnitPriceYuan).replace(',', '.')) || 0,
                            cnyToEgpRate,
                          ),
                        ),
                      })}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-[var(--border-radius-lg)] px-3 py-2">
                      {t('modalManager.createProduct.cnyRateMissingHint')}
                    </p>
                    <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.createProduct.chineseUnitCostManualEgp')}</label>
                    <input
                      className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-medium"
                      type="number"
                      min={0}
                      step="any"
                      placeholder="0"
                      value={form.chineseUnitCost ?? ''}
                      onChange={(e) => setForm({ ...form, chineseUnitCost: Number(e.target.value) })}
                    />
                  </>
                )}
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

            {(!isEditFlow || (editingProduct && editingRaw)) && (
              <ProductModalMaterialsSection
                productId={materialsProductId}
                enabled={isOpen && !editMissing}
              />
            )}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-border)] flex flex-wrap items-center justify-end gap-3">
          {justCreatedProductId && !isEditFlow && (
            <Button type="button" variant="outline" className="ml-auto sm:ml-0" onClick={() => setJustCreatedProductId(null)}>
              إخفاء قسم المواد
            </Button>
          )}
          <Button variant="outline" onClick={handleClose}>{t('ui.cancel')}</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={
              saving ||
              editMissing ||
              (isEditFlow && (!editingProduct || !editingRaw)) ||
              !form.name ||
              !form.model ||
              (!isEditFlow && !codeLocked && !productCode.trim())
            }
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : isEditFlow ? (
              <Save size={14} />
            ) : (
              <Plus size={14} />
            )}
            {isEditFlow ? t('modalManager.createProduct.saveEdits') : t('modalManager.createProduct.addProduct')}
          </Button>
        </div>
      </div>
    </div>
  );
};

