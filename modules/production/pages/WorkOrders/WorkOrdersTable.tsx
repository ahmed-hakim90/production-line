import { useEffect, useRef } from 'react';

import type { WorkOrder, WorkOrderStatus } from '../../../../types';
import type { WorkOrderGroupBy } from './hooks/useWorkOrderFilters';
import { WorkOrderRow, type WorkOrderRowView } from './WorkOrderRow';
import styles from './WorkOrders.module.css';

interface WorkOrdersTableProps {
  rows: WorkOrderRowView[];
  groupBy: WorkOrderGroupBy;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onRowClick: (order: WorkOrder) => void;
  onStatusChange: (id: string, status: WorkOrderStatus) => void;
  onEdit: (order: WorkOrder) => void;
  onCloseOrder: (order: WorkOrder) => void;
  onLoadMore: () => void;
}

interface GroupBucket {
  key: string;
  label: string;
  rows: WorkOrderRowView[];
}

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  pending: 'قيد الانتظار',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};

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
      key = row.order.status;
      label = STATUS_LABEL[row.order.status];
    } else if (groupBy === 'supervisor') {
      key = row.order.supervisorId || 'supervisor_unknown';
      label = (row.order as any).supervisorName || 'بدون مشرف';
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
  onRowClick,
  onStatusChange,
  onEdit,
  onCloseOrder,
  onLoadMore,
}: WorkOrdersTableProps) {
  const grouped = groupRows(rows, groupBy);
  const loaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore || loadingMore || !loaderRef.current) return;
    const node = loaderRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  if (loading) {
    return <div className={styles.emptyState}>جاري تحميل أوامر الشغل...</div>;
  }

  if (rows.length === 0) {
    return <div className={styles.emptyState}>لا توجد أوامر شغل مطابقة للفلاتر الحالية.</div>;
  }

  return (
    <div className={styles.tableWrap}>
      {grouped.map((group) => (
        <div key={group.key} className={styles.groupBlock}>
          {groupBy !== 'none' && (
            <div className={styles.groupHeader}>
              <span>{group.label}</span>
              <span>{group.rows.length} أمر</span>
            </div>
          )}

          <table className={styles.table}>
            <thead>
              <tr>
                <th>رقم الأمر</th>
                <th>المنتج + الخط</th>
                <th>الكمية</th>
                <th>التقدم</th>
                <th>الأيام المتبقية</th>
                <th>الانحراف</th>
                <th>الحالة</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <WorkOrderRow
                  key={row.order.id}
                  row={row}
                  onRowClick={onRowClick}
                  onStatusChange={onStatusChange}
                  onEdit={onEdit}
                  onCloseOrder={onCloseOrder}
                />
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className={styles.tableFooter}>
        {hasMore && <div ref={loaderRef} className={styles.loadSentinel} aria-hidden="true" />}
        {hasMore ? (
          <button type="button" className={styles.loadMoreBtn} onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'جاري التحميل...' : 'تحميل المزيد'}
          </button>
        ) : (
          <span className={styles.endText}>تم تحميل كل النتائج</span>
        )}
      </div>
    </div>
  );
}
