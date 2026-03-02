import React, { useMemo, useState } from 'react';
import { Button, SearchableSelect } from '../../../modules/production/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { estimateReportCost } from '../../../utils/costCalculations';
import { getTodayDateString } from '../../../utils/calculations';
import { workOrderService } from '../../../services/workOrderService';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';

const DEFAULT_BREAK_START = '12:00';
const DEFAULT_BREAK_END = '12:30';
const DEFAULT_WORKDAY_END = '16:00';

type WorkOrderFormState = {
  planId: string;
  productId: string;
  lineId: string;
  supervisorId: string;
  quantity: number;
  maxWorkers: number;
  workHours: number;
  targetDate: string;
  notes: string;
  breakStartTime: string;
  breakEndTime: string;
  workdayEndTime: string;
};

const emptyForm = (): WorkOrderFormState => ({
  planId: '',
  productId: '',
  lineId: '',
  supervisorId: '',
  quantity: 0,
  maxWorkers: 0,
  workHours: 0,
  targetDate: getTodayDateString(),
  notes: '',
  breakStartTime: DEFAULT_BREAK_START,
  breakEndTime: DEFAULT_BREAK_END,
  workdayEndTime: DEFAULT_WORKDAY_END,
});

export const GlobalCreateWorkOrderModal: React.FC = () => {
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.WORK_ORDERS_CREATE);
  const { can } = usePermission();
  const uid = useAppStore((s) => s.uid);
  const createWorkOrder = useAppStore((s) => s.createWorkOrder);
  const plans = useAppStore((s) => s.productionPlans);
  const products = useAppStore((s) => s._rawProducts);
  const lines = useAppStore((s) => s._rawLines);
  const employees = useAppStore((s) => s._rawEmployees);
  const laborSettings = useAppStore((s) => s.laborSettings);
  const costCenters = useAppStore((s) => s.costCenters);
  const costCenterValues = useAppStore((s) => s.costCenterValues);
  const costAllocations = useAppStore((s) => s.costAllocations);
  const [form, setForm] = useState<WorkOrderFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supervisors = useMemo(
    () => employees.filter((e) => e.level === 2 && e.isActive),
    [employees],
  );

  if (!isOpen) return null;
  if (!can('workOrders.create')) return null;

  const handleClose = () => {
    if (saving) return;
    setMessage(null);
    setError(null);
    close();
  };

  const handleSave = async () => {
    if (!form.productId || !form.lineId || !form.supervisorId || form.quantity <= 0) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const woNumber = await workOrderService.generateNextNumber();
      const est = estimateReportCost(
        form.maxWorkers,
        form.workHours,
        form.quantity,
        laborSettings?.hourlyRate ?? 0,
        employees.find((e) => e.id === form.supervisorId)?.hourlyRate ?? 0,
        form.lineId,
        form.targetDate,
        costCenters,
        costCenterValues,
        costAllocations,
      );
      const createdId = await createWorkOrder({
        workOrderNumber: woNumber,
        ...(form.planId ? { planId: form.planId } : {}),
        productId: form.productId,
        lineId: form.lineId,
        supervisorId: form.supervisorId,
        quantity: form.quantity,
        producedQuantity: 0,
        maxWorkers: form.maxWorkers,
        targetDate: form.targetDate,
        estimatedCost: est.totalCost,
        actualCost: 0,
        status: 'pending',
        notes: form.notes,
        breakStartTime: form.breakStartTime || DEFAULT_BREAK_START,
        breakEndTime: form.breakEndTime || DEFAULT_BREAK_END,
        workdayEndTime: form.workdayEndTime || DEFAULT_WORKDAY_END,
        createdBy: uid || '',
      });
      if (!createdId) throw new Error('Failed create');
      setMessage('تم إنشاء أمر الشغل بنجاح');
      setForm(emptyForm());
    } catch {
      setError('تعذر إنشاء أمر الشغل الآن');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-lg font-bold">أمر شغل جديد</h3>
          <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {message && (
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3">
              <span className="material-icons-round text-emerald-500 text-base">check_circle</span>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex-1">{message}</p>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl p-3">
              <span className="material-icons-round text-rose-500 text-base">error</span>
              <p className="text-sm font-bold text-rose-700 dark:text-rose-300 flex-1">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">خطة الإنتاج (اختياري)</label>
            <select
              value={form.planId}
              onChange={(e) => {
                const plan = plans.find((p) => p.id === e.target.value);
                setForm((f) => ({ ...f, planId: e.target.value, productId: plan?.productId || f.productId }));
              }}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
            >
              <option value="">بدون خطة</option>
              {plans.filter((p) => p.status === 'planned' || p.status === 'in_progress').map((p) => (
                <option key={p.id} value={p.id!}>{p.productId}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">المنتج *</label>
            <SearchableSelect
              options={products.map((p) => ({ value: p.id!, label: `${p.name} (${p.code})` }))}
              value={form.productId}
              onChange={(value) => setForm((f) => ({ ...f, productId: value }))}
              placeholder="ابحث واختر المنتج"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">خط الإنتاج *</label>
            <select
              value={form.lineId}
              onChange={(e) => setForm((f) => ({ ...f, lineId: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
            >
              <option value="">اختر الخط</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id!}>{l.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">المشرف *</label>
            <select
              value={form.supervisorId}
              onChange={(e) => setForm((f) => ({ ...f, supervisorId: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
            >
              <option value="">اختر المشرف</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id!}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">الكمية *</label>
              <input
                type="number"
                min={1}
                value={form.quantity || ''}
                onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">عدد العمالة *</label>
              <input
                type="number"
                min={1}
                value={form.maxWorkers || ''}
                onChange={(e) => setForm((f) => ({ ...f, maxWorkers: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">ساعات العمل *</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.workHours || ''}
                onChange={(e) => setForm((f) => ({ ...f, workHours: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold"
              />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex justify-between">
          <Button variant="outline" onClick={handleClose} disabled={saving}>إلغاء</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || !form.productId || !form.lineId || !form.supervisorId || form.quantity <= 0}>
            {saving ? <span className="material-icons-round animate-spin text-sm">refresh</span> : null}
            إنشاء أمر الشغل
          </Button>
        </div>
      </div>
    </div>
  );
};

