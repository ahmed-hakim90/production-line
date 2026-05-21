import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Card, Button } from '@/modules/production/components/UI';
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

type FormState = {
  name: string;
  parentId: string | null;
  isActive: boolean;
};

const emptyForm = (parentId: string | null = null): FormState => ({
  name: '',
  parentId,
  isActive: true,
});

export const MaterialCategories: React.FC = () => {
  const { can } = usePermission();
  const canView = can('materials.view');
  const canManage = can('materials.manage');

  const [items, setItems] = useState<MaterialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [usageById, setUsageById] = useState<
    Record<string, { materialCount: number; childrenCount: number }>
  >({});

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await materialCategoryService.getAll();
      setItems(list);
      try {
        setUsageById(await materialCategoryService.getBulkCategoryUsageCounts(list));
      } catch (usageError) {
        console.error('[material-categories] usage counts failed', usageError);
        setUsageById({});
        setMessage({
          type: 'error',
          text: 'تم تحميل الفئات لكن تعذر حساب عدد المواد المرتبطة.',
        });
      }
    } catch (error) {
      console.error('[material-categories] load failed', error);
      setMessage({ type: 'error', text: 'تعذر تحميل الفئات.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) void loadData();
  }, [canView]);

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
    if (!form.name.trim() || !canManage) return;
    setSaving(true);
    setMessage(null);
    try {
      if (editId) {
        await materialCategoryService.updateCategory(editId, form);
        setMessage({ type: 'success', text: 'تم التحديث.' });
      } else {
        await materialCategoryService.createCategory(form);
        setMessage({ type: 'success', text: 'تمت الإضافة.' });
      }
      setEditId(null);
      setForm(emptyForm());
      await loadData();
    } catch (e) {
      const text =
        e instanceof Error && e.message === 'CATEGORY_PARENT_CYCLE'
          ? 'تعذر الحفظ: حلقة في شجرة الفئات.'
          : 'تعذر الحفظ.';
      setMessage({ type: 'error', text });
    } finally {
      setSaving(false);
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
                      setMessage({
                        type: 'success',
                        text: `تم: ${r.categoriesCreated} فئة، ${r.materialsUpdated} مادة.`,
                      });
                      await loadData();
                    } catch {
                      setMessage({ type: 'error', text: 'فشل الترحيل.' });
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

      {message && (
        <p
          className={`rounded px-3 py-2 text-sm ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'
          }`}
        >
          {message.text}
        </p>
      )}

      {canManage && (
        <Card className="grid gap-3 sm:grid-cols-4 p-4">
          <input
            className="rounded border px-3 py-2 text-sm sm:col-span-2"
            placeholder="اسم الفئة"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <select
            className="rounded border px-3 py-2 text-sm"
            value={form.parentId ?? ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, parentId: e.target.value || null }))
            }
          >
            <option value="">رئيسية</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {formatCategoryBreadcrumb(items, p.id)} — {p.name}
              </option>
            ))}
          </select>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={saving || !form.name.trim()}>
            {editId ? 'حفظ' : 'إضافة'}
          </Button>
        </Card>
      )}

      <Card className="overflow-x-auto !p-0">
        <table className="erp-table w-full text-right">
          <thead className="erp-thead">
            <tr>
              <th className="erp-th">الاسم</th>
              <th className="erp-th text-center">مواد</th>
              <th className="erp-th text-center">فروع</th>
              <th className="erp-th">الحالة</th>
              {canManage && <th className="erp-th text-center">إجراء</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  جاري التحميل...
                </td>
              </tr>
            ) : (
              visibleRows.map(({ category, depth }) => {
                if (!category.id) return null;
                const id = category.id;
                const usage = usageById[id];
                const hasKids = items.some((c) => c.parentId === id);
                return (
                  <tr key={id} className="border-b">
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
                        <button
                          type="button"
                          className="text-primary text-sm font-bold mx-1"
                          onClick={() => {
                            setEditId(id);
                            setForm({
                              name: category.name,
                              parentId: category.parentId ?? null,
                              isActive: category.isActive !== false,
                            });
                          }}
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          className="text-amber-700 text-sm font-bold mx-1"
                          onClick={() => void materialCategoryService.deactivateCategory(id).then(loadData)}
                        >
                          إيقاف
                        </button>
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
