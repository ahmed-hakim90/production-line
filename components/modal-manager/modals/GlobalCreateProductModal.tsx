import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { deleteField } from 'firebase/firestore';
import { Loader2, Lock, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController, useGlobalModalManager } from '../GlobalModalManager';
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
import {
  OperationPathDisabledError,
  PRODUCT_CREATE_PATHS,
  PRODUCT_OPERATION_KEYS,
  PRODUCT_UPDATE_PATHS,
  isOperationPathEnabled,
} from '../../../modules/system/lib/operationPathSettings';
import { DUPLICATE_ENTITY_CODE } from '../../../modules/shared/services/entityCodeSequenceService';

function isDuplicateEntityCodeError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.message === DUPLICATE_ENTITY_CODE || (e as Error & { code?: string }).code === DUPLICATE_ENTITY_CODE)
  );
}

function productSaveErrorMessage(e: unknown, t: (key: string) => string): string {
  if (e instanceof OperationPathDisabledError) return e.message;
  if (!(e instanceof Error)) return t('modalManager.createProduct.saveError');
  if (e.message === 'PRODUCT_CATEGORY_REQUIRED') {
    return t('modalManager.createProduct.categoryRequiredError');
  }
  if (e.message === 'PRODUCT_CATEGORY_INVALID') {
    return t('modalManager.createProduct.categoryInvalidError');
  }
  if (e.message.includes('غير مصرح')) return e.message;
  if (e.message.includes('باركود')) return e.message;
  if (e.message.startsWith('تعذر') || e.message.startsWith('هذا المسار')) return e.message;
  return t('modalManager.createProduct.saveError');
}

const emptyForm: Omit<FirestoreProduct, 'id'> = {
  name: '',
  model: '',
  categoryId: null,
  categoryName: '',
  code: '',
  barcode: '',
  openingBalance: 0,
  chineseUnitCost: 0,
  innerBoxCost: 0,
  outerCartonCost: 0,
  unitsPerCarton: 0,
  sellingPrice: 0,
  autoDeductComponentScrapFromDecomposed: false,
  assemblyMode: 'individual',
  isManufactured: true,
};

export const GlobalCreateProductModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.PRODUCTS_CREATE);
  const { openModal } = useGlobalModalManager();
  const { can } = usePermission();
  const canCreate = can('products.create');
  const canEditPerm = can('products.edit');
  const canViewCosts = can('costs.view');
  const canViewSellingPrice = can('products.sellingPrice.view');
  const canOpenBomModal = can('bom.view') || can('bom.manage') || can('products.edit');
  const createProduct = useAppStore((s) => s.createProduct);
  const updateProduct = useAppStore((s) => s.updateProduct);
  const products = useAppStore((s) => s.products);
  const productsLoading = useAppStore((s) => s.productsLoading);
  const rawProducts = useAppStore((s) => s._rawProducts);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const systemSettings = useAppStore((s) => s.systemSettings);

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

  const peekProduct = useCallback(() => productService.peekNextCode(), []);

  const {
    code: productCode,
    setCode: setProductCode,
    locked: codeLocked,
    toggleLock: toggleCodeLock,
    refreshPreview: refreshProductCodePreview,
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
    void resolveCategoryId()
      .then((resolved) => setSelectedCategoryId(resolved))
      .catch(() => setSelectedCategoryId(null));
    setForm({
      name: editingProduct.name,
      model: editingProduct.category,
      categoryId: editingRaw.categoryId ?? null,
      categoryName: editingRaw.categoryName ?? editingProduct.category,
      code: editingProduct.code,
      barcode: editingRaw.barcode ?? '',
      openingBalance: editingProduct.openingStock,
      chineseUnitCost: editingRaw.chineseUnitCost ?? 0,
      innerBoxCost: editingRaw.innerBoxCost ?? 0,
      outerCartonCost: editingRaw.outerCartonCost ?? 0,
      unitsPerCarton: editingRaw.unitsPerCarton ?? 0,
      sellingPrice: editingRaw.sellingPrice ?? 0,
      autoDeductComponentScrapFromDecomposed: editingRaw.autoDeductComponentScrapFromDecomposed === true,
      assemblyMode: editingRaw.assemblyMode === 'team' ? 'team' : 'individual',
      isManufactured: editingRaw.isManufactured !== false,
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
    void categoryService
      .getAll()
      .then((cats) => {
        if (!cancelled) setCategoryBreadcrumb(formatCategoryBreadcrumb(cats, selectedCategoryId));
      })
      .catch(() => {
        if (!cancelled) setCategoryBreadcrumb('');
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedCategoryId]);

  const cnyToEgpRate = Number(laborSettings?.cnyToEgpRate ?? 0);

  if (!isOpen) return null;
  if (!isOperationPathEnabled(
    systemSettings,
    isEditFlow ? PRODUCT_OPERATION_KEYS.update : PRODUCT_OPERATION_KEYS.create,
    isEditFlow ? PRODUCT_UPDATE_PATHS.globalModal : PRODUCT_CREATE_PATHS.globalModal,
  )) return null;
  if (isEditFlow) {
    if (!canEditPerm) return null;
  } else if (!canCreate) {
    return null;
  }

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
    setForm(emptyForm);
    close();
  };

  const openBomForProduct = (
    productId: string,
    productName: string,
    source: string = 'products.create.afterSave',
  ) => {
    if (!canOpenBomModal || !productId) return;
    openModal(MODAL_KEYS.PRODUCTS_BOM_MANAGE, {
      productId,
      productName,
      source,
    });
  };

  const handleSave = async () => {
    const normalizedName = form.name.trim();
    if (!normalizedName) {
      toast.error(t('modalManager.createProduct.nameRequiredError'));
      return;
    }
    if (!selectedCategoryId) {
      toast.error(t('modalManager.createProduct.categoryRequiredError'));
      return;
    }
    if (!String(form.barcode || '').trim()) {
      toast.error('باركود عبوة المنتج مطلوب.');
      return;
    }
    const nonNegativeValues = [
      form.sellingPrice,
      form.chineseUnitCost,
      form.innerBoxCost,
      form.outerCartonCost,
      form.unitsPerCarton,
      canViewCosts && cnyToEgpRate > 0
        ? Number(String(chineseUnitPriceYuan).replace(',', '.') || 0)
        : 0,
    ];
    if (nonNegativeValues.some((value) => !Number.isFinite(Number(value ?? 0)) || Number(value ?? 0) < 0)) {
      toast.error(t('modalManager.createProduct.nonNegativeValuesError'));
      return;
    }
    if (!Number.isInteger(Number(form.unitsPerCarton ?? 0))) {
      toast.error(t('modalManager.createProduct.unitsPerCartonIntegerError'));
      return;
    }
    if (
      form.routingTargetUnitSeconds !== undefined &&
      (!Number.isFinite(form.routingTargetUnitSeconds) || form.routingTargetUnitSeconds <= 0)
    ) {
      toast.error(t('modalManager.createProduct.invalidRoutingTargetError'));
      return;
    }
    setSaving(true);
    try {
      if (isEditFlow && editProductId) {
        const codeForSave = productCode.trim().toUpperCase();
        if (!codeForSave) {
          toast.error(t('modalManager.createProduct.manualCodeRequired'));
          return;
        }
        const tSec = form.routingTargetUnitSeconds;
        const hasTarget = typeof tSec === 'number' && Number.isFinite(tSec) && tSec > 0;
        const payloadUpdate: Record<string, unknown> = {
          ...form,
          name: normalizedName,
          categoryId: selectedCategoryId,
          categoryName: categoryBreadcrumb.split(' > ').pop() || form.categoryName,
          code: codeForSave,
          chineseUnitCost: resolveChineseUnitCost(),
        };
        if (!canViewCosts) {
          delete payloadUpdate.chineseUnitCost;
          delete payloadUpdate.innerBoxCost;
          delete payloadUpdate.outerCartonCost;
          delete payloadUpdate.unitsPerCarton;
          delete payloadUpdate.productionOverheadPerUnit;
        }
        if (!canViewSellingPrice) {
          delete payloadUpdate.sellingPrice;
        }
        payloadUpdate.routingTargetUnitSeconds = hasTarget ? Math.round(tSec) : deleteField();
        await updateProduct(
          editProductId,
          payloadUpdate as Partial<FirestoreProduct>,
          { path: PRODUCT_UPDATE_PATHS.globalModal },
        );
        toast.success(t('modalManager.createProduct.editSuccess'));
      } else {
        const codeToSend = codeLocked ? '' : productCode.trim().toUpperCase();
        if (!codeLocked && !codeToSend) {
          toast.error(t('modalManager.createProduct.manualCodeRequired'));
          return;
        }
        const createData: Omit<FirestoreProduct, 'id'> = {
          ...form,
          name: normalizedName,
          categoryId: selectedCategoryId,
          categoryName: categoryBreadcrumb.split(' > ').pop() || '',
          code: codeToSend,
        };
        if (canViewCosts) {
          if (cnyToEgpRate > 0) {
            const yuan = Number(String(chineseUnitPriceYuan).replace(',', '.')) || 0;
            createData.chineseUnitCost = chineseUnitCostEgpFromYuanUnitPrice(yuan, cnyToEgpRate);
          }
        } else {
          delete (createData as { chineseUnitCost?: number }).chineseUnitCost;
          delete (createData as { innerBoxCost?: number }).innerBoxCost;
          delete (createData as { outerCartonCost?: number }).outerCartonCost;
          delete (createData as { unitsPerCarton?: number }).unitsPerCarton;
          delete (createData as { productionOverheadPerUnit?: number }).productionOverheadPerUnit;
        }
        if (!canViewSellingPrice) {
          delete (createData as { sellingPrice?: number }).sellingPrice;
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
        const id = await createProduct(
          createData,
          { path: PRODUCT_CREATE_PATHS.globalModal },
        );
        toast.success(t('modalManager.createProduct.createSuccess'));
        setForm(emptyForm);
        close();
        openBomForProduct(id, normalizedName);
      }
    } catch (e) {
      if (isDuplicateEntityCodeError(e)) {
        toast.error(t('entityCode.duplicateError'));
      } else {
        toast.error(productSaveErrorMessage(e, t));
      }
    } finally {
      setSaving(false);
    }
  };

  const editMissing =
    isEditFlow && editProductId && !productsLoading && (!editingProduct || !editingRaw);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent
        dir="rtl"
        className="flex max-h-[calc(100dvh-1.5rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogHeader className="shrink-0 border-b px-5 py-4 text-right sm:text-right">
          <DialogTitle>
            {isEditFlow
              ? t('modalManager.createProduct.editTitle')
              : t('modalManager.createProduct.title')}
          </DialogTitle>
          <DialogDescription>
            {isEditFlow
              ? t('modalManager.createProduct.editDescription')
              : t('modalManager.createProduct.createDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {editMissing && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {t('modalManager.createProduct.editNotFound')}
            </div>
          )}

          {isEditFlow && !editingProduct && productsLoading && !editMissing && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm font-medium">{t('modalManager.createProduct.loading')}</p>
            </div>
          )}

          {!editMissing &&
            !(isEditFlow && !editingProduct && productsLoading) && (
              <div className="space-y-5">
                <section className="space-y-3" aria-labelledby="product-identity-heading">
                  <div>
                    <h4 id="product-identity-heading" className="text-sm font-semibold">
                      {t('modalManager.createProduct.identitySection')}
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('modalManager.createProduct.identityHelp')}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="product-category">
                      {t('modalManager.createProduct.categoryModelRequired')}
                    </Label>
                    <CategoryTreeSelect
                      id="product-category"
                      value={selectedCategoryId}
                      required
                      placeholder={t('modalManager.createProduct.categoryModelPlaceholder')}
                      onChange={(id, breadcrumb) => {
                        setSelectedCategoryId(id);
                        setCategoryBreadcrumb(breadcrumb);
                        const leaf = breadcrumb.split(' > ').pop() || '';
                        setForm((current) => ({
                          ...current,
                          categoryId: id,
                          categoryName: leaf,
                          model: leaf,
                        }));
                      }}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="product-name">
                        {t('modalManager.createProduct.productNameRequired')}
                      </Label>
                      <Input
                        id="product-name"
                        autoFocus={!isEditFlow}
                        value={form.name}
                        onChange={(e) =>
                          setForm((current) => ({ ...current, name: e.target.value }))
                        }
                        placeholder={t('modalManager.createProduct.productNamePlaceholder')}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="product-code">
                        {t('modalManager.createProduct.codeLabel')}
                      </Label>
                      <div className="flex items-start gap-2">
                        <div className="relative min-w-0 flex-1">
                          <Input
                            id="product-code"
                            dir="ltr"
                            readOnly={codeLocked}
                            value={productCode}
                            onChange={(e) => setProductCode(e.target.value.toUpperCase())}
                            placeholder="PRD-00001"
                            className={`font-mono ${codeLocked ? 'bg-muted/60' : ''}`}
                          />
                          {codePreviewLoading && (
                            <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          bare
                          onClick={toggleCodeLock}
                          aria-label={
                            codeLocked
                              ? t('entityCode.unlockTitle')
                              : t('entityCode.lockTitle')
                          }
                          title={
                            codeLocked
                              ? t('entityCode.unlockTitle')
                              : t('entityCode.lockTitle')
                          }
                        >
                          {codeLocked ? <Lock /> : <Unlock />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {codeLocked ? t('entityCode.lockHint') : t('entityCode.unlockedHint')}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="product-barcode">باركود عبوة المنتج</Label>
                    <Input
                      id="product-barcode"
                      dir="ltr"
                      inputMode="numeric"
                      value={form.barcode || ''}
                      onChange={(e) => setForm((current) => ({ ...current, barcode: e.target.value.trim() }))}
                      placeholder="مثال: 6221234567890"
                    />
                    <p className="text-xs text-muted-foreground">
                      باركود واحد وفريد داخل الشركة، ويستخدمه العميل لإنشاء طلب الصيانة.
                    </p>
                  </div>
                </section>

                <section className="space-y-3 border-t pt-4" aria-labelledby="product-operation-heading">
                  <div>
                    <h4 id="product-operation-heading" className="text-sm font-semibold">
                      {t('modalManager.createProduct.operationsSection')}
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('modalManager.createProduct.operationsHelp')}
                    </p>
                  </div>

                  <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-3">
                    <Checkbox
                      id="product-is-manufactured"
                      checked={form.isManufactured !== false}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          isManufactured: checked === true,
                        }))
                      }
                    />
                    <div className="space-y-1">
                      <Label htmlFor="product-is-manufactured">
                        {t('modalManager.createProduct.isManufactured')}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t('modalManager.createProduct.isManufacturedHelp')}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      aria-pressed={(form.assemblyMode ?? 'individual') === 'individual'}
                      onClick={() =>
                        setForm((current) => ({ ...current, assemblyMode: 'individual' }))
                      }
                      className={`rounded-lg border p-4 text-right transition-colors ${
                        (form.assemblyMode ?? 'individual') === 'individual'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <span className="block text-sm font-semibold">
                        {t('modalManager.createProduct.individualAssembly')}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {t('modalManager.createProduct.individualAssemblyHelp')}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={form.assemblyMode === 'team'}
                      onClick={() =>
                        setForm((current) => ({ ...current, assemblyMode: 'team' }))
                      }
                      className={`rounded-lg border p-4 text-right transition-colors ${
                        form.assemblyMode === 'team'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-border hover:border-primary/50'
                      }`}
                    >
                      <span className="block text-sm font-semibold">
                        {t('modalManager.createProduct.teamAssembly')}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {t('modalManager.createProduct.teamAssemblyHelp')}
                      </span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="product-routing-target">
                      {t('modalManager.createProduct.routingTargetLabel')}
                    </Label>
                    <Input
                      id="product-routing-target"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={form.routingTargetUnitSeconds ?? ''}
                      placeholder={t('modalManager.createProduct.routingTargetPlaceholder')}
                      onChange={(e) => {
                        const value = e.target.value.trim();
                        setForm((current) => ({
                          ...current,
                          routingTargetUnitSeconds:
                            value === '' ? undefined : Math.round(Number(value)),
                        }));
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('modalManager.createProduct.routingTargetHelp')}
                    </p>
                  </div>

                  <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-3">
                    <Checkbox
                      id="product-auto-deduct-scrap"
                      checked={form.autoDeductComponentScrapFromDecomposed === true}
                      onCheckedChange={(checked) =>
                        setForm((current) => ({
                          ...current,
                          autoDeductComponentScrapFromDecomposed: checked === true,
                        }))
                      }
                    />
                    <div className="space-y-1">
                      <Label htmlFor="product-auto-deduct-scrap">
                        {t('modalManager.createProduct.autoDeductScrap')}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t('modalManager.createProduct.autoDeductScrapHelp')}
                      </p>
                    </div>
                  </div>
                </section>

                {(canViewSellingPrice || canViewCosts) ? (
                <section className="space-y-3 border-t pt-4" aria-labelledby="product-pricing-heading">
                  <div>
                    <h4 id="product-pricing-heading" className="text-sm font-semibold">
                      {t('modalManager.createProduct.pricingSection')}
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('modalManager.createProduct.pricingHelp')}
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {canViewSellingPrice ? (
                    <div className="space-y-1.5">
                      <Label htmlFor="product-selling-price">
                        {t('modalManager.createProduct.sellingPrice')}
                      </Label>
                      <Input
                        id="product-selling-price"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={form.sellingPrice ?? ''}
                        placeholder="0"
                        onChange={(e) =>
                          setForm((current) => ({
                            ...current,
                            sellingPrice: Number(e.target.value),
                          }))
                        }
                      />
                    </div>
                    ) : null}

                    {canViewCosts && cnyToEgpRate > 0 && (
                      <div className="space-y-1.5">
                        <Label htmlFor="product-cny-price">
                          {t('modalManager.createProduct.chineseUnitPriceYuan')}
                        </Label>
                        <Input
                          id="product-cny-price"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={chineseUnitPriceYuan}
                          placeholder="0"
                          onChange={(e) => setChineseUnitPriceYuan(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
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
                      </div>
                    )}

                    {canViewCosts && cnyToEgpRate <= 0 && (
                      <div className="space-y-1.5">
                        <Label htmlFor="product-chinese-cost">
                          {t('modalManager.createProduct.chineseUnitCostManualEgp')}
                        </Label>
                        <Input
                          id="product-chinese-cost"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="any"
                          value={form.chineseUnitCost ?? ''}
                          placeholder="0"
                          onChange={(e) =>
                            setForm((current) => ({
                              ...current,
                              chineseUnitCost: Number(e.target.value),
                            }))
                          }
                        />
                        <p className="text-xs text-[var(--color-warning-hex)]">
                          {t('modalManager.createProduct.cnyRateMissingHint')}
                        </p>
                      </div>
                    )}

                    {canViewCosts && (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="product-inner-box-cost">
                            {t('modalManager.createProduct.innerBoxCost')}
                          </Label>
                          <Input
                            id="product-inner-box-cost"
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            value={form.innerBoxCost ?? ''}
                            placeholder="0"
                            onChange={(e) =>
                              setForm((current) => ({
                                ...current,
                                innerBoxCost: Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="product-outer-carton-cost">
                            {t('modalManager.createProduct.outerCartonCost')}
                          </Label>
                          <Input
                            id="product-outer-carton-cost"
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            value={form.outerCartonCost ?? ''}
                            placeholder="0"
                            onChange={(e) =>
                              setForm((current) => ({
                                ...current,
                                outerCartonCost: Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="product-units-per-carton">
                            {t('modalManager.createProduct.unitsPerCarton')}
                          </Label>
                          <Input
                            id="product-units-per-carton"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            value={form.unitsPerCarton ?? ''}
                            placeholder="0"
                            onChange={(e) =>
                              setForm((current) => ({
                                ...current,
                                unitsPerCarton: Number(e.target.value),
                              }))
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>
                </section>
                ) : null}

              </div>
            )
          }
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-5 py-4 sm:space-x-0">
          <Button type="button" variant="outline" disabled={saving} onClick={handleClose}>
            {t('ui.cancel')}
          </Button>
          {isEditFlow && editProductId && canOpenBomModal ? (
            <Button
              type="button"
              variant="outline"
              disabled={saving || editMissing}
              onClick={() =>
                openBomForProduct(
                  editProductId,
                  editingProduct?.name || form.name || '',
                  'products.edit.bom',
                )
              }
            >
              مكونات
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={
              saving ||
              editMissing ||
              (isEditFlow && (!editingProduct || !editingRaw)) ||
              !form.name.trim() ||
              !selectedCategoryId ||
              (!isEditFlow && !codeLocked && !productCode.trim())
            }
          >
            {saving && <Loader2 className="animate-spin" />}
            {isEditFlow
              ? t('modalManager.createProduct.saveEdits')
              : t('modalManager.createProduct.addProduct')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
