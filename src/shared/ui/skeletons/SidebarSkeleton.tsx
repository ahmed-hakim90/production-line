import React from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAppDirection } from '@/src/shared/ui/layout/useAppDirection';

export type SidebarSkeletonProps = {
  /** Match collapsed icon-rail width (desktop). */
  collapsed?: boolean;
  className?: string;
  /** How many nav row placeholders to show. */
  rows?: number;
};

/**
 * In-place sidebar chrome skeleton — same fixed position/width as the real Sidebar.
 */
export function SidebarSkeleton({
  collapsed = false,
  className,
  rows = 8,
}: SidebarSkeletonProps) {
  const { t } = useTranslation();
  const { isRTL } = useAppDirection();
  const widthClass = collapsed ? 'w-[52px]' : 'w-[260px]';

  return (
    <aside
      className={cn(
        widthClass,
        'fixed inset-y-0 z-50 hidden lg:flex flex-col',
        'bg-[var(--color-sidebar-bg)]',
        isRTL ? 'right-0 border-l' : 'left-0 border-r',
        'border-[var(--color-sidebar-border)]',
        className,
      )}
      aria-busy="true"
      aria-label={t('ui.loadingPageContent')}
    >
      <div
        className={cn(
          'shrink-0 flex items-center border-b border-[var(--color-sidebar-border)] h-[52px]',
          collapsed ? 'justify-center px-0' : 'px-3 gap-2.5',
        )}
      >
        <Skeleton className="h-9 w-9 rounded-full shrink-0" />
        {!collapsed && (
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-28 max-w-full" />
            <Skeleton className="h-2.5 w-20 max-w-full" />
          </div>
        )}
      </div>

      <nav className={cn('flex-1 overflow-hidden py-2', collapsed ? 'px-1.5' : 'px-2')}>
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className={cn('mb-1', collapsed ? 'flex justify-center' : 'px-1')}
          >
            {collapsed ? (
              <Skeleton className="h-9 w-9 rounded-[var(--border-radius-sm)]" />
            ) : (
              <div className="flex items-center gap-2.5 h-9 px-2">
                <Skeleton className="h-4 w-4 rounded shrink-0" />
                <Skeleton className={cn('h-3 rounded', i % 3 === 0 ? 'w-24' : i % 3 === 1 ? 'w-32' : 'w-20')} />
              </div>
            )}
          </div>
        ))}
      </nav>

      <div
        className={cn(
          'shrink-0 border-t border-[var(--color-sidebar-border)] h-[56px] flex items-center',
          collapsed ? 'justify-center px-0' : 'px-3 gap-2.5',
        )}
      >
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        {!collapsed && (
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-24 max-w-full" />
            <Skeleton className="h-2.5 w-16 max-w-full" />
          </div>
        )}
      </div>
    </aside>
  );
}
