import React, { useEffect, useMemo, useState } from 'react';
import { Button, SearchableSelect } from '../../../modules/production/components/UI';
import { useAppStore } from '../../../store/useAppStore';
import { getTodayDateString } from '../../../utils/calculations';
import { usePermission } from '../../../utils/permissions';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';

type ReportFormState = {
  employeeId: string;
  productId: string;
  lineId: string;
  workOrderId: string;
  date: string;
  quantityProduced: number;
  quantityWaste: number;
  workersCount: number;
  workHours: number;
  notes: string;
};

const emptyForm = (): ReportFormState => ({
  employeeId: '',
  productId: '',
  lineId: '',
  workOrderId: '',
  date: getTodayDateString(),
  quantityProduced: 0,
  quantityWaste: 0,
  workersCount: 0,
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
  const [message, setMessage] = useState<string | null>(null);

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
    setMessage(null);
    close();
  };

  const handleSave = async () => {
    if (!form.lineId || !form.productId || !form.employeeId || !form.quantityProduced || !form.workersCount || !form.workHours) {
      setMessage('أكمل الحقول المطلوبة أولاً');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const created = await createReport(form);
      if (!created) {
        setMessage('تعذر حفظ التقرير');
        return;
      }
      setMessage('تم حفظ التقرير بنجاح');
      setForm((prev) => ({ ...emptyForm(), date: prev.date }));
    } catch {
      setMessage('تعذر حفظ التقرير');
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
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl border border-slate-200 dark:border-slate-800 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold">إنشاء تقرير إنتاج</h3>
          <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition-colors">
            <span className="material-icons-round">close</span>
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
          {message && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 flex items-center gap-2">
              <span className="material-icons-round text-emerald-500 text-lg">info</span>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300 flex-1">{message}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">أمر شغل (اختياري)</label>
            <select
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-bold transition-all"
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
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">التاريخ *</label>
              <input
                type="date"
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.date}
                onChange={(e) => setForm((prev) => ({ ...prev, date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">المشرف *</label>
              {isSupervisorReporter && currentEmployee ? (
                <input
                  type="text"
                  readOnly
                  value={currentEmployee.name}
                  className="w-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/70 rounded-xl text-sm p-3.5 outline-none font-bold text-slate-600 dark:text-slate-300"
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
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">خط الإنتاج *</label>
              <SearchableSelect
                placeholder="اختر الخط"
                options={lines.map((l) => ({ value: l.id!, label: l.name }))}
                value={form.lineId}
                onChange={(v) => setForm((prev) => ({ ...prev, lineId: v, workOrderId: '' }))}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">المنتج *</label>
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
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الكمية المنتجة *</label>
              <input
                type="number"
                min={0}
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.quantityProduced || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, quantityProduced: Number(e.target.value) }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الهالك</label>
              <input
                type="number"
                min={0}
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.quantityWaste || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, quantityWaste: Number(e.target.value) }))}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">عدد عمال التشغيل *</label>
              <input
                type="number"
                min={1}
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.workersCount || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, workersCount: Number(e.target.value) }))}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">ساعات العمل *</label>
              <input
                type="number"
                min={0}
                step={0.5}
                className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={form.workHours || ''}
                onChange={(e) => setForm((prev) => ({ ...prev, workHours: Number(e.target.value) }))}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">ملحوظة</label>
            <textarea
              rows={3}
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all resize-y"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="اكتب أي ملاحظة إضافية للتقرير..."
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={closeModal}>إلغاء</Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving || !form.lineId || !form.productId || !form.employeeId || !form.quantityProduced || !form.workersCount || !form.workHours}
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

