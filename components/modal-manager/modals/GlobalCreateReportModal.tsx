import React, { useEffect, useMemo, useState } from 'react';
import { Button, SearchableSelect } from '../../../modules/production/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { getOperationalDateString } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { getReportDuplicateMessage } from '../../../modules/production/utils/reportDuplicateError';

type ReportFormState = {
  employeeId: string;
  productId: string;
  lineId: string;
  workOrderId: string;
  date: string;
  quantityProduced: number;
  quantityWaste: number;
  workersCount: number;
  workersProductionCount: number;
  workersPackagingCount: number;
  workersQualityCount: number;
  workersMaintenanceCount: number;
  workersExternalCount: number;
  workHours: number;
  notes: string;
};

type FeedbackState = {
  text: string;
  type: 'success' | 'error';
};

const emptyForm = (): ReportFormState => ({
  employeeId: '',
  productId: '',
  lineId: '',
  workOrderId: '',
  date: getOperationalDateString(8),
  quantityProduced: 0,
  quantityWaste: 0,
  workersCount: 0,
  workersProductionCount: 0,
  workersPackagingCount: 0,
  workersQualityCount: 0,
  workersMaintenanceCount: 0,
  workersExternalCount: 0,
  workHours: 0,
  notes: '',
});

export const GlobalCreateReportModal: React.FC = () => {
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.REPORTS_CREATE);
  const { can } = usePermission();
  const createReport = useAppStore((s) => s.createReport);
  const employees = useAppStore((s) => s.employees);
  const rawEmployees = useAppStore((s) => s._rawEmployees);
  const uid = useAppStore((s) => s.uid);
  const lines = useAppStore((s) => s._rawLines);
  const products = useAppStore((s) => s._rawProducts);
  const workOrders = useAppStore((s) => s.workOrders);
  const [form, setForm] = useState<ReportFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [showErrorOverlay, setShowErrorOverlay] = useState(false);

  const currentEmployee = useMemo(
    () => rawEmployees.find((e) => e.userId === uid) ?? null,
    [rawEmployees, uid],
  );
  const isSupervisorReporter = currentEmployee?.level === 2;

  const activeWorkOrders = useMemo(
    () =>
      workOrders.filter((w) => {
        if (w.status !== 'pending' && w.status !== 'in_progress') return false;
        if (!isSupervisorReporter || !currentEmployee?.id) return true;
        return w.supervisorId === currentEmployee.id;
      }),
    [workOrders, isSupervisorReporter, currentEmployee?.id],
  );

  const workersTotal = useMemo(() => (
    (form.workersProductionCount || 0)
    + (form.workersPackagingCount || 0)
    + (form.workersQualityCount || 0)
    + (form.workersMaintenanceCount || 0)
    + (form.workersExternalCount || 0)
  ), [
    form.workersProductionCount,
    form.workersPackagingCount,
    form.workersQualityCount,
    form.workersMaintenanceCount,
    form.workersExternalCount,
  ]);

  useEffect(() => {
    if (!isOpen || !isSupervisorReporter || !currentEmployee?.id) return;
    setForm((prev) => (
      prev.employeeId === currentEmployee.id
        ? prev
        : { ...prev, employeeId: currentEmployee.id }
    ));
  }, [isOpen, isSupervisorReporter, currentEmployee?.id]);

  if (!isOpen) return null;
  if (!can('reports.create') && !can('reports.edit')) return null;

  const closeModal = () => {
    setFeedback(null);
    setShowErrorOverlay(false);
    close();
  };

  const openErrorOverlay = (text: string) => {
    setFeedback({ text, type: 'error' });
    setShowErrorOverlay(true);
  };

  const closeErrorOverlay = () => {
    setShowErrorOverlay(false);
  };

  const clearFormAndCloseError = () => {
    setForm(emptyForm());
    setShowErrorOverlay(false);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!form.lineId || !form.productId || !form.employeeId || !form.quantityProduced || workersTotal <= 0 || !form.workHours) {
      openErrorOverlay('أكمل الحقول المطلوبة أولاً');
      return;
    }
    setSaving(true);
    setFeedback(null);
    setShowErrorOverlay(false);
    try {
      const created = await createReport({ ...form, workersCount: workersTotal });
      if (!created) {
        const storeError = useAppStore.getState().error;
        openErrorOverlay(getReportDuplicateMessage(storeError, 'تعذر حفظ التقرير'));
        return;
      }
      setFeedback({ text: 'تم حفظ التقرير بنجاح', type: 'success' });
      setForm(emptyForm());
    } catch (error) {
      const errorMessage = getReportDuplicateMessage(error, 'تعذر حفظ التقرير');
      openErrorOverlay(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={closeModal}
    >
      <div
        className="relative bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-xl border border-[var(--color-border)] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {showErrorOverlay && feedback?.type === 'error' && (
          <div className="absolute inset-0 z-30 bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[var(--color-card)] border border-rose-200 rounded-[var(--border-radius-xl)] shadow-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="material-icons-round text-rose-500">error</span>
                <h4 className="text-base font-extrabold text-rose-700">تعذر الحفظ</h4>
              </div>
              <p className="text-sm font-bold text-[var(--color-text)]">{feedback.text}</p>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={closeErrorOverlay}>إغلاق التنبيه</Button>
                <Button variant="danger" onClick={clearFormAndCloseError}>
                  <span className="material-icons-round text-sm">delete_sweep</span>
                  مسح البيانات
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold">إنشاء تقرير إنتاج</h3>
          <button onClick={closeModal} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <span className="material-icons-round">close</span>
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
          {feedback?.type === 'success' && (
            <div
              className={`rounded-[var(--border-radius-lg)] p-3 flex items-center gap-2 border ${
                'bg-emerald-50 border-emerald-200'
              }`}
            >
              <span
                className={`material-icons-round text-lg ${
                  'text-emerald-500'
                }`}
              >
                info
              </span>
              <p
                className={`text-sm font-bold flex-1 ${
                  'text-emerald-700'
                }`}
              >
                {feedback.text}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">أمر شغل (اختياري)</label>
            <select
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-bold transition-all"
              value={form.workOrderId}
              onChange={(e) => {
                const wo = activeWorkOrders.find((w) => w.id === e.target.value);
                if (!wo) {
                  setForm((prev) => ({ ...prev, workOrderId: '' }));
                  return;
                }
                setForm((prev) => ({
                  ...prev,
                  workOrderId: wo.id ?? '',
                  lineId: wo.lineId,
                  productId: wo.productId,
                  employeeId: isSupervisorReporter && currentEmployee?.id ? currentEmployee.id : wo.supervisorId,
                }));
              }}
            >
              <option value="">اختر أمر شغل لتعبئة البيانات تلقائياً</option>
              {activeWorkOrders.map((wo) => (
                <option key={wo.id} value={wo.id!}>
                  {wo.workOrderNumber}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">التاريخ *</label>
              <input
                type="date"
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.date}
                onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">المشرف *</label>
              {isSupervisorReporter && currentEmployee ? (
                <input
                  type="text"
                  readOnly
                  value={currentEmployee.name}
                  className="w-full border border-[var(--color-border)] bg-[#f0f2f5]/70 rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-bold text-[var(--color-text-muted)]"
                />
              ) : (
                <SearchableSelect
                  placeholder="اختر المشرف"
                  options={employees.filter((s) => s.level === 2).map((s) => ({ value: s.id, label: s.name }))}
                  value={form.employeeId}
                  onChange={(v) => setForm((prev) => ({ ...prev, employeeId: v }))}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">خط الإنتاج *</label>
              <SearchableSelect
                placeholder="اختر الخط"
                options={lines.map((l) => ({ value: l.id!, label: l.name }))}
                value={form.lineId}
                onChange={(v) => setForm((prev) => ({ ...prev, lineId: v, workOrderId: '' }))}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">المنتج *</label>
              <SearchableSelect
                placeholder="اختر المنتج"
                options={products.map((p) => ({ value: p.id!, label: p.name }))}
                value={form.productId}
                onChange={(v) => setForm((prev) => ({ ...prev, productId: v, workOrderId: '' }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">الكمية المنتجة *</label>
              <input
                type="number"
                min={0}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.quantityProduced || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, quantityProduced: Number(e.target.value) }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">الهالك</label>
              <input
                type="number"
                min={0}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.quantityWaste || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, quantityWaste: Number(e.target.value) }))}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">إجمالي العمالة *</label>
              <input
                type="number"
                readOnly
                className="w-full border border-[var(--color-border)] bg-[#f0f2f5]/70 rounded-[var(--border-radius-lg)] text-sm p-3.5 outline-none font-black text-primary"
                value={workersTotal || ''}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة إنتاج</label>
              <input
                type="number"
                min={0}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.workersProductionCount || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, workersProductionCount: Number(e.target.value) }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة تغليف</label>
              <input
                type="number"
                min={0}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.workersPackagingCount || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, workersPackagingCount: Number(e.target.value) }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة جودة</label>
              <input
                type="number"
                min={0}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.workersQualityCount || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, workersQualityCount: Number(e.target.value) }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة صيانة</label>
              <input
                type="number"
                min={0}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.workersMaintenanceCount || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, workersMaintenanceCount: Number(e.target.value) }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">عمالة خارجية</label>
              <input
                type="number"
                min={0}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.workersExternalCount || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, workersExternalCount: Number(e.target.value) }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">ساعات العمل *</label>
              <input
                type="number"
                min={0}
                step={0.5}
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.workHours || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, workHours: Number(e.target.value) }))}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-bold text-[var(--color-text-muted)]">ملحوظة</label>
            <textarea
              rows={3}
              className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all resize-y"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="اكتب أي ملاحظة إضافية للتقرير..."
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={closeModal}>إلغاء</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || !form.lineId || !form.productId || !form.employeeId || !form.quantityProduced || workersTotal <= 0 || !form.workHours}
          >
            {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
            <span className="material-icons-round text-sm">add</span>
            حفظ التقرير
          </Button>
        </div>
      </div>
    </div>
  );
};

