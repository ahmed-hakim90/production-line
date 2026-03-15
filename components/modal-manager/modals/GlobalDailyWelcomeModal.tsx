import React from 'react';
import { Check, Sparkles } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { useManagedModalController } from '../GlobalModalManager';
import { MODAL_KEYS } from '../modalKeys';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'صباح الخير';
  if (hour < 18) return 'مساء الخير';
  return 'مساء الخير';
};

export const GlobalDailyWelcomeModal: React.FC = () => {
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
              {getGreeting()}
              {userDisplayName ? `، ${userDisplayName}` : ''}
            </h3>
            <p className="text-sm text-[var(--color-text-muted)]">أهلا بك في نظام Hakimo ERP.</p>
          </div>
        </div>

        <div className="px-6 py-5 space-y-2">
          <p className="text-sm text-[var(--color-text)] leading-7">
            نتمنى لك يوم عمل موفق. يمكنك الآن متابعة التقارير والمهام والإشعارات اليومية بسهولة.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-end">
          <button className="btn btn-primary" onClick={close}>
            <Check size={16} />
            متابعة
          </button>
        </div>
      </div>
    </div>
  );
};

