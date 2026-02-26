import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { usePermission, useCurrentRole } from '@/utils/permissions';
import { MENU_CONFIG } from '@/config/menu.config';
import { useSidebar, useSidebarActiveRoute, useSidebarBadges } from './useSidebar';

export interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const { can } = usePermission();
  const { roleName, roleColor, isReadOnly } = useCurrentRole();
  const userDisplayName = useAppStore((s) => s.userDisplayName);
  const userEmail = useAppStore((s) => s.userEmail);
  const logout = useAppStore((s) => s.logout);
  const location = useLocation();

  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const { collapsed } = useSidebar();
  const badgeCounts = useSidebarBadges();
  const { isActiveItem, isActiveGroup, activeGroupKey } = useSidebarActiveRoute();

  const visibleGroups = useMemo(
    () =>
      MENU_CONFIG
        .map((g) => ({ ...g, children: g.children.filter((i) => can(i.permission)) }))
        .filter((g) => g.children.length > 0),
    [can],
  );

  useEffect(() => { onClose(); setProfileOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (activeGroupKey) {
      setOpenGroup(activeGroupKey);
    }
  }, [activeGroupKey]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleGroup = (key: string) => setOpenGroup((p) => (p === key ? null : key));
  const w = collapsed ? 'w-20' : 'w-64';

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`${w} bg-[var(--color-sidebar-bg)] text-[var(--color-sidebar-text)] border-l border-[var(--color-border)] flex flex-col fixed h-full z-50 transition-all duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}
      >
        {/* ── Header ── */}
        <div className="p-4 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white shadow-lg shadow-primary/30 shrink-0">
            <span className="material-icons-round text-xl">factory</span>
          </div>
          {!collapsed && (
            <p className="flex-1 text-[10px] text-slate-400 font-bold uppercase tracking-wider min-w-0">
              نظام إدارة الإنتاج
            </p>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all lg:hidden shrink-0"
          >
            <span className="material-icons-round text-xl">close</span>
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
            const active = isActiveGroup(group.key);
            const isOpen = openGroup === group.key;
            const totalBadge = group.children.reduce((s, c) => s + (badgeCounts[c.key] || 0), 0);

            return (
              <div key={group.key}>
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
                  <span className="material-icons-round text-[22px] shrink-0">{group.icon}</span>

                  {!collapsed && (
                    <>
                      <span className="flex-1 text-start text-[14px]">{group.label}</span>
                      {totalBadge > 0 && (
                        <span className="min-w-[22px] h-[22px] px-1.5 flex items-center justify-center text-[10px] font-bold bg-rose-500 text-white rounded-full">
                          {totalBadge > 99 ? '99+' : totalBadge}
                        </span>
                      )}
                      <span className={`material-icons-round text-lg text-slate-400 transition-transform duration-300 ${isOpen ? '-rotate-90' : ''}`}>
                        chevron_left
                      </span>
                    </>
                  )}

                  {collapsed && totalBadge > 0 && (
                    <span className="absolute top-1 left-1 w-2.5 h-2.5 bg-rose-500 rounded-full" />
                  )}

                  {collapsed && (
                    <span className="pointer-events-none absolute right-full mr-3 px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg z-[60]">
                      {group.label}
                    </span>
                  )}
                </button>

                {!collapsed && (
                  <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="pt-1 pb-1 mr-4 border-r-2 border-slate-200/80 dark:border-slate-700/80 space-y-0.5">
                      {group.children.map((item) => {
                        const itemActive = isActiveItem(item);
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
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold mt-0.5 ${roleColor}`}>
                      {roleName}
                    </span>
                  </div>
                  <span className={`material-icons-round text-sm text-slate-400 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`}>
                    expand_less
                  </span>
                </div>
              </button>

              {profileOpen && (
                <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 bg-white dark:bg-slate-800">
                  <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-700">
                    <p className="text-[10px] text-slate-400 font-mono truncate" dir="ltr">{userEmail}</p>
                  </div>

                  {can('selfService.view') && (
                    <NavLink
                      to="/self-service"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                    >
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
