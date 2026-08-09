import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, Lock, Loader2, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { Button } from '../../production/components/UI';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { useResourcePermission } from '@/utils/useResourcePermission';
import {
  categoryService,
  isProductCategoryRow,
  type ProductCategory,
} from '../services/categoryService';
import { useAppStore } from '../../../store/useAppStore';
import { useAutoEntityCode } from '../../shared/hooks/useAutoEntityCode';
import { DUPLICATE_ENTITY_CODE } from '../../shared/services/entityCodeSequenceService';
import {
  buildCategoryTree,
  flattenCategoryTree,
  formatCategoryBreadcrumb,
  normalizeCategoryName,
} from '../lib/categoryTree';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';

type CategoryForm = {
  name: string;
  parentId: string | null;
  isActive: boolean;
  sortOrder?: number;
};

const buildEmptyForm = (parentId: string | null = null): CategoryForm => ({
  name: '',
  parentId,
  isActive: true,
  sortOrder: 0,
});

function isDuplicateEntityCodeError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.message === DUPLICATE_ENTITY_CODE || (e as Error & { code?: string }).code === DUPLICATE_ENTITY_CODE)
  );
}

type CategoriesPageData = {
  items: ProductCategory[];
  usageById: Record<string, { productCount: number; childrenCount: number }>;
};

const CATEGORIES_CACHE_KEY = 'catalog:categories';

export const Categories: React.FC = () => {
  const { t } = useTranslation();
  const categoryPerms = useResourcePermission('catalog.categories');
  const location = useLocation();
  const navigate = useTenantNavigate();
  const canView = categoryPerms.canView;
  const canCreate = categoryPerms.canCreate;
  const canEdit = categoryPerms.canEdit;
  const canDelete = categoryPerms.canDelete;
  const rawProducts = useAppStore((s) => s._rawProducts);

  const initialCategoriesCache = peekPageDataCache<CategoriesPageData>(CATEGORIES_CACHE_KEY);
  const [items, setItems] = useState<ProductCategory[]>(() => initialCategoriesCache?.items ?? []);
  const [loading, setLoading] = useState(() => initialCategoriesCache == null);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(buildEmptyForm());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [usageById, setUsageById] = useState<
    Record<string, { productCount: number; childrenCount: number }>
  >(() => initialCategoriesCache?.usageById ?? {});

  const productCategories = useMemo(() => items.filter(isProductCategoryRow), [items]);

  const editingCategory = useMemo(
    () => (editId ? productCategories.find((i) => i.id === editId) : undefined),
    [editId, productCategories],
  );

  const peekCategory = useCallback(() => categoryService.peekNextCode('product'), []);

  const {
    code: categoryCode,
    setCode: setCategoryCode,
    locked: categoryCodeLocked,
    toggleLock: toggleCategoryCodeLock,
    isLoading: categoryCodeLoading,
  } = useAutoEntityCode({
    enabled: canView && (canCreate || canEdit),
    isEditMode: Boolean(editId),
    initialCode: editingCategory?.code ?? '',
    peek: peekCategory,
  });

  const loadData = useCallback(async (opts?: { force?: boolean }) => {
    const cached = peekPageDataCache<CategoriesPageData>(CATEGORIES_CACHE_KEY);
    if (cached) {
      setItems(cached.items);
      setUsageById(cached.usageById);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const { data } = await fetchCachedPageData(
        CATEGORIES_CACHE_KEY,
        async () => {
          const list = await categoryService.getAll();
          const productOnly = list.filter(isProductCategoryRow);
          let usage: CategoriesPageData['usageById'] = {};
          try {
            usage = await categoryService.getBulkCategoryUsageCounts(productOnly);
          } catch (usageError) {
            console.error('[categories] usage counts failed', usageError);
            toast.error('تم تحميل الفئات لكن تعذر حساب عدد المنتجات المرتبطة.');
          }
          return { items: list, usageById: usage };
        },
        { force: opts?.force === true, maxAgeMs: 60_000 },
      );
      setItems(data.items);
      setUsageById(data.usageById);
    } catch (error) {
      console.error('[categories] load failed', error);
      toast.error('تعذر تحميل الفئات حالياً.');
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    invalidatePageDataCache(CATEGORIES_CACHE_KEY);
    await loadData({ force: true });
  }, [loadData]);

  useEffect(() => {
    if (!canView) return;
    void loadData();
  }, [canView, loadData]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') !== 'create') return;
    if (!canCreate) return;
    const parentId = params.get('parentId') || null;
    setEditId(null);
    setForm(buildEmptyForm(parentId));
    navigate('/catalog/categories', { replace: true });
  }, [location.search, canCreate, navigate]);

  const legacyUsageByName = useMemo(() => {
    const usage = new Map<string, number>();
    rawProducts.forEach((product) => {
      if (product.categoryId) return;
      const key = normalizeCategoryName(product.model || product.category || '');
      if (!key) return;
      usage.set(key, (usage.get(key) || 0) + 1);
    });
    return usage;
  }, [rawProducts]);

  const treeRows = useMemo(() => {
    const tree = buildCategoryTree(productCategories);
    return flattenCategoryTree(tree);
  }, [productCategories]);

  const parentOptions = useMemo(
    () => productCategories.filter((c) => c.isActive !== false && c.id !== editId),
    [productCategories, editId],
  );

  const resetForm = (parentId: string | null = null) => {
    setEditId(null);
    setForm(buildEmptyForm(parentId));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    const nameTrim = form.name.trim();
    let codePayload = '';
    if (editId) {
      codePayload = categoryCode.trim().toUpperCase();
      if (!codePayload) {
        toast.error(t('modalManager.categories.codeRequired'));
        return;
      }
    } else if (categoryCodeLocked) {
      codePayload = '';
    } else {
      codePayload = categoryCode.trim().toUpperCase();
      if (!codePayload) {
        toast.error(t('modalManager.categories.manualCodeRequired'));
        return;
      }
    }
    setSaving(true);
    try {
      if (editId) {
        await categoryService.updateCategory(editId, {
          name: nameTrim,
          code: codePayload,
          parentId: form.parentId,
          isActive: form.isActive,
          sortOrder: form.sortOrder,
        });
        toast.success('تم تحديث الفئة بنجاح.');
      } else {
        await categoryService.createCategory({
          name: nameTrim,
          code: codePayload,
          parentId: form.parentId,
          isActive: form.isActive,
          sortOrder: form.sortOrder,
        });
        toast.success('تمت إضافة الفئة بنجاح.');
      }
      resetForm();
      await reload();
    } catch (e) {
      if (isDuplicateEntityCodeError(e)) {
        toast.error(t('entityCode.duplicateError'));
      } else if (e instanceof Error && e.message === 'CATEGORY_PARENT_CYCLE') {
        toast.error('لا يمكن اختيار فئة فرعية كأب — يوجد حلقة.');
      } else {
        toast.error('تعذر حفظ الفئة. حاول مرة أخرى.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: ProductCategory) => {
    setEditId(item.id || null);
    setForm({
      name: item.name || '',
      parentId: item.parentId ?? null,
      isActive: item.isActive !== false,
      sortOrder: item.sortOrder ?? 0,
    });
  };

  const handleDeactivate = async (id: string) => {
    if (!window.confirm('إيقاف هذه الفئة؟')) return;
    try {
      await categoryService.deactivateCategory(id);
      toast.success('تم إيقاف الفئة.');
      await reload();
    } catch {
      toast.error('تعذر إيقاف الفئة.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('حذف هذه الفئة نهائياً؟')) return;
    try {
      await categoryService.deleteCategory(id);
      toast.success('تم حذف الفئة.');
      await reload();
    } catch (e) {
      const msg =
        e instanceof Error && e.message === 'CATEGORY_HAS_CHILDREN'
          ? 'لا يمكن الحذف: للفئة فئات فرعية.'
          : e instanceof Error && e.message === 'CATEGORY_HAS_PRODUCTS'
            ? 'لا يمكن الحذف: مرتبطة بمنتجات.'
            : 'تعذر حذف الفئة.';
      toast.error(msg);
    }
  };

  const handleMigrate = async () => {
    if (!window.confirm('تشغيل ترحيل ربط المنتجات بالفئات (v1)؟')) return;
    setMigrating(true);
    try {
      const { migrateProductCategoriesV1 } = await import('../services/categoryMigration');
      const result = await migrateProductCategoriesV1();
      toast.success(
        `تم ترحيل ${result.productsUpdated} منتج وتحديث ${result.categoriesHierarchyUpdated} فئة هيكلية.`,
      );
      await reload();
      await useAppStore.getState().fetchProducts();
    } catch {
      toast.error('فشل ترحيل الفئات.');
    } finally {
      setMigrating(false);
    }
  };

  const getProductUsage = (item: ProductCategory) => {
    if (item.id && usageById[item.id]) return usageById[item.id].productCount;
    const key = normalizeCategoryName(item.name);
    return key ? legacyUsageByName.get(key) || 0 : 0;
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleTreeRows = useMemo(() => {
    return treeRows.filter(({ category, depth }) => {
      if (!category.id) return false;
      if (depth === 0) return true;
      const path = category.path ?? [];
      return path.every((aid) => expanded.has(aid));
    });
  }, [treeRows, expanded]);

  const activeCount = productCategories.filter((c) => c.isActive !== false).length;

  if (!canView) return null;

  return (
    <ModuleOpsPageShell
      eyebrow="فئات المنتجات"
      rangeLabel="هيكل تصنيفات المنتجات (رئيسية وفرعية)"
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--color-text-muted)]">
            إجمالي الفئات: <strong>{productCategories.length}</strong> — نشطة:{' '}
            <strong>{activeCount}</strong>
          </span>
          {canCreate && (
            <>
              <Button variant="outline" onClick={() => resetForm(null)}>
                فئة رئيسية
              </Button>
              <Button variant="primary" onClick={handleMigrate} disabled={migrating}>
                {migrating ? 'جاري الترحيل...' : 'ترحيل ربط المنتجات'}
              </Button>
            </>
          )}
          {(canCreate || (canEdit && editId)) && (
            <Button variant="outline" onClick={() => resetForm(form.parentId)}>
              إعادة تعيين
            </Button>
          )}
        </div>
      )}
    >
      <OpsDashPanel accent="production" bodyClassName="space-y-4">

        {(canCreate || canEdit) && (
          <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
            <input
              className="sm:col-span-2 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-3 text-sm"
              placeholder="اسم الفئة"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <select
              className="sm:col-span-2 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-3 text-sm bg-white"
              value={form.parentId ?? ''}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  parentId: e.target.value ? e.target.value : null,
                }))
              }
            >
              <option value="">فئة رئيسية (بدون أب)</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatCategoryBreadcrumb(productCategories, p.id)} — {p.name}
                </option>
              ))}
            </select>
            <div className="space-y-1 sm:col-span-2">
              <div className="flex gap-2 items-center">
                <div className="relative flex-1 min-w-0">
                  <input
                    readOnly={categoryCodeLocked}
                    className={`w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-3 text-sm font-mono ${categoryCodeLocked ? 'opacity-90' : ''}`}
                    placeholder={t('modalManager.categories.codePlaceholder')}
                    value={categoryCode}
                    onChange={(e) => setCategoryCode(e.target.value.toUpperCase())}
                  />
                  {categoryCodeLoading && !editId && (
                    <Loader2 className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[var(--color-text-muted)]" />
                  )}
                </div>
                <button
                  type="button"
                  className="shrink-0 p-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-white hover:bg-[var(--color-bg)]"
                  onClick={toggleCategoryCodeLock}
                  title={categoryCodeLocked ? t('entityCode.unlockTitle') : t('entityCode.lockTitle')}
                >
                  {categoryCodeLocked ? <Lock size={18} /> : <Unlock size={18} />}
                </button>
              </div>
            </div>
            <label className="text-sm font-bold flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              نشطة
            </label>
            <div className="sm:col-span-4">
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={
                  saving ||
                  !form.name.trim() ||
                  (!editId && !canCreate) ||
                  (editId !== null && !canEdit) ||
                  (!editId && !categoryCodeLocked && !categoryCode.trim())
                }
              >
                {editId ? 'حفظ التعديلات' : form.parentId ? 'إضافة فئة فرعية' : 'إضافة فئة رئيسية'}
              </Button>
            </div>
          </div>
        )}
      </OpsDashPanel>

      <OpsDashPanel title="شجرة الفئات" accent="production" bodyClassName="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="erp-table w-full text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الاسم</th>
                <th className="erp-th">الكود</th>
                <th className="erp-th text-center">منتجات</th>
                <th className="erp-th text-center">فروع</th>
                <th className="erp-th">الحالة</th>
                <th className="erp-th text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[var(--color-text-muted)]">
                    جاري التحميل...
                  </td>
                </tr>
              )}
              {!loading && visibleTreeRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[var(--color-text-muted)]">
                    لا توجد فئات منتجات حتى الآن.
                  </td>
                </tr>
              )}
              {visibleTreeRows.map(({ category, depth }) => {
                if (!category.id) return null;
                const id = category.id;
                const hasKids = productCategories.some((c) => c.parentId === id);
                const usage = usageById[id];
                return (
                  <tr key={id} className="hover:bg-[#f8f9fa]/50 transition-colors">
                    <td className="px-5 py-4 font-bold">
                      <div
                        className="flex items-center gap-1"
                        style={{ paddingRight: `${depth * 16}px` }}
                      >
                        {hasKids ? (
                          <button
                            type="button"
                            className="p-0.5"
                            onClick={() => toggleExpand(id)}
                          >
                            {expanded.has(id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          <span className="w-5" />
                        )}
                        {category.name}
                      </div>
                    </td>
                    <td className="px-5 py-4">{category.code || '—'}</td>
                    <td className="px-5 py-4 text-center font-bold">{getProductUsage(category)}</td>
                    <td className="px-5 py-4 text-center">{usage?.childrenCount ?? 0}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`text-xs font-bold px-2 py-1 rounded ${
                          category.isActive !== false
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {category.isActive !== false ? 'نشطة' : 'موقفة'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        {canCreate && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditId(null);
                              setForm(buildEmptyForm(id));
                            }}
                            title="إضافة فرعية"
                          >
                            + فرعية
                          </Button>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => handleEdit(category)}
                            className="p-1.5 text-[var(--color-text-muted)] hover:text-primary"
                            title="تعديل"
                          >
                            <span className="material-icons-round text-[18px]">edit</span>
                          </button>
                        )}
                        {canEdit && category.isActive !== false && (
                          <button
                            onClick={() => void handleDeactivate(id)}
                            className="p-1.5 text-[var(--color-text-muted)] hover:text-amber-600"
                            title="إيقاف"
                          >
                            <span className="material-icons-round text-[18px]">pause_circle</span>
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => void handleDelete(id)}
                            className="p-1.5 text-[var(--color-text-muted)] hover:text-rose-500"
                            title="حذف"
                          >
                            <span className="material-icons-round text-[18px]">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};
