import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import { SelectableTable, type TableColumn, type TableBulkAction } from '../../shared/components/SelectableTable';
import type { FirestoreEmployee, FirestoreUser, EmploymentType } from '../../../types';
import { EMPLOYMENT_TYPE_LABELS } from '../../../types';
import { usePermission } from '../../../utils/permissions';
import { userService } from '../../../services/userService';
import { activityLogService } from '../../../services/activityLogService';
import { employeeService } from '../employeeService';
import { JOB_LEVEL_LABELS } from '../types';
import type { FirestoreDepartment, FirestoreJobPosition, FirestoreShift, FirestoreVehicle } from '../types';
import { getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { departmentsRef, jobPositionsRef, shiftsRef } from '../collections';
import { vehicleService } from '../vehicleService';
import type { JobLevel } from '../types';
import { getTodayDateString } from '../../../utils/calculations';
import { exportAllEmployees } from '../../../utils/exportExcel';

const emptyForm: Omit<FirestoreEmployee, 'id' | 'createdAt'> = {
  name: '',
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [toggleConfirmId, setToggleConfirmId] = useState<string | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);
  const [formTab, setFormTab] = useState<'job' | 'salary' | 'access'>('job');
  const [recreateAccount, setRecreateAccount] = useState(false);

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

  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm });
    setFormEmail('');
    setFormPassword('');
    setFormRoleId(roles[0]?.id ?? '');
    setSaveMsg(null);
    setFormTab('job');
    setRecreateAccount(false);
    setShowModal(true);
  };

  const openEdit = async (id: string) => {
    const raw = _rawEmployees.find((e) => e.id === id);
    if (!raw) return;
    setEditId(id);
    setForm({
      name: raw.name ?? '',
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

  const handleSave = async () => {
    if (!isFormValid) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload: Omit<FirestoreEmployee, 'id' | 'createdAt'> = {
        name: form.name.trim(),
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

      const needsUserCreation = form.hasSystemAccess && formEmail.trim() && formPassword;

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
        const editingRaw = _rawEmployees.find((e) => e.id === editId);
        const shouldCreateUser = needsUserCreation && (!editingRaw?.userId || recreateAccount);
        if (shouldCreateUser) {
          if (recreateAccount && editingRaw?.userId) {
            try { await userService.delete(editingRaw.userId); } catch { /* old doc cleanup */ }
          }
          try {
            const newUid = await createUser(
              formEmail.trim(),
              formPassword,
              form.name.trim(),
              formRoleId || roles[0]?.id!
            );
            if (newUid) {
              await updateEmployee(editId, { userId: newUid, email: formEmail.trim() });
              setSaveMsg({ type: 'success', text: recreateAccount ? `تم إعادة إنشاء حساب الدخول بنجاح (${formEmail.trim()})` : `تم حفظ البيانات وإنشاء حساب دخول بنجاح (${formEmail.trim()})` });
              setRecreateAccount(false);
              await loadUsers();
            }
          } catch (authErr: any) {
            console.error('Create user error:', authErr);
            setSaveMsg({ type: 'error', text: `تم حفظ بيانات الموظف، لكن فشل إنشاء الحساب: ${getAuthErrorMsg(authErr)}` });
          }
        } else if (editingRaw?.userId && !recreateAccount) {
          const updates: string[] = [];
          const newEmail = formEmail.trim();
          if (newEmail && newEmail !== (editingRaw.email ?? '')) {
            await userService.update(editingRaw.userId, { email: newEmail });
            await updateEmployee(editId, { email: newEmail });
            updates.push('البريد الإلكتروني');
          }
          let currentRoleId = usersMap[editingRaw.userId]?.roleId;
          try {
            const latestUser = await userService.get(editingRaw.userId);
            currentRoleId = latestUser?.roleId ?? currentRoleId;
          } catch (e) {
            console.error('handleSave: failed to fetch latest user before role compare', e);
          }
          if (formRoleId && formRoleId !== currentRoleId) {
            await userService.updateRoleId(editingRaw.userId, formRoleId);
            updates.push('الدور');
          }
          if (updates.length > 0) {
            setSaveMsg({ type: 'success', text: `تم تحديث ${updates.join(' و ')} بنجاح` });
            await loadUsers();
          } else {
            setSaveMsg({ type: 'success', text: 'تم حفظ بيانات الموظف بنجاح' });
          }
        } else {
          setSaveMsg({ type: 'success', text: 'تم حفظ بيانات الموظف بنجاح' });
        }
      } else {
        const id = await createEmployee(payload);
        if (needsUserCreation && id) {
          try {
            const newUid = await createUser(
              formEmail.trim(),
              formPassword,
              form.name.trim(),
              formRoleId || roles[0]?.id!
            );
            if (newUid) {
              await updateEmployee(id, { userId: newUid, email: formEmail.trim() });
              setSaveMsg({ type: 'success', text: `تم إضافة الموظف وإنشاء حساب دخول بنجاح (${formEmail.trim()})` });
            }
          } catch (authErr: any) {
            console.error('Create user error:', authErr);
            setSaveMsg({ type: 'error', text: `تم إضافة الموظف، لكن فشل إنشاء الحساب: ${getAuthErrorMsg(authErr)}` });
          }
        } else {
          setSaveMsg({ type: 'success', text: 'تم إضافة الموظف بنجاح' });
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
      sortKey: (emp) => emp.code || emp.name,
      render: (emp) => (
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${emp.isActive !== false ? 'bg-primary/10' : 'bg-slate-100 dark:bg-slate-800'}`}>
            <span className={`material-icons-round text-base ${emp.isActive !== false ? 'text-primary' : 'text-slate-400'}`}>person</span>
          </div>
          <div className="min-w-0">
            <span className="font-bold text-slate-800 dark:text-white block truncate">{emp.name}</span>
            {emp.code && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-primary/5 text-primary text-[10px] font-mono font-bold">{emp.code}</span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'القسم',
      sortKey: (emp) => getDepartmentName(emp.departmentId ?? ''),
      render: (emp) => <span className="text-sm text-slate-600 dark:text-slate-400">{getDepartmentName(emp.departmentId ?? '')}</span>,
    },
    {
      header: 'المنصب',
      sortKey: (emp) => getJobPositionTitle(emp.jobPositionId ?? ''),
      render: (emp) => <span className="text-sm text-slate-600 dark:text-slate-400">{getJobPositionTitle(emp.jobPositionId ?? '')}</span>,
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
      header: 'دخول النظام',
      headerClassName: 'text-center',
      className: 'text-center',
      render: (emp) => can('employees.edit') ? (
        <button
          onClick={(e) => { e.stopPropagation(); handleSystemAccessToggle(emp.id!); }}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${emp.hasSystemAccess ? 'bg-primary/10 text-primary hover:bg-primary/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
        >
          <span className="material-icons-round text-xs">{emp.hasSystemAccess ? 'check' : 'close'}</span>
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
          className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
          title="عرض الملف"
        >
          <span className="material-icons-round text-lg">person</span>
        </button>
      )}
      {can('employees.edit') && (
        <button
          onClick={() => openEdit(emp.id!)}
          className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
          title="تعديل"
        >
          <span className="material-icons-round text-lg">edit</span>
        </button>
      )}
      {can('employees.edit') && emp.isActive !== false && (
        <button
          onClick={() => setDeleteConfirmId(emp.id!)}
          className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-all"
          title="تعطيل"
        >
          <span className="material-icons-round text-lg">person_off</span>
        </button>
      )}
      {can('employees.edit') && emp.isActive === false && (
        <button
          onClick={() => setToggleConfirmId(emp.id!)}
          className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-all"
          title="إعادة تفعيل"
        >
          <span className="material-icons-round text-lg">person_add</span>
        </button>
      )}
      {can('employees.delete') && emp.isActive === false && (
        <button
          onClick={() => setPermanentDeleteId(emp.id!)}
          className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
          title="حذف نهائي"
        >
          <span className="material-icons-round text-lg">delete_forever</span>
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
      emp.name,
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

  const employeeBulkActions = useMemo<TableBulkAction<FirestoreEmployee>[]>(() => [
    { label: 'تفعيل المحدد', icon: 'check_circle', action: handleBulkActivate, permission: 'employees.edit', variant: 'primary' },
    { label: 'تعطيل المحدد', icon: 'block', action: handleBulkDeactivate, permission: 'employees.edit', variant: 'danger' },
    { label: 'تصدير CSV', icon: 'download', action: handleBulkExport, permission: 'export' },
  ], [handleBulkActivate, handleBulkDeactivate, handleBulkExport]);

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
        <div className="h-8 w-64 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-96 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">الموظفين</h2>
          <p className="text-sm text-slate-500 font-medium">إدارة الموظفين والتسلسل الوظيفي والحسابات</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto flex-wrap">
          {_rawEmployees.length > 0 && can('export') && (
            <Button variant="secondary" onClick={() => {
              const getDeptName = (id: string) => departments.find((d) => d.id === id)?.name || '—';
              const getJobTitle = (id: string) => jobPositions.find((j) => j.id === id)?.title || '—';
              const getShiftName = (id: string) => shifts.find((s) => s.id === id)?.name || '—';
              exportAllEmployees(_rawEmployees, getDeptName, getJobTitle, getShiftName);
            }} className="shrink-0">
              <span className="material-icons-round text-sm">download</span>
              تصدير Excel
            </Button>
          )}
          {can('import') && (
            <Button variant="outline" onClick={() => navigate('/employees/import')} className="shrink-0">
              <span className="material-icons-round text-sm">upload_file</span>
              استيراد Excel
            </Button>
          )}
          {can('employees.create') && (
            <Button variant="primary" onClick={openCreate} className="shrink-0">
              <span className="material-icons-round text-sm">add</span>
              إضافة موظف
            </Button>
          )}
        </div>
      </div>

      {/* 2. Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card className={`p-4 cursor-pointer transition-all ${filterStatus === 'all' ? 'ring-2 ring-primary' : ''}`} onClick={() => setFilterStatus('all')}>
          <p className="text-xs text-slate-500 font-bold mb-1">الإجمالي</p>
          <p className="text-2xl font-black text-slate-800 dark:text-white">{summaryKpis.total}</p>
        </Card>
        <Card className={`p-4 cursor-pointer transition-all ${filterStatus === 'active' ? 'ring-2 ring-emerald-400' : ''}`} onClick={() => setFilterStatus(filterStatus === 'active' ? 'all' : 'active')}>
          <p className="text-xs text-slate-500 font-bold mb-1">نشط</p>
          <p className="text-2xl font-black text-emerald-600">{summaryKpis.active}</p>
        </Card>
        <Card className={`p-4 cursor-pointer transition-all ${filterStatus === 'inactive' ? 'ring-2 ring-slate-400' : ''}`} onClick={() => setFilterStatus(filterStatus === 'inactive' ? 'all' : 'inactive')}>
          <p className="text-xs text-slate-500 font-bold mb-1">غير نشط</p>
          <p className="text-2xl font-black text-slate-500">{summaryKpis.inactive}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 font-bold mb-1">لديهم دخول للنظام</p>
          <p className="text-2xl font-black text-primary">{summaryKpis.withSystemAccess}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500 font-bold mb-1">في انتظار الموافقة</p>
          <p className="text-2xl font-black text-amber-600">{summaryKpis.pending}</p>
        </Card>
      </div>

      {/* 3. Pending users */}
      {pendingUsers.length > 0 && canManageUsers && (
        <Card>
          <h3 className="text-lg font-bold mb-3">مستخدمون بانتظار الموافقة</h3>
          <ul className="space-y-2">
            {pendingUsers.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0"
              >
                <span className="font-medium">{u.displayName}</span>
                <span className="text-sm text-slate-500">{u.email}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" className="text-xs py-1.5" onClick={() => handleApprove(u.id!)}>
                    موافقة
                  </Button>
                  <Button variant="outline" className="text-xs py-1.5" onClick={() => handleReject(u.id!)}>
                    رفض
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 4. Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-bold text-slate-500 mb-1">بحث (اسم / رمز)</label>
            <input
              type="text"
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2 text-sm"
              placeholder="بحث..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-40">
            <label className="block text-xs font-bold text-slate-500 mb-1">القسم</label>
            <select
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2 text-sm"
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
            <label className="block text-xs font-bold text-slate-500 mb-1">المنصب</label>
            <select
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2 text-sm"
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
            <label className="block text-xs font-bold text-slate-500 mb-1">نوع التوظيف</label>
            <select
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2 text-sm"
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
            <label className="block text-xs font-bold text-slate-500 mb-1">الحالة</label>
            <select
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2 text-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | 'active' | 'inactive')}
            >
              <option value="all">الكل</option>
              <option value="active">نشط</option>
              <option value="inactive">غير نشط</option>
            </select>
          </div>
          <div className="w-full sm:w-36">
            <label className="block text-xs font-bold text-slate-500 mb-1">دخول النظام</label>
            <select
              className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl px-3 py-2 text-sm"
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

      {/* 6. Create/Edit Modal — Professional HR Panel */}
      {showModal && (can('employees.create') || can('employees.edit')) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setShowModal(false); setSaveMsg(null); }}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-gradient-to-l from-primary/5 to-transparent">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <span className="material-icons-round text-primary">{editId ? 'edit' : 'person_add'}</span>
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-800 dark:text-white">{editId ? 'تعديل موظف' : 'إضافة موظف جديد'}</h3>
                  <p className="text-xs text-slate-500">ملء البيانات الأساسية والوظيفية</p>
                </div>
              </div>
              <button onClick={() => { setShowModal(false); setSaveMsg(null); }} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
                <span className="material-icons-round">close</span>
              </button>
            </div>

            {/* Tab Navigation */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 px-6 shrink-0 sticky top-0 bg-white dark:bg-slate-900 z-10">
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
                      : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  <span className="material-icons-round text-base">{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <span className="material-icons-round text-amber-500 text-lg mt-0.5 shrink-0">warning</span>
                  <div className="space-y-1">
                    {validationErrors.map((err, i) => (
                      <p key={i} className="text-sm font-bold text-amber-700 dark:text-amber-400">{err}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* ═══ Tab 1: Job Info ═══ */}
              {formTab === 'job' && (
                <div className="space-y-5 min-h-[360px]">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">الاسم *</label>
                      <input
                        className={`w-full border rounded-xl text-sm p-3 outline-none font-medium transition-colors ${!form.name.trim() ? 'border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-900/10' : 'border-slate-200 dark:border-slate-700 dark:bg-slate-800'} focus:border-primary focus:ring-1 focus:ring-primary/20`}
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="اسم الموظف"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">رمز الموظف</label>
                      <input
                        className={`w-full border rounded-xl text-sm p-3 outline-none font-medium font-mono transition-colors ${validationErrors.some((e) => e.includes('رمز')) ? 'border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-900/10' : 'border-slate-200 dark:border-slate-700 dark:bg-slate-800'}`}
                        value={form.code}
                        onChange={(e) => setForm({ ...form, code: e.target.value })}
                        placeholder="اختياري — فريد"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">القسم *</label>
                      <div className="flex gap-2">
                        <select
                          className={`flex-1 border rounded-xl text-sm p-3 outline-none font-medium ${!form.departmentId ? 'border-rose-300 dark:border-rose-700' : 'border-slate-200 dark:border-slate-700'} dark:bg-slate-800`}
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
                          className="px-3 py-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors shrink-0"
                          title="إضافة قسم جديد"
                        >
                          <span className="material-icons-round text-lg">add</span>
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">المنصب</label>
                      <div className="flex gap-2">
                        <select
                          className="flex-1 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
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
                          className="px-3 py-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors shrink-0"
                          title="إضافة منصب جديد"
                        >
                          <span className="material-icons-round text-lg">add</span>
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">
                        المستوى
                        {selectedPosition && <span className="text-primary mr-1">(تلقائي من المنصب)</span>}
                      </label>
                      <div className={`w-full border rounded-xl text-sm p-3 font-bold ${selectedPosition ? 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-primary' : 'border-slate-200 dark:border-slate-700 dark:bg-slate-800'}`}>
                        {selectedPosition ? (
                          <div className="flex items-center gap-2">
                            <span className="material-icons-round text-sm text-primary/50">lock</span>
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
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">المدير المباشر</label>
                      <select
                        className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
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
                    <h4 className="text-xs font-black text-slate-500 dark:text-slate-400">حالة الموظف</h4>
                    <div className="flex gap-3">
                      <label className={`flex-1 flex items-center gap-3 cursor-pointer p-3 rounded-xl border transition-all ${form.isActive ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-200 dark:ring-emerald-800' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
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
                      <label className={`flex-1 flex items-center gap-3 cursor-pointer p-3 rounded-xl border transition-all ${!form.isActive ? 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 ring-1 ring-rose-200 dark:ring-rose-800' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}>
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
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">نوع التوظيف</label>
                      <select
                        className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
                        value={form.employmentType}
                        onChange={(e) => setForm({ ...form, employmentType: e.target.value as EmploymentType })}
                      >
                        {(Object.entries(EMPLOYMENT_TYPE_LABELS) as [EmploymentType, string][]).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">الوردية</label>
                      <div className="flex gap-2">
                        <select
                          className="flex-1 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
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
                          className="px-3 py-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors shrink-0"
                          title="إضافة وردية جديدة"
                        >
                          <span className="material-icons-round text-lg">add</span>
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">الراتب الأساسي *</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        className={`w-full border rounded-xl text-sm p-3 outline-none font-medium transition-colors ${form.baseSalary <= 0 && form.employmentType !== 'daily' ? 'border-rose-300 dark:border-rose-700' : 'border-slate-200 dark:border-slate-700'} dark:bg-slate-800`}
                        value={form.baseSalary || ''}
                        onChange={(e) => setForm({ ...form, baseSalary: Number(e.target.value) })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">أجر الساعة</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
                        value={form.hourlyRate || ''}
                        onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) })}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">المركبة</label>
                      <select
                        className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
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
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <span className="material-icons-round text-amber-500">trending_up</span>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-amber-700 dark:text-amber-400">تغيير في الراتب</p>
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          <span className="line-through opacity-60">{originalSalary?.toLocaleString()}</span>
                          <span className="mx-2">←</span>
                          <span className="font-black">{Number(form.baseSalary).toLocaleString()}</span>
                          <span className="text-xs mr-1">ج.م</span>
                        </p>
                      </div>
                      <span className="material-icons-round text-xs text-amber-500">history</span>
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">سيتم تسجيل التغيير</span>
                    </div>
                  )}

                  {/* Live Net Salary Preview */}
                  {form.baseSalary > 0 && (
                    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-l from-emerald-50 to-white dark:from-emerald-900/20 dark:to-slate-900 p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="material-icons-round text-emerald-600 text-lg">account_balance_wallet</span>
                          <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">صافي الراتب التقديري</span>
                        </div>
                        <div className="text-left">
                          <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                            {Number(form.baseSalary).toLocaleString()}
                            <span className="text-xs font-bold mr-1">ج.م</span>
                          </p>
                          <p className="text-[10px] text-emerald-600/60 dark:text-emerald-400/60">الراتب الأساسي قبل البدلات والخصومات</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ Tab 3: System Access ═══ */}
              {formTab === 'access' && (
                <div className="space-y-5 min-h-[360px]">
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={form.hasSystemAccess}
                      onChange={(e) => setForm({ ...form, hasSystemAccess: e.target.checked })}
                      className="rounded border-slate-300 text-primary focus:ring-primary w-5 h-5"
                    />
                    <div>
                      <span className="text-sm font-bold block">لديه دخول للنظام</span>
                      <span className="text-xs text-slate-500">تفعيل حساب دخول إلكتروني لهذا الموظف</span>
                    </div>
                  </label>
                  {form.hasSystemAccess && (() => {
                    const editingRaw = editId ? _rawEmployees.find((e) => e.id === editId) : null;
                    const alreadyHasAccount = editingRaw?.userId && !recreateAccount;
                    if (alreadyHasAccount) {
                      return (
                        <div className="space-y-4">
                          <div className="border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 space-y-4 bg-emerald-50 dark:bg-emerald-900/20">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                                <span className="material-icons-round text-lg">check_circle</span>
                                <span className="text-sm font-bold">لديه حساب دخول</span>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <label className="block text-xs font-bold text-emerald-600 dark:text-emerald-400">البريد الإلكتروني</label>
                              <input
                                type="email"
                                className="w-full border border-emerald-200 dark:border-emerald-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
                                value={formEmail}
                                onChange={(e) => setFormEmail(e.target.value)}
                              />
                              {formEmail.trim() !== (editingRaw?.email ?? '') && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                  <span className="material-icons-round text-xs">info</span>
                                  سيتم تحديث البريد في بيانات الموظف. لتغيير بريد تسجيل الدخول يجب إعادة تعيين من Firebase.
                                </p>
                              )}
                            </div>
                            <div className="space-y-1.5">
                              <label className="block text-xs font-bold text-emerald-600 dark:text-emerald-400">الدور</label>
                              <select
                                className="w-full border border-emerald-200 dark:border-emerald-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
                                value={formRoleId}
                                onChange={(e) => setFormRoleId(e.target.value)}
                              >
                                {roles.map((r) => (
                                  <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => { setRecreateAccount(true); setFormPassword(''); }}
                            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors text-sm font-bold"
                          >
                            <span className="material-icons-round text-base">refresh</span>
                            إعادة إنشاء حساب الدخول (لو تم حذفه من Firebase)
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div className="border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-4 bg-blue-50/50 dark:bg-blue-900/10">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-blue-700 dark:text-blue-400">
                            {recreateAccount ? 'إعادة إنشاء حساب الدخول' : editId ? 'ربط حساب دخول للموظف' : 'إنشاء حساب دخول'}
                          </p>
                          {recreateAccount && (
                            <button
                              type="button"
                              onClick={() => setRecreateAccount(false)}
                              className="text-xs text-slate-400 hover:text-slate-600 font-bold flex items-center gap-1"
                            >
                              <span className="material-icons-round text-sm">arrow_back</span>
                              رجوع
                            </button>
                          )}
                        </div>
                        {recreateAccount && (
                          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                            <span className="material-icons-round text-amber-500 text-sm mt-0.5">warning</span>
                            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                              تأكد أنك حذفت الحساب القديم من Firebase Auth أولاً. سيتم إنشاء حساب جديد وربطه بالموظف.
                            </p>
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">البريد الإلكتروني</label>
                          <input
                            type="email"
                            className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
                            placeholder="البريد الإلكتروني"
                            value={formEmail}
                            onChange={(e) => setFormEmail(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">كلمة المرور</label>
                          <input
                            type="password"
                            className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
                            placeholder="كلمة المرور (6 أحرف على الأقل)"
                            value={formPassword}
                            onChange={(e) => setFormPassword(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400">الدور</label>
                          <select
                            className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
                            value={formRoleId}
                            onChange={(e) => setFormRoleId(e.target.value)}
                          >
                            {roles.map((r) => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Footer messages & actions */}
            {saveMsg && (
              <div className={`mx-6 mb-2 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold ${saveMsg.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400'}`}>
                <span className="material-icons-round text-lg">{saveMsg.type === 'success' ? 'check_circle' : 'error'}</span>
                {saveMsg.text}
              </div>
            )}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-400">
                {validationErrors.length > 0 && (
                  <span className="text-rose-500 font-bold">{validationErrors.length} خطأ في البيانات</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => { setShowModal(false); setSaveMsg(null); }}>إلغاء</Button>
                <Button variant="primary" onClick={handleSave} disabled={saving || !isFormValid}>
                  {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-amber-500 text-3xl">person_off</span>
            </div>
            <h3 className="text-lg font-bold mb-2">تعطيل الموظف</h3>
            <p className="text-sm text-slate-500 mb-2">
              سيتم تعطيل <span className="font-bold text-slate-700 dark:text-slate-300">{_rawEmployees.find((e) => e.id === deleteConfirmId)?.name}</span> وإيقاف حساب الدخول المرتبط به.
            </p>
            <p className="text-xs text-slate-400 mb-6">يمكنك إعادة تفعيله لاحقاً. البيانات والتقارير السابقة ستبقى محفوظة.</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>إلغاء</Button>
              <button
                onClick={() => handleDeactivate(deleteConfirmId)}
                className="px-4 py-2.5 rounded-lg font-bold text-sm bg-amber-500 text-white hover:bg-amber-600 flex items-center gap-2"
              >
                <span className="material-icons-round text-sm">person_off</span>
                تعطيل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent delete confirmation (hard delete - only for inactive employees) */}
      {permanentDeleteId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPermanentDeleteId(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-rose-500 text-3xl">delete_forever</span>
            </div>
            <h3 className="text-lg font-bold mb-2">حذف نهائي</h3>
            <p className="text-sm text-slate-500 mb-2">
              سيتم حذف <span className="font-bold text-rose-600">{_rawEmployees.find((e) => e.id === permanentDeleteId)?.name}</span> نهائياً مع بيانات حسابه.
            </p>
            <div className="bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 rounded-xl p-3 mb-4 text-right">
              <p className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                <span className="material-icons-round text-sm">warning</span>
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
                className="px-4 py-2.5 rounded-lg font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 flex items-center gap-2"
              >
                <span className="material-icons-round text-sm">delete_forever</span>
                حذف نهائي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reactivate confirmation */}
      {toggleConfirmId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setToggleConfirmId(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-emerald-500 text-3xl">person_add</span>
            </div>
            <h3 className="text-lg font-bold mb-2">إعادة تفعيل الموظف</h3>
            <p className="text-sm text-slate-500 mb-6">
              سيتم إعادة تفعيل <span className="font-bold text-slate-700 dark:text-slate-300">{_rawEmployees.find((e) => e.id === toggleConfirmId)?.name}</span> وتفعيل حساب الدخول المرتبط به.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setToggleConfirmId(null)}>إلغاء</Button>
              <Button variant="primary" onClick={() => handleToggleActive(toggleConfirmId)}>
                <span className="material-icons-round text-sm">check_circle</span>
                تفعيل
              </Button>
            </div>
          </div>
        </div>
      )}


      {/* Quick-Add Modal (Department / Position / Shift) */}
      {quickAddType && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setQuickAddType(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold">
                {quickAddType === 'department' && 'إضافة قسم جديد'}
                {quickAddType === 'position' && 'إضافة منصب جديد'}
                {quickAddType === 'shift' && 'إضافة وردية جديدة'}
              </h3>
              <button onClick={() => setQuickAddType(null)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">
                  {quickAddType === 'department' && 'اسم القسم *'}
                  {quickAddType === 'position' && 'اسم المنصب *'}
                  {quickAddType === 'shift' && 'اسم الوردية *'}
                </label>
                <input
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
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
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">رمز القسم</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-medium"
                    value={quickAddCode}
                    onChange={(e) => setQuickAddCode(e.target.value)}
                    placeholder="مثال: ASM"
                  />
                </div>
              )}
              {quickAddType === 'position' && !form.departmentId && (
                <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400 p-2 rounded-lg">
                  <span className="material-icons-round text-xs align-middle ml-1">info</span>
                  لم تختر قسم بعد — سيتم ربط المنصب بالقسم المختار لاحقاً
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setQuickAddType(null)}>إلغاء</Button>
              <Button variant="primary" onClick={handleQuickAdd} disabled={quickAddSaving || !quickAddName.trim()}>
                {quickAddSaving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                إضافة
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
