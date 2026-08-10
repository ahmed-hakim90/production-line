import React, { useCallback, useMemo, useState } from 'react';
import { Button, Badge } from '../components/UI';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
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
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { useCachedPageLoad } from '../../shared/hooks/useCachedPageLoad';
import { invalidatePageDataCache } from '../../shared/lib/pageDataCache';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';

const VEHICLES_CACHE_KEY = 'hr:vehicles';

type VehiclesPageData = {
  vehicles: FirestoreVehicle[];
  employees: FirestoreEmployee[];
};

export const Vehicles: React.FC = () => {
  const { can } = usePermission();
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);
  const { openModal } = useGlobalModalManager();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'vehicles'),
    [exportImportSettings]
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;

  const {
    data,
    loading,
    reload: reloadCached,
  } = useCachedPageLoad<VehiclesPageData>(
    VEHICLES_CACHE_KEY,
    async () => {
      const [v, e] = await Promise.all([vehicleService.getAll(), employeeService.getAll()]);
      return { vehicles: v, employees: e };
    },
    { maxAgeMs: 60_000 },
  );

  const vehicles = data?.vehicles ?? [];
  const employees = data?.employees ?? [];

  const fetchData = useCallback(async () => {
    invalidatePageDataCache(VEHICLES_CACHE_KEY);
    await reloadCached(true);
  }, [reloadCached]);

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
          'الحالة': v.isActive ? 'نشط' : 'متوقفة',
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
            'الحالة': v.isActive ? 'نشط' : 'متوقفة',
            'كود الموظف': getEmpCode(empId),
            'اسم الموظف': getEmpName(empId),
            'تكلفة الموظف/شهر': costPerEmp.toFixed(2),
          });
        });
      }
    });
    exportHRData(rows, 'المركبات', 'مركبات-تصدير');
  };

  if (loading && vehicles.length === 0) {
    return <PageContentSkeleton variant="list" showFilters tableRows={6} />;
  }

  return (
    <ModuleOpsPageShell
      eyebrow="إدارة المركبات"
      rangeLabel="تعريف المركبات وربط الموظفين وحساب تكلفة النقل"
      hero={[
        { key: 'total', label: 'إجمالي المركبات', value: stats.total },
        { key: 'active', label: 'نشط', value: stats.active },
        { key: 'capacity', label: 'إجمالي السعة', value: stats.totalCapacity },
        { key: 'assigned', label: 'موظفون معيّنون', value: stats.totalAssigned },
        { key: 'cost', label: 'تكلفة شهرية', value: formatCurrency(stats.totalMonthlyCost) },
      ]}
      actions={(
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={openCreate} data-modal-key={MODAL_KEYS.VEHICLES_CREATE}>
            إضافة مركبة
          </Button>
          {canExportFromPage && vehicles.length > 0 ? (
            <Button type="button" variant="outline" onClick={handleExport}>
              <span className="material-icons-round text-sm">download</span>
              تصدير Excel
            </Button>
          ) : null}
        </div>
      )}
    >
      <OpsDashPanel title="قائمة المركبات" accent="hr" bodyClassName="p-0 overflow-hidden">
        <SmartFilterBar
      pageId="hr-vehicles"
        searchPlaceholder="بحث بالاسم أو رقم اللوحة أو السائق..."
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        className="mb-0 border-0 rounded-none"
      />

      {filtered.length === 0 ? (
        <div className="text-center py-12 p-4">
          <span className="material-icons-round text-5xl text-[var(--color-text-muted)] dark:text-[var(--color-text-muted)] mb-3 block">directions_bus</span>
          <p className="text-sm font-bold text-[var(--color-text-muted)]">لا توجد مركبات{searchQuery ? ' تطابق البحث' : ''}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
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
                    : 'border-[rgb(var(--color-danger)/0.25)] dark:border-[rgb(var(--color-danger))] opacity-70'
                }`}
              >
                {/* Card Header */}
                <div className="p-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-[var(--border-radius-lg)] flex items-center justify-center ${v.isActive ? 'bg-[rgb(var(--color-primary)/0.1)] dark:bg-[rgb(var(--color-primary))]/30 text-[rgb(var(--color-primary))] dark:text-[rgb(var(--color-primary))]' : 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]'}`}>
                      <span className="material-icons-round text-2xl">directions_bus</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-[var(--color-text)]">{v.name}</h3>
                      <p className="text-xs text-[var(--color-text-muted)] font-mono" dir="ltr">{v.plateNumber}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant={v.isActive ? 'success' : 'danger'}>{v.isActive ? 'نشط' : 'متوقفة'}</Badge>
                    <button onClick={() => openEdit(v)} className="p-1.5 text-[var(--color-text-muted)] hover:text-primary transition-colors rounded-[var(--border-radius-base)] hover:bg-[var(--color-surface-hover)]">
                      <span className="material-icons-round text-lg">edit</span>
                    </button>
                    <button onClick={() => handleDelete(v.id!)} className="p-1.5 text-[var(--color-text-muted)] hover:text-[rgb(var(--color-danger))] transition-colors rounded-[var(--border-radius-base)] hover:bg-[var(--color-surface-hover)]">
                      <span className="material-icons-round text-lg">delete</span>
                    </button>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="px-4 grid grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-[var(--color-bg)]/50 rounded-[var(--border-radius-base)]">
                    <p className="text-lg font-bold text-[var(--color-text)]">{v.capacity}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] font-medium">السعة</p>
                  </div>
                  <div className="p-2 bg-[var(--color-bg)]/50 rounded-[var(--border-radius-base)]">
                    <p className="text-lg font-bold text-[rgb(var(--color-primary))] dark:text-[rgb(var(--color-primary))]">{assignedEmployeeIds.length}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] font-medium">مرتبطون</p>
                  </div>
                  <div className="p-2 bg-[var(--color-bg)]/50 rounded-[var(--border-radius-base)]">
                    <p className="text-lg font-bold text-[rgb(var(--color-success))]">{formatNumber(v.dailyRate)}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] font-medium">يومي ج.م</p>
                  </div>
                  <div className="p-2 bg-[var(--color-bg)]/50 rounded-[var(--border-radius-base)]">
                    <p className="text-lg font-bold text-[rgb(var(--color-warning))]">{v.workingDaysPerMonth}</p>
                    <p className="text-[10px] text-[var(--color-text-muted)] font-medium">يوم/شهر</p>
                  </div>
                </div>

                {/* Occupancy Bar */}
                <div className="px-4 mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[var(--color-text-muted)] font-medium">الإشغال</span>
                    <span className="text-xs font-bold text-[var(--color-text-muted)]">{Math.round(occupancy)}%</span>
                  </div>
                  <div className="bg-[var(--color-surface-hover)] rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        occupancy >= 90 ? 'bg-[rgb(var(--color-danger)/0.1)]0' : occupancy >= 60 ? 'bg-[rgb(var(--color-warning)/0.1)]0' : 'bg-[rgb(var(--color-success)/0.1)]0'
                      }`}
                      style={{ width: `${Math.min(occupancy, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Cost Summary */}
                <div className="px-4 mt-3 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-[var(--color-text-muted)]">تكلفة شهرية: </span>
                    <span className="text-sm font-bold text-[rgb(var(--color-success))]">{formatCurrency(monthlyCost)}</span>
                  </div>
                  {costPerEmp > 0 && (
                    <div>
                      <span className="text-xs text-[var(--color-text-muted)]">تكلفة/موظف: </span>
                      <span className="text-sm font-bold text-[rgb(var(--color-primary))] dark:text-[rgb(var(--color-primary))]">{formatCurrency(costPerEmp)}</span>
                    </div>
                  )}
                </div>

                {/* Driver Info */}
                {v.driverName && (
                  <div className="px-4 mt-2 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                    <span className="material-icons-round text-sm">person</span>
                    <span>{v.driverName}</span>
                    {v.driverPhone && <span dir="ltr">({v.driverPhone})</span>}
                  </div>
                )}

                {/* Expand employees */}
                <div className="px-4 py-3 mt-2 border-t border-[var(--color-border)]">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpandedId(isExpanded ? null : v.id!)}
                  >
                    {isExpanded ? `إخفاء الموظفين (${assignedEmployeeIds.length})` : `عرض الموظفين (${assignedEmployeeIds.length})`}
                  </Button>
                  {isExpanded && (
                    <div className="mt-2 space-y-1">
                      {assignedEmployeeIds.length === 0 ? (
                        <p className="text-xs text-[var(--color-text-muted)]">لا يوجد موظفون معيّنون</p>
                      ) : (
                        assignedEmployeeIds.map((empId) => (
                          <div key={empId} className="flex items-center gap-2 py-1.5 px-2 bg-[var(--color-bg)]/50 rounded-[var(--border-radius-base)] text-sm">
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
      </OpsDashPanel>
    </ModuleOpsPageShell>
  );
};

