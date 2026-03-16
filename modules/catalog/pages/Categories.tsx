import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { Card, Button } from '../../production/components/UI';
import { usePermission } from '../../../utils/permissions';
import {
  categoryService,
  getEffectiveCategoryType,
  type CategoryType,
  type ProductCategory,
} from '../services/categoryService';
import { useAppStore } from '../../../store/useAppStore';
import { rawMaterialService } from '../../inventory/services/rawMaterialService';
import type { RawMaterial } from '../../inventory/types';

type CategoryForm = {
  name: string;
  code: string;
  type: CategoryType;
  isActive: boolean;
};

const normalizeCategoryName = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');

const buildEmptyForm = (type: CategoryType): CategoryForm => ({
  name: '',
  code: '',
  type,
  isActive: true,
});

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
  const [rawMaterials, setRawMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedType, setSelectedType] = useState<CategoryType>('product');
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryForm>(buildEmptyForm('product'));
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      await categoryService.seedFromProductsModel();
      const [list, rawRows] = await Promise.all([
        categoryService.getAll(),
        rawMaterialService.getAll(),
      ]);
      setItems(list);
      setRawMaterials(rawRows);
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
    const nextType = params.get('type') === 'raw_material' ? 'raw_material' : 'product';
    setSelectedType(nextType);
    setEditId(null);
    setForm(buildEmptyForm(nextType));
    navigate('/catalog/categories', { replace: true });
  }, [location.search, canCreate, navigate]);

  const usageCountByProductCategory = useMemo(() => {
    const usage = new Map<string, number>();
    rawProducts.forEach((product) => {
      const key = normalizeCategoryName(product.model || '');
      if (!key) return;
      usage.set(key, (usage.get(key) || 0) + 1);
    });
    return usage;
  }, [rawProducts]);

  const usageCountByRawMaterialCategory = useMemo(() => {
    const usage = new Map<string, number>();
    rawMaterials.forEach((material) => {
      const key = normalizeCategoryName(material.categoryName || '');
      if (!key) return;
      usage.set(key, (usage.get(key) || 0) + 1);
    });
    return usage;
  }, [rawMaterials]);

  const filteredItems = useMemo(
    () => items.filter((item) => getEffectiveCategoryType(item) === selectedType),
    [items, selectedType]
  );

  const activeCount = useMemo(
    () => filteredItems.filter((item) => item.isActive !== false).length,
    [filteredItems]
  );

  const resetForm = () => {
    setEditId(null);
    setForm(buildEmptyForm(selectedType));
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
          type: form.type,
          isActive: form.isActive,
        });
        setMessage({ type: 'success', text: 'تم تحديث الفئة بنجاح.' });
      } else {
        await categoryService.create({
          name: form.name.trim(),
          code: form.code.trim(),
          type: form.type,
          isActive: form.isActive,
        });
        setMessage({ type: 'success', text: 'تمت إضافة الفئة بنجاح.' });
      }
      setEditId(null);
      setForm(buildEmptyForm(form.type));
      await loadData();
    } catch {
      setMessage({ type: 'error', text: 'تعذر حفظ الفئة. حاول مرة أخرى.' });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: ProductCategory) => {
    const type = getEffectiveCategoryType(item);
    setSelectedType(type);
    setEditId(item.id || null);
    setForm({
      name: item.name || '',
      code: item.code || '',
      type,
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

  const usageLabel = selectedType === 'product' ? 'عدد المنتجات المستخدمة' : 'عدد المواد الخام المستخدمة';
  const getUsageCount = (item: ProductCategory) => {
    const key = normalizeCategoryName(item.name);
    if (!key) return 0;
    return selectedType === 'product'
      ? usageCountByProductCategory.get(key) || 0
      : usageCountByRawMaterialCategory.get(key) || 0;
  };

  if (!canView) return null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="الفئات"
        subtitle="إدارة فئات المنتجات وفئات المواد الخام بشكل منفصل"
        icon="category"
      />

      <Card className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            className={`px-3 py-2 rounded-[var(--border-radius-lg)] text-sm font-bold border ${
              selectedType === 'product'
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-white text-[var(--color-text-muted)] border-[var(--color-border)]'
            }`}
            onClick={() => {
              setSelectedType('product');
              setEditId(null);
              setForm(buildEmptyForm('product'));
            }}
          >
            فئات المنتجات
          </button>
          <button
            className={`px-3 py-2 rounded-[var(--border-radius-lg)] text-sm font-bold border ${
              selectedType === 'raw_material'
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-white text-[var(--color-text-muted)] border-[var(--color-border)]'
            }`}
            onClick={() => {
              setSelectedType('raw_material');
              setEditId(null);
              setForm(buildEmptyForm('raw_material'));
            }}
          >
            فئات المواد الخام
          </button>
        </div>

        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="text-sm text-[var(--color-text-muted)]">
            إجمالي الفئات: <strong>{filteredItems.length}</strong> - الفئات النشطة: <strong>{activeCount}</strong>
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
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
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
            <select
              className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-3 text-sm bg-white"
              value={form.type}
              onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as CategoryType }))}
            >
              <option value="product">فئة منتجات</option>
              <option value="raw_material">فئة مواد خام</option>
            </select>
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
            <div className="sm:col-span-5">
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
                <th className="erp-th">النوع</th>
                <th className="erp-th text-center">{usageLabel}</th>
                <th className="erp-th">الحالة</th>
                <th className="erp-th text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {!loading && filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[var(--color-text-muted)]">
                    لا توجد فئات حتى الآن.
                  </td>
                </tr>
              )}
              {filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-[#f8f9fa]/50 transition-colors">
                  <td className="px-5 py-4 font-bold">{item.name}</td>
                  <td className="px-5 py-4">{item.code || '—'}</td>
                  <td className="px-5 py-4">
                    {getEffectiveCategoryType(item) === 'product' ? 'منتجات' : 'مواد خام'}
                  </td>
                  <td className="px-5 py-4 text-center font-bold">{getUsageCount(item)}</td>
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
