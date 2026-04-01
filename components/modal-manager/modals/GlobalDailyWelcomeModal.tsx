import React from 'react';
import { Check, Sparkles } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { useTranslation } from 'react-i18next';

const getGreetingKey = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'modalManager.dailyWelcome.morningGreeting';
  if (hour < 18) return 'modalManager.dailyWelcome.eveningGreeting';
  return 'modalManager.dailyWelcome.eveningGreeting';
};

export const GlobalDailyWelcomeModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close } = useManagedModalController(MODAL_KEYS.DAILY_WELCOME);
  const userDisplayName = useAppStore((s) => s.userDisplayName || '');

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/45 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={close}
    >
      <div
        className="bg-[var(--color-card)] rounded-[var(--border-radius-xl)] shadow-2xl w-full max-w-lg border border-[var(--color-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center gap-3">
          <div className="w-10 h-10 rounded-[var(--border-radius-lg)] bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles size={18} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--color-text)]">
              {t(getGreetingKey())}
              {userDisplayName ? `${t('modalManager.shared.listSeparator')}${userDisplayName}` : ''}
            </h3>
            <p className="text-sm text-[var(--color-text-muted)]">{t('modalManager.dailyWelcome.subtitle')}</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-2">
          <p className="text-sm text-[var(--color-text)] leading-7">
            {t('modalManager.dailyWelcome.message')}
          </p>
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-end">
          <button className="btn btn-primary" onClick={close}>
            <Check size={16} />
            {t('modalManager.dailyWelcome.continue')}
          </button>
        </div>
      </div>
    </div>
  );
};

