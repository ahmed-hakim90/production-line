import type { WorkOrderStatus } from '../../../../types';
import { WORK_ORDER_STATUS_LABELS } from '../../utils/workOrderReportLinking';

export const WORK_ORDER_STATUS_STYLE: Record<WorkOrderStatus, { color: string; bar: string }> = {
  in_progress: { color: 'text-[rgb(var(--color-warning))]', bar: 'bg-[rgb(var(--color-warning))]' },
  pending: { color: 'text-[rgb(var(--color-primary))]', bar: 'bg-[rgb(var(--color-primary))]' },
  paused: { color: 'text-[var(--color-text-muted)]', bar: 'bg-[var(--color-text-muted)]' },
  completed: { color: 'text-[rgb(var(--color-success))]', bar: 'bg-[rgb(var(--color-success))]' },
  cancelled: { color: 'text-[rgb(var(--color-danger))]', bar: 'bg-[rgb(var(--color-danger))]' },
};

interface WorkOrderStatusBadgeProps {
  status: WorkOrderStatus;
  detail?: string;
  align?: 'center' | 'start';
}

export function WorkOrderStatusBadge({ status, detail, align = 'center' }: WorkOrderStatusBadgeProps) {
  const style = WORK_ORDER_STATUS_STYLE[status];
  return (
    <span className={`inline-flex flex-col gap-0.5 ${align === 'start' ? 'items-start' : 'items-center'}`}>
      <span className={`text-xs font-bold ${style.color}`}>
        {WORK_ORDER_STATUS_LABELS[status]}
      </span>
      {detail ? <span className="text-[10px] font-semibold text-[var(--color-text-muted)]">{detail}</span> : null}
    </span>
  );
}
