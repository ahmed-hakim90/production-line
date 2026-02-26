import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { usePermission, useCurrentRole } from '@/utils/permissions';
import { MENU_CONFIG, type MenuGroup } from '@/config/menu.config';
import { useSidebarBadges, useSidebarActiveRoute } from './useSidebar';
import { NotificationBell } from '@/components/NotificationBell';
import { useJobsStore } from '@/components/background-jobs/useJobsStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ICON_BG: Record<string, string> = {
  dashboards: 'bg-blue-500',
  production: 'bg-emerald-500',
  hr:         'bg-violet-500',
  costs:      'bg-amber-500',
  quality:    'bg-cyan-500',
  system:     'bg-rose-500',
};
const ACTIVE_TASK_STATUSES = new Set(['pending', 'uploading', 'processing']);

// ─── useScrolled ──────────────────────────────────────────────────────────────

function useScrolled(threshold = 10): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > threshold);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, [threshold]);
  return scrolled;
}

// ─── TopNav ───────────────────────────────────────────────────────────────────

export const TopNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { can }  = usePermission();
  const { roleName, roleColor, isReadOnly } = useCurrentRole();

  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail       = useAppStore((s) => s.userEmail);
  const logout          = useAppStore((s) => s.logout);
  const jobs            = useJobsStore((s) => s.jobs);
  const setHistoryOpen  = useJobsStore((s) => s.setHistoryOpen);
  const setPanelHidden  = useJobsStore((s) => s.setPanelHidden);
  const setPanelMinimized = useJobsStore((s) => s.setPanelMinimized);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [drawerOpen,     setDrawerOpen]     = useState(false);
  const [drawerExpanded, setDrawerExpanded] = useState<string | null>(null);
  const [profileOpen,    setProfileOpen]    = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled,    setIsInstalled]    = useState(false);

  const headerRef = useRef<HTMLElement>(null);
  const scrolled  = useScrolled();
  const badgeCounts = useSidebarBadges();
  const { isActiveItem, isActiveGroup } = useSidebarActiveRoute();

  const visibleGroups = useMemo(
    () =>
      MENU_CONFIG.map((g) => ({
        ...g,
        children: g.children.filter((i) => can(i.permission)),
      })).filter((g) => g.children.length > 0),
    [can],
  );
  const activeTasksCount = useMemo(
    () => jobs.filter((job) => ACTIVE_TASK_STATUSES.has(job.status)).length,
    [jobs],
  );

  // Close everything on route change
  useEffect(() => {
    setActiveDropdown(null);
    setProfileOpen(false);
    setDrawerOpen(false);
  }, [location.pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  // Close desktop dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // PWA install prompt
  useEffect(() => {
    const isStandalone = () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      ((window.navigator as Navigator & { standalone?: boolean }).standalone === true);
    setIsInstalled(isStandalone());

    const onPrompt    = (e: Event) => { e.preventDefault(); setDeferredPrompt(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setIsInstalled(true); setDeferredPrompt(null); };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setDeferredPrompt(null);
  }, [deferredPrompt]);
  const handleOpenTasks = useCallback(() => {
    setHistoryOpen(true);
    setPanelHidden(false);
    setPanelMinimized(false);
  }, [setHistoryOpen, setPanelHidden, setPanelMinimized]);
  const openTasksFromProfile = useCallback(() => {
    handleOpenTasks();
    setProfileOpen(false);
  }, [handleOpenTasks]);

  const toggleDropdown = useCallback((key: string) => {
    setActiveDropdown((prev) => (prev === key ? null : key));
    setProfileOpen(false);
  }, []);

  const toggleProfile = useCallback(() => {
    setProfileOpen((prev) => !prev);
    setActiveDropdown(null);
  }, []);

  const iconBg = (key: string) => ICON_BG[key] ?? 'bg-slate-500';

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════════
          STICKY HEADER (two rows)
      ══════════════════════════════════════════════════════════════════ */}
      <header
        ref={headerRef}
        className={[
          'sticky top-0 z-40 bg-[var(--color-card)] border-b border-[var(--color-border)]',
          'transition-shadow duration-200',
          scrolled ? 'shadow-md' : 'shadow-none',
        ].join(' ')}
      >
        {/* ── ROW 1: Branding · Date · Actions ── */}
        <div className="h-20 px-4 sm:px-6 flex items-center justify-between gap-3 border-b border-[var(--color-border)]/50">

          {/* Branding */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 shrink-0 group"
          >
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/25 group-hover:scale-105 transition-transform duration-150">
              <span className="material-icons-round text-lg">factory</span>
            </div>
            <div className="hidden sm:block text-right leading-tight">
              <p className="text-[13px] font-black text-[var(--color-text)] tracking-tight">مؤسسة المغربي</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">نظام إدارة الإنتاج</p>
            </div>
          </button>

          {/* Right actions */}
          <div className="flex items-center gap-1.5 shrink-0">

            {/* Install PWA */}
            {!isInstalled && deferredPrompt && (
              <button
                onClick={handleInstall}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition-colors"
              >
                <span className="material-icons-round text-sm">download</span>
                تثبيت
              </button>
            )}

            {/* Read-only */}
            {isReadOnly && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                <span className="material-icons-round text-sm">lock</span>
                قراءة فقط
              </span>
            )}

            <NotificationBell />
            <div className="hidden xl:flex flex-col items-center gap-0 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-[var(--color-border)]">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">اليوم</span>
              <span className="text-[12px] font-black text-[var(--color-text)]">
                {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
            </div>

            {/* User profile — desktop */}
            <ProfileMenu
              userDisplayName={userDisplayName}
              userEmail={userEmail}
              roleName={roleName}
              roleColor={roleColor}
              profileOpen={profileOpen}
              toggleProfile={toggleProfile}
              can={can}
              onOpenTasks={openTasksFromProfile}
              activeTasksCount={activeTasksCount}
              logout={logout}
            />

            {/* Hamburger — mobile only (< lg) */}
            <button
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label="فتح القائمة"
            >
              <span className="material-icons-round">menu</span>
            </button>
          </div>
        </div>

        {/* ── ROW 2: Navigation groups (desktop only) ── */}
        <div className="hidden lg:flex items-center gap-0.5 h-14 px-4 sm:px-6">
          {visibleGroups.map((group) => {
            const active     = isActiveGroup(group.key);
            const isOpen     = activeDropdown === group.key;
            const totalBadge = group.children.reduce((s, c) => s + (badgeCounts[c.key] || 0), 0);

            return (
              <div key={group.key} className="relative h-full flex items-center">
                <button
                  onClick={() => toggleDropdown(group.key)}
                  className={[
                    'relative h-full flex items-center gap-1.5 px-3 text-[13px] font-bold transition-all duration-150 select-none',
                    active
                      ? 'text-primary'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white',
                  ].join(' ')}
                >
                  <span className="material-icons-round text-[17px]">{group.icon}</span>
                  <span>{group.label}</span>
                  {totalBadge > 0 && (
                    <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-rose-500 rounded-full" />
                  )}
                  <span
                    className={`material-icons-round text-[15px] text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  >
                    keyboard_arrow_down
                  </span>
                  {active && (
                    <span className="absolute bottom-0 inset-x-1 h-0.5 bg-primary rounded-full" />
                  )}
                </button>

                {isOpen && (
                  <GroupDropdown
                    group={group}
                    isActiveItem={isActiveItem}
                    badgeCounts={badgeCounts}
                    iconBgClass={iconBg(group.key)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════
          MOBILE SIDE DRAWER — slides in from the right (RTL start)
      ══════════════════════════════════════════════════════════════════ */}
      <div
        className={[
          'lg:hidden fixed inset-0 z-50 transition-all duration-300',
          drawerOpen ? 'visible' : 'invisible',
        ].join(' ')}
        aria-hidden={!drawerOpen}
      >
        {/* Backdrop */}
        <div
          className={[
            'absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300',
            drawerOpen ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
          onClick={() => setDrawerOpen(false)}
        />

        {/* Drawer panel */}
        <div
          className={[
            'absolute inset-y-0 right-0 w-[300px] max-w-[85vw] flex flex-col',
            'bg-[var(--color-card)] shadow-2xl',
            'transition-transform duration-300 ease-in-out',
            drawerOpen ? 'translate-x-0' : 'translate-x-full',
          ].join(' ')}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--color-border)] shrink-0">
            <button
              onClick={() => setDrawerOpen(false)}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              <span className="material-icons-round text-lg">close</span>
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center text-white shadow-md shadow-primary/30">
                <span className="material-icons-round text-base">factory</span>
              </div>
              <div className="text-right leading-tight">
                <p className="text-[12px] font-black text-[var(--color-text)]">مؤسسة المغربي</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">نظام إدارة الإنتاج</p>
              </div>
            </div>
          </div>

          {/* User Info */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--color-border)] bg-slate-50/60 dark:bg-slate-800/30 shrink-0">
            <div className="flex-1 text-right">
              <p className="text-sm font-black text-[var(--color-text)] truncate">
                {userDisplayName ?? 'المستخدم'}
              </p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${roleColor}`}>
                {roleName}
              </span>
            </div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center ring-2 ring-primary/20 shrink-0">
              <span className="text-primary font-black text-sm">
                {(userDisplayName ?? 'U').charAt(0).toUpperCase()}
              </span>
            </div>
          </div>

          {/* Navigation Groups */}
          <nav className="flex-1 overflow-y-auto py-2">
            {visibleGroups.map((group) => {
              const active     = isActiveGroup(group.key);
              const isExpanded = drawerExpanded === group.key;
              const totalBadge = group.children.reduce((s, c) => s + (badgeCounts[c.key] || 0), 0);

              return (
                <div key={group.key}>
                  {/* Group toggle */}
                  <button
                    onClick={() => setDrawerExpanded((prev) => (prev === group.key ? null : group.key))}
                    className={[
                      'w-full flex items-center gap-3 px-4 py-3 text-sm font-bold transition-colors',
                      active
                        ? 'text-primary bg-primary/5'
                        : 'text-[var(--color-text)] hover:bg-slate-50 dark:hover:bg-slate-800/50',
                    ].join(' ')}
                  >
                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm ${iconBg(group.key)}`}>
                      <span className="material-icons-round text-[16px]">{group.icon}</span>
                    </div>

                    {/* Label + badge */}
                    <span className="flex-1 text-right">{group.label}</span>
                    {totalBadge > 0 && (
                      <span className="min-w-[20px] h-5 px-1 flex items-center justify-center text-[10px] font-bold bg-rose-500 text-white rounded-full">
                        {totalBadge > 99 ? '99+' : totalBadge}
                      </span>
                    )}

                    {/* Chevron */}
                    <span
                      className={`material-icons-round text-[16px] text-slate-400 transition-transform duration-200 ${isExpanded ? '-rotate-90' : 'rotate-90'}`}
                    >
                      chevron_left
                    </span>
                  </button>

                  {/* Children — smooth accordion */}
                  <div
                    className={[
                      'overflow-hidden transition-all duration-250 ease-in-out',
                      isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0',
                    ].join(' ')}
                  >
                    <div className="bg-slate-50/70 dark:bg-slate-800/20 mx-3 mb-1 rounded-xl overflow-hidden">
                      {group.children.map((item) => {
                        const itemActive = isActiveItem(item);
                        const badge = badgeCounts[item.key] || 0;
                        return (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            className={[
                              'flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                              itemActive
                                ? 'bg-primary/10 text-primary font-bold'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 font-medium',
                            ].join(' ')}
                          >
                            <span className={`material-icons-round text-[18px] ${itemActive ? 'text-primary' : 'text-slate-400'}`}>
                              {item.icon}
                            </span>
                            <span className="flex-1">{item.label}</span>
                            {badge > 0 && (
                              <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[9px] font-bold bg-rose-500 text-white rounded-full">
                                {badge > 99 ? '99+' : badge}
                              </span>
                            )}
                            {itemActive && (
                              <span className="w-1.5 h-1.5 bg-primary rounded-full shrink-0" />
                            )}
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Drawer Footer */}
          <div className="shrink-0 border-t border-[var(--color-border)] px-4 py-3 space-y-2 bg-slate-50/60 dark:bg-slate-800/20">
            <button
              onClick={() => {
                handleOpenTasks();
                setDrawerOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors text-start"
            >
              <span className="material-icons-round text-lg text-slate-400">task_alt</span>
              <span className="flex-1">المهام</span>
              {activeTasksCount > 0 && (
                <span className="min-w-[20px] h-5 px-1 flex items-center justify-center text-[10px] font-bold bg-primary text-white rounded-full">
                  {activeTasksCount > 99 ? '99+' : activeTasksCount}
                </span>
              )}
            </button>
            {can('selfService.view') && (
              <NavLink
                to="/self-service"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors"
              >
                <span className="material-icons-round text-lg text-slate-400">account_circle</span>
                <span>ملفي الشخصي</span>
              </NavLink>
            )}
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors text-start"
            >
              <span className="material-icons-round text-lg">logout</span>
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

// ─── Profile Menu (desktop) ───────────────────────────────────────────────────

interface ProfileMenuProps {
  userDisplayName: string | null | undefined;
  userEmail:       string | null | undefined;
  roleName:        string;
  roleColor:       string;
  profileOpen:     boolean;
  toggleProfile:   () => void;
  can:             (p: string) => boolean;
  onOpenTasks:     () => void;
  activeTasksCount: number;
  logout:          () => void;
}

const ProfileMenu: React.FC<ProfileMenuProps> = ({
  userDisplayName, userEmail, roleName, roleColor,
  profileOpen, toggleProfile, can, onOpenTasks, activeTasksCount, logout,
}) => (
  <div className="relative hidden lg:block">
    <button
      onClick={toggleProfile}
      className={[
        'flex items-center gap-2 px-2 py-1.5 rounded-xl transition-all duration-150',
        profileOpen
          ? 'bg-primary/8 ring-1 ring-primary/20'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800',
      ].join(' ')}
    >
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center ring-2 ring-primary/20 shrink-0">
        <span className="text-primary font-black text-xs">
          {(userDisplayName ?? 'U').charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="hidden md:block text-right leading-tight">
        <p className="text-xs font-black text-[var(--color-text)] truncate max-w-[96px]">
          {userDisplayName ?? 'المستخدم'}
        </p>
        <span className={`inline-flex items-center px-1.5 py-px rounded-full text-[9px] font-bold ${roleColor}`}>
          {roleName}
        </span>
      </div>
      <span className={`material-icons-round text-sm text-slate-400 transition-transform duration-200 ${profileOpen ? '-rotate-180' : ''}`}>
        expand_more
      </span>
    </button>

    {profileOpen && (
      <div className="absolute left-0 top-full mt-2 w-60 bg-[var(--color-card)] rounded-2xl border border-[var(--color-border)] shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 z-50">
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border-b border-[var(--color-border)]">
          <p className="text-sm font-bold text-[var(--color-text)]">{userDisplayName ?? 'المستخدم'}</p>
          <p className="text-[10px] font-mono text-slate-400 truncate mt-0.5" dir="ltr">{userEmail}</p>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold mt-1.5 ${roleColor}`}>
            {roleName}
          </span>
        </div>
        <div className="p-1.5">
          <button
            onClick={onOpenTasks}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-start"
          >
            <span className="material-icons-round text-lg text-slate-400">task_alt</span>
            <span className="flex-1">المهام</span>
            {activeTasksCount > 0 && (
              <span className="min-w-[20px] h-5 px-1 flex items-center justify-center text-[10px] font-bold bg-primary text-white rounded-full">
                {activeTasksCount > 99 ? '99+' : activeTasksCount}
              </span>
            )}
          </button>
          {can('selfService.view') && (
            <NavLink
              to="/self-service"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <span className="material-icons-round text-lg text-slate-400">account_circle</span>
              <span>ملفي الشخصي</span>
            </NavLink>
          )}
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors text-start mt-0.5"
          >
            <span className="material-icons-round text-lg">logout</span>
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    )}
  </div>
);

// ─── Group Dropdown (desktop) ─────────────────────────────────────────────────

interface GroupDropdownProps {
  group: MenuGroup & { children: { key: string; label: string; icon: string; path: string; permission: any }[] };
  isActiveItem: (item: any) => boolean;
  badgeCounts:  Record<string, number>;
  iconBgClass:  string;
}

const GroupDropdown: React.FC<GroupDropdownProps> = ({ group, isActiveItem, badgeCounts, iconBgClass }) => {
  const half       = Math.ceil(group.children.length / 2);
  const useColumns = group.children.length > 5;
  const col1 = useColumns ? group.children.slice(0, half) : group.children;
  const col2 = useColumns ? group.children.slice(half) : [];

  return (
    <div className="absolute top-full mt-1 right-0 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
      <div className="absolute -top-1.5 right-5 w-3 h-3 bg-[var(--color-card)] border-l border-t border-[var(--color-border)] rotate-45 z-10" />
      <div className={[
        'relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl shadow-slate-200/60 dark:shadow-slate-950/80 overflow-hidden',
        useColumns ? 'min-w-[460px]' : 'min-w-[240px]',
      ].join(' ')}>
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--color-border)] bg-slate-50/80 dark:bg-slate-800/40">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-sm ${iconBgClass}`}>
            <span className="material-icons-round text-[18px]">{group.icon}</span>
          </div>
          <div>
            <p className="text-sm font-black text-[var(--color-text)]">{group.label}</p>
            <p className="text-[10px] text-slate-400 font-medium">{group.children.length} عنصر</p>
          </div>
        </div>
        <div className={`p-2 ${useColumns ? 'grid grid-cols-2 gap-x-1' : ''}`}>
          <div>
            {col1.map((item) => (
              <DropdownItem key={item.path} item={item} isActive={isActiveItem(item)} badge={badgeCounts[item.key] || 0} iconBgClass={iconBgClass} />
            ))}
          </div>
          {useColumns && col2.length > 0 && (
            <div>
              {col2.map((item) => (
                <DropdownItem key={item.path} item={item} isActive={isActiveItem(item)} badge={badgeCounts[item.key] || 0} iconBgClass={iconBgClass} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Dropdown Item ────────────────────────────────────────────────────────────

interface DropdownItemProps {
  item:        { key: string; label: string; icon: string; path: string };
  isActive:    boolean;
  badge:       number;
  iconBgClass: string;
}

const DropdownItem: React.FC<DropdownItemProps> = ({ item, isActive, badge, iconBgClass }) => (
  <NavLink
    to={item.path}
    className={[
      'group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-100',
      isActive
        ? 'bg-primary/10 text-primary font-bold'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white font-medium',
    ].join(' ')}
  >
    <div className={[
      'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all duration-100',
      isActive
        ? `${iconBgClass} text-white shadow-sm`
        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:bg-slate-200 dark:group-hover:bg-slate-700',
    ].join(' ')}>
      <span className="material-icons-round text-[17px]">{item.icon}</span>
    </div>
    <span className="flex-1 truncate">{item.label}</span>
    {badge > 0 && (
      <span className="min-w-[20px] h-5 px-1 flex items-center justify-center text-[10px] font-bold bg-rose-500 text-white rounded-full shrink-0">
        {badge > 99 ? '99+' : badge}
      </span>
    )}
    {isActive && (
      <span className="material-icons-round text-primary text-sm shrink-0">check_circle</span>
    )}
  </NavLink>
);
