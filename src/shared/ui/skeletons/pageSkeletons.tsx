import React from 'react';
import { useTranslation } from 'react-i18next';
import { PageShell } from '@/src/shared/ui/layout/PageShell';
import { cn } from '@/lib/utils';
import { PageHeaderSkeleton } from './PageHeaderSkeleton';
import { KpiRowSkeleton } from './KpiRowSkeleton';
import { FilterBarSkeleton } from './FilterBarSkeleton';
import { TableSkeleton } from './TableSkeleton';
import { ChartCardSkeleton } from './ChartCardSkeleton';
import { DetailSectionsSkeleton } from './DetailSectionsSkeleton';
import { FormSkeleton } from './FormSkeleton';
import { CardGridSkeleton } from './CardGridSkeleton';

export type PageSkeletonVariant = 'list' | 'dashboard' | 'detail' | 'form';

export interface PageContentSkeletonProps {
  variant: PageSkeletonVariant;
  tableRows?: number;
  kpiCount?: number;
  showFilters?: boolean;
  className?: string;
  /** Omit PageShell wrapper (e.g. nested inside detail chrome). */
  bare?: boolean;
}

export function PageContentSkeleton({
  variant,
  tableRows = 8,
  kpiCount = 4,
  showFilters = true,
  className,
  bare = false,
}: PageContentSkeletonProps) {
  const { t } = useTranslation();

  const body = (() => {
    switch (variant) {
      case 'list':
        return (
          <>
            <PageHeaderSkeleton />
            {showFilters && <FilterBarSkeleton />}
            <TableSkeleton rows={tableRows} />
          </>
        );
      case 'dashboard':
        return (
          <>
            <PageHeaderSkeleton />
            <KpiRowSkeleton count={kpiCount} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ChartCardSkeleton />
              <ChartCardSkeleton />
            </div>
            <CardGridSkeleton rows={3} />
          </>
        );
      case 'detail':
        return <DetailSectionsSkeleton />;
      case 'form':
        return (
          <>
            <PageHeaderSkeleton />
            <FormSkeleton />
          </>
        );
      default:
        return null;
    }
  })();

  const content = (
    <div
      className={cn('erp-ds-clean flex flex-col min-w-0', className)}
      style={{ gap: 'var(--page-shell-gap, 1rem)' }}
      aria-busy="true"
      aria-label={t('ui.loadingPageContent')}
    >
      {body}
    </div>
  );

  if (bare) return content;
  return <PageShell>{content}</PageShell>;
}

/** Maps legacy LoadingSkeleton `type` to PageContentSkeleton / CardGridSkeleton. */
export function LegacyLoadingSkeleton({
  rows = 4,
  type = 'card',
}: {
  rows?: number;
  type?: 'card' | 'table' | 'detail';
}) {
  if (type === 'detail') {
    return <PageContentSkeleton variant="detail" bare />;
  }
  if (type === 'table') {
    return (
      <div className="erp-ds-clean">
        <TableSkeleton rows={rows} showHeader={false} />
      </div>
    );
  }
  return (
    <div className="erp-ds-clean">
      <CardGridSkeleton rows={rows} />
    </div>
  );
}
