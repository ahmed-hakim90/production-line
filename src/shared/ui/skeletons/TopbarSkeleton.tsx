import React from 'react';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export type TopbarSkeletonProps = {
  className?: string;
};

/**
 * In-place topbar skeleton — same height/position as the real Topbar.
 */
export function TopbarSkeleton({ className }: TopbarSkeletonProps) {
  const { t } = useTranslation();

  return (
    <header
      className={cn(
        'fixed top-0 inset-x-0 z-30 h-[52px]',
        'border-b border-[var(--color-border)] bg-[var(--color-card)]/95 backdrop-blur-sm',
        className,
      )}
      aria-busy="true"
      aria-label={t('ui.loadingPageContent')}
    >
      <div className="h-full px-3 sm:px-4 flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-[var(--border-radius-sm)] lg:hidden shrink-0" />
        <Skeleton className="hidden lg:block h-8 w-8 rounded-[var(--border-radius-sm)] shrink-0" />
        <Skeleton className="hidden lg:block h-3 w-40 max-w-[30%] rounded" />
        <div className="hidden lg:flex flex-1 max-w-[420px] mx-2">
          <Skeleton className="h-9 w-full rounded-full" />
        </div>
        <div className="flex-1 lg:hidden" />
        <div className="flex items-center gap-1.5 shrink-0 ms-auto">
          <Skeleton className="h-8 w-8 rounded-[var(--border-radius-sm)]" />
          <Skeleton className="h-8 w-8 rounded-[var(--border-radius-sm)]" />
          <Skeleton className="hidden sm:block h-8 w-8 rounded-[var(--border-radius-sm)]" />
        </div>
      </div>
    </header>
  );
}
