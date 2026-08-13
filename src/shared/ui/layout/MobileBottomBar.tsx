import React, { useMemo } from 'react';
import { Menu } from 'lucide-react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { MENU_CONFIG, canAccessMenuItem, type MenuItem } from '@/config/menu.config';
import { isMenuGroupEnabledForPacks } from '@/lib/activityPacks';
import { cn } from '@/lib/utils';
import { logicalPathnameFromLocation, withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { resolveMenuIcon } from './menuIconMap';
import { useSidebarActiveRoute } from './useSidebar';
import { isMenuItemOperationPathEnabled } from '@/modules/system/lib/operationPathSettings';
import {
  isWarehouseBottomBarItemActive,
  resolveVisibleWarehouseBottomBarItems,
  type ResolvedWarehouseBottomBarItem,
} from './warehouseBottomBar';

interface MobileBottomBarProps {
  onMoreClick: () => void;
}

type FactoryBottomBarItem = {
  key: string;
  label: string;
  menuItemKey: string;
  primary?: boolean;
  menuItem: MenuItem;
  path: string;
};

const FACTORY_BOTTOM_BAR_ITEMS: Array<{
  key: string;
  label: string;
  menuItemKey: string;
  primary?: boolean;
}> = [
  { key: 'dashboard', label: 'لوحة التحكم', menuItemKey: 'home' },
  { key: 'quick', label: 'إدخال سريع', menuItemKey: 'quick', primary: true },
  { key: 'line-workers', label: 'ربط العمالة', menuItemKey: 'line-workers' },
  { key: 'reports', label: 'التقارير', menuItemKey: 'reports' },
];

const MENU_ITEMS_BY_KEY = MENU_CONFIG.reduce<Record<string, MenuItem>>((acc, group) => {
  group.children.forEach((item) => {
    acc[item.key] = item;
  });
  return acc;
}, {});

const MENU_GROUP_BY_ITEM_KEY = MENU_CONFIG.reduce<Record<string, string>>((acc, group) => {
  group.children.forEach((item) => {
    acc[item.key] = group.key;
  });
  return acc;
}, {});

function renderIcon(name?: string, className?: string, size = 20) {
  const Icon = resolveMenuIcon(name);
  return <Icon size={size} className={className} />;
}

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({ onMoreClick }) => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const location = useLocation();
  const { can } = usePermission();
  const { isActiveItem } = useSidebarActiveRoute();
  const roles = useAppStore((s) => s.roles);
  const userRoleId = useAppStore((s) => s.userRoleId);
  const inventoryWarehouseId = useAppStore((s) => s.userProfile?.inventoryWarehouseId);
  const userRoleName = useAppStore((s) => s.userRoleName);
  const operationPaths = useAppStore((s) => s.systemSettings.operationPaths);
  const tenantActivityPacks = useAppStore((s) => s.tenantActivityPacks);
  const roleKey = useMemo(
    () => roles.find((r) => r.id === userRoleId)?.roleKey || null,
    [roles, userRoleId],
  );
  const logicalPath = useMemo(
    () => logicalPathnameFromLocation(location.pathname),
    [location.pathname],
  );

  const warehouseItems = useMemo(
    () =>
      resolveVisibleWarehouseBottomBarItems({
        can,
        roleKey,
        roleName: userRoleName,
        boundWarehouseId: inventoryWarehouseId,
        menuItemsByKey: MENU_ITEMS_BY_KEY,
        isOperationPathEnabled: (menuItemKey) =>
          isMenuItemOperationPathEnabled(operationPaths, menuItemKey)
          && isMenuGroupEnabledForPacks(
            MENU_GROUP_BY_ITEM_KEY[menuItemKey] || '',
            tenantActivityPacks,
          ),
      }),
    [can, inventoryWarehouseId, operationPaths, roleKey, tenantActivityPacks, userRoleName],
  );

  const factoryItems = useMemo(
    () =>
      FACTORY_BOTTOM_BAR_ITEMS.map((item) => {
        const menuItem = MENU_ITEMS_BY_KEY[item.menuItemKey];
        const groupKey = MENU_GROUP_BY_ITEM_KEY[item.menuItemKey];
        if (
          !menuItem
          || (groupKey && !isMenuGroupEnabledForPacks(groupKey, tenantActivityPacks))
          || !canAccessMenuItem(can, menuItem, roleKey)
          || !isMenuItemOperationPathEnabled(operationPaths, menuItem.key)
        ) return null;
        return { ...item, menuItem, path: menuItem.path };
      }).filter((item): item is FactoryBottomBarItem => Boolean(item)),
    [can, operationPaths, roleKey, tenantActivityPacks],
  );

  const visibleItems: Array<FactoryBottomBarItem | ResolvedWarehouseBottomBarItem> =
    warehouseItems.length > 0 ? warehouseItems : factoryItems;
  const hasPrimary = visibleItems.some((item) => item.primary || item.key === 'quick');
  const columnCount = Math.max(2, visibleItems.length + 1);

  return (
    <nav
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-card)]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur lg:hidden',
        hasPrimary ? 'pt-5' : 'pt-1.5',
      )}
      aria-label="التنقل السريع"
      data-hakimo-flow="bottom-nav"
    >
      <div
        className="mx-auto grid max-w-md items-end gap-1"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {visibleItems.map((item) => {
          const isWarehouseItem = warehouseItems.length > 0;
          const active = isWarehouseItem
            ? isWarehouseBottomBarItemActive(
                item as ResolvedWarehouseBottomBarItem,
                logicalPath,
                isActiveItem,
              )
            : isActiveItem(item.menuItem);
          const isPrimary = Boolean(item.primary || item.key === 'quick');

          return (
            <NavLink
              key={item.key}
              to={withTenantPath(tenantSlug, item.path)}
              className={cn(
                'group flex min-w-0 flex-col items-center justify-end gap-1 rounded-[var(--border-radius-base)] px-1 py-1.5 text-[10.5px] font-bold transition-colors',
                active
                  ? 'text-primary'
                  : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]',
                isPrimary && 'relative -mt-5',
              )}
            >
              <span
                className={cn(
                  'flex items-center justify-center rounded-full transition-colors',
                  isPrimary
                    ? 'h-11 w-11 border-4 border-[var(--color-card)] bg-primary text-white shadow-lg shadow-primary/25'
                    : 'h-7 w-7',
                  active && !isPrimary && 'bg-primary/10',
                )}
              >
                {renderIcon(item.menuItem.icon, undefined, isPrimary ? 21 : 19)}
              </span>
              <span className="w-full truncate text-center leading-tight">{item.label}</span>
            </NavLink>
          );
        })}

        <button
          type="button"
          onClick={onMoreClick}
          className="flex min-w-0 flex-col items-center justify-end gap-1 rounded-[var(--border-radius-base)] px-1 py-1.5 text-[10.5px] font-bold text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]"
          aria-label="فتح القائمة الجانبية"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full">
            <Menu size={20} />
          </span>
          <span className="w-full truncate text-center leading-tight">المزيد</span>
        </button>
      </div>
    </nav>
  );
};
