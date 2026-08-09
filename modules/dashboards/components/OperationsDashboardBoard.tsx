import React from 'react';
import { cn } from '@/lib/utils';

export type OperationsDashboardBoardProps = {
  header?: React.ReactNode;
  kpi?: React.ReactNode;
  chart?: React.ReactNode;
  queue?: React.ReactNode;
  list?: React.ReactNode;
  team?: React.ReactNode;
  gauge?: React.ReactNode;
  focus?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
};

function Slot({
  children,
  className,
  scroll,
}: {
  children: React.ReactNode;
  className?: string;
  scroll?: boolean;
}) {
  if (children == null || children === false) return null;
  return (
    <div className={cn('ops-dash-slot', scroll && 'ops-dash-scroll', className)}>
      {children}
    </div>
  );
}

/**
 * Dense single-composition dashboard grid (Donezo-style layout, ERP tokens).
 * Slots that are null/false collapse without leaving empty grid holes when possible.
 */
export const OperationsDashboardBoard: React.FC<OperationsDashboardBoardProps> = ({
  header,
  kpi,
  chart,
  queue,
  list,
  team,
  gauge,
  focus,
  secondary,
  className,
}) => {
  const midCount = [chart, queue, list].filter((n) => n != null && n !== false).length;
  const botCount = [team, gauge, focus].filter((n) => n != null && n !== false).length;

  return (
    <div className={cn('ops-dash-board', className)}>
      {header != null && header !== false ? (
        <div className="ops-dash-header">{header}</div>
      ) : null}

      {kpi != null && kpi !== false ? (
        <div className="ops-dash-kpi">{kpi}</div>
      ) : null}

      {midCount > 0 ? (
        <div
          className={cn(
            'ops-dash-mid',
            midCount === 1 && 'ops-dash-mid--1',
            midCount === 2 && 'ops-dash-mid--2',
            midCount >= 3 && 'ops-dash-mid--3',
          )}
        >
          <Slot className="ops-dash-chart" scroll>
            {chart}
          </Slot>
          <Slot className="ops-dash-queue" scroll>
            {queue}
          </Slot>
          <Slot className="ops-dash-list" scroll>
            {list}
          </Slot>
        </div>
      ) : null}

      {botCount > 0 ? (
        <div
          className={cn(
            'ops-dash-bot',
            botCount === 1 && 'ops-dash-bot--1',
            botCount === 2 && 'ops-dash-bot--2',
            botCount >= 3 && 'ops-dash-bot--3',
          )}
        >
          <Slot className="ops-dash-team" scroll>
            {team}
          </Slot>
          <Slot className="ops-dash-gauge">{gauge}</Slot>
          <Slot className="ops-dash-focus">{focus}</Slot>
        </div>
      ) : null}

      {secondary != null && secondary !== false ? (
        <div className="ops-dash-secondary">{secondary}</div>
      ) : null}
    </div>
  );
};

export function OpsDashPanel({
  title,
  action,
  children,
  className,
  bodyClassName,
  tone = 'default',
  accent,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  tone?: 'default' | 'primary';
  /** Soft module accent for the title marker (inventory, costs, …). */
  accent?: 'production' | 'inventory' | 'costs' | 'hr' | 'quality' | 'repair' | 'customers' | 'plans';
}) {
  return (
    <section
      className={cn(
        'ops-dash-panel',
        tone === 'primary' && 'ops-dash-panel--primary',
        accent && `ops-dash-panel--tone-${accent}`,
        className,
      )}
    >
      {(title || action) && (
        <div className="ops-dash-panel__head">
          {title ? <h3 className="ops-dash-panel__title">{title}</h3> : <span />}
          {action}
        </div>
      )}
      <div className={cn('ops-dash-panel__body', bodyClassName)}>{children}</div>
    </section>
  );
}
