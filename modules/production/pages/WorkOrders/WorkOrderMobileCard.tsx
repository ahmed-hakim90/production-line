import React, { useMemo } from 'react';
import { Edit2, Eye, RotateCcw, ScanLine, Trash2, X } from 'lucide-react';
import { formatNumber } from '../../../../utils/calculations';
import { RowActionsMenu, type RowActionMenuEntry } from '../../../../src/components/erp/RowActionsMenu';
import { WorkOrderStatusBadge } from './WorkOrderStatusBadge';
import type { WorkOrder, WorkOrderStatus } from '../../../../types';
import type { WorkOrderRowView } from './WorkOrderRow';
import styles from './WorkOrders.module.css';

type Props = {
  row: WorkOrderRowView;
  onRowClick: (order: WorkOrder) => void;
  onStatusChange?: (id: string, status: WorkOrderStatus) => void;
  onEdit?: (order: WorkOrder) => void;
  onCloseOrder?: (order: WorkOrder) => void;
  onDelete?: (order: WorkOrder) => void;
  onReopenCompleted?: (order: WorkOrder) => void;
  onOpenScanner?: (order: WorkOrder) => void;
};

export const WorkOrderMobileCard: React.FC<Props> = ({
  row,
  onRowClick,
  onStatusChange,
  onEdit,
  onCloseOrder,
  onDelete,
  onReopenCompleted,
  onOpenScanner,
}) => {
  const { order } = row;
  const produced = Number(order.producedQuantity || 0);
  const target = Number(order.quantity || 0);
  const progress = target > 0 ? Math.min(100, Math.round((produced / target) * 100)) : 0;
  const canClose = order.status === 'in_progress';
  const canOpenScanner = Boolean(onOpenScanner && order.id && order.status !== 'cancelled');
  const isDeviationUp = row.deviationPct > 0;

  const actions: RowActionMenuEntry[] = useMemo(
    () => [
      {
        label: 'عرض التفاصيل',
        icon: <Eye size={14} />,
        onClick: () => onRowClick(order),
      },
      ...(canOpenScanner
        ? [{
            label: 'فتح الماسح',
            icon: <ScanLine size={14} />,
            onClick: () => onOpenScanner!(order),
          } as RowActionMenuEntry]
        : []),
      ...(onEdit
        ? [{
            label: 'تعديل',
            icon: <Edit2 size={14} />,
            onClick: () => onEdit(order),
          } as RowActionMenuEntry]
        : []),
      ...(row.storedStatus === 'completed' && onReopenCompleted
        ? [{
            label: 'إعادة فتح الأمر',
            icon: <RotateCcw size={14} />,
            onClick: () => onReopenCompleted(order),
          } as RowActionMenuEntry]
        : []),
      { separator: true },
      ...(onDelete
        ? [{
            label: 'حذف أمر الشغل',
            icon: <Trash2 size={14} />,
            onClick: () => onDelete(order),
            variant: 'danger',
          } as RowActionMenuEntry]
        : []),
      ...(onCloseOrder || onStatusChange
        ? [{
            label: 'إغلاق الأمر',
            icon: <X size={14} />,
            onClick: () => {
              if (canClose && order.id && onCloseOrder) onCloseOrder(order);
              else if (order.status === 'pending' && order.id && onStatusChange) {
                onStatusChange(order.id, 'cancelled');
              }
            },
            variant: 'danger',
          } as RowActionMenuEntry]
        : []),
    ],
    [
      canClose,
      canOpenScanner,
      onCloseOrder,
      onDelete,
      onEdit,
      onOpenScanner,
      onReopenCompleted,
      onRowClick,
      onStatusChange,
      order,
      row.storedStatus,
    ],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={styles.mobileCard}
      onClick={() => onRowClick(order)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRowClick(order);
        }
      }}
    >
      <div className={styles.mobileCardTop}>
        <div className={styles.mobileCardTitleBlock}>
          <span className={styles.mobileCardWo}>{order.workOrderNumber}</span>
          <span className={styles.mobileCardProduct}>{row.productName}</span>
          <span className={styles.mobileCardLine}>{row.lineName}</span>
        </div>
        <div
          className={styles.mobileCardActions}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <WorkOrderStatusBadge status={order.status} />
          <RowActionsMenu items={actions} />
        </div>
      </div>
      <div className={styles.mobileCardMeta}>
        <div>
          <span>الكمية</span>
          <strong>{formatNumber(produced)}/{formatNumber(target)}</strong>
        </div>
        <div>
          <span>التقدم</span>
          <strong>{progress}%</strong>
        </div>
        <div>
          <span>المتبقي</span>
          <strong className={styles[`deadline_${row.expectedEndTone}`]}>{row.remainingDaysLabel}</strong>
        </div>
        <div>
          <span>الانحراف</span>
          <strong>
            {isDeviationUp ? '▲' : '▼'} {Math.abs(row.deviationPct).toFixed(1)}%
          </strong>
        </div>
      </div>
      <div className={styles.progressBar}>
        <div
          className={`${styles.progressFill} ${
            progress >= 80 ? styles.progressSuccess : progress >= 40 ? styles.progressWarning : styles.progressPrimary
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};
