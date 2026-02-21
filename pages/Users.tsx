import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { userService } from '../services/userService';
import { activityLogService } from '../services/activityLogService';
import { Card, Badge, Button, LoadingSkeleton } from '../components/UI';
import { usePermission } from '../utils/permissions';
import type { FirestoreUser, FirestoreRole } from '../types';

export const Users: React.FC = () => {
  const { can, canManageUsers } = usePermission();
  const roles = useAppStore((s) => s.roles);
  const currentUid = useAppStore((s) => s.uid);
  const currentEmail = useAppStore((s) => s.userEmail);
  const createUser = useAppStore((s) => s.createUser);
  const resetUserPassword = useAppStore((s) => s.resetUserPassword);
  const login = useAppStore((s) => s.login);

  const [users, setUsers] = useState<FirestoreUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<FirestoreUser | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create form state
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newRoleId, setNewRoleId] = useState('');
  const [createError, setCreateError] = useState('');

  // Edit form state
  const [editRoleId, setEditRoleId] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');

  // Re-auth state
  const [reAuthPassword, setReAuthPassword] = useState('');
  const [showReAuth, setShowReAuth] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const allUsers = await userService.getAll();
    setUsers(allUsers);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const getRoleName = (roleId: string): string => {
    const role = roles.find((r) => r.id === roleId);
    return role?.name ?? 'غير محدد';
  };

  const getRoleColor = (roleId: string): string => {
    const role = roles.find((r) => r.id === roleId);
    return role?.color ?? 'bg-slate-100 text-slate-600';
  };

  const pendingUsers = users.filter((u) => !u.isActive);
  const activeUsers = users.filter((u) => u.isActive);

  // ── Create User ──

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || !newPassword || !newDisplayName || !newRoleId) return;
    setCreateError('');
    setActionLoading('create');

    const newUid = await createUser(newEmail, newPassword, newDisplayName, newRoleId);

    if (newUid) {
      if (newCode) {
        await userService.update(newUid, { code: newCode });
      }
      setShowCreateModal(false);
      setNewEmail('');
      setNewPassword('');
      setNewDisplayName('');
      setNewCode('');
      setNewRoleId('');
      setShowReAuth(true);
    } else {
      setCreateError('فشل إنشاء المستخدم. تحقق من البيانات.');
    }
    setActionLoading(null);
  };

  const handleReAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEmail || !reAuthPassword) return;
    setActionLoading('reauth');
    await login(currentEmail, reAuthPassword);
    setShowReAuth(false);
    setReAuthPassword('');
    setActionLoading(null);
    fetchUsers();
  };

  // ── Approve / Reject ──

  const handleApprove = async (user: FirestoreUser) => {
    setActionLoading('approve-' + user.id);
    await userService.update(user.id!, { isActive: true });

    if (currentUid && currentEmail) {
      activityLogService.log(
        currentUid, currentEmail,
        'APPROVE_USER',
        `تمت الموافقة على المستخدم: ${user.displayName}`,
        { targetUserId: user.id }
      );
    }

    await fetchUsers();
    setActionLoading(null);
  };

  const handleReject = async (user: FirestoreUser) => {
    setActionLoading('reject-' + user.id);
    await userService.delete(user.id!);

    if (currentUid && currentEmail) {
      activityLogService.log(
        currentUid, currentEmail,
        'REJECT_USER',
        `تم رفض المستخدم: ${user.displayName} (${user.email})`,
        { targetUserId: user.id }
      );
    }

    await fetchUsers();
    setActionLoading(null);
  };

  // ── Toggle Active ──

  const handleToggleActive = async (user: FirestoreUser) => {
    setActionLoading(user.id!);
    await userService.toggleActive(user.id!, !user.isActive);

    if (currentUid && currentEmail) {
      activityLogService.log(
        currentUid, currentEmail,
        'TOGGLE_USER_ACTIVE',
        `${user.isActive ? 'تعطيل' : 'تفعيل'} المستخدم: ${user.displayName}`,
        { targetUserId: user.id, newStatus: !user.isActive }
      );
    }

    await fetchUsers();
    setActionLoading(null);
  };

  // ── Edit User ──

  const openEditModal = (user: FirestoreUser) => {
    setShowEditModal(user);
    setEditRoleId(user.roleId);
    setEditCode(user.code || '');
    setEditDisplayName(user.displayName);
  };

  const handleSaveEdit = async () => {
    if (!showEditModal) return;
    setActionLoading('edit-' + showEditModal.id);

    const updates: Partial<Omit<FirestoreUser, 'id'>> = {};
    if (editRoleId !== showEditModal.roleId) updates.roleId = editRoleId;
    if (editCode !== (showEditModal.code || '')) updates.code = editCode;
    if (editDisplayName !== showEditModal.displayName) updates.displayName = editDisplayName;

    if (Object.keys(updates).length > 0) {
      await userService.update(showEditModal.id!, updates);

      if (updates.roleId && currentUid && currentEmail) {
        activityLogService.log(
          currentUid, currentEmail,
          'UPDATE_USER_ROLE',
          `تغيير دور المستخدم ${showEditModal.displayName} إلى: ${getRoleName(editRoleId)}`,
          { targetUserId: showEditModal.id, oldRoleId: showEditModal.roleId, newRoleId: editRoleId }
        );
      }
    }

    await fetchUsers();
    setShowEditModal(null);
    setActionLoading(null);
  };

  const handleResetPassword = async (email: string) => {
    setActionLoading('reset-' + email);
    await resetUserPassword(email);
    alert(`تم إرسال رابط إعادة تعيين كلمة المرور إلى ${email}`);
    setActionLoading(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">إدارة المستخدمين</h2>
          <p className="text-sm text-slate-500 font-medium">إنشاء وإدارة حسابات المستخدمين والصلاحيات.</p>
        </div>
        {can('users.create') && (
          <Button onClick={() => { setShowCreateModal(true); setNewRoleId(roles[roles.length - 1]?.id ?? ''); }}>
            <span className="material-icons-round text-lg">person_add</span>
            إنشاء مستخدم
          </Button>
        )}
      </div>

      {/* ── Pending Users Section ── */}
      {pendingUsers.length > 0 && can('users.edit') && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
              <span className="material-icons-round text-amber-600 dark:text-amber-400 text-xl">pending_actions</span>
            </div>
            <div>
              <h3 className="text-base font-black text-amber-800 dark:text-amber-300">بانتظار الموافقة</h3>
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">{pendingUsers.length} مستخدم بانتظار موافقتك</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingUsers.map((user) => (
              <div key={user.id} className="bg-white dark:bg-slate-900 rounded-xl border border-amber-100 dark:border-amber-900/30 p-4 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
                    <span className="material-icons-round text-amber-600 dark:text-amber-400">person</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 dark:text-white truncate">{user.displayName}</p>
                    <p className="text-[11px] text-slate-400 font-mono truncate" dir="ltr">{user.email}</p>
                  </div>
                </div>
                {user.code && (
                  <div className="mb-3 px-2 py-1 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
                    <span className="text-[10px] text-slate-400 font-bold">الكود: </span>
                    <span className="text-xs font-mono font-black text-primary">{user.code}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(user)}
                    disabled={actionLoading === 'approve-' + user.id}
                    className="flex-1 py-2 px-3 bg-emerald-500 text-white rounded-lg text-xs font-bold hover:bg-emerald-600 transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    <span className="material-icons-round text-sm">check_circle</span>
                    موافقة
                  </button>
                  <button
                    onClick={() => handleReject(user)}
                    disabled={actionLoading === 'reject-' + user.id}
                    className="py-2 px-3 bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-bold hover:bg-rose-200 dark:hover:bg-rose-900/40 transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    <span className="material-icons-round text-sm">close</span>
                    رفض
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Re-auth Modal ── */}
      {showReAuth && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <span className="material-icons-round text-amber-600 dark:text-amber-400">warning</span>
              </div>
              <div>
                <h3 className="text-lg font-bold">إعادة تسجيل الدخول</h3>
                <p className="text-xs text-slate-400">تم إنشاء المستخدم بنجاح. أعد تسجيل الدخول للمتابعة.</p>
              </div>
            </div>
            <form onSubmit={handleReAuth} className="space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1 block">كلمة المرور الخاصة بك</label>
                <input
                  type="password"
                  value={reAuthPassword}
                  onChange={(e) => setReAuthPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                  placeholder="أدخل كلمة المرور"
                  required
                  dir="ltr"
                />
              </div>
              <Button type="submit" className="w-full" disabled={actionLoading === 'reauth'}>
                {actionLoading === 'reauth' ? 'جاري...' : 'تسجيل الدخول'}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ── Create User Modal ── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-lg border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black">إنشاء مستخدم جديد</h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <span className="material-icons-round text-slate-400">close</span>
              </button>
            </div>

            {createError && (
              <div className="mb-4 px-4 py-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-sm font-bold text-rose-700 dark:text-rose-400">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1 block">الاسم الكامل</label>
                  <input
                    type="text"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                    placeholder="محمد أحمد"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1 block">كود المستخدم</label>
                  <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono"
                    placeholder="مثال: EMP-001"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1 block">الدور</label>
                  <select
                    value={newRoleId}
                    onChange={(e) => setNewRoleId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                    required
                  >
                    <option value="">اختر الدور</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id!}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1 block">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                    placeholder="user@example.com"
                    required
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1 block">كلمة المرور</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                    placeholder="6 أحرف على الأقل"
                    minLength={6}
                    required
                    dir="ltr"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={actionLoading === 'create'} className="flex-1">
                  {actionLoading === 'create' ? 'جاري الإنشاء...' : 'إنشاء المستخدم'}
                </Button>
                <Button variant="outline" type="button" onClick={() => setShowCreateModal(false)}>
                  إلغاء
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit User Modal ── */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black">تعديل المستخدم</h3>
              <button onClick={() => setShowEditModal(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                <span className="material-icons-round text-slate-400">close</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1 block">الاسم</label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1 block">البريد الإلكتروني</label>
                <p className="text-sm font-mono text-slate-500 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl" dir="ltr">{showEditModal.email}</p>
              </div>
              <div>
                <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1 block">كود المستخدم</label>
                <input
                  type="text"
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono"
                  placeholder="مثال: EMP-001"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1 block">الدور</label>
                <div className="space-y-2">
                  {roles.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setEditRoleId(r.id!)}
                      className={`w-full px-4 py-3 rounded-xl text-right flex items-center gap-3 transition-all text-sm border ${
                        r.id === editRoleId
                          ? 'border-primary bg-primary/5 text-primary font-bold'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${r.color}`}>
                        {r.name}
                      </span>
                      {r.id === editRoleId && (
                        <span className="material-icons-round text-primary text-sm mr-auto">check</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button onClick={handleSaveEdit} disabled={!!actionLoading} className="flex-1">
                  حفظ التعديلات
                </Button>
                <Button variant="outline" onClick={() => setShowEditModal(null)}>
                  إغلاق
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Active Users List ── */}
      {loading ? (
        <LoadingSkeleton rows={4} type="table" />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase">المستخدم</th>
                  <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase">الكود</th>
                  <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase">البريد الإلكتروني</th>
                  <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase">الدور</th>
                  <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase">الحالة</th>
                  <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activeUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="material-icons-round text-primary text-lg">person</span>
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 dark:text-white">{user.displayName}</p>
                          <p className="text-xs text-slate-400">{user.id === currentUid ? '(أنت)' : ''}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {user.code ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-primary/5 text-primary text-xs font-mono font-bold">
                          {user.code}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-slate-600 dark:text-slate-300 font-mono text-xs" dir="ltr">
                      {user.email}
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${getRoleColor(user.roleId)}`}>
                        {getRoleName(user.roleId)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant="success">نشط</Badge>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        {can('users.edit') && (
                          <button
                            onClick={() => openEditModal(user)}
                            className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                            title="تعديل"
                          >
                            <span className="material-icons-round text-lg">edit</span>
                          </button>
                        )}
                        {can('users.edit') && user.id !== currentUid && (
                          <button
                            onClick={() => handleToggleActive(user)}
                            disabled={actionLoading === user.id}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                            title="تعطيل"
                          >
                            <span className="material-icons-round text-lg">block</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleResetPassword(user.email)}
                          disabled={actionLoading === 'reset-' + user.email}
                          className="p-1.5 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-all"
                          title="إعادة تعيين كلمة المرور"
                        >
                          <span className="material-icons-round text-lg">lock_reset</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {activeUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400 font-medium">
                      <span className="material-icons-round text-4xl block mb-2">group_off</span>
                      لا يوجد مستخدمين نشطين
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
          <p className="text-xs text-slate-400 font-bold mb-1">إجمالي المستخدمين</p>
          <p className="text-2xl font-black text-slate-800 dark:text-white">{users.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
          <p className="text-xs text-slate-400 font-bold mb-1">نشط</p>
          <p className="text-2xl font-black text-emerald-500">{activeUsers.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
          <p className="text-xs text-slate-400 font-bold mb-1">بانتظار الموافقة</p>
          <p className="text-2xl font-black text-amber-500">{pendingUsers.length}</p>
        </div>
      </div>
    </div>
  );
};
