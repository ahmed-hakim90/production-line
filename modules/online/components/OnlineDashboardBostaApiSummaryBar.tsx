import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { BostaMergedAnalytics } from '../utils/bostaMergedAnalytics';
import { bostaCategoryBadgeClass, type BostaStateCategory } from '../utils/bostaStatePresentation';

export type OnlineDashboardBostaApiSummaryBarProps = {
  analytics: BostaMergedAnalytics;
  truncated?: boolean;
  className?: string;
};

const CATEGORY_ORDER: BostaStateCategory[] = [
  'delivered',
  'in_transit',
  'exception',
  'cancelled',
  'unknown',
];

export const OnlineDashboardBostaApiSummaryBar: React.FC<OnlineDashboardBostaApiSummaryBarProps> = ({
  analytics,
  truncated,
  className,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-b border-border bg-muted/20 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-muted-foreground">{t('onlineDispatchDashboard.summaryTotal')}</span>
        <Badge variant="secondary" className="tabular-nums font-semibold">
          {analytics.total}
        </Badge>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{t('onlineDispatchDashboard.summaryNoLocal')}</span>
        <Badge
          variant="outline"
          className={cn(
            'tabular-nums',
            analytics.noLocalCount > 0 && 'border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100',
          )}
        >
          {analytics.noLocalCount}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {CATEGORY_ORDER.map((cat) => {
          const n = analytics.byCategory[cat];
          if (n === 0) return null;
          return (
            <Badge
              key={cat}
              variant="outline"
              className={cn('text-[10px] font-medium tabular-nums', bostaCategoryBadgeClass(cat))}
            >
              {t(`onlineDispatchDashboard.bostaCategoryShort.${cat}`)}: {n}
            </Badge>
          );
        })}
      </div>
      {truncated ? (
        <p className="w-full text-[11px] font-medium text-amber-800 dark:text-amber-200">
          {t('onlineDispatchDashboard.bostaTableTruncated')}
        </p>
      ) : null}
    </div>
  );
};
