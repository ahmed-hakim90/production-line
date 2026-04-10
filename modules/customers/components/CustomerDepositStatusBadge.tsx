import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CustomerDepositEntryStatus } from '../types';

export const CUSTOMER_DEPOSIT_STATUS_LABEL: Record<CustomerDepositEntryStatus, string> = {
  pending: 'معلق',
  confirmed: 'موكّد',
};

const statusClass: Record<CustomerDepositEntryStatus, string> = {
  pending: 'border-amber-500/40 bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100',
  confirmed: 'border-emerald-500/40 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100',
};

export type CustomerDepositStatusBadgeProps = {
  status: CustomerDepositEntryStatus;
  className?: string;
};

export const CustomerDepositStatusBadge: React.FC<CustomerDepositStatusBadgeProps> = ({
  status,
  className,
}) => (
  <Badge variant="outline" className={cn('font-medium', statusClass[status], className)}>
    {CUSTOMER_DEPOSIT_STATUS_LABEL[status]}
  </Badge>
);
