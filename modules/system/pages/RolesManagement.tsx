import React, { useState } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { Card } from '../components/UI';
import {
  usePermission,
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
} from '../../../utils/permissions';
import { useGlobalModalManager } from '../../../components/modal-manager/GlobalModalManager';
import { MODAL_KEYS } from '../../../components/modal-manager/modalKeys';

export const RolesManagement: React.FC = () => {
  const roles = useAppStore((s) => s.roles);
  const deleteRole = useAppStore((s) => s.deleteRole);
  const userRoleId = useAppStore((s) => s.userRoleId);
  const { can } = usePermission();
  const { openModal } = useGlobalModalManager();

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    await deleteRole(id);
    setDeleteConfirmId(null);
  };

  const enabledCount = (perms: Record<string, boolean>) => Object.values(perms).filter(Boolean).length;

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
              onClick={() => openModal(MODAL_KEYS.SYSTEM_ROLES_CREATE)}
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
                      onClick={() => openModal(MODAL_KEYS.SYSTEM_ROLES_CREATE, { role })}
                      data-modal-key={MODAL_KEYS.SYSTEM_ROLES_CREATE}
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
