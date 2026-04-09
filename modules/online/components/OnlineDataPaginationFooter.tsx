import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type OnlineDataPaginationFooterProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  /** Noun for total count, e.g. شحنة / سجل */
  itemLabel?: string;
  className?: string;
};

/**
 * RTL-friendly footer: page info + first/prev/numbered/next/last (matches production Products table pattern).
 */
export const OnlineDataPaginationFooter: React.FC<OnlineDataPaginationFooterProps> = ({
  page,
  totalPages,
  totalItems,
  onPageChange,
  itemLabel = 'سجل',
  className,
}) => {
  if (totalItems === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-3',
        className,
      )}
    >
      <div className="text-sm text-muted-foreground tabular-nums">
        صفحة {page} من {totalPages} — إجمالي {totalItems} {itemLabel}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page === 1}
            onClick={() => onPageChange(1)}
            aria-label="أول صفحة"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
            aria-label="الصفحة السابقة"
          >
            <ChevronRight className="h-4 w-4" />
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
            className="h-8 w-8 p-0"
            disabled={page === totalPages}
            onClick={() => onPageChange(page + 1)}
            aria-label="الصفحة التالية"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page === totalPages}
            onClick={() => onPageChange(totalPages)}
            aria-label="آخر صفحة"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
