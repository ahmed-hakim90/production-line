import React, { useEffect, useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import { SearchableSelect } from '../../UI';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
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

type Message = { type: 'success' | 'error'; text: string } | null;

export const GlobalCreateSystemUserModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, payload, close } = useManagedModalController(MODAL_KEYS.SYSTEM_USERS_CREATE);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<Message>(null);

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
    setMessage(null);
  }, [isOpen, roles]);

  if (!isOpen || !modalPayload) return null;

  const handleSubmit = async () => {
    if (!displayName.trim() || !email.trim() || !password.trim() || !roleId) {
      setMessage({ type: 'error', text: t('modalManager.createSystemUser.requiredFieldsError') });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      await modalPayload.onSubmit({
        displayName: displayName.trim(),
        email: email.trim(),
        password,
        roleId,
        employeeId: employeeId || undefined,
      });
      setMessage({ type: 'success', text: t('modalManager.createSystemUser.createSuccess') });
      close();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || t('modalManager.createSystemUser.createError') });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => !submitting && close()}>
      <div className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-2xl border border-[var(--color-border)]" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h3 className="text-lg font-bold">{t('modalManager.createSystemUser.title')}</h3>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)]" placeholder={t('modalManager.createSystemUser.namePlaceholder')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)]" placeholder={t('modalManager.createSystemUser.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)]" placeholder={t('modalManager.createSystemUser.passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} />
            <select className="w-full border border-[var(--color-border)] rounded-[var(--border-radius-base)] px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)]" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-muted)] block mb-1">{t('modalManager.createSystemUser.linkEmployeeOptional')}</label>
            <SearchableSelect
              options={employeeOptions}
              value={employeeId}
              onChange={setEmployeeId}
              placeholder={t('modalManager.createSystemUser.searchEmployee')}
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
          <button className="btn btn-secondary" onClick={close} disabled={submitting}>{t('ui.cancel')}</button>
          <button className="btn btn-primary" onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
            {submitting ? t('modalManager.createSystemUser.creating') : t('modalManager.createSystemUser.create')}
          </button>
        </div>
      </div>
    </div>
  );
};

