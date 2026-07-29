import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Badge, Button, SearchableSelect } from '../../UI';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import type { FirestoreRole } from '../../../types';
import { useTranslation } from 'react-i18next';

type EmployeeOption = { value: string; label: string };
type ManageUserPayload = {
  row: {
    user: {
      id?: string;
      email: string;
      displayName: string;
      roleId: string;
      isActive: boolean;
    };
    employee: { id?: string } | null;
  };
  roles: FirestoreRole[];
  employeeOptions: EmployeeOption[];
  onUpdateRole: (roleId: string) => Promise<void>;
  onLinkEmployee: (employeeId: string) => Promise<void>;
  onUnlinkEmployee: () => Promise<void>;
  onToggleActive: () => Promise<void>;
  onApproveAccess: (roleId: string, employeeId: string) => Promise<void>;
  onUpdateCredentials: (input: { email?: string; password?: string }) => Promise<void>;
  onHardDelete: () => Promise<void>;
};

type Message = { type: 'success' | 'error'; text: string } | null;

export const GlobalManageUserModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.SYSTEM_USERS_MANAGE);
  const [roleTargetId, setRoleTargetId] = useState('');
  const [employeeTargetId, setEmployeeTargetId] = useState('');
  const [emailTarget, setEmailTarget] = useState('');
  const [passwordTarget, setPasswordTarget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const modalPayload = payload as ManageUserPayload | undefined;
  const row = modalPayload?.row;
  const roles = modalPayload?.roles ?? [];
  const employeeOptions = modalPayload?.employeeOptions ?? [];

  useEffect(() => {
    if (!isOpen || !row) return;
    setRoleTargetId(String(row.user.roleId || ''));
    setEmployeeTargetId(String(row.employee?.id || ''));
    setEmailTarget(String(row.user.email || ''));
    setPasswordTarget('');
    setMessage(null);
  }, [isOpen, row]);

  const title = useMemo(() => {
    if (!row) return t('modalManager.manageUser.title');
    return t('modalManager.manageUser.titleWithEmail', { email: row.user.email });
  }, [row, t]);

  if (!isOpen || !row || !modalPayload) return null;

  const run = async (fn: () => Promise<void>, successText?: string, closeAfter?: boolean) => {
    setSubmitting(true);
    setMessage(null);
    try {
      await fn();
      if (successText) setMessage({ type: 'success', text: successText });
      if (closeAfter) close();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || t('modalManager.manageUser.unexpectedError') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !submitting && close()}>
      <div
        className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-2xl border border-[var(--color-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">{title}</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">{row.user.displayName || '—'}</p>
          </div>
          <button onClick={close} className="text-[var(--color-text-muted)] hover:text-slate-600 transition-colors" disabled={submitting}>
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {message && (
            <div className={`px-3 py-2 rounded-[var(--border-radius-base)] text-sm border ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
              {message.text}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--color-text)]">{t('modalManager.manageUser.accountStatus')}</span>
            <Badge variant={row.user.isActive ? 'success' : 'warning'}>
              {row.user.isActive ? t('modalManager.manageUser.statusActive') : t('modalManager.manageUser.statusPendingApproval')}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.manageUser.role')}</label>
              <select
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)]"
                value={roleTargetId}
                onChange={(e) => setRoleTargetId(e.target.value)}
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.manageUser.linkedEmployee')}</label>
              <SearchableSelect
                options={employeeOptions}
                value={employeeTargetId}
                onChange={setEmployeeTargetId}
                placeholder={t('modalManager.manageUser.selectEmployee')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.manageUser.email')}</label>
              <input
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)]"
                value={emailTarget}
                onChange={(e) => setEmailTarget(e.target.value)}
                placeholder="example@company.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.manageUser.newPasswordOptional')}</label>
              <input
                type="password"
                className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)]"
                value={passwordTarget}
                onChange={(e) => setPasswordTarget(e.target.value)}
                placeholder={t('modalManager.manageUser.leaveBlankPasswordHint')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Button
              onClick={() => void run(() => modalPayload.onUpdateRole(roleTargetId), t('modalManager.manageUser.updateRoleSuccess'))}
              disabled={submitting || !roleTargetId}
            >
              {t('modalManager.manageUser.saveRole')}
            </Button>
            <Button
              onClick={() => void run(() => modalPayload.onLinkEmployee(employeeTargetId), t('modalManager.manageUser.linkEmployeeSuccess'))}
              disabled={submitting || !employeeTargetId}
            >
              {t('modalManager.manageUser.linkEmployee')}
            </Button>
            <Button
              onClick={() => void run(() => modalPayload.onUnlinkEmployee(), t('modalManager.manageUser.unlinkSuccess'))}
              disabled={submitting || !row.employee?.id}
            >
              {t('modalManager.manageUser.unlink')}
            </Button>
            <Button
              onClick={() =>
                void run(
                  () =>
                    modalPayload.onUpdateCredentials({
                      email: emailTarget,
                      password: passwordTarget,
                    }),
                  t('modalManager.manageUser.updateCredentialsSuccess'),
                )
              }
              disabled={submitting || (!emailTarget.trim() && !passwordTarget.trim())}
            >
              {t('modalManager.manageUser.updateEmailPassword')}
            </Button>
            {!row.user.isActive && (
              <Button
                onClick={() =>
                  void run(
                    () => modalPayload.onApproveAccess(roleTargetId, employeeTargetId),
                    t('modalManager.manageUser.approveAndActivateSuccess'),
                    true,
                  )
                }
                disabled={submitting || !roleTargetId}
              >
                {t('modalManager.manageUser.approveAndActivate')}
              </Button>
            )}
            <Button
              onClick={() => void run(() => modalPayload.onToggleActive(), undefined, true)}
              disabled={submitting}
            >
              {row.user.isActive ? t('modalManager.manageUser.disableUser') : t('modalManager.manageUser.enableUser')}
            </Button>
            <Button
              tone="delete"
              solid
              className="w-full"
              onClick={() => void run(() => modalPayload.onHardDelete(), undefined, true)}
              disabled={submitting}
            >
              {t('modalManager.manageUser.hardDelete')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
