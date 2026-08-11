import React, { useMemo } from 'react';
import { Edit2, Eye, RotateCcw, ScanLine, Trash2, X } from 'lucide-react';
import { formatNumber } from '../../../../utils/calculations';
import { RowActionsMenu, type RowActionMenuEntry } from '../../../../src/components/erp/RowActionsMenu';
import { WORK_ORDER_STATUS_LABELS } from '../../utils/workOrderReportLinking';
import { WORK_ORDER_STATUS_STYLE } from './WorkOrderStatusBadge';
import type { WorkOrder, WorkOrderStatus } from '../../../../types';
import type { WorkOrderRowView } from './WorkOrderRow';
import { Button } from '../../components/UI';

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
  const canClose = row.effectiveStatus === 'in_progress' || row.effectiveStatus === 'paused';
  const canOpenScanner = Boolean(onOpenScanner && order.id && order.status !== 'cancelled');
  const statusStyle = WORK_ORDER_STATUS_STYLE[row.effectiveStatus];

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
      className="rounded-[var(--border-radius-lg)] border border-[var(--color-border)] bg-[var(--color-card)] p-3 space-y-2.5 cursor-pointer hover:bg-[var(--color-bg)]/40 transition-colors"
      onClick={() => onRowClick(order)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRowClick(order);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-primary">{order.workOrderNumber}</p>
          <p className="text-sm font-bold text-[var(--color-text)]">{row.productName}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{row.lineName}</p>
        </div>
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <RowActionsMenu items={actions} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-[var(--border-radius-base)] bg-[var(--color-bg)] p-2">
          <p className="text-[var(--color-text-muted)] mb-0.5">الحالة</p>
          <p className={`font-bold ${statusStyle.color}`}>{WORK_ORDER_STATUS_LABELS[row.effectiveStatus]}</p>
          <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{row.statusDetail}</p>
        </div>
        <div className="rounded-[var(--border-radius-base)] bg-[var(--color-bg)] p-2">
          <p className="text-[var(--color-text-muted)] mb-0.5">التقدم</p>
          <p className="font-bold text-primary">{progress}%</p>
        </div>
      </div>
      <div className="h-2 bg-[var(--color-surface-hover)] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${statusStyle.bar}`} style={{ width: `${progress}%` }} />
      </div>
      <div className="text-xs text-[var(--color-text-muted)] space-y-1">
        <p><span className="font-bold">الكمية:</span> {formatNumber(produced)} / {formatNumber(target)}</p>
        <p><span className="font-bold">المتبقي:</span> {row.remainingDaysLabel}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={(e) => {
          e.stopPropagation();
          onRowClick(order);
        }}
      >
        تفاصيل الأمر
      </Button>
    </div>
  );
};
