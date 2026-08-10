import React from 'react';
import { Check, Sparkles } from 'lucide-react';
import { Button } from '../../UI';
import { useAppStore } from '../../../store/useAppStore';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';
import { ManagedModalPortal } from '../ManagedModalPortal';
import { useTranslation } from 'react-i18next';
import type { AppNotification } from '@/types';

const getGreetingKey = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'modalManager.dailyWelcome.morningGreeting';
  if (hour < 18) return 'modalManager.dailyWelcome.eveningGreeting';
  return 'modalManager.dailyWelcome.eveningGreeting';
};

export const GlobalDailyWelcomeModal: React.FC = () => {
  const { t } = useTranslation();
  const { isOpen, close, payload } = useManagedModalController(MODAL_KEYS.DAILY_WELCOME);
  const userDisplayName = useAppStore((s) => s.userDisplayName || '');
  const notification = (payload?.notification as AppNotification | undefined) || undefined;
  const isNotificationMode = payload?.source === 'notification' && Boolean(notification);

  if (!isOpen) return null;

  return (
    <ManagedModalPortal>
    <div
      className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={close}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[var(--border-radius-xl)] border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:rounded-[var(--border-radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-center gap-3">
          <div className="w-10 h-10 rounded-[var(--border-radius-lg)] bg-primary/10 text-primary flex items-center justify-center">
            <Sparkles size={18} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[var(--color-text)]">
              {isNotificationMode
                ? (notification?.title || t('modalManager.dailyWelcome.notification.defaultTitle'))
                : (
                  <>
                    {t(getGreetingKey())}
                    {userDisplayName ? `${t('modalManager.shared.listSeparator')}${userDisplayName}` : ''}
                  </>
                )}
            </h3>
            {!isNotificationMode && (
              <p className="text-sm text-[var(--color-text-muted)]">{t('modalManager.dailyWelcome.subtitle')}</p>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {isNotificationMode ? (
            <>
              {userDisplayName && (
                <p className="text-sm text-[var(--color-text-muted)]">
                  {t('modalManager.dailyWelcome.notification.recipient', { name: userDisplayName })}
                </p>
              )}
              <p className="text-sm leading-7 text-[var(--color-text)]">
                {notification?.message}
              </p>
            </>
          ) : (
            <p className="text-sm leading-7 text-[var(--color-text)]">
              {t('modalManager.dailyWelcome.message')}
            </p>
          )}
        </div>

        <div className="flex shrink-0 justify-end border-t border-[var(--color-border)] px-4 py-3 sm:px-6 sm:py-4">
          <Button variant="primary" onClick={close} tone="approve">
            <Check size={16} />
            {t('modalManager.dailyWelcome.continue')}
          </Button>
        </div>
      </div>
    </div>
    </ManagedModalPortal>
  );
};
