import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { repairJobService } from '../services/repairJobService';
import { repairReceiptService } from '../services/repairReceiptService';
import { repairBranchService } from '../services/repairBranchService';
import type { RepairJob, RepairBranch } from '../types';
import { useAppStore } from '../../../store/useAppStore';

const DEVICE_TYPES = ['موبايل', 'لاب توب', 'تابلت', 'شاشة', 'طابعة', 'أخرى'];

export const NewRepairJob: React.FC = () => {
  const navigate = useNavigate();
  const uid = useAppStore((s) => s.uid);
  const userDisplayName = useAppStore((s) => s.userDisplayName);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    customerAddress: '',
    deviceType: 'موبايل',
    deviceBrand: '',
    deviceModel: '',
    deviceColor: '',
    devicePassword: '',
    accessories: '',
    problemDescription: '',
    estimatedCost: '',
    technicianId: '',
    technicianName: '',
    branchId: '',
    branchName: '',
    warranty: 'none' as RepairJob['warranty'],
  });

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName || !form.customerPhone || !form.problemDescription || !form.deviceBrand) {
      setError('يرجى ملء جميع الحقول الإلزامية');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const receiptNo = await repairReceiptService.nextJobReceiptNo();
      const jobId = await repairJobService.create(
        {
          receiptNo,
          branchId: form.branchId || uid!, // fallback to user if no branch set
          branchName: form.branchName,
          technicianId: form.technicianId || undefined,
          technicianName: form.technicianName || undefined,
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          customerAddress: form.customerAddress || undefined,
          deviceType: form.deviceType,
          deviceBrand: form.deviceBrand,
          deviceModel: form.deviceModel,
          deviceColor: form.deviceColor || undefined,
          devicePassword: form.devicePassword || undefined,
          accessories: form.accessories || undefined,
          problemDescription: form.problemDescription,
          status: 'received',
          estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : undefined,
          warranty: form.warranty,
          partsUsed: [],
        },
        uid!,
        userDisplayName,
      );
      navigate(`/repair/jobs/${jobId}`);
    } catch (err: any) {
      setError(err.message ?? 'حدث خطأ، حاول مجدداً');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto" dir="rtl">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-gray-500 hover:text-gray-700"
        >
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
        <h1 className="text-2xl font-bold text-gray-900">تسجيل جهاز جديد</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Customer */}
        <Section title="بيانات العميل">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="اسم العميل *" required>
              <input
                type="text"
                value={form.customerName}
                onChange={(e) => set('customerName', e.target.value)}
                className={inputClass}
                placeholder="محمد أحمد"
              />
            </Field>
            <Field label="رقم الهاتف *" required>
              <input
                type="tel"
                value={form.customerPhone}
                onChange={(e) => set('customerPhone', e.target.value)}
                className={inputClass}
                placeholder="01xxxxxxxxx"
                dir="ltr"
              />
            </Field>
            <Field label="العنوان">
              <input
                type="text"
                value={form.customerAddress}
                onChange={(e) => set('customerAddress', e.target.value)}
                className={inputClass}
                placeholder="اختياري"
              />
            </Field>
          </div>
        </Section>

        {/* Device */}
        <Section title="بيانات الجهاز">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="نوع الجهاز *" required>
              <select
                value={form.deviceType}
                onChange={(e) => set('deviceType', e.target.value)}
                className={inputClass}
              >
                {DEVICE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="الماركة *" required>
              <input
                type="text"
                value={form.deviceBrand}
                onChange={(e) => set('deviceBrand', e.target.value)}
                className={inputClass}
                placeholder="Samsung / Apple / HP ..."
              />
            </Field>
            <Field label="الموديل *" required>
              <input
                type="text"
                value={form.deviceModel}
                onChange={(e) => set('deviceModel', e.target.value)}
                className={inputClass}
                placeholder="Galaxy A54 / iPhone 14 ..."
              />
            </Field>
            <Field label="اللون">
              <input
                type="text"
                value={form.deviceColor}
                onChange={(e) => set('deviceColor', e.target.value)}
                className={inputClass}
                placeholder="أسود / أبيض ..."
              />
            </Field>
            <Field label="كلمة المرور">
              <input
                type="text"
                value={form.devicePassword}
                onChange={(e) => set('devicePassword', e.target.value)}
                className={inputClass}
                placeholder="اختياري"
                dir="ltr"
              />
            </Field>
            <Field label="الملحقات">
              <input
                type="text"
                value={form.accessories}
                onChange={(e) => set('accessories', e.target.value)}
                className={inputClass}
                placeholder="شاحن، كفر ..."
              />
            </Field>
          </div>
          <Field label="وصف العطل *" required>
            <textarea
              value={form.problemDescription}
              onChange={(e) => set('problemDescription', e.target.value)}
              className={`${inputClass} resize-none`}
              rows={3}
              placeholder="صف العطل بالتفصيل..."
            />
          </Field>
        </Section>

        {/* Financial */}
        <Section title="التكلفة والضمان">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="التكلفة التقديرية (ج)">
              <input
                type="number"
                value={form.estimatedCost}
                onChange={(e) => set('estimatedCost', e.target.value)}
                className={inputClass}
                placeholder="0"
                min="0"
              />
            </Field>
            <Field label="الضمان">
              <select
                value={form.warranty}
                onChange={(e) => set('warranty', e.target.value as RepairJob['warranty'])}
                className={inputClass}
              >
                <option value="none">بدون ضمان</option>
                <option value="3months">3 شهور</option>
                <option value="6months">6 شهور</option>
              </select>
            </Field>
          </div>
        </Section>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
            تسجيل الجهاز
          </button>
        </div>
      </form>
    </div>
  );
};

const inputClass =
  'w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
    <h2 className="font-bold text-gray-700 text-base border-b border-gray-100 pb-3">{title}</h2>
    {children}
  </div>
);

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({
  label, required, children,
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-600 mb-1.5">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
  </div>
);
