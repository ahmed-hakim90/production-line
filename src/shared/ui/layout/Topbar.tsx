import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCurrentRole } from '@/utils/permissions';
import { NotificationBell } from '@/components/NotificationBell';
import { TasksNavButton } from '@/components/background-jobs/JobsPanel';
import { useSidebar } from './useSidebar';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface TopbarProps {
  onMenuToggle: () => void;
  onSidebarCollapseToggle: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onMenuToggle, onSidebarCollapseToggle }) => {
  const navigate = useNavigate();
  const { isReadOnly } = useCurrentRole();
  const { collapsed } = useSidebar();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const isStandalone = () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      ((window.navigator as Navigator & { standalone?: boolean }).standalone === true);

    setIsInstalled(isStandalone());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') setIsInstalled(true);
    setDeferredPrompt(null);
  };

  const handleRefreshClick = useCallback(() => {
    setRefreshing(true);
    window.location.reload();
  }, []);

  return (
    <header className="h-16 sm:h-20 bg-[var(--color-card)]/90 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 flex items-center justify-between gap-3 border-b border-[var(--color-border)]">
      <button
        onClick={onMenuToggle}
        className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors lg:hidden shrink-0"
      >
        <span className="material-icons-round text-2xl">menu</span>
      </button>

      <button
        onClick={onSidebarCollapseToggle}
        className="hidden lg:inline-flex p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors shrink-0"
        title={collapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
      >
        <span className={`material-icons-round text-xl transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}>
          keyboard_double_arrow_right
        </span>
      </button>

      <div className="min-w-0 cursor-pointer" onClick={() => navigate('/')}>
        <h1 className="font-bold text-xl tracking-tight text-primary hover:opacity-80 transition-opacity">
          مؤسسة المغربي
        </h1>
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">نظام إدارة الإنتاج</p>
      </div>

      <div className="flex items-center gap-2 sm:gap-5 shrink-0">
        {!isInstalled && deferredPrompt && (
          <button
            onClick={handleInstallClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 transition-colors"
            title="تثبيت التطبيق"
          >
            <span className="material-icons-round text-sm">download</span>
            <span className="hidden sm:inline">Install App</span>
            <span className="sm:hidden">تثبيت</span>
          </button>
        )}
        {isReadOnly && (
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <span className="material-icons-round text-sm">lock</span>
            قراءة فقط
          </span>
        )}
        <button
          onClick={handleRefreshClick}
          disabled={refreshing}
          className="inline-flex items-center justify-center p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          title="تحديث كامل للمتصفح"
        >
          <span className={`material-icons-round ${refreshing ? 'animate-spin text-primary' : ''}`}>
            refresh
          </span>
        </button>
        <TasksNavButton />
        <NotificationBell />
        <div className="hidden md:block h-8 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1" />
        <div className="hidden md:flex flex-col items-end">
          <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">التاريخ</span>
          <div className="flex items-center gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">
            <span>{new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <span className="material-icons-round text-primary text-sm">calendar_today</span>
          </div>
        </div>
      </div>
    </header>
  );
};
