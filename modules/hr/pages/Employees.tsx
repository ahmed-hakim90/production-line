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
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import { SelectableTable, type TableColumn, type TableBulkAction } from '../../shared/components/SelectableTable';
import type { FirestoreEmployee, FirestoreUser, EmploymentType } from '../../../types';
import { EMPLOYMENT_TYPE_LABELS } from '../../../types';
import { usePermission } from '../../../utils/permissions';
import { userService } from '../../../services/userService';
import { activityLogService } from '../../system/services/activityLogService';
import { employeeService } from '../employeeService';
import { JOB_LEVEL_LABELS } from '../types';
import type { FirestoreDepartment, FirestoreJobPosition, FirestoreShift, FirestoreVehicle } from '../types';
import { getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { departmentsRef, jobPositionsRef, shiftsRef } from '../collections';
import { vehicleService } from '../vehicleService';
import type { JobLevel } from '../types';
import { getTodayDateString } from '../../../utils/calculations';
import { exportAllEmployees } from '../../../utils/exportExcel';
import { getExportImportPageControl } from '../../../utils/exportImportControls';
import { useRegisterModalOpener } from '../../../components/modal-manager/useRegisterModalOpener';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { PageHeader } from '../../../components/PageHeader';

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
  const navigate = useNavigate();
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

  const [search, setSearch] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterEmploymentType, setFilterEmploymentType] = useState('');
  const [filterJobPosition, setFilterJobPosition] = useState('');
  const [filterSystemAccess, setFilterSystemAccess] = useState<'all' | 'yes' | 'no'>('all');

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

  useEffect(() => {
    loadRefData();
  }, [loadRefData]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const getDepartmentName = (id: string) => departments.find((d) => d.id === id)?.name ?? '—';
  const getJobPositionTitle = (id: string) => jobPositions.find((j) => j.id === id)?.title ?? '—';
  const getShiftName = (id: string) => shifts.find((s) => s.id === id)?.name ?? '—';
  const getVehicleName = (id: string) => vehicles.find((v) => v.id === id)?.name ?? '—';
  const getManagerName = (id: string) => _rawEmployees.find((e) => e.id === id)?.name ?? '—';

  const summaryKpis = useMemo(() => {
    const total = _rawEmployees.length;
    const active = _rawEmployees.filter((e) => e.isActive !== false).length;
    const inactive = total - active;
    const withSystemAccess = _rawEmployees.filter((e) => e.hasSystemAccess).length;
    const pending = pendingUsers.length;
    return { total, active, inactive, withSystemAccess, pending };
  }, [_rawEmployees, pendingUsers.length]);

  const filtered = useMemo(() => {
    let list = _rawEmployees;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.name?.toLowerCase().includes(q) || (e.code && e.code.toLowerCase().includes(q))
      );
    }
    if (filterDepartment) list = list.filter((e) => e.departmentId === filterDepartment);
    if (filterJobPosition) list = list.filter((e) => e.jobPositionId === filterJobPosition);
    if (filterStatus === 'active') list = list.filter((e) => e.isActive !== false);
    if (filterStatus === 'inactive') list = list.filter((e) => e.isActive === false);
    if (filterEmploymentType) list = list.filter((e) => e.employmentType === filterEmploymentType);
    if (filterSystemAccess === 'yes') list = list.filter((e) => e.hasSystemAccess);
    if (filterSystemAccess === 'no') list = list.filter((e) => !e.hasSystemAccess);
    return list;
  }, [_rawEmployees, search, filterDepartment, filterJobPosition, filterStatus, filterEmploymentType, filterSystemAccess]);

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
    const raw = _rawEmployees.find((e) => e.id === id);
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
      `أهلاً ${shareCredentials.name}`,
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
            `تعديل راتب ${form.name.trim()}: ${originalSalary} → ${Number(form.baseSalary)}`,
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
      } else {
        const id = await createEmployee(payload);
        if (id) setSaveMsg({ type: 'success', text: 'تم إضافة الموظف بنجاح' });
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
        const ref = await addDoc(departmentsRef(), {
          name: quickAddName.trim(),
          code: quickAddCode.trim() || quickAddName.trim().substring(0, 3).toUpperCase(),
          managerId: '',
          isActive: true,
          createdAt: serverTimestamp(),
        });
        const newDept: FirestoreDepartment = {
          id: ref.id,
          name: quickAddName.trim(),
          code: quickAddCode.trim() || quickAddName.trim().substring(0, 3).toUpperCase(),
          managerId: '',
          isActive: true,
        };
        setDepartments((prev) => [...prev, newDept]);
        setForm((prev) => ({ ...prev, departmentId: ref.id }));
      } else if (quickAddType === 'position') {
        const ref = await addDoc(jobPositionsRef(), {
          title: quickAddName.trim(),
          departmentId: form.departmentId || '',
          level: (form.level || 1) as JobLevel,
          hasSystemAccessDefault: false,
          isActive: true,
          createdAt: serverTimestamp(),
        });
        const newPos: FirestoreJobPosition = {
          id: ref.id,
          title: quickAddName.trim(),
          departmentId: form.departmentId || '',
          level: (form.level || 1) as JobLevel,
          hasSystemAccessDefault: false,
          isActive: true,
        };
        setJobPositions((prev) => [...prev, newPos]);
        setForm((prev) => ({ ...prev, jobPositionId: ref.id }));
      } else if (quickAddType === 'shift') {
        const ref = await addDoc(shiftsRef(), {
          name: quickAddName.trim(),
          startTime: '08:00',
          endTime: '16:00',
          breakMinutes: 60,
          lateGraceMinutes: 15,
          crossesMidnight: false,
          isActive: true,
          createdAt: serverTimestamp(),
        });
        const newShift: FirestoreShift = {
          id: ref.id,
          name: quickAddName.trim(),
          startTime: '08:00',
          endTime: '16:00',
          breakMinutes: 60,
          lateGraceMinutes: 15,
          crossesMidnight: false,
          isActive: true,
        };
        setShifts((prev) => [...prev, newShift]);
        setForm((prev) => ({ ...prev, shiftId: ref.id }));
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
    const raw = _rawEmployees.find((e) => e.id === id);
    if (!raw) return;
    await updateEmployee(id, { isActive: false });
    if (raw.userId) {
      try { await userService.toggleActive(raw.userId, false); } catch { /* ignore */ }
    }
    setDeleteConfirmId(null);
  };

  const handlePermanentDelete = async (id: string) => {
    const raw = _rawEmployees.find((e) => e.id === id);
    if (raw?.userId) {
      try { await userService.delete(raw.userId); } catch { /* ignore */ }
    }
    await deleteEmployee(id);
    setPermanentDeleteId(null);
  };

  const handleToggleActive = async (id: string) => {
    const raw = _rawEmployees.find((e) => e.id === id);
    if (!raw) return;
    const newActive = !raw.isActive;
    await updateEmployee(id, { isActive: newActive });
    if (raw.userId) {
      try { await userService.toggleActive(raw.userId, newActive); } catch { /* ignore */ }
    }
    setToggleConfirmId(null);
  };

  const handleSystemAccessToggle = async (id: string) => {
    const raw = _rawEmployees.find((e) => e.id === id);
    if (!raw) return;
    await updateEmployee(id, { hasSystemAccess: !raw.hasSystemAccess });
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

  // ── SelectableTable: columns ──
  const employeeColumns = useMemo<TableColumn<FirestoreEmployee>[]>(() => [
    {
      header: 'الاسم',
      sortKey: (emp) => emp.code || getEmployeeDisplayName(emp),
      render: (emp) => (
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${emp.isActive !== false ? 'bg-primary/10' : 'bg-[#f0f2f5]'}`}>
            <EmployeeIcon name="person" className={`text-base ${emp.isActive !== false ? 'text-primary' : 'text-slate-400'}`} />
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
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--border-radius-base)] text-xs font-bold transition-all ${emp.hasSystemAccess ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-[#f0f2f5] text-[var(--color-text-muted)] hover:bg-[#e8eaed]'}`}
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
  ], [departments, jobPositions, can]);

  // ── SelectableTable: row actions ──
  const renderEmployeeActions = useCallback((emp: FirestoreEmployee) => (
    <div className="flex items-center gap-1 justify-end sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
      {can('employees.viewDetails') && (
        <button
          onClick={() => navigate(`/employees/${emp.id}`)}
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
          className="p-2 text-[var(--color-text-muted)] hover:text-amber-500 hover:bg-amber-500/10 rounded-[var(--border-radius-base)] transition-all"
          title="تعطيل"
        >
          <EmployeeIcon name="person_off" className="text-lg" />
        </button>
      )}
      {can('employees.edit') && emp.isActive === false && (
        <button
          onClick={() => setToggleConfirmId(emp.id!)}
          className="p-2 text-[var(--color-text-muted)] hover:text-emerald-500 hover:bg-emerald-500/10 rounded-[var(--border-radius-base)] transition-all"
          title="إعادة تفعيل"
        >
          <EmployeeIcon name="person_add" className="text-lg" />
        </button>
      )}
      {can('employees.delete') && emp.isActive === false && (
        <button
          onClick={() => setPermanentDeleteId(emp.id!)}
          className="p-2 text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 rounded-[var(--border-radius-base)] transition-all"
          title="حذف نهائي"
        >
          <EmployeeIcon name="delete_forever" className="text-lg" />
        </button>
      )}
    </div>
  ), [can, navigate]);

  // ── SelectableTable: bulk actions ──
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
    const headers = ['الاسم', 'الكود', 'القسم', 'المنصب', 'المستوى', 'نوع التوظيف', 'الحالة', 'دخول النظام'];
    const rows = items.map((emp) => [
      getEmployeeDisplayName(emp),
      emp.code || '—',
      getDepartmentName(emp.departmentId ?? ''),
      getJobPositionTitle(emp.jobPositionId ?? ''),
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
  }, [departments, jobPositions]);

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

  const hasActiveFilters =
    search.trim() ||
    filterDepartment ||
    filterJobPosition ||
    filterStatus !== 'all' ||
    filterEmploymentType ||
    filterSystemAccess !== 'all';

  const clearFilters = () => {
    setSearch('');
    setFilterDepartment('');
    setFilterJobPosition('');
    setFilterStatus('all');
    setFilterEmploymentType('');
    setFilterSystemAccess('all');
  };

  if (dataLoading && departments.length === 0) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-slate-200 rounded-[var(--border-radius-base)] animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-200 rounded-[var(--border-radius-lg)] animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-[#f0f2f5] rounded-[var(--border-radius-lg)] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Page header */}
      <PageHeader
        title="الموظفين"
        subtitle="إدارة الموظفين والتسلسل الوظيفي والحسابات"
        icon="groups"
        primaryAction={can('employees.create') ? {
          label: 'إضافة موظف',
          icon: 'add',
          onClick: openCreate,
          dataModalKey: MODAL_KEYS.EMPLOYEES_CREATE,
        } : undefined}
        moreActions={[
          {
            label: 'تصدير Excel',
            icon: 'download',
            group: 'تصدير',
            hidden: !canExportFromPage || _rawEmployees.length === 0,
            onClick: () => {
              const getDeptName = (id: string) => departments.find((d) => d.id === id)?.name || '—';
              const getJobTitle = (id: string) => jobPositions.find((j) => j.id === id)?.title || '—';
              const getShiftName = (id: string) => shifts.find((s) => s.id === id)?.name || '—';
              exportAllEmployees(_rawEmployees, getDeptName, getJobTitle, getShiftName);
            },
          },
          {
            label: 'استيراد Excel',
            icon: 'upload_file',
            group: 'استيراد',
            hidden: !canImportFromPage,
            onClick: () => navigate('/employees/import'),
          },
        ]}
      />

      {/* 2. Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className={`p-4 cursor-pointer transition-all ${filterStatus === 'all' ? 'ring-2 ring-primary' : ''}`} onClick={() => setFilterStatus('all')}>
          <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">الإجمالي</p>
          <p className="text-2xl font-bold text-[var(--color-text)]">{summaryKpis.total}</p>
        </Card>
        <Card className={`p-4 cursor-pointer transition-all ${filterStatus === 'active' ? 'ring-2 ring-emerald-400' : ''}`} onClick={() => setFilterStatus(filterStatus === 'active' ? 'all' : 'active')}>
          <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">نشط</p>
          <p className="text-2xl font-bold text-emerald-600">{summaryKpis.active}</p>
        </Card>
        <Card className={`p-4 cursor-pointer transition-all ${filterStatus === 'inactive' ? 'ring-2 ring-slate-400' : ''}`} onClick={() => setFilterStatus(filterStatus === 'inactive' ? 'all' : 'inactive')}>
          <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">غير نشط</p>
          <p className="text-2xl font-bold text-slate-500">{summaryKpis.inactive}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">لديهم دخول للنظام</p>
          <p className="text-2xl font-bold text-primary">{summaryKpis.withSystemAccess}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">في انتظار الموافقة</p>
          <p className="text-2xl font-bold text-amber-600">{summaryKpis.pending}</p>
        </Card>
      </div>

      {/* 3. Pending users moved to users page */}
      {pendingUsers.length > 0 && canManageUsers && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">الموافقة على المستخدمين انتقلت لصفحة المستخدمين</h3>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                يوجد {pendingUsers.length} مستخدم/مستخدمين بانتظار الموافقة.
              </p>
            </div>
            <Button variant="secondary" onClick={() => navigate('/system/users')}>
              <EmployeeIcon name="manage_accounts" className="text-sm" />
              فتح إدارة المستخدمين
            </Button>
          </div>
        </Card>
      )}

      {/* 4. Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end">
          <div className="flex-1 min-w-0 sm:min-w-[200px]">
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">بحث (اسم / رمز)</label>
            <input
              type="text"
              className="erp-filter-select w-full"
              placeholder="بحث..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-40">
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">القسم</label>
            <select
              className="erp-filter-select w-full"
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
            >
              <option value="">الكل</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-40">
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">المنصب</label>
            <select
              className="erp-filter-select w-full"
              value={filterJobPosition}
              onChange={(e) => setFilterJobPosition(e.target.value)}
            >
              <option value="">الكل</option>
              {jobPositions.map((j) => (
                <option key={j.id} value={j.id}>{j.title}</option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-40">
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">نوع التوظيف</label>
            <select
              className="erp-filter-select w-full"
              value={filterEmploymentType}
              onChange={(e) => setFilterEmploymentType(e.target.value)}
            >
              <option value="">الكل</option>
              {(Object.entries(EMPLOYMENT_TYPE_LABELS) as [EmploymentType, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-32">
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">الحالة</label>
            <select
              className="erp-filter-select w-full"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
            >
              <option value="all">الكل</option>
              <option value="active">نشط</option>
              <option value="inactive">غير نشط</option>
            </select>
          </div>
          <div className="w-full sm:w-36">
            <label className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">دخول النظام</label>
            <select
              className="erp-filter-select w-full"
              value={filterSystemAccess}
              onChange={(e) => setFilterSystemAccess(e.target.value as 'all' | 'yes' | 'no')}
            >
              <option value="all">الكل</option>
              <option value="yes">نعم</option>
              <option value="no">لا</option>
            </select>
          </div>
          {hasActiveFilters && (
            <Button variant="outline" onClick={clearFilters}>
              مسح الفلاتر
            </Button>
          )}
        </div>
      </Card>

      {/* 5. SelectableTable with bulk actions */}
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

      <Card className="py-3 px-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-[var(--color-text-muted)]">إجمالي المرتبات (حسب النتائج المعروضة)</span>
          <span className="text-base font-extrabold text-primary">{filteredSalaryTotal.toLocaleString('ar-EG')} ج.م</span>
        </div>
      </Card>

      {/* 6. Create/Edit Modal — Professional HR Panel */}
      {showModal && (can('employees.create') || can('employees.edit')) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowModal(false); setSaveMsg(null); }}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden border border-[var(--color-border)] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0 bg-gradient-to-l from-primary/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-[var(--border-radius-lg)] bg-primary/10 flex items-center justify-center">
                  <EmployeeIcon name={editId ? 'edit' : 'person_add'} className="text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--color-text)]">{editId ? 'تعديل موظف' : 'إضافة موظف جديد'}</h3>
                  <p className="text-xs text-slate-500">ملء البيانات الأساسية والوظيفية</p>
                </div>
              </div>
              <button onClick={() => { setShowModal(false); setSaveMsg(null); }} className="p-2 text-[var(--color-text-muted)] hover:text-slate-600 hover:bg-[#f0f2f5] rounded-[var(--border-radius-lg)] transition-all">
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
                      : 'border-transparent text-[var(--color-text-muted)] hover:text-slate-600 dark:hover:text-[var(--color-text-muted)]'
                  }`}
                >
                  <EmployeeIcon name={tab.icon} className="text-base" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] bg-amber-50 border border-amber-200">
                  <EmployeeIcon name="warning" className="text-amber-500 text-lg mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    {validationErrors.map((err, i) => (
                      <p key={i} className="text-sm font-bold text-amber-700">{err}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* ═══ Tab 1: Job Info ═══ */}
              {formTab === 'job' && (
                <div className="space-y-5 min-h-[360px]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="block text-xs font-bold text-[var(--color-text-muted)]">الاسم *</label>
                      <input
                        className={`w-full border rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium transition-colors ${!form.name.trim() ? 'border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-900/10' : 'border-[var(--color-border)]'} focus:border-primary focus:ring-1 focus:ring-primary/20`}
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
                        className={`w-full border rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium font-mono transition-colors ${validationErrors.some((e) => e.includes('رمز')) ? 'border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-900/10' : 'border-[var(--color-border)]'}`}
                        value={form.code}
                        onChange={(e) => setForm({ ...form, code: e.target.value })}
                        placeholder="اختياري — فريد"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-[var(--color-text-muted)]">القسم *</label>
                      <div className="flex gap-2">
                        <select
                          className={`flex-1 border rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium ${!form.departmentId ? 'border-rose-300 dark:border-rose-700' : 'border-[var(--color-border)]'}`}
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
                      <div className={`w-full border rounded-[var(--border-radius-lg)] text-sm p-3 font-bold ${selectedPosition ? 'bg-[#f8f9fa]/80 border-[var(--color-border)] text-primary' : 'border-[var(--color-border)]'}`}>
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
                      <label className={`flex-1 flex items-center gap-3 cursor-pointer p-3 rounded-[var(--border-radius-lg)] border transition-all ${form.isActive ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 ring-1 ring-emerald-200 dark:ring-emerald-800' : 'border-[var(--color-border)] hover:bg-[#f8f9fa]'}`}>
                        <input
                          type="radio"
                          name="isActive"
                          checked={form.isActive === true}
                          onChange={() => setForm({ ...form, isActive: true })}
                          className="text-emerald-500 focus:ring-emerald-500"
                        />
                        <div>
                          <span className="text-sm font-bold block">نشط</span>
                          <span className="text-xs text-slate-500">الموظف يعمل حالياً</span>
                        </div>
                      </label>
                      <label className={`flex-1 flex items-center gap-3 cursor-pointer p-3 rounded-[var(--border-radius-lg)] border transition-all ${!form.isActive ? 'border-rose-300 dark:border-rose-700 bg-rose-50 ring-1 ring-rose-200 dark:ring-rose-800' : 'border-[var(--color-border)] hover:bg-[#f8f9fa]'}`}>
                        <input
                          type="radio"
                          name="isActive"
                          checked={form.isActive === false}
                          onChange={() => setForm({ ...form, isActive: false })}
                          className="text-rose-500 focus:ring-rose-500"
                        />
                        <div>
                          <span className="text-sm font-bold block">غير نشط</span>
                          <span className="text-xs text-slate-500">موقوف أو منتهي</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ Tab 2: Employment & Salary ═══ */}
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
                        className={`w-full border rounded-[var(--border-radius-lg)] text-sm p-3 outline-none font-medium transition-colors ${form.baseSalary <= 0 && form.employmentType !== 'daily' ? 'border-rose-300 dark:border-rose-700' : 'border-[var(--color-border)]'}`}
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
                    <div className="flex items-center gap-3 px-4 py-3 rounded-[var(--border-radius-lg)] bg-amber-50 border border-amber-200">
                      <EmployeeIcon name="trending_up" className="text-amber-500" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-amber-700">تغيير في الراتب</p>
                        <p className="text-sm text-amber-600">
                          <span className="line-through opacity-60">{originalSalary?.toLocaleString()}</span>
                          <span className="mx-2">←</span>
                          <span className="font-bold">{Number(form.baseSalary).toLocaleString()}</span>
                          <span className="text-xs mr-1">ج.م</span>
                        </p>
                      </div>
                      <EmployeeIcon name="history" className="text-xs text-amber-500" />
                      <span className="text-[10px] text-amber-600 font-bold">سيتم تسجيل التغيير</span>
                    </div>
                  )}

                  {/* Live Net Salary Preview */}
                  {form.baseSalary > 0 && (
                    <div className="rounded-[var(--border-radius-lg)] border border-emerald-200 bg-gradient-to-l from-emerald-50 to-white dark:from-emerald-900/20 dark:to-slate-900 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <EmployeeIcon name="account_balance_wallet" className="text-emerald-600 text-lg" />
                          <span className="text-xs font-bold text-emerald-700">صافي الراتب التقديري</span>
                        </div>
                        <div className="text-left">
                          <p className="text-2xl font-bold text-emerald-700">
                            {Number(form.baseSalary).toLocaleString()}
                            <span className="text-xs font-bold mr-1">ج.م</span>
                          </p>
                          <p className="text-[10px] text-emerald-600/60/60">الراتب الأساسي قبل البدلات والخصومات</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ Tab 3: System Access ═══ */}
              {formTab === 'access' && (
                <div className="space-y-5 min-h-[360px]">
                  <div className="border border-blue-200 dark:border-blue-800 rounded-[var(--border-radius-lg)] p-4 space-y-4 bg-blue-50/50 dark:bg-blue-900/10">
                    <div className="flex items-start gap-2">
                      <EmployeeIcon name="info" className="text-blue-600" />
                      <div>
                        <p className="text-sm font-bold text-blue-700">إدارة حسابات الدخول أصبحت من صفحة المستخدمين</p>
                        <p className="text-xs text-blue-700/80 mt-1">
                          لإنشاء/ربط/فك ربط/تغيير دور/حذف نهائي للمستخدم، استخدم صفحة النظام → المستخدمون.
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)]">
                      الحالة الحالية لهذا الموظف: {form.hasSystemAccess ? 'لديه حساب مرتبط' : 'غير مرتبط بحساب'}.
                    </div>
                    <Button variant="secondary" onClick={() => navigate('/system/users')}>
                      <EmployeeIcon name="manage_accounts" className="text-sm" />
                      فتح صفحة المستخدمين
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer messages & actions */}
            {saveMsg && (
              <div className={`mx-6 mb-2 flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${saveMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                <EmployeeIcon name={saveMsg.type === 'success' ? 'check_circle' : 'error'} className="text-lg" />
                {saveMsg.text}
              </div>
            )}
            {shareCredentials && (
              <div className="mx-6 mb-2">
                <Button variant="outline" onClick={shareCredentialsToWhatsApp}>
                  <EmployeeIcon name="share" className="text-sm" />
                  مشاركة بيانات الدخول واتساب
                </Button>
              </div>
            )}
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-400">
                {validationErrors.length > 0 && (
                  <span className="text-rose-500 font-bold">{validationErrors.length} خطأ في البيانات</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => { setShowModal(false); setSaveMsg(null); }}>إلغاء</Button>
                <Button variant="primary" onClick={handleSave} disabled={saving || !isFormValid}>
                  {saving && <EmployeeIcon name="refresh" className="animate-spin text-sm" />}
                  {editId ? 'حفظ التعديلات' : 'إضافة الموظف'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate confirmation (soft delete) */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <EmployeeIcon name="person_off" className="text-amber-500 text-3xl" />
            </div>
            <h3 className="text-lg font-bold mb-2">تعطيل الموظف</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-2">
              سيتم تعطيل <span className="font-bold text-[var(--color-text)]">{getEmployeeDisplayName(_rawEmployees.find((e) => e.id === deleteConfirmId))}</span> وإيقاف حساب الدخول المرتبط به.
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mb-6">يمكنك إعادة تفعيله لاحقاً. البيانات والتقارير السابقة ستبقى محفوظة.</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>إلغاء</Button>
              <button
                onClick={() => handleDeactivate(deleteConfirmId)}
                className="px-4 py-2.5 rounded-[var(--border-radius-base)] font-bold text-sm bg-amber-500 text-white hover:bg-amber-600 flex items-center gap-2"
              >
                <EmployeeIcon name="person_off" className="text-sm" />
                تعطيل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent delete confirmation (hard delete - only for inactive employees) */}
      {permanentDeleteId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPermanentDeleteId(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <EmployeeIcon name="delete_forever" className="text-rose-500 text-3xl" />
            </div>
            <h3 className="text-lg font-bold mb-2">حذف نهائي</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-2">
              سيتم حذف <span className="font-bold text-rose-600">{getEmployeeDisplayName(_rawEmployees.find((e) => e.id === permanentDeleteId))}</span> نهائياً مع بيانات حسابه.
            </p>
            <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 rounded-[var(--border-radius-lg)] p-3 mb-4 text-right">
              <p className="text-xs font-bold text-rose-600 flex items-center gap-1">
                <EmployeeIcon name="warning" className="text-sm" />
                لا يمكن التراجع عن هذا الإجراء
              </p>
              {_rawEmployees.find((e) => e.id === permanentDeleteId)?.userId && (
                <p className="text-xs text-rose-500 mt-1">سيتم حذف حساب المستخدم المرتبط. حساب Firebase Auth يحتاج حذف يدوي من الـ Console.</p>
              )}
            </div>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setPermanentDeleteId(null)}>إلغاء</Button>
              <button
                onClick={() => handlePermanentDelete(permanentDeleteId)}
                className="px-4 py-2.5 rounded-[var(--border-radius-base)] font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 flex items-center gap-2"
              >
                <EmployeeIcon name="delete_forever" className="text-sm" />
                حذف نهائي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reactivate confirmation */}
      {toggleConfirmId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setToggleConfirmId(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-sm border border-[var(--color-border)] p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <EmployeeIcon name="person_add" className="text-emerald-500 text-3xl" />
            </div>
            <h3 className="text-lg font-bold mb-2">إعادة تفعيل الموظف</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">
              سيتم إعادة تفعيل <span className="font-bold text-[var(--color-text)]">{getEmployeeDisplayName(_rawEmployees.find((e) => e.id === toggleConfirmId))}</span> وتفعيل حساب الدخول المرتبط به.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setToggleConfirmId(null)}>إلغاء</Button>
              <Button variant="primary" onClick={() => handleToggleActive(toggleConfirmId)}>
                <EmployeeIcon name="check_circle" className="text-sm" />
                تفعيل
              </Button>
            </div>
          </div>
        </div>
      )}


      {/* Quick-Add Modal (Department / Position / Shift) */}
      {quickAddType && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setQuickAddType(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-md border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-base font-bold">
                {quickAddType === 'department' && 'إضافة قسم جديد'}
                {quickAddType === 'position' && 'إضافة منصب جديد'}
                {quickAddType === 'shift' && 'إضافة وردية جديدة'}
              </h3>
              <button onClick={() => setQuickAddType(null)} className="text-[var(--color-text-muted)] hover:text-slate-600">
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
                <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-[var(--border-radius-base)]">
                  <EmployeeIcon name="info" className="text-xs align-middle ml-1 inline" />
                  لم تختر قسم بعد — سيتم ربط المنصب بالقسم المختار لاحقاً
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setQuickAddType(null)}>إلغاء</Button>
              <Button variant="primary" onClick={handleQuickAdd} disabled={quickAddSaving || !quickAddName.trim()}>
                {quickAddSaving && <EmployeeIcon name="refresh" className="animate-spin text-sm" />}
                إضافة
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
