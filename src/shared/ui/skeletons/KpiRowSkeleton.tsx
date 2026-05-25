import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { skeletonBlockClass, skeletonCardClass } from './skeletonStyles';

export function KpiRowSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4',
        count > 4 && 'xl:grid-cols-6',
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn(skeletonCardClass, 'p-4 space-y-3')}>
          <Skeleton className={cn('h-3 w-2/3 rounded-md', skeletonBlockClass)} />
          <Skeleton className={cn('h-8 w-1/2 rounded-md', skeletonBlockClass)} />
          <Skeleton className={cn('h-3 w-1/3 rounded-md', skeletonBlockClass)} />
        </div>
      ))}
    </div>
  );
}
