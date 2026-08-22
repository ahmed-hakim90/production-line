import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  EyeOff,
  Flag,
  Hammer,
  Info,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Share2,
  Trash2,
  TrendingUp,
  User,
  UserCog,
  UserMinus,
  UserPlus,
  X,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { useAppStore } from '../../../store/useAppStore';
import { Button, Badge } from '../components/UI';
import { SelectableTable, type TableColumn, type TableBulkAction } from '../../shared/components/SelectableTable';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { ManagedModalPortal } from '@/components/modal-manager/ManagedModalPortal';
import type { FirestoreEmployee, FirestoreUser, EmploymentType } from '../../../types';
import { EMPLOYMENT_TYPE_LABELS } from '../../../types';
import { usePermission } from '../../../utils/permissions';
import { userService } from '../../../services/userService';
import { activityLogService } from '../../system/services/activityLogService';
import { employeeService } from '../employeeService';
import { JOB_LEVEL_LABELS } from '../types';
import type { FirestoreDepartment, FirestoreJobPosition, FirestoreShift, FirestoreVehicle } from '../types';
import { getDocs } from 'firebase/firestore';
import { departmentsRef, jobPositionsRef, shiftsRef } from '../collections';
import {
  createDepartment,
  createJobPosition,
  createShift,
} from '../usecases/manageOrganization';
import { unwrapOrThrow } from '@/shared/usecases';
import { vehicleService } from '../vehicleService';
import type { JobLevel } from '../types';
import { getTodayDateString } from '../../../utils/calculations';
import { exportAllEmployees } from '../../../utils/exportExcel';
import { getExportImportPageControl } from '../../../utils/exportImportControls';
import { useRegisterModalOpener } from '../../../components/modal-manager/useRegisterModalOpener';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { ModuleOpsPageShell } from '@/modules/dashboards/components/ModuleOpsPageShell';
import { OpsMoreActionsMenu } from '@/modules/dashboards/components/OpsMoreActionsMenu';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { PageContentSkeleton } from '@/src/shared/ui/skeletons';
import { productionWorkerService } from '@/modules/production/services/productionWorkerService';
import { productionLineWorkerAssignmentService } from '@/modules/production/services/productionLineWorkerAssignmentService';
import { supervisorLineAssignmentService } from '@/modules/production/services/supervisorLineAssignmentService';
import { lineService } from '@/modules/production/services/lineService';
import {
  buildProductionEmployeeContext,
  type ProductionEmployeeContext,
} from '@/modules/production/utils/productionEmployeeContext';
import { useCursorPagination } from '@/hooks/useCursorPagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { normalizeFirestoreSearch, resolveFirestoreSearchKey } from '@/lib/firestoreSearch';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';
import { matchesEmployeeSearch, mergeEmployeeSearchResults } from '../utils/employeeSearch';

const emptyForm: Omit<FirestoreEmployee, 'id' | 'createdAt'> = {
  name: '',
  phone: '',
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
  code: '',
};

const getEmployeeDisplayName = (employee: Partial<Pick<FirestoreEmployee, 'name' | 'code' | 'id'>>): string => {
  const name = String(employee.name || '').trim();
  if (name) return name;
  const code = String(employee.code || '').trim();
  if (code) return `(${code})`;
  return String(employee.id || '—');
};

const EMPLOYEE_ICON_MAP: Record<string, LucideIcon> = {
  person: User,
  check: Check,
  close: X,
  edit: Pencil,
  person_off: UserMinus,
  person_add: UserPlus,
  delete_forever: Trash2,
  manage_accounts: UserCog,
  warning: AlertTriangle,
  add: Plus,
  lock: Lock,
  trending_up: TrendingUp,
  history: Clock3,
  account_balance_wallet: Wallet,
  info: Info,
  check_circle: CheckCircle2,
  error: AlertTriangle,
  share: Share2,
  refresh: Loader2,
};

const EmployeeIcon = ({
  name,
  ...iconProps
}: {
  name: string;
} & React.ComponentProps<'svg'>) => {
  const Icon = EMPLOYEE_ICON_MAP[name] ?? Hammer;
  return <Icon {...iconProps} />;
};

export const Employees: React.FC = () => {
  const navigate = useTenantNavigate();
  const { can, canManageUsers } = usePermission();

  const employees = useAppStore((s) => s.employees);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const createEmployee = useAppStore((s) => s.createEmployee);
  const updateEmployee = useAppStore((s) => s.updateEmployee);
  const deleteEmployee = useAppStore((s) => s.deleteEmployee);
  const roles = useAppStore((s) => s.roles);
  const createUser = useAppStore((s) => s.createUser);
  const resetUserPassword = useAppStore((s) => s.resetUserPassword);
  const exportImportSettings = useAppStore((s) => s.systemSettings.exportImport);

  const uid = useAppStore((s) => s.uid);
  const userEmail = useAppStore((s) => s.userEmail);

  const [departments, setDepartments] = useState<FirestoreDepartment[]>([]);
  const [jobPositions, setJobPositions] = useState<FirestoreJobPosition[]>([]);
  const [shifts, setShifts] = useState<FirestoreShift[]>([]);
  const [vehicles, setVehicles] = useState<FirestoreVehicle[]>([]);
  const [allUsers, setAllUsers] = useState<FirestoreUser[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [tenantEmployeeCount, setTenantEmployeeCount] = useState<number | null>(null);
  const [productionEmployeeContext, setProductionEmployeeContext] = useState<Map<string, ProductionEmployeeContext>>(new Map());

  const [search, setSearch] = useState('');
  const [filterValues, setFilterValues] = useState({
    department: '',
    jobPosition: '',
    status: 'all',
    employmentType: '',
    systemAccess: 'all',
  });
  const debouncedSearch = useDebouncedValue(search, 350);
  const normalizedDebouncedSearch = normalizeFirestoreSearch(debouncedSearch);
  const serverSearch = normalizedDebouncedSearch.length >= 2 ? debouncedSearch : '';
  const employeeQueryKey = useMemo(() => JSON.stringify({
    search: resolveFirestoreSearchKey(serverSearch),
    filters: filterValues,
  }), [serverSearch, filterValues]);
  const loadEmployeePage = useCallback((cursor: Parameters<typeof employeeService.listPaged>[0]['cursor']) =>
    employeeService.listPaged({
      pageSize: 20,
      cursor,
      search: serverSearch,
    }).then((result) => ({
      items: result.items,
      nextCursor: result.nextCursor,
      hasNext: result.hasMore,
    })), [serverSearch]);
  const employeePager = useCursorPagination<FirestoreEmployee, NonNullable<Awaited<ReturnType<typeof employeeService.listPaged>>['nextCursor']>>({
    queryKey: employeeQueryKey,
    loadPage: loadEmployeePage,
    keepPreviousData: true,
  });
  const listEmployees = employeePager.items;
  const listLoading = employeePager.loading;

  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRoleId, setFormRoleId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [shareCredentials, setShareCredentials] = useState<{ name: string; email: string; password: string; phone: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [toggleConfirmId, setToggleConfirmId] = useState<string | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);
  const [formTab, setFormTab] = useState<'job' | 'salary' | 'access'>('job');
  const [recreateAccount, setRecreateAccount] = useState(false);
  const pageControl = useMemo(
    () => getExportImportPageControl(exportImportSettings, 'employees'),
    [exportImportSettings]
  );
  const canExportFromPage = can('export') && pageControl.exportEnabled;
  const canImportFromPage = can('import') && pageControl.importEnabled;

  // Quick-add states
  const [quickAddType, setQuickAddType] = useState<'department' | 'position' | 'shift' | null>(null);
  const [quickAddName, setQuickAddName] = useState('');
  const [quickAddCode, setQuickAddCode] = useState('');
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  const usersMap = useMemo(() => {
    const m: Record<string, FirestoreUser> = {};
    allUsers.forEach((u) => {
      if (u.id) m[u.id] = u;
    });
    return m;
  }, [allUsers]);

  const pendingUsers = useMemo(() => allUsers.filter((u) => !u.isActive), [allUsers]);

  const loadRefData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [deptSnap, posSnap, shiftSnap, vehiclesList] = await Promise.all([
        getDocs(departmentsRef()),
        getDocs(jobPositionsRef()),
        getDocs(shiftsRef()),
        vehicleService.getAll(),
      ]);
      setDepartments(deptSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreDepartment)));
      setJobPositions(posSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreJobPosition)));
      setShifts(shiftSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreShift)));
      setVehicles(vehiclesList.filter((v) => v.isActive));
    } catch (e) {
      console.error('loadRefData error:', e);
    } finally {
      setDataLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    if (!canManageUsers) return;
    try {
      const list = await userService.getAll();
      setAllUsers(list);
    } catch (e) {
      console.error('loadUsers error:', e);
    }
  }, [canManageUsers]);

  const loadProductionEmployeeContext = useCallback(async () => {
    const today = getTodayDateString();
    try {
      const [workers, lineAssignments, supervisorAssignments, lines] = await Promise.all([
        productionWorkerService.getAll(),
        productionLineWorkerAssignmentService.getAll(),
        supervisorLineAssignmentService.getActiveByDate(today),
        lineService.getAll(),
      ]);
      setProductionEmployeeContext(buildProductionEmployeeContext({
        workers,
        lineAssignments,
        supervisorAssignments,
        lines,
        date: today,
      }));
    } catch (e) {
      console.error('loadProductionEmployeeContext error:', e);
      setProductionEmployeeContext(new Map());
    }
  }, []);

  useEffect(() => {
    loadRefData();
  }, [loadRefData]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    void loadProductionEmployeeContext();
  }, [loadProductionEmployeeContext]);

  useEffect(() => {
    void employeeService.countTenantEmployees().then(setTenantEmployeeCount).catch((e) => {
      console.error('countTenantEmployees error:', e);
    });
  }, []);

  const reloadEmployeeList = useCallback(async () => {
    await employeePager.refresh();
    void employeeService.countTenantEmployees().then(setTenantEmployeeCount);
  }, [employeePager.refresh]);

  const getDepartmentName = (id: string) => departments.find((d) => d.id === id)?.name ?? '—';
  const getJobPositionTitle = (id: string) => jobPositions.find((j) => j.id === id)?.title ?? '—';
  const getShiftName = (id: string) => shifts.find((s) => s.id === id)?.name ?? '—';
  const getVehicleName = (id: string) => vehicles.find((v) => v.id === id)?.name ?? '—';
  const getManagerName = (id: string) =>
    listEmployees.find((e) => e.id === id)?.name
    ?? _rawEmployees.find((e) => e.id === id)?.name
    ?? '—';
  const getProductionContext = (employeeId: string | undefined) =>
    employeeId ? productionEmployeeContext.get(employeeId) : undefined;
  const getEffectiveManagerName = (employee: FirestoreEmployee) => {
    const context = getProductionContext(employee.id);
    return context?.managerId ? getManagerName(context.managerId) : getManagerName(employee.managerId || '');
  };

  const resolveEmployeeById = useCallback(
    (id: string | null | undefined) =>
      (id ? listEmployees.find((e) => e.id === id) ?? _rawEmployees.find((e) => e.id === id) : undefined),
    [listEmployees, _rawEmployees],
  );

  const summaryKpis = useMemo(() => {
    const total = tenantEmployeeCount ?? listEmployees.length;
    const summaryEmployees = _rawEmployees.length > 0 ? _rawEmployees : listEmployees;
    const active = summaryEmployees.filter((e) => e.isActive !== false).length;
    const inactive = summaryEmployees.filter((e) => e.isActive === false).length;
    const withSystemAccess = summaryEmployees.filter((e) => e.hasSystemAccess).length;
    const pending = pendingUsers.length;
    return { total, active, inactive, withSystemAccess, pending };
  }, [tenantEmployeeCount, listEmployees, _rawEmployees, pendingUsers.length]);

  const filtered = useMemo(() => {
    const inputIsDebounced = normalizeFirestoreSearch(search) === normalizedDebouncedSearch;
    let list = listEmployees;
    if (inputIsDebounced && !listLoading && normalizedDebouncedSearch.length >= 2) {
      list = mergeEmployeeSearchResults(listEmployees, _rawEmployees, debouncedSearch);
    } else if (inputIsDebounced && !listLoading && normalizedDebouncedSearch.length === 1) {
      list = listEmployees.filter((employee) => matchesEmployeeSearch(employee, debouncedSearch));
    }
    if (filterValues.department && filterValues.department !== 'all') list = list.filter((e) => e.departmentId === filterValues.department);
    if (filterValues.jobPosition && filterValues.jobPosition !== 'all') list = list.filter((e) => e.jobPositionId === filterValues.jobPosition);
    if (filterValues.status === 'active') list = list.filter((e) => e.isActive !== false);
    if (filterValues.status === 'inactive') list = list.filter((e) => e.isActive === false);
    if (filterValues.employmentType && filterValues.employmentType !== 'all') list = list.filter((e) => e.employmentType === filterValues.employmentType);
    if (filterValues.systemAccess === 'yes') list = list.filter((e) => e.hasSystemAccess);
    if (filterValues.systemAccess === 'no') list = list.filter((e) => !e.hasSystemAccess);
    return list;
  }, [listEmployees, _rawEmployees, search, debouncedSearch, normalizedDebouncedSearch, listLoading, filterValues]);

  const filteredSalaryTotal = useMemo(
    () => filtered.reduce((sum, emp) => sum + Number(emp.baseSalary ?? 0), 0),
    [filtered]
  );

  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm });
    setFormEmail('');
    setFormPassword('');
    setFormRoleId(roles[0]?.id ?? '');
    setSaveMsg(null);
    setShareCredentials(null);
    setFormTab('job');
    setRecreateAccount(false);
    setShowModal(true);
  };
  useRegisterModalOpener(MODAL_KEYS.EMPLOYEES_CREATE, () => openCreate());

  const openEdit = async (id: string) => {
    let raw = listEmployees.find((e) => e.id === id) ?? _rawEmployees.find((e) => e.id === id);
    if (!raw) {
      try {
        raw = (await employeeService.getById(id)) ?? undefined;
      } catch {
        raw = undefined;
      }
    }
    if (!raw) return;
    setEditId(id);
    setForm({
      name: raw.name ?? '',
      phone: raw.phone ?? '',
      departmentId: raw.departmentId ?? '',
      jobPositionId: raw.jobPositionId ?? '',
      level: raw.level ?? 1,
      managerId: raw.managerId ?? '',
      employmentType: (raw.employmentType as EmploymentType) ?? 'full_time',
      baseSalary: raw.baseSalary ?? 0,
      hourlyRate: raw.hourlyRate ?? 0,
      shiftId: raw.shiftId ?? '',
      vehicleId: raw.vehicleId ?? '',
      hasSystemAccess: raw.hasSystemAccess ?? false,
      isActive: raw.isActive !== false,
      code: raw.code ?? '',
    });
    setFormEmail(raw.email ?? '');
    setFormPassword('');
    const cachedRoleId = raw.userId ? usersMap[raw.userId]?.roleId : undefined;
    setFormRoleId(roles.find((r) => r.id === cachedRoleId)?.id ?? roles[0]?.id ?? '');
    setSaveMsg(null);
    setShareCredentials(null);
    setFormTab('job');
    setRecreateAccount(false);
    setShowModal(true);

    // Fetch freshest user role to avoid stale role display.
    if (raw.userId) {
      try {
        const latestUser = await userService.get(raw.userId);
        if (latestUser?.roleId) {
          setFormRoleId(roles.find((r) => r.id === latestUser.roleId)?.id ?? roles[0]?.id ?? '');
        }
      } catch (e) {
        console.error('openEdit: failed to fetch latest user role', e);
      }
    }
  };

  const getAuthErrorMsg = (err: any): string => {
    if (err?.code === 'auth/email-already-in-use') return 'البريد الإلكتروني مستخدم بالفعل في حساب آخر';
    if (err?.code === 'auth/weak-password') return 'كلمة المرور ضعيفة — استخدم 6 أحرف على الأقل';
    if (err?.code === 'auth/invalid-email') return 'صيغة البريد الإلكتروني غير صحيحة';
    return err?.message || 'خطأ غير معروف';
  };

  const shareCredentialsToWhatsApp = () => {
    if (!shareCredentials) return;
    const loginUrl = `${window.location.origin}/login`;
    const msg = [
      `أهلاظ‹ ${shareCredentials.name}`,
      'تم إنشاء حسابك على نظام الشركة.',
      '',
      `البريد الإلكتروني: ${shareCredentials.email}`,
      `كلمة المرور: ${shareCredentials.password}`,
      `رابط الدخول: ${loginUrl}`,
      '',
      'يرجى تغيير كلمة المرور بعد أول تسجيل دخول.',
    ].join('\n');
    const encoded = encodeURIComponent(msg);
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const phoneDigits = (shareCredentials.phone || '').replace(/[^\d]/g, '');
    const url = phoneDigits
      ? (isMobile
        ? `whatsapp://send?phone=${phoneDigits}&text=${encoded}`
        : `https://wa.me/${phoneDigits}?text=${encoded}`)
      : (isMobile ? `whatsapp://send?text=${encoded}` : `https://wa.me/?text=${encoded}`);
    window.open(url, '_blank');
  };

  const handleSave = async () => {
    if (!isFormValid) return;
    setSaving(true);
    setSaveMsg(null);
    setShareCredentials(null);
    try {
      const payload: Omit<FirestoreEmployee, 'id' | 'createdAt'> = {
        name: form.name.trim(),
        phone: (form.phone || '').trim(),
        departmentId: form.departmentId || '',
        jobPositionId: form.jobPositionId || '',
        level: form.level,
        managerId: form.managerId || '',
        employmentType: form.employmentType as EmploymentType,
        baseSalary: Number(form.baseSalary) || 0,
        hourlyRate: Number(form.hourlyRate) || 0,
        shiftId: form.shiftId || '',
        vehicleId: form.vehicleId || '',
        hasSystemAccess: form.hasSystemAccess,
        isActive: form.isActive,
        code: form.code || '',
        ...(form.hasSystemAccess && formEmail.trim() ? { email: formEmail.trim() } : {}),
      };

      if (editId) {
        if (salaryChanged && uid && userEmail) {
          activityLogService.log(
            uid,
            userEmail,
            'SALARY_CHANGE',
            `تعديل راتب ${form.name.trim()}: ${originalSalary} â†’ ${Number(form.baseSalary)}`,
            {
              employeeId: editId,
              employeeName: form.name.trim(),
              oldSalary: originalSalary,
              newSalary: Number(form.baseSalary),
              editorEmail: userEmail,
            },
          );
        }

        await updateEmployee(editId, payload);
        setSaveMsg({ type: 'success', text: 'تم حفظ بيانات الموظف بنجاح' });
        await reloadEmployeeList();
      } else {
        const id = await createEmployee(payload);
        if (id) {
          setSaveMsg({ type: 'success', text: 'تم إضافة الموظف بنجاح' });
          await reloadEmployeeList();
        }
      }
    } catch (err: any) {
      console.error('Save employee error:', err);
      setSaveMsg({ type: 'error', text: 'حدث خطأ أثناء حفظ بيانات الموظف. حاول مرة أخرى.' });
    } finally {
      setSaving(false);
    }
  };


  const handleQuickAdd = async () => {
    if (!quickAddName.trim() || !quickAddType) return;
    setQuickAddSaving(true);
    try {
      if (quickAddType === 'department') {
        const departmentId = unwrapOrThrow(await createDepartment({
          name: quickAddName.trim(),
          code: quickAddCode.trim() || quickAddName.trim().substring(0, 3).toUpperCase(),
        })).departmentId;
        const newDept: FirestoreDepartment = {
          id: departmentId,
          name: quickAddName.trim(),
          code: quickAddCode.trim() || quickAddName.trim().substring(0, 3).toUpperCase(),
          managerId: '',
          isActive: true,
        };
        setDepartments((prev) => [...prev, newDept]);
        setForm((prev) => ({ ...prev, departmentId }));
      } else if (quickAddType === 'position') {
        const positionId = unwrapOrThrow(await createJobPosition({
          title: quickAddName.trim(),
          departmentId: form.departmentId || '',
          level: (form.level || 1) as JobLevel,
        })).positionId;
        const newPos: FirestoreJobPosition = {
          id: positionId,
          title: quickAddName.trim(),
          departmentId: form.departmentId || '',
          level: (form.level || 1) as JobLevel,
          hasSystemAccessDefault: false,
          isActive: true,
        };
        setJobPositions((prev) => [...prev, newPos]);
        setForm((prev) => ({ ...prev, jobPositionId: positionId }));
      } else if (quickAddType === 'shift') {
        const shiftId = unwrapOrThrow(await createShift({
          name: quickAddName.trim(),
        })).shiftId;
        const newShift: FirestoreShift = {
          id: shiftId,
          name: quickAddName.trim(),
          startTime: '08:00',
          endTime: '16:00',
          latestCheckInTime: '11:59',
          firstCheckOutTime: '12:00',
          breakMinutes: 60,
          lateGraceMinutes: 15,
          crossesMidnight: false,
          isActive: true,
        };
        setShifts((prev) => [...prev, newShift]);
        setForm((prev) => ({ ...prev, shiftId }));
      }
      setQuickAddType(null);
      setQuickAddName('');
      setQuickAddCode('');
    } catch (e) {
      console.error('Quick add error:', e);
    } finally {
      setQuickAddSaving(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    const raw = listEmployees.find((e) => e.id === id) ?? _rawEmployees.find((e) => e.id === id);
    if (!raw) return;
    await updateEmployee(id, { isActive: false });
    if (raw.userId) {
      try { await userService.toggleActive(raw.userId, false); } catch { /* ignore */ }
    }
    setDeleteConfirmId(null);
    await reloadEmployeeList();
  };

  const handlePermanentDelete = async (id: string) => {
    const raw = listEmployees.find((e) => e.id === id) ?? _rawEmployees.find((e) => e.id === id);
    if (raw?.userId) {
      try { await userService.delete(raw.userId); } catch { /* ignore */ }
    }
    await deleteEmployee(id);
    setPermanentDeleteId(null);
    await reloadEmployeeList();
  };

  const handleToggleActive = async (id: string) => {
    const raw = listEmployees.find((e) => e.id === id) ?? _rawEmployees.find((e) => e.id === id);
    if (!raw) return;
    const newActive = !raw.isActive;
    await updateEmployee(id, { isActive: newActive });
    if (raw.userId) {
      try { await userService.toggleActive(raw.userId, newActive); } catch { /* ignore */ }
    }
    setToggleConfirmId(null);
    await reloadEmployeeList();
  };

  const handleSystemAccessToggle = async (id: string) => {
    const raw = listEmployees.find((e) => e.id === id) ?? _rawEmployees.find((e) => e.id === id);
    if (!raw) return;
    await updateEmployee(id, { hasSystemAccess: !raw.hasSystemAccess });
    await reloadEmployeeList();
  };

  const handleApprove = async (userUid: string) => {
    try {
      await userService.toggleActive(userUid, true);
      if (uid && userEmail) {
        activityLogService.log(uid, userEmail, 'APPROVE_USER', `الموافقة على مستخدم: ${usersMap[userUid]?.email ?? userUid}`);
      }
      await loadUsers();
    } catch (e) {
      console.error('handleApprove error:', e);
    }
  };

  const handleReject = async (userUid: string) => {
    try {
      if (uid && userEmail) {
        activityLogService.log(uid, userEmail, 'REJECT_USER', `رفض مستخدم: ${usersMap[userUid]?.email ?? userUid}`);
      }
      await loadUsers();
    } catch (e) {
      console.error('handleReject error:', e);
    }
  };

  const positionOptions = useMemo(
    () => jobPositions.filter((j) => j.departmentId === form.departmentId),
    [jobPositions, form.departmentId]
  );
  const managerOptions = useMemo(
    () =>
      _rawEmployees.filter(
        (e) => e.id !== editId && (e.level ?? 0) > form.level
      ),
    [_rawEmployees, editId, form.level]
  );

  // Auto-assign level from selected job position
  const selectedPosition = useMemo(
    () => jobPositions.find((j) => j.id === form.jobPositionId),
    [jobPositions, form.jobPositionId]
  );
  useEffect(() => {
    if (selectedPosition) {
      setForm((prev) => ({ ...prev, level: selectedPosition.level }));
    }
  }, [selectedPosition]);

  // Validation helpers
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!form.name.trim()) errors.push('اسم الموظف مطلوب');
    if (!form.departmentId) errors.push('القسم مطلوب');
    if (form.baseSalary <= 0 && form.employmentType !== 'daily') errors.push('الراتب الأساسي يجب أن يكون أكبر من صفر');
    if (form.code) {
      const dup = _rawEmployees.find(
        (e) => e.code === form.code && e.id !== editId,
      );
      if (dup) errors.push(`رمز الموظف "${form.code}" مستخدم بالفعل`);
    }
    return errors;
  }, [form.name, form.departmentId, form.baseSalary, form.employmentType, form.code, _rawEmployees, editId]);

  const isFormValid = validationErrors.length === 0;

  // Salary change detection (for edit mode)
  const originalSalary = useMemo(() => {
    if (!editId) return null;
    const raw = _rawEmployees.find((e) => e.id === editId);
    return raw?.baseSalary ?? null;
  }, [editId, _rawEmployees]);

  const salaryChanged = editId && originalSalary !== null && Number(form.baseSalary) !== originalSalary;

  // â”€â”€ SelectableTable: columns â”€â”€
  const employeeColumns = useMemo<TableColumn<FirestoreEmployee>[]>(() => [
    {
      header: 'الاسم',
      sortKey: (emp) => emp.code || getEmployeeDisplayName(emp),
      render: (emp) => (
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${emp.isActive !== false ? 'bg-primary/10' : 'bg-[var(--color-surface-hover)]'}`}>
            <EmployeeIcon name="person" className={`text-base ${emp.isActive !== false ? 'text-primary' : 'text-[var(--color-text-muted)]'}`} />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-[var(--color-text)] block truncate">{getEmployeeDisplayName(emp)}</span>
            {emp.code && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-[var(--border-radius-base)] bg-primary/5 text-primary text-[10px] font-mono font-bold">{emp.code}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'القسم',
      sortKey: (emp) => getDepartmentName(emp.departmentId ?? ''),
      render: (emp) => <span className="text-sm text-[var(--color-text-muted)]">{getDepartmentName(emp.departmentId ?? '')}</span>,
    },
    {
      header: 'المنصب',
      sortKey: (emp) => getJobPositionTitle(emp.jobPositionId ?? ''),
      render: (emp) => <span className="text-sm text-[var(--color-text-muted)]">{getJobPositionTitle(emp.jobPositionId ?? '')}</span>,
    },
    {
      header: 'خط الإنتاج',
      sortKey: (emp) => getProductionContext(emp.id)?.lineName || '',
      render: (emp) => {
        const context = getProductionContext(emp.id);
        return context ? (
          <span className="inline-flex items-center px-2 py-1 rounded-[var(--border-radius-base)] bg-primary/5 text-primary text-xs font-bold">
            {context.lineName}
          </span>
        ) : (
          <span className="text-sm text-[var(--color-text-muted)]">—</span>
        );
      },
    },
    {
      header: 'المدير / المشرف',
      sortKey: (emp) => getEffectiveManagerName(emp),
      render: (emp) => {
        const context = getProductionContext(emp.id);
        const managerName = context?.managerId ? getManagerName(context.managerId) : getManagerName(emp.managerId || '');
        return (
          <div className="min-w-0">
            <span className="text-sm text-[var(--color-text-muted)] block truncate">{managerName}</span>
            {context?.managerId && (
              <span className="text-[10px] text-primary font-bold">حسب خط الإنتاج</span>
            )}
          </div>
        );
      },
    },
    {
      header: 'المستوى',
      sortKey: (emp) => emp.level ?? 1,
      render: (emp) => <span className="text-sm font-bold">{JOB_LEVEL_LABELS[(emp.level ?? 1) as 1 | 2 | 3 | 4] ?? emp.level}</span>,
    },
    {
      header: 'نوع التوظيف',
      render: (emp) => <span className="text-sm">{EMPLOYMENT_TYPE_LABELS[(emp.employmentType as EmploymentType)] ?? emp.employmentType}</span>,
    },
    {
      header: 'المرتب',
      sortKey: (emp) => Number(emp.baseSalary ?? 0),
      headerClassName: 'text-center',
      className: 'text-center',
      render: (emp) => (
        <span className="text-sm font-bold text-[var(--color-text)]">
          {Number(emp.baseSalary ?? 0).toLocaleString('ar-EG')} ج.م
        </span>
      ),
    },
    {
      header: 'المركبة',
      sortKey: (emp) => getVehicleName(emp.vehicleId ?? ''),
      render: (emp) => <span className="text-sm text-[var(--color-text-muted)]">{getVehicleName(emp.vehicleId ?? '')}</span>,
    },
    {
      header: 'دخول النظام',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (emp) => can('employees.edit') ? (
        <button
          onClick={(e) => { e.stopPropagation(); handleSystemAccessToggle(emp.id!); }}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--border-radius-base)] text-xs font-bold transition-all ${emp.hasSystemAccess ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'}`}
        >
          <EmployeeIcon name={emp.hasSystemAccess ? 'check' : 'close'} className="text-xs" />
          {emp.hasSystemAccess ? 'نعم' : 'لا'}
        </button>
      ) : (
        <span className="text-sm">{emp.hasSystemAccess ? 'نعم' : 'لا'}</span>
      ),
    },
    {
      header: 'الحالة',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (emp) => (
        <Badge variant={emp.isActive !== false ? 'success' : 'neutral'}>
          {emp.isActive !== false ? 'نشط' : 'غير نشط'}
        </Badge>
      ),
    },
  ], [departments, jobPositions, can, productionEmployeeContext, listEmployees, _rawEmployees]);

  // â”€â”€ SelectableTable: row actions â”€â”€
  const renderEmployeeActions = useCallback((emp: FirestoreEmployee) => (
    <div className="flex items-center gap-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
      {can('employees.viewDetails') && (
        <button
          onClick={() => navigate(`/hr/employees/${emp.id}`)}
          className="p-2 text-[var(--color-text-muted)] hover:text-primary hover:bg-primary/10 rounded-[var(--border-radius-base)] transition-all"
          title="عرض الملف"
        >
          <EmployeeIcon name="person" className="text-lg" />
        </button>
      )}
      {can('employees.edit') && (
        <button
          onClick={() => openEdit(emp.id!)}
          className="p-2 text-[var(--color-text-muted)] hover:text-primary hover:bg-primary/10 rounded-[var(--border-radius-base)] transition-all"
          title="تعديل"
        >
          <EmployeeIcon name="edit" className="text-lg" />
        </button>
      )}
      {can('employees.edit') && emp.isActive !== false && (
        <button
          onClick={() => setDeleteConfirmId(emp.id!)}
          className="p-2 text-[var(--color-text-muted)] hover:text-[rgb(var(--color-warning))] hover:bg-[rgb(var(--color-warning)/0.1)]0/10 rounded-[var(--border-radius-base)] transition-all"
          title="تعطيل"
        >
          <EmployeeIcon name="person_off" className="text-lg" />
        </button>
      )}
      {can('employees.edit') && emp.isActive === false && (
        <button
          onClick={() => setToggleConfirmId(emp.id!)}
          className="p-2 text-[var(--color-text-muted)] hover:text-[rgb(var(--color-success))] hover:bg-[rgb(var(--color-success)/0.1)]0/10 rounded-[var(--border-radius-base)] transition-all"
          title="إعادة تفعيل"
        >
          <EmployeeIcon name="person_add" className="text-lg" />
        </button>
      )}
      {can('employees.delete') && emp.isActive === false && (
        <button
          onClick={() => setPermanentDeleteId(emp.id!)}
          className="p-2 text-[var(--color-text-muted)] hover:text-[rgb(var(--color-danger))] hover:bg-[rgb(var(--color-danger)/0.1)]0/10 rounded-[var(--border-radius-base)] transition-all"
          title="حذف نهائي"
        >
          <EmployeeIcon name="delete_forever" className="text-lg" />
        </button>
      )}
    </div>
  ), [can, navigate]);

  // â”€â”€ SelectableTable: bulk actions â”€â”€
  const handleBulkActivate = useCallback(async (items: FirestoreEmployee[]) => {
    for (const emp of items) {
      if (emp.isActive === false) {
        await updateEmployee(emp.id!, { isActive: true });
        if (emp.userId) await userService.toggleActive(emp.userId, true);
      }
    }
  }, [updateEmployee]);

  const handleBulkDeactivate = useCallback(async (items: FirestoreEmployee[]) => {
    for (const emp of items) {
      if (emp.isActive !== false && emp.userId !== uid) {
        await updateEmployee(emp.id!, { isActive: false });
        if (emp.userId) await userService.toggleActive(emp.userId, false);
      }
    }
  }, [updateEmployee, uid]);

  const handleBulkExport = useCallback((items: FirestoreEmployee[]) => {
    const headers = ['الاسم', 'الكود', 'القسم', 'المنصب', 'خط الإنتاج', 'المدير / المشرف', 'المستوى', 'نوع التوظيف', 'الحالة', 'دخول النظام'];
    const rows = items.map((emp) => [
      getEmployeeDisplayName(emp),
      emp.code || '—',
      getDepartmentName(emp.departmentId ?? ''),
      getJobPositionTitle(emp.jobPositionId ?? ''),
      getProductionContext(emp.id)?.lineName || '—',
      getEffectiveManagerName(emp),
      JOB_LEVEL_LABELS[(emp.level ?? 1) as 1 | 2 | 3 | 4] ?? String(emp.level),
      EMPLOYMENT_TYPE_LABELS[(emp.employmentType as EmploymentType)] ?? emp.employmentType,
      emp.isActive !== false ? 'نشط' : 'غير نشط',
      emp.hasSystemAccess ? 'نعم' : 'لا',
    ]);
    const csvContent = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `الموظفين-${getTodayDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [departments, jobPositions, productionEmployeeContext, listEmployees, _rawEmployees]);

  const employeeBulkActions = useMemo<TableBulkAction<FirestoreEmployee>[]>(() => {
    const actions: TableBulkAction<FirestoreEmployee>[] = [
      { label: 'تفعيل المحدد', icon: 'check_circle', action: handleBulkActivate, permission: 'employees.edit', variant: 'primary' },
      { label: 'تعطيل المحدد', icon: 'block', action: handleBulkDeactivate, permission: 'employees.edit', variant: 'danger' },
    ];
    if (canExportFromPage) {
      actions.push({ label: 'تصدير CSV', icon: 'download', action: handleBulkExport, permission: 'export' });
    }
    return actions;
  }, [handleBulkActivate, handleBulkDeactivate, handleBulkExport, canExportFromPage]);

  const handleFilterChange = (key: string, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  };

  if (dataLoading && departments.length === 0) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-[var(--color-border)] rounded-[var(--border-radius-base)] animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-[var(--color-border)] rounded-[var(--border-radius-lg)] animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-[var(--color-surface-hover)] rounded-[var(--border-radius-lg)] animate-pulse" />
      </div>
    );
  }

  if (employeePager.initialLoading) {
    return <PageContentSkeleton variant="list" showFilters tableRows={10} />;
  }

  return (
    <ModuleOpsPageShell
      eyebrow="الموظفين"
      rangeLabel="إدارة الموظفين والتسلسل الوظيفي والحسابات"
      hero={[
        {
          key: 'total',
          label: 'الإجمالي',
          value: summaryKpis.total,
          onClick: () => handleFilterChange('status', 'all'),
          active: filterValues.status === 'all',
        },
        {
          key: 'active',
          label: 'نشط',
          value: summaryKpis.active,
          onClick: () => handleFilterChange('status', filterValues.status === 'active' ? 'all' : 'active'),
          active: filterValues.status === 'active',
        },
        {
          key: 'inactive',
          label: 'غير نشط',
          value: summaryKpis.inactive,
          onClick: () => handleFilterChange('status', filterValues.status === 'inactive' ? 'all' : 'inactive'),
          active: filterValues.status === 'inactive',
        },
        { key: 'access', label: 'لديهم دخول النظام', value: summaryKpis.withSystemAccess },
        { key: 'pending', label: 'في انتظار الموافقة', value: summaryKpis.pending },
      ]}
      actions={(
        <>
          {can('employees.create') ? (
            <Button onClick={openCreate} data-modal-key={MODAL_KEYS.EMPLOYEES_CREATE}>
              <span className="material-icons-round text-sm">add</span>
              إضافة موظف
            </Button>
          ) : null}
          <OpsMoreActionsMenu
            items={[
              {
                label: 'تصدير Excel',
                icon: 'download',
                group: 'تصدير',
                hidden: !(canExportFromPage && (tenantEmployeeCount ?? 0) > 0),
                onClick: () => {
                  void (async () => {
                    const getDeptName = (id: string) => departments.find((d) => d.id === id)?.name || '—';
                    const getJobTitle = (id: string) => jobPositions.find((j) => j.id === id)?.title || '—';
                    const getShiftName = (id: string) => shifts.find((s) => s.id === id)?.name || '—';
                    const all = await employeeService.getAll();
                    exportAllEmployees(all, getDeptName, getJobTitle, getShiftName, {
                      getProductionLineName: (employee) => getProductionContext(employee.id)?.lineName || '—',
                      getManagerName: getEffectiveManagerName,
                    });
                  })();
                },
              },
              {
                label: 'استيراد Excel',
                icon: 'upload',
                group: 'استيراد',
                hidden: !canImportFromPage,
                onClick: () => navigate('/hr/employees/import'),
              },
            ]}
          />
        </>
      )}
    >
      <p className="text-xs text-[var(--color-text-muted)] px-1">
        الإجمالي من الخادم. البحث والفلاتر والتنقّل تُنفّذ على Firestore بصفحة واحدة في كل مرة.
      </p>

      {pendingUsers.length > 0 && canManageUsers && (
        <OpsDashPanel title="الموافقة على المستخدمين انتقلت لصفحة المستخدمين" accent="hr">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--color-text-muted)]">
              يوجد {pendingUsers.length} مستخدم/مستخدمين بانتظار الموافقة.
            </p>
            <Button variant="secondary" onClick={() => navigate('/system/users')}>
              فتح إدارة المستخدمين
            </Button>
          </div>
        </OpsDashPanel>
      )}

      <OpsDashPanel title="قائمة الموظفين" accent="hr" bodyClassName="p-0 overflow-hidden">
        <SmartFilterBar
          pageId="hr-employees"
          searchPlaceholder="بحث باسم أو رمز الموظف"
          searchValue={search}
          onSearchChange={setSearch}
          quickFilters={[
            {
              key: 'department',
              placeholder: 'القسم',
              options: departments.map((d) => ({ value: d.id!, label: d.name })),
            },
            {
              key: 'jobPosition',
              placeholder: 'المنصب',
              options: jobPositions.map((j) => ({ value: j.id!, label: j.title })),
            },
            {
              key: 'employmentType',
              placeholder: 'نوع التوظيف',
              options: (Object.entries(EMPLOYMENT_TYPE_LABELS) as [EmploymentType, string][]).map(([k, v]) => ({ value: k, label: v })),
            },
            {
              key: 'status',
              placeholder: 'الحالة',
              options: [
                { value: 'active', label: 'نشط' },
                { value: 'inactive', label: 'غير نشط' },
              ],
            },
            {
              key: 'systemAccess',
              placeholder: 'دخول النظام',
              options: [
                { value: 'yes', label: 'نعم' },
                { value: 'no', label: 'لا' },
              ],
            },
          ]}
          quickFilterValues={filterValues}
          onQuickFilterChange={handleFilterChange}
          extra={employeePager.refreshing ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]" role="status" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" />
              جاري تحديث النتائج…
            </span>
          ) : null}
          className="mb-0 border-0 rounded-none"
        />
        {employeePager.error ? (
          <div className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.08)] px-4 py-3 text-sm text-[rgb(var(--color-danger))]" role="alert">
            <span>تعذر تحميل نتائج الموظفين. تحقق من الاتصال أو فهرس Firestore ثم حاول مرة أخرى.</span>
            <Button variant="secondary" onClick={() => void employeePager.refresh()}>
              إعادة المحاولة
            </Button>
          </div>
        ) : null}
        <SelectableTable<FirestoreEmployee>
        data={filtered}
        columns={employeeColumns}
        getId={(emp) => emp.id!}
        bulkActions={employeeBulkActions}
        renderActions={renderEmployeeActions}
        actionsHeader="إجراءات"
        emptyIcon="groups"
        emptyTitle="لا يوجد موظفون مطابقون للبحث"
        emptySubtitle={can('employees.create') ? 'اضغط "إضافة موظف" لإضافة أول موظف' : undefined}
        pageSize={15}
      />
      </OpsDashPanel>

      <DataPaginationFooter
        page={employeePager.page}
        itemCount={listEmployees.length}
        itemLabel="موظف"
        hasPrevious={employeePager.hasPrevious}
        hasNext={employeePager.hasNext}
        onPrevious={employeePager.previous}
        onNext={() => void employeePager.next()}
        loading={listLoading}
      />

      <OpsDashPanel accent="hr">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-[var(--color-text-muted)]">إجمالي المرتبات (حسب النتائج المعروضة)</span>
          <span className="text-base font-extrabold text-primary">
            {filteredSalaryTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
          </span>
        </div>
      </OpsDashPanel>

      {/* 6. Create/Edit Modal — Professional HR Panel */}
      {showModal && (can('employees.create') || can('employees.edit')) && (
        <ManagedModalPortal>
        <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => { setShowModal(false); setSaveMsg(null); }}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-3xl max-h-[92dvh] overflow-hidden border border-[var(--color-border)] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0 bg-gradient-to-l from-primary/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[var(--border-radius-lg)] bg-primary/10 flex items-center justify-center">
                  <EmployeeIcon name={editId ? 'edit' : 'person_add'} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--color-text)]">{editId ? 'تعديل موظف' : 'إضافة موظف جديد'}</h3>
                  <p className="text-xs text-[var(--color-text-muted)]">ملء البيانات الأساسية والوظيفية</p>
                </div>
              </div>
              <button onClick={() => { setShowModal(false); setSaveMsg(null); }} className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] rounded-[var(--border-radius-lg)] transition-all">
                <EmployeeIcon name="close" />
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-[var(--color-border)] px-6 shrink-0 sticky top-0 bg-[var(--color-card)] z-10">
              {([
                { id: 'job' as const, label: 'البيانات الوظيفية', icon: 'account_tree' },
                { id: 'salary' as const, label: 'التوظيف والراتب', icon: 'payments' },
                { id: 'access' as const, label: 'الوصول للنظام', icon: 'security' },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFormTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 transition-all ${
                    formTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] dark:hover:text-[var(--color-text-muted)]'
                  }`}
                >
                  <EmployeeIcon name={tab.icon} className="text-base" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-6">
              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] bg-[rgb(var(--color-warning)/0.1)] border border-[rgb(var(--color-warning)/0.25)]">
                  <EmployeeIcon name="warning" className="text-[rgb(var(--color-warning))] text-lg mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    {validationErrors.map((err, i) => (
                      <p key={i} className="text-sm font-bold text-[rgb(var(--color-warning))]">{err}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* â•گâ•گâ•گ Tab 1: Job Info â•گâ•گâ•گ */}
              {formTab === 'job' && (
                <div className="space-y-5 min-h-[360px]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="block text-xs font-bold text-[var(--color-text-muted)]">الاسم *</label>
                      <input
                        className={`w-full border rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium transition-colors ${!form.name.trim() ? 'border-[rgb(var(--color-danger)/0.35)] dark:border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.1)]/50 dark:bg-[rgb(var(--color-danger)/0.15)]' : 'border-[var(--color-border)]'} focus:border-primary focus:ring-1 focus:ring-primary/20`}
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="اسم الموظف"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="block text-xs font-bold text-[var(--color-text-muted)]">رقم الهاتف</label>
                      <input
                        type="tel"
                        className="erp-filter-select w-full"
                        value={form.phone || ''}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="مثال: 2010xxxxxxx"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[var(--color-text-muted)]">رمز الموظف</label>
                      <input
                        className={`w-full border rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium font-mono transition-colors ${validationErrors.some((e) => e.includes('رمز')) ? 'border-[rgb(var(--color-danger)/0.35)] dark:border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.1)]/50 dark:bg-[rgb(var(--color-danger)/0.15)]' : 'border-[var(--color-border)]'}`}
                        value={form.code}
                        onChange={(e) => setForm({ ...form, code: e.target.value })}
                        placeholder="اختياري — فريد"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[var(--color-text-muted)]">القسم *</label>
                      <div className="flex gap-2">
                        <select
                          className={`flex-1 border rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium ${!form.departmentId ? 'border-[rgb(var(--color-danger)/0.35)] dark:border-[rgb(var(--color-danger)/0.25)]' : 'border-[var(--color-border)]'}`}
                          value={form.departmentId}
                          onChange={(e) => setForm({ ...form, departmentId: e.target.value, jobPositionId: '' })}
                        >
                          <option value="">اختر القسم...</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => { setQuickAddType('department'); setQuickAddName(''); setQuickAddCode(''); }}
                          className="px-3 py-2 bg-primary/10 text-primary rounded-[var(--border-radius-lg)] hover:bg-primary/20 transition-colors shrink-0"
                          title="إضافة قسم جديد"
                        >
                          <EmployeeIcon name="add" className="text-lg" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[var(--color-text-muted)]">المنصب</label>
                      <div className="flex gap-2">
                        <select
                          className="flex-1 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium"
                          value={form.jobPositionId}
                          onChange={(e) => setForm({ ...form, jobPositionId: e.target.value })}
                        >
                          <option value="">اختر المنصب...</option>
                          {positionOptions.map((j) => (
                            <option key={j.id} value={j.id}>{j.title}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => { setQuickAddType('position'); setQuickAddName(''); }}
                          className="px-3 py-2 bg-primary/10 text-primary rounded-[var(--border-radius-lg)] hover:bg-primary/20 transition-colors shrink-0"
                          title="إضافة منصب جديد"
                        >
                          <EmployeeIcon name="add" className="text-lg" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[var(--color-text-muted)]">
                        المستوى
                        {selectedPosition && <span className="text-primary mr-1">(تلقائي من المنصب)</span>}
                      </label>
                      <div className={`w-full border rounded-[var(--border-radius-lg)] text-sm p-3 font-bold ${selectedPosition ? 'bg-[var(--color-bg)]/80 border-[var(--color-border)] text-primary' : 'border-[var(--color-border)]'}`}>
                        {selectedPosition ? (
                          <div className="flex items-center gap-2">
                            <EmployeeIcon name="lock" className="text-sm text-primary/50" />
                            {JOB_LEVEL_LABELS[form.level as 1 | 2 | 3 | 4] ?? form.level}
                          </div>
                        ) : (
                          <select
                            className="w-full bg-transparent outline-none font-medium"
                            value={form.level}
                            onChange={(e) => setForm({ ...form, level: Number(e.target.value) as 1 | 2 | 3 | 4 })}
                          >
                            {(Object.entries(JOB_LEVEL_LABELS) as [string, string][]).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[var(--color-text-muted)]">المدير المباشر</label>
                      <select
                        className="erp-filter-select w-full"
                        value={form.managerId}
                        onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                      >
                        <option value="">لا يوجد</option>
                        {managerOptions.map((e) => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Employee Status */}
                  <div className="space-y-3 pt-2">
                    <h4 className="text-xs font-bold text-[var(--color-text-muted)]">حالة الموظف</h4>
                    <div className="flex gap-3">
                      <label className={`flex-1 flex items-center gap-3 cursor-pointer p-3 rounded-[var(--border-radius-lg)] border transition-all ${form.isActive ? 'border-[rgb(var(--color-success)/0.35)] dark:border-[rgb(var(--color-success)/0.25)] bg-[rgb(var(--color-success)/0.1)] ring-1 ring-[rgb(var(--color-success))] dark:ring-[rgb(var(--color-success))]' : 'border-[var(--color-border)] hover:bg-[var(--color-bg)]'}`}>
                        <input
                          type="radio"
                          name="isActive"
                          checked={form.isActive === true}
                          onChange={() => setForm({ ...form, isActive: true })}
                          className="text-[rgb(var(--color-success))] focus:ring-[rgb(var(--color-success))]"
                        />
                        <div>
                          <span className="text-sm font-bold block">نشط</span>
                          <span className="text-xs text-[var(--color-text-muted)]">الموظف يعمل حالياً</span>
                        </div>
                      </label>
                      <label className={`flex-1 flex items-center gap-3 cursor-pointer p-3 rounded-[var(--border-radius-lg)] border transition-all ${!form.isActive ? 'border-[rgb(var(--color-danger)/0.35)] dark:border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.1)] ring-1 ring-[rgb(var(--color-danger))] dark:ring-[rgb(var(--color-danger))]' : 'border-[var(--color-border)] hover:bg-[var(--color-bg)]'}`}>
                        <input
                          type="radio"
                          name="isActive"
                          checked={form.isActive === false}
                          onChange={() => setForm({ ...form, isActive: false })}
                          className="text-[rgb(var(--color-danger))] focus:ring-[rgb(var(--color-danger))]"
                        />
                        <div>
                          <span className="text-sm font-bold block">غير نشط</span>
                          <span className="text-xs text-[var(--color-text-muted)]">موقوف أو منتهي</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* â•گâ•گâ•گ Tab 2: Employment & Salary â•گâ•گâ•گ */}
              {formTab === 'salary' && (
                <div className="space-y-5 min-h-[360px]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[var(--color-text-muted)]">نوع التوظيف</label>
                      <select
                        className="erp-filter-select w-full"
                        value={form.employmentType}
                        onChange={(e) => setForm({ ...form, employmentType: e.target.value as EmploymentType })}
                      >
                        {(Object.entries(EMPLOYMENT_TYPE_LABELS) as [EmploymentType, string][]).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[var(--color-text-muted)]">الوردية</label>
                      <div className="flex gap-2">
                        <select
                          className="flex-1 border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium"
                          value={form.shiftId}
                          onChange={(e) => setForm({ ...form, shiftId: e.target.value })}
                        >
                          <option value="">لا يوجد</option>
                          {shifts.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => { setQuickAddType('shift'); setQuickAddName(''); }}
                          className="px-3 py-2 bg-primary/10 text-primary rounded-[var(--border-radius-lg)] hover:bg-primary/20 transition-colors shrink-0"
                          title="إضافة وردية جديدة"
                        >
                          <EmployeeIcon name="add" className="text-lg" />
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[var(--color-text-muted)]">الراتب الأساسي *</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        className={`w-full border rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium transition-colors ${form.baseSalary <= 0 && form.employmentType !== 'daily' ? 'border-[rgb(var(--color-danger)/0.35)] dark:border-[rgb(var(--color-danger)/0.25)]' : 'border-[var(--color-border)]'}`}
                        value={form.baseSalary || ''}
                        onChange={(e) => setForm({ ...form, baseSalary: Number(e.target.value) })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[var(--color-text-muted)]">أجر الساعة</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        className="erp-filter-select w-full"
                        value={form.hourlyRate || ''}
                        onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="block text-xs font-bold text-[var(--color-text-muted)]">المركبة</label>
                      <select
                        className="erp-filter-select w-full"
                        value={form.vehicleId}
                        onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
                      >
                        <option value="">بدون مركبة</option>
                        {vehicles.map((v) => (
                          <option key={v.id} value={v.id}>{v.name} — {v.plateNumber}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Salary change indicator */}
                  {salaryChanged && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-[var(--border-radius-lg)] bg-[rgb(var(--color-warning)/0.1)] border border-[rgb(var(--color-warning)/0.25)]">
                      <EmployeeIcon name="trending_up" className="text-[rgb(var(--color-warning))]" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-[rgb(var(--color-warning))]">تغيير في الراتب</p>
                        <p className="text-sm text-[rgb(var(--color-warning))]">
                          <span className="line-through opacity-60">{originalSalary?.toLocaleString()}</span>
                          <span className="mx-2">â†گ</span>
                          <span className="font-bold">{Number(form.baseSalary).toLocaleString()}</span>
                          <span className="text-xs mr-1">ج.م</span>
                        </p>
                      </div>
                      <EmployeeIcon name="history" className="text-xs text-[rgb(var(--color-warning))]" />
                      <span className="text-[10px] text-[rgb(var(--color-warning))] font-bold">سيتم تسجيل التغيير</span>
                    </div>
                  )}

                  {/* Live Net Salary Preview */}
                  {form.baseSalary > 0 && (
                    <div className="rounded-[var(--border-radius-lg)] border border-[rgb(var(--color-success)/0.25)] bg-gradient-to-l from-[rgb(var(--color-success))] to-white dark:from-[rgb(var(--color-success))]/20 dark:to-[var(--color-text)] p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <EmployeeIcon name="account_balance_wallet" className="text-[rgb(var(--color-success))] text-lg" />
                          <span className="text-xs font-bold text-[rgb(var(--color-success))]">صافي الراتب التقديري</span>
                        </div>
                        <div className="text-left">
                          <p className="text-2xl font-bold text-[rgb(var(--color-success))]">
                            {Number(form.baseSalary).toLocaleString()}
                            <span className="text-xs font-bold mr-1">ج.م</span>
                          </p>
                          <p className="text-[10px] text-[rgb(var(--color-success))]/60/60">الراتب الأساسي قبل البدلات والخصومات</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* â•گâ•گâ•گ Tab 3: System Access â•گâ•گâ•گ */}
              {formTab === 'access' && (
                <div className="space-y-5 min-h-[360px]">
                  <div className="border border-[rgb(var(--color-primary)/0.25)] dark:border-[rgb(var(--color-primary)/0.25)] rounded-[var(--border-radius-lg)] p-4 space-y-4 bg-[rgb(var(--color-primary)/0.1)]/50 dark:bg-[rgb(var(--color-primary)/0.15)]">
                    <div className="flex items-start gap-2">
                      <EmployeeIcon name="info" className="text-[rgb(var(--color-primary))]" />
                      <div>
                        <p className="text-sm font-bold text-[rgb(var(--color-primary))]">إدارة حسابات الدخول أصبحت من صفحة المستخدمين</p>
                        <p className="text-xs text-[rgb(var(--color-primary))]/80 mt-1">
                          لإنشاء/ربط/فك ربط/تغيير دور/حذف نهائي للمستخدم، استخدم صفحة النظام -&gt; المستخدمون.
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      الحالة الحالية لهذا الموظف: {form.hasSystemAccess ? 'لديه حساب مرتبط' : 'غير مرتبط بحساب'}.
                    </div>
                    <Button variant="secondary" onClick={() => navigate('/system/users')}>
                      فتح صفحة المستخدمين
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer messages & actions */}
            {saveMsg && (
              <div className={`mx-6 mb-2 flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${saveMsg.type === 'success' ? 'bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]' : 'bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]'}`}>
                <EmployeeIcon name={saveMsg.type === 'success' ? 'check_circle' : 'error'} className="text-lg" />
                {saveMsg.text}
              </div>
            )}
            {shareCredentials && (
              <div className="mx-6 mb-2">
                <Button variant="outline" onClick={shareCredentialsToWhatsApp}>
                  مشاركة بيانات الدخول واتساب
                </Button>
              </div>
            )}
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-[var(--color-text-muted)]">
                {validationErrors.length > 0 && (
                  <span className="text-[rgb(var(--color-danger))] font-bold">{validationErrors.length} خطأ في البيانات</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => { setShowModal(false); setSaveMsg(null); }}>إلغاء</Button>
                <Button variant="primary" onClick={handleSave} disabled={saving || !isFormValid}>
                  {editId ? 'حفظ التعديلات' : 'إضافة موظف'}
                </Button>
              </div>
            </div>
          </div>
        </div>
        </ManagedModalPortal>
      )}

      {/* Deactivate confirmation (soft delete) */}
      {deleteConfirmId && (
        <ManagedModalPortal>
        <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-[rgb(var(--color-warning)/0.1)] rounded-full flex items-center justify-center mx-auto mb-4">
              <EmployeeIcon name="person_off" className="text-[rgb(var(--color-warning))] text-3xl" />
            </div>
            <h3 className="text-lg font-bold mb-2">تعطيل موظف</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-2">
              سيتم تعطيل <span className="font-bold text-[var(--color-text)]">{getEmployeeDisplayName(resolveEmployeeById(deleteConfirmId))}</span> وإيقاف حساب الدخول المرتبط به.
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mb-6">يمكنك إعادة تفعيله لاحقاً. البيانات والتقارير السابقة ستبقى محفوظة.</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>إلغاء</Button>
              <Button variant="primary" tone="undo" solid onClick={() => handleDeactivate(deleteConfirmId)}>
                تعطيل
              </Button>
            </div>
          </div>
        </div>
        </ManagedModalPortal>
      )}

      {/* Permanent delete confirmation (hard delete - only for inactive employees) */}
      {permanentDeleteId && (
        <ManagedModalPortal>
        <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setPermanentDeleteId(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-[rgb(var(--color-danger)/0.1)] rounded-full flex items-center justify-center mx-auto mb-4">
              <EmployeeIcon name="delete_forever" className="text-[rgb(var(--color-danger))] text-3xl" />
            </div>
            <h3 className="text-lg font-bold mb-2">حذف نهائي</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-2">
              سيتم حذف <span className="font-bold text-[rgb(var(--color-danger))]">{getEmployeeDisplayName(resolveEmployeeById(permanentDeleteId))}</span> نهائياً مع بيانات حسابه.
            </p>
            <div className="bg-[rgb(var(--color-danger)/0.1)] dark:bg-[rgb(var(--color-danger)/0.15)] border border-[rgb(var(--color-danger)/0.25)] rounded-[var(--border-radius-lg)] p-3 mb-4 text-right">
              <p className="text-xs font-bold text-[rgb(var(--color-danger))] flex items-center gap-1">
                <EmployeeIcon name="warning" className="text-sm" />
                لا يمكن التراجع عن هذا الإجراء
              </p>
              {resolveEmployeeById(permanentDeleteId)?.userId && (
                <p className="text-xs text-[rgb(var(--color-danger))] mt-1">سيتم حذف حساب المستخدم المرتبط. حساب Firebase Auth يحتاج حذف يدوي من الظ€ Console.</p>
              )}
            </div>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setPermanentDeleteId(null)}>إلغاء</Button>
              <Button variant="danger" onClick={() => handlePermanentDelete(permanentDeleteId)}>
                حذف نهائي
              </Button>
            </div>
          </div>
        </div>
        </ManagedModalPortal>
      )}

      {/* Reactivate confirmation */}
      {toggleConfirmId && (
        <ManagedModalPortal>
        <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setToggleConfirmId(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-[rgb(var(--color-success)/0.1)] rounded-full flex items-center justify-center mx-auto mb-4">
              <EmployeeIcon name="person_add" className="text-[rgb(var(--color-success))] text-3xl" />
            </div>
            <h3 className="text-lg font-bold mb-2">إعادة تفعيل موظف</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">
              سيتم إعادة تفعيل <span className="font-bold text-[var(--color-text)]">{getEmployeeDisplayName(resolveEmployeeById(toggleConfirmId))}</span> وتفعيل حساب الدخول المرتبط به.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setToggleConfirmId(null)}>إلغاء</Button>
              <Button variant="primary" onClick={() => handleToggleActive(toggleConfirmId)}>
                تفعيل
              </Button>
            </div>
          </div>
        </div>
        </ManagedModalPortal>
      )}


      {/* Quick-Add Modal (Department / Position / Shift) */}
      {quickAddType && (
        <ManagedModalPortal>
        <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => setQuickAddType(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-base font-bold">
                {quickAddType === 'department' && 'إضافة قسم جديد'}
                {quickAddType === 'position' && 'إضافة منصب جديد'}
                {quickAddType === 'shift' && 'إضافة وردية جديدة'}
              </h3>
              <button onClick={() => setQuickAddType(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-muted)]">
                <EmployeeIcon name="close" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-[var(--color-text-muted)]">
                  {quickAddType === 'department' && 'اسم القسم *'}
                  {quickAddType === 'position' && 'اسم المنصب *'}
                  {quickAddType === 'shift' && 'اسم الوردية *'}
                </label>
                <input
                  className="erp-filter-select w-full"
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  placeholder={
                    quickAddType === 'department' ? 'مثال: قسم التجميع' :
                    quickAddType === 'position' ? 'مثال: فني تجميع' :
                    'مثال: الوردية الصباحية'
                  }
                  autoFocus
                />
              </div>
              {quickAddType === 'department' && (
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">رمز القسم</label>
                  <input
                    className="erp-filter-select w-full"
                    value={quickAddCode}
                    onChange={(e) => setQuickAddCode(e.target.value)}
                    placeholder="مثال: ASM"
                  />
                </div>
              )}
              {quickAddType === 'position' && !form.departmentId && (
                <p className="text-xs text-[rgb(var(--color-warning))] bg-[rgb(var(--color-warning)/0.1)] p-2 rounded-[var(--border-radius-base)]">
                  <EmployeeIcon name="info" className="text-xs align-middle ml-1 inline" />
                  لم تختر قسم بعد — سيتم ربط المنصب بالقسم المختار لاحقاً
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setQuickAddType(null)}>إلغاء</Button>
              <Button variant="primary" onClick={handleQuickAdd} disabled={quickAddSaving || !quickAddName.trim()}>
                إضافة
              </Button>
            </div>
          </div>
        </div>
        </ManagedModalPortal>
      )}
    </ModuleOpsPageShell>
  );
};
