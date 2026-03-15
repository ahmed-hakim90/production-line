import type { WorkOrderStatus } from '../../../../types';

import styles from './WorkOrders.module.css';

interface WorkOrderStatusBadgeProps {
  status: WorkOrderStatus;
}

const STATUS_LABELS: Record<WorkOrderStatus, string> = {
  pending: 'قيد الانتظار',
  in_progress: 'قيد التنفيذ',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};

export function WorkOrderStatusBadge({ status }: WorkOrderStatusBadgeProps) {
  return (
    <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
