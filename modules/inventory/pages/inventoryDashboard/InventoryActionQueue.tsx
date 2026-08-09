import React from 'react';
import { Link } from 'react-router-dom';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  InventoryTransferRequest,
  ProductionIssueOrder,
  SuppliesReceiptOrder,
} from '../../types';

type Props = {
  tenantPath: (path: string) => string;
  loading: boolean;
  transfers: InventoryTransferRequest[];
  transfersTotal: number;
  issues: ProductionIssueOrder[];
  issuesTotal: number;
  receipts: SuppliesReceiptOrder[];
  receiptsTotal: number;
};

function QueueEmpty({ text }: { text: string }) {
  return <p className="text-sm text-slate-400 py-2">{text}</p>;
}

export const InventoryActionQueue: React.FC<Props> = ({
  tenantPath,
  loading,
  transfers,
  transfersTotal,
  issues,
  issuesTotal,
  receipts,
  receiptsTotal,
}) => {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <OpsDashPanel key={`queue-sk-${i}`} accent="inventory">
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              {Array.from({ length: 3 }).map((__, j) => (
                <Skeleton key={`q-row-${i}-${j}`} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </OpsDashPanel>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <OpsDashPanel
        title={`تحويلات معلقة (${transfersTotal})`}
        accent="inventory"
        action={
          <Link
            to={tenantPath('/inventory/transfer-approvals')}
            className="text-xs font-medium text-primary hover:underline"
          >
            عرض الكل
          </Link>
        }
      >
        <div className="space-y-2">
          {transfers.length === 0 ? (
            <QueueEmpty text="لا توجد تحويلات بانتظار الاعتماد." />
          ) : (
            transfers.map((row) => (
              <Link
                key={row.id || row.referenceNo}
                to={tenantPath('/inventory/transfer-approvals')}
                className="flex items-center justify-between rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text)] truncate">
                    {row.referenceNo}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {(row.fromWarehouseName || '—')} → {(row.toWarehouseName || '—')}
                  </p>
                </div>
                <StatusBadge label="معلق" type="warning" />
              </Link>
            ))
          )}
        </div>
      </OpsDashPanel>

      <OpsDashPanel
        title={`صرف إنتاج معلق (${issuesTotal})`}
        accent="inventory"
        action={
          <Link
            to={tenantPath('/inventory/production-issues')}
            className="text-xs font-medium text-primary hover:underline"
          >
            عرض الكل
          </Link>
        }
      >
        <div className="space-y-2">
          {issues.length === 0 ? (
            <QueueEmpty text="لا يوجد صرف إنتاج بانتظار التنفيذ." />
          ) : (
            issues.map((row) => (
              <Link
                key={row.id || row.referenceNo}
                to={tenantPath('/inventory/production-issues')}
                className="flex items-center justify-between rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text)] truncate">
                    {row.referenceNo} · {row.productName}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {row.sourceWarehouseName || '—'} · كمية {row.quantity}
                  </p>
                </div>
                <StatusBadge
                  label={row.status === 'submitted' ? 'مقدّم' : 'مسودة'}
                  type="warning"
                />
              </Link>
            ))
          )}
        </div>
      </OpsDashPanel>

      <OpsDashPanel
        title={`استلامات بانتظار (${receiptsTotal})`}
        accent="inventory"
        action={
          <Link
            to={tenantPath('/inventory/raw-materials/receive')}
            className="text-xs font-medium text-primary hover:underline"
          >
            عرض الكل
          </Link>
        }
      >
        <div className="space-y-2">
          {receipts.length === 0 ? (
            <QueueEmpty text="لا توجد استلامات بانتظار الاعتماد أو التنفيذ." />
          ) : (
            receipts.map((row) => (
              <Link
                key={row.id || row.referenceNo}
                to={tenantPath('/inventory/raw-materials/receive')}
                className="flex items-center justify-between rounded-[var(--border-radius-lg)] border border-[var(--color-border)] px-3 py-2 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text)] truncate">
                    {row.referenceNo}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {row.warehouseName || '—'}
                    {row.containerRef ? ` · ${row.containerRef}` : ''}
                  </p>
                </div>
                <StatusBadge
                  label={row.status === 'approved' ? 'معتمد' : 'مقدّم'}
                  type={row.status === 'approved' ? 'info' : 'warning'}
                />
              </Link>
            ))
          )}
        </div>
      </OpsDashPanel>
    </div>
  );
};
