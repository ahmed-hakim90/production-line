import React from 'react';
import { Edit2, Eye, RotateCcw, X } from 'lucide-react';

import type { WorkOrder, WorkOrderStatus } from '../../../../types';
import { formatNumber } from '../../../../utils/calculations';
import { WorkOrderStatusBadge } from './WorkOrderStatusBadge';
import styles from './WorkOrders.module.css';
import { RowActionsMenu, type RowActionMenuEntry } from '../../../../src/components/erp/RowActionsMenu';

export interface WorkOrderRowView {
  order: WorkOrder;
  productName: string;
  lineName: string;
  expectedEndLabel: string;
  remainingDaysLabel: string;
  expectedEndTone: 'normal' | 'near' | 'overdue';
  deviationPct: number;
  storedStatus: WorkOrderStatus;
  effectiveStatus: WorkOrderStatus;
  startDateLabel: string;
  estimatedDays: number;
  dailyAverage: number;
  reportCount: number;
  remainingQuantity: number;
  progressPct: number;
  costDiff: number;
  costVariancePct: number;
}

interface WorkOrderRowProps {
  row: WorkOrderRowView;
  onRowClick: (order: WorkOrder) => void;
  onStatusChange: (id: string, status: WorkOrderStatus) => void;
  onEdit: (order: WorkOrder) => void;
  onCloseOrder: (order: WorkOrder) => void;
  onReopenCompleted?: (order: WorkOrder) => void;
}

const progressColorClass = (progress: number): string => {
  if (progress >= 80) return styles.progressSuccess;
  if (progress >= 40) return styles.progressWarning;
  return styles.progressPrimary;
};

function WorkOrderRowComponent({ row, onRowClick, onStatusChange, onEdit, onCloseOrder, onReopenCompleted }: WorkOrderRowProps) {
  const { order } = row;
  const produced = Number(order.producedQuantity || 0);
  const target = Number(order.quantity || 0);
  const progress = target > 0 ? Math.min(100, Math.round((produced / target) * 100)) : 0;
  const isDeviationUp = row.deviationPct > 0;
  const canClose = order.status === 'in_progress';

  const actions: RowActionMenuEntry[] = [
    {
      label: 'عرض التفاصيل',
      icon: <Eye size={14} />,
      onClick: () => onRowClick(order),
    },
    {
      label: 'تعديل',
      icon: <Edit2 size={14} />,
      onClick: () => onEdit(order),
    },
    ...(row.storedStatus === 'completed' && onReopenCompleted
      ? [
          {
            label: 'إعادة فتح الأمر',
            icon: <RotateCcw size={14} />,
            onClick: () => onReopenCompleted(order),
          } as RowActionMenuEntry,
        ]
      : []),
    { separator: true },
    {
      label: 'إغلاق الأمر',
      icon: <X size={14} />,
      onClick: () => {
        if (canClose && order.id) {
          onCloseOrder(order);
        } else if (order.status === 'pending' && order.id) {
          onStatusChange(order.id, 'cancelled');
        }
      },
      variant: 'danger',
    },
  ];

  return (
    <tr className={styles.tableRow} onClick={() => onRowClick(order)}>
      <td className={styles.cellStrong}>
        <button className={styles.linkLike} onClick={() => onRowClick(order)} type="button">
          {order.workOrderNumber}
        </button>
      </td>
      <td>
        <div className={styles.cellStack}>
          <span className={styles.cellPrimary}>{row.productName}</span>
          <span className={styles.cellSecondary}>{row.lineName}</span>
        </div>
      </td>
      <td className={styles.monoCell}>{formatNumber(produced)}/{formatNumber(target)}</td>
      <td>
        <div className={styles.progressCell}>
          <div className={styles.progressBar}>
            <div
              className={`${styles.progressFill} ${progressColorClass(progress)}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className={styles.progressLabel}>{progress}%</span>
        </div>
      </td>
      <td>
        <span className={`${styles.deadline} ${styles[`deadline_${row.expectedEndTone}`]}`}>
          {row.remainingDaysLabel}
        </span>
      </td>
      <td>
        <span className={`${styles.deviationBadge} ${isDeviationUp ? styles.deviationUp : styles.deviationDown}`}>
          {isDeviationUp ? '▲' : '▼'} {Math.abs(row.deviationPct).toFixed(1)}%
        </span>
      </td>
      <td><WorkOrderStatusBadge status={order.status} /></td>
      <td>
        <div className={styles.actionCell} onClick={(e) => e.stopPropagation()}>
          <RowActionsMenu items={actions} />
        </div>
      </td>
    </tr>
  );
}

export const WorkOrderRow = React.memo(
  WorkOrderRowComponent,
  (prev, next) =>
    prev.onRowClick === next.onRowClick &&
    prev.onStatusChange === next.onStatusChange &&
    prev.onEdit === next.onEdit &&
    prev.onCloseOrder === next.onCloseOrder &&
    prev.onReopenCompleted === next.onReopenCompleted &&
    prev.row.storedStatus === next.row.storedStatus &&
    prev.row.order.id === next.row.order.id &&
    prev.row.order.status === next.row.order.status &&
    prev.row.order.producedQuantity === next.row.order.producedQuantity &&
    prev.row.order.quantity === next.row.order.quantity &&
    prev.row.order.targetDate === next.row.order.targetDate &&
    prev.row.order.actualCost === next.row.order.actualCost &&
    prev.row.order.estimatedCost === next.row.order.estimatedCost &&
    prev.row.expectedEndLabel === next.row.expectedEndLabel &&
    prev.row.expectedEndTone === next.row.expectedEndTone &&
    prev.row.deviationPct === next.row.deviationPct,
);
