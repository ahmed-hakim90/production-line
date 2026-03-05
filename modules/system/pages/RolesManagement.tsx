import React, { useState, useCallback } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { Card } from '../components/UI';
import {
  usePermission,
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
} from '../../../utils/permissions';
import type { FirestoreRole } from '../../../types';
import { useRegisterModalOpener } from '../../../components/modal-manager/useRegisterModalOpener';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';

const COLOR_OPTIONS = [
  { label: 'أحمر', value: 'bg-rose-100 text-rose-700' },
  { label: 'أزرق', value: 'bg-blue-100 text-blue-700' },
  { label: 'برتقالي', value: 'bg-amber-100 text-amber-700' },
  { label: 'أخضر', value: 'bg-emerald-100 text-emerald-700' },
  { label: 'بنفسجي', value: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  { label: 'وردي', value: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' },
  { label: 'سماوي', value: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  { label: 'رمادي', value: 'bg-[#f0f2f5] text-[var(--color-text)]/30' },
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
  useRegisterModalOpener(MODAL_KEYS.SYSTEM_ROLES_CREATE, () => openCreate());

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
      <div className="erp-page-head">
        <div className="erp-page-title-block">
          <h1 className="page-title">الأدوار والصلاحيات</h1>
          <p className="page-subtitle">إدارة الأدوار والتحكم في صلاحيات المستخدمين</p>
        </div>
        {can('roles.manage') && (
          <div className="erp-page-actions">
            <button
              className="btn btn-primary"
              onClick={openCreate}
              data-modal-key={MODAL_KEYS.SYSTEM_ROLES_CREATE}
            >
              <span className="material-icons-round" style={{ fontSize: 16 }}>add</span>
              إنشاء دور جديد
            </button>
          </div>
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
                className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] border border-[var(--color-border)] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col overflow-hidden"
              >
                {/* Card top accent stripe using role color */}
                <div className={`h-1.5 w-full ${role.color.split(' ')[0].replace('bg-', 'bg-').replace('100', '400').replace('900/30', '500')}`} />

                {/* Card body */}
                <div className="flex-1 p-5 space-y-4">
                  {/* Name + count */}
                  <div className="flex items-start justify-between gap-3">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--border-radius-lg)] text-sm font-bold ${role.color}`}>
                      <span className="material-icons-round text-[15px]">shield</span>
                      {role.name}
                    </span>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-[var(--color-text)] leading-tight">{count}</p>
                      <p className="text-[10px] font-bold text-[var(--color-text-muted)] leading-tight">/ {ALL_PERMISSIONS.length} صلاحية</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400">نسبة الصلاحيات</span>
                      <span className="text-[11px] font-bold text-primary">{pct}%</span>
                    </div>
                    <div className="h-2 bg-[#f0f2f5] rounded-full overflow-hidden">
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
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[var(--border-radius-base)] text-[10px] font-bold bg-[#f0f2f5] text-[var(--color-text-muted)]"
                      >
                        {g.label}
                        <span className="w-4 h-4 rounded-full bg-slate-200 flex items-center justify-center text-[9px] font-bold text-[var(--color-text-muted)]">
                          {g.count}
                        </span>
                      </span>
                    ))}
                    {activeGroups.length > 6 && (
                      <span className="px-2 py-0.5 rounded-[var(--border-radius-base)] text-[10px] font-bold bg-primary/10 text-primary">
                        +{activeGroups.length - 6}
                      </span>
                    )}
                    {activeGroups.length === 0 && (
                      <span className="text-[11px] text-[var(--color-text-muted)] italic">لا توجد صلاحيات مفعلة</span>
                    )}
                  </div>
                </div>

                {/* Card footer */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3 border-t border-[var(--color-border)] bg-[#f8f9fa]/60/30">
                  {can('roles.manage') && (
                    <button
                      onClick={() => openEdit(role)}
                      className="w-full sm:flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-[var(--border-radius-lg)] text-xs font-bold bg-[var(--color-card)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                    >
                      <span className="material-icons-round text-sm">edit</span>
                      تعديل الصلاحيات
                    </button>
                  )}
                  {role.id !== userRoleId && can('roles.manage') && (
                    <button
                      onClick={() => setDeleteConfirmId(role.id!)}
                      className="w-full sm:w-auto p-2 rounded-[var(--border-radius-lg)] text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 border border-transparent hover:border-rose-200 dark:hover:border-rose-800 transition-all"
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
            className="relative bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[98vw] sm:w-[95vw] max-w-3xl border border-[var(--color-border)] my-4 sm:my-8 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-primary/10 rounded-[var(--border-radius-lg)] flex items-center justify-center">
                  <span className="material-icons-round text-primary text-lg">
                    {editingRole ? 'edit' : 'add_moderator'}
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--color-text)]">
                    {editingRole ? `تعديل: ${editingRole.name}` : 'إنشاء دور جديد'}
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] font-medium">
                    {enabledCount(editPerms)} / {ALL_PERMISSIONS.length} صلاحية مفعلة
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="w-8 h-8 flex items-center justify-center rounded-[var(--border-radius-lg)] text-[var(--color-text-muted)] hover:text-slate-600 hover:bg-[#f0f2f5] transition-all"
              >
                <span className="material-icons-round text-lg">close</span>
              </button>
            </div>

            {/* Modal body */}
            <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
              {/* Name + color row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">اسم الدور *</label>
                  <input
                    className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="مثال: مدير الإنتاج"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-bold text-[var(--color-text-muted)]">اللون</label>
                  <div className="flex flex-wrap gap-2">
                    {COLOR_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setEditColor(opt.value)}
                        className={`px-3 py-1.5 rounded-[var(--border-radius-base)] text-[11px] font-bold transition-all ${opt.value} ${
                          editColor === opt.value ? 'ring-2 ring-primary scale-105' : 'opacity-60 hover:opacity-100'
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
                <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${saveMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
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
                    <div key={group.key} className="bg-[#f8f9fa]/60 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] overflow-hidden">
                      {/* Group header */}
                      <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#f0f2f5]/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={allEnabled}
                          ref={(el) => { if (el) el.indeterminate = someEnabled && !allEnabled; }}
                          onChange={() => toggleGroup(group.key)}
                          className="w-4 h-4 rounded border-[var(--color-border)] text-primary focus:ring-primary/20"
                        />
                        <span className="flex-1 text-sm font-bold text-[var(--color-text)]">{group.label}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${groupCount > 0 ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-400'}`}>
                          {groupCount}/{group.permissions.length}
                        </span>
                      </label>
                      {/* Group permissions */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 px-4 pb-3">
                        {group.permissions.map((perm) => (
                          <label
                            key={perm.key}
                            className={`flex items-center gap-2 px-3 py-2 rounded-[var(--border-radius-base)] cursor-pointer transition-all text-xs font-medium ${
                              editPerms[perm.key]
                                ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                                : 'bg-[var(--color-card)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5]/60'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={editPerms[perm.key] || false}
                              onChange={() => togglePerm(perm.key)}
                              className="w-3.5 h-3.5 rounded border-[var(--color-border)] text-primary focus:ring-primary/20"
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-[var(--color-border)] bg-[#f8f9fa] shrink-0">
              <span className="text-xs text-[var(--color-text-muted)] font-bold">
                {enabledCount(editPerms)} / {ALL_PERMISSIONS.length} صلاحية مفعلة
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button className="btn btn-secondary w-full sm:w-auto" onClick={closeModal}>إلغاء</button>
                <button
                  className="btn btn-primary w-full sm:w-auto"
                  onClick={handleSave}
                  disabled={saving || !editName.trim()}
                >
                  {saving
                    ? <span className="material-icons-round animate-spin" style={{ fontSize: 15 }}>refresh</span>
                    : <span className="material-icons-round" style={{ fontSize: 15 }}>save</span>
                  }
                  {editingRole ? 'حفظ التعديلات' : 'إنشاء الدور'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirmId(null)}>
          <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[95vw] max-w-sm border border-[var(--color-border)] p-6 text-center animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-icons-round text-rose-500 text-3xl">delete_forever</span>
            </div>
            <h3 className="text-lg font-bold mb-2">تأكيد حذف الدور</h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">هل أنت متأكد من حذف هذا الدور؟ تأكد من عدم وجود مستخدمين مرتبطين به.</p>
            <div className="flex items-center justify-center gap-2">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirmId(null)}>إلغاء</button>
              <button
                className="btn"
                style={{ background: '#ef4444', color: '#fff', borderColor: '#ef4444' }}
                onClick={() => handleDelete(deleteConfirmId)}
              >
                <span className="material-icons-round" style={{ fontSize: 15 }}>delete</span>
                نعم، احذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
