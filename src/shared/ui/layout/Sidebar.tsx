import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronLeft,
  Download,
  Eye,
  Factory,
  PanelLeftClose,
  UserCircle2,
  X,
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { usePermission, useCurrentRole } from '@/utils/permissions';
import { MENU_CONFIG, canAccessMenuItem, type MenuItem } from '@/config/menu.config';
import { isMenuGroupEnabledForPacks } from '@/lib/activityPacks';
import { useSidebar, useSidebarActiveRoute, useSidebarBadges } from './useSidebar';
import type { SidebarIconStyle } from '@/types';
import { resolveMenuIcon } from './menuIconMap';
import { withTenantPath } from '@/lib/tenantPaths';
import { Button } from '@/components/ui/button';
import { useAppDirection } from './useAppDirection';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { isMenuItemOperationPathEnabled } from '@/modules/system/lib/operationPathSettings';
import { warehouseService } from '@/modules/inventory/services/warehouseService';
import { WAREHOUSE_ROLE_LABELS } from '@/modules/inventory/lib/stockLabels';
import { useMaterialsWarehouseScope } from '@/modules/inventory/hooks/useMaterialsWarehouseScope';
import {
  isFactoryProductionMenuVisibleForWarehouseScope,
  isInventoryMenuItemVisibleForWarehouseScope,
  isRepairCenterPartsMenuVisible,
  isRepairPartsReplenishmentMenuVisible,
  resolveAccessibleWarehouseRoles,
} from '@/modules/inventory/lib/inventoryMenuVisibility';
import type { WarehouseRole } from '@/modules/inventory/types';
import {
  resolveUserRepairBranchIds,
  type FirestoreUserWithRepair,
} from '@/modules/repair/types';
import { resolveRepairAccessContext } from '@/modules/repair/utils/repairAccessContext';
import {
  isMaintenanceCenterWarehouseRole,
  repairCenterWarehouseMenuPath,
} from '@/modules/repair/lib/repairCenterWarehouseMenu';

export interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

/* ── ERPNext-style icon colors (colorful mode) */
const COLORFUL_ICON: Record<string, string> = {
  dashboards: 'text-[var(--chart-1)]',
  production: 'text-[var(--chart-2)]',
  inventory:  'text-[var(--chart-7)]',
  hr:         'text-[var(--chart-5)]',
  costs:      'text-[var(--chart-3)]',
  quality:    'text-[var(--chart-6)]',
  repair:     'text-[var(--chart-3)]',
  customers:  'text-[var(--chart-5)]',
  system:     'text-[var(--chart-4)]',
};

const COLORFUL_BG: Record<string, string> = {
  dashboards: 'bg-[color-mix(in_srgb,var(--chart-1)_12%,transparent)]',
  production: 'bg-[color-mix(in_srgb,var(--chart-2)_12%,transparent)]',
  inventory:  'bg-[color-mix(in_srgb,var(--chart-7)_12%,transparent)]',
  hr:         'bg-[color-mix(in_srgb,var(--chart-5)_12%,transparent)]',
  costs:      'bg-[color-mix(in_srgb,var(--chart-3)_12%,transparent)]',
  quality:    'bg-[color-mix(in_srgb,var(--chart-6)_12%,transparent)]',
  repair:     'bg-[color-mix(in_srgb,var(--chart-3)_12%,transparent)]',
  customers:  'bg-[color-mix(in_srgb,var(--chart-5)_12%,transparent)]',
  system:     'bg-[color-mix(in_srgb,var(--chart-4)_12%,transparent)]',
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
      iconColor: COLORFUL_ICON[groupKey] ?? 'text-[var(--color-text-muted)]',
      activeBg:  COLORFUL_BG[groupKey]  ?? 'bg-primary/5',
    };
  }
  if (style === 'primary') {
    return { iconColor: 'text-primary', activeBg: 'bg-primary/8' };
  }
  // muted
  return { iconColor: 'text-[var(--color-text-muted)]', activeBg: 'bg-[var(--color-surface-hover)]' };
}

export const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const { t } = useTranslation();
  const { isRTL } = useAppDirection();
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can }  = usePermission();
  const { roleName, roleColor, isReadOnly } = useCurrentRole();
  const userDisplayName    = useAppStore((s) => s.userDisplayName);
  const userEmail          = useAppStore((s) => s.userEmail);
  const currentEmployee    = useAppStore((s) => s.currentEmployee);
  const logout             = useAppStore((s) => s.logout);
  const sidebarIconStyle   = useAppStore((s) => (s.systemSettings?.theme?.sidebarIconStyle ?? 'colorful') as SidebarIconStyle);
  const operationPaths     = useAppStore((s) => s.systemSettings.operationPaths);
  const tenantActivityPacks = useAppStore((s) => s.tenantActivityPacks);
  const sidebarCompanyTitleRaw = useAppStore((s) => {
    const tenantName = s.tenantCompanyName?.trim();
    if (tenantName) return tenantName;
    const factory = s.systemSettings?.branding?.factoryName?.trim();
    return factory || '';
  });
  const sidebarCompanyTitle = sidebarCompanyTitleRaw || t('sidebar.defaultCompanyName');
  const location        = useLocation();

  const [openGroup,   setOpenGroup]   = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [warehouseNavItems, setWarehouseNavItems] = useState<MenuItem[]>([]);
  const [repairCenterNavItems, setRepairCenterNavItems] = useState<MenuItem[]>([]);
  const profileRef = useRef<HTMLDivElement>(null);
  const {
    filterWarehouses,
    scoped: warehouseScoped,
    warehouseIds: scopedWarehouseIds,
    isMaterialsWarehouseRole,
  } = useMaterialsWarehouseScope();
  const [loadedWarehouseRoles, setLoadedWarehouseRoles] = useState<WarehouseRole[] | null>(null);
  const accessibleWarehouseRoles = useMemo(
    () => resolveAccessibleWarehouseRoles({
      warehouseRoles: loadedWarehouseRoles || [],
      isMaterialsWarehouseRole,
    }),
    [isMaterialsWarehouseRole, loadedWarehouseRoles],
  );
  const userProfile = useAppStore((s) => s.userProfile) as FirestoreUserWithRepair | null;
  const userPermissions = useAppStore((s) => s.userPermissions);
  const systemSettingsFull = useAppStore((s) => s.systemSettings);
  const repairAccess = useMemo(
    () =>
      resolveRepairAccessContext({
        userProfile,
        userRoleName: roleName,
        systemSettings: systemSettingsFull,
        permissions: userPermissions,
      }),
    [userProfile, roleName, systemSettingsFull, userPermissions],
  );

  const { collapsed, toggleCollapse } = useSidebar();
  const badgeCounts   = useSidebarBadges();
  const { isInstalled, canPromptInstall, promptInstall } = usePwaInstall();
  const { isActiveItem, isActiveGroup: isActiveGroupFromConfig, activeGroupKey: configActiveGroupKey } = useSidebarActiveRoute();
  const roles = useAppStore((s) => s.roles);
  const userRoleId = useAppStore((s) => s.userRoleId);
  const roleKey = useMemo(
    () => roles.find((r) => r.id === userRoleId)?.roleKey || null,
    [roles, userRoleId],
  );

  useEffect(() => {
    const canInventory = can('inventory.view');
    const canRepairCenters =
      can('repair.parts.view')
      || can('repair.view')
      || can('sparePartsReplenishment.view')
      || can('sparePartsReplenishment.create')
      || can('sparePartsReplenishment.receive');

    // No dynamic per-warehouse / per-center sidebar lists — navigate via hubs.
    // Scoped users still get a single shortcut to their bound warehouse space.
    setRepairCenterNavItems([]);

    if (!canInventory && !canRepairCenters) {
      setWarehouseNavItems([]);
      setLoadedWarehouseRoles([]);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const warehouseRows = await warehouseService.getActiveWarehouses().catch(() => []);
        if (cancelled) return;

        const scopedRows = filterWarehouses(warehouseRows).filter((w) => Boolean(w.id));
        setLoadedWarehouseRoles(
          scopedRows.map((w) => (w.warehouseRole || 'general') as WarehouseRole),
        );

        if (!canInventory || !warehouseScoped || scopedWarehouseIds.length === 0) {
          setWarehouseNavItems([]);
          return;
        }

        const allowed = new Set(scopedWarehouseIds);
        const boundRows = scopedRows.filter((w) => w.id && allowed.has(w.id));
        setWarehouseNavItems(
          boundRows.map((w) => {
            const role = (w.warehouseRole || 'general') as WarehouseRole;
            const roleLabel = WAREHOUSE_ROLE_LABELS[role] || role;
            const isCenter = isMaintenanceCenterWarehouseRole(role);
            const path = isCenter
              ? repairCenterWarehouseMenuPath(w.id!)
              : `/inventory/warehouses/${w.id}`;
            return {
              key: isCenter ? `repair-wh-space-${w.id}` : `inv-wh-space-${w.id}`,
              label: `${w.name} · ${roleLabel}`,
              icon: 'warehouse' as const,
              path,
              permission: (isCenter ? 'repair.parts.view' : 'inventory.view') as MenuItem['permission'],
              anyOfPermissions: isCenter
                ? (['repair.parts.view', 'inventory.view'] as MenuItem['anyOfPermissions'])
                : undefined,
              activePatterns: [
                `/inventory/warehouses/${w.id}`,
                `/repair/warehouses/${w.id}`,
              ],
            };
          }),
        );
      } catch {
        if (!cancelled) {
          setWarehouseNavItems([]);
          setLoadedWarehouseRoles([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    can,
    filterWarehouses,
    scopedWarehouseIds,
    warehouseScoped,
  ]);

  /**
   * وضع الاختصار (أيقونات فقط) مخصص لسطح المكتب (lg+). على الموبايل، درج القائمة المفتوح
   * يجب أن يعرض الأسماء دائمًا — وإلا يبقى collapsed=true من localStorage فيُخفى النص.
   */
  const navCollapsed = collapsed && !open;
  const showInstallCta = !navCollapsed && !isInstalled && canPromptInstall;

  const visibleGroups = useMemo(
    () =>
      MENU_CONFIG
        .filter((g) => isMenuGroupEnabledForPacks(g.key, tenantActivityPacks))
        .map((g) => {
          const children = g.children.filter((i) => (
            canAccessMenuItem(can, i, roleKey)
            && isMenuItemOperationPathEnabled(operationPaths, i.key)
            && (!i.selfSupervisorOnly || currentEmployee?.level === 2)
            && (
              g.key !== 'inventory'
              || isInventoryMenuItemVisibleForWarehouseScope({
                menuKey: i.key,
                scoped: warehouseScoped,
                accessibleWarehouseRoles,
              })
            )
            && (
              i.key !== 'packaging-control'
              || isFactoryProductionMenuVisibleForWarehouseScope({
                accessibleWarehouseRoles,
                warehouseScoped,
              })
            )
            && (
              i.key !== 'repair-parts-replenishment'
              || isRepairPartsReplenishmentMenuVisible({
                accessibleWarehouseRoles,
                warehouseScoped,
                userRepairBranchIds: resolveUserRepairBranchIds(userProfile),
                canViewAllBranches:
                  repairAccess.canViewAllBranches || repairAccess.adminSeesAllBranches,
              })
            )
            && (
              (i.key !== 'repair-parts' && i.key !== 'repair-spare-issues')
              || isRepairCenterPartsMenuVisible({
                accessibleWarehouseRoles,
                warehouseScoped,
                userRepairBranchIds: resolveUserRepairBranchIds(userProfile),
                canViewAllBranches:
                  repairAccess.canViewAllBranches || repairAccess.adminSeesAllBranches,
              })
            )
          ));

          if (g.key === 'inventory' && warehouseNavItems.length > 0) {
            const insertAfterKey = children.some((item) => item.key === 'inv-warehouses')
              ? 'inv-warehouses'
              : 'inv-dashboard';
            const insertAt = Math.max(
              0,
              children.findIndex((item) => item.key === insertAfterKey) + 1,
            );
            return {
              ...g,
              children: [
                ...children.slice(0, insertAt),
                ...warehouseNavItems.filter((item) => canAccessMenuItem(can, item, roleKey)),
                ...children.slice(insertAt),
              ],
            };
          }

          if (g.key === 'repair' && repairCenterNavItems.length > 0) {
            const insertAfterKey = children.some((item) => item.key === 'repair-parts')
              ? 'repair-parts'
              : 'repair-jobs';
            const insertAt = Math.max(
              0,
              children.findIndex((item) => item.key === insertAfterKey) + 1,
            );
            return {
              ...g,
              children: [
                ...children.slice(0, insertAt),
                ...repairCenterNavItems.filter((item) => canAccessMenuItem(can, item, roleKey)),
                ...children.slice(insertAt),
              ],
            };
          }

          return { ...g, children };
        })
        .filter((g) => g.children.length > 0),
    [
      accessibleWarehouseRoles,
      can,
      currentEmployee?.level,
      operationPaths,
      tenantActivityPacks,
      repairAccess.adminSeesAllBranches,
      repairAccess.canViewAllBranches,
      repairCenterNavItems,
      roleKey,
      userProfile,
      warehouseNavItems,
      warehouseScoped,
    ],
  );

  const activeGroupKey = useMemo(() => {
    const fromVisible = visibleGroups.find((g) => g.children.some((i) => isActiveItem(i)))?.key;
    return fromVisible || configActiveGroupKey;
  }, [visibleGroups, isActiveItem, configActiveGroupKey]);

  const isActiveGroup = useCallback(
    (groupKey: string) => (
      visibleGroups.some((g) => g.key === groupKey && g.children.some((i) => isActiveItem(i)))
      || isActiveGroupFromConfig(groupKey)
    ),
    [visibleGroups, isActiveItem, isActiveGroupFromConfig],
  );

  /** مجموعات الأكورديون فقط (غير flat). لو 1 أو 2 يبقوا مفتوحين دائماً في الشريط الموسّع */
  const accordionGroupCount = useMemo(
    () => visibleGroups.filter((g) => !g.flat).length,
    [visibleGroups],
  );
  const alwaysExpandAccordions = accordionGroupCount >= 1 && accordionGroupCount <= 2;

  useEffect(() => { onClose(); setProfileOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (activeGroupKey && !navCollapsed) setOpenGroup(activeGroupKey);
  }, [activeGroupKey, navCollapsed]);

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
          navCollapsed ? 'justify-center h-[52px] px-0 lg:px-0' : 'h-[52px] px-3 gap-2.5',
        ].join(' ')}>

          {/* Logo icon */}
          <button
            onClick={collapsed ? toggleCollapse : undefined}
            title={collapsed ? t('sidebar.expand') : undefined}
            className={[
              'w-9 h-9 bg-primary rounded-full flex items-center justify-center text-white shrink-0 shadow-sm shadow-primary/25',
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
        {isReadOnly && !navCollapsed && (
          <div className="mx-2 mt-2 px-2.5 py-1.5 bg-[rgb(var(--color-warning)/0.1)] border border-[rgb(var(--color-warning)/0.25)] rounded-[var(--border-radius-sm)] flex items-center gap-1.5 shrink-0">
            <Eye size={14} className="text-[rgb(var(--color-warning))]" />
            <span className="text-[11px] font-semibold text-[rgb(var(--color-warning))]">{t('sidebar.readOnlyMode')}</span>
          </div>
        )}

        {/* ── Navigation ───────────────────────────────────────────── */}
        <nav className={['flex-1 overflow-y-auto overflow-x-hidden py-2', navCollapsed ? 'px-1.5' : 'px-2'].join(' ')}>
          {visibleGroups.map((group, gIdx) => {
            const active = isActiveGroup(group.key);
            const isOpen = alwaysExpandAccordions || openGroup === group.key;
            const totalBadge = group.children.reduce((s, c) => s + (badgeCounts[c.key] || 0), 0);
            const { iconColor, activeBg } = getIconClasses(group.key, sidebarIconStyle);

            /* ── Flat group: direct links (no accordion header) ── */
            if (group.flat) {
              if (navCollapsed) {
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
                              <span className="absolute top-0.5 left-0.5 w-2 h-2 bg-[rgb(var(--color-danger)/0.1)]0 rounded-full" />
                            )}
                          </NavLink>
                          <span className={`pointer-events-none absolute ${tooltipSideClass} top-1/2 -translate-y-1/2 px-2 py-1 rounded-[var(--border-radius-sm)] bg-[var(--color-text)] text-white text-[11px] font-semibold whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity shadow-lg z-[60]`}>
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
                          'relative flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] transition-colors select-none text-start',
                          itemActive
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] font-medium',
                        ].join(' ')}
                      >
                        {itemActive && (
                          <span className={`absolute ${activeIndicatorClass} top-1/2 -translate-y-1/2 w-1 h-5 bg-primary`} />
                        )}
                        <span className={`shrink-0 ${itemActive ? 'text-primary' : 'text-[var(--color-text-muted)]'}`}>
                          {renderSidebarIcon(item.icon, undefined, 17)}
                        </span>
                        <span className="flex-1 truncate">{item.label}</span>
                        {badge > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-[rgb(var(--color-danger)/0.1)]0 text-white rounded-full shrink-0">
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
            if (navCollapsed) {
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
                      <span className="absolute top-0.5 left-0.5 w-2 h-2 bg-[rgb(var(--color-danger)/0.1)]0 rounded-full" />
                    )}
                  </button>
                  {/* Tooltip towards content (left side for RTL right sidebar) */}
                  <span className={`pointer-events-none absolute ${tooltipSideClass} top-1/2 -translate-y-1/2 px-2 py-1 rounded-[var(--border-radius-sm)] bg-[var(--color-text)] text-white text-[11px] font-semibold whitespace-nowrap opacity-0 group-hover/nav:opacity-100 transition-opacity shadow-lg z-[60]`}>
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
                    <span className="min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold bg-[rgb(var(--color-danger)/0.1)]0 text-white rounded-full shrink-0">
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
                              `relative flex items-center gap-2 ${nestedItemPaddingClass} py-1.5 rounded-xl text-[12.5px] transition-colors`,
                              itemActive
                                ? 'bg-primary/10 text-primary font-semibold'
                                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] font-medium',
                            ].join(' ')}
                          >
                            {itemActive && (
                              <span className={`absolute ${activeIndicatorClass} top-1/2 -translate-y-1/2 w-1 h-4 bg-primary`} />
                            )}
                            <span className={`shrink-0 ${itemActive ? 'text-primary' : 'text-[var(--color-text-muted)]'}`}>
                              {renderSidebarIcon(item.icon, undefined, 15)}
                            </span>
                            <span className="flex-1 truncate">{item.label}</span>
                            {badge > 0 && (
                              <span className="min-w-[16px] h-4 px-1 flex items-center justify-center text-[9px] font-bold bg-[rgb(var(--color-danger)/0.1)]0 text-white rounded-full shrink-0">
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

        {showInstallCta && (
          <div className="shrink-0 px-2.5 pb-2">
            <div className="rounded-2xl bg-primary text-white p-3.5 shadow-md shadow-primary/20">
              <p className="text-[12px] font-bold leading-snug">{t('topbar.install')}</p>
              <p className="text-[10px] text-white/75 mt-1 leading-relaxed">
                ثبّت التطبيق للوصول السريع من الشاشة الرئيسية
              </p>
              <button
                type="button"
                onClick={() => { void promptInstall(); }}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--color-card)] px-3 py-2 text-[12px] font-bold text-primary"
              >
                <Download size={14} />
                {t('topbar.install')}
              </button>
            </div>
          </div>
        )}

        {/* ── Profile ──────────────────────────────────────────────── */}
        <div
          ref={profileRef}
          className="shrink-0 border-t border-[var(--color-sidebar-border)]"
        >
          {navCollapsed ? (
            <div className="p-1.5 flex justify-center">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                title={userDisplayName ?? t('sidebar.user')}
                className="group/prof relative w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center ring-1 ring-primary/25 hover:ring-primary/40 transition-all"
              >
                <span className="text-primary font-bold text-xs">
                  {(userDisplayName ?? 'U').charAt(0).toUpperCase()}
                </span>
                <span className={`pointer-events-none absolute ${tooltipSideClass} top-1/2 -translate-y-1/2 px-2 py-1 rounded-[var(--border-radius-sm)] bg-[var(--color-text)] text-white text-[11px] font-semibold whitespace-nowrap opacity-0 group-hover/prof:opacity-100 transition-opacity shadow-lg z-[60]`}>
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
                  <div className="px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                    <p className="text-[10px] text-[var(--color-text-muted)] font-mono truncate" dir="ltr">
                      {userEmail}
                    </p>
                  </div>
                  <div className="p-1">
                    {can('selfService.view') && (
                      <NavLink
                        to={withTenantPath(tenantSlug, '/hr/self-service')}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-[var(--border-radius-sm)] text-[12.5px] font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
                      >
                        <UserCircle2 size={16} className="text-[var(--color-text-muted)]" />
                        <span>{t('sidebar.myProfile')}</span>
                      </NavLink>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={logout}
                      iconName="logout"
                      tone="delete"
                      solid={false}
                      className="!w-full !justify-start gap-2.5 !px-2.5 !py-2 !rounded-[var(--border-radius-sm)] !text-[12.5px] font-semibold border-t border-[var(--color-border)] mt-1 pt-2"
                    >
                      تسجيل الخروج
                    </Button>
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
