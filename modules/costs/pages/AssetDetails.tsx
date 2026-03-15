import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../../components/PageHeader';
import { useShallowStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import type { Asset, AssetDepreciationMethod } from '../../../types';

export const AssetDetails: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const canEdit = can('assets.edit');
  const canDelete = can('assets.delete');

  const {
    assets,
    assetDepreciations,
    costCenters,
    fetchAssets,
    fetchAssetDepreciations,
    updateAsset,
    deleteAsset,
  } = useShallowStore((s) => ({
    assets: s.assets,
    assetDepreciations: s.assetDepreciations,
    costCenters: s.costCenters,
    fetchAssets: s.fetchAssets,
    fetchAssetDepreciations: s.fetchAssetDepreciations,
    updateAsset: s.updateAsset,
    deleteAsset: s.deleteAsset,
  }));

  const asset = useMemo(() => assets.find((item) => item.id === id) || null, [assets, id]);
  const [form, setForm] = useState<Partial<Asset>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void fetchAssets();
  }, [fetchAssets]);

  useEffect(() => {
    if (!id) return;
    void fetchAssetDepreciations(id);
  }, [id, fetchAssetDepreciations]);

  useEffect(() => {
    if (asset) setForm(asset);
  }, [asset]);

  if (!asset) {
    return (
      <div className="space-y-4">
        <PageHeader title="تفاصيل الأصل" subtitle="لم يتم العثور على الأصل المطلوب" icon="search_off" />
        <button className="btn btn-secondary" onClick={() => navigate('/costs/assets')}>
          عودة إلى قائمة الأصول
        </button>
      </div>
    );
  }

  const handleSave = async () => {
    if (!asset.id) return;
    setSaving(true);
    try {
      await updateAsset(asset.id, form);
      await fetchAssets();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!asset.id) return;
    const confirmed = window.confirm('هل تريد حذف الأصل نهائيًا؟');
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteAsset(asset.id);
      navigate('/costs/assets');
    } finally {
      setDeleting(false);
    }
  };

  const yearlyTotal = assetDepreciations.reduce((sum, row) => sum + Number(row.depreciationAmount || 0), 0);
  const purchaseCost = Math.max(0, Number(form.purchaseCost || 0));
  const salvageValue = Math.max(0, Number(form.salvageValue || 0));
  const accumulatedDepreciation = Math.max(0, Number(form.accumulatedDepreciation || 0));
  const usefulLifeMonths = Math.max(1, Math.floor(Number(form.usefulLifeMonths || 1)));
  const currentValueComputed = Math.max(salvageValue, purchaseCost - accumulatedDepreciation);
  const monthlyDepreciationComputed = Number(form.monthlyDepreciation || 0) > 0
    ? Number(form.monthlyDepreciation || 0)
    : Math.max(0, purchaseCost - salvageValue) / usefulLifeMonths;
  const remainingMonths = monthlyDepreciationComputed > 0
    ? Math.max(0, Math.ceil((currentValueComputed - salvageValue) / monthlyDepreciationComputed))
    : 0;
  const remainingLifeLabel = remainingMonths > 0
    ? `${remainingMonths} شهر`
    : 'منتهي / غير متاح';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`تفاصيل الأصل: ${asset.name}`}
        subtitle="تعديل بيانات الأصل ومراجعة سجل الإهلاك"
        icon="precision_manufacturing"
        backAction={{ to: '/costs/assets', label: 'الرجوع' }}
        primaryAction={canEdit ? {
          label: saving ? 'جاري الحفظ...' : 'حفظ التعديلات',
          icon: 'save',
          onClick: handleSave,
          disabled: saving,
        } : undefined}
        moreActions={canDelete ? [{
          label: deleting ? 'جاري الحذف...' : 'حذف الأصل',
          icon: 'delete',
          onClick: handleDelete,
          disabled: deleting,
          danger: true,
        }] : undefined}
      />

      <div className="page-card">
        <div className="section-head">بيانات الأصل</div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="erp-field">
              <span className="erp-field-label">اسم الأصل</span>
              <input className="erp-field-input" placeholder="مثال: ماكينة حقن 160 طن" value={String(form.name || '')} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} disabled={!canEdit} />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">كود الأصل</span>
              <input className="erp-field-input" placeholder="مثال: MA120" value={String(form.code || '')} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} disabled={!canEdit} />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">فئة الأصل</span>
              <input className="erp-field-input" placeholder="مثال: INJECTION / MACHINE" value={String(form.category || '')} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} disabled={!canEdit} />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">مركز التكلفة</span>
              <select className="erp-field-input" value={String(form.centerId || '')} onChange={(e) => setForm((p) => ({ ...p, centerId: e.target.value }))} disabled={!canEdit}>
                <option value="">بدون مركز</option>
                {costCenters.map((center) => (
                  <option key={center.id} value={center.id}>{center.name}</option>
                ))}
              </select>
            </label>
            <label className="erp-field">
              <span className="erp-field-label">تاريخ الشراء</span>
              <input type="date" className="erp-field-input" value={String(form.purchaseDate || '')} onChange={(e) => setForm((p) => ({ ...p, purchaseDate: e.target.value }))} disabled={!canEdit} />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">تكلفة الشراء (ج.م)</span>
              <input type="number" className="erp-field-input" placeholder="أدخل تكلفة شراء الأصل" value={Number(form.purchaseCost || 0)} onChange={(e) => setForm((p) => ({ ...p, purchaseCost: Number(e.target.value || 0) }))} disabled={!canEdit} />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">القيمة المتبقية (Salvage)</span>
              <input type="number" className="erp-field-input" placeholder="القيمة المتوقعة بنهاية العمر" value={Number(form.salvageValue || 0)} onChange={(e) => setForm((p) => ({ ...p, salvageValue: Number(e.target.value || 0) }))} disabled={!canEdit} />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">العمر الإنتاجي (بالأشهر)</span>
              <input type="number" className="erp-field-input" placeholder="مثال: 60 شهر" value={Number(form.usefulLifeMonths || 1)} onChange={(e) => setForm((p) => ({ ...p, usefulLifeMonths: Number(e.target.value || 1) }))} disabled={!canEdit} />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">طريقة الإهلاك</span>
              <select className="erp-field-input" value={String(form.depreciationMethod || 'straight_line')} onChange={(e) => setForm((p) => ({ ...p, depreciationMethod: e.target.value as AssetDepreciationMethod }))} disabled={!canEdit}>
                <option value="straight_line">القسط الثابت</option>
                <option value="declining_balance">القسط المتناقص</option>
              </select>
            </label>
            <label className="erp-field">
              <span className="erp-field-label">الإهلاك الشهري (محسوب)</span>
              <input type="number" className="erp-field-input" value={monthlyDepreciationComputed} disabled />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">الإهلاك المتراكم (محسوب)</span>
              <input type="number" className="erp-field-input" value={accumulatedDepreciation} disabled />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">القيمة الحالية (محسوبة)</span>
              <input type="number" className="erp-field-input" value={currentValueComputed} disabled />
            </label>
            <label className="erp-field">
              <span className="erp-field-label">العمر المتبقي (محسوب)</span>
              <input className="erp-field-input" value={remainingLifeLabel} disabled />
            </label>
            <label className="md:col-span-3 erp-field">
              <span className="erp-field-label">ملاحظات إضافية</span>
              <textarea className="erp-field-input py-2" placeholder="أي وصف أو بيانات إضافية عن الأصل" value={String(form.notes || '')} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} disabled={!canEdit} />
            </label>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="text-xs text-[var(--color-text-muted)]">الإهلاك الشهري</div>
          <div className="text-lg font-bold mt-1">{monthlyDepreciationComputed.toFixed(2)}</div>
        </div>
        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="text-xs text-[var(--color-text-muted)]">إجمالي الإهلاك المسجل</div>
          <div className="text-lg font-bold mt-1">{yearlyTotal.toFixed(2)}</div>
        </div>
        <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="text-xs text-[var(--color-text-muted)]">القيمة الدفترية الحالية</div>
          <div className="text-lg font-bold mt-1 text-primary">{currentValueComputed.toFixed(2)}</div>
        </div>
      </div>

      <div className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)]">
        <div className="p-4 border-b border-[var(--color-border)] font-semibold">سجل الإهلاك الشهري</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="erp-thead">
              <tr className="bg-[#f8f9fa]/50 text-[var(--color-text-muted)]">
                <th className="erp-th">الفترة</th>
                <th className="erp-th">قيمة الإهلاك</th>
                <th className="erp-th">الإهلاك المتراكم</th>
                <th className="erp-th">القيمة الدفترية</th>
              </tr>
            </thead>
            <tbody>
              {assetDepreciations.map((row) => (
                <tr key={row.id} className="border-t border-[var(--color-border)]">
                  <td className="py-3 px-4">{row.period}</td>
                  <td className="py-3 px-4 tabular-nums">{Number(row.depreciationAmount || 0).toFixed(2)}</td>
                  <td className="py-3 px-4 tabular-nums">{Number(row.accumulatedDepreciation || 0).toFixed(2)}</td>
                  <td className="py-3 px-4 tabular-nums text-primary font-semibold">{Number(row.bookValue || 0).toFixed(2)}</td>
                </tr>
              ))}
              {assetDepreciations.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[var(--color-text-muted)]">لا يوجد سجل إهلاك بعد</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
