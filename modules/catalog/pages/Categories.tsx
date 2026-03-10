import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { Card, Button } from '../../production/components/UI';
import { usePermission } from '../../../utils/permissions';
import { categoryService, type ProductCategory } from '../services/categoryService';
import { useAppStore } from '../../../store/useAppStore';

const emptyForm = { name: '', code: '', isActive: true };

export const Categories: React.FC = () => {
  const { can } = usePermission();
  const location = useLocation();
  const navigate = useNavigate();
  const canView = can('catalog.categories.view');
  const canCreate = can('catalog.categories.create');
  const canEdit = can('catalog.categories.edit');
  const canDelete = can('catalog.categories.delete');
  const rawProducts = useAppStore((s) => s._rawProducts);

  const [items, setItems] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      await categoryService.seedFromProductsModel();
      const list = await categoryService.getAll();
      setItems(list);
    } catch {
      setMessage({ type: 'error', text: 'تعذر تحميل الفئات حالياً.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canView) return;
    void loadData();
  }, [canView]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') !== 'create') return;
    if (!canCreate) return;
    setEditId(null);
    setForm(emptyForm);
    navigate('/catalog/categories', { replace: true });
  }, [location.search, canCreate, navigate]);

  const activeCount = useMemo(() => items.filter((item) => item.isActive !== false).length, [items]);
  const normalizeCategoryName = (value: string) =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/\s+/g, ' ');

  const usageCountByCategory = useMemo(() => {
    const usage = new Map<string, number>();
    rawProducts.forEach((product) => {
      const key = normalizeCategoryName(product.model || '');
      if (!key) return;
      usage.set(key, (usage.get(key) || 0) + 1);
    });
    return usage;
  }, [rawProducts]);

  const resetForm = () => {
    setEditId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      if (editId) {
        await categoryService.update(editId, {
          name: form.name.trim(),
          code: form.code.trim(),
          isActive: form.isActive,
        });
        setMessage({ type: 'success', text: 'تم تحديث الفئة بنجاح.' });
      } else {
        await categoryService.create({
          name: form.name.trim(),
          code: form.code.trim(),
          isActive: form.isActive,
        });
        setMessage({ type: 'success', text: 'تمت إضافة الفئة بنجاح.' });
      }
      resetForm();
      await loadData();
    } catch {
      setMessage({ type: 'error', text: 'تعذر حفظ الفئة. حاول مرة أخرى.' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: ProductCategory) => {
    setEditId(item.id || null);
    setForm({
      name: item.name || '',
      code: item.code || '',
      isActive: item.isActive !== false,
    });
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الفئة؟')) return;
    try {
      await categoryService.delete(id);
      setMessage({ type: 'success', text: 'تم حذف الفئة بنجاح.' });
      await loadData();
    } catch {
      setMessage({ type: 'error', text: 'تعذر حذف الفئة حالياً.' });
    }
  };

  if (!canView) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="فئات المنتجات"
        subtitle="إدارة فئات الكتالوج مع توافق خلفي لحقل موديل المنتج"
        icon="category"
      />

      <Card className="space-y-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="text-sm text-[var(--color-text-muted)]">
            إجمالي الفئات: <strong>{items.length}</strong> - الفئات النشطة: <strong>{activeCount}</strong>
          </div>
          {(canCreate || (canEdit && editId)) && (
            <Button variant="outline" onClick={resetForm}>
              <span className="material-icons-round text-sm">restart_alt</span>
              إعادة تعيين
            </Button>
          )}
        </div>

        {message && (
          <div className={`px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold border ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-rose-50 text-rose-700 border-rose-200'
          }`}>
            {message.text}
          </div>
        )}

        {(canCreate || canEdit) && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              className="sm:col-span-2 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-3 text-sm"
              placeholder="اسم الفئة"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <input
              className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-3 text-sm"
              placeholder="الكود (اختياري)"
              value={form.code}
              onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
            />
            <div className="flex items-center gap-3">
              <label className="text-sm font-bold flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                نشطة
              </label>
            </div>
            <div className="sm:col-span-4">
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={saving || !form.name.trim() || (!editId && !canCreate) || (editId !== null && !canEdit)}
              >
                <span className="material-icons-round text-sm">{editId ? 'save' : 'add'}</span>
                {editId ? 'حفظ التعديلات' : 'إضافة فئة'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="!p-0 border-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الاسم</th>
                <th className="erp-th">الكود</th>
                <th className="erp-th text-center">عدد المنتجات المستخدمة</th>
                <th className="erp-th">الحالة</th>
                <th className="erp-th text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[var(--color-text-muted)]">
                    لا توجد فئات حتى الآن.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-[#f8f9fa]/50 transition-colors">
                  <td className="px-5 py-4 font-bold">{item.name}</td>
                  <td className="px-5 py-4">{item.code || '—'}</td>
                  <td className="px-5 py-4 text-center font-bold">
                    {usageCountByCategory.get(normalizeCategoryName(item.name)) || 0}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                      item.isActive !== false ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {item.isActive !== false ? 'نشطة' : 'موقفة'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-center gap-1">
                      {canEdit && (
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-primary"
                          title="تعديل"
                        >
                          <span className="material-icons-round text-[18px]">edit</span>
                        </button>
                      )}
                      {canDelete && item.id && (
                        <button
                          onClick={() => void handleDelete(item.id!)}
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-rose-500"
                          title="حذف"
                        >
                          <span className="material-icons-round text-[18px]">delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
