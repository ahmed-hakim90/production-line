import React from 'react';
import type { RepairJobStatus } from '../types';
import { REPAIR_STATUS_LABELS, REPAIR_STATUS_COLORS } from '../types';

interface StatusBadgeProps {
  status: RepairJobStatus;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const label = REPAIR_STATUS_LABELS[status] ?? status;
  const color = REPAIR_STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700';

  const sizeClass = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  }[size];

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${color} ${sizeClass}`}>
      {label}
    </span>
  );
};
