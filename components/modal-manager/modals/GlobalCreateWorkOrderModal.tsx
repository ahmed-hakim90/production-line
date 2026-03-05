import React, { useMemo, useState } from 'react';
import { Button, SearchableSelect } from '../../../modules/production/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { usePermission } from '../../../utils/permissions';
import { estimateReportCost } from '../../../utils/costCalculations';
import { formatNumber, getTodayDateString } from '../../../utils/calculations';
import { workOrderService } from '../../../modules/production/services/workOrderService';
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

  const productNameById = useMemo(
    () => new Map(products.map((p) => [p.id!, p.name])),
    [products],
  );

  const activePlans = useMemo(
    () => plans.filter((p) => p.status === 'planned' || p.status === 'in_progress'),
    [plans],
  );

  const planOptions = useMemo(
    () => [
      { value: '', label: 'بدون خطة' },
      ...activePlans.map((p) => ({
        value: p.id!,
        label: `${productNameById.get(p.productId) || 'منتج غير معروف'} — المتبقي: ${formatNumber(Math.max((p.plannedQuantity || 0) - (p.producedQuantity || 0), 0))}${p.plannedEndDate ? ` - ${p.plannedEndDate}` : ''}`,
      })),
    ],
    [activePlans, productNameById],
  );

  const selectedPlan = useMemo(
    () => activePlans.find((p) => p.id === form.planId) ?? null,
    [activePlans, form.planId],
  );

  const selectedPlanRemaining = useMemo(
    () => (
      selectedPlan
        ? Math.max((selectedPlan.plannedQuantity || 0) - (selectedPlan.producedQuantity || 0), 0)
        : 0
    ),
    [selectedPlan],
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
        className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[95vw] max-w-lg border border-[var(--color-border)] max-h-[90dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <h3 className="text-base sm:text-lg font-bold">أمر شغل جديد</h3>
          <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {message && (
            <div className="erp-alert erp-alert-success">
              <span className="material-icons-round text-emerald-500 text-base">check_circle</span>
              <p className="text-sm font-bold text-emerald-700 flex-1">{message}</p>
            </div>
          )}
          {error && (
            <div className="erp-alert erp-alert-error">
              <span className="material-icons-round text-rose-500 text-base">error</span>
              <p className="text-sm font-bold text-rose-700 flex-1">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">خطة الإنتاج (اختياري)</label>
            <SearchableSelect
              options={planOptions}
              value={form.planId}
              onChange={(value) => {
                const plan = plans.find((p) => p.id === value);
                setForm((f) => ({
                  ...f,
                  planId: value,
                  productId: plan?.productId || f.productId,
                  lineId: plan?.lineId || f.lineId,
                }));
              }}
              placeholder="ابحث باسم المنتج أو اختر بدون خطة"
            />
            {selectedPlan && (
              <div className="mt-2 rounded-[var(--border-radius-base)] border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
                المتبقي في الخطة: {formatNumber(selectedPlanRemaining)} وحدة
                <span className="text-blue-500"> (من {formatNumber(selectedPlan.plannedQuantity || 0)} مخطط)</span>
                <span className="mx-1 text-blue-400">—</span>
                {productNameById.get(selectedPlan.productId) || 'منتج غير معروف'}
                <span className="mx-1 text-blue-400">/</span>
                {lines.find((l) => l.id === selectedPlan.lineId)?.name || 'خط غير معروف'}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">المنتج *</label>
            <SearchableSelect
              options={products.map((p) => ({ value: p.id!, label: `${p.name} (${p.code})` }))}
              value={form.productId}
              onChange={(value) => setForm((f) => ({ ...f, productId: value }))}
              placeholder="ابحث واختر المنتج"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">خط الإنتاج *</label>
            <select
              value={form.lineId}
              onChange={(e) => setForm((f) => ({ ...f, lineId: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
            >
              <option value="">اختر الخط</option>
              {lines.map((l) => (
                <option key={l.id} value={l.id!}>{l.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">المشرف *</label>
            <select
              value={form.supervisorId}
              onChange={(e) => setForm((f) => ({ ...f, supervisorId: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
            >
              <option value="">اختر المشرف</option>
              {supervisors.map((s) => (
                <option key={s.id} value={s.id!}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">الكمية *</label>
              <input
                type="number"
                min={1}
                value={form.quantity || ''}
                onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">عدد العمالة *</label>
              <input
                type="number"
                min={1}
                value={form.maxWorkers || ''}
                onChange={(e) => setForm((f) => ({ ...f, maxWorkers: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">ساعات العمل *</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.workHours || ''}
                onChange={(e) => setForm((f) => ({ ...f, workHours: Number(e.target.value) }))}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">بداية البريك اليومي</label>
              <input
                type="time"
                value={form.breakStartTime}
                onChange={(e) => setForm((f) => ({ ...f, breakStartTime: e.target.value || DEFAULT_BREAK_START }))}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">نهاية البريك اليومي</label>
              <input
                type="time"
                value={form.breakEndTime}
                onChange={(e) => setForm((f) => ({ ...f, breakEndTime: e.target.value || DEFAULT_BREAK_END }))}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">نهاية الوردية اليومية</label>
              <input
                type="time"
                value={form.workdayEndTime}
                onChange={(e) => setForm((f) => ({ ...f, workdayEndTime: e.target.value || DEFAULT_WORKDAY_END }))}
                className="w-full px-3 py-2.5 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] text-sm font-bold"
              />
            </div>
          </div>
          <p className="text-[11px] text-[var(--color-text-muted)]">
            هذه أوقات تشغيل يومية متكررة (للاسكان وحسابات السيكل) وليست موعد انتهاء أمر الشغل نفسه.
          </p>
        </div>
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-between">
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

