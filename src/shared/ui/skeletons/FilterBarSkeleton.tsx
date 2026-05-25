import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { skeletonBlockClass, skeletonCardClass } from './skeletonStyles';

export function FilterBarSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(skeletonCardClass, 'flex flex-wrap items-center gap-3 p-3', className)}>
      <Skeleton className={cn('h-9 w-full min-w-[12rem] flex-1 rounded-[var(--border-radius-md)]', skeletonBlockClass)} />
      <Skeleton className={cn('h-9 w-36 rounded-[var(--border-radius-md)]', skeletonBlockClass)} />
      <Skeleton className={cn('h-9 w-28 rounded-[var(--border-radius-md)]', skeletonBlockClass)} />
    </div>
  );
}
