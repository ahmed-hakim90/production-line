
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import { FirestoreSupervisor, ProductionReport, ActivityLog } from '../types';
import { usePermission } from '../utils/permissions';
import { reportService } from '../services/reportService';
import { activityLogService } from '../services/activityLogService';
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

const emptyForm: Omit<FirestoreSupervisor, 'id'> = {
  name: '',
  role: 'supervisor',
  isActive: true,
};

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

  const can = usePermission();
  const navigate = useNavigate();

  // ── Local data (page-specific, not global store) ──
  const [allReports, setAllReports] = useState<ProductionReport[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // ── Modal & form state ──
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [toggleConfirmId, setToggleConfirmId] = useState<string | null>(null);

  // ── Filters ──
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterActivity, setFilterActivity] = useState<string>('all');

  // ── Fetch page-specific data on mount (single batch, avoids N+1) ──
  useEffect(() => {
    let cancelled = false;
    setDataLoading(true);

    Promise.all([
      reportService.getAll(),
      activityLogService.getRecent(200),
    ])
      .then(([reports, logs]) => {
        if (cancelled) return;
        setAllReports(reports);
        setActivityLogs(logs);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setDataLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // ── Compute per-supervisor stats (all in memory, no N+1) ──
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
      const lastLog = activityLogs.find((l) => l.supervisorId === sup.id);
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
  }, [supervisors, allReports, activityLogs]);

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
      return true;
    });
  }, [supervisors, search, filterRole, filterStatus, filterActivity, supervisorStats]);

  // ── Summary KPIs ──
  const summaryKpis = useMemo(() => {
    const total = supervisors.length;
    const active = supervisors.filter((s) => s.isActive).length;
    const inactive = total - active;
    const statsValues = Object.values(supervisorStats) as Array<SupervisorStats & { activeThisWeek: boolean }>;
    const totalReportsThisMonth = statsValues.reduce((s, v) => s + v.monthlyReports, 0);
    return { total, active, inactive, totalReportsThisMonth };
  }, [supervisors, supervisorStats]);

  // ── Modal handlers ──
  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (id: string) => {
    const sup = supervisors.find((s) => s.id === id);
    if (!sup) return;
    setEditId(id);
    setForm({
      name: sup.name,
      role: (sup.role as SupervisorRole) || 'supervisor',
      isActive: sup.isActive,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    if (editId) {
      await updateSupervisor(editId, form);
    } else {
      await createSupervisor(form);
    }
    setSaving(false);
    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    await deleteSupervisor(id);
    setDeleteConfirmId(null);
  };

  const handleToggleActive = async (id: string) => {
    const sup = supervisors.find((s) => s.id === id);
    if (!sup) return;
    await updateSupervisor(id, { isActive: !sup.isActive } as Partial<FirestoreSupervisor>);
    setToggleConfirmId(null);
  };

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-800 dark:text-white">فريق العمل</h2>
          <p className="text-sm text-slate-500 font-medium">إدارة المستخدمين ومتابعة أدائهم على خطوط الإنتاج.</p>
        </div>
        {can("supervisors.create") && (
          <Button variant="primary" onClick={openCreate}>
            <span className="material-icons-round text-sm">person_add</span>
            إضافة مستخدم
          </Button>
        )}
      </div>

      {/* ── Summary KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 rounded-lg flex items-center justify-center">
            <span className="material-icons-round text-xl">groups</span>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400">إجمالي المستخدمين</p>
            <p className="text-xl font-black text-slate-800 dark:text-white">{summaryKpis.total}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-lg flex items-center justify-center">
            <span className="material-icons-round text-xl">check_circle</span>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400">حسابات مفعلة</p>
            <p className="text-xl font-black text-emerald-600">{summaryKpis.active}</p>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
          <div className="w-11 h-11 bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400 rounded-lg flex items-center justify-center">
            <span className="material-icons-round text-xl">block</span>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400">حسابات غير مفعلة</p>
            <p className="text-xl font-black text-rose-500">{summaryKpis.inactive}</p>
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
        {/* Search */}
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
        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">الدور:</span>
            <select
              className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg text-xs font-bold px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
            >
              <option value="all">الكل</option>
              <option value="admin">مسؤول عام</option>
              <option value="factory_manager">مسؤول مصنع</option>
              <option value="hall_supervisor">مشرف صالة</option>
              <option value="supervisor">مشرف</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">الحالة:</span>
            <select
              className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg text-xs font-bold px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">الكل</option>
              <option value="active">مفعل</option>
              <option value="inactive">غير مفعل</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400">النشاط:</span>
            <select
              className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg text-xs font-bold px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              value={filterActivity}
              onChange={(e) => setFilterActivity(e.target.value)}
            >
              <option value="all">الكل</option>
              <option value="active_week">نشط هذا الأسبوع</option>
              <option value="inactive">غير نشط</option>
            </select>
          </div>

          {(filterRole !== 'all' || filterStatus !== 'all' || filterActivity !== 'all' || search) && (
            <button
              onClick={() => { setFilterRole('all'); setFilterStatus('all'); setFilterActivity('all'); setSearch(''); }}
              className="flex items-center gap-1 text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors"
            >
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

            return (
              <Card key={sup.id} className="transition-all hover:ring-2 hover:ring-primary/10 hover:shadow-lg">
                <div className="flex flex-col">
                  {/* ── Header: Avatar + Name + Role + Status ── */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center ring-4 shrink-0 ${
                      sup.isActive
                        ? 'bg-primary/10 ring-primary/5'
                        : 'bg-slate-100 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700'
                    }`}>
                      <span className={`material-icons-round text-2xl ${sup.isActive ? 'text-primary' : 'text-slate-400'}`}>
                        person
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-base text-slate-800 dark:text-white truncate">{sup.name}</h4>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold mt-1 ${roleColor}`}>
                        {roleLabel}
                      </span>
                    </div>
                    <Badge variant={sup.isActive ? 'success' : 'danger'}>
                      {sup.isActive ? 'مفعل' : 'غير مفعل'}
                    </Badge>
                  </div>

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

                  {/* ── Action Buttons (Permission Aware) ── */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                    {/* View Details — always visible */}
                    <Button
                      variant="primary"
                      className="flex-1 text-xs py-2"
                      onClick={() => navigate(`/supervisors/${sup.id}`)}
                    >
                      <span className="material-icons-round text-sm">visibility</span>
                      التفاصيل
                    </Button>

                    {/* Edit — requires supervisors.edit */}
                    {can("supervisors.edit") && (
                      <Button
                        variant="outline"
                        className="flex-1 text-xs py-2"
                        onClick={() => openEdit(sup.id)}
                      >
                        <span className="material-icons-round text-sm">edit</span>
                        تعديل
                      </Button>
                    )}

                    {/* Toggle Active/Inactive — requires supervisors.edit */}
                    {can("supervisors.edit") && (
                      <button
                        onClick={() => setToggleConfirmId(sup.id)}
                        className={`p-2 rounded-lg transition-all ${
                          sup.isActive
                            ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/10'
                            : 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10'
                        }`}
                        title={sup.isActive ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                      >
                        <span className="material-icons-round text-lg">
                          {sup.isActive ? 'person_off' : 'person_add'}
                        </span>
                      </button>
                    )}

                    {/* Manage Permissions — requires roles.manage */}
                    {can("roles.manage") && (
                      <button
                        onClick={() => navigate('/roles')}
                        className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/10 rounded-lg transition-all"
                        title="إدارة الصلاحيات"
                      >
                        <span className="material-icons-round text-lg">admin_panel_settings</span>
                      </button>
                    )}

                    {/* Delete — requires supervisors.delete */}
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

      {/* ── Create/Edit Modal ── */}
      {showModal && (can("supervisors.create") || can("supervisors.edit")) && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editId ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-icons-round">close</span>
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* Name */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الاسم *</label>
                <input
                  className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثال: م. سامر عادل"
                />
              </div>

              {/* Role */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">الدور *</label>
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

              {/* Status */}
              <div className="space-y-2">
                <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">حالة الحساب</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="isActive"
                      checked={form.isActive !== false}
                      onChange={() => setForm({ ...form, isActive: true })}
                      className="w-4 h-4 text-primary focus:ring-primary/20"
                    />
                    <span className="text-sm font-medium text-emerald-600">مفعل</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="isActive"
                      checked={form.isActive === false}
                      onChange={() => setForm({ ...form, isActive: false })}
                      className="w-4 h-4 text-primary focus:ring-primary/20"
                    />
                    <span className="text-sm font-medium text-rose-500">غير مفعل</span>
                  </label>
                </div>
              </div>

              {/* Preview badge */}
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
                  <Badge variant={form.isActive !== false ? 'success' : 'danger'} >
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
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
                    willActivate
                      ? 'bg-emerald-50 dark:bg-emerald-900/20'
                      : 'bg-amber-50 dark:bg-amber-900/20'
                  }`}>
                    <span className={`material-icons-round text-3xl ${
                      willActivate ? 'text-emerald-500' : 'text-amber-500'
                    }`}>
                      {willActivate ? 'person_add' : 'person_off'}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold mb-2">
                    {willActivate ? 'تفعيل الحساب' : 'تعطيل الحساب'}
                  </h3>
                  <p className="text-sm text-slate-500 mb-6">
                    {willActivate
                      ? `هل أنت متأكد من تفعيل حساب "${sup?.name}"؟`
                      : `هل أنت متأكد من تعطيل حساب "${sup?.name}"؟`
                    }
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <Button variant="outline" onClick={() => setToggleConfirmId(null)}>إلغاء</Button>
                    <button
                      onClick={() => handleToggleActive(toggleConfirmId)}
                      className={`px-4 py-2.5 rounded-lg font-bold text-sm text-white shadow-lg transition-all flex items-center gap-2 ${
                        willActivate
                          ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/20'
                          : 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20'
                      }`}
                    >
                      <span className="material-icons-round text-sm">
                        {willActivate ? 'check' : 'block'}
                      </span>
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
