import React, { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { SearchableSelect } from '@/components/UI';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { toast } from '../../../components/Toast';
import { repairBranchService } from '../services/repairBranchService';
import { warehouseService } from '../../inventory/services/warehouseService';
import type { Warehouse } from '../../inventory/types';
import { userService } from '../../../services/userService';
import { employeeService } from '../../hr/employeeService';
import type { FirestoreEmployee, FirestoreUser } from '../../../types';
import type { RepairBranch } from '../types';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';
import { usePermission } from '../../../utils/permissions';
import { useGlobalModalManager } from '@/components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '@/components/modal-manager/modalKeys';
import { isRepairCenterWarehouse } from '../lib/repairBranchMain';
import {
  fetchCachedPageData,
  invalidatePageDataCache,
  peekPageDataCache,
} from '../../shared/lib/pageDataCache';

const PAGE_SIZE = 20;
const BRANCHES_CACHE_KEY = 'repair:branches';

type BranchFormState = {
  name: string;
  phone: string;
  address: string;
  isMain: boolean;
  managerEmployeeId: string;
  managerEmployeeName: string;
  /** Required: link an existing maintenance-center warehouse. */
  warehouseId: string;
};

const emptyForm = (): BranchFormState => ({
  name: '',
  phone: '',
  address: '',
  isMain: false,
  managerEmployeeId: '',
  managerEmployeeName: '',
  warehouseId: '',
});

const toUserSafeError = (error: unknown, fallback: string): string => {
  const message = String((error as { message?: unknown })?.message || '').trim();
  const code = String((error as { code?: unknown })?.code || '').toLowerCase();
  if (code.includes('permission-denied') || /missing or insufficient permissions/i.test(message)) {
    return 'ليس لديك صلاحية كافية لتنفيذ هذه العملية.';
  }
  if (code.includes('unauthenticated')) {
    return 'يجب تسجيل الدخول أولًا ثم إعادة المحاولة.';
  }
  if (message && !/firebase|firestore|https?:\/\//i.test(message)) {
    return message;
  }
  return fallback;
};

export const RepairBranches: React.FC = () => {
  const { dir } = useAppDirection();
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();
  const canManageWarehouses = can('inventory.warehouses.manage');
  const initialBranchesCache = peekPageDataCache<RepairBranch[]>(BRANCHES_CACHE_KEY);
  const [rows, setRows] = useState<RepairBranch[]>(() => initialBranchesCache ?? []);
  const [loading, setLoading] = useState(() => !initialBranchesCache);
  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [employees, setEmployees] = useState<FirestoreEmployee[]>([]);
  const [search, setSearch] = useState('');
  const [mainFilter, setMainFilter] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<BranchFormState>(emptyForm);
  const [editingBranch, setEditingBranch] = useState<RepairBranch | null>(null);
  const [linkedWarehouse, setLinkedWarehouse] = useState<Warehouse | null>(null);
  const [centerWarehouses, setCenterWarehouses] = useState<Warehouse[]>([]);
  const [warehouseLoading, setWarehouseLoading] = useState(false);
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchSaving, setBranchSaving] = useState(false);
  const [managerFilter, setManagerFilter] = useState('');
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [employeeModalBranchId, setEmployeeModalBranchId] = useState('');
  const [employeeSaving, setEmployeeSaving] = useState(false);
  const [employeeModalMode, setEmployeeModalMode] = useState<'new' | 'existingEmployee' | 'existingUser'>('new');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [assignAsBranchManager, setAssignAsBranchManager] = useState(false);
  const [techniciansModalOpen, setTechniciansModalOpen] = useState(false);
  const [techniciansModalBranchId, setTechniciansModalBranchId] = useState('');
  const [technicianRemovingId, setTechnicianRemovingId] = useState<string | null>(null);
  const [newEmployeeForm, setNewEmployeeForm] = useState({ name: '', phone: '', code: '' });
  const [branchPendingDelete, setBranchPendingDelete] = useState<RepairBranch | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const loadBranches = async (opts?: { force?: boolean }) => {
    if (opts?.force) invalidatePageDataCache(BRANCHES_CACHE_KEY);
    const cached = peekPageDataCache<RepairBranch[]>(BRANCHES_CACHE_KEY);
    if (cached) {
      setRows(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const { data } = await fetchCachedPageData(
        BRANCHES_CACHE_KEY,
        () => repairBranchService.list(),
        { force: opts?.force === true, maxAgeMs: 60_000 },
      );
      setRows(data);
    } catch (error: unknown) {
      toast.error(toUserSafeError(error, 'تعذر تحميل فروع الصيانة.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBranches();
  }, []);

  useEffect(() => {
    void userService.getAll()
      .then((result) => setUsers(result.filter((user) => user.isActive !== false)))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    void employeeService.getAll()
      .then((result) => setEmployees(result.filter((employee) => employee.isActive !== false)))
      .catch(() => setEmployees([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void repairBranchService.ensureMaintenanceCenterWarehouseRoles()
      .then((result) => {
        if (cancelled || result.updated <= 0) return;
        toast.success(`تم تحديث دور ${result.updated} مخزن فرع إلى «مخزن مركز صيانة».`);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, mainFilter]);

  useEffect(() => {
    if (!branchModalOpen) return;
    let cancelled = false;
    setWarehouseLoading(true);
    void warehouseService
      .getActiveWarehouses()
      .then((all) => {
        if (cancelled) return;
        const centers = all
          .filter(isRepairCenterWarehouse)
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
        setCenterWarehouses(centers);
      })
      .catch(() => {
        if (cancelled) return;
        setCenterWarehouses([]);
        toast.error('تعذر تحميل مخازن مراكز الصيانة.');
      })
      .finally(() => {
        if (!cancelled) setWarehouseLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchModalOpen]);

  useEffect(() => {
    if (!branchModalOpen) {
      setLinkedWarehouse(null);
      return;
    }
    const selectedId = form.warehouseId.trim();
    if (!selectedId) {
      setLinkedWarehouse(null);
      return;
    }
    const fromList = centerWarehouses.find((item) => String(item.id || '') === selectedId) || null;
    setLinkedWarehouse(fromList);
  }, [branchModalOpen, form.warehouseId, centerWarehouses]);

  useEffect(() => {
    if (!branchModalOpen) return;
    const selectedId = form.warehouseId.trim();
    if (!selectedId) return;
    if (centerWarehouses.some((item) => String(item.id || '') === selectedId)) return;
    let cancelled = false;
    void warehouseService
      .getById(selectedId)
      .then((warehouse) => {
        if (cancelled || !warehouse?.id) return;
        setCenterWarehouses((prev) => {
          if (prev.some((item) => item.id === warehouse.id)) return prev;
          return [...prev, warehouse].sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), 'ar'),
          );
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [branchModalOpen, form.warehouseId, centerWarehouses]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((branch) => {
      if (mainFilter === 'main' && !branch.isMain) return false;
      if (mainFilter === 'other' && branch.isMain) return false;
      if (!q) return true;
      const haystack = [
        branch.name,
        branch.phone,
        branch.address,
        branch.managerEmployeeName,
        branch.warehouseCode,
      ].map((value) => String(value || '').toLowerCase()).join(' ');
      return haystack.includes(q);
    });
  }, [rows, search, mainFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(
    () => filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredRows, safePage],
  );

  const filteredManagers = useMemo(() => {
    const q = managerFilter.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((employee) => {
      const name = String(employee.name || '').toLowerCase();
      const code = String(employee.code || '').toLowerCase();
      return `${name} ${code}`.includes(q);
    });
  }, [employees, managerFilter]);

  const existingEmployeeOptions = useMemo(
    () =>
      employees
        .filter((employee) => employee.id)
        .map((employee) => ({
          value: String(employee.id || ''),
          label: `${employee.name || ''}${employee.code ? ` (${employee.code})` : ''}`.trim(),
        })),
    [employees],
  );

  const existingUserOptions = useMemo(
    () =>
      users
        .filter((user) => user.id)
        .map((user) => ({
          value: String(user.id || ''),
          label: `${user.displayName || user.email || ''}${user.email && user.displayName ? ` - ${user.email}` : ''}`.trim(),
        })),
    [users],
  );

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((employee) => {
      const id = String(employee.id || '').trim();
      if (!id) return;
      map.set(id, String(employee.name || '').trim() || id);
    });
    users.forEach((user) => {
      const id = String(user.id || '').trim();
      if (!id || map.has(id)) return;
      map.set(id, String(user.displayName || user.email || '').trim() || id);
    });
    return map;
  }, [employees, users]);

  const selectedTechniciansBranch = useMemo(
    () => rows.find((branch) => String(branch.id || '') === techniciansModalBranchId) || null,
    [rows, techniciansModalBranchId],
  );
  const selectedTechnicianIds = selectedTechniciansBranch?.technicianIds || [];

  const selectableCenterWarehouses = useMemo(() => {
    const editingId = String(editingBranch?.id || '').trim();
    const linkedElsewhere = new Set(
      rows
        .filter((branch) => String(branch.id || '').trim() !== editingId)
        .map((branch) => String(branch.warehouseId || '').trim())
        .filter(Boolean),
    );
    const currentId = form.warehouseId.trim();
    return centerWarehouses.filter((warehouse) => {
      const id = String(warehouse.id || '').trim();
      if (!id) return false;
      if (id === currentId) return true;
      return !linkedElsewhere.has(id);
    });
  }, [centerWarehouses, rows, editingBranch?.id, form.warehouseId]);

  const openCreateModal = () => {
    setEditingBranch(null);
    setLinkedWarehouse(null);
    setForm(emptyForm());
    setManagerFilter('');
    setBranchModalOpen(true);
  };

  const openEditModal = (branch: RepairBranch) => {
    setEditingBranch(branch);
    setForm({
      name: String(branch.name || ''),
      phone: String(branch.phone || ''),
      address: String(branch.address || ''),
      isMain: Boolean(branch.isMain),
      managerEmployeeId: String(branch.managerEmployeeId || ''),
      managerEmployeeName: String(branch.managerEmployeeName || ''),
      warehouseId: String(branch.warehouseId || '').trim(),
    });
    setManagerFilter('');
    setLinkedWarehouse(null);
    setBranchModalOpen(true);
  };

  const openWarehouseEditor = () => {
    if (!linkedWarehouse?.id || !canManageWarehouses) {
      toast.error('ليس لديك صلاحية تعديل المخازن، أو المخزن غير متاح.');
      return;
    }
    openModal(MODAL_KEYS.INVENTORY_WAREHOUSES_EDIT, {
      warehouse: linkedWarehouse,
      onSaved: () => {
        void (async () => {
          const refreshed = await warehouseService.getById(String(linkedWarehouse.id));
          setLinkedWarehouse(refreshed);
          if (refreshed?.id) {
            setCenterWarehouses((prev) => {
              const without = prev.filter((item) => item.id !== refreshed.id);
              return [...without, refreshed].sort((a, b) =>
                String(a.name || '').localeCompare(String(b.name || ''), 'ar'),
              );
            });
            if (editingBranch?.id && refreshed.code && refreshed.code !== editingBranch.warehouseCode) {
              await repairBranchService.updateLinkedWarehouse(editingBranch.id, {
                code: refreshed.code,
                name: refreshed.name,
              });
            }
            await loadBranches({ force: true });
          }
        })();
      },
    });
  };

  const saveBranch = async () => {
    if (!form.name.trim()) {
      toast.error('أدخل اسم الفرع.');
      return;
    }
    if (!form.managerEmployeeId) {
      toast.error('اختر المسؤول عن الفرع قبل الحفظ.');
      return;
    }
    if (!form.warehouseId.trim()) {
      toast.error('اختر مخزن مركز صيانة مرتبطًا بالفرع.');
      return;
    }
    setBranchSaving(true);
    try {
      if (editingBranch?.id) {
        await repairBranchService.update(editingBranch.id, {
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          isMain: form.isMain,
          managerEmployeeId: form.managerEmployeeId,
          managerEmployeeName: form.managerEmployeeName,
        });
        const nextWarehouseId = form.warehouseId.trim();
        const prevWarehouseId = String(editingBranch.warehouseId || '').trim();
        if (nextWarehouseId !== prevWarehouseId) {
          await repairBranchService.linkWarehouse(editingBranch.id, nextWarehouseId);
        }
        toast.success('تم تحديث الفرع والمخزن المرتبط.');
      } else {
        await repairBranchService.create({
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim(),
          isMain: form.isMain,
          managerEmployeeId: form.managerEmployeeId,
          managerEmployeeName: form.managerEmployeeName,
          technicianIds: [],
          warehouseId: form.warehouseId.trim(),
        });
        toast.success('تمت إضافة الفرع وربطه بمخزن المركز المختار.');
      }
      setBranchModalOpen(false);
      setEditingBranch(null);
      setLinkedWarehouse(null);
      setForm(emptyForm());
      await loadBranches({ force: true });
    } catch (error: unknown) {
      toast.error(toUserSafeError(error, 'تعذر حفظ الفرع.'));
    } finally {
      setBranchSaving(false);
    }
  };

  const remove = async () => {
    const id = branchPendingDelete?.id;
    if (!id) return;
    const requiredName = String(branchPendingDelete?.name || '').trim();
    if (deleteConfirmText.trim() !== requiredName) {
      toast.error('اكتب اسم الفرع بشكل صحيح لتأكيد الحذف.');
      return;
    }
    setDeleting(true);
    try {
      const result = await repairBranchService.removeCascade(id);
      const count = (key: string) => Number(result.deletedCounts?.[key] || 0);
      const details = [
        `الطلبات: ${count('repair_jobs')}`,
        `فواتير الصيانة: ${count('repair_sales_invoices')}`,
        `حركات قطع الغيار: ${count('repair_parts_transactions')}`,
        `حركات المخزون: ${count('stock_transactions') + count('stock_transactions_toWarehouseId')}`,
        `أرصدة المخزون: ${count('stock_items')}`,
        `طلبات التحويل: ${count('inventory_transfer_requests_fromWarehouseId') + count('inventory_transfer_requests_toWarehouseId')}`,
        `المخزن: ${count('warehouses')}`,
      ].join(' | ');
      const unlinkedTechs = Number(result.unlinkedCounts?.technicians || 0);
      const unlinkedManagers = Number(result.unlinkedCounts?.managers || 0);
      toast.success(
        `تم حذف الفرع وكل البيانات المرتبطة به (${result.deletedFirestoreDocs} سجل). ${details}. فك ربط الموظفين فقط: الفنيون ${unlinkedTechs}، المسؤول ${unlinkedManagers}.`,
      );
      await loadBranches({ force: true });
      setBranchPendingDelete(null);
      setDeleteConfirmText('');
    } catch (error: unknown) {
      toast.error(toUserSafeError(error, 'تعذر حذف الفرع.'));
    } finally {
      setDeleting(false);
    }
  };

  const openAddEmployeeModal = (branchId: string) => {
    setEmployeeModalBranchId(branchId);
    setEmployeeModalMode('new');
    setSelectedEmployeeId('');
    setSelectedUserId('');
    setAssignAsBranchManager(false);
    setNewEmployeeForm({ name: '', phone: '', code: '' });
    setEmployeeModalOpen(true);
  };

  const handleCreateEmployee = async () => {
    const targetBranch = rows.find((branch) => String(branch.id || '') === employeeModalBranchId);
    if (!targetBranch) {
      toast.error('تعذر تحديد الفرع المستهدف.');
      return;
    }
    setEmployeeSaving(true);
    try {
      let employeeId: string | null = null;
      let employeeName = '';

      if (employeeModalMode === 'new') {
        if (!newEmployeeForm.name.trim()) {
          toast.error('أدخل اسم الموظف.');
          return;
        }
        employeeName = newEmployeeForm.name.trim();
        employeeId = await employeeService.create({
          name: employeeName,
          phone: newEmployeeForm.phone.trim(),
          code: newEmployeeForm.code.trim(),
          departmentId: '',
          jobPositionId: '',
          level: 1,
          managerId: '',
          employmentType: 'full_time',
          baseSalary: 0,
          hourlyRate: 0,
          shiftId: '',
          vehicleId: '',
          hasSystemAccess: false,
          isActive: true,
        });
      }

      if (employeeModalMode === 'existingEmployee') {
        if (!selectedEmployeeId) {
          toast.error('اختر موظفًا من القائمة.');
          return;
        }
        const selectedEmployee = employees.find((employee) => String(employee.id || '') === selectedEmployeeId);
        if (!selectedEmployee?.id) {
          toast.error('الموظف المحدد غير صالح.');
          return;
        }
        employeeId = String(selectedEmployee.id);
        employeeName = String(selectedEmployee.name || '');
      }

      if (employeeModalMode === 'existingUser') {
        if (!selectedUserId) {
          toast.error('اختر مستخدمًا من القائمة.');
          return;
        }
        const selectedUser = users.find((user) => String(user.id || '') === selectedUserId);
        if (!selectedUser?.id) {
          toast.error('المستخدم المحدد غير صالح.');
          return;
        }

        const existingEmployee = employees.find((employee) => String(employee.userId || '') === String(selectedUser.id));
        if (existingEmployee?.id) {
          employeeId = String(existingEmployee.id);
          employeeName = String(existingEmployee.name || selectedUser.displayName || selectedUser.email);
        } else {
          employeeName = String(selectedUser.displayName || selectedUser.email || 'موظف');
          employeeId = await employeeService.create({
            name: employeeName,
            phone: '',
            code: String(selectedUser.code || ''),
            departmentId: '',
            jobPositionId: '',
            level: 1,
            managerId: '',
            employmentType: 'full_time',
            baseSalary: 0,
            hourlyRate: 0,
            shiftId: '',
            vehicleId: '',
            hasSystemAccess: true,
            isActive: true,
            userId: String(selectedUser.id),
            email: String(selectedUser.email || ''),
          });
        }
      }

      if (employeeId) {
        await repairBranchService.assignTechnicianToBranch(employeeModalBranchId, employeeId);
      }
      if (assignAsBranchManager && employeeId) {
        await repairBranchService.update(employeeModalBranchId, {
          managerEmployeeId: employeeId,
          managerEmployeeName: employeeName,
        });
      }
      await Promise.all([
        employeeService.getAll().then((result) => setEmployees(result.filter((e) => e.isActive !== false))),
        loadBranches({ force: true }),
      ]);
      setEmployeeModalOpen(false);
      toast.success('تم ربط الفني بالفرع بنجاح.');
    } catch (error: unknown) {
      toast.error(toUserSafeError(error, 'تعذر تنفيذ العملية.'));
    } finally {
      setEmployeeSaving(false);
    }
  };

  const openTechniciansModal = (branchId: string) => {
    setTechniciansModalBranchId(branchId);
    setTechniciansModalOpen(true);
  };

  const removeTechnicianFromBranch = async (technicianId: string) => {
    const branchId = String(techniciansModalBranchId || '').trim();
    const techId = String(technicianId || '').trim();
    if (!branchId || !techId) return;
    setTechnicianRemovingId(techId);
    try {
      await repairBranchService.removeTechnicianFromBranch(branchId, techId);
      setRows((prev) =>
        prev.map((branch) =>
          String(branch.id || '') === branchId
            ? {
                ...branch,
                technicianIds: (branch.technicianIds || []).filter((id) => String(id || '').trim() !== techId),
              }
            : branch,
        ),
      );
      invalidatePageDataCache(BRANCHES_CACHE_KEY);
      toast.success('تمت إزالة الفني من الفرع.');
    } catch (error: unknown) {
      toast.error(toUserSafeError(error, 'تعذر إزالة الفني من الفرع.'));
    } finally {
      setTechnicianRemovingId(null);
    }
  };

  return (
    <div className="erp-ds-clean space-y-4 p-4 md:p-6" dir={dir}>
      <PageHeader
        title="فروع الصيانة"
        subtitle="إدارة فروع مراكز الصيانة والمخزن المرتبط والمسؤول والفنيين."
        icon="warehouse"
        primaryAction={{
          label: 'إضافة فرع',
          icon: 'add',
          onClick: openCreateModal,
        }}
      />

      <Card className="!p-4">
        <SmartFilterBar
          pageId="repair-branches"
          searchPlaceholder="بحث بالاسم أو الهاتف أو العنوان أو المسؤول أو كود المخزن..."
          searchValue={search}
          onSearchChange={setSearch}
          filters={[
            {
              key: 'main',
              label: 'النوع',
              defaultVisible: true,
              options: [
                { value: '', label: 'كل الفروع' },
                { value: 'main', label: 'رئيسي فقط' },
                { value: 'other', label: 'غير رئيسي' },
              ],
            },
          ]}
          filterValues={{ main: mainFilter }}
          onFilterChange={(key, value) => {
            if (key === 'main') setMainFilter(value);
          }}
          extra={(
            <Button type="button" variant="secondary" onClick={() => void loadBranches({ force: true })} disabled={loading}>
              تحديث
            </Button>
          )}
        />

        <div className="mt-4 overflow-x-auto rounded-lg border">
          <table className="erp-table w-full text-right">
            <thead className="erp-thead">
              <tr>
                <th className="erp-th">الفرع</th>
                <th className="erp-th">الهاتف</th>
                <th className="erp-th">العنوان</th>
                <th className="erp-th">المسؤول</th>
                <th className="erp-th">كود المخزن</th>
                <th className="erp-th">الفنيون</th>
                <th className="erp-th">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`sk-${idx}`} className="border-t">
                    <td className="px-3 py-3" colSpan={7}>
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ))
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    {rows.length === 0 ? 'لا توجد فروع صيانة حالياً.' : 'لا توجد فروع مطابقة للبحث.'}
                  </td>
                </tr>
              ) : (
                pagedRows.map((branch) => {
                  const branchId = String(branch.id || '');
                  const techCount = (branch.technicianIds || []).length;
                  return (
                    <tr key={branchId || branch.name} className="border-t border-[var(--color-border)]">
                      <td className="px-3 py-2.5 text-sm font-medium">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{branch.name}</span>
                          {branch.isMain ? <Badge variant="default">رئيسي</Badge> : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-sm font-mono tabular-nums">{branch.phone || '—'}</td>
                      <td className="px-3 py-2.5 text-sm text-muted-foreground max-w-[220px] truncate" title={branch.address || ''}>
                        {branch.address || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-sm">{branch.managerEmployeeName || 'غير محدد'}</td>
                      <td className="px-3 py-2.5 text-sm font-mono text-xs">{branch.warehouseCode || '—'}</td>
                      <td className="px-3 py-2.5 text-sm tabular-nums">{techCount}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => openEditModal(branch)}>
                            تعديل
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openTechniciansModal(branchId)}>
                            فنيون
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openAddEmployeeModal(branchId)}>
                            أضف فني
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => setBranchPendingDelete(branch)}>
                            حذف
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && filteredRows.length > 0 ? (
          <DataPaginationFooter
            page={safePage}
            totalPages={totalPages}
            totalItems={filteredRows.length}
            onPageChange={setPage}
            itemLabel="فرع"
          />
        ) : null}
      </Card>

      <Dialog
        open={branchModalOpen}
        onOpenChange={(open) => {
          setBranchModalOpen(open);
          if (!open) {
            setEditingBranch(null);
            setLinkedWarehouse(null);
            setManagerFilter('');
            setForm(emptyForm());
          }
        }}
      >
        <DialogContent dir={dir} className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingBranch ? 'تعديل فرع' : 'إضافة فرع'}</DialogTitle>
            <DialogDescription>
              {editingBranch
                ? 'حدّث بيانات الفرع واختر مخزن مركز الصيانة المرتبط. عند تعيين فرع رئيسي يُلغى الرئيسي السابق تلقائيًا.'
                : 'أدخل بيانات الفرع واختر مخزن مركز صيانة من القائمة لربطه بالفرع.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الاسم <span className="text-rose-600">*</span></Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="اسم الفرع"
                disabled={branchSaving}
              />
            </div>
            <div className="space-y-1.5">
              <Label>الهاتف</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="01xxxxxxxxx"
                disabled={branchSaving}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>العنوان</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
                placeholder="العنوان"
                disabled={branchSaving}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>المسؤول عن الفرع <span className="text-rose-600">*</span></Label>
              <Select
                value={form.managerEmployeeId || ''}
                onOpenChange={(open) => {
                  if (!open) setManagerFilter('');
                }}
                onValueChange={(value) => {
                  const employee = employees.find((item) => item.id === value);
                  setForm((prev) => ({
                    ...prev,
                    managerEmployeeId: value,
                    managerEmployeeName: String(employee?.name || ''),
                  }));
                }}
                disabled={branchSaving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الموظف المسؤول" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2 border-b">
                    <Input
                      value={managerFilter}
                      onChange={(e) => setManagerFilter(e.target.value)}
                      placeholder="ابحث عن مسؤول..."
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  {filteredManagers.map((employee) => (
                    <SelectItem key={employee.id} value={String(employee.id || '')}>
                      {employee.name}
                      {employee.code ? ` (${employee.code})` : ''}
                    </SelectItem>
                  ))}
                  {filteredManagers.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">لا توجد نتائج مطابقة.</div>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <label className="inline-flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={form.isMain}
                onChange={(e) => setForm((prev) => ({ ...prev, isMain: e.target.checked }))}
                disabled={branchSaving}
              />
              فرع رئيسي
            </label>
            <div className="md:col-span-2 space-y-3 rounded-md border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold">المخزن المرتبط</div>
                {canManageWarehouses && linkedWarehouse?.id ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={branchSaving || warehouseLoading}
                    onClick={openWarehouseEditor}
                  >
                    تعديل كامل للمخزن
                  </Button>
                ) : null}
              </div>
              {warehouseLoading ? (
                <p className="text-xs text-muted-foreground">جاري تحميل مخازن المراكز…</p>
              ) : null}
              <div className="space-y-1.5">
                <Label>
                  مخزن مركز الصيانة <span className="text-rose-600">*</span>
                </Label>
                <Select
                  value={form.warehouseId.trim() || undefined}
                  onValueChange={(value) => {
                    setForm((prev) => ({
                      ...prev,
                      warehouseId: value,
                    }));
                  }}
                  disabled={branchSaving || warehouseLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر مخزن مركز صيانة" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableCenterWarehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={String(warehouse.id || '')}>
                        {warehouse.name}
                        {warehouse.code ? ` (${warehouse.code})` : ''}
                      </SelectItem>
                    ))}
                    {selectableCenterWarehouses.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        لا توجد مخازن مراكز متاحة للربط. أنشئ مخزن مركز صيانة من إدارة المخازن أولًا.
                      </div>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>
              {linkedWarehouse ? (
                <p className="text-xs text-muted-foreground font-mono">
                  الكود: {linkedWarehouse.code || '—'} · المعرف: {linkedWarehouse.id || '—'}
                </p>
              ) : (
                <p className="text-xs text-amber-700">اختر مخزنًا من مخازن مراكز الصيانة غير المرتبطة بفرع آخر.</p>
              )}
            </div>
            <div className="md:col-span-2 rounded-md border border-sky-200 bg-sky-50/60 p-3 text-sm">
              <p className="font-semibold text-sky-950">الربط المحاسبي مستقل عن بيانات الفرع التشغيلية</p>
              <p className="mt-1 text-xs text-sky-800">
                بعد حفظ الفرع، اربطه بمركز التكلفة فقط من «الحسابات ← إعدادات الحسابات» —
                الحسابات الافتراضية تُطبَّق تلقائيًا عند الحفظ.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={branchSaving}
              onClick={() => setBranchModalOpen(false)}
            >
              إلغاء
            </Button>
            <Button onClick={() => void saveBranch()} disabled={branchSaving}>
              {branchSaving ? 'جاري الحفظ...' : editingBranch ? 'حفظ التعديلات' : 'إضافة الفرع'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(branchPendingDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setBranchPendingDelete(null);
            setDeleteConfirmText('');
          }
        }}
      >
        <DialogContent dir={dir} className="max-w-md">
          <DialogHeader>
            <DialogTitle>تأكيد حذف الفرع</DialogTitle>
            <DialogDescription>
              هل تريد حذف الفرع &quot;{branchPendingDelete?.name}&quot;؟ سيتم حذف جميع البيانات المرتبطة به نهائيًا ولا يمكن التراجع.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-branch-confirm-name">
              للتأكيد اكتب اسم الفرع بالكامل:
              {' '}
              <span className="font-semibold">{branchPendingDelete?.name || '—'}</span>
            </Label>
            <Input
              id="delete-branch-confirm-name"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="اكتب اسم الفرع هنا"
              autoComplete="off"
              disabled={deleting}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={deleting}
              onClick={() => {
                setBranchPendingDelete(null);
                setDeleteConfirmText('');
              }}
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              onClick={() => void remove()}
              disabled={deleting || deleteConfirmText.trim() !== String(branchPendingDelete?.name || '').trim()}
            >
              {deleting ? 'جاري الحذف...' : 'حذف نهائي'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={employeeModalOpen} onOpenChange={setEmployeeModalOpen}>
        <DialogContent dir={dir}>
          <DialogHeader>
            <DialogTitle>إضافة فني للفرع</DialogTitle>
            <DialogDescription>
              إنشاء موظف جديد أو اختياره من الموظفين/المستخدمين وربطه كفني على الفرع.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>طريقة الإضافة</Label>
              <Select
                value={employeeModalMode}
                onValueChange={(value) => setEmployeeModalMode(value as 'new' | 'existingEmployee' | 'existingUser')}
                disabled={employeeSaving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر طريقة الإضافة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">إنشاء موظف جديد</SelectItem>
                  <SelectItem value="existingEmployee">اختيار من الموظفين</SelectItem>
                  <SelectItem value="existingUser">اختيار من المستخدمين</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {employeeModalMode === 'new' && (
              <>
                <div>
                  <Label>اسم الموظف</Label>
                  <Input
                    value={newEmployeeForm.name}
                    onChange={(e) => setNewEmployeeForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="الاسم بالكامل"
                    disabled={employeeSaving}
                  />
                </div>
                <div>
                  <Label>رقم الهاتف</Label>
                  <Input
                    value={newEmployeeForm.phone}
                    onChange={(e) => setNewEmployeeForm((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="01xxxxxxxxx"
                    disabled={employeeSaving}
                  />
                </div>
                <div>
                  <Label>كود الموظف (اختياري)</Label>
                  <Input
                    value={newEmployeeForm.code}
                    onChange={(e) => setNewEmployeeForm((prev) => ({ ...prev, code: e.target.value }))}
                    placeholder="EMP-001"
                    disabled={employeeSaving}
                  />
                </div>
              </>
            )}

            {employeeModalMode === 'existingEmployee' && (
              <div>
                <Label>اختر موظف</Label>
                <SearchableSelect
                  options={existingEmployeeOptions}
                  value={selectedEmployeeId}
                  onChange={setSelectedEmployeeId}
                  placeholder="ابحث واختر من الموظفين الحاليين"
                  disabled={employeeSaving}
                />
              </div>
            )}

            {employeeModalMode === 'existingUser' && (
              <div>
                <Label>اختر مستخدم</Label>
                <SearchableSelect
                  options={existingUserOptions}
                  value={selectedUserId}
                  onChange={setSelectedUserId}
                  placeholder="ابحث واختر من المستخدمين الحاليين"
                  disabled={employeeSaving}
                />
              </div>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={assignAsBranchManager}
                onChange={(e) => setAssignAsBranchManager(e.target.checked)}
                disabled={employeeSaving}
              />
              تعيين كمسؤول الفرع أيضًا
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmployeeModalOpen(false)} disabled={employeeSaving}>إلغاء</Button>
            <Button onClick={() => void handleCreateEmployee()} disabled={employeeSaving}>
              {employeeSaving ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={techniciansModalOpen} onOpenChange={setTechniciansModalOpen}>
        <DialogContent dir={dir} className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              فنيو الفرع — {selectedTechniciansBranch?.name || 'الفرع'}
            </DialogTitle>
            <DialogDescription>
              الفنيون المعيّنون يمكنهم رؤية الطلبات المسندة إليهم من «طلباتي (فني)».
              {' '}
              العدد: {selectedTechnicianIds.length}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {selectedTechnicianIds.length === 0 ? (
              <div className="text-sm text-muted-foreground">لا يوجد فنيون معيّنون لهذا الفرع.</div>
            ) : (
              selectedTechnicianIds.map((technicianId) => {
                const techKey = String(technicianId || '').trim();
                const removing = technicianRemovingId === techKey;
                return (
                  <div key={techKey} className="rounded border px-3 py-2 text-sm flex items-center justify-between gap-2">
                    <span>{employeeNameById.get(techKey) || `معرف: ${techKey}`}</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={removing}
                      onClick={() => void removeTechnicianFromBranch(techKey)}
                    >
                      {removing ? 'جاري الإزالة...' : 'إزالة'}
                    </Button>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setTechniciansModalOpen(false);
                if (techniciansModalBranchId) openAddEmployeeModal(techniciansModalBranchId);
              }}
            >
              إضافة فني
            </Button>
            <Button variant="outline" onClick={() => setTechniciansModalOpen(false)}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RepairBranches;
