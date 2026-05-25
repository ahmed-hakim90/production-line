import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { skeletonBlockClass, skeletonCardClass } from './skeletonStyles';

/** Legacy `LoadingSkeleton type="card"` grid layout. */
export function CardGridSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn(skeletonCardClass, 'space-y-3 p-4')}>
          <Skeleton className={cn('h-4 w-2/3 rounded-md', skeletonBlockClass)} />
          <Skeleton className={cn('h-3 w-1/2 rounded-md', skeletonBlockClass)} />
          <Skeleton className={cn('h-3 w-full rounded-md', skeletonBlockClass)} />
          <Skeleton className={cn('h-3 w-4/5 rounded-md', skeletonBlockClass)} />
        </div>
      ))}
    </div>
  );
}
