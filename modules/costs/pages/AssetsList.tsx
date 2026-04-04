import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Eye, Pencil, Trash2 } from 'lucide-react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { PageHeader } from '../../../components/PageHeader';
import { Button } from '../../../components/UI';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { DataTable, type Column } from '../../../src/components/erp/DataTable';
import type { RowActionMenuItem } from '../../../src/components/erp/RowActionsMenu';
import { StatusBadge } from '../../../src/components/erp/StatusBadge';
import { usePermission } from '../../../utils/permissions';
import { useShallowStore } from '../../../store/useAppStore';
import type { Asset, AssetDepreciationMethod } from '../../../types';

type AssetCreateForm = {
  name: string;
  code: string;
  category: string;
  centerId: string;
  purchaseDate: string;
  purchaseCost: string;
  salvageValue: string;
  usefulLifeMonths: string;
  depreciationMethod: AssetDepreciationMethod;
  status: Asset['status'];
  notes: string;
  createdBy: string;
};

const currentMonthValue = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const AssetsList: React.FC = () => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();
  const canCreate = can('assets.create');
  const canRun = can('assets.depreciation.run');
  const canEdit = can('assets.edit');
  const canDelete = can('assets.delete');

  const {
    assets,
    costCenters,
    fetchAssets,
    createAsset,
    deleteAsset,
    runDepreciationJob,
  } = useShallowStore((s) => ({
    assets: s.assets,
    costCenters: s.costCenters,
    fetchAssets: s.fetchAssets,
    createAsset: s.createAsset,
    deleteAsset: s.deleteAsset,
    runDepreciationJob: s.runDepreciationJob,
  }));

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState(currentMonthValue());
  const [runningJob, setRunningJob] = useState(false);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<AssetCreateForm>({
    name: '',
    code: '',
    category: '',
    centerId: '',
    purchaseDate: '',
    purchaseCost: '',
    salvageValue: '',
    usefulLifeMonths: '60',
    depreciationMethod: 'straight_line',
    status: 'active',
    notes: '',
    createdBy: '',
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await fetchAssets();
      } finally {
        if (active) setAssetsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [fetchAssets]);

  const categories = useMemo(
    () => Array.from(new Set(assets.map((a) => String(a.category || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'ar')),
    [assets],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((asset) => {
      const matchQ = !q || `${asset.name} ${asset.code}`.toLowerCase().includes(q);
      const matchCategory = !category || asset.category === category;
      const matchStatus = !status || asset.status === status;
      return matchQ && matchCategory && matchStatus;
    });
  }, [assets, search, category, status]);

  const onCreate = async () => {
    setSaving(true);
    try {
      const payload: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'> = {
        name: form.name,
        code: form.code,
        category: form.category,
        centerId: form.centerId,
        purchaseDate: form.purchaseDate,
        purchaseCost: Number(form.purchaseCost || 0),
        salvageValue: Number(form.salvageValue || 0),
        usefulLifeMonths: Number(form.usefulLifeMonths || 1),
        depreciationMethod: form.depreciationMethod,
        monthlyDepreciation: 0,
        accumulatedDepreciation: 0,
        currentValue: 0,
        status: form.status,
        notes: form.notes,
        createdBy: form.createdBy,
      };
      await createAsset(payload);
      setShowCreate(false);
      setForm({
        name: '',
        code: '',
        category: '',
        centerId: '',
        purchaseDate: '',
        purchaseCost: '',
        salvageValue: '',
        usefulLifeMonths: '60',
        depreciationMethod: 'straight_line',
        status: 'active',
        notes: '',
        createdBy: '',
      });
    } finally {
      setSaving(false);
    }
  };

  const onRunDepreciation = async () => {
    setRunningJob(true);
    try {
      await runDepreciationJob(period);
      await fetchAssets();
    } finally {
      setRunningJob(false);
    }
  };

  const onDeleteAsset = async (assetId: string) => {
    const confirmed = window.confirm('هل تريد حذف الأصل نهائيًا؟');
    if (!confirmed) return;
    await deleteAsset(assetId);
    await fetchAssets();
  };

  const assetStatusLabel = (assetStatus: Asset['status']) => (
    assetStatus === 'active' ? 'نشط' : assetStatus === 'inactive' ? 'غير نشط' : 'مستبعد'
  );

  const assetStatusType = (assetStatus: Asset['status']): 'success' | 'muted' | 'danger' => (
    assetStatus === 'active' ? 'success' : assetStatus === 'inactive' ? 'muted' : 'danger'
  );

  const columns: Column<Asset>[] = [
    {
      key: 'asset',
      header: 'الأصل',
      cell: (asset) => (
        <button
          type="button"
          className="text-right"
          onClick={() => asset.id && navigate(`/costs/assets/${asset.id}`)}
        >
          <div className="font-medium">{asset.name}</div>
          <div className="text-xs text-[var(--color-text-muted)]">{asset.code}</div>
        </button>
      ),
      sortable: true,
    },
    {
      key: 'purchaseCost',
      header: 'تكلفة الشراء',
      cell: (asset) => asset.purchaseCost.toFixed(2),
      align: 'center',
      sortable: true,
    },
    {
      key: 'accumulatedDepreciation',
      header: 'الإهلاك المتراكم',
      cell: (asset) => asset.accumulatedDepreciation.toFixed(2),
      align: 'center',
      sortable: true,
    },
    {
      key: 'currentValue',
      header: 'القيمة الحالية',
      cell: (asset) => (
        <span className="font-medium text-primary">{asset.currentValue.toFixed(2)}</span>
      ),
      align: 'center',
      sortable: true,
    },
    {
      key: 'remainingLife',
      header: 'العمر المتبقي',
      cell: (asset) => {
        const remainingMonths = asset.monthlyDepreciation > 0
          ? Math.max(0, Math.ceil((Math.max(0, asset.currentValue - asset.salvageValue)) / asset.monthlyDepreciation))
          : 0;
        return `${remainingMonths} شهر`;
      },
      align: 'center',
    },
    {
      key: 'center',
      header: 'المركز',
      cell: (asset) => costCenters.find((c) => c.id === asset.centerId)?.name || '—',
      sortable: true,
    },
    {
      key: 'status',
      header: 'الحالة',
      cell: (asset) => (
        <StatusBadge
          label={assetStatusLabel(asset.status)}
          type={assetStatusType(asset.status)}
          dot
        />
      ),
      align: 'center',
    },
  ];

  const getRowActions = (asset: Asset): RowActionMenuItem[] => {
    const items: RowActionMenuItem[] = [
      {
        label: 'عرض التفاصيل',
        icon: <Eye className="h-4 w-4" />,
        onClick: () => asset.id && navigate(`/costs/assets/${asset.id}`),
      },
    ];
    if (canEdit) {
      items.push({
        label: 'تعديل',
        icon: <Pencil className="h-4 w-4" />,
        onClick: () => asset.id && navigate(`/costs/assets/${asset.id}`),
      });
    }
    if (canDelete && asset.id) {
      items.push({
        label: 'حذف',
        icon: <Trash2 className="h-4 w-4" />,
        onClick: () => {
          void onDeleteAsset(asset.id!);
        },
        variant: 'danger',
      });
    }
    return items;
  };

  return (
    <div className="space-y-6 erp-ds-clean">
      <PageHeader
        title="إدارة الأصول"
        subtitle="تسجيل الأصول الثابتة ومتابعة الإهلاك الشهري"
        icon="precision_manufacturing"
        backAction={false}
        primaryAction={canCreate ? {
          label: showCreate ? 'إخفاء النموذج' : '+ إضافة أصل',
          icon: showCreate ? 'expand_less' : 'add',
          onClick: () => setShowCreate((p) => !p),
        } : undefined}
        extra={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <span></span>
            </Button>
            {canRun && (
              <>
              <input
                type="month"
                className="h-10 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
              <Button
                variant="ghost"
                disabled={runningJob}
                onClick={onRunDepreciation}
              >
                <Calendar className="h-4 w-4" />
                {runningJob ? 'جاري الاحتساب...' : 'تشغيل إهلاك الشهر'}
              </Button>
              </>
            )}
          </div>
        }
      />

      {showCreate && canCreate && (
        <div className="page-card">
          <div className="section-head">بيانات الأصل</div>
          <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="erp-field">
              <span className="erp-field-label">اسم الأصل</span>
              <input className="erp-field-input" placeholder="مثال: ماكينة حقن 160 طن" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">كود الأصل</span>
              <input className="erp-field-input" placeholder="مثال: MA120" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">فئة الأصل</span>
              <input className="erp-field-input" placeholder="مثال: INJECTION / MACHINE" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">مركز التكلفة</span>
              <Select value={form.centerId || 'none'} onValueChange={(v) => setForm((p) => ({ ...p, centerId: v === 'none' ? '' : v }))}>
                <SelectTrigger className="erp-field-input">
                  <SelectValue placeholder="اختر مركز التكلفة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">اختر مركز التكلفة</SelectItem>
                  {costCenters.map((center) => (
                    <SelectItem key={center.id} value={center.id!}>{center.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="erp-field">
              <span className="erp-field-label">تاريخ الشراء</span>
              <input type="date" className="erp-field-input" value={form.purchaseDate} onChange={(e) => setForm((p) => ({ ...p, purchaseDate: e.target.value }))} />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">تكلفة الشراء (ج.م)</span>
              <input type="number" className="erp-field-input" placeholder="أدخل تكلفة شراء الأصل" value={form.purchaseCost} onChange={(e) => setForm((p) => ({ ...p, purchaseCost: e.target.value }))} />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">القيمة المتبقية (Salvage)</span>
              <input type="number" className="erp-field-input" placeholder="القيمة المتوقعة بنهاية العمر" value={form.salvageValue} onChange={(e) => setForm((p) => ({ ...p, salvageValue: e.target.value }))} />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">العمر الإنتاجي (بالأشهر)</span>
              <input type="number" className="erp-field-input" placeholder="مثال: 60 شهر" value={form.usefulLifeMonths} onChange={(e) => setForm((p) => ({ ...p, usefulLifeMonths: e.target.value }))} />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">طريقة الإهلاك</span>
              <Select value={form.depreciationMethod} onValueChange={(v) => setForm((p) => ({ ...p, depreciationMethod: v as AssetDepreciationMethod }))}>
                <SelectTrigger className="erp-field-input">
                  <SelectValue placeholder="طريقة الإهلاك" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="straight_line">القسط الثابت</SelectItem>
                  <SelectItem value="declining_balance">القسط المتناقص (قريبًا)</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="md:col-span-3 erp-field">
              <span className="erp-field-label">ملاحظات إضافية</span>
              <textarea className="erp-field-input py-2" placeholder="أي وصف أو بيانات إضافية عن الأصل" value={form.notes || ''} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </label>
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="primary" disabled={saving} onClick={onCreate}>
              {saving ? 'جاري الحفظ...' : 'حفظ الأصل'}
            </Button>
          </div>
          </div>
        </div>
      )}

      <div className="space-y-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <SmartFilterBar
          searchPlaceholder="بحث بالاسم أو الكود"
          searchValue={search}
          onSearchChange={setSearch}
          quickFilters={[
            {
              key: 'status',
              placeholder: 'كل الحالات',
              options: [
                { label: 'نشط', value: 'active' },
                { label: 'غير نشط', value: 'inactive' },
                { label: 'مستبعد', value: 'disposed' },
              ],
              width: 'w-[150px]',
            },
          ]}
          quickFilterValues={{ status: status || 'all' }}
          onQuickFilterChange={(_, value) => setStatus(value === 'all' ? '' : value)}
          advancedFilters={[
            {
              key: 'category',
              label: 'الفئة',
              placeholder: 'كل الفئات',
              options: categories.map((item) => ({ label: item, value: item })),
              width: 'w-[190px]',
            },
          ]}
          advancedFilterValues={{ category: category || 'all' }}
          onAdvancedFilterChange={(key, value) => {
            if (key === 'category') setCategory(value === 'all' ? '' : value);
          }}
          onApply={() => undefined}
          applyLabel="عرض"
          className="mb-0 border-0"
        />
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={assetsLoading}
          emptyMessage="لا توجد أصول مسجلة"
          getRowActions={getRowActions}
        />
      </div>

      {canEdit && (
        <div className="text-xs text-[var(--color-text-muted)]">
          يمكن تعديل أو حذف الأصل من صفحة التفاصيل.
        </div>
      )}
    </div>
  );
};




