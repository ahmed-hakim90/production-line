import React, { useEffect, useMemo, useState } from 'react';
import { Card, Badge } from '../components/UI';
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

export const UsersManagement: React.FC = () => {
  const createUser = useAppStore((s) => s.createUser);
  const currentUid = useAppStore((s) => s.uid);
  const { openModal } = useGlobalModalManager();

  const [rows, setRows] = useState<UserManagementRow[]>([]);
  const [roles, setRoles] = useState<FirestoreRole[]>([]);
  const [employees, setEmployees] = useState<FirestoreEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'not_created'>('all');

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
      if (!needle) return true;
      const email = String(row.user.email || '').toLowerCase();
      const displayName = String(row.user.displayName || '').toLowerCase();
      const employeeName = String(row.employee?.name || '').toLowerCase();
      return (
        email.includes(needle) ||
        displayName.includes(needle) ||
        employeeName.includes(needle)
      );
    });
  }, [rows, query, statusFilter]);

  const createEmployeeOptions = useMemo(() => {
    return employees
      .filter((employee) => !employee.userId)
      .map((employee) => ({
        value: String(employee.id || ''),
        label: `${employee.name}${employee.code ? ` (${employee.code})` : ''}`,
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
      setSuccess('الدور الحالي مطابق، لا يوجد تغيير.');
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
      setError('اختر موظفًا للربط.');
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
    'الاسم': row.user.displayName || '—',
    'البريد الإلكتروني': row.user.email || '—',
    'الدور': row.role?.name || roleById.get(row.user.roleId)?.name || '—',
    'الموظف المرتبط': row.employee?.name || 'غير مربوط',
    'الحالة': row.user.isActive ? 'مفعّل' : 'بانتظار الموافقة',
  }));

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
      setSuccess('تمت الموافقة على المستخدم وتفعيل صلاحية الدخول للنظام.');
    });
  };

  const openManageUserModal = (row: UserManagementRow) => {
    const currentUserId = String(row.user.id || '').trim();
    const allowedEmployeeOptions = employees
      .filter((employee) => !employee.userId || employee.userId === currentUserId)
      .map((employee) => ({
        value: String(employee.id || ''),
        label: `${employee.name}${employee.code ? ` (${employee.code})` : ''}`,
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
    <div className="space-y-4">
      <div className="erp-page-head">
        <div className="erp-page-title-block">
          <h1 className="page-title">إدارة المستخدمين</h1>
          <p className="page-subtitle">إنشاء المستخدمين وربطهم بالموظفين والتحكم في التفعيل والحذف النهائي</p>
        </div>
        <div className="erp-page-actions">
          <button className="btn btn-secondary" onClick={() => exportHRData(exportRows, 'المستخدمون', `المستخدمون-${new Date().toISOString().slice(0, 10)}`)} disabled={rows.length === 0}>
            <span className="material-icons-round text-[15px]">download</span>
            تصدير
          </button>
          <button className="btn btn-secondary" onClick={openImportUsersModal} data-modal-key={MODAL_KEYS.SYSTEM_USERS_IMPORT}>
            <span className="material-icons-round text-[15px]">upload_file</span>
            استيراد
          </button>
          <button className="btn btn-primary" onClick={openCreateUserModal} data-modal-key={MODAL_KEYS.SYSTEM_USERS_CREATE}>
            <span className="material-icons-round text-[15px]">person_add</span>
            إنشاء مستخدم
          </button>
        </div>
      </div>

      {msg && (
        <div className={`px-3 py-2 rounded-[var(--border-radius-base)] text-sm border ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
          {msg.text}
        </div>
      )}

      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Card className="p-4">
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">إجمالي المستخدمين</p>
            <p className="text-2xl font-bold text-[var(--color-text)]">{rows.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">مستخدمون مرتبطون بموظف</p>
            <p className="text-2xl font-bold text-primary">{linkedCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">مستخدمون مفعّلون</p>
            <p className="text-2xl font-bold text-emerald-600">{activeCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-[var(--color-text-muted)] font-bold mb-1">بانتظار الموافقة</p>
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
          </Card>
        </div>
      </div>

      <Card title="قائمة المستخدمين">
        <div className="erp-filter-bar">
          <div className="erp-search-input erp-search-input--table w-full sm:max-w-[360px]">
            <span className="material-icons-round text-[var(--color-text-muted)]" style={{ fontSize: 15, flexShrink: 0 }}>search</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث بالبريد أو الاسم أو الموظف"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', flexShrink: 0 }}
                title="مسح البحث"
              >
                <span className="material-icons-round" style={{ fontSize: 14 }}>close</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap sm:ms-auto">
            <button
              className={`px-2.5 py-1 rounded-[var(--border-radius-sm)] text-[12px] font-medium border transition-colors ${statusFilter === 'all' ? 'bg-primary text-white border-primary' : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5]'}`}
              onClick={() => setStatusFilter('all')}
            >
              الكل
            </button>
            <button
              className={`px-2.5 py-1 rounded-[var(--border-radius-sm)] text-[12px] font-medium border transition-colors ${statusFilter === 'pending' ? 'bg-amber-500 text-white border-amber-500' : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5]'}`}
              onClick={() => setStatusFilter('pending')}
            >
              منتظر الموافقة
            </button>
            <button
              className={`px-2.5 py-1 rounded-[var(--border-radius-sm)] text-[12px] font-medium border transition-colors ${statusFilter === 'not_created' ? 'bg-amber-700 text-white border-amber-700' : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5]'}`}
              onClick={() => setStatusFilter('not_created')}
            >
              حسابات لم تُنشأ
            </button>
            <button
              className={`px-2.5 py-1 rounded-[var(--border-radius-sm)] text-[12px] font-medium border transition-colors ${statusFilter === 'active' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5]'}`}
              onClick={() => setStatusFilter('active')}
            >
              مفعّل
            </button>
          </div>
        </div>
        {loading ? (
          <div className="text-sm text-[var(--color-text-muted)]">جاري التحميل...</div>
        ) : (
          <div className="erp-table-scroll">
            <table className="w-full text-sm">
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
                      <td className="py-2.5 px-3 font-medium">{row.user.displayName || '—'}</td>
                      <td className="py-2.5 px-3">{row.user.email}</td>
                      <td className="py-2.5 px-3">{row.role?.name || roleById.get(row.user.roleId)?.name || '—'}</td>
                      <td className="py-2.5 px-3">{row.employee?.name || 'غير مربوط'}</td>
                      <td className="py-2.5 px-3">
                        <Badge variant={row.user.isActive ? 'success' : 'warning'}>
                          {row.user.isActive ? 'مفعّل' : 'بانتظار الموافقة'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          className="btn btn-secondary text-xs"
                          onClick={() => openManageUserModal(row)}
                          data-modal-key={MODAL_KEYS.SYSTEM_USERS_MANAGE}
                        >
                          <span className="material-icons-round text-[14px]">manage_accounts</span>
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
