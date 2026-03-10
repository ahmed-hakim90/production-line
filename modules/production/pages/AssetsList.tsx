import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
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
  const navigate = useNavigate();
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
    void fetchAssets();
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة الأصول"
        subtitle="تسجيل الأصول الثابتة ومتابعة الإهلاك الشهري"
        icon="precision_manufacturing"
        primaryAction={canCreate ? {
          label: showCreate ? 'إخفاء النموذج' : 'إضافة أصل',
          icon: showCreate ? 'expand_less' : 'add',
          onClick: () => setShowCreate((p) => !p),
        } : undefined}
        extra={
          canRun ? (
            <div className="flex items-center gap-2">
              <input
                type="month"
                className="h-10 rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 text-sm"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
              <button
                className="btn btn-secondary"
                disabled={runningJob}
                onClick={onRunDepreciation}
              >
                <span className="material-icons-round text-[16px]">calculate</span>
                {runningJob ? 'جاري الاحتساب...' : 'تشغيل إهلاك الشهر'}
              </button>
            </div>
          ) : null
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
              <select className="erp-field-input" value={form.centerId} onChange={(e) => setForm((p) => ({ ...p, centerId: e.target.value }))}>
                <option value="">اختر مركز التكلفة</option>
                {costCenters.map((center) => (
                  <option key={center.id} value={center.id}>{center.name}</option>
                ))}
              </select>
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
              <select className="erp-field-input" value={form.depreciationMethod} onChange={(e) => setForm((p) => ({ ...p, depreciationMethod: e.target.value as AssetDepreciationMethod }))}>
                <option value="straight_line">القسط الثابت</option>
                <option value="declining_balance">القسط المتناقص (قريبًا)</option>
              </select>
            </label>
            <label className="md:col-span-3 erp-field">
              <span className="erp-field-label">ملاحظات إضافية</span>
              <textarea className="erp-field-input py-2" placeholder="أي وصف أو بيانات إضافية عن الأصل" value={form.notes || ''} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </label>
          </div>
          <div className="flex justify-end mt-4">
            <button className="btn btn-primary" disabled={saving} onClick={onCreate}>
              <span className="material-icons-round text-[16px]">save</span>
              {saving ? 'جاري الحفظ...' : 'حفظ الأصل'}
            </button>
          </div>
          </div>
        </div>
      )}

      <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)]">
        <div className="p-4 border-b border-[var(--color-border)] grid grid-cols-1 md:grid-cols-3 gap-3">
          <input className="h-10 rounded border border-[var(--color-border)] px-3 bg-[var(--color-bg)]" placeholder="بحث بالاسم أو الكود" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="h-10 rounded border border-[var(--color-border)] px-3 bg-[var(--color-bg)]" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">كل الفئات</option>
            {categories.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <select className="h-10 rounded border border-[var(--color-border)] px-3 bg-[var(--color-bg)]" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">كل الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">غير نشط</option>
            <option value="disposed">مستبعد</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="erp-thead">
              <tr className="bg-[#f8f9fa]/50 text-[var(--color-text-muted)]">
                <th className="erp-th">الأصل</th>
                <th className="erp-th">تكلفة الشراء</th>
                <th className="erp-th">الإهلاك المتراكم</th>
                <th className="erp-th">القيمة الحالية</th>
                <th className="erp-th">العمر المتبقي</th>
                <th className="erp-th">المركز</th>
                <th className="erp-th">الحالة</th>
                <th className="erp-th text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((asset) => {
                const remainingMonths = asset.monthlyDepreciation > 0
                  ? Math.max(0, Math.ceil((Math.max(0, asset.currentValue - asset.salvageValue)) / asset.monthlyDepreciation))
                  : 0;
                const center = costCenters.find((c) => c.id === asset.centerId);
                return (
                  <tr
                    key={asset.id}
                    className="border-t border-[var(--color-border)] hover:bg-[#f8f9fa]/30 transition-colors cursor-pointer"
                    onClick={() => asset.id && navigate(`/production/assets/${asset.id}`)}
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold">{asset.name}</div>
                      <div className="text-xs text-[var(--color-text-muted)]">{asset.code}</div>
                    </td>
                    <td className="py-3 px-4 tabular-nums">{asset.purchaseCost.toFixed(2)}</td>
                    <td className="py-3 px-4 tabular-nums">{asset.accumulatedDepreciation.toFixed(2)}</td>
                    <td className="py-3 px-4 tabular-nums font-bold text-primary">{asset.currentValue.toFixed(2)}</td>
                    <td className="py-3 px-4">{remainingMonths} شهر</td>
                    <td className="py-3 px-4">{center?.name || '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-1 rounded ${asset.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {asset.status === 'active' ? 'نشط' : asset.status === 'inactive' ? 'غير نشط' : 'مستبعد'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          className="btn btn-secondary !h-8 !px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (asset.id) navigate(`/costs/assets/${asset.id}`);
                          }}
                          title="عرض التفاصيل"
                        >
                          <span className="material-icons-round text-[16px]">visibility</span>
                        </button>
                        {canEdit && (
                          <button
                            className="btn btn-secondary !h-8 !px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (asset.id) navigate(`/costs/assets/${asset.id}`);
                            }}
                            title="تعديل"
                          >
                            <span className="material-icons-round text-[16px]">edit</span>
                          </button>
                        )}
                        {canDelete && asset.id && (
                          <button
                            className="btn btn-secondary !h-8 !px-2 text-rose-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              void onDeleteAsset(asset.id!);
                            }}
                            title="حذف"
                          >
                            <span className="material-icons-round text-[16px]">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[var(--color-text-muted)]">
                    لا توجد أصول مطابقة
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit && (
        <div className="text-xs text-[var(--color-text-muted)]">
          يمكن تعديل أو حذف الأصل من صفحة التفاصيل.
        </div>
      )}
    </div>
  );
};
