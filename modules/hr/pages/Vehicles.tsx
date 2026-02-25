import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Badge, SearchableSelect } from '../components/UI';
import { vehicleService } from '../vehicleService';
import { employeeService } from '../employeeService';
import { exportHRData } from '@/utils/exportExcel';
import { formatNumber, formatCurrency } from '@/utils/calculations';
import type { FirestoreVehicle } from '../types';
import type { FirestoreEmployee } from '@/types';

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

export const Vehicles: React.FC = () => {
  const [vehicles, setVehicles] = useState<FirestoreVehicle[]>([]);
  const [employees, setEmployees] = useState<FirestoreEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_VEHICLE);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [v, e] = await Promise.all([vehicleService.getAll(), employeeService.getAll()]);
      setVehicles(v);
      setEmployees(e);
    } catch (err) {
      console.error('Failed to load vehicles:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeEmployees = useMemo(() =>
    employees.filter((e) => e.isActive).map((e) => ({ value: e.id!, label: `${e.code ? e.code + ' — ' : ''}${e.name}` })),
    [employees],
  );

  const empNameMap = useMemo(() => {
    const m = new Map<string, string>();
    employees.forEach((e) => {
      if (e.id) m.set(e.id, e.name);
    });
    return m;
  }, [employees]);

  const getEmpName = useCallback((id: string) => empNameMap.get(id) || id, [empNameMap]);

  const getEmpCode = useCallback((id: string) => {
    const emp = employees.find((e) => e.id === id);
    return emp?.code || '';
  }, [employees]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return vehicles;
    const q = searchQuery.trim().toLowerCase();
    return vehicles.filter((v) =>
      v.name.toLowerCase().includes(q) ||
      v.plateNumber.toLowerCase().includes(q) ||
      v.driverName.toLowerCase().includes(q),
    );
  }, [vehicles, searchQuery]);

  const stats = useMemo(() => {
    const active = vehicles.filter((v) => v.isActive);
    const totalCapacity = active.reduce((s, v) => s + v.capacity, 0);
    const totalAssigned = active.reduce((s, v) => s + v.assignedEmployees.length, 0);
    const totalMonthlyCost = active.reduce((s, v) => s + v.dailyRate * v.workingDaysPerMonth, 0);
    return { total: vehicles.length, active: active.length, totalCapacity, totalAssigned, totalMonthlyCost };
  }, [vehicles]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_VEHICLE });
    setShowForm(true);
  };

  const openEdit = (v: FirestoreVehicle) => {
    setEditingId(v.id!);
    setForm({
      name: v.name,
      plateNumber: v.plateNumber,
      capacity: v.capacity,
      dailyRate: v.dailyRate,
      workingDaysPerMonth: v.workingDaysPerMonth,
      driverName: v.driverName,
      driverPhone: v.driverPhone,
      assignedEmployees: [...v.assignedEmployees],
      notes: v.notes,
      isActive: v.isActive,
    });
    setShowForm(true);
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
      setShowForm(false);
      setEditingId(null);
      await fetchData();
    } catch (err) {
      console.error('Failed to save vehicle:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه المركبة؟')) return;
    try {
      await vehicleService.delete(id);
      await fetchData();
    } catch (err) {
      console.error('Failed to delete vehicle:', err);
    }
  };

  const toggleEmployee = (empId: string) => {
    setForm((prev) => {
      const list = [...prev.assignedEmployees];
      const idx = list.indexOf(empId);
      if (idx >= 0) list.splice(idx, 1);
      else if (list.length < prev.capacity) list.push(empId);
      return { ...prev, assignedEmployees: list };
    });
  };

  const handleExport = () => {
    const rows: Record<string, any>[] = [];
    vehicles.forEach((v) => {
      if (v.assignedEmployees.length === 0) {
        rows.push({
          'اسم المركبة': v.name,
          'رقم اللوحة': v.plateNumber,
          'السعة': v.capacity,
          'الأجر اليومي': v.dailyRate,
          'أيام العمل/شهر': v.workingDaysPerMonth,
          'التكلفة الشهرية': v.dailyRate * v.workingDaysPerMonth,
          'السائق': v.driverName,
          'هاتف السائق': v.driverPhone,
          'الحالة': v.isActive ? 'نشطة' : 'متوقفة',
          'كود الموظف': '',
          'اسم الموظف': '',
          'تكلفة الموظف/شهر': '',
        });
      } else {
        const costPerEmp = v.assignedEmployees.length > 0
          ? (v.dailyRate * v.workingDaysPerMonth) / v.assignedEmployees.length
          : 0;
        v.assignedEmployees.forEach((empId) => {
          rows.push({
            'اسم المركبة': v.name,
            'رقم اللوحة': v.plateNumber,
            'السعة': v.capacity,
            'الأجر اليومي': v.dailyRate,
            'أيام العمل/شهر': v.workingDaysPerMonth,
            'التكلفة الشهرية': v.dailyRate * v.workingDaysPerMonth,
            'السائق': v.driverName,
            'هاتف السائق': v.driverPhone,
            'الحالة': v.isActive ? 'نشطة' : 'متوقفة',
            'كود الموظف': getEmpCode(empId),
            'اسم الموظف': getEmpName(empId),
            'تكلفة الموظف/شهر': costPerEmp.toFixed(2),
          });
        });
      }
    });
    exportHRData(rows, 'المركبات', 'مركبات-وموظفين');
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-200 dark:bg-slate-700 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
            <span className="material-icons-round text-primary">directions_bus</span>
            إدارة المركبات
          </h2>
          <p className="text-sm text-slate-500 font-medium">
            تعريف المركبات وربط الموظفين وحساب تكلفة النقل
          </p>
        </div>
        <div className="flex gap-2">
          {vehicles.length > 0 && can('export') && (
            <Button variant="outline" onClick={handleExport}>
              <span className="material-icons-round text-sm">download</span>
              تصدير Excel
            </Button>
          )}
          <Button variant="primary" onClick={openCreate}>
            <span className="material-icons-round text-sm">add</span>
            إضافة مركبة
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'إجمالي المركبات', value: stats.total, icon: 'directions_bus', color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' },
          { label: 'نشطة', value: stats.active, icon: 'check_circle', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
          { label: 'إجمالي السعة', value: stats.totalCapacity, icon: 'groups', color: 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400' },
          { label: 'موظفين مربوطين', value: stats.totalAssigned, icon: 'person_pin', color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' },
          { label: 'تكلفة شهرية', value: formatCurrency(stats.totalMonthlyCost), icon: 'payments', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3 shadow-sm">
            <div className={`w-12 h-12 ${kpi.color} rounded-lg flex items-center justify-center shrink-0`}>
              <span className="material-icons-round text-2xl">{kpi.icon}</span>
            </div>
            <div className="min-w-0">
              <p className="text-slate-500 text-xs font-medium">{kpi.label}</p>
              <h3 className="text-xl font-bold">{kpi.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1 sm:max-w-sm">
          <span className="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
          <input
            className="w-full border border-slate-200 dark:border-slate-700 rounded-xl pr-10 pl-4 py-3 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
            placeholder="بحث بالاسم أو رقم اللوحة أو السائق..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <Card title={editingId ? 'تعديل مركبة' : 'إضافة مركبة جديدة'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">اسم المركبة *</label>
              <input
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="مثال: باص 1"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">رقم اللوحة *</label>
              <input
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                value={form.plateNumber}
                onChange={(e) => setForm({ ...form, plateNumber: e.target.value })}
                placeholder="أ ب ج 1234"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">السعة (عدد الركاب)</label>
              <input
                type="number"
                min={1}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) || 1 })}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">الأجر اليومي (ج.م)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                value={form.dailyRate}
                onChange={(e) => setForm({ ...form, dailyRate: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">أيام العمل / شهر</label>
              <input
                type="number"
                min={1}
                max={31}
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                value={form.workingDaysPerMonth}
                onChange={(e) => setForm({ ...form, workingDaysPerMonth: Math.min(31, Number(e.target.value) || 1) })}
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">
                التكلفة الشهرية
              </label>
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400">
                {formatCurrency(form.dailyRate * form.workingDaysPerMonth)}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">اسم السائق</label>
              <input
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                value={form.driverName}
                onChange={(e) => setForm({ ...form, driverName: e.target.value })}
                placeholder="اسم السائق"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">هاتف السائق</label>
              <input
                className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                value={form.driverPhone}
                onChange={(e) => setForm({ ...form, driverPhone: e.target.value })}
                placeholder="01xxxxxxxxx"
                dir="ltr"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">نشطة</span>
              </label>
            </div>
          </div>

          {/* Employee Assignment */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-slate-600 dark:text-slate-300">
                ربط الموظفين ({form.assignedEmployees.length}/{form.capacity})
              </label>
              {form.assignedEmployees.length >= form.capacity && (
                <span className="text-xs text-amber-600 dark:text-amber-400 font-bold">المركبة ممتلئة</span>
              )}
            </div>

            <SearchableSelect
              options={activeEmployees.filter((e) => !form.assignedEmployees.includes(e.value))}
              value=""
              onChange={(val) => { if (val) toggleEmployee(val); }}
              placeholder="ابحث وأضف موظف..."
              className="mb-3"
            />

            {form.assignedEmployees.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.assignedEmployees.map((empId) => (
                  <span
                    key={empId}
                    className="inline-flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 text-sm font-medium px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800"
                  >
                    {getEmpName(empId)}
                    <button
                      onClick={() => toggleEmployee(empId)}
                      className="text-indigo-400 hover:text-rose-500 transition-colors"
                    >
                      <span className="material-icons-round text-sm">close</span>
                    </button>
                  </span>
                ))}
              </div>
            )}

            {form.assignedEmployees.length > 0 && form.dailyRate > 0 && (
              <div className="mt-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-3 flex items-center gap-2">
                <span className="material-icons-round text-sky-500 text-sm">info</span>
                <span className="text-sm font-bold text-sky-700 dark:text-sky-400">
                  تكلفة الموظف الواحد: {formatCurrency((form.dailyRate * form.workingDaysPerMonth) / form.assignedEmployees.length)} / شهر
                </span>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="mt-4">
            <label className="block text-sm font-bold text-slate-600 dark:text-slate-300 mb-2">ملاحظات</label>
            <textarea
              className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="ملاحظات إضافية..."
            />
          </div>

          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>إلغاء</Button>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.plateNumber.trim()}
            >
              {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
              <span className="material-icons-round text-sm">save</span>
              {editingId ? 'حفظ التعديلات' : 'إضافة المركبة'}
            </Button>
          </div>
        </Card>
      )}

      {/* Vehicle Cards */}
      {filtered.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <span className="material-icons-round text-5xl text-slate-300 dark:text-slate-600 mb-3 block">directions_bus</span>
            <p className="text-sm font-bold text-slate-500">لا توجد مركبات{searchQuery ? ' مطابقة للبحث' : ''}</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((v) => {
            const monthlyCost = v.dailyRate * v.workingDaysPerMonth;
            const costPerEmp = v.assignedEmployees.length > 0 ? monthlyCost / v.assignedEmployees.length : 0;
            const isExpanded = expandedId === v.id;
            const occupancy = v.capacity > 0 ? (v.assignedEmployees.length / v.capacity) * 100 : 0;

            return (
              <div
                key={v.id}
                className={`bg-white dark:bg-slate-900 rounded-xl border shadow-sm transition-all ${
                  v.isActive
                    ? 'border-slate-200 dark:border-slate-800'
                    : 'border-rose-200 dark:border-rose-900 opacity-70'
                }`}
              >
                {/* Card Header */}
                <div className="p-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${v.isActive ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                      <span className="material-icons-round text-2xl">directions_bus</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 dark:text-white">{v.name}</h3>
                      <p className="text-xs text-slate-500 font-mono" dir="ltr">{v.plateNumber}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={v.isActive ? 'success' : 'danger'}>{v.isActive ? 'نشطة' : 'متوقفة'}</Badge>
                    <button onClick={() => openEdit(v)} className="p-1.5 text-slate-400 hover:text-primary transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                      <span className="material-icons-round text-lg">edit</span>
                    </button>
                    <button onClick={() => handleDelete(v.id!)} className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                      <span className="material-icons-round text-lg">delete</span>
                    </button>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="px-4 grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <p className="text-lg font-black text-slate-800 dark:text-white">{v.capacity}</p>
                    <p className="text-[10px] text-slate-500 font-medium">السعة</p>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{v.assignedEmployees.length}</p>
                    <p className="text-[10px] text-slate-500 font-medium">مربوطين</p>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{formatNumber(v.dailyRate)}</p>
                    <p className="text-[10px] text-slate-500 font-medium">يومي ج.م</p>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    <p className="text-lg font-black text-amber-600 dark:text-amber-400">{v.workingDaysPerMonth}</p>
                    <p className="text-[10px] text-slate-500 font-medium">يوم/شهر</p>
                  </div>
                </div>

                {/* Occupancy Bar */}
                <div className="px-4 mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-500 font-medium">الإشغال</span>
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">{Math.round(occupancy)}%</span>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        occupancy >= 90 ? 'bg-rose-500' : occupancy >= 60 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(occupancy, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Cost Summary */}
                <div className="px-4 mt-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500">تكلفة شهرية: </span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(monthlyCost)}</span>
                  </div>
                  {costPerEmp > 0 && (
                    <div>
                      <span className="text-xs text-slate-500">تكلفة/موظف: </span>
                      <span className="text-sm font-bold text-sky-600 dark:text-sky-400">{formatCurrency(costPerEmp)}</span>
                    </div>
                  )}
                </div>

                {/* Driver Info */}
                {v.driverName && (
                  <div className="px-4 mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <span className="material-icons-round text-sm">person</span>
                    <span>{v.driverName}</span>
                    {v.driverPhone && <span dir="ltr">({v.driverPhone})</span>}
                  </div>
                )}

                {/* Expand employees */}
                <div className="px-4 py-3 mt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : v.id!)}
                    className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                  >
                    <span className="material-icons-round text-sm">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                    {isExpanded ? 'إخفاء' : 'عرض'} الموظفين ({v.assignedEmployees.length})
                  </button>
                  {isExpanded && (
                    <div className="mt-2 space-y-1">
                      {v.assignedEmployees.length === 0 ? (
                        <p className="text-xs text-slate-400">لا يوجد موظفين مربوطين</p>
                      ) : (
                        v.assignedEmployees.map((empId) => (
                          <div key={empId} className="flex items-center gap-2 py-1.5 px-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-sm">
                            <span className="material-icons-round text-slate-400 text-sm">person</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{getEmpName(empId)}</span>
                            {getEmpCode(empId) && (
                              <span className="text-xs text-slate-400 font-mono">{getEmpCode(empId)}</span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

