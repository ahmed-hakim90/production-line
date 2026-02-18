import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Card, Button, Badge } from '../components/UI';
import {
  usePermission,
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
  type Permission,
} from '../utils/permissions';
import type { FirestoreRole } from '../types';

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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
    if (editingRole?.id === id) {
      setEditingRole(null);
    }
  };

  const enabledCount = (perms: Record<string, boolean>) =>
    Object.values(perms).filter(Boolean).length;

  const isEditing = editingRole !== null || showCreateModal;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white">إدارة الأدوار</h2>
          <p className="text-sm text-slate-500 font-medium">إنشاء وتعديل الأدوار والصلاحيات الديناميكية.</p>
        </div>
        {can("roles.manage") && (
          <Button variant="primary" onClick={openCreate}>
            <span className="material-icons-round text-sm">add</span>
            إنشاء دور جديد
          </Button>
        )}
      </div>

      <div className={`grid gap-6 ${isEditing ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
        {/* Roles List */}
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
                        <span
                          key={group.key}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        >
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

        {/* Permission Editor */}
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

              {/* Role name & color */}
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

              {/* Permission groups */}
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {PERMISSION_GROUPS.map((group) => {
                  const allEnabled = group.permissions.every((p) => editPerms[p.key]);
                  const someEnabled = group.permissions.some((p) => editPerms[p.key]);
                  return (
                    <div
                      key={group.key}
                      className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700"
                    >
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

              {/* Actions */}
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
    </div>
  );
};
