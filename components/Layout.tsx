import React, { useState, useEffect, useRef, useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { usePermission, useCurrentRole } from '../utils/permissions';
import { MENU_CONFIG } from '../config/menu.config';
import { useBadgeCounts, useActiveRoute, useSidebarCollapse } from '../hooks/useNavigation';
import { NotificationBell } from './NotificationBell';

const APP_VERSION = __APP_VERSION__;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

const Sidebar: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { can } = usePermission();
  const { roleName, roleColor, isReadOnly } = useCurrentRole();
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const logout = useAppStore((s) => s.logout);
  const location = useLocation();

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const { collapsed, toggle: toggleCollapse } = useSidebarCollapse();
  const badgeCounts = useBadgeCounts();
  const { isActive: isItemActive, isGroupActive } = useActiveRoute();

  const visibleGroups = useMemo(() => {
    return MENU_CONFIG
      .map((g) => ({ ...g, children: g.children.filter((i) => can(i.permission)) }))
      .filter((g) => g.children.length > 0);
  }, [can]);

  useEffect(() => { onClose(); setProfileOpen(false); }, [location.pathname]);

  useEffect(() => {
    const active = visibleGroups.find((g) => g.children.some((i) => isItemActive(i)));
    if (active) setOpenGroup(active.key);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleGroup = (key: string) => setOpenGroup((p) => (p === key ? null : key));

  const w = collapsed ? 'w-[72px]' : 'w-64';

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`${w} bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col fixed h-full z-50 transition-all duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}
      >
        {/* ── Header ── */}
        <div className="p-4 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/30 shrink-0">
            <span className="material-icons-round text-xl">factory</span>
          </div>
          {!collapsed && (
            <p className="flex-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider min-w-0">نظام إدارة الإنتاج</p>
          )}
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all lg:hidden shrink-0">
            <span className="material-icons-round text-xl">close</span>
          </button>
          <button
            onClick={toggleCollapse}
            title={collapsed ? 'توسيع القائمة' : 'تصغير القائمة'}
            className="hidden lg:flex p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all shrink-0"
          >
            <span className={`material-icons-round text-lg transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}>chevron_right</span>
          </button>
        </div>

        {isReadOnly && !collapsed && (
          <div className="mx-3 mt-3 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-center gap-2">
            <span className="material-icons-round text-amber-500 text-sm">visibility</span>
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">وضع القراءة فقط</span>
          </div>
        )}

        {/* ── Navigation ── */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-2">
          {visibleGroups.map((group) => {
            const active = isGroupActive(group.key);
            const isOpen = openGroup === group.key;
            const totalBadge = group.children.reduce((s, c) => s + (badgeCounts[c.key] || 0), 0);

            return (
              <div key={group.key}>
                {/* Group header */}
                <button
                  onClick={() => collapsed ? undefined : toggleGroup(group.key)}
                  title={collapsed ? group.label : undefined}
                  className={`group relative w-full flex items-center gap-3 rounded-xl transition-all select-none ${collapsed ? 'justify-center px-0 py-3' : 'px-3 py-3'} ${
                    active
                      ? 'bg-primary/10 text-primary font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300 font-bold'
                  }`}
                >
                  {active && <span className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-l-full" />}

                  <span className="material-icons-round text-[22px]">{group.icon}</span>

                  {!collapsed && (
                    <>
                      <span className="flex-1 text-start text-[14px]">{group.label}</span>
                      {totalBadge > 0 && (
                        <span className="min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-[10px] font-bold bg-rose-500 text-white rounded-full">
                          {totalBadge > 99 ? '99+' : totalBadge}
                        </span>
                      )}
                      <span className={`material-icons-round text-lg text-slate-400 transition-transform duration-300 ${isOpen ? '-rotate-90' : ''}`}>chevron_left</span>
                    </>
                  )}

                  {collapsed && totalBadge > 0 && (
                    <span className="absolute top-1 left-1 w-2.5 h-2.5 bg-rose-500 rounded-full" />
                  )}

                  {/* Tooltip in collapsed mode */}
                  {collapsed && (
                    <span className="pointer-events-none absolute right-full mr-3 px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg z-[60]">
                      {group.label}
                    </span>
                  )}
                </button>

                {/* Children items — accordion */}
                {!collapsed && (
                  <div
                    className="overflow-hidden transition-all duration-300 ease-in-out"
                    style={{ maxHeight: isOpen ? `${group.children.length * 44 + 10}px` : '0px', opacity: isOpen ? 1 : 0 }}
                  >
                    <div className="pt-1 pb-1 mr-4 border-r-2 border-slate-200/80 dark:border-slate-700/80 space-y-0.5">
                      {group.children.map((item) => {
                        const itemActive = isItemActive(item);
                        const badge = badgeCounts[item.key] || 0;

                        return (
                          <NavLink
                            key={item.path}
                            to={item.path}
                            className={`group/item relative flex items-center gap-3 pr-9 pl-3 py-2.5 rounded-lg text-[13.5px] transition-all ${
                              itemActive
                                ? 'bg-primary/10 text-primary font-bold'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-700 dark:hover:text-slate-300 font-medium'
                            }`}
                          >
                            {itemActive && <span className="absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-l-full" />}
                            <span className="material-icons-round text-[19px]">{item.icon}</span>
                            <span className="flex-1 truncate">{item.label}</span>
                            {badge > 0 && (
                              <span className="min-w-[20px] h-[20px] px-1 flex items-center justify-center text-[10px] font-bold bg-rose-500 text-white rounded-full">
                                {badge > 99 ? '99+' : badge}
                              </span>
                            )}
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ── Profile ── */}
        <div className="border-t border-slate-100 dark:border-slate-800 shrink-0" ref={profileRef}>
          {collapsed ? (
            <div className="p-2 flex flex-col items-center gap-2">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                title={userDisplayName ?? 'المستخدم'}
                className="group relative w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center hover:from-primary/30 hover:to-primary/10 transition-all ring-2 ring-primary/20"
              >
                <span className="text-primary font-bold text-sm">
                  {(userDisplayName ?? 'U').charAt(0).toUpperCase()}
                </span>
                <span className="pointer-events-none absolute right-full mr-3 px-2.5 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg z-[60]">
                  {userDisplayName ?? 'المستخدم'}
                </span>
              </button>
            </div>
          ) : (
            <div className="p-3">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className={`w-full p-3 rounded-xl transition-all text-start ${profileOpen ? 'bg-primary/5 ring-1 ring-primary/20' : 'bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/80'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0 ring-2 ring-primary/20">
                    <span className="text-primary font-bold text-sm">
                      {(userDisplayName ?? 'U').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="overflow-hidden flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{userDisplayName ?? 'المستخدم'}</p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${roleColor}`}>{roleName}</span>
                  </div>
                  <span className={`material-icons-round text-sm text-slate-400 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`}>expand_less</span>
                </div>
              </button>

              {/* Dropdown */}
              {profileOpen && (
                <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 bg-white dark:bg-slate-800">
                  <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] text-slate-400 font-mono truncate" dir="ltr">{userEmail}</p>
                  </div>

                  {can('selfService.view') && (
                    <NavLink to="/self-service" className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <span className="material-icons-round text-lg text-slate-400">account_circle</span>
                      <span>ملفي الشخصي</span>
                    </NavLink>
                  )}

                  <button
                    onClick={logout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors text-start border-t border-slate-100 dark:border-slate-700"
                  >
                    <span className="material-icons-round text-lg">logout</span>
                    <span>تسجيل الخروج</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

// ─── Header ─────────────────────────────────────────────────────────────────

const Header: React.FC<{ onMenuToggle: () => void }> = ({ onMenuToggle }) => {
  const navigate = useNavigate();
  const { isReadOnly } = useCurrentRole();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

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
    if (choice.outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <header className="h-16 sm:h-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800">
      <button onClick={onMenuToggle} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors lg:hidden shrink-0">
        <span className="material-icons-round text-2xl">menu</span>
      </button>

      <div className="min-w-0 cursor-pointer" onClick={() => navigate('/')}>
        <h1 className="font-bold text-xl tracking-tight text-primary hover:opacity-80 transition-opacity">مؤسسة المغربي</h1>
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
        <NotificationBell />
        <div className="hidden md:block h-8 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1"></div>
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

// ─── Layout ─────────────────────────────────────────────────────────────────

interface LayoutProps { children: React.ReactNode; }

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { collapsed } = useSidebarCollapse();

  return (
    <div className="flex min-h-screen bg-background dark:bg-background-dark text-slate-800 dark:text-slate-200 overflow-x-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className={`flex-1 ${collapsed ? 'lg:mr-[72px]' : 'lg:mr-64'} flex flex-col min-w-0 transition-all duration-300 overflow-x-hidden`}>
        <Header onMenuToggle={() => setSidebarOpen((o) => !o)} />
        <div className="p-4 sm:p-6 lg:p-8 flex-1 animate-in fade-in duration-500 overflow-x-hidden">{children}</div>
        <footer className="mt-auto py-4 sm:py-6 px-4 sm:px-8 border-t border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-400 text-xs sm:text-sm font-medium">
          <p>© {new Date().getFullYear()} HAKIM PRODUCTION SYSTEM — v{APP_VERSION}</p>
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              <span>قاعدة البيانات مستقرة</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(19,146,236,0.5)]"></span>
              <span>Firestore نشط</span>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};
