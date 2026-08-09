import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Download,
  Home,
  Lock,
  Languages,
  Menu,
  RefreshCw,
  Search,
  Sidebar,
} from 'lucide-react';
import { useCurrentRole, usePermission } from '@/utils/permissions';
import { NotificationBell } from '@/components/NotificationBell';
import { TasksNavButton } from '@/components/background-jobs/JobsPanel';
import { useAppStore } from '@/store/useAppStore';
import { userService } from '@/services/userService';
import { setAppLanguage, type SupportedLanguage } from '@/src/i18n';
import { Button } from '@/components/ui/button';
import { useSidebar, useSidebarActiveRoute } from './useSidebar';
import { MENU_CONFIG } from '@/config/menu.config';
import { CommandPalette } from '@/components/CommandPalette';
import { useCommandPalette } from '@/components/useCommandPalette';
import { resolveMenuIcon } from './menuIconMap';
import { usePageBackRegistration } from './PageBackContext';
import { tenantHomePath } from '@/lib/tenantPaths';
import { useAppDirection } from './useAppDirection';
import { usePwaInstall } from '@/hooks/usePwaInstall';

export interface TopbarProps {
  onMenuToggle: () => void;
  onSidebarCollapseToggle: () => void;
}

function renderTopbarIcon(name?: string, className?: string, size = 16) {
  const NavIcon = resolveMenuIcon(name);
  return <NavIcon size={size} className={className} />;
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
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { isReadOnly } = useCurrentRole();
  const { canViewActivityLog } = usePermission();
  const { collapsed }  = useSidebar();
  const navigate       = useNavigate();
  const location       = useLocation();
  const homePath       = tenantHomePath(tenantSlug);
  const scrolled       = useScrolled();
  const { t, i18n } = useTranslation();
  const { isRTL } = useAppDirection();

  const uid = useAppStore((s) => s.uid);
  const userProfile = useAppStore((s) => s.userProfile);
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);

  const { isInstalled, canPromptInstall, promptInstall } = usePwaInstall();
  const [refreshing, setRefreshing] = useState(false);

  const { isActiveItem } = useSidebarActiveRoute();
  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandPalette();
  const pageBack = usePageBackRegistration();

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
    // Keep palette from persisting as an invisible full-screen blocker across route changes.
    setCmdOpen(false);
  }, [location.pathname, location.search, setCmdOpen]);

  const handleInstall = useCallback(async () => {
    await promptInstall();
  }, [promptInstall]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    window.location.reload();
  }, []);

  const handleToggleLanguage = useCallback(async () => {
    const current = (i18n.language || 'ar').startsWith('en') ? 'en' : 'ar';
    const next: SupportedLanguage = current === 'ar' ? 'en' : 'ar';

    await setAppLanguage(next);

    if (!uid) return;
    const currentPrefs = userProfile?.uiPreferences ?? {};
    const nextPrefs = { ...currentPrefs, language: next };

    useAppStore.setState((s) => ({
      userProfile: s.userProfile ? { ...s.userProfile, uiPreferences: nextPrefs } : s.userProfile,
    }));

    void userService.update(uid, { uiPreferences: nextPrefs }).catch((e) => {
      console.warn('Failed to persist language preference:', e);
    });
  }, [i18n.language, uid, userProfile?.uiPreferences]);

  return (
    <>
      <header
        className={[
          'h-[52px] fixed top-0 left-0 right-0 z-40 shrink-0',
          isRTL
            ? (collapsed ? 'lg:right-[52px]' : 'lg:right-[260px]')
            : (collapsed ? 'lg:left-[52px]' : 'lg:left-[260px]'),
          'bg-[var(--color-card)]',
          'border-b border-[var(--color-border)]',
          'px-2.5 sm:px-4 py-2 sm:py-0 flex items-center gap-1.5 sm:gap-2',
          scrolled ? 'shadow-sm' : '',
        ].join(' ')}
      >
        {/* ── LEFT: toggle + breadcrumb ── */}
        <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">

          {/* Mobile hamburger */}
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-1.5 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] transition-colors shrink-0"
            aria-label={t('topbar.openMenu')}
          >
            <Menu size={18} />
          </button>

          {/* Desktop sidebar collapse toggle */}
          <button
            onClick={onSidebarCollapseToggle}
            className="hidden lg:flex p-1.5 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] transition-colors shrink-0"
            title={collapsed ? t('topbar.expandSidebar') : t('topbar.collapseSidebar')}
          >
            <Sidebar size={18} className={`transition-transform duration-300 ${collapsed ? (isRTL ? 'rotate-180' : '') : (isRTL ? '' : 'rotate-180')}`} />
          </button>

          {pageBack && (
            <button
              type="button"
              onClick={pageBack.onClick}
              disabled={pageBack.disabled}
              className="p-1.5 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] transition-colors shrink-0 disabled:opacity-50 disabled:pointer-events-none"
              title={pageBack.label}
              aria-label={pageBack.label}
            >
              <ArrowLeft size={18} />
            </button>
          )}

          {/* Breadcrumb */}
          {breadcrumb ? (
            <nav className="hidden sm:flex items-center gap-1 text-[12.5px] min-w-0">
              <button
                onClick={() => navigate(homePath)}
                className="flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
              >
                {renderTopbarIcon(breadcrumb.groupIcon, undefined, 13)}
                <span className="truncate max-w-[80px]">{breadcrumb.group}</span>
              </button>
              <span className="text-[var(--color-border)] shrink-0" aria-hidden="true">›</span>
              <span className="font-semibold text-[var(--color-text)] truncate flex items-center gap-1">
                {renderTopbarIcon(breadcrumb.pageIcon, 'text-primary shrink-0', 13)}
                <span>{breadcrumb.page}</span>
              </span>
            </nav>
          ) : (
            <button
              onClick={() => navigate(homePath)}
              className="hidden sm:flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-text)] hover:text-primary transition-colors"
            >
              <Home size={15} />
              <span>{t('topbar.home')}</span>
            </button>
          )}

          {breadcrumb && (
            <div className="sm:hidden flex items-center gap-1 min-w-0">
              {renderTopbarIcon(breadcrumb.pageIcon, 'text-primary shrink-0', 14)}
              <span className="text-[12px] font-semibold text-[var(--color-text)] truncate">{breadcrumb.page}</span>
            </div>
          )}
        </div>

        {/* ── CENTER: Awesomebar / Global Search ── */}
        <div className="hidden md:flex shrink-0 flex-1 max-w-[420px] min-w-[180px] mx-2">
          <button
            onClick={() => setCmdOpen(true)}
            className="w-full min-w-0 flex items-center gap-2.5 px-4 py-2 rounded-full bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-text-muted)] text-[12.5px] hover:border-primary/40 hover:bg-primary/5 transition-all group shadow-sm"
          >
            <Search size={15} className="group-hover:text-primary transition-colors shrink-0" />
            <span className="flex-1 min-w-0 truncate text-start">{t('topbar.globalSearchPlaceholder')}</span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-[var(--color-card)] border border-[var(--color-border)]">
              ⌘ K
            </kbd>
          </button>
        </div>

        {/* ── RIGHT: actions ── */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">

          {/* Mobile search icon */}
          <button
            onClick={() => setCmdOpen(true)}
            className="md:hidden p-1.5 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] transition-colors"
            title={t('topbar.search')}
          >
            <Search size={18} />
          </button>

          {/* Install PWA */}
          {!isInstalled && canPromptInstall && (
            <Button
              type="button"
              onClick={handleInstall}
              iconName="download"
              tone="approve"
              solid={false}
              className="hidden sm:inline-flex !h-auto items-center gap-1 !px-2.5 !py-1.5 !rounded-[var(--border-radius-sm)] !text-[11.5px] font-semibold"
            >
              {t('topbar.install')}
            </Button>
          )}
          {!isInstalled && !canPromptInstall && (
            <Link
              to="/download"
              className="sm:hidden inline-flex items-center gap-1 p-1.5 rounded-[var(--border-radius-sm)] text-emerald-700 hover:bg-emerald-50 transition-colors"
              title={t('topbar.install')}
            >
              <Download size={18} />
            </Link>
          )}

          {/* Read-only badge */}
          {isReadOnly && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-[var(--border-radius-sm)] text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              <Lock size={13} />
              {t('topbar.readOnly')}
            </span>
          )}

          {/* Language toggle */}
          {/* <button
            type="button"
            onClick={() => { void handleToggleLanguage(); }}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--border-radius-sm)] text-[11.5px] font-semibold bg-[var(--color-surface-hover)] border border-[var(--color-border)] text-[var(--color-text)] hover:border-primary/40 hover:bg-primary/5 transition-colors"
            title={i18n.language?.startsWith('en') ? t('language.switchToAr') : t('language.switchToEn')}
            aria-label={i18n.language?.startsWith('en') ? t('language.switchToAr') : t('language.switchToEn')}
          >
            <Languages size={15} />
            <span className="font-mono">{i18n.language?.startsWith('en') ? 'EN' : 'AR'}</span>
          </button> */}

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-1.5 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] transition-colors disabled:opacity-50"
            title={t('topbar.refresh')}
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin text-primary' : ''} />
          </button>

          {/* Background tasks */}
          {canViewActivityLog && <TasksNavButton />}

          {/* Notifications */}
          <NotificationBell />

          {/* Profile cluster */}
          <div className="hidden sm:flex items-center gap-2 ps-2 ms-0.5 border-s border-[var(--color-border)]">
            <div className="w-8 h-8 rounded-full bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
              <span className="text-primary font-bold text-xs">
                {(userDisplayName || userEmail || 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="hidden lg:flex flex-col min-w-0 max-w-[140px]">
              <span className="text-[12px] font-bold text-[var(--color-text)] truncate leading-tight">
                {userDisplayName || t('sidebar.user')}
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)] truncate leading-tight font-mono" dir="ltr">
                {userEmail || ''}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Global Command Palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
};
