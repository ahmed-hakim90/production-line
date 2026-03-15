import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/UI';
import { rawMaterialService } from '../../inventory/services/rawMaterialService';
import type { RawMaterial } from '../../inventory/types';
import { usePermission } from '../../../utils/permissions';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { productMaterialService } from '../services/productMaterialService';
import { productService } from '../services/productService';
import type { FirestoreProduct } from '../../../types';
import { SelectableTable } from '../../../components/SelectableTable';
import type { TableColumn } from '../../../components/SelectableTable';
import { PageHeader } from '../../../components/PageHeader';
import { exportHRData } from '../../../utils/exportExcel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ── Usage Popover ────────────────────────────────────────────────────────────
function UsagePopover({ count, productNames }: { count: number; productNames: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--border-radius-sm)] bg-blue-50 text-blue-600 font-black text-sm hover:bg-blue-100 transition-colors cursor-pointer"
        title="اضغط لعرض المنتجات"
      >
        {count}
        <span className="material-icons-round text-[13px]">{open ? 'expand_less' : 'expand_more'}</span>
      </button>

      {open && (
        <div
          className="absolute z-50 bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] shadow-lg py-1"
          style={{ minWidth: 'min(220px, calc(100vw - 32px))', top: '110%', insetInlineStart: 0 }}
        >
          <div className="px-3 py-2 border-b border-[var(--color-border)]">
            <p className="text-[11px] font-bold text-[var(--color-text-muted)] uppercase tracking-wide">
              مستخدمة في {count} منتج
            </p>
          </div>
          <ul className="max-h-48 overflow-y-auto py-1">
            {productNames.map((name, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-bg)] transition-colors">
                <span className="material-icons-round text-[14px] text-blue-400 shrink-0">inventory_2</span>
                <span className="text-xs font-medium text-[var(--color-text)] leading-snug">{name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type RawMaterialModalPayload = {
  mode?: 'create' | 'edit';
  rawMaterial?: RawMaterial;
  onSaved?: () => void;
};

type UsageInfo = {
  count: number;
  productNames: string[];
};

const normalizeText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');

export const RawMaterials: React.FC = () => {
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();
  const location = useLocation();
  const navigate = useNavigate();
  const [rows, setRows] = useState<RawMaterial[]>([]);
  const [usageByMaterialId, setUsageByMaterialId] = useState<Record<string, UsageInfo>>({});
  const [loading, setLoading] = useState(false);
  const [savingDeleteId, setSavingDeleteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [search, setSearch] = useState('');
  const [usageFilter, setUsageFilter] = useState<'all' | 'used' | 'unused'>('all');

  const loadRawMaterials = useCallback(async () => {
    setLoading(true);
    try {
      const [data, materials, products] = await Promise.all([
        rawMaterialService.getAll(),
        productMaterialService.getAll(),
        productService.getAll(),
      ]);
      setRows(data);

      const productNameById = new Map<string, string>();
      (products || []).forEach((product: FirestoreProduct) => {
        if (product.id) productNameById.set(product.id, product.name || product.id);
      });

      const usageById = new Map<string, Set<string>>();
      const usageByName = new Map<string, Set<string>>();
      for (const material of materials) {
        const productId = String(material.productId || '').trim();
        if (!productId) continue;
        const materialId = String(material.materialId || '').trim();
        const materialName = normalizeText(String(material.materialName || ''));

        if (materialId) {
          if (!usageById.has(materialId)) usageById.set(materialId, new Set());
          usageById.get(materialId)!.add(productId);
        }
        if (materialName) {
          if (!usageByName.has(materialName)) usageByName.set(materialName, new Set());
          usageByName.get(materialName)!.add(productId);
        }
      }

      const usageRecord: Record<string, UsageInfo> = {};
      for (const rawMaterial of data) {
        if (!rawMaterial.id) continue;
        const byIdSet = usageById.get(rawMaterial.id) ?? new Set<string>();
        const byNameSet = usageByName.get(normalizeText(rawMaterial.name || '')) ?? new Set<string>();
        const productIds = new Set<string>([...byIdSet, ...byNameSet]);
        const productNames = Array.from(productIds)
          .map((id) => productNameById.get(id) || id)
          .sort((a, b) => a.localeCompare(b, 'ar'));
        usageRecord[rawMaterial.id] = {
          count: productIds.size,
          productNames,
        };
      }
      setUsageByMaterialId(usageRecord);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRawMaterials();
  }, [loadRawMaterials]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const count = row.id ? (usageByMaterialId[row.id]?.count || 0) : 0;
      const usageMatch =
        usageFilter === 'all' ||
        (usageFilter === 'used' && count > 0) ||
        (usageFilter === 'unused' && count === 0);
      const searchMatch =
        !q ||
        row.name.toLowerCase().includes(q) ||
        row.code.toLowerCase().includes(q);
      return usageMatch && searchMatch;
    });
  }, [rows, search, usageByMaterialId, usageFilter]);

  const activeCount = useMemo(
    () => rows.filter((row) => row.isActive !== false).length,
    [rows],
  );
  const linkedCount = useMemo(
    () => rows.filter((row) => row.id && (usageByMaterialId[row.id]?.count || 0) > 0).length,
    [rows, usageByMaterialId],
  );
  const unlinkedCount = useMemo(
    () => rows.filter((row) => row.id && (usageByMaterialId[row.id]?.count || 0) === 0).length,
    [rows, usageByMaterialId],
  );

  const exportRawMaterials = () => {
    if (filteredRows.length === 0) return;
    const exportRows = filteredRows.map((row) => ({
      'اسم المادة': row.name,
      'الكود': row.code,
      'الوحدة': row.unit || 'unit',
      'الحد الأدنى': Number(row.minStock || 0),
      'الحالة': row.isActive === false ? 'غير نشط' : 'نشط',
      'مستخدمة في منتجات': row.id ? (usageByMaterialId[row.id]?.count || 0) : 0,
    }));
    const date = new Date().toISOString().slice(0, 10);
    exportHRData(exportRows, 'المواد الخام', `المواد-الخام-${date}`);
  };

  const openCreateModal = () => {
    setFeedback(null);
    const payload: RawMaterialModalPayload = {
      mode: 'create',
      onSaved: () => {
        void loadRawMaterials();
        setFeedback({ type: 'success', text: 'تمت إضافة المادة الخام بنجاح.' });
      },
    };
    openModal(MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE, payload);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') !== 'create') return;
    if (!can('inventory.items.manage')) return;
    openCreateModal();
    navigate('/products/raw-materials', { replace: true });
  }, [location.search, can, navigate]);

  const openEditModal = (rawMaterial: RawMaterial) => {
    setFeedback(null);
    const payload: RawMaterialModalPayload = {
      mode: 'edit',
      rawMaterial,
      onSaved: () => {
        void loadRawMaterials();
        setFeedback({ type: 'success', text: 'تم تعديل المادة الخام بنجاح.' });
      },
    };
    openModal(MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE, payload);
  };

  const handleDelete = async (rawMaterial: RawMaterial) => {
    const rawId = rawMaterial.id;
    if (!rawId) return;
    const usage = usageByMaterialId[rawId];
    if ((usage?.count || 0) > 0) {
      setFeedback({
        type: 'error',
        text: `لا يمكن حذف المادة "${rawMaterial.name}" لأنها مستخدمة في ${usage.count} منتج.`,
      });
      return;
    }
    const ok = window.confirm(`هل تريد حذف المادة الخام "${rawMaterial.name}"؟`);
    if (!ok) return;

    setSavingDeleteId(rawId);
    setFeedback(null);
    try {
      await rawMaterialService.delete(rawId);
      await loadRawMaterials();
      setFeedback({ type: 'success', text: 'تم حذف المادة الخام بنجاح.' });
    } catch (error: any) {
      setFeedback({
        type: 'error',
        text: error?.message || 'تعذر حذف المادة الخام. حاول مرة أخرى.',
      });
    } finally {
      setSavingDeleteId(null);
    }
  };

  const columns = useMemo<TableColumn<RawMaterial>[]>(() => [
    {
      header: 'المادة',
      sortKey: (r) => r.name,
      render: (r) => (
        <div>
          <p className="font-bold text-sm text-[var(--color-text)]">{r.name}</p>
        </div>
      ),
    },
    {
      header: 'الكود',
      sortKey: (r) => r.code,
      render: (r) => <span className="font-mono text-xs text-[var(--color-text-muted)]">{r.code}</span>,
    },
    {
      header: 'الوحدة',
      sortKey: (r) => r.unit || '',
      render: (r) => <span className="text-sm">{r.unit || '—'}</span>,
    },
    {
      header: 'الحد الأدنى',
      sortKey: (r) => r.minStock || 0,
      headerClassName: 'text-center',
      className: 'text-center',
      render: (r) => <span className="font-bold text-sm">{r.minStock || 0}</span>,
    },
    {
      header: 'مستخدم في منتجات',
      sortKey: (r) => (r.id ? (usageByMaterialId[r.id]?.count || 0) : 0),
      headerClassName: 'text-center',
      className: 'text-center',
      render: (r) => {
        const usage = r.id ? usageByMaterialId[r.id] : undefined;
        const count = usage?.count || 0;
        if (count === 0) return <span className="text-xs font-bold text-[var(--color-text-muted)]">—</span>;
        return <UsagePopover count={count} productNames={usage?.productNames || []} />;
      },
    },
    {
      header: 'الحالة',
      sortKey: (r) => (r.isActive === false ? 0 : 1),
      headerClassName: 'text-center',
      className: 'text-center',
      render: (r) => (
        <span className={`px-2 py-1 rounded-full text-xs font-bold ${r.isActive === false ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
          {r.isActive === false ? 'غير نشط' : 'نشط'}
        </span>
      ),
    },
  ], [usageByMaterialId]);

  const toolbarContent = (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={usageFilter} onValueChange={(value) => setUsageFilter(value as 'all' | 'used' | 'unused')}>
        <SelectTrigger className="erp-filter-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">كل المواد</SelectItem>
          <SelectItem value="used">مستخدمة في منتجات</SelectItem>
          <SelectItem value="unused">غير مستخدمة</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="المواد الخام"
        subtitle="تعريف وإدارة المواد الخام المستخدمة في ربط المنتجات"
        icon="science"
        primaryAction={can('inventory.items.manage') ? {
          label: 'إضافة مادة خام',
          icon: 'add',
          onClick: openCreateModal,
          dataModalKey: MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE,
        } : undefined}
        secondaryAction={{
          label: 'تحديث',
          icon: 'refresh',
          onClick: () => void loadRawMaterials(),
          disabled: loading,
        }}
        moreActions={[
          {
            label: 'تصدير المواد الخام Excel',
            icon: 'download',
            group: 'تصدير',
            hidden: filteredRows.length === 0,
            onClick: exportRawMaterials,
          },
          {
            label: 'استيراد المواد الخام',
            icon: 'upload_file',
            group: 'استيراد',
            hidden: !can('inventory.items.manage'),
            dataModalKey: MODAL_KEYS.INVENTORY_RAW_MATERIALS_IMPORT,
            onClick: () =>
              openModal(MODAL_KEYS.INVENTORY_RAW_MATERIALS_IMPORT, {
                onSaved: () => {
                  void loadRawMaterials();
                  setFeedback({ type: 'success', text: 'تم استيراد المواد الخام بنجاح.' });
                },
              }),
          },
        ]}
      />

      {feedback && (
        <div className={`rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-bold border flex items-center gap-2 ${
          feedback.type === 'success'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}>
          <span className="material-icons-round text-[18px]">{feedback.type === 'success' ? 'check_circle' : 'error'}</span>
          {feedback.text}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4">
          <p className="text-xs font-bold text-[var(--color-text-muted)]">إجمالي المواد</p>
          <p className="text-2xl font-black text-[var(--color-text)] mt-1">{rows.length}</p>
        </div>
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4">
          <p className="text-xs font-bold text-[var(--color-text-muted)]">مواد مستخدمة بمنتجات</p>
          <p className="text-2xl font-black text-blue-600 mt-1">{linkedCount}</p>
        </div>
        <div className="bg-[var(--color-card)] border border-[var(--color-border)] rounded-[var(--border-radius-lg)] p-4">
          <p className="text-xs font-bold text-[var(--color-text-muted)]">مواد غير مستخدمة</p>
          <p className="text-2xl font-black text-amber-600 mt-1">{unlinkedCount}</p>
        </div>
      </div>

      {/* Table */}
      <SelectableTable<RawMaterial>
        tableId="raw-materials-table"
        data={filteredRows}
        columns={columns}
        getId={(r) => r.id ?? r.code}
        pageSize={20}
        loading={loading}
        enableSearch
        searchPlaceholder="بحث بالاسم أو الكود..."
        toolbarContent={toolbarContent}
        emptyIcon="science"
        emptyTitle="لا توجد مواد خام"
        emptySubtitle={can('inventory.items.manage') ? 'اضغط "إضافة مادة خام" لإضافة أول مادة' : 'لا توجد مواد خام لعرضها حالياً'}
        renderActions={can('inventory.items.manage') ? (row) => (
          <div className="flex items-center gap-0.5 justify-center">
            <button
              className="p-1.5 text-[var(--color-text-muted)] hover:text-primary hover:bg-primary/5 rounded-[var(--border-radius-base)] transition-all"
              data-modal-key={MODAL_KEYS.INVENTORY_RAW_MATERIALS_CREATE}
              onClick={() => openEditModal(row)}
              title="تعديل"
            >
              <span className="material-icons-round text-[17px]">edit</span>
            </button>
            <button
              className="p-1.5 text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 rounded-[var(--border-radius-base)] transition-all disabled:opacity-40"
              onClick={() => void handleDelete(row)}
              disabled={savingDeleteId === row.id}
              title="حذف"
            >
              <span className="material-icons-round text-[17px]">{savingDeleteId === row.id ? 'hourglass_top' : 'delete'}</span>
            </button>
          </div>
        ) : undefined}
        actionsHeader="إجراءات"
      />
    </div>
  );
};

