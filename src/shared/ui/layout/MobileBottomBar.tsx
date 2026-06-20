import React, { useMemo } from 'react';
import { Menu } from 'lucide-react';
import { NavLink, useParams } from 'react-router-dom';
import { MENU_CONFIG, canAccessMenuItem, type MenuItem } from '@/config/menu.config';
import { cn } from '@/lib/utils';
import { withTenantPath } from '@/lib/tenantPaths';
import { usePermission } from '@/utils/permissions';
import { resolveMenuIcon } from './menuIconMap';
import { useSidebarActiveRoute } from './useSidebar';

interface MobileBottomBarProps {
  onMoreClick: () => void;
}

type BottomBarItem = {
  key: string;
  label: string;
  menuItemKey: string;
};

const BOTTOM_BAR_ITEMS: BottomBarItem[] = [
  { key: 'dashboard', label: 'لوحة التحكم', menuItemKey: 'home' },
  { key: 'quick', label: 'إدخال سريع', menuItemKey: 'quick' },
  { key: 'line-workers', label: 'ربط العمالة', menuItemKey: 'line-workers' },
  { key: 'reports', label: 'التقارير', menuItemKey: 'reports' },
];

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

export const MobileBottomBar: React.FC<MobileBottomBarProps> = ({ onMoreClick }) => {
  const { tenantSlug } = useParams<{ tenantSlug?: string }>();
  const { can } = usePermission();
  const { isActiveItem } = useSidebarActiveRoute();

  const visibleItems = useMemo(
    () =>
      BOTTOM_BAR_ITEMS.map((item) => {
        const menuItem = MENU_ITEMS_BY_KEY[item.menuItemKey];
        if (!menuItem || !canAccessMenuItem(can, menuItem)) return null;
        return { ...item, menuItem };
      }).filter(Boolean),
    [can],
  );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-card)]/95 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
      aria-label="التنقل السريع"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1">
        {visibleItems.map((item) => {
          if (!item) return null;
          const active = isActiveItem(item.menuItem);
          const isPrimary = item.key === 'quick';

          return (
            <NavLink
              key={item.key}
              to={withTenantPath(tenantSlug, item.menuItem.path)}
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
