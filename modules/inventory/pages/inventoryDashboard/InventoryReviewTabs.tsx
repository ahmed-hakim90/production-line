import React from 'react';
import { Link } from 'react-router-dom';
import { OpsDashPanel } from '@/modules/dashboards/components/OperationsDashboardBoard';
import { StatusBadge } from '@/src/components/erp/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '../../../../utils/calculations';
import { sourceModuleLabel, transferRequestTypeLabel } from '../../lib/stockLabels';
import { movementLabel } from '../stockTransactions/types';
import type {
  InventoryTransferRequest,
  ProductionIssueOrder,
  StockTransaction,
  SuppliesReceiptOrder,
} from '../../types';
import type {
  IssueStatusFilter,
  MovementFilter,
  PeriodPreset,
  ReceiptStatusFilter,
  ReviewTab,
  SourceFilter,
  TransferStatusFilter,
} from './useInventoryControlData';

type Props = {
  tenantPath: (path: string) => string;
  loading: boolean;
  txLoading: boolean;
  reviewTab: ReviewTab;
  setReviewTab: (tab: ReviewTab) => void;
  period: PeriodPreset;
  setPeriod: (p: PeriodPreset) => void;
  movementFilter: MovementFilter;
  setMovementFilter: (v: MovementFilter) => void;
  sourceFilter: SourceFilter;
  setSourceFilter: (v: SourceFilter) => void;
  issueStatusFilter: IssueStatusFilter;
  setIssueStatusFilter: (v: IssueStatusFilter) => void;
  receiptStatusFilter: ReceiptStatusFilter;
  setReceiptStatusFilter: (v: ReceiptStatusFilter) => void;
  transferStatusFilter: TransferStatusFilter;
  setTransferStatusFilter: (v: TransferStatusFilter) => void;
  movements: StockTransaction[];
  issues: ProductionIssueOrder[];
  receipts: SuppliesReceiptOrder[];
  transfers: InventoryTransferRequest[];
  warehouseNameById: Map<string, string>;
};

const TABS: { key: ReviewTab; label: string; href: string }[] = [
  { key: 'movements', label: 'الحركات', href: '/inventory/transactions' },
  { key: 'issues', label: 'صرف الإنتاج', href: '/inventory/production-issues' },
  { key: 'receipts', label: 'الاستلامات', href: '/inventory/raw-materials/receive' },
  { key: 'transfers', label: 'التحويلات', href: '/inventory/transfer-approvals' },
];

const PERIODS: { key: PeriodPreset; label: string }[] = [
  { key: 'today', label: 'اليوم' },
  { key: '7d', label: '7 أيام' },
  { key: '30d', label: '30 يوم' },
  { key: 'all', label: 'الكل' },
];

const MOVEMENTS: { key: MovementFilter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'IN', label: 'وارد' },
  { key: 'OUT', label: 'منصرف' },
  { key: 'TRANSFER', label: 'تحويل' },
  { key: 'ADJUSTMENT', label: 'تسوية' },
];

const SOURCES: { key: SourceFilter; label: string }[] = [
  { key: 'all', label: 'كل المصادر' },
  { key: 'supplies_receipt', label: 'استلام' },
  { key: 'production_issue', label: 'صرف إنتاج' },
  { key: 'transfer_request', label: 'تحويل' },
  { key: 'manual_movement', label: 'يدوي' },
];

function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
            value === opt.key
              ? 'bg-primary/10 text-primary border-primary/30'
              : 'bg-[var(--color-card)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function issueStatusLabel(status: ProductionIssueOrder['status']): string {
  const map: Record<ProductionIssueOrder['status'], string> = {
    requested: 'طلب إنتاج',
    draft: 'مسودة',
    submitted: 'مقدّم',
    issued: 'منفّذ',
    rejected: 'مرفوض',
    cancelled: 'ملغى',
  };
  return map[status] ?? status;
}

function receiptStatusLabel(status: SuppliesReceiptOrder['status']): string {
  const map: Record<SuppliesReceiptOrder['status'], string> = {
    draft: 'مسودة',
    submitted: 'مقدّم',
    approved: 'معتمد',
    executed: 'منفّذ',
    rejected: 'مرفوض',
    cancelled: 'ملغى',
  };
  return map[status] ?? status;
}

function transferStatusLabel(status: InventoryTransferRequest['status']): string {
  const map: Record<InventoryTransferRequest['status'], string> = {
    pending: 'معلق',
    approved: 'معتمد',
    rejected: 'مرفوض',
    cancelled: 'ملغى',
  };
  return map[status] ?? status;
}

function statusType(
  kind: 'ok' | 'warn' | 'danger' | 'info',
): 'success' | 'warning' | 'danger' | 'info' {
  if (kind === 'ok') return 'success';
  if (kind === 'warn') return 'warning';
  if (kind === 'danger') return 'danger';
  return 'info';
}

export const InventoryReviewTabs: React.FC<Props> = ({
  tenantPath,
  loading,
  txLoading,
  reviewTab,
  setReviewTab,
  period,
  setPeriod,
  movementFilter,
  setMovementFilter,
  sourceFilter,
  setSourceFilter,
  issueStatusFilter,
  setIssueStatusFilter,
  receiptStatusFilter,
  setReceiptStatusFilter,
  transferStatusFilter,
  setTransferStatusFilter,
  movements,
  issues,
  receipts,
  transfers,
  warehouseNameById,
}) => {
  const activeHref = TABS.find((t) => t.key === reviewTab)?.href || '/inventory/transactions';
  const showSkeleton = loading || (reviewTab === 'movements' && txLoading);

  return (
    <OpsDashPanel
      title="مراجعة العمليات"
      accent="inventory"
      action={
        <Link
          to={tenantPath(activeHref)}
          className="text-xs font-medium text-primary hover:underline"
        >
          التفاصيل الكاملة
        </Link>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setReviewTab(tab.key)}
              className={`rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                reviewTab === tab.key
                  ? 'bg-primary text-white border-primary'
                  : 'bg-[var(--color-card)] text-[var(--color-text)] border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {reviewTab === 'movements' && (
          <div className="space-y-2">
            <ChipRow options={PERIODS} value={period} onChange={setPeriod} />
            <ChipRow options={MOVEMENTS} value={movementFilter} onChange={setMovementFilter} />
            <ChipRow options={SOURCES} value={sourceFilter} onChange={setSourceFilter} />
          </div>
        )}
        {reviewTab === 'issues' && (
          <ChipRow
            options={[
              { key: 'all' as const, label: 'الكل' },
              { key: 'pending' as const, label: 'معلق' },
              { key: 'issued' as const, label: 'منفّذ' },
            ]}
            value={issueStatusFilter}
            onChange={setIssueStatusFilter}
          />
        )}
        {reviewTab === 'receipts' && (
          <ChipRow
            options={[
              { key: 'all' as const, label: 'الكل' },
              { key: 'draft' as const, label: 'مسودة' },
              { key: 'submitted' as const, label: 'مقدّم' },
              { key: 'approved' as const, label: 'معتمد' },
              { key: 'executed' as const, label: 'منفّذ' },
            ]}
            value={receiptStatusFilter}
            onChange={setReceiptStatusFilter}
          />
        )}
        {reviewTab === 'transfers' && (
          <ChipRow
            options={[
              { key: 'all' as const, label: 'الكل' },
              { key: 'pending' as const, label: 'معلق' },
              { key: 'approved' as const, label: 'معتمد' },
              { key: 'rejected' as const, label: 'مرفوض' },
            ]}
            value={transferStatusFilter}
            onChange={setTransferStatusFilter}
          />
        )}

        {showSkeleton ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={`rev-sk-${i}`} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="erp-table-wrap overflow-x-auto">
            <table className="erp-table w-full text-sm">
              <thead className="erp-thead">
                {reviewTab === 'movements' && (
                  <tr>
                    <th className="erp-th text-right">الصنف</th>
                    <th className="erp-th text-right">المخزن</th>
                    <th className="erp-th text-right">النوع</th>
                    <th className="erp-th text-right">المصدر</th>
                    <th className="erp-th text-right">الكمية</th>
                    <th className="erp-th text-right">التاريخ</th>
                  </tr>
                )}
                {reviewTab === 'issues' && (
                  <tr>
                    <th className="erp-th text-right">المرجع</th>
                    <th className="erp-th text-right">المنتج</th>
                    <th className="erp-th text-right">المخزن</th>
                    <th className="erp-th text-right">الكمية</th>
                    <th className="erp-th text-right">الحالة</th>
                    <th className="erp-th text-right">التاريخ</th>
                  </tr>
                )}
                {reviewTab === 'receipts' && (
                  <tr>
                    <th className="erp-th text-right">المرجع</th>
                    <th className="erp-th text-right">المخزن</th>
                    <th className="erp-th text-right">أمر التوريد</th>
                    <th className="erp-th text-right">الحالة</th>
                    <th className="erp-th text-right">التاريخ</th>
                  </tr>
                )}
                {reviewTab === 'transfers' && (
                  <tr>
                    <th className="erp-th text-right">المرجع</th>
                    <th className="erp-th text-right">من → إلى</th>
                    <th className="erp-th text-right">النوع</th>
                    <th className="erp-th text-right">الحالة</th>
                    <th className="erp-th text-right">التاريخ</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {reviewTab === 'movements' &&
                  (movements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-[var(--color-text-muted)]">
                        لا توجد حركات في الفترة المحددة.
                      </td>
                    </tr>
                  ) : (
                    movements.map((tx) => (
                      <tr key={tx.id} className="border-b border-[var(--color-border)]">
                        <td className="py-2.5 pr-2 font-medium">{tx.itemName}</td>
                        <td className="py-2.5 text-[var(--color-text-muted)]">
                          {tx.warehouseName || warehouseNameById.get(tx.warehouseId) || '—'}
                        </td>
                        <td className="py-2.5">{movementLabel[tx.movementType] || tx.movementType}</td>
                        <td className="py-2.5 text-[var(--color-text-muted)]">{sourceModuleLabel(tx.sourceModule)}</td>
                        <td className="py-2.5 tabular-nums">
                          <StatusBadge
                            label={
                              tx.quantity >= 0
                                ? `+${formatNumber(tx.quantity)}`
                                : formatNumber(tx.quantity)
                            }
                            type={tx.quantity >= 0 ? 'success' : 'danger'}
                          />
                        </td>
                        <td className="py-2.5 text-[var(--color-text-muted)] whitespace-nowrap">
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleString('ar-EG') : '—'}
                        </td>
                      </tr>
                    ))
                  ))}

                {reviewTab === 'issues' &&
                  (issues.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-[var(--color-text-muted)]">
                        لا توجد أوامر صرف مطابقة.
                      </td>
                    </tr>
                  ) : (
                    issues.map((row) => (
                      <tr key={row.id || row.referenceNo} className="border-b border-[var(--color-border)]">
                        <td className="py-2.5 pr-2 font-medium">{row.referenceNo}</td>
                        <td className="py-2.5">{row.productName}</td>
                        <td className="py-2.5 text-[var(--color-text-muted)]">
                          {row.sourceWarehouseName ||
                            warehouseNameById.get(row.sourceWarehouseId) ||
                            '—'}
                        </td>
                        <td className="py-2.5 tabular-nums">{formatNumber(row.quantity)}</td>
                        <td className="py-2.5">
                          <StatusBadge
                            label={issueStatusLabel(row.status)}
                            type={
                              row.status === 'issued'
                                ? statusType('ok')
                                : row.status === 'cancelled'
                                  ? statusType('danger')
                                  : statusType('warn')
                            }
                          />
                        </td>
                        <td className="py-2.5 text-[var(--color-text-muted)] whitespace-nowrap">
                          {new Date(row.issuedAt || row.createdAt).toLocaleString('ar-EG')}
                        </td>
                      </tr>
                    ))
                  ))}

                {reviewTab === 'receipts' &&
                  (receipts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-[var(--color-text-muted)]">
                        لا توجد استلامات مطابقة.
                      </td>
                    </tr>
                  ) : (
                    receipts.map((row) => (
                      <tr key={row.id || row.referenceNo} className="border-b border-[var(--color-border)]">
                        <td className="py-2.5 pr-2 font-medium">{row.referenceNo}</td>
                        <td className="py-2.5 text-[var(--color-text-muted)]">
                          {row.warehouseName || warehouseNameById.get(row.warehouseId) || '—'}
                        </td>
                        <td className="py-2.5">{row.containerRef || '—'}</td>
                        <td className="py-2.5">
                          <StatusBadge
                            label={receiptStatusLabel(row.status)}
                            type={
                              row.status === 'executed'
                                ? statusType('ok')
                                : row.status === 'rejected' || row.status === 'cancelled'
                                  ? statusType('danger')
                                  : statusType('warn')
                            }
                          />
                        </td>
                        <td className="py-2.5 text-[var(--color-text-muted)] whitespace-nowrap">
                          {new Date(row.executedAt || row.createdAt).toLocaleString('ar-EG')}
                        </td>
                      </tr>
                    ))
                  ))}

                {reviewTab === 'transfers' &&
                  (transfers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-[var(--color-text-muted)]">
                        لا توجد تحويلات مطابقة.
                      </td>
                    </tr>
                  ) : (
                    transfers.map((row) => (
                      <tr key={row.id || row.referenceNo} className="border-b border-[var(--color-border)]">
                        <td className="py-2.5 pr-2 font-medium">{row.referenceNo}</td>
                        <td className="py-2.5 text-[var(--color-text-muted)]">
                          {(row.fromWarehouseName ||
                            warehouseNameById.get(row.fromWarehouseId) ||
                            '—')}{' '}
                          →{' '}
                          {(row.toWarehouseName ||
                            warehouseNameById.get(row.toWarehouseId) ||
                            '—')}
                        </td>
                        <td className="py-2.5">{transferRequestTypeLabel(row.requestType)}</td>
                        <td className="py-2.5">
                          <StatusBadge
                            label={transferStatusLabel(row.status)}
                            type={
                              row.status === 'approved'
                                ? statusType('ok')
                                : row.status === 'rejected' || row.status === 'cancelled'
                                  ? statusType('danger')
                                  : statusType('warn')
                            }
                          />
                        </td>
                        <td className="py-2.5 text-[var(--color-text-muted)] whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString('ar-EG')}
                        </td>
                      </tr>
                    ))
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </OpsDashPanel>
  );
};
