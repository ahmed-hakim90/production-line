import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { MaterialCategoryTreeSelect } from '../components/MaterialCategoryTreeSelect';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/utils/permissions';
import { useMaterials, useMaterialMutations } from '../hooks/useMaterials';
import {
  MATERIAL_TYPE_LABELS,
  MATERIAL_UNIT_LABELS,
  type Material,
  type MaterialType,
  type MaterialUnit,
} from '../types';
import { manufacturingMigrationService } from '../services/manufacturingMigrationService';
import { formatMigrationError } from '../lib/migrationErrors';
import { useAppStore } from '@/store/useAppStore';
import { roleService } from '@/modules/system/services/roleService';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';

const arNum = (n: number) => n.toLocaleString('ar-EG');

const EMPTY_FORM = {
  code: '',
  name: '',
  categoryId: null as string | null,
  type: 'raw_material' as MaterialType,
  baseUnit: 'piece' as MaterialUnit,
  purchaseUnit: '',
  conversionRate: 1,
  purchaseCost: 0,
  wastePercent: 0,
  isManufacturedInternally: false,
  isActive: true,
};

export const Materials: React.FC = () => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const location = useLocation();
  const canView = can('materials.view');
  const canManage = can('materials.manage');
  const userRoleId = useAppStore((s) => s.userRoleId);
  const applyRole = useAppStore((s) => s._applyRole);
  const fetchRoles = useAppStore((s) => s.fetchRoles);
  const { data: rows = [], isLoading, refetch } = useMaterials();
  const { create, update, remove } = useMaterialMutations();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<MaterialType | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q)
      );
    });
  }, [rows, search, typeFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSelectedCategoryId(null);
    setShowForm(true);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'create' && canManage) {
      openCreate();
    }
  }, [location.search, canManage]);

  const openEdit = (row: Material) => {
    setEditing(row);
    setSelectedCategoryId(row.categoryId ?? null);
    setForm({
      code: row.code,
      name: row.name,
      categoryId: row.categoryId ?? null,
      type: row.type,
      baseUnit: row.baseUnit,
      purchaseUnit: row.purchaseUnit ?? '',
      conversionRate: Number(row.conversionRate ?? 1),
      purchaseCost: Number(row.purchaseCost ?? 0),
      wastePercent: Number(row.wastePercent ?? 0),
      isManufacturedInternally: Boolean(row.isManufacturedInternally),
      isActive: row.isActive !== false,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!canManage) return;
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        ...form,
        categoryId: selectedCategoryId,
        code: form.code.trim(),
        name: form.name.trim(),
        purchaseUnit: form.purchaseUnit || form.baseUnit,
        conversionRate: Number(form.conversionRate) || 1,
      };
      if (editing?.id) {
        await update.mutateAsync({ id: editing.id, data: payload });
      } else {
        await create.mutateAsync(payload);
      }
      setShowForm(false);
      await refetch();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : 'تعذر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: Material) => {
    if (!canManage || !row.id) return;
    if (!window.confirm(`حذف المادة "${row.name}"؟`)) return;
    try {
      await remove.mutateAsync(row.id);
      await refetch();
    } catch {
      setFeedback('تعذر الحذف');
    }
  };

  const handleMigrate = async () => {
    if (!canManage) return;
    if (!window.confirm('ترحيل المواد الخام وربط المنتجات إلى النظام الجديد؟')) return;
    setMigrating(true);
    setFeedback(null);
    try {
      const result = await manufacturingMigrationService.migrateTenant();
      await fetchRoles();
      if (userRoleId) {
        const freshRole = await roleService.getById(userRoleId);
        if (freshRole) applyRole(freshRole);
      }
      const permNote =
        result.permissionsPatched > 0
          ? ' تم تحديث صلاحيات الأدوار — أعد تحميل الصفحة إن لم تظهر القوائم الجديدة.'
          : '';
      setFeedback(
        `تم الترحيل: ${result.materialsCreated} مادة جديدة، ${result.materialsSkipped} موجودة مسبقاً، ${result.bomsCreated} BOM، ${result.bomItemsCreated} سطر BOM، ${result.stockItemsUpdated} رصيد مخزون.${permNote}`,
      );
      await refetch();
    } catch (e) {
      setFeedback(formatMigrationError(e));
    } finally {
      setMigrating(false);
    }
  };

  if (!canView) {
    return <p className="p-8 text-center text-muted-foreground">لا توجد صلاحية لعرض المواد</p>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="المواد التصنيعية"
        subtitle="إدارة المواد الخام، نصف المصنع، المستهلكات، والتعبئة"
        primaryAction={
          canManage ? { label: 'مادة جديدة', onClick: openCreate, icon: 'add' } : undefined
        }
        moreActions={
          canManage
            ? [
                {
                  label: migrating ? 'جاري الترحيل...' : 'ترحيل من النظام القديم',
                  onClick: () => void handleMigrate(),
                  disabled: migrating,
                },
              ]
            : []
        }
      />

      {feedback && (
        <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">{feedback}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          className="min-w-[200px] flex-1 rounded border border-border px-3 py-2 text-sm"
          placeholder="بحث بالاسم أو الكود"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="rounded border border-border px-3 py-2 text-sm"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as MaterialType | 'all')}
        >
          <option value="all">كل الأنواع</option>
          {(Object.keys(MATERIAL_TYPE_LABELS) as MaterialType[]).map((t) => (
            <option key={t} value={t}>
              {MATERIAL_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="erp-table w-full min-w-[900px] text-right">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الكود</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الاسم</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الفئة</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">النوع</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">الوحدة</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">تكلفة الشراء</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">هالك %</th>
                <th className="px-3 py-2 text-xs font-medium text-muted-foreground">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/80">
                  <td className="px-3 py-2 font-mono text-sm">{row.code}</td>
                  <td className="px-3 py-2 text-sm">{row.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{row.categoryName || '—'}</td>
                  <td className="px-3 py-2 text-sm">{MATERIAL_TYPE_LABELS[row.type]}</td>
                  <td className="px-3 py-2 text-sm">{MATERIAL_UNIT_LABELS[row.baseUnit]}</td>
                  <td className="px-3 py-2 text-sm">{arNum(Number(row.purchaseCost ?? 0))}</td>
                  <td className="px-3 py-2 text-sm">{arNum(Number(row.wastePercent ?? 0))}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {row.type === 'semi_finished' && row.id && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/manufacturing/materials/${row.id}`)}
                        >
                          BOM
                        </Button>
                      )}
                      {canManage && (
                        <>
                          <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(row)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => void handleDelete(row)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-card p-6 shadow-lg">
            <h3 className="mb-4 text-lg font-semibold">{editing ? 'تعديل مادة' : 'مادة جديدة'}</h3>
            <div className="space-y-3">
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="الكود"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="الاسم"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">فئة المادة (اختياري)</p>
                <MaterialCategoryTreeSelect
                  value={selectedCategoryId}
                  onChange={(id) => {
                    setSelectedCategoryId(id);
                    setForm((f) => ({ ...f, categoryId: id }));
                  }}
                />
              </div>
              <select
                className="w-full rounded border px-3 py-2 text-sm"
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as MaterialType }))}
              >
                {(Object.keys(MATERIAL_TYPE_LABELS) as MaterialType[]).map((t) => (
                  <option key={t} value={t}>
                    {MATERIAL_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded border px-3 py-2 text-sm"
                value={form.baseUnit}
                onChange={(e) => setForm((f) => ({ ...f, baseUnit: e.target.value as MaterialUnit }))}
              >
                {(Object.keys(MATERIAL_UNIT_LABELS) as MaterialUnit[]).map((u) => (
                  <option key={u} value={u}>
                    {MATERIAL_UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  className="rounded border px-2 py-1 text-sm"
                  placeholder="تكلفة الشراء"
                  value={form.purchaseCost || ''}
                  onChange={(e) => setForm((f) => ({ ...f, purchaseCost: Number(e.target.value) }))}
                />
                <input
                  type="number"
                  className="rounded border px-2 py-1 text-sm"
                  placeholder="معامل التحويل"
                  value={form.conversionRate || ''}
                  onChange={(e) => setForm((f) => ({ ...f, conversionRate: Number(e.target.value) }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isManufacturedInternally}
                  onChange={(e) => setForm((f) => ({ ...f, isManufacturedInternally: e.target.checked }))}
                />
                يُصنع داخلياً (يدعم BOM فرعي)
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <Button type="button" disabled={saving} onClick={() => void handleSave()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'حفظ'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
