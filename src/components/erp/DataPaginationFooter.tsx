import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DataPaginationFooterProps = {
  page: number;
  totalPages?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  itemCount?: number;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onPrevious?: () => void;
  onNext?: () => void;
  loading?: boolean;
  /** Noun for total count, e.g. شحنة / سجل */
  itemLabel?: string;
  className?: string;
};

/** RTL-friendly footer: page info + prev/numbered/next (labeled controls only). */
export const DataPaginationFooter: React.FC<DataPaginationFooterProps> = ({
  page,
  totalPages = 1,
  totalItems = 0,
  onPageChange,
  itemCount,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
  loading = false,
  itemLabel = 'سجل',
  className,
}) => {
  const cursorMode = onPrevious != null || onNext != null;
  const visibleCount = itemCount ?? totalItems;
  if (visibleCount === 0 && !loading) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-3',
        className,
      )}
    >
      <div className="text-sm text-muted-foreground tabular-nums">
        {cursorMode
          ? `صفحة ${page} — ${visibleCount} ${itemLabel}`
          : `صفحة ${page} من ${totalPages} — إجمالي ${totalItems} ${itemLabel}`}
      </div>
      {cursorMode ? (
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" className="h-8 px-2.5"
            disabled={!hasPrevious || loading} onClick={onPrevious}>
            السابق
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 px-2.5"
            disabled={!hasNext || loading} onClick={onNext}>
            التالي
          </Button>
        </div>
      ) : totalPages > 1 && onPageChange ? (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2.5"
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
          >
            السابق
          </Button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const start = Math.max(1, Math.min(page - 2, totalPages - 4));
            const p = start + i;
            return p <= totalPages ? (
              <Button
                key={p}
                type="button"
                variant={page === p ? 'default' : 'outline'}
                size="sm"
                className="h-8 min-w-[2rem] px-2"
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            ) : null;
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-2.5"
            disabled={page === totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            التالي
          </Button>
        </div>
      ) : null}
    </div>
  );
};
