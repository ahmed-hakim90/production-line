import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button } from '@/modules/production/components/UI';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePermission } from '@/utils/permissions';
import {
  materialCategoryService,
  type MaterialCategory,
} from '../services/materialCategoryService';
import {
  buildCategoryTree,
  flattenCategoryTree,
  formatCategoryBreadcrumb,
} from '../../catalog/lib/categoryTree';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';
import { isDuplicateEntityCodeError } from '../../shared/lib/entityCodeClaim';
import {
  INVALID_MATERIAL_CATEGORY_CODE,
  isValidMaterialCategoryCode,
  normalizeMaterialCategoryCode,
} from '../lib/materialCode';

const CATEGORIES_CACHE_KEY = 'manufacturing:material-categories';

type MaterialCategoriesPageData = {
  items: MaterialCategory[];
  usageById: Record<string, { materialCount: number; childrenCount: number }>;
};

type FormState = {
  code: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
};

const emptyForm = (parentId: string | null = null): FormState => ({
  code: '',
  name: '',
  parentId,
  isActive: true,
});

export const MaterialCategories: React.FC = () => {
  const { can } = usePermission();
  const canView = can('materials.view');
  const canManage = can('materials.manage');

  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [migrating, setMigrating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    data,
    loading,
    reload: reloadCached,
  } = useCachedPageLoad<MaterialCategoriesPageData>(
    canView ? CATEGORIES_CACHE_KEY : null,
    async () => {
      const list = await materialCategoryService.getAll();
      let usageById: Record<string, { materialCount: number; childrenCount: number }> = {};
      try {
        usageById = await materialCategoryService.getBulkCategoryUsageCounts(list);
      } catch (usageError) {
        console.error('[material-categories] usage counts failed', usageError);
        toast.error('تم تحميل الفئات لكن تعذر حساب عدد المواد المرتبطة.');
      }
      return { items: list, usageById };
    },
    { maxAgeMs: 60_000 },
  );

  const items = data?.items ?? [];
  const usageById = data?.usageById ?? {};

  const loadData = async () => {
    invalidatePageDataCache(CATEGORIES_CACHE_KEY);
    await reloadCached(true);
  };

  const treeRows = useMemo(() => flattenCategoryTree(buildCategoryTree(items)), [items]);

  const visibleRows = useMemo(
    () =>
      treeRows.filter(({ category, depth }) => {
        if (!category.id) return false;
        if (depth === 0) return true;
        return (category.path ?? []).every((aid) => expanded.has(aid));
      }),
    [treeRows, expanded],
  );

  const parentOptions = useMemo(
    () => items.filter((c) => c.isActive !== false && c.id !== editId),
    [items, editId],
  );

  const handleSubmit = async () => {
    if (!form.name.trim() || !isValidMaterialCategoryCode(form.code) || !canManage) return;
    setSaving(true);
    try {
      if (editId) {
        await materialCategoryService.updateCategory(editId, form);
        toast.success('تم تحديث الفئة.');
      } else {
        await materialCategoryService.createCategory(form);
        toast.success('تمت إضافة الفئة.');
      }
      setEditId(null);
      setForm(emptyForm());
      await loadData();
    } catch (e) {
      let text = 'تعذر الحفظ.';
      if (isDuplicateEntityCodeError(e)) {
        text = 'كود الفئة مستخدم بالفعل.';
      } else if (e instanceof Error && e.message === 'CATEGORY_PARENT_CYCLE') {
        text = 'تعذر الحفظ: حلقة في شجرة الفئات.';
      } else if (e instanceof Error && e.message === INVALID_MATERIAL_CATEGORY_CODE) {
        text = 'كود الفئة يجب أن يكون من 2 إلى 8 حروف إنجليزية أو أرقام.';
      }
      toast.error(text);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category: MaterialCategory) => {
    if (!canManage || !category.id || deletingId) return;
    const usage = usageById[category.id];
    if (!usage || usage.materialCount > 0 || usage.childrenCount > 0) {
      toast.error('لا يمكن حذف فئة مرتبطة بمواد أو تحتوي فئات فرعية.');
      return;
    }
    if (!window.confirm(`حذف فئة "${category.name}" نهائياً؟ لا يمكن التراجع عن الحذف.`)) {
      return;
    }

    setDeletingId(category.id);
    try {
      await materialCategoryService.deleteCategory(category.id);
      if (editId === category.id) {
        setEditId(null);
        setForm(emptyForm());
      }
      toast.success('تم حذف الفئة.');
      await loadData();
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      const text =
        reason === 'CATEGORY_HAS_CHILDREN'
          ? 'لا يمكن حذف الفئة لأنها تحتوي فئات فرعية.'
          : reason === 'CATEGORY_HAS_MATERIALS'
            ? 'لا يمكن حذف الفئة لأنها مرتبطة بمواد.'
            : 'تعذر حذف الفئة. حاول مرة أخرى.';
      toast.error(text);
    } finally {
      setDeletingId(null);
    }
  };

  if (!canView) {
    return <p className="p-8 text-center text-muted-foreground">لا توجد صلاحية</p>;
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHeader
        title="فئات المواد التصنيعية"
        subtitle="تصنيف هرمي للمواد الخام والمستهلكات"
        primaryAction={
          canManage
            ? { label: 'فئة رئيسية', onClick: () => { setEditId(null); setForm(emptyForm()); }, icon: 'add' }
            : undefined
        }
        moreActions={
          canManage
            ? [
                {
                  label: migrating ? 'جاري الترحيل...' : 'ترحيل من أسماء قديمة',
                  onClick: () => void (async () => {
                    if (!window.confirm('ربط المواد بفئات من حقل categoryName القديم؟')) return;
                    setMigrating(true);
                    try {
                      const { migrateMaterialCategoriesV1 } = await import(
                        '../../catalog/services/categoryMigration'
                      );
                      const r = await migrateMaterialCategoriesV1();
                      toast.success(`تم ترحيل ${r.categoriesCreated} فئة وربط ${r.materialsUpdated} مادة.`);
                      await loadData();
                    } catch {
                      toast.error('فشل ترحيل الفئات.');
                    } finally {
                      setMigrating(false);
                    }
                  })(),
                  disabled: migrating,
                },
              ]
            : []
        }
      />

      {canManage && (
        <Card>
          <div className="grid items-start gap-3 md:grid-cols-[minmax(160px,0.7fr)_minmax(240px,1.3fr)_minmax(200px,1fr)_auto]">
            <div className="space-y-1.5">
            <Label htmlFor="material-category-code">كود الفئة *</Label>
            <Input
              id="material-category-code"
              dir="ltr"
              maxLength={8}
              placeholder="مثال: INJ"
              value={form.code}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  code: normalizeMaterialCategoryCode(e.target.value).replace(/[^A-Z0-9]/g, ''),
                }))
              }
              aria-describedby="material-category-code-help"
            />
            <p id="material-category-code-help" className="text-xs text-muted-foreground">
              يُستخدم كبادئة لكود المادة، مثل INJ-0001.
            </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="material-category-name">اسم الفئة *</Label>
              <Input
                id="material-category-name"
                placeholder="مثال: حقن"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="material-category-parent">الفئة الأب</Label>
              <select
                id="material-category-parent"
                className="h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm"
                value={form.parentId ?? ''}
                onChange={(e) =>
                  setForm((f) => ({ ...f, parentId: e.target.value || null }))
                }
              >
                <option value="">فئة رئيسية</option>
                {parentOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatCategoryBreadcrumb(items, p.id)} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="primary"
              className="md:mt-6"
              onClick={() => void handleSubmit()}
              disabled={saving || !form.name.trim() || !isValidMaterialCategoryCode(form.code)}
            >
              {editId ? 'حفظ' : 'إضافة'}
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto !p-0">
        <table className="erp-table w-full text-right">
          <thead className="erp-thead">
            <tr>
              <th className="erp-th">الكود</th>
              <th className="erp-th">الاسم</th>
              <th className="erp-th text-center">مواد</th>
              <th className="erp-th text-center">فروع</th>
              <th className="erp-th">الحالة</th>
              {canManage && <th className="erp-th text-center">إجراء</th>}
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">
                  جاري التحميل...
                </td>
              </tr>
            ) : (
              visibleRows.map(({ category, depth }) => {
                if (!category.id) return null;
                const id = category.id;
                const usage = usageById[id];
                const hasKids = items.some((c) => c.parentId === id);
                const canDelete =
                  usage !== undefined &&
                  usage.materialCount === 0 &&
                  usage.childrenCount === 0;
                const deleteDisabledReason =
                  usage?.materialCount
                    ? 'الفئة مرتبطة بمواد'
                    : usage?.childrenCount
                      ? 'الفئة تحتوي فئات فرعية'
                      : usage
                        ? 'حذف الفئة'
                        : 'جاري التحقق من الارتباطات';
                return (
                  <tr key={id} className="border-b">
                    <td className="px-4 py-3 font-mono text-sm" dir="ltr">
                      {category.code || '—'}
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ paddingRight: `${12 + depth * 16}px` }}>
                      <div className="flex items-center gap-1">
                        {hasKids && (
                          <button type="button" onClick={() => setExpanded((s) => {
                            const n = new Set(s);
                            if (n.has(id)) n.delete(id);
                            else n.add(id);
                            return n;
                          })}>
                            {expanded.has(id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        )}
                        {category.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">{usage?.materialCount ?? 0}</td>
                    <td className="px-4 py-3 text-center">{usage?.childrenCount ?? 0}</td>
                    <td className="px-4 py-3">{category.isActive !== false ? 'نشطة' : 'موقفة'}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-center">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditId(id);
                            setForm({
                              code: category.code || '',
                              name: category.name,
                              parentId: category.parentId ?? null,
                              isActive: category.isActive !== false,
                            });
                          }}
                        >
                          تعديل
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void materialCategoryService.deactivateCategory(id).then(loadData)}
                        >
                          إيقاف
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={!canDelete || deletingId !== null}
                          title={deleteDisabledReason}
                          onClick={() => void handleDelete(category)}
                        >
                          {deletingId === id ? 'جاري الحذف...' : 'حذف'}
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
};
