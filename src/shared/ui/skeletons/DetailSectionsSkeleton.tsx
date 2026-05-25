import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { KpiRowSkeleton } from './KpiRowSkeleton';
import { skeletonBlockClass, skeletonCardClass } from './skeletonStyles';

export function DetailSectionsSkeleton({
  sections = 3,
  className,
}: {
  sections?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-3">
        <Skeleton className={cn('h-12 w-12 rounded-[var(--border-radius-lg)]', skeletonBlockClass)} />
        <div className="flex-1 space-y-2">
          <Skeleton className={cn('h-4 w-1/3 rounded-md', skeletonBlockClass)} />
          <Skeleton className={cn('h-3 w-1/4 rounded-md', skeletonBlockClass)} />
        </div>
      </div>
      <KpiRowSkeleton count={4} />
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} className={cn(skeletonCardClass, 'overflow-hidden')}>
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <Skeleton className={cn('h-4 w-40 rounded-md', skeletonBlockClass)} />
          </div>
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className={cn('h-4 w-full rounded-md', skeletonBlockClass)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
