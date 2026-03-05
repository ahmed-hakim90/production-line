import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCurrentRole } from '@/utils/permissions';
import { NotificationBell } from '@/components/NotificationBell';
import { TasksNavButton } from '@/components/background-jobs/JobsPanel';
import { useSidebar, useSidebarActiveRoute } from './useSidebar';
import { MENU_CONFIG } from '@/config/menu.config';
import { CommandPalette } from '@/components/CommandPalette';
import { useCommandPalette } from '@/components/useCommandPalette';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface TopbarProps {
  onMenuToggle: () => void;
  onSidebarCollapseToggle: () => void;
}

function useScrolled(threshold = 4): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > threshold);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, [threshold]);
  return scrolled;
}

export const Topbar: React.FC<TopbarProps> = ({ onMenuToggle, onSidebarCollapseToggle }) => {
  const { isReadOnly } = useCurrentRole();
  const { collapsed }  = useSidebar();
  const navigate       = useNavigate();
  const location       = useLocation();
  const scrolled       = useScrolled();

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled,    setIsInstalled]    = useState(false);
  const [refreshing,     setRefreshing]     = useState(false);

  const { isActiveItem } = useSidebarActiveRoute();
  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandPalette();

  /* Resolve breadcrumb from location */
  const breadcrumb = useMemo(() => {
    for (const group of MENU_CONFIG) {
      for (const item of group.children) {
        if (isActiveItem(item)) {
          return { group: group.label, groupIcon: group.icon, page: item.label, pageIcon: item.icon };
        }
      }
    }
    return null;
  }, [location.pathname, location.search]);

  useEffect(() => {
    const isStandalone = () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      ((window.navigator as Navigator & { standalone?: boolean }).standalone === true);
    setIsInstalled(isStandalone());

    const onBefore = (e: Event) => { e.preventDefault(); setDeferredPrompt(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setIsInstalled(true); setDeferredPrompt(null); };
    window.addEventListener('beforeinstallprompt', onBefore);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    // Keep palette from persisting as an invisible full-screen blocker across route changes.
    setCmdOpen(false);
  }, [location.pathname, location.search, setCmdOpen]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    window.location.reload();
  }, []);

  return (
    <>
      <header
        className={[
          'h-[52px] fixed top-0 left-0 right-0 z-40 shrink-0',
          collapsed ? 'lg:right-[52px]' : 'lg:right-[260px]',
          'bg-[var(--color-card)]',
          'border-b border-[var(--color-border)]',
          'px-2.5 sm:px-4 py-2 sm:py-0 flex items-center gap-1.5 sm:gap-2',
          scrolled ? 'shadow-sm' : '',
        ].join(' ')}
      >
        {/* ── LEFT: toggle + breadcrumb ── */}
        <div className="flex items-center gap-1 min-w-0 flex-1">

          {/* Mobile hamburger */}
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-1.5 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5] transition-colors shrink-0"
            aria-label="فتح القائمة"
          >
            <span className="material-icons-round text-[18px]">menu</span>
          </button>

          {/* Desktop sidebar collapse toggle */}
          <button
            onClick={onSidebarCollapseToggle}
            className="hidden lg:flex p-1.5 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5] transition-colors shrink-0"
            title={collapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
          >
            <span className={`material-icons-round text-[18px] transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}>
              keyboard_double_arrow_right
            </span>
          </button>

          {/* Breadcrumb */}
          {breadcrumb ? (
            <nav className="hidden sm:flex items-center gap-1 text-[12.5px] min-w-0">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                <span className="material-icons-round text-[13px]">{breadcrumb.groupIcon}</span>
                <span className="truncate max-w-[80px]">{breadcrumb.group}</span>
              </button>
              <span className="material-icons-round text-[12px] text-[var(--color-border)] shrink-0">chevron_left</span>
              <span className="font-semibold text-[var(--color-text)] truncate flex items-center gap-1">
                <span className="material-icons-round text-[13px] text-primary shrink-0">{breadcrumb.pageIcon}</span>
                <span>{breadcrumb.page}</span>
              </span>
            </nav>
          ) : (
            <button
              onClick={() => navigate('/')}
              className="hidden sm:flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-text)] hover:text-primary transition-colors"
            >
              <span className="material-icons-round text-[15px]">home</span>
              <span>الرئيسية</span>
            </button>
          )}

          {breadcrumb && (
            <div className="sm:hidden flex items-center gap-1 min-w-0">
              <span className="material-icons-round text-[14px] text-primary shrink-0">{breadcrumb.pageIcon}</span>
              <span className="text-[12px] font-semibold text-[var(--color-text)] truncate">{breadcrumb.page}</span>
            </div>
          )}
        </div>

        {/* ── CENTER: Awesomebar / Global Search ── */}
        <div className="flex-1 max-w-[320px] hidden md:flex">
          <button
            onClick={() => setCmdOpen(true)}
            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-[var(--border-radius-base)] bg-[#f0f2f5] border border-[var(--color-border)] text-[var(--color-text-muted)] text-[12.5px] hover:border-primary/40 hover:bg-primary/5 transition-all group"
          >
            <span className="material-icons-round text-[15px] group-hover:text-primary transition-colors">search</span>
            <span className="flex-1 text-start">البحث في النظام...</span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--color-card)] border border-[var(--color-border)]">
              Ctrl K
            </kbd>
          </button>
        </div>

        {/* ── RIGHT: actions ── */}
        <div className="flex items-center gap-0.5 shrink-0">

          {/* Mobile search icon */}
          <button
            onClick={() => setCmdOpen(true)}
            className="md:hidden p-1.5 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5] transition-colors"
            title="بحث"
          >
            <span className="material-icons-round text-[18px]">search</span>
          </button>

          {/* Install PWA */}
          {!isInstalled && deferredPrompt && (
            <button
              onClick={handleInstall}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--border-radius-sm)] text-[11.5px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
            >
              <span className="material-icons-round text-[14px]">download</span>
              تثبيت
            </button>
          )}

          {/* Read-only badge */}
          {isReadOnly && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-[var(--border-radius-sm)] text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              <span className="material-icons-round text-[13px]">lock</span>
              قراءة فقط
            </span>
          )}

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[#f0f2f5] transition-colors disabled:opacity-50"
            title="تحديث"
          >
            <span className={`material-icons-round text-[18px] ${refreshing ? 'animate-spin text-primary' : ''}`}>
              refresh
            </span>
          </button>

          {/* Background tasks */}
          <TasksNavButton />

          {/* Notifications */}
          <NotificationBell />

          {/* Date chip — desktop only */}
          <div className="hidden xl:flex flex-col items-end px-2.5 py-1 rounded-[var(--border-radius-sm)] bg-[#f0f2f5] border border-[var(--color-border)]">
            <span className="text-[9px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider leading-none">اليوم</span>
            <span className="text-[11px] font-bold text-[var(--color-text)] leading-tight mt-0.5">
              {new Date().toLocaleDateString('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          </div>
        </div>
      </header>

      {/* Global Command Palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
};
