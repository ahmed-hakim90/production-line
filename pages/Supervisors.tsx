
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import { FirestoreSupervisor, FirestoreUser, ProductionReport, ActivityLog } from '../types';
import { usePermission } from '../utils/permissions';
import { reportService } from '../services/reportService';
import { activityLogService } from '../services/activityLogService';
import { userService } from '../services/userService';
import { supervisorService } from '../services/supervisorService';
import { getTodayDateString, formatNumber } from '../utils/calculations';

// ─── Constants ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  supervisor: 'مشرف',
  hall_supervisor: 'مشرف صالة',
  factory_manager: 'مسؤول مصنع',
  admin: 'مسؤول عام',
};

const ROLE_COLORS: Record<string, string> = {
  supervisor: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  hall_supervisor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  factory_manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  admin: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
};

type SupervisorRole = 'supervisor' | 'hall_supervisor' | 'factory_manager' | 'admin';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getRelativeTime(timestamp: any): string {
  if (!timestamp) return '';
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'الآن';
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays === 1) return 'أمس';
  if (diffDays < 7) return `منذ ${diffDays} أيام`;
  if (diffDays < 30) return `منذ ${Math.floor(diffDays / 7)} أسبوع`;
  return `منذ ${Math.floor(diffDays / 30)} شهر`;
}

function formatLastActivity(log?: ActivityLog, lastReportDate?: string): string {
  if (log) {
    const time = getRelativeTime(log.timestamp);
    return time ? `${log.description} ${time}` : log.description;
  }
  if (lastReportDate) {
    const date = new Date(lastReportDate + 'T12:00:00');
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 0) return 'سجل تقرير اليوم';
    if (diffDays === 1) return 'سجل تقرير أمس';
    if (diffDays < 7) return `سجل تقرير منذ ${diffDays} أيام`;
    return `سجل تقرير في ${lastReportDate}`;
  }
  return 'لا يوجد نشاط بعد';
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface SupervisorStats {
  totalReports: number;
  monthlyReports: number;
  lastActivity?: ActivityLog;
  lastReportDate?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const Supervisors: React.FC = () => {
  const supervisors = useAppStore((s) => s.supervisors);
  const createSupervisor = useAppStore((s) => s.createSupervisor);
  const updateSupervisor = useAppStore((s) => s.updateSupervisor);
  const deleteSupervisor = useAppStore((s) => s.deleteSupervisor);
  const roles = useAppStore((s) => s.roles);
  const createUser = useAppStore((s) => s.createUser);
  const resetUserPassword = useAppStore((s) => s.resetUserPassword);
  const login = useAppStore((s) => s.login);
  const currentUid = useAppStore((s) => s.uid);
  const currentEmail = useAppStore((s) => s.userEmail);

  const { can, canManageUsers } = usePermission();
  const navigate = useNavigate();

  // ── Local data ──
  const [allReports, setAllReports] = useState<ProductionReport[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, FirestoreUser>>({});
  const [dataLoading, setDataLoading] = useState(true);

  // ── Modal & form state ──
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<FirestoreSupervisor, 'id'>>({ name: '', role: 'supervisor', isActive: true });
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRoleId, setFormRoleId] = useState('');
  const [formCode, setFormCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [toggleConfirmId, setToggleConfirmId] = useState<string | null>(null);

  // ── Account creation modal ──
  const [showAccountModal, setShowAccountModal] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountRoleId, setAccountRoleId] = useState('');
  const [accountCreating, setAccountCreating] = useState(false);
  const [accountError, setAccountError] = useState('');

  // ── Re-auth after creating account ──
  const [showReAuth, setShowReAuth] = useState(false);
  const [reAuthPassword, setReAuthPassword] = useState('');
  const [reAuthLoading, setReAuthLoading] = useState(false);

  // ── Filters ──
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterActivity, setFilterActivity] = useState<string>('all');
  const [filterAccount, setFilterAccount] = useState<string>('all');

  // ── Fetch page-specific data on mount ──
  const fetchData = useCallback(async () => {
    setDataLoading(true);
    const [reports, logs, allUsers] = await Promise.all([
      reportService.getAll(),
      activityLogService.getRecent(200),
      canManageUsers ? userService.getAll() : Promise.resolve([]),
    ]);
    setAllReports(reports);
    setActivityLogs(logs);

    const uMap: Record<string, FirestoreUser> = {};
    allUsers.forEach((u) => { uMap[u.id!] = u; });
    setUsersMap(uMap);
    setDataLoading(false);
  }, [canManageUsers]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Build user lookup by supervisor (match via userId field or name) ──
  const supervisorUserMap = useMemo(() => {
    const map: Record<string, FirestoreUser | null> = {};
    const usersList: FirestoreUser[] = Object.values(usersMap);

    supervisors.forEach((sup) => {
      // Try matching via userId field from raw supervisors
      const raw = useAppStore.getState()._rawSupervisors.find((s) => s.id === sup.id);
      if (raw?.userId && usersMap[raw.userId]) {
        map[sup.id] = usersMap[raw.userId];
      } else {
        // Fallback: match by displayName
        const matchedUser = usersList.find((u) => u.displayName === sup.name);
        map[sup.id] = matchedUser ?? null;
      }
    });
    return map;
  }, [supervisors, usersMap]);

  // ── Per-supervisor stats ──
  const supervisorStats = useMemo(() => {
    const currentMonth = getTodayDateString().slice(0, 7);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const weekAgoStr = `${weekAgo.getFullYear()}-${String(weekAgo.getMonth() + 1).padStart(2, '0')}-${String(weekAgo.getDate()).padStart(2, '0')}`;

    const stats: Record<string, SupervisorStats & { activeThisWeek: boolean }> = {};

    supervisors.forEach((sup) => {
      const supReports = allReports.filter((r) => r.supervisorId === sup.id);
      const monthReports = supReports.filter((r) => r.date.startsWith(currentMonth));
      const weekReports = supReports.filter((r) => r.date >= weekAgoStr);
      const lastLog = activityLogs.find((l) => (l as any).supervisorId === sup.id || l.userId === supervisorUserMap[sup.id]?.id);
      const lastReport = supReports.length > 0
        ? supReports.sort((a, b) => b.date.localeCompare(a.date))[0].date
        : undefined;

      stats[sup.id] = {
        totalReports: supReports.length,
        monthlyReports: monthReports.length,
        lastActivity: lastLog,
        lastReportDate: lastReport,
        activeThisWeek: weekReports.length > 0,
      };
    });

    return stats;
  }, [supervisors, allReports, activityLogs, supervisorUserMap]);

  // ── Filtered & searched supervisors ──
  const filtered = useMemo(() => {
    return supervisors.filter((sup) => {
      if (search && !sup.name.includes(search)) return false;
      if (filterRole !== 'all' && sup.role !== filterRole) return false;
      if (filterStatus === 'active' && !sup.isActive) return false;
      if (filterStatus === 'inactive' && sup.isActive) return false;
      if (filterActivity !== 'all') {
        const stats = supervisorStats[sup.id];
        if (filterActivity === 'active_week' && !stats?.activeThisWeek) return false;
        if (filterActivity === 'inactive' && stats?.activeThisWeek) return false;
      }
      if (filterAccount !== 'all') {
        const hasAccount = !!supervisorUserMap[sup.id];
        if (filterAccount === 'has_account' && !hasAccount) return false;
        if (filterAccount === 'no_account' && hasAccount) return false;
      }
      return true;
    });
  }, [supervisors, search, filterRole, filterStatus, filterActivity, filterAccount, supervisorStats, supervisorUserMap]);

  // ── Summary KPIs ──
  const summaryKpis = useMemo(() => {
    const total = supervisors.length;
    const active = supervisors.filter((s) => s.isActive).length;
    const inactive = total - active;
    const withAccount = supervisors.filter((s) => !!supervisorUserMap[s.id]).length;
    const statsValues = Object.values(supervisorStats) as Array<SupervisorStats & { activeThisWeek: boolean }>;
    const totalReportsThisMonth = statsValues.reduce((s, v) => s + v.monthlyReports, 0);
    return { total, active, inactive, withAccount, totalReportsThisMonth };
  }, [supervisors, supervisorStats, supervisorUserMap]);

  // ── Dynamic role helpers ──
  const getDynamicRoleName = (roleId: string): string => {
    const role = roles.find((r) => r.id === roleId);
    return role?.name ?? 'غير محدد';
  };

  const getDynamicRoleColor = (roleId: string): string => {
    const role = roles.find((r) => r.id === roleId);
    return role?.color ?? 'bg-slate-100 text-slate-600';
  };

  // ── Modal handlers ──
  const openCreate = () => {
    setEditId(null);
    setForm({ name: '', role: 'supervisor', isActive: true });
    setFormEmail('');
    setFormPassword('');
    setFormRoleId(roles.length > 0 ? roles[roles.length - 1].id! : '');
    setFormCode('');
    setShowModal(true);
  };

  const openEdit = (id: string) => {
    const sup = supervisors.find((s) => s.id === id);
    if (!sup) return;
    setEditId(id);
    setForm({ name: sup.name, role: (sup.role as SupervisorRole) || 'supervisor', isActive: sup.isActive });
    setFormEmail('');
    setFormPassword('');
    const user = supervisorUserMap[id];
    setFormRoleId(user?.roleId ?? '');
    setFormCode(user?.code ?? '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);

    if (editId) {
      await updateSupervisor(editId, form);
      const linkedUser = supervisorUserMap[editId];
      if (linkedUser) {
        const userUpdates: Record<string, any> = {};
        if (formRoleId && formRoleId !== linkedUser.roleId) userUpdates.roleId = formRoleId;
        if (formCode !== (linkedUser.code || '')) userUpdates.code = formCode;
        if (Object.keys(userUpdates).length > 0) {
          await userService.update(linkedUser.id!, userUpdates);
          if (userUpdates.roleId && currentUid && currentEmail) {
            activityLogService.log(currentUid, currentEmail, 'UPDATE_USER_ROLE',
              `تغيير دور ${form.name} إلى: ${getDynamicRoleName(formRoleId)}`,
              { targetUserId: linkedUser.id, newRoleId: formRoleId }
            );
          }
        }
      }
    } else {
      const supId = await createSupervisor(form);

      if (supId && formEmail && formPassword && formRoleId) {
        const newUid = await createUser(formEmail, formPassword, form.name, formRoleId);
        if (newUid) {
          await supervisorService.update(supId, { userId: newUid, email: formEmail });
          if (formCode) {
            await userService.update(newUid, { code: formCode });
          }
          setShowModal(false);
          setSaving(false);
          setShowReAuth(true);
          return;
        }
      }
    }

    setSaving(false);
    setShowModal(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await deleteSupervisor(id);
    setDeleteConfirmId(null);
  };

  const handleToggleActive = async (id: string) => {
    const sup = supervisors.find((s) => s.id === id);
    if (!sup) return;
    await updateSupervisor(id, { isActive: !sup.isActive } as Partial<FirestoreSupervisor>);

    // Also toggle the linked user account
    const linkedUser = supervisorUserMap[id];
    if (linkedUser) {
      await userService.toggleActive(linkedUser.id!, !sup.isActive);
      if (currentUid && currentEmail) {
        activityLogService.log(currentUid, currentEmail, 'TOGGLE_USER_ACTIVE',
          `${sup.isActive ? 'تعطيل' : 'تفعيل'} حساب ${sup.name}`,
          { targetUserId: linkedUser.id, newStatus: !sup.isActive }
        );
      }
    }
    setToggleConfirmId(null);
    fetchData();
  };

  // ── Create account for existing supervisor ──
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAccountModal || !accountEmail || !accountPassword || !accountRoleId) return;
    setAccountCreating(true);
    setAccountError('');

    const sup = supervisors.find((s) => s.id === showAccountModal);
    if (!sup) return;

    const newUid = await createUser(accountEmail, accountPassword, sup.name, accountRoleId);
    if (newUid) {
      await supervisorService.update(showAccountModal, { userId: newUid, email: accountEmail });
      setShowAccountModal(null);
      setAccountEmail('');
      setAccountPassword('');
      setAccountRoleId('');
      setAccountCreating(false);
      // Need re-auth since Firebase signed in as the new user
      setShowReAuth(true);
    } else {
      setAccountError('فشل إنشاء الحساب. تحقق من البريد الإلكتروني.');
      setAccountCreating(false);
    }
  };

  // ── Re-auth handler ──
  const handleReAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentEmail || !reAuthPassword) return;
    setReAuthLoading(true);
    await login(currentEmail, reAuthPassword);
    setShowReAuth(false);
    setReAuthPassword('');
    setReAuthLoading(false);
    fetchData();
  };

  const handleResetPassword = async (email: string) => {
    await resetUserPassword(email);
    alert(`تم إرسال رابط إعادة تعيين كلمة المرور إلى ${email}`);
  };

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">فريق العمل</h2>
          <p className="text-sm text-slate-500 font-medium">إدارة المستخدمين وحساباتهم ومتابعة أدائهم على خطوط الإنتاج.</p>
        </div>
        {can("supervisors.create") && (
          <Button variant="primary" onClick={openCreate}>
            <span className="material-icons-round text-sm">person_add</span>
            إضافة مستخدم
          </Button>
        )}
      </div>

      {/* ── Summary KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 rounded-lg flex items-center justify-center">
            <span className="material-icons-round text-xl">groups</span>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400">إجمالي الفريق</p>
            <p className="text-xl font-black text-slate-800 dark:text-white">{summaryKpis.total}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-lg flex items-center justify-center">
            <span className="material-icons-round text-xl">check_circle</span>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400">مفعل</p>
            <p className="text-xl font-black text-emerald-600">{summaryKpis.active}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400 rounded-lg flex items-center justify-center">
            <span className="material-icons-round text-xl">block</span>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400">معطل</p>
            <p className="text-xl font-black text-rose-500">{summaryKpis.inactive}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400 rounded-lg flex items-center justify-center">
            <span className="material-icons-round text-xl">key</span>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400">لديهم حساب</p>
            <p className="text-xl font-black text-violet-600">{summaryKpis.withAccount}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400 rounded-lg flex items-center justify-center">
            <span className="material-icons-round text-xl">bar_chart</span>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400">تقارير الشهر</p>
            <p className="text-xl font-black text-indigo-600">{formatNumber(summaryKpis.totalReportsThisMonth)}</p>
          </div>
        </div>
      </div>

      {/* ── Filters Section ── */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="relative">
          <span className="material-icons-round absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
          <input
            className="w-full pr-11 pl-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-sm font-medium"
            placeholder="ابحث بالاسم..."
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">الدور:</span>
            <select className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg text-xs font-bold px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
              <option value="all">الكل</option>
              <option value="admin">مسؤول عام</option>
              <option value="factory_manager">مسؤول مصنع</option>
              <option value="hall_supervisor">مشرف صالة</option>
              <option value="supervisor">مشرف</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">الحالة:</span>
            <select className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg text-xs font-bold px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">الكل</option>
              <option value="active">مفعل</option>
              <option value="inactive">غير مفعل</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">النشاط:</span>
            <select className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg text-xs font-bold px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20" value={filterActivity} onChange={(e) => setFilterActivity(e.target.value)}>
              <option value="all">الكل</option>
              <option value="active_week">نشط هذا الأسبوع</option>
              <option value="inactive">غير نشط</option>
            </select>
          </div>
          {canManageUsers && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">الحساب:</span>
              <select className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg text-xs font-bold px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20" value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}>
                <option value="all">الكل</option>
                <option value="has_account">لديه حساب</option>
                <option value="no_account">بدون حساب</option>
              </select>
            </div>
          )}

          {(filterRole !== 'all' || filterStatus !== 'all' || filterActivity !== 'all' || filterAccount !== 'all' || search) && (
            <button onClick={() => { setFilterRole('all'); setFilterStatus('all'); setFilterActivity('all'); setFilterAccount('all'); setSearch(''); }} className="flex items-center gap-1 text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors">
              <span className="material-icons-round text-sm">close</span>
              مسح الفلاتر
            </button>
          )}

          <span className="text-xs text-slate-400 font-medium mr-auto">
            {filtered.length} من {supervisors.length} مستخدم
          </span>
        </div>
      </div>

      {/* ── Cards Grid ── */}
      {dataLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                <div className="flex-1 space-y-2">
                  <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-1/3"></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
                <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
              </div>
              <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="text-center py-12 text-slate-400">
            <span className="material-icons-round text-5xl mb-3 block opacity-30">groups</span>
            <p className="font-bold text-lg">لا يوجد مستخدمين{search || filterRole !== 'all' || filterStatus !== 'all' ? ' مطابقين للفلتر' : ' بعد'}</p>
            <p className="text-sm mt-1">
              {can("supervisors.create")
                ? 'اضغط "إضافة مستخدم" لإضافة أول مستخدم'
                : 'لا يوجد مستخدمين لعرضهم حالياً'}
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((sup) => {
            const stats = supervisorStats[sup.id] || { totalReports: 0, monthlyReports: 0 };
            const lastActivityText = formatLastActivity(stats.lastActivity, stats.lastReportDate);
            const roleLabel = ROLE_LABELS[sup.role] || sup.role;
            const roleColor = ROLE_COLORS[sup.role] || ROLE_COLORS.supervisor;
            const linkedUser = supervisorUserMap[sup.id];

            return (
              <Card key={sup.id} className="transition-all hover:ring-2 hover:ring-primary/10 hover:shadow-lg">
                <div className="flex flex-col">
                  {/* ── Header ── */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center ring-4 shrink-0 ${
                      sup.isActive ? 'bg-primary/10 ring-primary/5' : 'bg-slate-100 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700'
                    }`}>
                      <span className={`material-icons-round text-2xl ${sup.isActive ? 'text-primary' : 'text-slate-400'}`}>person</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-base text-slate-800 dark:text-white truncate">{sup.name}</h4>
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${roleColor}`}>
                          {roleLabel}
                        </span>
                        {linkedUser && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${getDynamicRoleColor(linkedUser.roleId)}`}>
                            {getDynamicRoleName(linkedUser.roleId)}
                          </span>
                        )}
                        {linkedUser?.code && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-primary/5 text-primary text-[10px] font-mono font-bold">
                            {linkedUser.code}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant={sup.isActive ? 'success' : 'danger'}>
                      {sup.isActive ? 'مفعل' : 'غير مفعل'}
                    </Badge>
                  </div>

                  {/* ── Account Status ── */}
                  {canManageUsers && (
                    <div className={`mb-3 px-3 py-2 rounded-lg flex items-center gap-2 ${
                      linkedUser
                        ? 'bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30'
                        : 'bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700'
                    }`}>
                      <span className={`material-icons-round text-sm ${linkedUser ? 'text-emerald-500' : 'text-slate-400'}`}>
                        {linkedUser ? 'verified_user' : 'no_accounts'}
                      </span>
                      <span className="text-[11px] font-bold flex-1">
                        {linkedUser ? (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            حساب مفعل — <span className="font-mono text-[10px]" dir="ltr">{linkedUser.email}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">بدون حساب دخول</span>
                        )}
                      </span>
                      {!linkedUser && can('users.create') && (
                        <button
                          onClick={() => { setShowAccountModal(sup.id); setAccountRoleId(roles.length > 0 ? roles[roles.length - 1].id! : ''); }}
                          className="text-[10px] font-bold text-primary hover:underline"
                        >
                          إنشاء حساب
                        </button>
                      )}
                    </div>
                  )}

                  {/* ── KPI Indicators ── */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="material-icons-round text-sm text-primary">bar_chart</span>
                        <span className="text-[10px] font-bold text-slate-400">عدد التقارير</span>
                      </div>
                      <p className="text-lg font-black text-slate-800 dark:text-white">{stats.totalReports}</p>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                        هذا الشهر: <span className="text-primary">{stats.monthlyReports}</span>
                      </p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="material-icons-round text-sm text-amber-500">schedule</span>
                        <span className="text-[10px] font-bold text-slate-400">آخر نشاط</span>
                      </div>
                      <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 leading-relaxed mt-1">
                        {lastActivityText}
                      </p>
                    </div>
                  </div>

                  {/* ── Action Buttons ── */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                    <Button variant="primary" className="flex-1 text-xs py-2" onClick={() => navigate(`/supervisors/${sup.id}`)}>
                      <span className="material-icons-round text-sm">visibility</span>
                      التفاصيل
                    </Button>
                    {can("supervisors.edit") && (
                      <Button variant="outline" className="flex-1 text-xs py-2" onClick={() => openEdit(sup.id)}>
                        <span className="material-icons-round text-sm">edit</span>
                        تعديل
                      </Button>
                    )}
                    {can("supervisors.edit") && (
                      <button
                        onClick={() => setToggleConfirmId(sup.id)}
                        className={`p-2 rounded-lg transition-all ${sup.isActive ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/10' : 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10'}`}
                        title={sup.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                      >
                        <span className="material-icons-round text-lg">{sup.isActive ? 'person_off' : 'person_add'}</span>
                      </button>
                    )}
                    {/* Reset password — only if has linked account */}
                    {linkedUser && canManageUsers && (
                      <button
                        onClick={() => handleResetPassword(linkedUser.email)}
                        className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/10 rounded-lg transition-all"
                        title="إعادة تعيين كلمة المرور"
                      >
                        <span className="material-icons-round text-lg">lock_reset</span>
                      </button>
                    )}
                    {can("supervisors.delete") && (
                      <button
                        onClick={() => setDeleteConfirmId(sup.id)}
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-lg transition-all"
                        title="حذف"
                      >
                        <span className="material-icons-round text-lg">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
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
                <p className="text-xs text-slate-400">تم إنشاء الحساب بنجاح. أعد تسجيل الدخول للمتابعة.</p>
              </div>
            </div>
            <form onSubmit={handleReAuth} className="space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1 block">كلمة المرور الخاصة بك</label>
                <input type="password" value={reAuthPassword} onChange={(e) => setReAuthPassword(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm" placeholder="أدخل كلمة المرور" required dir="ltr" />
              </div>
              <Button type="submit" className="w-full" disabled={reAuthLoading}>
                {reAuthLoading ? 'جاري...' : 'تسجيل الدخول'}
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ── Create Account for Existing Supervisor Modal ── */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAccountModal(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 w-full max-w-md border border-slate-200 dark:border-slate-800 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-black">إنشاء حساب دخول</h3>
              <button onClick={() => setShowAccountModal(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                <span className="material-icons-round text-slate-400">close</span>
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              إنشاء حساب لـ <span className="font-bold text-slate-800 dark:text-white">{supervisors.find((s) => s.id === showAccountModal)?.name}</span>
            </p>

            {accountError && (
              <div className="mb-4 px-4 py-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-xl text-sm font-bold text-rose-700 dark:text-rose-400">{accountError}</div>
            )}

            <form onSubmit={handleCreateAccount} className="space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1 block">البريد الإلكتروني</label>
                <input type="email" value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm" placeholder="user@example.com" required dir="ltr" />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1 block">كلمة المرور</label>
                <input type="password" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm" placeholder="6 أحرف على الأقل" minLength={6} required dir="ltr" />
              </div>
              <div>
                <label className="text-sm font-bold text-slate-600 dark:text-slate-400 mb-1 block">الدور في النظام</label>
                <select value={accountRoleId} onChange={(e) => setAccountRoleId(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm" required>
                  <option value="">اختر الدور</option>
                  {roles.map((r) => (<option key={r.id} value={r.id!}>{r.name}</option>))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={accountCreating} className="flex-1">
                  {accountCreating ? 'جاري الإنشاء...' : 'إنشاء الحساب'}
                </Button>
                <Button variant="outline" type="button" onClick={() => setShowAccountModal(null)}>إلغاء</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Create/Edit Modal ── */}
      {showModal && (can("supervisors.create") || can("supervisors.edit")) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editId ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الاسم *</label>
                <input
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: م. سامر عادل"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الدور الوظيفي *</label>
                <select
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.role || 'supervisor'}
                  onChange={(e) => setForm({ ...form, role: e.target.value as SupervisorRole })}
                >
                  <option value="supervisor">مشرف</option>
                  <option value="hall_supervisor">مشرف صالة</option>
                  <option value="factory_manager">مسؤول مصنع</option>
                  <option value="admin">مسؤول عام</option>
                </select>
              </div>

              {/* Account fields — show when creating new or editing existing with linked account */}
              {!editId && canManageUsers && (
                <div className="space-y-4 p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-icons-round text-blue-500 text-sm">vpn_key</span>
                    <span className="text-sm font-bold text-blue-700 dark:text-blue-400">حساب الدخول (اختياري)</span>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500">كود المستخدم</label>
                    <input type="text" value={formCode} onChange={(e) => setFormCode(e.target.value)} className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-mono" placeholder="مثال: EMP-001" dir="ltr" />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500">البريد الإلكتروني</label>
                    <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none" placeholder="user@example.com" dir="ltr" />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500">كلمة المرور</label>
                    <input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none" placeholder="6 أحرف على الأقل" minLength={6} dir="ltr" />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500">الدور في النظام</label>
                    <select value={formRoleId} onChange={(e) => setFormRoleId(e.target.value)} className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none">
                      <option value="">اختر الدور</option>
                      {roles.map((r) => (<option key={r.id} value={r.id!}>{r.name}</option>))}
                    </select>
                  </div>
                </div>
              )}

              {/* Edit: show linked account role selector */}
              {editId && canManageUsers && supervisorUserMap[editId] && (
                <div className="space-y-3 p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-900/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-icons-round text-blue-500 text-sm">vpn_key</span>
                    <span className="text-sm font-bold text-blue-700 dark:text-blue-400">حساب الدخول</span>
                    <span className="text-xs font-mono text-slate-400" dir="ltr">{supervisorUserMap[editId]?.email}</span>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500">كود المستخدم</label>
                    <input type="text" value={formCode} onChange={(e) => setFormCode(e.target.value)} className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none font-mono" placeholder="مثال: EMP-001" dir="ltr" />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500">الدور في النظام</label>
                    <select value={formRoleId} onChange={(e) => setFormRoleId(e.target.value)} className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm p-3 outline-none">
                      {roles.map((r) => (<option key={r.id} value={r.id!}>{r.name}</option>))}
                    </select>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">حالة الحساب</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="isActive" checked={form.isActive !== false} onChange={() => setForm({ ...form, isActive: true })} className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-emerald-600">مفعل</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="isActive" checked={form.isActive === false} onChange={() => setForm({ ...form, isActive: false })} className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-rose-500">غير مفعل</span>
                  </label>
                </div>
              </div>

              {form.name && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="material-icons-round text-primary text-xl">person</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-white">{form.name}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${ROLE_COLORS[form.role || 'supervisor']}`}>
                      {ROLE_LABELS[form.role || 'supervisor']}
                    </span>
                  </div>
                  <Badge variant={form.isActive !== false ? 'success' : 'danger'}>
                    {form.isActive !== false ? 'مفعل' : 'غير مفعل'}
                  </Badge>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setShowModal(false)}>إلغاء</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving || !form.name}>
                {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                <span className="material-icons-round text-sm">{editId ? 'save' : 'person_add'}</span>
                {editId ? 'حفظ' : 'إضافة'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toggle Active Confirmation ── */}
      {toggleConfirmId && can("supervisors.edit") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setToggleConfirmId(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const sup = supervisors.find((s) => s.id === toggleConfirmId);
              const willActivate = !sup?.isActive;
              return (
                <>
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${willActivate ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
                    <span className={`material-icons-round text-3xl ${willActivate ? 'text-emerald-500' : 'text-amber-500'}`}>
                      {willActivate ? 'person_add' : 'person_off'}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold mb-2">{willActivate ? 'تفعيل الحساب' : 'تعطيل الحساب'}</h3>
                  <p className="text-sm text-slate-500 mb-6">
                    {willActivate ? `هل أنت متأكد من تفعيل حساب "${sup?.name}"؟` : `هل أنت متأكد من تعطيل حساب "${sup?.name}"؟`}
                    {supervisorUserMap[toggleConfirmId] && (
                      <span className="block text-xs text-slate-400 mt-1">سيتم أيضاً {willActivate ? 'تفعيل' : 'تعطيل'} حساب الدخول</span>
                    )}
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <Button variant="outline" onClick={() => setToggleConfirmId(null)}>إلغاء</Button>
                    <button
                      onClick={() => handleToggleActive(toggleConfirmId)}
                      className={`px-4 py-2.5 rounded-lg font-bold text-sm text-white shadow-lg transition-all flex items-center gap-2 ${willActivate ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20' : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'}`}
                    >
                      <span className="material-icons-round text-sm">{willActivate ? 'check' : 'block'}</span>
                      {willActivate ? 'نعم، فعّل' : 'نعم، عطّل'}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ── */}
      {deleteConfirmId && can("supervisors.delete") && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-rose-500 text-3xl">person_remove</span>
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-slate-500 mb-6">
              هل أنت متأكد من حذف "{supervisors.find((s) => s.id === deleteConfirmId)?.name}"؟
              سيتم حذف جميع البيانات المرتبطة.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>إلغاء</Button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2.5 rounded-lg font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/20 transition-all flex items-center gap-2"
              >
                <span className="material-icons-round text-sm">delete</span>
                نعم، احذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
