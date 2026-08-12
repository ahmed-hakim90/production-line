import React from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DomainHomeHeroKpi, DomainHomePeriodOption } from '@/modules/dashboards/components/DomainHomeShell';

export type ModuleOpsHeroKpi = DomainHomeHeroKpi & {
  onClick?: () => void;
  active?: boolean;
};

type Props = {
  /** Compact module label — matches DomainHomeShell eyebrow. */
  eyebrow: string;
  /** Optional dense KPI strip (same visual language as dashboards). */
  hero?: ModuleOpsHeroKpi[];
  denseHero?: boolean;
  periods?: DomainHomePeriodOption[];
  activePeriod?: string;
  onPeriodChange?: (value: string) => void;
  periodExtra?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshLabel?: string;
  rangeLabel?: string;
  /** Primary / secondary actions (create, view toggles, deep links). */
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  dir?: 'rtl' | 'ltr';
};

/**
 * List / ops pages — same ops-dash chrome as DomainHomeShell
 * without forcing a full home-board secondary panel.
 *
 * When there are no hero KPIs, renders a compact page head (title + subtitle +
 * actions) instead of empty dashboard toolbar strips.
 */
export const ModuleOpsPageShell: React.FC<Props> = ({
  eyebrow,
  hero,
  denseHero = true,
  periods,
  activePeriod,
  onPeriodChange,
  periodExtra,
  onRefresh,
  refreshing,
  refreshLabel = 'تحديث',
  rangeLabel,
  actions,
  children,
  className,
  dir,
}) => {
  const hasHero = Boolean(hero && hero.length > 0);
  const hasPeriodTools = Boolean(periods?.length || onRefresh || periodExtra);
  /** Dashboard chrome: period chips / refresh keep rangeLabel in the toolbar. */
  const showContextToolbar = hasHero
    ? Boolean(hasPeriodTools || rangeLabel)
    : hasPeriodTools;
  const showActionsToolbar = hasHero && Boolean(actions);

  return (
    <div
      className={cn(
        'erp-ds-clean erp-dashboard-theme ops-dash-board ops-dash-board--data-first w-full min-w-0 p-3 sm:p-4 md:p-6',
        !hasHero && 'ops-dash-board--compact-head',
        className,
      )}
      dir={dir}
    >
      {hasHero ? (
        <p className="ops-dash-eyebrow">{eyebrow}</p>
      ) : (
        <header className="ops-dash-page-head">
          <div className="ops-dash-page-head__title">
            <h1 className="ops-dash-page-title">{eyebrow}</h1>
            {rangeLabel ? <p className="ops-dash-page-subtitle">{rangeLabel}</p> : null}
          </div>
          {actions ? (
            <div className="ops-dash-page-head__actions ops-dash-toolbar__actions">{actions}</div>
          ) : null}
        </header>
      )}

      {hasHero ? (
        <div className={cn('ops-dash-kpi-grid', denseHero && 'ops-dash-kpi-grid--dense')}>
          {hero!.map((card) => {
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
      ) : null}

      {showContextToolbar ? (
        <div
          className="ops-dash-toolbar"
          {...(showActionsToolbar
            ? { role: 'toolbar' as const, 'aria-label': 'إجراءات الصفحة' }
            : {})}
        >
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
            {hasHero && rangeLabel ? (
              <span className="ops-dash-toolbar__range">{rangeLabel}</span>
            ) : null}
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
            {showActionsToolbar ? (
              <div className="ops-dash-toolbar__actions">{actions}</div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showActionsToolbar && !showContextToolbar ? (
        <div className="ops-dash-toolbar ops-dash-toolbar--actions" role="toolbar" aria-label="إجراءات الصفحة">
          <div className="ops-dash-toolbar__actions">{actions}</div>
        </div>
      ) : null}

      <div className="ops-dash-domain-body space-y-3 md:space-y-4">{children}</div>
    </div>
  );
};

export default ModuleOpsPageShell;
