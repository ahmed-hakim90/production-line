import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Pencil, ShieldPlus, X } from 'lucide-react';
import { Button } from '../../UI';
import { useAppStore } from '../../../store/useAppStore';
import {
  usePermission,
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
  normalizeRolePermissions,
} from '../../../utils/permissions';
import {
  getPermissionCatalogByGroup,
  PERMISSION_CRUD_LABELS,
  PERMISSION_CRUD_VERBS,
  type PermissionResource,
} from '../../../utils/permissionCatalog';
import type { FirestoreRole } from '../../../types';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
import { useTranslation } from 'react-i18next';

const COLOR_OPTIONS = [
  { key: 'red', value: 'bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]' },
  { key: 'blue', value: 'bg-[rgb(var(--color-primary)/0.1)] text-[rgb(var(--color-primary))]' },
  { key: 'orange', value: 'bg-[rgb(var(--color-warning)/0.1)] text-[rgb(var(--color-warning))]' },
  { key: 'green', value: 'bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]' },
  { key: 'purple', value: 'bg-[rgb(var(--color-secondary)/0.1)] text-[rgb(var(--color-secondary))] dark:bg-[rgb(var(--color-secondary))]/30 dark:text-[rgb(var(--color-secondary))]' },
  { key: 'pink', value: 'bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))] dark:bg-[rgb(var(--color-danger))]/30 dark:text-[rgb(var(--color-danger))]' },
  { key: 'cyan', value: 'bg-[rgb(var(--color-secondary)/0.1)] text-[rgb(var(--color-secondary))] dark:bg-[rgb(var(--color-secondary))]/30 dark:text-[rgb(var(--color-secondary))]' },
  { key: 'gray', value: 'bg-[var(--color-surface-hover)] text-[var(--color-text)]/30' },
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

function CrudCell({
  enabled,
  disabled,
  onToggle,
  label,
}: {
  enabled: boolean;
  disabled?: boolean;
  onToggle?: () => void;
  label: string;
}) {
  if (disabled || !onToggle) {
    return <span className="text-[10px] text-[var(--color-text-muted)]">—</span>;
  }
  return (
    <label className="inline-flex items-center justify-center gap-1 cursor-pointer" title={label}>
      <input
        type="checkbox"
        checked={enabled}
        onChange={onToggle}
        className="w-3.5 h-3.5 rounded border-[var(--color-border)] text-primary focus:ring-primary/20"
        aria-label={label}
      />
    </label>
  );
}

export const GlobalSystemRoleModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.SYSTEM_ROLES_CREATE);
  const createRole = useAppStore((s) => s.createRole);
  const updateRole = useAppStore((s) => s.updateRole);
  const tenantActivityPacks = useAppStore((s) => s.tenantActivityPacks);
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

  const catalogSections = useMemo(
    () => getPermissionCatalogByGroup(tenantActivityPacks),
    [tenantActivityPacks],
  );

  useEffect(() => {
    if (!isOpen) return;
    const role = modalPayload?.role || null;
    setEditingRole(role);
    if (role) {
      setEditPerms(normalizeRolePermissions({ ...buildEmptyPerms(), ...role.permissions }));
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

  const toggleResource = (resource: PermissionResource) => {
    const allEnabled = resource.allKeys.every((k) => editPerms[k]);
    setEditPerms((prev) => {
      const next = { ...prev };
      resource.allKeys.forEach((k) => {
        next[k] = !allEnabled;
      });
      return next;
    });
  };

  const handleSave = async () => {
    if (!editName.trim()) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const data = {
        name: editName.trim(),
        color: editColor,
        permissions: normalizeRolePermissions(editPerms),
      };
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
    <ManagedModalPortal>
    <div
      className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={handleClose}
    >
      <div
        className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl duration-200 animate-in fade-in zoom-in-95 sm:rounded-[var(--border-radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--border-radius-lg)] bg-primary/10">
              {editingRole ? <Pencil size={18} className="text-primary" /> : <ShieldPlus size={18} className="text-primary" />}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-[var(--color-text)]">
                {editingRole ? t('modalManager.systemRole.editTitle', { name: editingRole.name }) : t('modalManager.systemRole.createTitle')}
              </h3>
              <p className="text-xs font-medium text-[var(--color-text-muted)]">
                محرك الصلاحيات: عرض · إضافة · تعديل · حذف · إجراءات لكل صفحة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--border-radius-lg)] text-[var(--color-text-muted)] transition-all hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
            aria-label={t('ui.close')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-muted)]">{t('modalManager.systemRole.roleNameRequired')}</label>
              <input
                className="w-full rounded-[var(--border-radius-lg)] border border-[var(--color-border)] p-3.5 text-sm font-medium outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
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
                    type="button"
                    onClick={() => setEditColor(opt.value)}
                    className={`rounded-[var(--border-radius-base)] px-3 py-1.5 text-[11px] font-bold transition-all ${opt.value} ${
                      editColor === opt.value ? 'scale-105 ring-2 ring-primary' : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    {t(`modalManager.systemRole.colors.${opt.key}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {saveMsg && (
            <div className={`flex items-center gap-2 rounded-[var(--border-radius-lg)] border px-4 py-3 text-sm font-bold ${saveMsg.type === 'success' ? 'border-[rgb(var(--color-success)/0.25)] bg-[rgb(var(--color-success)/0.1)] text-[rgb(var(--color-success))]' : 'border-[rgb(var(--color-danger)/0.25)] bg-[rgb(var(--color-danger)/0.1)] text-[rgb(var(--color-danger))]'}`}>
              {saveMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <p className="min-w-0 flex-1 break-words">{saveMsg.text}</p>
              <button type="button" onClick={() => setSaveMsg(null)}>
                <X size={16} />
              </button>
            </div>
          )}

          <div className="space-y-3">
            {catalogSections.map(({ group, resources }) => {
              const allEnabled = group.permissions.every((p) => editPerms[p.key]);
              const someEnabled = group.permissions.some((p) => editPerms[p.key]);
              const groupCount = group.permissions.filter((p) => editPerms[p.key]).length;
              return (
                <div key={group.key} className="overflow-hidden rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)]/60">
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-surface-hover)]/50">
                    <input
                      type="checkbox"
                      checked={allEnabled}
                      ref={(el) => {
                        if (el) el.indeterminate = someEnabled && !allEnabled;
                      }}
                      onChange={() => toggleGroup(group.key)}
                      className="h-4 w-4 rounded border-[var(--color-border)] text-primary focus:ring-primary/20"
                    />
                    <span className="flex-1 text-sm font-bold text-[var(--color-text)]">{group.label}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${groupCount > 0 ? 'bg-primary/10 text-primary' : 'bg-[var(--color-border)] text-[var(--color-text-muted)]'}`}>
                      {groupCount}/{group.permissions.length}
                    </span>
                  </label>

                  <div className="-mx-0 overflow-x-auto px-2 pb-3">
                    <table className="w-full min-w-[560px] text-xs sm:min-w-[640px]">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                          <th className="px-2 py-2 text-right font-bold">الصفحة / المورد</th>
                          {PERMISSION_CRUD_VERBS.map((verb) => (
                            <th key={verb} className="w-14 px-1 py-2 text-center font-bold">
                              {PERMISSION_CRUD_LABELS[verb]}
                            </th>
                          ))}
                          <th className="px-2 py-2 text-right font-bold">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resources.map((resource) => {
                          const rowAll = resource.allKeys.every((k) => editPerms[k]);
                          return (
                            <tr key={resource.id} className="border-b border-[var(--color-border)]/60 last:border-0">
                              <td className="px-2 py-2">
                                <label className="flex cursor-pointer items-center gap-2 font-bold text-[var(--color-text)]">
                                  <input
                                    type="checkbox"
                                    checked={rowAll}
                                    onChange={() => toggleResource(resource)}
                                    className="h-3.5 w-3.5 rounded border-[var(--color-border)] text-primary"
                                  />
                                  {resource.label}
                                </label>
                              </td>
                              {PERMISSION_CRUD_VERBS.map((verb) => {
                                const item = resource.crud[verb];
                                return (
                                  <td key={verb} className="px-1 py-2 text-center">
                                    <CrudCell
                                      enabled={Boolean(item && editPerms[item.key])}
                                      disabled={!item}
                                      onToggle={item ? () => togglePerm(item.key) : undefined}
                                      label={`${PERMISSION_CRUD_LABELS[verb]} — ${resource.label}`}
                                    />
                                  </td>
                                );
                              })}
                              <td className="px-2 py-2">
                                {resource.actions.length === 0 ? (
                                  <span className="text-[10px] text-[var(--color-text-muted)]">—</span>
                                ) : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {resource.actions.map((action) => (
                                      <label
                                        key={action.key}
                                        className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 transition-all ${
                                          editPerms[action.key]
                                            ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                                            : 'bg-[var(--color-card)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={editPerms[action.key] || false}
                                          onChange={() => togglePerm(action.key)}
                                          className="h-3 w-3 rounded border-[var(--color-border)] text-primary"
                                        />
                                        <span className="font-medium leading-none">{action.label}</span>
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
          <span className="text-xs font-bold text-[var(--color-text-muted)]">
            {t('modalManager.systemRole.enabledPermissionsCount', { enabled: enabledCount, total: ALL_PERMISSIONS.length })}
          </span>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Button className="w-full sm:w-auto" variant="outline" onClick={handleClose} iconName="close" tone="neutral">{t('ui.cancel')}</Button>
            <Button
              className="w-full sm:w-auto"
              variant="primary"
              onClick={() => void handleSave()}
              disabled={saving || !editName.trim()}
            >
              {saving ? 'جاري...' : (editingRole ? t('modalManager.systemRole.saveChanges') : t('modalManager.systemRole.createRole'))}
            </Button>
          </div>
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
