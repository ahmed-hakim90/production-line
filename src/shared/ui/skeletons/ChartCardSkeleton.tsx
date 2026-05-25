import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { skeletonBlockClass, skeletonCardClass } from './skeletonStyles';

export function ChartCardSkeleton({ className, height = 'h-56' }: { className?: string; height?: string }) {
  return (
    <div className={cn(skeletonCardClass, 'p-4 space-y-3', className)}>
      <Skeleton className={cn('h-4 w-1/3 rounded-md', skeletonBlockClass)} />
      <Skeleton className={cn('w-full rounded-[var(--border-radius-lg)]', height, skeletonBlockClass)} />
    </div>
  );
}
