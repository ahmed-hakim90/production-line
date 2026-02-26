import React, { useState, useCallback } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { Card, Button } from '../components/UI';
import {
  usePermission,
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
} from '../../../utils/permissions';
import type { FirestoreRole } from '../../../types';

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

export const RolesManagement: React.FC = () => {
  const roles = useAppStore((s) => s.roles);
  const createRole = useAppStore((s) => s.createRole);
  const updateRole = useAppStore((s) => s.updateRole);
  const deleteRole = useAppStore((s) => s.deleteRole);
  const userRoleId = useAppStore((s) => s.userRoleId);
  const { can } = usePermission();

  const [editingRole, setEditingRole] = useState<FirestoreRole | null>(null);
  const [editPerms, setEditPerms] = useState<Record<string, boolean>>({});
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(COLOR_OPTIONS[0].value);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const openEdit = useCallback((role: FirestoreRole) => {
    setEditingRole(role);
    setEditPerms({ ...buildEmptyPerms(), ...role.permissions });
    setEditName(role.name);
    setEditColor(role.color);
    setSaveMsg(null);
  }, []);

  const openCreate = useCallback(() => {
    setEditingRole(null);
    setEditPerms(buildEmptyPerms());
    setEditName('');
    setEditColor(COLOR_OPTIONS[0].value);
    setSaveMsg(null);
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
    setSaveMsg(null);
    try {
      const data = { name: editName.trim(), color: editColor, permissions: editPerms };
      if (editingRole?.id) {
        await updateRole(editingRole.id, data);
        setSaveMsg({ type: 'success', text: 'تم حفظ تعديلات الدور بنجاح' });
      } else {
        await createRole(data);
        setSaveMsg({ type: 'success', text: 'تم إنشاء الدور بنجاح' });
      }
    } catch {
      setSaveMsg({ type: 'error', text: 'تعذر حفظ الدور. حاول مرة أخرى.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteRole(id);
    setDeleteConfirmId(null);
    if (editingRole?.id === id) setEditingRole(null);
  };

  const enabledCount = (perms: Record<string, boolean>) => Object.values(perms).filter(Boolean).length;
  const isModalOpen = editingRole !== null || showCreateModal;

  const closeModal = () => {
    setEditingRole(null);
    setShowCreateModal(false);
    setSaveMsg(null);
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">الأدوار والصلاحيات</h2>
          <p className="text-sm text-slate-500 font-medium mt-0.5">إدارة الأدوار والتحكم في صلاحيات المستخدمين</p>
        </div>
        {can('roles.manage') && (
          <Button variant="primary" onClick={openCreate}>
            <span className="material-icons-round text-sm">add</span>
            إنشاء دور جديد
          </Button>
        )}
      </div>

      {/* ── Roles Card Grid: 1 col → 2 col → 3 col ── */}
      {roles.length === 0 ? (
        <Card>
          <div className="text-center py-16 text-slate-400">
            <span className="material-icons-round text-5xl mb-3 block opacity-20">admin_panel_settings</span>
            <p className="font-bold text-base">لا توجد أدوار بعد</p>
            <p className="text-sm mt-1">ابدأ بإنشاء أول دور للنظام</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {roles.map((role) => {
            const count = enabledCount(role.permissions);
            const pct = Math.round((count / ALL_PERMISSIONS.length) * 100);
            const activeGroups = PERMISSION_GROUPS.map((g) => ({
              ...g,
              count: g.permissions.filter((p) => role.permissions[p.key]).length,
            })).filter((g) => g.count > 0);

            return (
              <div
                key={role.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col overflow-hidden"
              >
                {/* Card top accent stripe using role color */}
                <div className={`h-1.5 w-full ${role.color.split(' ')[0].replace('bg-', 'bg-').replace('100', '400').replace('900/30', '500')}`} />

                {/* Card body */}
                <div className="flex-1 p-5 space-y-4">
                  {/* Name + count */}
                  <div className="flex items-start justify-between gap-3">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-black ${role.color}`}>
                      <span className="material-icons-round text-[15px]">shield</span>
                      {role.name}
                    </span>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-black text-slate-800 dark:text-white leading-tight">{count}</p>
                      <p className="text-[10px] font-bold text-slate-400 leading-tight">/ {ALL_PERMISSIONS.length} صلاحية</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400">نسبة الصلاحيات</span>
                      <span className="text-[11px] font-black text-primary">{pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-700"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Permission group tags */}
                  <div className="flex flex-wrap gap-1.5">
                    {activeGroups.slice(0, 6).map((g) => (
                      <span
                        key={g.key}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                      >
                        {g.label}
                        <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[9px] font-black text-slate-600 dark:text-slate-300">
                          {g.count}
                        </span>
                      </span>
                    ))}
                    {activeGroups.length > 6 && (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-primary/10 text-primary">
                        +{activeGroups.length - 6}
                      </span>
                    )}
                    {activeGroups.length === 0 && (
                      <span className="text-[11px] text-slate-400 italic">لا توجد صلاحيات مفعلة</span>
                    )}
                  </div>
                </div>

                {/* Card footer */}
                <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
                  {can('roles.manage') && (
                    <button
                      onClick={() => openEdit(role)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                    >
                      <span className="material-icons-round text-sm">edit</span>
                      تعديل الصلاحيات
                    </button>
                  )}
                  {role.id !== userRoleId && can('roles.manage') && (
                    <button
                      onClick={() => setDeleteConfirmId(role.id!)}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-transparent hover:border-rose-200 dark:hover:border-rose-800 transition-all"
                      title="حذف الدور"
                    >
                      <span className="material-icons-round text-[18px]">delete_outline</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Edit / Create Modal ── */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
          onClick={closeModal}
        >
          <div
            className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl border border-slate-200 dark:border-slate-800 my-8 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                  <span className="material-icons-round text-primary text-lg">
                    {editingRole ? 'edit' : 'add_moderator'}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800 dark:text-white">
                    {editingRole ? `تعديل: ${editingRole.name}` : 'إنشاء دور جديد'}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    {enabledCount(editPerms)} / {ALL_PERMISSIONS.length} صلاحية مفعلة
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
              >
                <span className="material-icons-round text-lg">close</span>
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-5">
              {/* Name + color row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-slate-600 dark:text-slate-400">اسم الدور *</label>
                  <input
                    className="w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-xl text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="مثال: مدير الإنتاج"
                    autoFocus
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
                          editColor === opt.value ? 'ring-2 ring-primary scale-105 shadow-sm' : 'opacity-60 hover:opacity-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Save message */}
              {saveMsg && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold ${saveMsg.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'}`}>
                  <span className="material-icons-round text-base">{saveMsg.type === 'success' ? 'check_circle' : 'error'}</span>
                  <p className="flex-1">{saveMsg.text}</p>
                  <button onClick={() => setSaveMsg(null)}>
                    <span className="material-icons-round text-base">close</span>
                  </button>
                </div>
              )}

              {/* Permission groups */}
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pl-1">
                {PERMISSION_GROUPS.map((group) => {
                  const allEnabled = group.permissions.every((p) => editPerms[p.key]);
                  const someEnabled = group.permissions.some((p) => editPerms[p.key]);
                  const groupCount = group.permissions.filter((p) => editPerms[p.key]).length;
                  return (
                    <div key={group.key} className="bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                      {/* Group header */}
                      <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={allEnabled}
                          ref={(el) => { if (el) el.indeterminate = someEnabled && !allEnabled; }}
                          onChange={() => toggleGroup(group.key)}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                        />
                        <span className="flex-1 text-sm font-bold text-slate-700 dark:text-slate-200">{group.label}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${groupCount > 0 ? 'bg-primary/10 text-primary' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                          {groupCount}/{group.permissions.length}
                        </span>
                      </label>
                      {/* Group permissions */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 px-4 pb-3">
                        {group.permissions.map((perm) => (
                          <label
                            key={perm.key}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-xs font-medium ${
                              editPerms[perm.key]
                                ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                                : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700/60'
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
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 rounded-b-2xl">
              <span className="text-xs text-slate-400 font-bold">
                {enabledCount(editPerms)} / {ALL_PERMISSIONS.length} صلاحية مفعلة
              </span>
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={closeModal}>إلغاء</Button>
                <Button variant="primary" onClick={handleSave} disabled={saving || !editName.trim()}>
                  {saving && <span className="material-icons-round animate-spin text-sm">refresh</span>}
                  <span className="material-icons-round text-sm">save</span>
                  {editingRole ? 'حفظ التعديلات' : 'إنشاء الدور'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 p-6 text-center animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-rose-500 text-3xl">delete_forever</span>
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد حذف الدور</h3>
            <p className="text-sm text-slate-500 mb-6">هل أنت متأكد من حذف هذا الدور؟ تأكد من عدم وجود مستخدمين مرتبطين به.</p>
            <div className="flex items-center justify-center gap-3">
              <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>إلغاء</Button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2.5 rounded-xl font-bold text-sm bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/20 transition-all flex items-center gap-2"
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
