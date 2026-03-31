import React from 'react';
import { Badge } from '@/components/ui/badge';
import { REPAIR_JOB_STATUS_LABELS, type RepairJobStatus } from '../types';

const classMap: Record<RepairJobStatus, string> = {
  received: 'bg-slate-100 text-slate-800',
  inspection: 'bg-amber-100 text-amber-800',
  repair: 'bg-sky-100 text-sky-800',
  ready: 'bg-emerald-100 text-emerald-800',
  delivered: 'bg-green-100 text-green-800',
  unrepairable: 'bg-rose-100 text-rose-800',
};

export const StatusBadge: React.FC<{ status: RepairJobStatus }> = ({ status }) => {
  return <Badge className={classMap[status]}>{REPAIR_JOB_STATUS_LABELS[status]}</Badge>;
};
