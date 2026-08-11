import { useMemo } from 'react';

import type { WorkOrder, WorkOrderStatus } from '../../../../types';
import { WORK_ORDER_STATUS_LABELS } from '../../utils/workOrderReportLinking';
import { WorkOrderDetail } from '../../../../src/components/erp/WorkOrderDetail';
import type { WorkOrderRowView } from './WorkOrderRow';

interface WorkOrderDrawerProps {
  order: WorkOrder | null;
  rowView: WorkOrderRowView | null;
  isOpen: boolean;
  productName: string;
  lineName: string;
  supervisorName: string;
  onClose: () => void;
  onEdit?: (order: WorkOrder) => void;
  onCloseOrder?: (order: WorkOrder) => void;
  onPrint: (order: WorkOrder) => void;
  onOpenScanner?: (order: WorkOrder) => void;
  canReopenCompleted?: boolean;
  onReopenCompleted?: (order: WorkOrder) => void;
  onViewReports?: (order: WorkOrder) => void;
  onReconcileReports?: (order: WorkOrder) => void;
  reconcilingReports?: boolean;
}

const STATUS_AR_MAP: Record<WorkOrderStatus, string> = WORK_ORDER_STATUS_LABELS;

const toDayDiff = (value: string | undefined): number => {
  if (!value) return 0;
  const target = new Date(value);
  const now = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
};

export function WorkOrderDrawer({
  order,
  rowView,
  isOpen,
  productName,
  lineName,
  supervisorName,
  onClose,
  onEdit,
  onCloseOrder,
  onPrint,
  onOpenScanner,
  canReopenCompleted,
  onReopenCompleted,
  onViewReports,
  onReconcileReports,
  reconcilingReports,
}: WorkOrderDrawerProps) {
  if (!order) return null;
  const effectiveStatus = rowView?.effectiveStatus ?? order.status;
  const storedStatus = rowView?.storedStatus ?? order.status;
  const scannerHidden = order.status === 'cancelled' || !order.id;
  const showReopenCompleted =
    Boolean(canReopenCompleted && onReopenCompleted && storedStatus === 'completed');

  const detailOrder = useMemo(() => {
    const targetQty = Number(order.quantity || 0);
    const producedFromRow = Number(rowView?.order?.producedQuantity || 0);
    const producedFromOrder = Number(order.producedQuantity || 0);
    const producedFromScans = Number(order.actualProducedFromScans || order.scanSummary?.completedUnits || 0);
    const producedQty = Math.max(producedFromRow, producedFromOrder, producedFromScans);
    const plannedUnitCost = targetQty > 0 ? Number(order.estimatedCost || 0) / targetQty : 0;
    const actualUnitCost = producedQty > 0 ? Number(order.actualCost || 0) / producedQty : 0;
    const expectedDate = rowView?.expectedEndLabel && rowView.expectedEndLabel !== '—'
      ? rowView.expectedEndLabel
      : String(order.targetDate || '');

    return {
      id: order.id || '',
      orderNumber: order.workOrderNumber,
      productName,
      productCode: String((order as any).productCode || (order as any).code || '—'),
      lineName,
      supervisorName,
      status: STATUS_AR_MAP[effectiveStatus],
      targetQty,
      producedQty,
      startDate: rowView?.startDateLabel || '—',
      endDate: String(order.targetDate || '—'),
      expectedDate: expectedDate || '—',
      daysRemaining: expectedDate ? toDayDiff(expectedDate) : 0,
      avgPerDay: Number(rowView?.dailyAverage || 0),
      estimatedDuration: Number(rowView?.estimatedDays || 0),
      reportsCount: Number(rowView?.reportCount || 0),
      maxWorkers: Number(order.maxWorkers || 0),
      plannedUnitCost,
      actualUnitCost,
      totalCost: Number(order.actualCost || 0),
      notes: String(order.notes || ''),
    };
  }, [effectiveStatus, lineName, order, productName, rowView, supervisorName]);

  return (
    <WorkOrderDetail
      order={detailOrder}
      open={isOpen}
      onClose={onClose}
      onEdit={onEdit ? () => onEdit(order) : undefined}
      onClose_order={onCloseOrder ? () => {
        if (effectiveStatus !== 'completed' && effectiveStatus !== 'cancelled') {
          onCloseOrder(order);
        }
      } : undefined}
      onPrint={() => onPrint(order)}
      onOpenScanner={onOpenScanner && !scannerHidden ? () => onOpenScanner(order) : undefined}
      showReopenCompleted={showReopenCompleted}
      onReopenCompleted={showReopenCompleted ? () => onReopenCompleted!(order) : undefined}
      storedCompleted={storedStatus === 'completed'}
      onViewReports={onViewReports && order.id ? () => onViewReports(order) : undefined}
      onReconcileReports={onReconcileReports && order.id ? () => onReconcileReports(order) : undefined}
      reconcilingReports={reconcilingReports}
    />
  );
}
