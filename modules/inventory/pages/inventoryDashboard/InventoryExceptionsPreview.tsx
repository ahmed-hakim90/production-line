import React from 'react';
import { Link } from 'react-router-dom';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExceptionPreviewRow } from './useInventoryControlData';

type Props = {
  tenantPath: (path: string) => string;
  loading: boolean;
  rows: ExceptionPreviewRow[];
};

const kindLabel: Record<ExceptionPreviewRow['kind'], string> = {
  negative: 'سالب',
  low: 'حد أدنى',
  large_manual: 'يدوي كبير',
};

const kindType: Record<ExceptionPreviewRow['kind'], 'danger' | 'warning' | 'info'> = {
  negative: 'danger',
  low: 'warning',
  large_manual: 'info',
};

export const InventoryExceptionsPreview: React.FC<Props> = ({ tenantPath, loading, rows }) => {
  return (
    <OpsDashPanel
      title="استثناءات تحتاج مراجعة"
      accent="inventory"
      action={
        <Link
          to={tenantPath('/inventory/exceptions')}
          className="text-xs font-medium text-primary hover:underline"
        >
          كل الاستثناءات
        </Link>
      }
    >
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`ex-sk-${i}`} className="h-12 w-full rounded-lg" />
          ))
        ) : rows.length === 0 ? (
          <p className="text-sm font-medium text-[rgb(var(--color-success))]">لا توجد استثناءات ظاهرة حالياً.</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--color-text)] truncate">{row.title}</p>
                <p className="text-xs text-[var(--color-text-muted)] truncate">
                  {row.warehouseName ? `${row.warehouseName} · ` : ''}
                  {row.detail}
                </p>
              </div>
              <StatusBadge label={kindLabel[row.kind]} type={kindType[row.kind]} />
            </div>
          ))
        )}
      </div>
    </OpsDashPanel>
  );
};
