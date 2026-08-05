import React, { useMemo } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { resolveRepairSettings } from '../config/repairSettings';
import { resolveRepairStatusChip } from '../lib/repairStatusChipStyle';
import type { RepairJobStatus } from '../types';
import { isDeliveredStatus } from '../utils/repairWorkflowNormalize';

export const StatusBadge: React.FC<{
  status: RepairJobStatus;
  className?: string;
  /** Larger chip for page headers. */
  size?: 'sm' | 'md';
}> = ({ status, className, size = 'sm' }) => {
  const systemSettings = useAppStore((s) => s.systemSettings);
  const repairSettings = useMemo(() => resolveRepairSettings(systemSettings), [systemSettings]);
  const chip = useMemo(
    () => resolveRepairStatusChip(status, repairSettings.statusMap),
    [status, repairSettings.statusMap],
  );
  const delivered = isDeliveredStatus(status);

  return (
    <Badge
      variant="outline"
      className={cn(
        'inline-flex items-center gap-1 border font-medium hover:bg-[inherit]',
        size === 'md' ? 'rounded-lg px-3 py-1.5 text-sm' : 'rounded-lg px-2.5 py-1 text-xs',
        className,
      )}
      style={chip.style}
    >
      {delivered ? (
        <CheckCircle2
          className={size === 'md' ? 'h-3.5 w-3.5 shrink-0' : 'h-3 w-3 shrink-0'}
          aria-hidden
        />
      ) : null}
      {chip.label}
    </Badge>
  );
};
