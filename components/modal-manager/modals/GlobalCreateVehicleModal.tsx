import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { Button, SearchableSelect } from '../../UI';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { vehicleService } from '../../../modules/hr/vehicleService';
import { employeeService } from '../../../modules/hr/employeeService';
import type { FirestoreVehicle } from '../../../modules/hr/types';
import type { FirestoreEmployee } from '../../../types';
import { formatCurrency } from '../../../utils/calculations';

const EMPTY_VEHICLE: Omit<FirestoreVehicle, 'id'> = {
  name: '',
  plateNumber: '',
  capacity: 10,
  dailyRate: 0,
  workingDaysPerMonth: 26,
  driverName: '',
  driverPhone: '',
  assignedEmployees: [],
  notes: '',
  isActive: true,
};

type VehicleModalPayload = {
  vehicle?: FirestoreVehicle;
  assignedEmployeeIds?: string[];
  onSaved?: () => void | Promise<void>;
};

export const GlobalCreateVehicleModal: React.FC = () => {
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.VEHICLES_CREATE);
  const [employees, setEmployees] = useState<FirestoreEmployee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_VEHICLE);
  const [saving, setSaving] = useState(false);

  const modalPayload = payload as VehicleModalPayload | undefined;

  useEffect(() => {
    if (!isOpen) return;
    setLoadingEmployees(true);
    void employeeService.getAll()
      .then((list) => setEmployees(list))
      .finally(() => setLoadingEmployees(false));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const vehicle = modalPayload?.vehicle;
    if (vehicle?.id) {
      setEditingId(vehicle.id);
      setForm({
        name: vehicle.name,
        plateNumber: vehicle.plateNumber,
        capacity: vehicle.capacity,
        dailyRate: vehicle.dailyRate,
        workingDaysPerMonth: vehicle.workingDaysPerMonth,
        driverName: vehicle.driverName,
        driverPhone: vehicle.driverPhone,
        assignedEmployees: [...(modalPayload?.assignedEmployeeIds || vehicle.assignedEmployees || [])],
        notes: vehicle.notes,
        isActive: vehicle.isActive,
      });
    } else {
      setEditingId(null);
      setForm({ ...EMPTY_VEHICLE });
    }
  }, [isOpen, modalPayload]);

  const activeEmployees = employees
    .filter((e) => e.isActive)
    .map((e) => ({ value: e.id || '', label: `${e.code ? `${e.code} — ` : ''}${e.name}` }));

  const employeeNameMap = useMemo(() => {
    const m = new Map<string, string>();
    employees.forEach((e) => {
      if (e.id) m.set(e.id, e.name);
    });
    return m;
  }, [employees]);

  if (!isOpen) return null;

  const toggleEmployee = (empId: string) => {
    setForm((prev) => {
      const list = [...prev.assignedEmployees];
      const idx = list.indexOf(empId);
      if (idx >= 0) list.splice(idx, 1);
      else if (list.length < prev.capacity) list.push(empId);
      return { ...prev, assignedEmployees: list };
    });
  };

  const handleClose = () => {
    if (saving) return;
    close();
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.plateNumber.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await vehicleService.update(editingId, form);
      } else {
        await vehicleService.create(form);
      }
      await modalPayload?.onSaved?.();
      close();
    } catch (err) {
      console.error('GlobalCreateVehicleModal save error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden border border-[var(--color-border)] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
          <h3 className="text-lg font-bold">{editingId ? 'تعديل مركبة' : 'إضافة مركبة جديدة'}</h3>
          <button onClick={handleClose} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">اسم المركبة *</label>
              <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">رقم اللوحة *</label>
              <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none" value={form.plateNumber} onChange={(e) => setForm({ ...form, plateNumber: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">السعة (عدد الركاب)</label>
              <input type="number" min={1} className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) || 1 })} />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">الأجر اليومي (ج.م)</label>
              <input type="number" min={0} step={0.01} className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none" value={form.dailyRate} onChange={(e) => setForm({ ...form, dailyRate: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">أيام العمل / شهر</label>
              <input type="number" min={1} max={31} className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none" value={form.workingDaysPerMonth} onChange={(e) => setForm({ ...form, workingDaysPerMonth: Math.min(31, Number(e.target.value) || 1) })} />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">التكلفة الشهرية</label>
              <div className="border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-bold bg-emerald-50 text-emerald-700">
                {formatCurrency(form.dailyRate * form.workingDaysPerMonth)}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">اسم السائق</label>
              <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none" value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">هاتف السائق</label>
              <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none" value={form.driverPhone} onChange={(e) => setForm({ ...form, driverPhone: e.target.value })} dir="ltr" />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="w-4 h-4 rounded border-[var(--color-border)] text-primary focus:ring-primary" />
                <span className="text-sm font-bold text-[var(--color-text-muted)]">نشطة</span>
              </label>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-[var(--color-text-muted)]">
                ربط الموظفين ({form.assignedEmployees.length}/{form.capacity})
              </label>
              {form.assignedEmployees.length >= form.capacity && (
                <span className="text-xs text-amber-600 font-bold">المركبة ممتلئة</span>
              )}
            </div>
            <SearchableSelect
              options={activeEmployees.filter((e) => !form.assignedEmployees.includes(e.value))}
              value=""
              onChange={(val) => {
                if (val) toggleEmployee(val);
              }}
              placeholder={loadingEmployees ? 'جاري تحميل الموظفين...' : 'ابحث وأضف موظف...'}
              className="mb-3"
            />
            {form.assignedEmployees.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.assignedEmployees.map((empId) => (
                  <span key={empId} className="inline-flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-sm font-medium px-3 py-1.5 rounded-[var(--border-radius-base)] border border-indigo-200 dark:border-indigo-800">
                    {employeeNameMap.get(empId) || empId}
                    <button onClick={() => toggleEmployee(empId)} className="text-indigo-400 hover:text-rose-500 transition-colors">
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-[var(--color-text-muted)] mb-2">ملاحظات</label>
            <textarea className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] px-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none resize-none" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={handleClose}>إلغاء</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving || !form.name.trim() || !form.plateNumber.trim()}>
            {saving && <Loader2 size={14} className="animate-spin" />}
            <Save size={14} />
            {editingId ? 'حفظ التعديلات' : 'إضافة المركبة'}
          </Button>
        </div>
      </div>
    </div>
  );
};

