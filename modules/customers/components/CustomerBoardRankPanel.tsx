import React from 'react';
import { Link } from 'react-router-dom';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { withTenantPath } from '@/lib/tenantPaths';
import { formatNumber } from '@/utils/calculations';
import type { CustomerBoardRankRow } from '../lib/customerBoardAnalytics';

type CustomerBoardRankPanelProps = {
  title: string;
  emptyLabel: string;
  hint?: string;
  rows: CustomerBoardRankRow[];
  loading?: boolean;
  tenantSlug?: string;
  valueSuffix?: string;
};

export const CustomerBoardRankPanel: React.FC<CustomerBoardRankPanelProps> = ({
  title,
  emptyLabel,
  hint,
  rows,
  loading = false,
  tenantSlug,
  valueSuffix,
}) => {
  return (
    <OpsDashPanel title={title} accent="customers" loading={loading}>
      {hint ? <p className="mb-3 text-xs text-[var(--color-text-muted)]">{hint}</p> : null}
      {loading ? null : rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-[var(--color-text-muted)]">{emptyLabel}</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((row, index) => (
            <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-hover)] text-[11px] font-bold tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <Link
                    className="block truncate font-semibold text-[var(--color-text)] hover:underline"
                    to={withTenantPath(tenantSlug, `/customers/${row.id}`)}
                  >
                    {row.name}
                  </Link>
                  <p className="truncate text-[11px] tabular-nums text-[var(--color-text-muted)]">{row.code}</p>
                </div>
              </div>
              <span className="shrink-0 font-bold tabular-nums">
                {formatNumber(row.value)}
                {valueSuffix ? ` ${valueSuffix}` : ''}
              </span>
            </li>
          ))}
        </ol>
      )}
    </OpsDashPanel>
  );
};
