import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { skeletonBlockClass, skeletonCardClass } from './skeletonStyles';

export function FormSkeleton({ fields = 6, className }: { fields?: number; className?: string }) {
  return (
    <div className={cn(skeletonCardClass, 'space-y-5 p-6', className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className={cn('h-3 w-28 rounded-md', skeletonBlockClass)} />
          <Skeleton className={cn('h-10 w-full rounded-[var(--border-radius-md)]', skeletonBlockClass)} />
        </div>
      ))}
      <div className="flex justify-end gap-2 pt-2">
        <Skeleton className={cn('h-9 w-24 rounded-[var(--border-radius-md)]', skeletonBlockClass)} />
        <Skeleton className={cn('h-9 w-28 rounded-[var(--border-radius-md)]', skeletonBlockClass)} />
      </div>
    </div>
  );
}
