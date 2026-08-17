import React from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DomainHomePeriodOption = {
  value: string;
  label: string;
};

export type DomainHomeHeroKpi = {
  key: string;
  label: string;
  value: React.ReactNode;
  meta?: React.ReactNode;
  accent?: boolean;
  toneClassName?: string;
  onClick?: () => void;
  active?: boolean;
};

type Props = {
  /** Compact module label shown as the page title. */
  eyebrow?: string;
  hero: DomainHomeHeroKpi[];
  /** Dense KPI grid (more columns) for ops boards with many metrics. */
  denseHero?: boolean;
  children: React.ReactNode;
  periods?: DomainHomePeriodOption[];
  activePeriod?: string;
  onPeriodChange?: (value: string) => void;
  periodExtra?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshLabel?: string;
  rangeLabel?: string;
  secondarySummary?: string;
  secondary?: React.ReactNode;
  className?: string;
  dir?: 'rtl' | 'ltr';
};

/**
 * Shared data-first shell for repair / inventory (and similar) home boards:
 * title + subtitle → hero KPIs → compact period tools → content.
 * `rangeLabel` is the subtitle — never squeezed beside period chips on phones.
 */
export const DomainHomeShell: React.FC<Props> = ({
  eyebrow,
  hero,
  denseHero,
  children,
  periods,
  activePeriod,
  onPeriodChange,
  periodExtra,
  onRefresh,
  refreshing,
  refreshLabel = 'تحديث',
  rangeLabel,
  secondarySummary = 'إجراءات وروابط سريعة',
  secondary,
  className,
  dir,
}) => {
  const showToolbar = Boolean(periods?.length || onRefresh || periodExtra);

  return (
    <div
      className={cn(
        'erp-ds-clean erp-dashboard-theme ops-dash-board ops-dash-board--data-first w-full min-w-0 p-3 sm:p-4 md:p-6',
        className,
      )}
      dir={dir}
    >
      {eyebrow || rangeLabel ? (
        <header className="ops-dash-page-head">
          <div className="ops-dash-page-head__title">
            {eyebrow ? <h1 className="ops-dash-page-title">{eyebrow}</h1> : null}
            {rangeLabel ? <p className="ops-dash-page-subtitle">{rangeLabel}</p> : null}
          </div>
        </header>
      ) : null}

      <div className={cn('ops-dash-kpi-grid', denseHero && 'ops-dash-kpi-grid--dense')}>
        {hero.map((card) => {
          const cardClassName = cn(
            'ops-dash-kpi-card',
            card.accent && 'ops-dash-kpi-card--accent',
            card.toneClassName,
            card.onClick && 'cursor-pointer transition-opacity hover:opacity-90',
            card.active && 'ring-2 ring-primary/40',
          );
          const cardBody = (
            <>
              <p className="ops-dash-kpi-card__label">{card.label}</p>
              <p className="ops-dash-kpi-card__value">{card.value}</p>
              {card.meta != null && card.meta !== false ? (
                <p className="ops-dash-kpi-card__meta">{card.meta}</p>
              ) : null}
            </>
          );
          if (card.onClick) {
            return (
              <button
                key={card.key}
                type="button"
                className={cardClassName}
                onClick={card.onClick}
                aria-pressed={Boolean(card.active)}
              >
                {cardBody}
              </button>
            );
          }
          return (
            <div key={card.key} className={cardClassName}>
              {cardBody}
            </div>
          );
        })}
      </div>

      {showToolbar ? (
        <div className="ops-dash-toolbar">
          <div className="ops-dash-toolbar__periods">
            {(periods || []).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn('ops-dash-period-chip', activePeriod === opt.value && 'is-active')}
                onClick={() => onPeriodChange?.(opt.value)}
              >
                {opt.label}
              </button>
            ))}
            {periodExtra}
          </div>
          <div className="ops-dash-toolbar__meta">
            {onRefresh ? (
              <div className="ops-dash-refresh">
                <button
                  type="button"
                  className="ops-dash-refresh__btn"
                  disabled={refreshing}
                  onClick={onRefresh}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
                  {refreshLabel}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="ops-dash-domain-body space-y-3 md:space-y-4">{children}</div>

      {secondary ? (
        <details className="ops-dash-secondary">
          <summary>{secondarySummary}</summary>
          <div className="ops-dash-secondary__body">{secondary}</div>
        </details>
      ) : null}
    </div>
  );
};
