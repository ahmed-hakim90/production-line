import React, { useMemo } from 'react';
import { Menu } from 'lucide-react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { MENU_CONFIG, type MenuItem } from '@/config/menu.config';
import { cn } from '@/lib/utils';
import { logicalPathnameFromLocation, withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '@/utils/permissions';
import { useAppStore } from '@/store/useAppStore';
import { isMenuItemOperationPathEnabled } from '@/modules/system/lib/operationPathSettings';
import { resolveMenuIcon } from './menuIconMap';
import { useSidebarActiveRoute } from './useSidebar';
import { resolveVisibleRepairBottomBarItems } from './repairBottomBar';

interface RepairMobileBottomBarProps {
  onMoreClick: () => void;
}

const MENU_ITEMS_BY_KEY = MENU_CONFIG.reduce<Record<string, MenuItem>>((acc, group) => {
  group.children.forEach((item) => {
    acc[item.key] = item;
  });
  return acc;
}, {});

function renderIcon(name?: string, className?: string, size = 20) {
  const Icon = resolveMenuIcon(name);
  return <Icon size={size} className={className} />;
}

export const RepairMobileBottomBar: React.FC<RepairMobileBottomBarProps> = ({ onMoreClick }) => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const location = useLocation();
  const { can } = usePermission();
  const { isActiveItem } = useSidebarActiveRoute();
  const roles = useAppStore((s) => s.roles);
  const userRoleId = useAppStore((s) => s.userRoleId);
  const operationPaths = useAppStore((s) => s.systemSettings.operationPaths);
  const roleKey = useMemo(
    () => roles.find((r) => r.id === userRoleId)?.roleKey || null,
    [roles, userRoleId],
  );
  const logicalPath = useMemo(
    () => logicalPathnameFromLocation(location.pathname),
    [location.pathname],
  );
  const hideForWorkshopFocus = /^\/repair\/jobs\/[^/]+\/workspace\/?$/.test(logicalPath);

  const visibleItems = useMemo(
    () =>
      resolveVisibleRepairBottomBarItems({
        can,
        roleKey,
        menuItemsByKey: MENU_ITEMS_BY_KEY,
        isOperationPathEnabled: (menuItemKey) =>
          isMenuItemOperationPathEnabled(operationPaths, menuItemKey),
      }),
    [can, operationPaths, roleKey],
  );

  const columnCount = Math.max(2, visibleItems.length + 1);

  // Focus mode: workshop work screen owns the bottom CTA — hide nav chrome.
  if (hideForWorkshopFocus) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-card)]/95 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
      aria-label="تنقل الصيانة السريع"
    >
      <div
        className="mx-auto grid max-w-md items-end gap-1"
        style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
      >
        {visibleItems.map((item) => {
          const active =
            (item.path === '/'
              && (logicalPath === '/' || logicalPath === '' || logicalPath === item.menuItem.path))
            || (item.path !== '/' && isActiveItem(item.menuItem));
          const isPrimary = Boolean(item.primary);

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
