import React from 'react';
import { Edit2, Eye, RotateCcw, ScanLine, Trash2, X } from 'lucide-react';

import type { WorkOrder, WorkOrderStatus } from '../../../../types';
import { formatNumber } from '../../../../utils/calculations';
import { WorkOrderStatusBadge, WORK_ORDER_STATUS_STYLE } from './WorkOrderStatusBadge';
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
  statusDetail: string;
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
  onStatusChange?: (id: string, status: WorkOrderStatus) => void;
  onEdit?: (order: WorkOrder) => void;
  onCloseOrder?: (order: WorkOrder) => void;
  onDelete?: (order: WorkOrder) => void;
  onReopenCompleted?: (order: WorkOrder) => void;
  onOpenScanner?: (order: WorkOrder) => void;
}

function WorkOrderRowComponent({ row, onRowClick, onStatusChange, onEdit, onCloseOrder, onDelete, onReopenCompleted, onOpenScanner }: WorkOrderRowProps) {
  const { order } = row;
  const produced = Number(order.producedQuantity || 0);
  const target = Number(order.quantity || 0);
  const progress = target > 0 ? Math.min(100, Math.round((produced / target) * 100)) : 0;
  const isDeviationUp = row.deviationPct > 0;
  const canClose = row.effectiveStatus === 'in_progress' || row.effectiveStatus === 'paused';
  const canOpenScanner = Boolean(onOpenScanner && order.id && order.status !== 'cancelled');
  const statusStyle = WORK_ORDER_STATUS_STYLE[row.effectiveStatus];
  const deadlineClass =
    row.expectedEndTone === 'overdue'
      ? 'text-[rgb(var(--color-danger))]'
      : row.expectedEndTone === 'near'
        ? 'text-[rgb(var(--color-warning))]'
        : 'text-[var(--color-text-muted)]';

  const actions: RowActionMenuEntry[] = [
    {
      label: 'عرض التفاصيل',
      icon: <Eye size={14} />,
      onClick: () => onRowClick(order),
    },
    ...(canOpenScanner
      ? [
          {
            label: 'فتح الماسح',
            icon: <ScanLine size={14} />,
            onClick: () => onOpenScanner!(order),
          } as RowActionMenuEntry,
        ]
      : []),
    ...(onEdit
      ? [{
          label: 'تعديل',
          icon: <Edit2 size={14} />,
          onClick: () => onEdit(order),
        } as RowActionMenuEntry]
      : []),
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
    ...(onDelete
      ? [
          {
            label: 'حذف أمر الشغل',
            icon: <Trash2 size={14} />,
            onClick: () => onDelete(order),
            variant: 'danger',
          } as RowActionMenuEntry,
        ]
      : []),
    ...(onCloseOrder || onStatusChange
      ? [{
          label: 'إغلاق الأمر',
          icon: <X size={14} />,
          onClick: () => {
            if (canClose && order.id && onCloseOrder) {
              onCloseOrder(order);
            } else if (order.status === 'pending' && order.id && onStatusChange) {
              onStatusChange(order.id, 'cancelled');
            }
          },
          variant: 'danger',
        } as RowActionMenuEntry]
      : []),
  ];

  return (
    <tr
      className="hover:bg-[var(--color-bg)]/50 transition-colors cursor-pointer"
      onClick={() => onRowClick(order)}
    >
      <td className="px-4 py-3.5">
        <button className="text-sm font-bold text-primary hover:underline text-right" type="button">
          {order.workOrderNumber}
        </button>
      </td>
      <td className="px-4 py-3.5">
        <p className="text-sm font-bold text-[var(--color-text)]">{row.productName}</p>
        <p className="text-[11px] text-[var(--color-text-muted)] font-medium">{row.lineName}</p>
      </td>
      <td className="px-4 py-3.5 text-center">
        <p className="text-sm font-bold text-[var(--color-text)]">{formatNumber(target)}</p>
        <p className="text-[10px] text-[var(--color-text-muted)]">متبقي: {formatNumber(row.remainingQuantity)}</p>
      </td>
      <td className="px-4 py-3.5 text-center">
        <div className="flex flex-col items-center gap-1.5">
          <span className={`text-sm font-bold ${progress >= 100 ? 'text-[rgb(var(--color-success))]' : progress >= 50 ? 'text-[rgb(var(--color-primary))]' : 'text-[rgb(var(--color-warning))]'}`}>
            {progress}%
          </span>
          <div className="w-20 h-1.5 bg-[var(--color-surface-hover)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${statusStyle.bar}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-[var(--color-text-muted)] font-medium">
            {formatNumber(produced)} / {formatNumber(target)}
          </span>
        </div>
      </td>
      <td className="px-4 py-3.5 text-center">
        <span className={`text-xs font-bold ${deadlineClass}`}>{row.remainingDaysLabel}</span>
      </td>
      <td className="px-4 py-3.5 text-center">
        <span className={`text-xs font-bold ${isDeviationUp ? 'text-[rgb(var(--color-danger))]' : 'text-[rgb(var(--color-success))]'}`}>
          {isDeviationUp ? '▲' : '▼'} {Math.abs(row.deviationPct).toFixed(1)}%
        </span>
      </td>
      <td className="px-4 py-3.5 text-center">
        <WorkOrderStatusBadge status={row.effectiveStatus} detail={row.statusDetail} />
      </td>
      <td className="px-4 py-3.5 text-center">
        <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
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
    prev.onDelete === next.onDelete &&
    prev.onOpenScanner === next.onOpenScanner &&
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
    prev.row.deviationPct === next.row.deviationPct &&
    prev.row.effectiveStatus === next.row.effectiveStatus &&
    prev.row.statusDetail === next.row.statusDetail,
);
