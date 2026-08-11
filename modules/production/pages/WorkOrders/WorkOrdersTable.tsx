import React from 'react';

import type { WorkOrder, WorkOrderStatus } from '../../../../types';
import { WORK_ORDER_STATUS_LABELS } from '../../utils/workOrderReportLinking';
import type { WorkOrderGroupBy } from './hooks/useWorkOrderFilters';
import { WorkOrderRow, type WorkOrderRowView } from './WorkOrderRow';
import { WorkOrderMobileCard } from './WorkOrderMobileCard';
import { TableSkeleton } from '@/src/shared/ui/skeletons';
import { DataPaginationFooter } from '@/src/components/erp/DataPaginationFooter';

interface WorkOrdersTableProps {
  rows: WorkOrderRowView[];
  groupBy: WorkOrderGroupBy;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  hasPrevious: boolean;
  page: number;
  onRowClick: (order: WorkOrder) => void;
  onStatusChange?: (id: string, status: WorkOrderStatus) => void;
  onEdit?: (order: WorkOrder) => void;
  onCloseOrder?: (order: WorkOrder) => void;
  onDelete?: (order: WorkOrder) => void;
  onReopenCompleted?: (order: WorkOrder) => void;
  onOpenScanner?: (order: WorkOrder) => void;
  onLoadMore: () => void;
  onPrevious: () => void;
}

interface GroupBucket {
  key: string;
  label: string;
  rows: WorkOrderRowView[];
}

const groupRows = (rows: WorkOrderRowView[], groupBy: WorkOrderGroupBy): GroupBucket[] => {
  if (groupBy === 'none') {
    return [{ key: 'all', label: 'كل أوامر الشغل', rows }];
  }

  const map = new Map<string, GroupBucket>();

  rows.forEach((row) => {
    let key = 'unknown';
    let label = 'غير محدد';

    if (groupBy === 'line') {
      key = row.order.lineId || 'line_unknown';
      label = row.lineName || 'بدون خط';
    } else if (groupBy === 'status') {
      key = row.effectiveStatus;
      label = WORK_ORDER_STATUS_LABELS[row.effectiveStatus];
    } else if (groupBy === 'supervisor') {
      key = row.order.supervisorId || 'supervisor_unknown';
      label = (row.order as { supervisorName?: string }).supervisorName || 'بدون مشرف';
    }

    if (!map.has(key)) {
      map.set(key, { key, label, rows: [] });
    }
    map.get(key)!.rows.push(row);
  });

  return Array.from(map.values());
};

export function WorkOrdersTable({
  rows,
  groupBy,
  loading,
  loadingMore,
  hasMore,
  hasPrevious,
  page,
  onRowClick,
  onStatusChange,
  onEdit,
  onCloseOrder,
  onDelete,
  onReopenCompleted,
  onOpenScanner,
  onLoadMore,
  onPrevious,
}: WorkOrdersTableProps) {
  const grouped = groupRows(rows, groupBy);

  if (loading) {
    return (
      <div className="p-4">
        <TableSkeleton rows={10} columns={8} />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-12 text-center text-[var(--color-text-muted)]">
        <span className="material-icons-round text-5xl mb-3 block opacity-30">assignment</span>
        <p className="font-bold text-base">لا توجد أوامر شغل مطابقة للفلاتر الحالية</p>
        <p className="text-sm mt-1">جرب تغيير معايير التصفية أو أنشئ أمر شغل جديد</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="md:hidden space-y-3 px-3 pb-3">
        {grouped.map((group) => (
          <div key={group.key} className="space-y-2.5">
            {groupBy !== 'none' && (
              <div className="px-1 text-[11px] font-bold text-[var(--color-text-muted)]">
                {group.label} ({group.rows.length})
              </div>
            )}
            {group.rows.map((row) => (
              <WorkOrderMobileCard
                key={`m-${row.order.id}`}
                row={row}
                onRowClick={onRowClick}
                onStatusChange={onStatusChange}
                onEdit={onEdit}
                onCloseOrder={onCloseOrder}
                onDelete={onDelete}
                onReopenCompleted={onReopenCompleted}
                onOpenScanner={onOpenScanner}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="erp-table w-full text-right border-collapse">
          <thead>
            <tr className="bg-[var(--color-bg)]/50 border-b border-[var(--color-border)]">
              <th className="erp-th">رقم الأمر</th>
              <th className="erp-th">المنتج + الخط</th>
              <th className="erp-th text-center">الكمية</th>
              <th className="erp-th text-center">التقدم</th>
              <th className="erp-th text-center">الأيام المتبقية</th>
              <th className="erp-th text-center">الانحراف</th>
              <th className="erp-th text-center">الحالة</th>
              <th className="erp-th text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {grouped.map((group) => (
              <React.Fragment key={group.key}>
                {groupBy !== 'none' && (
                  <tr className="bg-[var(--color-bg)]/70">
                    <td className="px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)]" colSpan={8}>
                      {group.label} ({group.rows.length})
                    </td>
                  </tr>
                )}
                {group.rows.map((row) => (
                  <WorkOrderRow
                    key={row.order.id}
                    row={row}
                    onRowClick={onRowClick}
                    onStatusChange={onStatusChange}
                    onEdit={onEdit}
                    onCloseOrder={onCloseOrder}
                    onDelete={onDelete}
                    onReopenCompleted={onReopenCompleted}
                    onOpenScanner={onOpenScanner}
                  />
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <DataPaginationFooter
        page={page}
        itemCount={rows.length}
        itemLabel="أمر"
        hasPrevious={hasPrevious}
        hasNext={hasMore}
        onPrevious={onPrevious}
        onNext={onLoadMore}
        loading={loadingMore}
      />
    </div>
  );
}
