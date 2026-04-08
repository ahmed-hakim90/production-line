import React, { useEffect, useMemo, useState } from 'react';
import { useTenantNavigate } from '@/lib/useTenantNavigate';
import { usePermission } from '../../../utils/permissions';
import {
  onlineDispatchService,
  summarizeOnlineDispatchByRange,
} from '../services/onlineDispatchService';
import type { OnlineDispatchShipment } from '../../../types';
import { parseYmdRangeToLocalBounds, todayYmd } from '../utils/dateRange';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type OnlineDispatchKpisSectionProps = {
  /** أصغر أرقامًا مناسبة للتضمين في لوحة تحكم أخرى */
  compact?: boolean;
  /** عند false: بطاقات المؤشرات فقط (بدون فلتر التاريخ وأزرار المسح) — مثلاً في لوحة الإدارة */
  showControls?: boolean;
  className?: string;
};

/**
 * مؤشرات الأونلاين: طابور، تسليمات ضمن فترة، تسجيلات جديدة، واختياريًا فلتر تاريخ وأزرار مسح.
 */
export const OnlineDispatchKpisSection: React.FC<OnlineDispatchKpisSectionProps> = ({
  compact = false,
  showControls = true,
  className,
}) => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();

  const t = todayYmd();
  const [rangeFrom, setRangeFrom] = useState(t);
  const [rangeTo, setRangeTo] = useState(t);
  const [rows, setRows] = useState<Array<OnlineDispatchShipment & { id: string }>>([]);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    const u1 = onlineDispatchService.subscribeWarehouseQueue((n) => setQueueCount(n));
    const u2 = onlineDispatchService.subscribeAllForTenant((r) => setRows(r));
    return () => {
      u1();
      u2();
    };
  }, []);

  const { startMs, endMs } = useMemo(
    () => parseYmdRangeToLocalBounds(rangeFrom, rangeTo),
    [rangeFrom, rangeTo],
  );
  const summary = useMemo(
    () => summarizeOnlineDispatchByRange(rows, startMs, endMs),
    [rows, startMs, endMs],
  );

  const numClass = compact ? 'text-2xl font-bold' : 'text-3xl font-bold';

  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 sm:p-4">
          <p className="text-xs text-[var(--color-text-muted)]">طابور المخزن (حالي)</p>
          <p className={cn(numClass, 'text-primary mt-1')}>{queueCount}</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 sm:p-4">
          <p className="text-xs text-[var(--color-text-muted)]">تسليم للمخزن (ضمن الفترة)</p>
          <p className={cn(numClass, 'mt-1')}>{summary.toWarehouse}</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 sm:p-4">
          <p className="text-xs text-[var(--color-text-muted)]">تسليم للبوسطة (ضمن الفترة)</p>
          <p className={cn(numClass, 'mt-1')}>{summary.toPost}</p>
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 sm:p-4">
          <p className="text-xs text-[var(--color-text-muted)]">تسجيلات جديدة (ضمن الفترة)</p>
          <p className={cn(numClass, 'mt-1')}>{summary.createdInPeriod}</p>
          {!compact && (
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
              أول ظهور للباركود في النظام بحسب تاريخ الإنشاء
            </p>
          )}
        </div>
      </div>

      {showControls && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-muted)]">من تاريخ</label>
            <Input
              type="date"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="w-[180px] sm:w-[200px]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[var(--color-text-muted)]">إلى تاريخ</label>
            <Input
              type="date"
              value={rangeTo}
              onChange={(e) => setRangeTo(e.target.value)}
              className="w-[180px] sm:w-[200px]"
            />
          </div>
          {(can('onlineDispatch.handoffToWarehouse') || can('onlineDispatch.manage')) && (
            <Button type="button" variant="default" onClick={() => navigate('/online/scan/warehouse')}>
              مسح — للمخزن
            </Button>
          )}
          {(can('onlineDispatch.handoffToPost') || can('onlineDispatch.manage')) && (
            <Button type="button" variant="secondary" onClick={() => navigate('/online/scan/post')}>
              مسح — للبوسطة
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
