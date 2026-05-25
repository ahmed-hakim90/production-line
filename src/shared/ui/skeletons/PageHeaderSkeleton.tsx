import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { skeletonBlockClass } from './skeletonStyles';

export function PageHeaderSkeleton({ className }: { className?: string }) {
  return (
    <header className={cn('erp-page-head !flex-col !items-stretch gap-3', className)}>
      <div className="flex w-full flex-wrap items-start justify-between gap-3">
        <div className="erp-page-title-block min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2.5">
            <Skeleton className={cn('h-9 w-9 shrink-0 rounded-[var(--border-radius-lg)]', skeletonBlockClass)} />
            <Skeleton className={cn('h-7 w-48 max-w-[70%] rounded-md', skeletonBlockClass)} />
          </div>
          <Skeleton className={cn('h-4 w-64 max-w-[85%] rounded-md', skeletonBlockClass)} />
        </div>
        <div className="erp-page-actions flex gap-2">
          <Skeleton className={cn('h-9 w-24 rounded-[var(--border-radius-md)]', skeletonBlockClass)} />
          <Skeleton className={cn('h-9 w-28 rounded-[var(--border-radius-md)]', skeletonBlockClass)} />
        </div>
      </div>
    </header>
  );
}
