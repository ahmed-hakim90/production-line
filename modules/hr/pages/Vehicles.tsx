import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button, Badge } from '../components/UI';
import { useAppStore } from '@/store/useAppStore';
import { usePermission } from '@/utils/permissions';
import { getExportImportPageControl } from '@/utils/exportImportControls';
import { vehicleService } from '../vehicleService';
import { employeeService } from '../employeeService';
import { exportHRData } from '@/utils/exportExcel';
import { formatNumber, formatCurrency } from '@/utils/calculations';
import type { FirestoreVehicle } from '../types';
import type { FirestoreEmployee } from '@/types';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { PageHeader } from '../../../components/PageHeader';

export const Vehicles: React.FC = () => {
  const { can } = usePermission();
  const [vehicles, setVehicles] = useState<FirestoreVehicle[]>([]);
  const [employees, setEmployees] = useState<FirestoreEmployee[]>([]);
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);
  const { openModal } = useGlobalModalManager();
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'vehicles'),
    [exportImportSettings]
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;

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

  const assignedByVehicle = useMemo(() => {
    const map = new Map<string, string[]>();
    employees.forEach((e) => {
      if (!e.id || !e.vehicleId) return;
      const list = map.get(e.vehicleId) ?? [];
      list.push(e.id);
      map.set(e.vehicleId, list);
    });
    return map;
  }, [employees]);

  const getAssignedEmployeeIds = useCallback((vehicle: FirestoreVehicle) => {
    const fromEmployeeLinks = assignedByVehicle.get(vehicle.id ?? '') ?? [];
    return fromEmployeeLinks.length > 0 ? fromEmployeeLinks : vehicle.assignedEmployees;
  }, [assignedByVehicle]);

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
    const totalAssigned = active.reduce((s, v) => s + getAssignedEmployeeIds(v).length, 0);
    const totalMonthlyCost = active.reduce((s, v) => s + v.dailyRate * v.workingDaysPerMonth, 0);
    return { total: vehicles.length, active: active.length, totalCapacity, totalAssigned, totalMonthlyCost };
  }, [vehicles, getAssignedEmployeeIds]);

  const openCreate = () => {
    openModal(MODAL_KEYS.VEHICLES_CREATE, { onSaved: fetchData });
  };

  const openEdit = (v: FirestoreVehicle) => {
    const assignedEmployeeIds = getAssignedEmployeeIds(v);
    openModal(MODAL_KEYS.VEHICLES_CREATE, {
      vehicle: v,
      assignedEmployeeIds,
      onSaved: fetchData,
    });
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

  const handleExport = () => {
    const rows: Record<string, any>[] = [];
    vehicles.forEach((v) => {
      const assignedEmployeeIds = getAssignedEmployeeIds(v);
      if (assignedEmployeeIds.length === 0) {
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
        const costPerEmp = assignedEmployeeIds.length > 0
          ? (v.dailyRate * v.workingDaysPerMonth) / assignedEmployeeIds.length
          : 0;
        assignedEmployeeIds.forEach((empId) => {
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
        <div className="h-8 bg-slate-200 rounded w-1/3" />
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-200 rounded-[var(--border-radius-lg)]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="إدارة المركبات"
        subtitle="تعريف المركبات وربط الموظفين وحساب تكلفة النقل"
        icon="directions_bus"
        primaryAction={{
          label: 'إضافة مركبة',
          icon: 'add',
          onClick: openCreate,
          dataModalKey: MODAL_KEYS.VEHICLES_CREATE,
        }}
        moreActions={[
          {
            label: 'تصدير Excel',
            icon: 'download',
            group: 'تصدير',
            hidden: !canExportFromPage || vehicles.length === 0,
            onClick: handleExport,
          },
        ]}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: 'إجمالي المركبات', value: stats.total, icon: 'directions_bus', color: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' },
          { label: 'نشطة', value: stats.active, icon: 'check_circle', color: 'bg-emerald-100 text-emerald-600' },
          { label: 'إجمالي السعة', value: stats.totalCapacity, icon: 'groups', color: 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400' },
          { label: 'موظفين مربوطين', value: stats.totalAssigned, icon: 'person_pin', color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' },
          { label: 'تكلفة شهرية', value: formatCurrency(stats.totalMonthlyCost), icon: 'payments', color: 'bg-amber-100 text-amber-600' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-[var(--color-card)] p-4 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] flex items-center gap-3">
            <div className={`w-12 h-12 ${kpi.color} rounded-[var(--border-radius-base)] flex items-center justify-center shrink-0`}>
              <span className="material-icons-round text-2xl">{kpi.icon}</span>
            </div>
            <div className="min-w-0">
              <p className="text-[var(--color-text-muted)] text-xs font-medium">{kpi.label}</p>
              <h3 className="text-xl font-bold">{kpi.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1 sm:max-w-sm">
          <span className="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] text-lg">search</span>
          <input
            className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] pr-10 pl-4 py-3 text-sm font-medium bg-[#f8f9fa] focus:border-primary focus:ring-2 focus:ring-primary/12 outline-none"
            placeholder="بحث بالاسم أو رقم اللوحة أو السائق..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Vehicle Cards */}
      {filtered.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <span className="material-icons-round text-5xl text-[var(--color-text-muted)] dark:text-slate-600 mb-3 block">directions_bus</span>
            <p className="text-sm font-bold text-slate-500">لا توجد مركبات{searchQuery ? ' مطابقة للبحث' : ''}</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((v) => {
            const assignedEmployeeIds = getAssignedEmployeeIds(v);
            const monthlyCost = v.dailyRate * v.workingDaysPerMonth;
            const costPerEmp = assignedEmployeeIds.length > 0 ? monthlyCost / assignedEmployeeIds.length : 0;
            const isExpanded = expandedId === v.id;
            const occupancy = v.capacity > 0 ? (assignedEmployeeIds.length / v.capacity) * 100 : 0;

            return (
              <div
                key={v.id}
                className={`bg-[var(--color-card)] rounded-[var(--border-radius-lg)] border transition-all ${
                  v.isActive
                    ? 'border-[var(--color-border)]'
                    : 'border-rose-200 dark:border-rose-900 opacity-70'
                }`}
              >
                {/* Card Header */}
                <div className="p-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-[var(--border-radius-lg)] flex items-center justify-center ${v.isActive ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-[#f0f2f5] text-slate-400'}`}>
                      <span className="material-icons-round text-2xl">directions_bus</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-[var(--color-text)]">{v.name}</h3>
                      <p className="text-xs text-[var(--color-text-muted)] font-mono" dir="ltr">{v.plateNumber}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={v.isActive ? 'success' : 'danger'}>{v.isActive ? 'نشطة' : 'متوقفة'}</Badge>
                    <button onClick={() => openEdit(v)} className="p-1.5 text-[var(--color-text-muted)] hover:text-primary transition-colors rounded-[var(--border-radius-base)] hover:bg-[#f0f2f5]">
                      <span className="material-icons-round text-lg">edit</span>
                    </button>
                    <button onClick={() => handleDelete(v.id!)} className="p-1.5 text-[var(--color-text-muted)] hover:text-rose-500 transition-colors rounded-[var(--border-radius-base)] hover:bg-[#f0f2f5]">
                      <span className="material-icons-round text-lg">delete</span>
                    </button>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="px-4 grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-[#f8f9fa]/50 rounded-[var(--border-radius-base)]">
                    <p className="text-lg font-bold text-[var(--color-text)]">{v.capacity}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] font-medium">السعة</p>
                  </div>
                  <div className="p-2 bg-[#f8f9fa]/50 rounded-[var(--border-radius-base)]">
                    <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{assignedEmployeeIds.length}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] font-medium">مربوطين</p>
                  </div>
                  <div className="p-2 bg-[#f8f9fa]/50 rounded-[var(--border-radius-base)]">
                    <p className="text-lg font-bold text-emerald-600">{formatNumber(v.dailyRate)}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] font-medium">يومي ج.م</p>
                  </div>
                  <div className="p-2 bg-[#f8f9fa]/50 rounded-[var(--border-radius-base)]">
                    <p className="text-lg font-bold text-amber-600">{v.workingDaysPerMonth}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] font-medium">يوم/شهر</p>
                  </div>
                </div>

                {/* Occupancy Bar */}
                <div className="px-4 mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[var(--color-text-muted)] font-medium">الإشغال</span>
                    <span className="text-xs font-bold text-[var(--color-text-muted)]">{Math.round(occupancy)}%</span>
                  </div>
                  <div className="bg-[#f0f2f5] rounded-full h-2 overflow-hidden">
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
                    <span className="text-sm font-bold text-emerald-600">{formatCurrency(monthlyCost)}</span>
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
                <div className="px-4 py-3 mt-2 border-t border-[var(--color-border)]">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : v.id!)}
                    className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                  >
                    <span className="material-icons-round text-sm">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                    {isExpanded ? 'إخفاء' : 'عرض'} الموظفين ({assignedEmployeeIds.length})
                  </button>
                  {isExpanded && (
                    <div className="mt-2 space-y-1">
                      {assignedEmployeeIds.length === 0 ? (
                        <p className="text-xs text-slate-400">لا يوجد موظفين مربوطين</p>
                      ) : (
                        assignedEmployeeIds.map((empId) => (
                          <div key={empId} className="flex items-center gap-2 py-1.5 px-2 bg-[#f8f9fa]/50 rounded-[var(--border-radius-base)] text-sm">
                            <span className="material-icons-round text-[var(--color-text-muted)] text-sm">person</span>
                            <span className="font-medium text-[var(--color-text)]">{getEmpName(empId)}</span>
                            {getEmpCode(empId) && (
                              <span className="text-xs text-[var(--color-text-muted)] font-mono">{getEmpCode(empId)}</span>
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

