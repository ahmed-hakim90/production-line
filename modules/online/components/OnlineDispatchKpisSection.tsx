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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type OnlineDispatchKpisSectionProps = {
  /** أصغر أرقامًا مناسبة للتضمين في لوحة تحكم أخرى */
  compact?: boolean;
  /** عند false: بطاقات المؤشرات فقط (بدون فلتر التاريخ وأزرار المسح) — مثلاً في لوحة الإدارة */
  showControls?: boolean;
  className?: string;
  /**
   * عند تمريرها: استخدام هذه البيانات بدل اشتراك `subscribeAllForTenant` (لوحة الأونلاين الرئيسية).
   * لا تُمرَّر في لوحة الإدارة — يبقى الاشتراك الداخلي.
   */
  tenantShipments?: Array<OnlineDispatchShipment & { id: string }>;
  /** فترة التاريخ الخاضعة للتحكم من الأب (اختياري) */
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (v: string) => void;
  onDateToChange?: (v: string) => void;
};

/**
 * مؤشرات الأونلاين: طابور، تسليمات ضمن فترة، تسجيلات جديدة، واختياريًا فلتر تاريخ وأزرار مسح.
 */
export const OnlineDispatchKpisSection: React.FC<OnlineDispatchKpisSectionProps> = ({
  compact = false,
  showControls = true,
  className,
  tenantShipments,
  dateFrom: dateFromProp,
  dateTo: dateToProp,
  onDateFromChange,
  onDateToChange,
}) => {
  const navigate = useTenantNavigate();
  const { can } = usePermission();

  const t = todayYmd();
  const [localFrom, setLocalFrom] = useState(t);
  const [localTo, setLocalTo] = useState(t);
  const [internalRows, setInternalRows] = useState<Array<OnlineDispatchShipment & { id: string }>>([]);
  const [queueCount, setQueueCount] = useState(0);

  const rangeFrom = dateFromProp ?? localFrom;
  const rangeTo = dateToProp ?? localTo;
  const setRangeFrom = onDateFromChange ?? setLocalFrom;
  const setRangeTo = onDateToChange ?? setLocalTo;

  const rows = tenantShipments ?? internalRows;

  useEffect(() => {
    const u1 = onlineDispatchService.subscribeWarehouseQueue((n) => setQueueCount(n));
    return () => u1();
  }, []);

  useEffect(() => {
    if (tenantShipments !== undefined) return;
    const u2 = onlineDispatchService.subscribeAllForTenant((r) => setInternalRows(r));
    return () => u2();
  }, [tenantShipments]);

  const { startMs, endMs } = useMemo(
    () => parseYmdRangeToLocalBounds(rangeFrom, rangeTo),
    [rangeFrom, rangeTo],
  );
  const summary = useMemo(
    () => summarizeOnlineDispatchByRange(rows, startMs, endMs),
    [rows, startMs, endMs],
  );

  const numClass = compact ? 'text-2xl font-bold' : 'text-3xl font-bold';

  const tileClass =
    'flex min-h-[5.75rem] flex-col rounded-lg border border-border bg-card p-3 sm:min-h-[6rem] sm:p-4 shadow-sm';

  return (
    <div className={cn('space-y-4', className)}>
      <Card className="shadow-sm">
        <CardContent className={cn(compact ? 'p-3' : 'p-4 sm:p-6')}>
          <div
            className={cn(
              'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5',
              compact ? 'gap-2' : 'gap-3 sm:gap-4',
            )}
          >
            <div className={tileClass}>
              <p className="text-xs text-muted-foreground">اوردر لم يتم تسليمه</p>
              <p className={cn(numClass, 'mt-1 text-primary')}>{queueCount}</p>
            </div>
            <div className={tileClass}>
              <p className="text-xs text-muted-foreground">تسليم للمخزن (ضمن الفترة)</p>
              <p className={cn(numClass, 'mt-1')}>{summary.toWarehouse}</p>
              {!compact && (
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                  نشط فقط — بلا إلغاء من التسليم
                </p>
              )}
            </div>
            <div className={cn(tileClass, 'border-rose-500/25 bg-rose-50/40 dark:bg-rose-950/20')}>
              <p className="text-xs text-muted-foreground">إلغاء من التسليم (ضمن الفترة)</p>
              <p className={cn(numClass, 'mt-1 text-rose-800 dark:text-rose-200')}>
                {summary.cancelledInPeriod}
              </p>
              {!compact && (
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                  بحسب وقت تسجيل الإلغاء
                </p>
              )}
            </div>
            <div className={tileClass}>
              <p className="text-xs text-muted-foreground">تسليم للبوسطة (ضمن الفترة)</p>
              <p className={cn(numClass, 'mt-1')}>{summary.toPost}</p>
            </div>
            <div className={tileClass}>
              <p className="text-xs text-muted-foreground">تسجيلات جديدة (ضمن الفترة)</p>
              <p className={cn(numClass, 'mt-1')}>
                {summary.createdInPeriod - summary.cancelledInPeriod}
              </p>
              {!compact && (
                <p className="mt-1 text-xs text-muted-foreground">
                  أول ظهور للباركود في النظام بحسب تاريخ الإنشاء
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {showControls && (
        <Card className="shadow-sm">
          <CardHeader className="border-b bg-muted/30 px-4 py-3 sm:px-6">
            <CardTitle className="text-base font-semibold">الفترة والمسح السريع</CardTitle>
            <CardDescription className="text-xs">
              اختر نطاق التواريخ لمؤشرات الفترة أعلاه، ثم انتقل لشاشة المسح.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4 p-4 sm:p-6">
            <div className="space-y-2">
              <Label htmlFor="online-kpi-from" className="text-xs text-muted-foreground">
                من تاريخ
              </Label>
              <Input
                id="online-kpi-from"
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="w-[180px] sm:w-[200px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="online-kpi-to" className="text-xs text-muted-foreground">
                إلى تاريخ
              </Label>
              <Input
                id="online-kpi-to"
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
              <Button type="button" variant="default" onClick={() => navigate('/online/scan/post')}>
                مسح — للبوسطة
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
