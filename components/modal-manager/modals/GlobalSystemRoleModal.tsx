import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Pencil, Save, ShieldPlus, X } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import {
  usePermission,
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
} from '../../../utils/permissions';
import type { FirestoreRole } from '../../../types';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { useTranslation } from 'react-i18next';

const COLOR_OPTIONS = [
  { key: 'red', value: 'bg-rose-100 text-rose-700' },
  { key: 'blue', value: 'bg-blue-100 text-blue-700' },
  { key: 'orange', value: 'bg-amber-100 text-amber-700' },
  { key: 'green', value: 'bg-emerald-100 text-emerald-700' },
  { key: 'purple', value: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  { key: 'pink', value: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' },
  { key: 'cyan', value: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  { key: 'gray', value: 'bg-[#f0f2f5] text-[var(--color-text)]/30' },
];

type RoleModalPayload = {
  role?: FirestoreRole;
};

const buildEmptyPerms = (): Record<string, boolean> => {
  const obj: Record<string, boolean> = {};
  ALL_PERMISSIONS.forEach((p) => {
    obj[p] = false;
  });
  return obj;
};

export const GlobalSystemRoleModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.SYSTEM_ROLES_CREATE);
  const createRole = useAppStore((s) => s.createRole);
  const updateRole = useAppStore((s) => s.updateRole);
  const { can } = usePermission();

  const [editingRole, setEditingRole] = useState<FirestoreRole | null>(null);
  const [editPerms, setEditPerms] = useState<Record<string, boolean>>({});
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(COLOR_OPTIONS[0].value);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const modalPayload = payload as RoleModalPayload | undefined;
  const enabledCount = useMemo(
    () => Object.values(editPerms).filter(Boolean).length,
    [editPerms],
  );

  useEffect(() => {
    if (!isOpen) return;
    const role = modalPayload?.role || null;
    setEditingRole(role);
    if (role) {
      setEditPerms({ ...buildEmptyPerms(), ...role.permissions });
      setEditName(role.name || '');
      setEditColor(role.color || COLOR_OPTIONS[0].value);
    } else {
      setEditPerms(buildEmptyPerms());
      setEditName('');
      setEditColor(COLOR_OPTIONS[0].value);
    }
    setSaveMsg(null);
  }, [isOpen, modalPayload]);

  if (!isOpen || !can('roles.manage')) return null;

  const handleClose = () => {
    if (saving) return;
    setSaveMsg(null);
    close();
  };

  const togglePerm = (key: string) => {
    setEditPerms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleGroup = (groupKey: string) => {
    const group = PERMISSION_GROUPS.find((g) => g.key === groupKey);
    if (!group) return;
    const allEnabled = group.permissions.every((p) => editPerms[p.key]);
    setEditPerms((prev) => {
      const next = { ...prev };
      group.permissions.forEach((p) => {
        next[p.key] = !allEnabled;
      });
      return next;
    });
  };

  const handleSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const data = { name: editName.trim(), color: editColor, permissions: editPerms };
      if (editingRole?.id) {
        await updateRole(editingRole.id, data);
        setSaveMsg({ type: 'success', text: t('modalManager.systemRole.updateSuccess') });
      } else {
        await createRole(data);
        setSaveMsg({ type: 'success', text: t('modalManager.systemRole.createSuccess') });
      }
    } catch {
      setSaveMsg({ type: 'error', text: t('modalManager.systemRole.saveError') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
      onClick={handleClose}
    >
      <div
        className="relative bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-[98vw] sm:w-[95vw] max-w-3xl border border-[var(--color-border)] my-4 sm:my-8 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-[var(--border-radius-lg)] flex items-center justify-center">
              {editingRole ? <Pencil size={18} className="text-primary" /> : <ShieldPlus size={18} className="text-primary" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text)]">
                {editingRole ? t('modalManager.systemRole.editTitle', { name: editingRole.name }) : t('modalManager.systemRole.createTitle')}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] font-medium">
                {t('modalManager.systemRole.enabledPermissionsCount', { enabled: enabledCount, total: ALL_PERMISSIONS.length })}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-[var(--border-radius-lg)] text-[var(--color-text-muted)] hover:text-slate-600 hover:bg-[#f0f2f5] transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.systemRole.roleNameRequired')}</label>
              <input
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-lg)] text-sm focus:border-primary focus:ring-2 focus:ring-primary/20 p-3.5 outline-none font-medium transition-all"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('modalManager.systemRole.roleNamePlaceholder')}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.systemRole.color')}</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setEditColor(opt.value)}
                    className={`px-3 py-1.5 rounded-[var(--border-radius-base)] text-[11px] font-bold transition-all ${opt.value} ${
                      editColor === opt.value ? 'ring-2 ring-primary scale-105' : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    {t(`modalManager.systemRole.colors.${opt.key}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {saveMsg && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-[var(--border-radius-lg)] text-sm font-bold ${saveMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
              {saveMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <p className="flex-1">{saveMsg.text}</p>
              <button onClick={() => setSaveMsg(null)}>
                <X size={16} />
              </button>
            </div>
          )}

          <div className="space-y-3 max-h-[50vh] overflow-y-auto pl-1">
            {PERMISSION_GROUPS.map((group) => {
              const allEnabled = group.permissions.every((p) => editPerms[p.key]);
              const someEnabled = group.permissions.some((p) => editPerms[p.key]);
              const groupCount = group.permissions.filter((p) => editPerms[p.key]).length;
              return (
                <div key={group.key} className="bg-[#f8f9fa]/60 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] overflow-hidden">
                  <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#f0f2f5]/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={allEnabled}
                      ref={(el) => {
                        if (el) el.indeterminate = someEnabled && !allEnabled;
                      }}
                      onChange={() => toggleGroup(group.key)}
                      className="w-4 h-4 rounded border-[var(--color-border)] text-primary focus:ring-primary/20"
                    />
                    <span className="flex-1 text-sm font-bold text-[var(--color-text)]">{group.label}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${groupCount > 0 ? 'bg-primary/10 text-primary' : 'bg-slate-200 text-slate-400'}`}>
                      {groupCount}/{group.permissions.length}
                    </span>
                  </label>
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

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-[var(--color-border)] bg-[#f8f9fa] shrink-0">
          <span className="text-xs text-[var(--color-text-muted)] font-bold">
            {t('modalManager.systemRole.enabledPermissionsCount', { enabled: enabledCount, total: ALL_PERMISSIONS.length })}
          </span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button className="btn btn-secondary w-full sm:w-auto" onClick={handleClose}>{t('ui.cancel')}</button>
            <button
              className="btn btn-primary w-full sm:w-auto"
              onClick={handleSave}
              disabled={saving || !editName.trim()}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {editingRole ? t('modalManager.systemRole.saveChanges') : t('modalManager.systemRole.createRole')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

