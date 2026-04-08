import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Button, LoadingSkeleton } from '../components/UI';
import { PageHeader } from '../../../components/PageHeader';
import { SmartFilterBar } from '@/src/components/erp/SmartFilterBar';
import { StatusBadge } from '../../../src/components/erp/StatusBadge';
import { useAppStore } from '../../../store/useAppStore';
import { roleService } from '../services/roleService';
import { employeeService } from '../../hr/employeeService';
import { userManagementService, type UserManagementRow } from '../services/userManagementService';
import { activityLogService } from '../services/activityLogService';
import type { FirestoreEmployee, FirestoreRole } from '../../../types';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';
import { exportHRData } from '../../../utils/exportExcel';

function sortByName<T extends { name?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'ar'),
  );
}

function getEmployeeDisplayName(employee?: Partial<Pick<FirestoreEmployee, 'name' | 'code' | 'id'>> | null): string {
  const name = String(employee?.name || '').trim();
  if (name) return name;
  const code = String(employee?.code || '').trim();
  if (code) return `(${code})`;
  return String(employee?.id || '—');
}

function getUserDisplayName(row: UserManagementRow): string {
  const displayName = String(row.user.displayName || '').trim();
  if (displayName) return displayName;
  const employeeName = getEmployeeDisplayName(row.employee);
  if (employeeName !== '—') return employeeName;
  const email = String(row.user.email || '').trim();
  if (email) return email.split('@')[0] || email;
  return '—';
}

export const UsersManagement: React.FC = () => {
  const createUser = useAppStore((s) => s.createUser);
  const currentUid = useAppStore((s) => s.uid);
  const { openModal } = useGlobalModalManager();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState<UserManagementRow[]>([]);
  const [roles, setRoles] = useState<FirestoreRole[]>([]);
  const [employees, setEmployees] = useState<FirestoreEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'not_created'>('all');
  const roleFilter = searchParams.get('role') || 'all';
  const statusTabs: Array<{ key: 'all' | 'active' | 'pending' | 'not_created'; label: string }> = [
    { key: 'all', label: 'الكل' },
    { key: 'pending', label: 'انتظار الموافقة' },
    { key: 'not_created', label: 'حسابات لم تُنشأ' },
    { key: 'active', label: 'مفعل' },
  ];

  const loadEmployees = async () => {
    const all = await employeeService.getAll();
    setEmployees(sortByName(all.filter((employee) => employee.isActive !== false)));
  };

  const refreshRows = async () => {
    const nextRows = await userManagementService.getRows();
    setRows(nextRows);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [rolesRows] = await Promise.all([roleService.getAll(), refreshRows(), loadEmployees()]);
        if (!mounted) return;
        setRoles(rolesRows);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const roleById = useMemo(() => {
    const map = new Map<string, FirestoreRole>();
    roles.forEach((role) => {
      if (role.id) map.set(role.id, role);
    });
    return map;
  }, [roles]);

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === 'active' && !row.user.isActive) return false;
      if (statusFilter === 'pending' && row.user.isActive) return false;
      if (statusFilter === 'not_created' && row.user.isActive) return false;
      if (roleFilter !== 'all') {
        const rid = String(row.user.roleId || '').trim();
        if (rid !== roleFilter) return false;
      }
      if (!needle) return true;
      const email = String(row.user.email || '').toLowerCase();
      const displayName = getUserDisplayName(row).toLowerCase();
      const employeeName = getEmployeeDisplayName(row.employee).toLowerCase();
      return (
        email.includes(needle) ||
        displayName.includes(needle) ||
        employeeName.includes(needle)
      );
    });
  }, [rows, query, statusFilter, roleFilter]);

  const roleFilterOptions = useMemo(
    () =>
      sortByName(roles.filter((r) => r.id)).map((role) => ({
        value: String(role.id || ''),
        label: String(role.name || role.id || ''),
      })),
    [roles],
  );

  const setRoleFilterParam = (value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value || value === 'all') next.delete('role');
        else next.set('role', value);
        return next;
      },
      { replace: true },
    );
  };

  const createEmployeeOptions = useMemo(() => {
    return employees
      .filter((employee) => !employee.userId)
      .map((employee) => ({
        value: String(employee.id || ''),
        label: `${getEmployeeDisplayName(employee)}${employee.code ? ` (${employee.code})` : ''}`,
      }));
  }, [employees]);

  const setSuccess = (text: string) => setMsg({ type: 'success', text });
  const setError = (text: string) => setMsg({ type: 'error', text });

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await refreshRows();
      await loadEmployees();
    } catch (error: any) {
      setError(error?.message || 'حدث خطأ غير متوقع.');
    } finally {
      setBusy(false);
    }
  };

  const createSingleUser = async (input: {
    displayName: string;
    email: string;
    password: string;
    roleId: string;
    employeeId?: string;
  }) => {
    const newUid = await createUser(input.email.trim(), input.password, input.displayName.trim(), input.roleId);
    if (!newUid) throw new Error('تعذر إنشاء المستخدم.');
    if (input.employeeId) {
      await userManagementService.linkUserToEmployee(newUid, input.employeeId);
    }
    await activityLogService.logCurrentUser(
      'CREATE_USER',
      `إنشاء مستخدم جديد: ${input.email.trim()}`,
      { userId: newUid, roleId: input.roleId, employeeId: input.employeeId || null },
    );
  };

  const handleUpdateRole = async (row: UserManagementRow, roleTargetId: string) => {
    if (!row?.user.id || !roleTargetId) return;
    if (roleTargetId === row.user.roleId) {
      setSuccess('الدور الحالي مطابق — لا يوجد تغيير.');
      return;
    }
    await withBusy(async () => {
      await userManagementService.updateUserRole(row.user.id, roleTargetId);
      await activityLogService.logCurrentUser(
        'UPDATE_USER_ROLE',
        `تغيير دور المستخدم: ${row.user.email}`,
        { userId: row.user.id, roleId: roleTargetId },
      );
      setSuccess('تم تحديث الدور بنجاح.');
    });
  };

  const handleToggleActive = async (row: UserManagementRow) => {
    if (!row?.user.id) return;
    const nextActive = !row.user.isActive;
    await withBusy(async () => {
      await userManagementService.toggleUserActive(row.user.id!, nextActive);
      await activityLogService.logCurrentUser(
        'TOGGLE_USER_ACTIVE',
        `${nextActive ? 'تفعيل' : 'تعطيل'} المستخدم: ${row.user.email}`,
        { userId: row.user.id, isActive: nextActive },
      );
      setSuccess(nextActive ? 'تم تفعيل المستخدم.' : 'تم تعطيل المستخدم.');
    });
  };

  const handleLinkEmployee = async (row: UserManagementRow, employeeTargetId: string) => {
    if (!row?.user.id || !employeeTargetId) {
      setError('اختر موظفاً للربط.');
      return;
    }
    await withBusy(async () => {
      await userManagementService.linkUserToEmployee(row.user.id!, employeeTargetId);
      setSuccess('تم ربط المستخدم بالموظف بنجاح.');
    });
  };

  const handleUnlinkEmployee = async (row: UserManagementRow) => {
    if (!row?.user.id) return;
    await withBusy(async () => {
      await userManagementService.unlinkUserFromEmployee(row.user.id!);
      setSuccess('تم فك الربط بنجاح.');
    });
  };

  const handleHardDelete = async (row: UserManagementRow) => {
    if (!row?.user.id) return;
    if (row.user.id === currentUid) {
      setError('لا يمكن حذف حسابك الحالي من إدارة المستخدمين.');
      return;
    }
    const ok = window.confirm(`سيتم حذف المستخدم ${row.user.email} نهائيًا من Auth وFirestore. هل تريد المتابعة؟`);
    if (!ok) return;
    await withBusy(async () => {
      await userManagementService.hardDeleteUser(row.user.id!);
      await activityLogService.logCurrentUser(
        'REJECT_USER',
        `حذف مستخدم نهائيًا: ${row.user.email}`,
        { userId: row.user.id },
      );
      setSuccess('تم حذف المستخدم نهائيًا.');
    });
  };

  const handleUpdateCredentials = async (
    row: UserManagementRow,
    input: { email?: string; password?: string },
  ) => {
    if (!row?.user.id) return;
    await withBusy(async () => {
      await userManagementService.updateUserCredentials(row.user.id!, input);
      setSuccess('تم تحديث البريد/كلمة المرور بنجاح.');
    });
  };

  const linkedCount = rows.filter((row) => row.employee?.id).length;
  const activeCount = rows.filter((row) => row.user.isActive).length;
  const pendingCount = rows.filter((row) => !row.user.isActive).length;
  const exportRows = rows.map((row, index) => ({
    '#': index + 1,
    'الاسم': getUserDisplayName(row),
    'البريد الإلكتروني': row.user.email || '—',
    'الدور': row.role?.name || roleById.get(row.user.roleId)?.name || '—',
    'الموظف المرتبط': row.employee?.id ? getEmployeeDisplayName(row.employee) : 'غير مربوط',
    'الحالة': row.user.isActive ? 'مفعل' : 'انتظار الموافقة',
  }));
  const activeFilterCount = [
    query.trim(),
    statusFilter !== 'all' ? statusFilter : '',
    roleFilter !== 'all' ? roleFilter : '',
  ].filter(Boolean).length;

  const handleApproveUserAccess = async (
    row: UserManagementRow,
    roleTargetId: string,
    employeeTargetId: string,
  ) => {
    if (!row?.user.id) return;
    if (!roleTargetId) {
      setError('اختر دورًا قبل الموافقة.');
      return;
    }
    await withBusy(async () => {
      if (roleTargetId !== row.user.roleId) {
        await userManagementService.updateUserRole(row.user.id!, roleTargetId);
      }
      if (employeeTargetId) {
        await userManagementService.linkUserToEmployee(row.user.id!, employeeTargetId);
      }
      await userManagementService.toggleUserActive(row.user.id!, true);
      await activityLogService.logCurrentUser(
        'APPROVE_USER',
        `الموافقة على مستخدم: ${row.user.email}`,
        {
          userId: row.user.id,
          roleId: roleTargetId,
          employeeId: employeeTargetId || null,
          grantedSystemAccess: true,
        },
      );
      setSuccess('تمت الموافقة على المستخدم وتفعيل صلاحية الدخول بالكامل.');
    });
  };

  const openManageUserModal = (row: UserManagementRow) => {
    const currentUserId = String(row.user.id || '').trim();
    const allowedEmployeeOptions = employees
      .filter((employee) => !employee.userId || employee.userId === currentUserId)
      .map((employee) => ({
        value: String(employee.id || ''),
        label: `${getEmployeeDisplayName(employee)}${employee.code ? ` (${employee.code})` : ''}`,
      }));

    openModal(MODAL_KEYS.SYSTEM_USERS_MANAGE, {
      row,
      roles,
      employeeOptions: allowedEmployeeOptions,
      onUpdateRole: (roleId: string) => handleUpdateRole(row, roleId),
      onLinkEmployee: (employeeId: string) => handleLinkEmployee(row, employeeId),
      onUnlinkEmployee: () => handleUnlinkEmployee(row),
      onToggleActive: () => handleToggleActive(row),
      onApproveAccess: (roleId: string, employeeId: string) =>
        handleApproveUserAccess(row, roleId, employeeId),
      onUpdateCredentials: (input: { email?: string; password?: string }) =>
        handleUpdateCredentials(row, input),
      onHardDelete: () => handleHardDelete(row),
    });
  };

  const openCreateUserModal = () => {
    openModal(MODAL_KEYS.SYSTEM_USERS_CREATE, {
      roles,
      employeeOptions: createEmployeeOptions,
      onSubmit: async (input: {
        displayName: string;
        email: string;
        password: string;
        roleId: string;
        employeeId?: string;
      }) => {
        await createSingleUser(input);
        await refreshRows();
        await loadEmployees();
        setSuccess('تم إنشاء المستخدم بنجاح.');
      },
    });
  };

  const openImportUsersModal = () => {
    openModal(MODAL_KEYS.SYSTEM_USERS_IMPORT, {
      roles,
      employees,
      existingEmails: rows.map((row) => String(row.user.email || '').trim().toLowerCase()),
      onCreateUser: async (input: {
        displayName: string;
        email: string;
        password: string;
        roleId: string;
        employeeId?: string;
      }) => {
        await createSingleUser(input);
        await refreshRows();
        await loadEmployees();
      },
    });
  };

  return (
    <div className="space-y-4 erp-ds-clean">
      <PageHeader
        title="إدارة المستخدمين"
        subtitle="إنشاء المستخدمين يدوياً وربطهم بالموظفين وتعيين الدور والتحكم في التفعيل والحذف النهائي. زر «فك الربط» في نافذة المستخدم يخص الموظف وليس الدور — لتغيير الدور اختر دوراً آخر واحفظ."
        backAction={false}
        extra={(
          <>
            <Button
              variant="ghost"
              className="text-[13px] font-medium border border-[var(--color-border)] bg-white hover:bg-[var(--color-bg)]"
              onClick={() => exportHRData(exportRows, 'المستخدمون', `المستخدمون-${new Date().toISOString().slice(0, 10)}`)}
              disabled={rows.length === 0}
            >
              <span className="material-icons-round text-[15px]">download</span>
              تصدير
            </Button>
            <Button
              variant="ghost"
              className="text-[13px] font-medium border border-[var(--color-border)] bg-white hover:bg-[var(--color-bg)]"
              onClick={openImportUsersModal}
              data-modal-key={MODAL_KEYS.SYSTEM_USERS_IMPORT}
            >
              <span className="material-icons-round text-[15px]">upload_file</span>
              استيراد
            </Button>
          </>
        )}
        primaryAction={{
          label: '+ إنشاء مستخدم',
          icon: 'add',
          onClick: openCreateUserModal,
          dataModalKey: MODAL_KEYS.SYSTEM_USERS_CREATE,
        }}
      />

      {msg && (
        <div className={`px-3 py-2 rounded-[var(--border-radius-base)] text-sm border ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {loading ? (
          <>
            <Card className="p-4"><LoadingSkeleton rows={1} type="card" /></Card>
            <Card className="p-4"><LoadingSkeleton rows={1} type="card" /></Card>
            <Card className="p-4"><LoadingSkeleton rows={1} type="card" /></Card>
            <Card className="p-4"><LoadingSkeleton rows={1} type="card" /></Card>
          </>
        ) : (
          <>
            <Card className="p-4">
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">إجمالي</p>
              <p className="text-2xl font-bold text-[var(--color-text)]">{rows.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">مرتبطون بالموظف</p>
              <p className="text-2xl font-bold text-primary">{linkedCount}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">مفعلون</p>
              <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">انتظار الموافقة</p>
              <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
            </Card>
          </>
        )}
      </div>

      <Card title="قائمة المستخدمين">
        <SmartFilterBar
          searchPlaceholder="بحث بالبريد أو الاسم أو كود الموظف"
          searchValue={query}
          onSearchChange={setQuery}
          quickFilters={[
            {
              key: 'status',
              placeholder: 'كل الحالات',
              options: statusTabs.filter((tab) => tab.key !== 'all').map((tab) => ({
                value: tab.key,
                label: tab.label,
              })),
              width: 'w-[180px]',
            },
            {
              key: 'role',
              placeholder: 'كل الأدوار',
              options: roleFilterOptions,
              width: 'w-[200px]',
            },
          ]}
          quickFilterValues={{ status: statusFilter, role: roleFilter }}
          onQuickFilterChange={(key, value) => {
            if (key === 'status') setStatusFilter(value as 'all' | 'active' | 'pending' | 'not_created');
            if (key === 'role') setRoleFilterParam(value);
          }}
          onApply={() => undefined}
          applyLabel="عرض"
          extra={activeFilterCount > 0 ? (
            <button
              type="button"
              className="inline-flex h-[34px] items-center rounded-lg border border-rose-200 px-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50"
              onClick={() => {
                setQuery('');
                setStatusFilter('all');
                setRoleFilterParam('all');
              }}
            >
              مسح ({activeFilterCount})
            </button>
          ) : undefined}
        />
        {loading ? (
          <LoadingSkeleton rows={7} type="table" />
        ) : (
          <div className="erp-table-scroll">
            <table className="erp-table w-full text-sm">
              <thead className="sticky top-0 z-10" style={{ background: '#f8f9fa' }}>
                <tr className="text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                  <th className="text-right py-2.5 px-3 text-[11px] uppercase tracking-[0.08em]">المستخدم</th>
                  <th className="text-right py-2.5 px-3 text-[11px] uppercase tracking-[0.08em]">البريد</th>
                  <th className="text-right py-2.5 px-3 text-[11px] uppercase tracking-[0.08em]">الدور</th>
                  <th className="text-right py-2.5 px-3 text-[11px] uppercase tracking-[0.08em]">الموظف المرتبط</th>
                  <th className="text-right py-2.5 px-3 text-[11px] uppercase tracking-[0.08em]">الحالة</th>
                  <th className="text-right py-2.5 px-3 text-[11px] uppercase tracking-[0.08em]">إدارة</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const rowId = String(row.user.id || '');
                  return (
                    <tr
                      key={rowId}
                      className="border-b border-[var(--color-border)] transition-colors hover:bg-[#f8f9fa]"
                    >
                      <td className="py-2.5 px-3 font-medium">{getUserDisplayName(row)}</td>
                      <td className="py-2.5 px-3">{row.user.email}</td>
                      <td className="py-2.5 px-3">{row.role?.name || roleById.get(row.user.roleId)?.name || '—'}</td>
                      <td className="py-2.5 px-3">{row.employee?.id ? getEmployeeDisplayName(row.employee) : 'غير مربوط'}</td>
                      <td className="py-2.5 px-3">
                        <StatusBadge label={row.user.isActive ? 'مفعل' : 'انتظار الموافقة'} type={row.user.isActive ? 'success' : 'warning'} dot />
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                          onClick={() => openManageUserModal(row)}
                          data-modal-key={MODAL_KEYS.SYSTEM_USERS_MANAGE}
                        >
                          إدارة المستخدم
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
