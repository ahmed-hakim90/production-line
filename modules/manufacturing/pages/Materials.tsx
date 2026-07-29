import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { MaterialCategoryTreeSelect } from '../components/MaterialCategoryTreeSelect';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
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
import { isDuplicateEntityCodeError } from '../services/materialService';
import { materialCategoryService } from '../services/materialCategoryService';
import { formatCategoryBreadcrumb } from '@/modules/catalog/lib/categoryTree';
import { useAppStore } from '@/store/useAppStore';
import { roleService } from '@/modules/system/services/roleService';
import { getExportImportPageControl } from '@/utils/exportImportControls';
import { exportManufacturingMaterials } from '@/utils/exportExcel';
import { downloadMaterialsTemplate } from '@/utils/downloadTemplates';
import {
  parseMaterialsExcel,
  toMaterialCreateData,
  toMaterialUpdateData,
  type MaterialImportResult,
} from '@/utils/importMaterials';
import { ArrowDown, ArrowUp, ChevronsUpDown, Loader2, Pencil, Trash2, X } from 'lucide-react';

const PAGE_SIZE = 20;

const arNum = (n: number) =>
  n.toLocaleString('ar-EG', {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

type SortKey = 'code' | 'name' | 'type' | 'purchaseCost' | 'wastePercent';
type StatusFilter = 'all' | 'active' | 'inactive';
type ManufacturedFilter = 'all' | 'internal' | 'external';

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

const TYPE_BADGE: Record<MaterialType, 'info' | 'warning' | 'muted' | 'success'> = {
  raw_material: 'info',
  semi_finished: 'warning',
  consumable: 'muted',
  packaging: 'success',
};

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/70" />;
  return dir === 'asc' ? (
    <ArrowUp className="h-3.5 w-3.5 text-primary" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5 text-primary" />
  );
}

export const Materials: React.FC = () => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const location = useLocation();
  const canView = can('materials.view');
  const canManage = can('materials.manage');
  const userRoleId = useAppStore((s) => s.userRoleId);
  const applyRole = useAppStore((s) => s._applyRole);
  const fetchRoles = useAppStore((s) => s.fetchRoles);
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);
  const rawProducts = useAppStore((s) => s._rawProducts);
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'manufacturingMaterials'),
    [exportImportSettings],
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;
  const canImportFromPage = can('import') && pageControl.importEnabled && canManage;
  const { data: rows = [], isLoading, refetch } = useMaterials();
  const { create, update, remove } = useMaterialMutations();
  const importInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<MaterialType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [manufacturedFilter, setManufacturedFilter] = useState<ManufacturedFilter>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>('code');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importResult, setImportResult] = useState<MaterialImportResult | null>(null);
  const [importParsing, setImportParsing] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [importFileName, setImportFileName] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (statusFilter === 'active' && r.isActive === false) return false;
      if (statusFilter === 'inactive' && r.isActive !== false) return false;
      if (manufacturedFilter === 'internal' && !r.isManufacturedInternally) return false;
      if (manufacturedFilter === 'external' && r.isManufacturedInternally) return false;
      if (!q) return true;
      const category = String(r.categoryName || '').toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        category.includes(q)
      );
    });
  }, [rows, search, typeFilter, statusFilter, manufacturedFilter]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'code' || sortKey === 'name') {
        cmp = String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''), 'ar', {
          numeric: true,
          sensitivity: 'base',
        });
      } else if (sortKey === 'type') {
        cmp = MATERIAL_TYPE_LABELS[a.type].localeCompare(MATERIAL_TYPE_LABELS[b.type], 'ar');
      } else if (sortKey === 'purchaseCost' || sortKey === 'wastePercent') {
        cmp = Number(a[sortKey] ?? 0) - Number(b[sortKey] ?? 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const paged = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search, typeFilter, statusFilter, manufacturedFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

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
      if (isDuplicateEntityCodeError(e)) {
        setFeedback('كود المادة مستخدم بالفعل — اختر كودًا آخر.');
      } else {
        setFeedback(e instanceof Error ? e.message : 'تعذر الحفظ');
      }
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

  const productCodeById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of rawProducts) {
      if (p.id && p.code) map.set(p.id, p.code);
    }
    return map;
  }, [rawProducts]);

  const handleExportExcel = () => {
    if (!canExportFromPage || sorted.length === 0) return;
    exportManufacturingMaterials(
      sorted.map((r) => ({
        code: r.code,
        name: r.name,
        categoryName: r.categoryName || '',
        type: MATERIAL_TYPE_LABELS[r.type],
        baseUnit: MATERIAL_UNIT_LABELS[r.baseUnit],
        purchaseUnit: (() => {
          const pu = String(r.purchaseUnit || '').trim();
          if (!pu) return MATERIAL_UNIT_LABELS[r.baseUnit];
          return MATERIAL_UNIT_LABELS[pu as MaterialUnit] || pu;
        })(),
        conversionRate: Number(r.conversionRate ?? 1) || 1,
        purchaseCost: Number(r.purchaseCost ?? 0),
        wastePercent: Number(r.wastePercent ?? 0),
        minStock: Number(r.minStock ?? 0),
        isManufacturedInternally: Boolean(r.isManufacturedInternally),
        manufacturedProductCode: r.manufacturedProductId
          ? productCodeById.get(r.manufacturedProductId) || ''
          : '',
        isActive: r.isActive !== false,
      })),
    );
  };

  const handleImportFile = async (file: File) => {
    if (!canImportFromPage) return;
    setImportParsing(true);
    setImportResult(null);
    setImportFileName(file.name);
    setShowImportModal(true);
    try {
      const categories = await materialCategoryService.getAll();
      const categoryOpts = categories
        .filter((c) => c.id)
        .map((c) => ({
          id: c.id!,
          name: c.name,
          breadcrumb: formatCategoryBreadcrumb(categories, c.id) || c.name,
        }));
      const result = await parseMaterialsExcel(file, rows, {
        categories: categoryOpts,
        products: rawProducts
          .filter((p) => p.id && p.code)
          .map((p) => ({ id: p.id!, code: p.code })),
      });
      setImportResult(result);
    } catch (e) {
      setImportResult({
        rows: [],
        totalRows: 0,
        validCount: 0,
        errorCount: 0,
        newCount: 0,
        updateCount: 0,
        fileErrors: [e instanceof Error ? e.message : 'تعذر قراءة الملف'],
      });
    } finally {
      setImportParsing(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!canImportFromPage || !importResult) return;
    const validRows = importResult.rows.filter((r) => r.errors.length === 0);
    if (!validRows.length) return;
    setImportSaving(true);
    setFeedback(null);
    let created = 0;
    let updated = 0;
    let failed = 0;
    try {
      for (const row of validRows) {
        try {
          if (row.action === 'update' && row.matchedId) {
            const existing = rows.find((m) => m.id === row.matchedId);
            if (!existing) {
              failed += 1;
              continue;
            }
            await update.mutateAsync({
              id: row.matchedId,
              data: toMaterialUpdateData(row, existing),
            });
            updated += 1;
          } else {
            await create.mutateAsync(toMaterialCreateData(row));
            created += 1;
          }
        } catch {
          failed += 1;
        }
      }
      setShowImportModal(false);
      setImportResult(null);
      setFeedback(
        `تم الاستيراد: ${created} جديد، ${updated} تحديث${failed ? `، ${failed} فشل` : ''}.`,
      );
      await refetch();
    } finally {
      setImportSaving(false);
    }
  };

  if (!canView) {
    return <p className="p-8 text-center text-muted-foreground">لا توجد صلاحية لعرض المواد</p>;
  }

  const colCount = canManage ? 10 : 9;

  return (
    <div className="erp-ds-clean space-y-5 p-4 md:p-6">
      <PageHeader
        title="المواد التصنيعية"
        subtitle="إدارة المواد الخام، نصف المصنع، المستهلكات، والتعبئة"
        primaryAction={
          canManage ? { label: 'إضافة مادة', onClick: openCreate, icon: 'add' } : undefined
        }
        moreActions={[
          {
            label: 'تصدير المواد (Excel)',
            icon: 'download',
            group: 'تصدير',
            hidden: !canExportFromPage || sorted.length === 0,
            onClick: handleExportExcel,
          },
          {
            label: 'تحميل قالب المواد',
            icon: 'file_download',
            group: 'استيراد',
            hidden: !canImportFromPage,
            onClick: () => downloadMaterialsTemplate(),
          },
          {
            label: 'رفع/تحديث المواد (Excel)',
            icon: 'upload',
            group: 'استيراد',
            hidden: !canImportFromPage,
            onClick: () => importInputRef.current?.click(),
          },
          {
            label: migrating ? 'جاري الترحيل...' : 'ترحيل من النظام القديم',
            icon: 'refresh',
            group: 'صيانة',
            hidden: !canManage,
            disabled: migrating,
            onClick: () => void handleMigrate(),
          },
        ]}
      />

      <input
        ref={importInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void handleImportFile(file);
        }}
      />

      {feedback && (
        <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">{feedback}</p>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <SmartFilterBar
          searchPlaceholder="بحث بالاسم أو الكود أو الفئة"
          searchValue={search}
          onSearchChange={setSearch}
          quickFilters={[
            {
              key: 'type',
              placeholder: 'كل الأنواع',
              options: (Object.keys(MATERIAL_TYPE_LABELS) as MaterialType[]).map((t) => ({
                value: t,
                label: MATERIAL_TYPE_LABELS[t],
              })),
            },
            {
              key: 'status',
              placeholder: 'كل الحالات',
              options: [
                { value: 'active', label: 'نشط' },
                { value: 'inactive', label: 'موقوف' },
              ],
            },
            {
              key: 'manufactured',
              placeholder: 'كل التصنيع',
              options: [
                { value: 'internal', label: 'يُصنع داخلياً' },
                { value: 'external', label: 'شراء خارجي' },
              ],
            },
          ]}
          quickFilterValues={{
            type: typeFilter,
            status: statusFilter,
            manufactured: manufacturedFilter,
          }}
          onQuickFilterChange={(key, value) => {
            if (key === 'type') setTypeFilter(value as MaterialType | 'all');
            if (key === 'status') setStatusFilter(value as StatusFilter);
            if (key === 'manufactured') setManufacturedFilter(value as ManufacturedFilter);
          }}
          className="mb-0 border-0 rounded-none"
        />

        <div className="overflow-x-auto erp-table-scroll">
          <table className="erp-table w-full min-w-[980px] border-collapse text-right">
            <thead className="erp-thead">
              <tr>
                {(
                  [
                    { key: 'code' as const, label: 'الكود', sortable: true },
                    { key: 'name' as const, label: 'المادة', sortable: true },
                    { key: null, label: 'الفئة', sortable: false },
                    { key: 'type' as const, label: 'النوع', sortable: true },
                    { key: null, label: 'الوحدة', sortable: false },
                    { key: 'purchaseCost' as const, label: 'تكلفة الشراء', sortable: true },
                    { key: 'wastePercent' as const, label: 'هالك %', sortable: true },
                    { key: null, label: 'التصنيع', sortable: false },
                    { key: null, label: 'الحالة', sortable: false },
                  ] as const
                ).map((col) => (
                  <th key={col.label} className="erp-th">
                    {col.sortable && col.key ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-medium"
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                        <SortIcon active={sortKey === col.key} dir={sortDir} />
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                ))}
                {canManage && <th className="erp-th text-center">إجراء</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`mat-skel-${i}`}>
                    <td className="px-4 py-3" colSpan={colCount}>
                      <Skeleton className="h-5 w-full rounded-md" />
                    </td>
                  </tr>
                ))}

              {!isLoading && sorted.length === 0 && (
                <tr>
                  <td className="px-4 py-12 text-center text-muted-foreground" colSpan={colCount}>
                    لا توجد مواد مطابقة للبحث أو الفلاتر.
                  </td>
                </tr>
              )}

              {!isLoading &&
                paged.map((row) => {
                  const active = row.isActive !== false;
                  return (
                    <tr key={row.id} className="hover:bg-[#f8f9fa]/70/40">
                      <td className="px-4 py-3 font-mono text-sm tabular-nums">{row.code}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-bold text-[var(--color-text)]">{row.name}</p>
                        {row.type === 'semi_finished' && row.id && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="mt-0.5"
                            onClick={() => navigate(`/manufacturing/materials/${row.id}`)}
                          >
                            عرض قائمة المواد (BOM)
                          </Button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {row.categoryName || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={MATERIAL_TYPE_LABELS[row.type]} type={TYPE_BADGE[row.type]} />
                      </td>
                      <td className="px-4 py-3 text-sm">{MATERIAL_UNIT_LABELS[row.baseUnit]}</td>
                      <td className="px-4 py-3 text-sm tabular-nums font-semibold">
                        {arNum(Number(row.purchaseCost ?? 0))}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-center">
                        {arNum(Number(row.wastePercent ?? 0))}
                      </td>
                      <td className="px-4 py-3">
                        {row.isManufacturedInternally ? (
                          <StatusBadge label="داخلي" type="warning" />
                        ) : (
                          <StatusBadge label="شراء" type="muted" />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge label={active ? 'نشط' : 'موقوف'} type={active ? 'success' : 'danger'} />
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="تعديل"
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              title="حذف"
                              onClick={() => void handleDelete(row)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {!isLoading && (
          <DataPaginationFooter
            page={page}
            totalPages={totalPages}
            totalItems={sorted.length}
            onPageChange={setCurrentPage}
            itemLabel="مادة"
          />
        )}
      </div>

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
              <input
                type="number"
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="نسبة الهالك %"
                value={form.wastePercent || ''}
                onChange={(e) => setForm((f) => ({ ...f, wastePercent: Number(e.target.value) }))}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isManufacturedInternally}
                  onChange={(e) => setForm((f) => ({ ...f, isManufacturedInternally: e.target.checked }))}
                />
                يُصنع داخلياً (يدعم BOM فرعي)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                المادة نشطة
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

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-card shadow-lg">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h3 className="text-lg font-bold">رفع/تحديث المواد التصنيعية</h3>
                {importFileName && (
                  <p className="text-xs text-muted-foreground">{importFileName}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={importSaving}
                onClick={() => {
                  if (importSaving) return;
                  setShowImportModal(false);
                  setImportResult(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {importParsing && (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  جاري قراءة الملف...
                </div>
              )}

              {!importParsing && importResult && importResult.totalRows === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {(importResult.fileErrors || []).join(' — ') || 'لا توجد صفوف صالحة في الملف.'}
                </p>
              )}

              {!importParsing && importResult && importResult.totalRows > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-3 text-sm">
                    <span>
                      الإجمالي: <strong>{importResult.totalRows}</strong>
                    </span>
                    {importResult.newCount > 0 && (
                      <span className="text-emerald-600">جديد: {importResult.newCount}</span>
                    )}
                    {importResult.updateCount > 0 && (
                      <span className="text-blue-600">تحديث: {importResult.updateCount}</span>
                    )}
                    {importResult.errorCount > 0 && (
                      <span className="text-destructive">أخطاء: {importResult.errorCount}</span>
                    )}
                  </div>
                  {importResult.fileErrors && importResult.fileErrors.length > 0 && (
                    <ul className="rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      {importResult.fileErrors.map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                    </ul>
                  )}
                  <div className="overflow-x-auto rounded border">
                    <table className="w-full min-w-[640px] text-right text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-2 py-2">صف</th>
                          <th className="px-2 py-2">إجراء</th>
                          <th className="px-2 py-2">الكود</th>
                          <th className="px-2 py-2">الاسم</th>
                          <th className="px-2 py-2">تغييرات / أخطاء</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {importResult.rows.map((row) => (
                          <tr key={row.rowIndex} className={row.errors.length ? 'bg-destructive/5' : ''}>
                            <td className="px-2 py-1.5 tabular-nums">{row.rowIndex}</td>
                            <td className="px-2 py-1.5">
                              {row.action === 'create' ? 'جديد' : 'تحديث'}
                            </td>
                            <td className="px-2 py-1.5 font-mono">{row.code || '—'}</td>
                            <td className="px-2 py-1.5">{row.name || '—'}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">
                              {row.errors.length
                                ? row.errors.join('؛ ')
                                : row.changes?.length
                                  ? row.changes.join('، ')
                                  : 'بدون تغيير'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    لتحديث الكود: اترك «الكود الحالي» كما هو وعدّل «الكود الجديد». باقي الأعمدة الفاضية لا تمس القيم الأصلية.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <Button
                type="button"
                variant="ghost"
                disabled={importSaving}
                onClick={() => {
                  setShowImportModal(false);
                  setImportResult(null);
                }}
              >
                إلغاء
              </Button>
              {importResult && importResult.validCount > 0 && (
                <Button type="button" disabled={importSaving} onClick={() => void handleConfirmImport()}>
                  {importSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    `حفظ ${
                      importResult.newCount > 0 && importResult.updateCount > 0
                        ? `${importResult.newCount} جديد + ${importResult.updateCount} تحديث`
                        : importResult.updateCount > 0
                          ? `تحديث ${importResult.updateCount}`
                          : `${importResult.newCount} جديد`
                    }`
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
