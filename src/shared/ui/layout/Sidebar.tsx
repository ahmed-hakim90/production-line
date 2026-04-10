import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronLeft,
  Eye,
  Factory,
  LogOut,
  PanelLeftClose,
  UserCircle2,
  X,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { usePermission, useCurrentRole } from '@/utils/permissions';
import { MENU_CONFIG, canAccessMenuItem } from '@/config/menu.config';
import { useSidebar, useSidebarActiveRoute, useSidebarBadges } from './useSidebar';
import type { SidebarIconStyle } from '@/types';
import { resolveMenuIcon } from './menuIconMap';
import { withTenantPath } from '@/lib/tenantPaths';
import { useAppDirection } from './useAppDirection';

export interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

/* ── ERPNext-style icon colors (colorful mode) */
const COLORFUL_ICON: Record<string, string> = {
  dashboards: 'text-blue-600',
  production: 'text-emerald-600',
  inventory:  'text-teal-600',
  hr:         'text-violet-600',
  costs:      'text-amber-600',
  quality:    'text-cyan-600',
  repair:     'text-orange-600',
  customers:  'text-indigo-600',
  system:     'text-rose-600',
};

const COLORFUL_BG: Record<string, string> = {
  dashboards: 'bg-blue-50',
  production: 'bg-emerald-50',
  inventory:  'bg-teal-50',
  hr:         'bg-violet-50',
  costs:      'bg-amber-50',
  quality:    'bg-cyan-50',
  repair:     'bg-orange-50',
  customers:  'bg-indigo-50',
  system:     'bg-rose-50',
};

function renderSidebarIcon(name?: string, className?: string, size = 16) {
  const NavIcon = resolveMenuIcon(name);
  return <NavIcon size={size} className={className} />;
}

function getIconClasses(
  groupKey: string,
  style: SidebarIconStyle,
): { iconColor: string; activeBg: string } {
  if (style === 'colorful') {
    return {
      iconColor: COLORFUL_ICON[groupKey] ?? 'text-slate-500',
      activeBg:  COLORFUL_BG[groupKey]  ?? 'bg-primary/5',
    };
  }
  if (style === 'primary') {
    return { iconColor: 'text-primary', activeBg: 'bg-primary/8' };
  }
  // muted
  return { iconColor: 'text-slate-400', activeBg: 'bg-slate-100' };
}

export const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { isRTL } = useAppDirection();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can }  = usePermission();
  const { roleName, roleColor, isReadOnly } = useCurrentRole();
  const userDisplayName    = useAppStore((s) => s.userDisplayName);
  const userEmail          = useAppStore((s) => s.userEmail);
  const logout             = useAppStore((s) => s.logout);
  const sidebarIconStyle   = useAppStore((s) => (s.systemSettings?.theme?.sidebarIconStyle ?? 'colorful') as SidebarIconStyle);
  const sidebarCompanyTitle = useAppStore((s) => {
    const t = s.tenantCompanyName?.trim();
    if (t) return t;
    const f = s.systemSettings?.branding?.factoryName?.trim();
    if (f) return f;
    return t('sidebar.defaultCompanyName');
  });
  const location        = useLocation();

  const [openGroup,   setOpenGroup]   = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const { collapsed, toggleCollapse } = useSidebar();
  const badgeCounts   = useSidebarBadges();
  const { isActiveItem, isActiveGroup, activeGroupKey } = useSidebarActiveRoute();

  const visibleGroups = useMemo(
    () =>
      MENU_CONFIG
        .map((g) => ({ ...g, children: g.children.filter((i) => canAccessMenuItem(can, i)) }))
        .filter((g) => g.children.length > 0),
    [can],
  );

  /** مجموعات الأكورديون فقط (غير flat). لو 1 أو 2 يبقوا مفتوحين دائماً في الشريط الموسّع */
  const accordionGroupCount = useMemo(
    () => visibleGroups.filter((g) => !g.flat).length,
    [visibleGroups],
  );
  const alwaysExpandAccordions = accordionGroupCount >= 1 && accordionGroupCount <= 2;

  useEffect(() => { onClose(); setProfileOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (activeGroupKey && !collapsed) setOpenGroup(activeGroupKey);
  }, [activeGroupKey, collapsed]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggleGroup = (key: string) => setOpenGroup((p) => (p === key ? null : key));
  const sidebarW = collapsed
    ? 'w-[88vw] max-w-[300px] lg:w-[52px] lg:max-w-none'
    : 'w-[88vw] max-w-[300px] lg:w-[260px] lg:max-w-none';
  const showExpandedHeader = !collapsed || open;
  const tooltipSideClass = isRTL ? 'right-full mr-2' : 'left-full ml-2';
  const activeIndicatorClass = isRTL ? 'left-0 rounded-r-full' : 'right-0 rounded-l-full';
  const nestedContainerClass = isRTL
    ? 'py-0.5 mr-5 border-r border-[var(--color-sidebar-border)]'
    : 'py-0.5 ml-5 border-l border-[var(--color-sidebar-border)]';
  const nestedItemPaddingClass = isRTL ? 'pr-2.5 pl-2' : 'pl-2.5 pr-2';

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={[
          sidebarW,
          `fixed inset-y-0 ${isRTL ? 'right-0' : 'left-0'} z-50 flex flex-col`,
          'bg-[var(--color-sidebar-bg)]',
          `${isRTL ? 'border-l' : 'border-r'} border-[var(--color-sidebar-border)]`,
          'transition-[width,transform] duration-300 ease-in-out overflow-hidden',
          open ? 'translate-x-0' : `${isRTL ? 'translate-x-full' : '-translate-x-full'} lg:translate-x-0`,
        ].join(' ')}
        style={{ boxShadow: open ? '0 4px 20px rgba(0,0,0,0.1)' : undefined }}
      >

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className={[
          'shrink-0 flex items-center border-b border-[var(--color-sidebar-border)]',
          collapsed ? 'justify-center h-[52px] px-0 lg:px-0' : 'h-[52px] px-3 gap-2.5',
        ].join(' ')}>

          {/* Logo icon */}
          <button
            onClick={collapsed ? toggleCollapse : undefined}
            title={collapsed ? t('sidebar.expand') : undefined}
            className={[
              'w-8 h-8 bg-primary rounded-[var(--border-radius-base)] flex items-center justify-center text-white shrink-0',
              collapsed ? 'hover:opacity-90 cursor-pointer' : 'cursor-default',
            ].join(' ')}
          >
            <Factory size={16} />
          </button>

          {showExpandedHeader && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-bold text-[var(--color-text)] truncate leading-tight">{sidebarCompanyTitle}</p>
                <p className="text-[10px] text-[var(--color-text-muted)] truncate leading-tight">{t('sidebar.systemName')}</p>
              </div>

              {/* Desktop collapse */}
              <button
                onClick={toggleCollapse}
                title={t('sidebar.collapse')}
                className="hidden lg:flex p-1.5 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] transition-colors shrink-0"
              >
                <PanelLeftClose size={16} />
              </button>

              {/* Mobile close */}
              <button
                onClick={onClose}
                className="lg:hidden p-1.5 rounded-[var(--border-radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </>
          )}
        </div>

        {/* ── Read-only notice ─────────────────────────────────────── */}
        {isReadOnly && !collapsed && (
          <div className="mx-2 mt-2 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-[var(--border-radius-sm)] flex items-center gap-1.5 shrink-0">
            <Eye size={14} className="text-amber-500" />
            <span className="text-[11px] font-semibold text-amber-700">{t('sidebar.readOnlyMode')}</span>
          </div>
        )}

        {/* ── Navigation ───────────────────────────────────────────── */}
        <nav className={['flex-1 overflow-y-auto overflow-x-hidden py-2', collapsed ? 'px-1.5' : 'px-2'].join(' ')}>
          {visibleGroups.map((group, gIdx) => {
            const active = isActiveGroup(group.key);
            const isOpen = alwaysExpandAccordions || openGroup === group.key;
            const totalBadge = group.children.reduce((s, c) => s + (badgeCounts[c.key] || 0), 0);
            const { iconColor, activeBg } = getIconClasses(group.key, sidebarIconStyle);

            /* ── Flat group: direct links (no accordion header) ── */
            if (group.flat) {
              if (collapsed) {
                return (
                  <React.Fragment key={group.key}>
                    {group.children.map((item) => {
                      const itemActive = isActiveItem(item);
                      const badge      = badgeCounts[item.key] || 0;
                      return (
                        <div key={item.key} className="relative mb-0.5 group/nav">
                          <NavLink
                            to={withTenantPath(tenantSlug, item.path)}
                            className={[
                              'w-full flex justify-center items-center h-9 rounded-[var(--border-radius-sm)] transition-colors',
                              itemActive
                                ? `${activeBg} ${iconColor}`
                                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]',
                            ].join(' ')}
                          >
                            {renderSidebarIcon(item.icon, undefined, 18)}
                            {badge > 0 && (
                              <span className="absolute top-0.5 left-0.5 w-2 h-2 bg-rose-500 rounded-full" />
                            )}
                          </NavLink>
                          <span className={`pointer-events-none absolute ${tooltipSideClass} top-1/2 -translate-y-1/2 px-2 py-1 rounded-[var(--border-radius-sm)] bg-[#1f272e] text-white text-[11px] font-semibold whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity shadow-lg z-[60]`}>
                            {item.label}
                          </span>
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              }

              return (
                <div key={group.key} className={gIdx > 0 ? 'mt-1' : ''}>
                  {gIdx > 0 && (
                    <div className="h-px bg-[var(--color-sidebar-border)] mx-2 mb-1" />
                  )}
                  {group.children.map((item) => {
                    const itemActive = isActiveItem(item);
                    const badge      = badgeCounts[item.key] || 0;
                    return (
                      <NavLink
                        key={item.key}
                        to={withTenantPath(tenantSlug, item.path)}
                        className={[
                          'relative flex items-center gap-2 px-2 py-2 rounded-[var(--border-radius-sm)] text-[13px] transition-colors select-none text-start',
                          itemActive
                            ? `${activeBg} ${iconColor} font-semibold`
                            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] font-medium',
                        ].join(' ')}
                      >
                        {itemActive && (
                          <span className={`absolute ${activeIndicatorClass} top-1/2 -translate-y-1/2 w-0.5 h-4 bg-current`} />
                        )}
                        <span className={`shrink-0 ${itemActive ? iconColor : 'text-[var(--color-text-muted)]'}`}>
                          {renderSidebarIcon(item.icon, undefined, 17)}
                        </span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {badge > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-rose-500 text-white rounded-full shrink-0">
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              );
            }

            /* ── Collapsed: icon-only pill ── */
            if (collapsed) {
              return (
                <div key={group.key} className="relative mb-0.5 group/nav">
                  <button
                    title={group.label}
                    onClick={() => { toggleCollapse(); setOpenGroup(group.key); }}
                    className={[
                      'w-full flex justify-center items-center h-9 rounded-[var(--border-radius-sm)] transition-colors cursor-pointer',
                      active
                        ? `${activeBg} ${iconColor}`
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]',
                    ].join(' ')}
                  >
                    {renderSidebarIcon(group.icon, undefined, 18)}
                    {totalBadge > 0 && (
                      <span className="absolute top-0.5 left-0.5 w-2 h-2 bg-rose-500 rounded-full" />
                    )}
                  </button>
                  {/* Tooltip towards content (left side for RTL right sidebar) */}
                  <span className={`pointer-events-none absolute ${tooltipSideClass} top-1/2 -translate-y-1/2 px-2 py-1 rounded-[var(--border-radius-sm)] bg-[#1f272e] text-white text-[11px] font-semibold whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity shadow-lg z-[60]`}>
                    {group.label}
                  </span>
                </div>
              );
            }

            /* ── Expanded: accordion group ── */
            return (
              <div key={group.key} className={gIdx > 0 ? 'mt-1' : ''}>
                {/* Separator line between groups (except first) */}
                {gIdx > 0 && (
                  <div className="h-px bg-[var(--color-sidebar-border)] mx-2 mb-1" />
                )}

                {/* Group header button */}
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => {
                    if (alwaysExpandAccordions) return;
                    toggleGroup(group.key);
                  }}
                  className={[
                    'w-full flex items-center gap-2 px-2 py-2 rounded-[var(--border-radius-sm)] transition-colors select-none text-start',
                    alwaysExpandAccordions ? 'cursor-default' : '',
                    active
                      ? `${iconColor} font-semibold`
                      : 'text-[var(--color-text)] font-medium hover:bg-[var(--color-surface-hover)]',
                  ].join(' ')}
                >
                  <span className={['shrink-0', active ? iconColor : 'text-[var(--color-text-muted)]'].join(' ')}>
                    {renderSidebarIcon(group.icon, undefined, 17)}
                  </span>
                  <span className="flex-1 text-[13px] truncate">{group.label}</span>
                  {totalBadge > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-rose-500 text-white rounded-full shrink-0">
                      {totalBadge > 99 ? '99+' : totalBadge}
                    </span>
                  )}
                  <ChevronLeft
                    size={14}
                    className={`text-[var(--color-text-muted)] transition-transform duration-200 shrink-0 ${isOpen ? '-rotate-90' : ''}`}
                  />
                </button>

                {/* Sub-items */}
                <div className={[
                  'grid transition-all duration-200 ease-in-out',
                  isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                ].join(' ')}>
                  <div className="overflow-hidden">
                    <div className={nestedContainerClass}>
                      {group.children.map((item) => {
                        const itemActive = isActiveItem(item);
                        const badge      = badgeCounts[item.key] || 0;
                        return (
                          <NavLink
                            key={item.path}
                            to={withTenantPath(tenantSlug, item.path)}
                            className={[
                              `relative flex items-center gap-2 ${nestedItemPaddingClass} py-1.5 rounded-[var(--border-radius-sm)] text-[12.5px] transition-colors`,
                              itemActive
                                ? `${activeBg} ${iconColor} font-semibold`
                                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] font-medium',
                            ].join(' ')}
                          >
                            {/* Active right-border indicator */}
                            {itemActive && (
                              <span className={`absolute ${activeIndicatorClass} top-1/2 -translate-y-1/2 w-0.5 h-4 bg-current`} />
                            )}
                            <span className={`shrink-0 ${itemActive ? iconColor : 'text-[var(--color-text-muted)]'}`}>
                              {renderSidebarIcon(item.icon, undefined, 15)}
                            </span>
                            <span className="flex-1 truncate">{item.label}</span>
                            {badge > 0 && (
                              <span className="min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-bold bg-rose-500 text-white rounded-full shrink-0">
                                {badge > 99 ? '99+' : badge}
                              </span>
                            )}
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        {/* ── Profile ──────────────────────────────────────────────── */}
        <div
          ref={profileRef}
          className="shrink-0 border-t border-[var(--color-sidebar-border)]"
        >
          {collapsed ? (
            <div className="p-1.5 flex justify-center">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                title={userDisplayName ?? t('sidebar.user')}
                className="group/prof relative w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center ring-1 ring-primary/25 hover:ring-primary/40 transition-all"
              >
                <span className="text-primary font-bold text-xs">
                  {(userDisplayName ?? 'U').charAt(0).toUpperCase()}
                </span>
                <span className={`pointer-events-none absolute ${tooltipSideClass} top-1/2 -translate-y-1/2 px-2 py-1 rounded-[var(--border-radius-sm)] bg-[#1f272e] text-white text-[11px] font-semibold whitespace-nowrap opacity-0 group-hover/prof:opacity-100 transition-opacity shadow-lg z-[60]`}>
                  {userDisplayName ?? t('sidebar.user')}
                </span>
              </button>
            </div>
          ) : (
            <div className="p-2">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className={[
                  'w-full flex items-center gap-2.5 p-2 rounded-[var(--border-radius-base)] transition-colors text-start',
                  profileOpen
                    ? 'bg-[var(--color-surface-hover)]'
                    : 'hover:bg-[var(--color-surface-hover)]',
                ].join(' ')}
              >
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center ring-1 ring-primary/20 shrink-0">
                  <span className="text-primary font-bold text-xs">
                    {(userDisplayName ?? 'U').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold truncate text-[var(--color-text)] leading-tight">
                    {userDisplayName ?? 'المستخدم'}
                  </p>
                  <span className={`inline-flex items-center px-1.5 py-px rounded text-[10px] font-semibold mt-0.5 ${roleColor}`}>
                    {roleName}
                  </span>
                </div>
                <ChevronDown
                  size={14}
                  className={`text-[var(--color-text-muted)] transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {profileOpen && (
                <div className="mt-1 rounded-[var(--border-radius-base)] border border-[var(--color-border)] overflow-hidden bg-[var(--color-card)]" style={{ boxShadow: 'var(--shadow-dropdown)' }}>
                  <div className="px-3 py-2 border-b border-[var(--color-border)] bg-[#f8f9fa]">
                    <p className="text-[10px] text-[var(--color-text-muted)] font-mono truncate" dir="ltr">
                      {userEmail}
                    </p>
                  </div>
                  <div className="p-1">
                    {can('selfService.view') && (
                      <NavLink
                        to={withTenantPath(tenantSlug, '/self-service')}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--border-radius-sm)] text-[12.5px] font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
                      >
                        <UserCircle2 size={16} className="text-[var(--color-text-muted)]" />
                        <span>{t('sidebar.myProfile')}</span>
                      </NavLink>
                    )}
                    <button
                      onClick={logout}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--border-radius-sm)] text-[12.5px] font-semibold text-rose-600 hover:bg-rose-50 transition-colors text-start border-t border-[var(--color-border)] mt-1 pt-2"
                    >
                      <LogOut size={16} />
                      <span>{t('sidebar.logout')}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
