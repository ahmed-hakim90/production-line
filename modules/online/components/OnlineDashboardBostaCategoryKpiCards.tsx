import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { BostaMergedAnalytics } from '../utils/bostaMergedAnalytics';
import { bostaCategoryBadgeClass, type BostaStateCategory } from '../utils/bostaStatePresentation';

export type OnlineDashboardBostaCategoryKpiCardsProps = {
  analytics: BostaMergedAnalytics;
  selectedFilter: 'all' | BostaStateCategory;
  onSelectCategory: (cat: 'all' | BostaStateCategory) => void;
  bostaApiSectionId?: string;
  className?: string;
};

const CATEGORY_ORDER: BostaStateCategory[] = [
  'delivered',
  'in_transit',
  'exception',
  'cancelled',
  'unknown',
];

export const OnlineDashboardBostaCategoryKpiCards: React.FC<OnlineDashboardBostaCategoryKpiCardsProps> = ({
  analytics,
  selectedFilter,
  onSelectCategory,
  bostaApiSectionId,
  className,
}) => {
  const { t } = useTranslation();

  const scrollToTable = () => {
    if (bostaApiSectionId) {
      document.getElementById(bostaApiSectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5',
        className,
      )}
    >
      {CATEGORY_ORDER.map((cat) => {
        const n = analytics.byCategory[cat];
        const active = selectedFilter === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => {
              onSelectCategory(active ? 'all' : cat);
              scrollToTable();
            }}
            className={cn(
              'flex min-h-[4.5rem] flex-col rounded-lg border p-3 text-right shadow-sm transition-colors',
              bostaCategoryBadgeClass(cat),
              active && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
              'hover:opacity-95',
            )}
          >
            <span className="text-[11px] font-medium leading-tight opacity-90">
              {t(`onlineDispatchDashboard.bostaCategoryShort.${cat}`)}
            </span>
            <span className="mt-auto text-2xl font-bold tabular-nums">{n}</span>
          </button>
        );
      })}
    </div>
  );
};
