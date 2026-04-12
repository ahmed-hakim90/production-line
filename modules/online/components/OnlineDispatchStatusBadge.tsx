import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { OnlineDispatchStatus } from '../../../types';

/** عناوين كاملة (لوحة الأونلاين والجداول) */
export const ONLINE_DISPATCH_STATUS_LABEL: Record<OnlineDispatchStatus, string> = {
  pending: 'في انتظار المخزن',
  at_warehouse: 'تم التسليم للمخزن',
  handed_to_post: 'تم التسليم للبوسطة',
  cancelled: 'تم الإلغاء من التسليم',
};

/** عناوين مختصرة (شاشة المسح) */
export const ONLINE_DISPATCH_STATUS_LABEL_SHORT: Record<OnlineDispatchStatus, string> = {
  pending: 'في انتظار المخزن',
  at_warehouse: 'عند المخزن',
  handed_to_post: 'تم للبوسطة',
  cancelled: 'ملغاة من التسليم',
};

const statusClass: Record<OnlineDispatchStatus, string> = {
  pending: 'border-amber-500/40 bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100',
  at_warehouse: 'border-sky-500/40 bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-100',
  handed_to_post: 'border-emerald-500/40 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100',
  cancelled: 'border-rose-500/40 bg-rose-100 text-rose-900 dark:bg-rose-900/30 dark:text-rose-100',
};

export type OnlineDispatchStatusBadgeProps = {
  status: OnlineDispatchStatus;
  /** نص مختصر لقائمة المسح */
  shortLabel?: boolean;
  className?: string;
};

export const OnlineDispatchStatusBadge: React.FC<OnlineDispatchStatusBadgeProps> = ({
  status,
  shortLabel = false,
  className,
}) => {
  const label = shortLabel ? ONLINE_DISPATCH_STATUS_LABEL_SHORT[status] : ONLINE_DISPATCH_STATUS_LABEL[status];
  return (
    <Badge variant="outline" className={cn('font-medium', statusClass[status], className)}>
      {label}
    </Badge>
  );
};
