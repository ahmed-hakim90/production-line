import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { skeletonBlockClass, skeletonCardClass } from './skeletonStyles';

export interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  showHeader?: boolean;
  className?: string;
}

export function TableSkeleton({
  rows = 8,
  columns = 5,
  showHeader = true,
  className,
}: TableSkeletonProps) {
  return (
    <div
      className={cn(skeletonCardClass, 'overflow-hidden', className)}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      {showHeader && (
        <div className="flex gap-3 border-b border-[var(--color-border)] px-4 py-3">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton
              key={`th-${i}`}
              className={cn('h-4 flex-1 rounded-md', skeletonBlockClass, i === columns - 1 && 'max-w-16')}
            />
          ))}
        </div>
      )}
      <div className="space-y-2 p-4">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="flex gap-3">
            {Array.from({ length: columns }).map((_, colIdx) => (
              <Skeleton
                key={`${rowIdx}-${colIdx}`}
                className={cn(
                  'h-9 flex-1 rounded-[var(--border-radius-sm)]',
                  skeletonBlockClass,
                  colIdx === columns - 1 && 'max-w-20',
                )}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
