import React, { useEffect, useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button, SearchableSelect } from '../../UI';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
import type { FirestoreRole } from '../../../types';
import { useTranslation } from 'react-i18next';

type EmployeeOption = { value: string; label: string };
type CreateUserPayload = {
  roles: FirestoreRole[];
  employeeOptions: EmployeeOption[];
  onSubmit: (input: {
    displayName: string;
    email: string;
    password: string;
    roleId: string;
    employeeId?: string;
  }) => Promise<void>;
};

const toUserSafeError = (error: unknown, fallback: string): string => {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  if (/firebase|firestore|https?:\/\/|stack|permission-denied|internal/i.test(trimmed)) {
    return fallback;
  }
  return trimmed;
};

export const GlobalCreateSystemUserModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.SYSTEM_USERS_CREATE);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const modalPayload = payload as CreateUserPayload | undefined;
  const roles = modalPayload?.roles ?? [];
  const employeeOptions = modalPayload?.employeeOptions ?? [];

  useEffect(() => {
    if (!isOpen) return;
    setDisplayName('');
    setEmail('');
    setPassword('');
    setEmployeeId('');
    setRoleId(String(roles[0]?.id || ''));
  }, [isOpen, roles]);

  if (!isOpen || !modalPayload) return null;

  const handleSubmit = async () => {
    if (!displayName.trim() || !email.trim() || !password.trim() || !roleId) {
      toast.error(t('modalManager.createSystemUser.requiredFieldsError'));
      return;
    }
    setSubmitting(true);
    try {
      await modalPayload.onSubmit({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
        roleId,
        employeeId: employeeId || undefined,
      });
      toast.success(t('modalManager.createSystemUser.createSuccess'));
      close();
    } catch (error: unknown) {
      toast.error(toUserSafeError(error, t('modalManager.createSystemUser.createError')));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ManagedModalPortal>
    <div
      className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => !submitting && close()}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:rounded-[var(--border-radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-6 sm:py-4">
          <h3 className="min-w-0 truncate text-base font-bold sm:text-lg">{t('modalManager.createSystemUser.title')}</h3>
          <button
            onClick={close}
            className="shrink-0 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            disabled={submitting}
            aria-label={t('ui.close')}
          >
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input className="w-full rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)]" placeholder={t('modalManager.createSystemUser.namePlaceholder')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <input className="w-full rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)]" placeholder={t('modalManager.createSystemUser.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            <input type="password" className="w-full rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)]" placeholder={t('modalManager.createSystemUser.passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <select className="w-full rounded-[var(--border-radius-base)] border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-text)]" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-xs font-bold text-[var(--color-text-muted)]">{t('modalManager.createSystemUser.linkEmployeeOptional')}</label>
            <SearchableSelect
              options={employeeOptions}
              value={employeeId}
              onChange={setEmployeeId}
              placeholder={t('modalManager.createSystemUser.searchEmployee')}
            />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--color-border)] px-4 py-3 sm:px-6 sm:py-4">
          <Button variant="outline" onClick={close} disabled={submitting} iconName="close" tone="neutral">{t('ui.cancel')}</Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={submitting} tone="submit">
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
            {submitting ? t('modalManager.createSystemUser.creating') : t('modalManager.createSystemUser.create')}
          </Button>
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
