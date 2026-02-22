import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import {
  usePermission,
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
  type Permission,
} from '../utils/permissions';
import type { FirestoreRole, FirestoreEmployee, FirestoreUser } from '../types';
import { userService } from '../services/userService';
import { getDocs } from 'firebase/firestore';
import { departmentsRef, jobPositionsRef } from '../modules/hr/collections';
import type { FirestoreDepartment, FirestoreJobPosition } from '../modules/hr/types';

const COLOR_OPTIONS = [
  { label: 'أحمر', value: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
  { label: 'أزرق', value: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  { label: 'برتقالي', value: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  { label: 'أخضر', value: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { label: 'بنفسجي', value: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  { label: 'وردي', value: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' },
  { label: 'سماوي', value: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  { label: 'رمادي', value: 'bg-slate-100 text-slate-700 dark:bg-slate-700/30 dark:text-slate-400' },
];

function buildEmptyPerms(): Record<string, boolean> {
  const obj: Record<string, boolean> = {};
  ALL_PERMISSIONS.forEach((p) => { obj[p] = false; });
  return obj;
}

const WORKER_POSITION_KEYWORDS = ['عامل انتاج', 'عامل إنتاج', 'عامل الانتاج', 'عامل الإنتاج'];

type PageTab = 'roles' | 'supervisors' | 'workers';

const PAGE_TABS: { id: PageTab; label: string; icon: string }[] = [
  { id: 'roles', label: 'الأدوار والصلاحيات', icon: 'admin_panel_settings' },
  { id: 'supervisors', label: 'المشرفين', icon: 'engineering' },
  { id: 'workers', label: 'عمال الإنتاج', icon: 'construction' },
];

// ─── Employee Role Card ──────────────────────────────────────────────────────

interface EmployeeRoleRowProps {
  emp: FirestoreEmployee;
  user: FirestoreUser | undefined;
  roles: FirestoreRole[];
  getDeptName: (id: string) => string;
  getPositionTitle: (id: string) => string;
  onChangeRole: (userId: string, roleId: string) => void;
  updatingId: string | null;
  icon: string;
  iconColor: string;
}

const EmployeeRoleRow: React.FC<EmployeeRoleRowProps> = ({
  emp, user, roles, getDeptName, getPositionTitle, onChangeRole, updatingId, icon, iconColor,
}) => {
  const currentRole = user ? roles.find((r) => r.id === user.roleId) : null;

  return (
    <div className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all">
      <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br ${iconColor}`}>
        <span className="material-icons-round text-lg">{icon}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-bold text-slate-800 dark:text-white truncate">{emp.name}</span>
          {emp.code && (
            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-mono font-bold shrink-0">{emp.code}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
          <span>{getDeptName(emp.departmentId)}</span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span>{getPositionTitle(emp.jobPositionId)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {user ? (
          <div className="flex items-center gap-2">
            {currentRole && (
              <span className={`hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${currentRole.color}`}>
                {currentRole.name}
              </span>
            )}
            <select
              value={user.roleId}
              onChange={(e) => onChangeRole(user.id!, e.target.value)}
              disabled={updatingId === user.id}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-w-[140px] disabled:opacity-50"
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {updatingId === user.id && (
              <span className="material-icons-round text-primary animate-spin text-lg">refresh</span>
            )}
          </div>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-bold">
            <span className="material-icons-round text-sm">person_off</span>
            لا يوجد حساب
          </span>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

export const RolesManagement: React.FC = () => {
  const roles = useAppStore((s) => s.roles);
  const createRole = useAppStore((s) => s.createRole);
  const updateRole = useAppStore((s) => s.updateRole);
  const deleteRole = useAppStore((s) => s.deleteRole);
  const userRoleId = useAppStore((s) => s.userRoleId);
  const _rawEmployees = useAppStore((s) => s._rawEmployees);
  const { can } = usePermission();

  const [activeTab, setActiveTab] = useState<PageTab>('roles');

  // Role editor state
  const [editingRole, setEditingRole] = useState<FirestoreRole | null>(null);
  const [editPerms, setEditPerms] = useState<Record<string, boolean>>({});
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(COLOR_OPTIONS[0].value);
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Employee tab state
  const [allUsers, setAllUsers] = useState<FirestoreUser[]>([]);
  const [departments, setDepartments] = useState<FirestoreDepartment[]>([]);
  const [jobPositions, setJobPositions] = useState<FirestoreJobPosition[]>([]);
  const [empSearch, setEmpSearch] = useState('');
  const [empRoleFilter, setEmpRoleFilter] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [empDataLoaded, setEmpDataLoaded] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load users + ref data when switching to employee tabs
  useEffect(() => {
    if ((activeTab === 'supervisors' || activeTab === 'workers') && !empDataLoaded) {
      (async () => {
        try {
          const [users, deptSnap, posSnap] = await Promise.all([
            userService.getAll(),
            getDocs(departmentsRef()),
            getDocs(jobPositionsRef()),
          ]);
          setAllUsers(users);
          setDepartments(deptSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreDepartment)));
          setJobPositions(posSnap.docs.map((d) => ({ id: d.id, ...d.data() } as FirestoreJobPosition)));
          setEmpDataLoaded(true);
        } catch (e) {
          console.error('Failed to load employee/user data:', e);
        }
      })();
    }
  }, [activeTab, empDataLoaded]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const getDeptName = useCallback((id: string) => departments.find((d) => d.id === id)?.name ?? '—', [departments]);
  const getPositionTitle = useCallback((id: string) => jobPositions.find((j) => j.id === id)?.title ?? '—', [jobPositions]);

  const usersByUserId = useMemo(() => {
    const map = new Map<string, FirestoreUser>();
    allUsers.forEach((u) => { if (u.id) map.set(u.id, u); });
    return map;
  }, [allUsers]);

  const workerPositionIds = useMemo(() => {
    return new Set(
      jobPositions
        .filter((jp) => WORKER_POSITION_KEYWORDS.some((kw) => jp.title.includes(kw)))
        .map((jp) => jp.id!)
    );
  }, [jobPositions]);

  const supervisors = useMemo(() => _rawEmployees.filter((e) => e.level === 2), [_rawEmployees]);
  const workers = useMemo(() => _rawEmployees.filter((e) => workerPositionIds.has(e.jobPositionId)), [_rawEmployees, workerPositionIds]);

  const filterEmployees = useCallback((list: FirestoreEmployee[]) => {
    let result = list;
    const q = empSearch.trim().toLowerCase();
    if (q) {
      result = result.filter((e) => e.name?.toLowerCase().includes(q) || (e.code && e.code.toLowerCase().includes(q)));
    }
    if (empRoleFilter) {
      if (empRoleFilter === '__none__') {
        result = result.filter((e) => !e.userId || !usersByUserId.has(e.userId));
      } else {
        result = result.filter((e) => {
          if (!e.userId) return false;
          const u = usersByUserId.get(e.userId);
          return u?.roleId === empRoleFilter;
        });
      }
    }
    return result;
  }, [empSearch, empRoleFilter, usersByUserId]);

  const filteredSupervisors = useMemo(() => filterEmployees(supervisors), [supervisors, filterEmployees]);
  const filteredWorkers = useMemo(() => filterEmployees(workers), [workers, filterEmployees]);

  const empStats = useCallback((list: FirestoreEmployee[]) => {
    const total = list.length;
    const withAccount = list.filter((e) => e.userId && usersByUserId.has(e.userId)).length;
    return { total, withAccount, withoutAccount: total - withAccount };
  }, [usersByUserId]);

  const handleChangeRole = useCallback(async (userId: string, roleId: string) => {
    setUpdatingUserId(userId);
    try {
      await userService.updateRoleId(userId, roleId);
      setAllUsers((prev) => prev.map((u) => u.id === userId ? { ...u, roleId } : u));
      const roleName = roles.find((r) => r.id === roleId)?.name ?? '';
      setToast({ message: `تم تغيير الدور إلى "${roleName}" بنجاح`, type: 'success' });
    } catch (e) {
      console.error('Failed to update role:', e);
      setToast({ message: 'فشل تغيير الدور', type: 'error' });
    } finally {
      setUpdatingUserId(null);
    }
  }, [roles]);

  // ── Role editor callbacks ──────────────────────────────────────────────────

  const openEdit = useCallback((role: FirestoreRole) => {
    setEditingRole(role);
    setEditPerms({ ...buildEmptyPerms(), ...role.permissions });
    setEditName(role.name);
    setEditColor(role.color);
  }, []);

  const openCreate = useCallback(() => {
    setEditingRole(null);
    setEditPerms(buildEmptyPerms());
    setEditName('');
    setEditColor(COLOR_OPTIONS[0].value);
    setShowCreateModal(true);
  }, []);

  const togglePerm = useCallback((key: string) => {
    setEditPerms((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleGroup = useCallback((groupKey: string) => {
    const group = PERMISSION_GROUPS.find((g) => g.key === groupKey);
    if (!group) return;
    const allEnabled = group.permissions.every((p) => editPerms[p.key]);
    setEditPerms((prev) => {
      const next = { ...prev };
      group.permissions.forEach((p) => { next[p.key] = !allEnabled; });
      return next;
    });
  }, [editPerms]);

  const handleSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    const data = { name: editName.trim(), color: editColor, permissions: editPerms };
    if (editingRole?.id) {
      await updateRole(editingRole.id, data);
    } else {
      await createRole(data);
    }
    setSaving(false);
    setEditingRole(null);
    setShowCreateModal(false);
  };

  const handleDelete = async (id: string) => {
    await deleteRole(id);
    setDeleteConfirmId(null);
    if (editingRole?.id === id) setEditingRole(null);
  };

  const enabledCount = (perms: Record<string, boolean>) => Object.values(perms).filter(Boolean).length;
  const isEditing = editingRole !== null || showCreateModal;

  // ── Render employee list tab ───────────────────────────────────────────────

  const renderEmployeeTab = (list: FirestoreEmployee[], icon: string, iconColor: string, emptyLabel: string) => {
    const stats = empStats(list);
    const filtered = activeTab === 'supervisors' ? filteredSupervisors : filteredWorkers;

    return (
      <div className="space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
            <p className="text-2xl font-black text-slate-800 dark:text-white">{stats.total}</p>
            <p className="text-xs text-slate-400 font-medium mt-1">الإجمالي</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
            <p className="text-2xl font-black text-emerald-600">{stats.withAccount}</p>
            <p className="text-xs text-slate-400 font-medium mt-1">لديهم حساب</p>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-center">
            <p className="text-2xl font-black text-slate-400">{stats.withoutAccount}</p>
            <p className="text-xs text-slate-400 font-medium mt-1">بدون حساب</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="material-icons-round absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
            <input
              type="text"
              placeholder="بحث بالاسم أو الرمز..."
              value={empSearch}
              onChange={(e) => setEmpSearch(e.target.value)}
              className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
          <select
            value={empRoleFilter}
            onChange={(e) => setEmpRoleFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-w-[160px]"
          >
            <option value="">كل الأدوار</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
            <option value="__none__">بدون حساب</option>
          </select>
        </div>

        {/* List */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <Card>
              <div className="text-center py-12 text-slate-400">
                <span className="material-icons-round text-5xl mb-3 block opacity-30">{icon}</span>
                <p className="font-bold text-lg">{emptyLabel}</p>
                {(empSearch || empRoleFilter) && (
                  <p className="text-sm mt-1">جرب تغيير البحث أو الفلتر</p>
                )}
              </div>
            </Card>
          ) : (
            filtered.map((emp) => (
              <EmployeeRoleRow
                key={emp.id}
                emp={emp}
                user={emp.userId ? usersByUserId.get(emp.userId) : undefined}
                roles={roles}
                getDeptName={getDeptName}
                getPositionTitle={getPositionTitle}
                onChangeRole={handleChangeRole}
                updatingId={updatingUserId}
                icon={icon}
                iconColor={iconColor}
              />
            ))
          )}
        </div>

        {filtered.length > 0 && (
          <p className="text-xs text-slate-400 font-bold text-center">
            عرض {filtered.length} من {list.length}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">الأدوار والصلاحيات</h2>
          <p className="text-sm text-slate-500 font-medium">إدارة الأدوار والتحكم في صلاحيات المشرفين وعمال الإنتاج</p>
        </div>
        {activeTab === 'roles' && can('roles.manage') && (
          <Button variant="primary" onClick={openCreate}>
            <span className="material-icons-round text-sm">add</span>
            إنشاء دور جديد
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {PAGE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setEmpSearch(''); setEmpRoleFilter(''); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeTab === tab.id
                ? 'bg-primary text-white shadow-lg shadow-primary/20'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span className="material-icons-round text-lg">{tab.icon}</span>
            {tab.label}
            {tab.id === 'supervisors' && (
              <span className={`min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-[10px] font-bold rounded-full ${
                activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}>{supervisors.length}</span>
            )}
            {tab.id === 'workers' && (
              <span className={`min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-[10px] font-bold rounded-full ${
                activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}>{workers.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Roles ─────────────────────────────────────────────────────── */}
      {activeTab === 'roles' && (
        <div className={`grid gap-6 ${isEditing ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
          <div className={isEditing ? 'lg:col-span-1' : ''}>
            <div className="space-y-3">
              {roles.map((role) => (
                <Card
                  key={role.id}
                  className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary/10 ${
                    editingRole?.id === role.id ? 'ring-2 ring-primary/30 bg-primary/5' : ''
                  }`}
                >
                  <div onClick={() => openEdit(role)}>
                    <div className="flex items-center justify-between mb-3">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${role.color}`}>
                        {role.name}
                      </span>
                      <span className="text-xs text-slate-400 font-bold">
                        {enabledCount(role.permissions)} / {ALL_PERMISSIONS.length} صلاحية
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {PERMISSION_GROUPS.map((group) => {
                        const count = group.permissions.filter((p) => role.permissions[p.key]).length;
                        if (count === 0) return null;
                        return (
                          <span key={group.key} className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {group.label} ({count})
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <Button variant="outline" className="flex-1 text-xs py-2" onClick={() => openEdit(role)}>
                      <span className="material-icons-round text-sm">edit</span>
                      تعديل
                    </Button>
                    {role.id !== userRoleId && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(role.id!); }}
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-lg transition-all"
                      >
                        <span className="material-icons-round text-lg">delete</span>
                      </button>
                    )}
                  </div>
                </Card>
              ))}
              {roles.length === 0 && (
                <Card>
                  <div className="text-center py-8 text-slate-400">
                    <span className="material-icons-round text-4xl mb-2 block opacity-30">admin_panel_settings</span>
                    <p className="font-bold">لا توجد أدوار بعد</p>
                  </div>
                </Card>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="lg:col-span-2">
              <Card className="sticky top-24">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold">
                    {editingRole ? `تعديل: ${editingRole.name}` : 'إنشاء دور جديد'}
                  </h3>
                  <button
                    onClick={() => { setEditingRole(null); setShowCreateModal(false); }}
                    className="text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <span className="material-icons-round">close</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">اسم الدور *</label>
                    <input
                      className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="مثال: مدير الإنتاج"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">اللون</label>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setEditColor(opt.value)}
                          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${opt.value} ${
                            editColor === opt.value ? 'ring-2 ring-primary scale-105' : 'opacity-70 hover:opacity-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                  {PERMISSION_GROUPS.map((group) => {
                    const allEnabled = group.permissions.every((p) => editPerms[p.key]);
                    const someEnabled = group.permissions.some((p) => editPerms[p.key]);
                    return (
                      <div key={group.key} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allEnabled}
                              ref={(el) => { if (el) el.indeterminate = someEnabled && !allEnabled; }}
                              onChange={() => toggleGroup(group.key)}
                              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                            />
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{group.label}</span>
                          </label>
                          <span className="text-[10px] font-bold text-slate-400">
                            {group.permissions.filter((p) => editPerms[p.key]).length}/{group.permissions.length}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {group.permissions.map((perm) => (
                            <label
                              key={perm.key}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-xs font-medium ${
                                editPerms[perm.key]
                                  ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                                  : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={editPerms[perm.key] || false}
                                onChange={() => togglePerm(perm.key)}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-primary focus:ring-primary/20"
                              />
                              {perm.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-xs text-slate-400 font-bold">
                    {enabledCount(editPerms)} / {ALL_PERMISSIONS.length} صلاحية مفعلة
                  </span>
                  <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={() => { setEditingRole(null); setShowCreateModal(false); }}>
                      إلغاء
                    </Button>
                    <Button variant="primary" onClick={handleSave} disabled={saving || !editName.trim()}>
                      {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                      <span className="material-icons-round text-sm">save</span>
                      {editingRole ? 'حفظ التعديلات' : 'إنشاء الدور'}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Supervisors ───────────────────────────────────────────────── */}
      {activeTab === 'supervisors' && (
        !empDataLoaded ? (
          <Card>
            <div className="flex items-center justify-center gap-3 py-12 text-slate-400">
              <span className="material-icons-round animate-spin text-2xl">refresh</span>
              <span className="font-bold">جاري تحميل بيانات المشرفين...</span>
            </div>
          </Card>
        ) : renderEmployeeTab(
          supervisors,
          'engineering',
          'from-primary/20 to-primary/5 ring-2 ring-primary/10 text-primary',
          'لا يوجد مشرفين'
        )
      )}

      {/* ── Tab: Workers ───────────────────────────────────────────────────── */}
      {activeTab === 'workers' && (
        !empDataLoaded ? (
          <Card>
            <div className="flex items-center justify-center gap-3 py-12 text-slate-400">
              <span className="material-icons-round animate-spin text-2xl">refresh</span>
              <span className="font-bold">جاري تحميل بيانات عمال الإنتاج...</span>
            </div>
          </Card>
        ) : renderEmployeeTab(
          workers,
          'construction',
          'from-teal-500/20 to-teal-500/5 ring-2 ring-teal-500/10 text-teal-600',
          'لا يوجد عمال إنتاج'
        )
      )}

      {/* Delete Confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-rose-500 text-3xl">delete_forever</span>
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد حذف الدور</h3>
            <p className="text-sm text-slate-500 mb-6">هل أنت متأكد من حذف هذا الدور؟ تأكد من عدم وجود مستخدمين مرتبطين به.</p>
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

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-xl shadow-2xl text-sm font-bold animate-in fade-in slide-in-from-bottom-4 duration-300 ${
          toast.type === 'success'
            ? 'bg-emerald-500 text-white shadow-emerald-500/30'
            : 'bg-rose-500 text-white shadow-rose-500/30'
        }`}>
          <span className="material-icons-round text-lg">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          {toast.message}
        </div>
      )}
    </div>
  );
};
